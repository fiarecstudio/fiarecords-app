const express = require('express');
const router = express.Router();
const Proyecto = require('../models/Proyecto');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/stats', async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin'; 

        // 1. DATOS OPERATIVOS (Para todos los usuarios)
        // Proyectos Activos (No cotizaciones, no completados, no cancelados)
        const proyectosActivos = await Proyecto.countDocuments({
            isDeleted: false,
            proceso: { $nin: ['Cotizacion', 'Completo'] },
            estatus: { $ne: 'Cancelado' }
        });

        // Proyectos Por Cobrar (Cálculo manual para precisión)
        const todosProyectos = await Proyecto.find({ 
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

        // SI NO ES ADMIN: Retornamos solo lo operativo y una bandera para ocultar lo financiero
        if (!isAdmin) {
            return res.json({
                showFinancials: false, // Bandera para el Frontend
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
        const ingresosMesData = await Proyecto.aggregate([
            { $match: { isDeleted: false, 'pagos.0': { $exists: true } } },
            { $unwind: '$pagos' },
            { $match: { 'pagos.fecha': { $gte: inicioMes, $lte: finMes } } },
            { $group: { _id: null, total: { $sum: '$pagos.monto' } } }
        ]);
        const ingresosMes = ingresosMesData.length > 0 ? ingresosMesData[0].total : 0;

        // Tendencia Anual (Gráfica)
        const ingresosAnuales = await Proyecto.aggregate([
            { $match: { isDeleted: false, 'pagos.0': { $exists: true } } },
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

        res.json({
            showFinancials: true,
            ingresosMes,
            proyectosActivos,
            proyectosPorCobrar,
            monthlyIncome
        });

    } catch (error) {
        console.error("Error Dashboard:", error);
        res.status(500).json({ error: 'Error al calcular estadísticas' });
    }
});

module.exports = router;