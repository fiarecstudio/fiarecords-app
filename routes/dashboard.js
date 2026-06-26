const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Proyecto = require('../models/Proyecto');
const Cliente = require('../models/Cliente');
const Poliza = require('../models/Poliza');
const Empresa = require('../models/Empresa');
const auth = require('../middleware/auth');
const { applyTenantFilter, buildQueryFilter } = require('../middleware/tenantFilter');

router.use(auth);
router.use(applyTenantFilter);

async function obtenerMetricasSeguros(empresaId, filtroSeguros, isAdmin, asesorId) {
    const empresaObjectId = new mongoose.Types.ObjectId(empresaId);
    const matchPolizas = {
        empresaId: empresaObjectId,
        estado: 'Activa',
        deletedAt: null,
        ...(!isAdmin ? { asesorId } : {})
    };

    const hoy = new Date();
    const en30Dias = new Date();
    en30Dias.setDate(hoy.getDate() + 30);

    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const en6Meses = new Date();
    en6Meses.setMonth(en6Meses.getMonth() + 6);
    en6Meses.setHours(23, 59, 59, 999);

    const [
        totalClientes,
        polizasActivas,
        primasResult,
        proximosVencimientos,
        proximosPagos,
        graficaTipos,
        graficaVencimientos
    ] = await Promise.all([
        Cliente.countDocuments(filtroSeguros),
        Poliza.countDocuments({ ...filtroSeguros, estado: 'Activa' }),
        Poliza.aggregate([
            { $match: { ...filtroSeguros, estado: 'Activa' } },
            { $group: { _id: null, total: { $sum: '$primaTotal' } } }
        ]),
        Poliza.countDocuments({
            ...filtroSeguros,
            estado: 'Activa',
            'fechas.vencimiento': { $gte: hoy, $lte: en30Dias }
        }),
        Poliza.find({
            ...filtroSeguros,
            estado: 'Activa',
            proximoPago: { $exists: true, $ne: null }
        })
            .populate('clienteId', 'nombre')
            .sort({ proximoPago: 1 })
            .limit(15),
        Poliza.aggregate([
            { $match: matchPolizas },
            { $group: { _id: '$tipoSeguro', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]),
        Poliza.aggregate([
            {
                $match: {
                    ...matchPolizas,
                    'fechas.vencimiento': { $gte: hoyInicio, $lte: en6Meses }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$fechas.vencimiento' },
                        month: { $month: '$fechas.vencimiento' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ])
    ]);

    return {
        totalClientes,
        polizasActivas,
        primasTotales: primasResult[0]?.total || 0,
        proximosVencimientos,
        proximosPagos,
        graficaTipos,
        graficaVencimientos
    };
}

router.get('/stats', async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const empresaId = req.user.empresaId;
        const asesorId = req.user._id || req.user.id;

        const empresa = await Empresa.findById(empresaId).select('moduloSeguros').lean();
        const esModuloSeguros = empresa && empresa.moduloSeguros;

        const filtroBase = buildQueryFilter(req, {});
        const filtroSeguros = { empresaId, deletedAt: null };
        if (!isAdmin) {
            filtroSeguros.asesorId = asesorId;
        }

        let proyectosActivos = 0;
        let proyectosPorCobrar = 0;

        if (!esModuloSeguros) {
            proyectosActivos = await Proyecto.countDocuments({
                ...filtroBase,
                isDeleted: false,
                proceso: { $nin: ['Cotizacion', 'Completo'] },
                estatus: { $ne: 'Cancelado' }
            });

            const todosProyectos = await Proyecto.find({
                ...filtroBase,
                isDeleted: false,
                estatus: { $nin: ['Cotizacion', 'Cancelado'] }
            }).select('total montoPagado').lean();

            todosProyectos.forEach(p => {
                if ((p.total - (p.montoPagado || 0)) > 1) {
                    proyectosPorCobrar++;
                }
            });
        }

        if (!isAdmin) {
            if (esModuloSeguros) {
                const metricasSeguros = await obtenerMetricasSeguros(empresaId, filtroSeguros, isAdmin, asesorId);

                return res.json({
                    showFinancials: false,
                    esModuloSeguros: true,
                    proyectosActivos,
                    proyectosPorCobrar,
                    ...metricasSeguros
                });
            }

            return res.json({
                showFinancials: false,
                esModuloSeguros: false,
                proyectosActivos,
                proyectosPorCobrar
            });
        }

        if (esModuloSeguros) {
            const metricasSeguros = await obtenerMetricasSeguros(empresaId, filtroSeguros, isAdmin, asesorId);

            return res.json({
                showFinancials: false,
                esModuloSeguros: true,
                ingresosMes: 0,
                proyectosActivos,
                proyectosPorCobrar,
                monthlyIncome: Array(12).fill(0),
                ...metricasSeguros
            });
        }

        // --- DATOS FINANCIEROS (SOLO ADMIN, empresas estándar) ---
        const ahora = new Date();
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59);
        const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
        const finAnio = new Date(ahora.getFullYear(), 11, 31, 23, 59, 59);

        // Ingresos Mes Actual
        // FASE 4: Construir filtro base y asegurar conversión explícita de empresaId a ObjectId
        let baseMatch = buildQueryFilter(req, { isDeleted: false, 'pagos.0': { $exists: true } });

        // Asegurar que empresaId sea ObjectId válido para aggregations
        if (baseMatch.empresaId && typeof baseMatch.empresaId === 'string') {
            try {
                baseMatch.empresaId = new mongoose.Types.ObjectId(baseMatch.empresaId);
            } catch (e) {
                console.warn('[Dashboard] Error convirtiendo empresaId:', e.message);
            }
        }

        const ingresosMesData = await Proyecto.aggregate([
            { $match: baseMatch },
            { $unwind: '$pagos' },
            { $match: { 'pagos.fecha': { $gte: inicioMes, $lte: finMes } } },
            { $group: { _id: null, total: { $sum: '$pagos.monto' } } }
        ]);
        const ingresosMes = ingresosMesData.length > 0 ? ingresosMesData[0].total : 0;

        // Tendencia Anual (Gráfica)
        const ingresosAnuales = await Proyecto.aggregate([
            { $match: baseMatch },
            { $unwind: '$pagos' },
            { $match: { 'pagos.fecha': { $gte: inicioAnio, $lte: finAnio } } },
            {
                $group: {
                    _id: { $month: "$pagos.fecha" },
                    total: { $sum: '$pagos.monto' }
                }
            }
        ]);

        // Mapear resultado de Mongo (1..12) a Arreglo (0..11)
        let monthlyIncome = Array(12).fill(0);
        ingresosAnuales.forEach(item => {
            if (item._id >= 1 && item._id <= 12) {
                monthlyIncome[item._id - 1] = item.total;
            }
        });

        let response = {
            showFinancials: true,
            esModuloSeguros: false,
            ingresosMes,
            proyectosActivos,
            proyectosPorCobrar,
            monthlyIncome
        };

        res.json(response);

    } catch (error) {
        console.error("Error Dashboard:", error);
        res.status(500).json({ error: 'Error al calcular estadísticas' });
    }
});

module.exports = router;