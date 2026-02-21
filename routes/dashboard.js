// ==========================================
// ARCHIVO: routes/dashboard.js (CORREGIDO GRÁFICA ANUAL)
// ==========================================
const express = require('express');
const router = express.Router();
const Proyecto = require('../models/Proyecto');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/stats', async (req, res) => {
    try {
        const ahora = new Date();
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59);
        
        // Inicio y fin del AÑO ACTUAL para la gráfica
        const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
        const finAnio = new Date(ahora.getFullYear(), 11, 31, 23, 59, 59);

        // --- 1. INGRESOS DEL MES ACTUAL ---
        const ingresosMesData = await Proyecto.aggregate([
            { $match: { isDeleted: false, 'pagos.0': { $exists: true } } },
            { $unwind: '$pagos' },
            { $match: { 'pagos.fecha': { $gte: inicioMes, $lte: finMes } } },
            { $group: { _id: null, total: { $sum: '$pagos.monto' } } }
        ]);
        const ingresosMes = ingresosMesData.length > 0 ? ingresosMesData[0].total : 0;

        // --- 2. PROYECTOS ACTIVOS ---
        const proyectosActivos = await Proyecto.countDocuments({
            isDeleted: false,
            proceso: { $nin: ['Cotizacion', 'Completo'] },
            estatus: { $ne: 'Cancelado' }
        });

        // --- 3. PROYECTOS POR COBRAR ---
        // (Total del proyecto - Lo que han pagado > 0)
        // Nota: Hacemos esto en JS porque calcular campos calculados en Mongo simple es complejo
        const todosProyectos = await Proyecto.find({ 
            isDeleted: false, 
            estatus: { $nin: ['Cotizacion', 'Cancelado'] } 
        });
        
        let proyectosPorCobrar = 0;
        todosProyectos.forEach(p => {
            const descuento = p.descuento || 0;
            const totalReal = p.total; 
            // A veces el total ya incluye el descuento dependiendo de cómo lo guardes, 
            // pero asumiremos la lógica de tu frontend: (total - pagado > 0)
            if ((totalReal - (p.montoPagado || 0)) > 1) { // > 1 para evitar decimales residuales
                proyectosPorCobrar++;
            }
        });

        // --- 4. DATOS PARA LA GRÁFICA (TENDENCIA ANUAL) ---
        const ingresosAnuales = await Proyecto.aggregate([
            { $match: { isDeleted: false, 'pagos.0': { $exists: true } } },
            { $unwind: '$pagos' },
            { $match: { 'pagos.fecha': { $gte: inicioAnio, $lte: finAnio } } },
            { 
                $group: { 
                    _id: { $month: "$pagos.fecha" }, // Devuelve 1 para Enero, 2 para Feb...
                    total: { $sum: '$pagos.monto' } 
                } 
            }
        ]);

        // Inicializar arreglo de 12 ceros
        let monthlyIncome = Array(12).fill(0);

        // Llenar el arreglo con lo que encontró la base de datos
        // Mongo devuelve _id: 1 para Enero, pero el array empieza en índice 0
        ingresosAnuales.forEach(item => {
            if (item._id >= 1 && item._id <= 12) {
                monthlyIncome[item._id - 1] = item.total;
            }
        });

        res.json({
            ingresosMes,
            proyectosActivos,
            proyectosPorCobrar,
            monthlyIncome // <--- ESTO ES LO QUE FALTABA
        });

    } catch (error) {
        console.error("Error en /api/dashboard/stats:", error);
        res.status(500).json({ error: 'Error al calcular estadísticas' });
    }
});

module.exports = router;