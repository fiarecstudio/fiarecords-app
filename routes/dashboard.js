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

router.get('/stats', async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const empresaId = req.user.empresaId;
        const asesorId = req.user._id || req.user.id;

        // Verificar si la empresa tiene el módulo de seguros activado
        const empresa = await Empresa.findById(empresaId);
        const esModuloSeguros = empresa && empresa.moduloSeguros;

        // 1. DATOS OPERATIVOS (Para todos los usuarios)
        // FASE 4: Usar buildQueryFilter para respetar filtro de empresa (Super Admin con header o usuario normal)
        const filtroBase = buildQueryFilter(req, {});

        // Proyectos Activos (No cotizaciones, no completados, no cancelados)
        const proyectosActivos = await Proyecto.countDocuments({
            ...filtroBase,
            isDeleted: false,
            proceso: { $nin: ['Cotizacion', 'Completo'] },
            estatus: { $ne: 'Cancelado' }
        });

        // Proyectos Por Cobrar (Cálculo manual para precisión)
        const todosProyectos = await Proyecto.find({
            ...filtroBase,
            isDeleted: false,
            estatus: { $nin: ['Cotizacion', 'Cancelado'] }
        });

        let proyectosPorCobrar = 0;
        todosProyectos.forEach(p => {
            // Si el total es mayor a lo pagado (con margen de error de $1 peso)
            if ((p.total - (p.montoPagado || 0)) > 1) {
                proyectosPorCobrar++;
            }
        });

        // Filtro base para seguros con RBAC
        const filtroSeguros = { empresaId, deletedAt: null };
        if (!isAdmin) {
            filtroSeguros.asesorId = asesorId;
        }

        // SI NO ES ADMIN: Retornamos solo lo operativo y una bandera para ocultar lo financiero
        if (!isAdmin) {
            // Si es módulo de seguros, agregar métricas de seguros
            if (esModuloSeguros) {
                const totalClientes = await Cliente.countDocuments(filtroSeguros);
                const polizasActivas = await Poliza.countDocuments({ ...filtroSeguros, estado: 'Activa' });
                const polizasActivasData = await Poliza.find({ ...filtroSeguros, estado: 'Activa' });
                const primasTotales = polizasActivasData.reduce((sum, p) => sum + (p.primaTotal || 0), 0);

                const hoy = new Date();
                const en30Dias = new Date();
                en30Dias.setDate(hoy.getDate() + 30);
                const proximosVencimientos = await Poliza.countDocuments({
                    ...filtroSeguros,
                    estado: 'Activa',
                    'fechas.vencimiento': { $gte: hoy, $lte: en30Dias }
                });

                // Próximos pagos a vencer
                const proximosPagos = await Poliza.find({
                    ...filtroSeguros,
                    estado: 'Activa',
                    proximoPago: { $exists: true, $ne: null }
                })
                .populate('clienteId', 'nombre')
                .sort({ proximoPago: 1 })
                .limit(15);

                // Gráfica de tipos de seguro
                const graficaTipos = await Poliza.aggregate([
                    { $match: { empresaId: new mongoose.Types.ObjectId(empresaId), estado: 'Activa', deletedAt: null, ...(isAdmin ? {} : { asesorId }) } },
                    { $group: { _id: '$tipoSeguro', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]);

                // Gráfica de vencimientos próximos 6 meses
                const hoyInicio = new Date();
                hoyInicio.setHours(0, 0, 0, 0);
                const en6Meses = new Date();
                en6Meses.setMonth(en6Meses.getMonth() + 6);
                en6Meses.setHours(23, 59, 59, 999);

                const graficaVencimientos = await Poliza.aggregate([
                    {
                        $match: {
                            empresaId: new mongoose.Types.ObjectId(empresaId),
                            estado: 'Activa',
                            deletedAt: null,
                            'fechas.vencimiento': { $gte: hoyInicio, $lte: en6Meses },
                            ...(isAdmin ? {} : { asesorId })
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
                ]);

                return res.json({
                    showFinancials: false,
                    esModuloSeguros: true,
                    proyectosActivos,
                    proyectosPorCobrar,
                    totalClientes,
                    polizasActivas,
                    primasTotales,
                    proximosVencimientos,
                    proximosPagos,
                    graficaTipos,
                    graficaVencimientos
                });
            }

            return res.json({
                showFinancials: false,
                esModuloSeguros: false,
                proyectosActivos,
                proyectosPorCobrar
            });
        }

        // --- DATOS FINANCIEROS (SOLO ADMIN) ---
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

        // Si es módulo de seguros, agregar métricas de seguros también para admin
        let response = {
            showFinancials: true,
            esModuloSeguros: false,
            ingresosMes,
            proyectosActivos,
            proyectosPorCobrar,
            monthlyIncome
        };

        if (esModuloSeguros) {
            const totalClientes = await Cliente.countDocuments(filtroSeguros);
            const polizasActivas = await Poliza.countDocuments({ ...filtroSeguros, estado: 'Activa' });
            const polizasActivasData = await Poliza.find({ ...filtroSeguros, estado: 'Activa' });
            const primasTotales = polizasActivasData.reduce((sum, p) => sum + (p.primaTotal || 0), 0);

            const hoy = new Date();
            const en30Dias = new Date();
            en30Dias.setDate(hoy.getDate() + 30);
            const proximosVencimientos = await Poliza.countDocuments({
                ...filtroSeguros,
                estado: 'Activa',
                'fechas.vencimiento': { $gte: hoy, $lte: en30Dias }
            });

            // Próximos pagos a vencer
            const proximosPagos = await Poliza.find({
                ...filtroSeguros,
                estado: 'Activa',
                proximoPago: { $exists: true, $ne: null }
            })
            .populate('clienteId', 'nombre')
            .sort({ proximoPago: 1 })
            .limit(15);

            // Gráfica de tipos de seguro
            const graficaTipos = await Poliza.aggregate([
                { $match: { empresaId: new mongoose.Types.ObjectId(empresaId), estado: 'Activa', deletedAt: null } },
                { $group: { _id: '$tipoSeguro', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            // Gráfica de vencimientos próximos 6 meses
            const hoyInicio = new Date();
            hoyInicio.setHours(0, 0, 0, 0);
            const en6Meses = new Date();
            en6Meses.setMonth(en6Meses.getMonth() + 6);
            en6Meses.setHours(23, 59, 59, 999);

            const graficaVencimientos = await Poliza.aggregate([
                {
                    $match: {
                        empresaId: new mongoose.Types.ObjectId(empresaId),
                        estado: 'Activa',
                        deletedAt: null,
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
            ]);

            response.esModuloSeguros = true;
            response.totalClientes = totalClientes;
            response.polizasActivas = polizasActivas;
            response.primasTotales = primasTotales;
            response.proximosVencimientos = proximosVencimientos;
            response.proximosPagos = proximosPagos;
            response.graficaTipos = graficaTipos;
            response.graficaVencimientos = graficaVencimientos;
        }

        res.json(response);

    } catch (error) {
        console.error("Error Dashboard:", error);
        res.status(500).json({ error: 'Error al calcular estadísticas' });
    }
});

module.exports = router;