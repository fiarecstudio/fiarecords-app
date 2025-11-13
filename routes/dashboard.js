// Contenido COMPLETO y MEJORADO para: routes/dashboard.js
const express = require('express');
const router = express.Router();
const Proyecto = require('../models/Proyecto');
const auth = require('../middleware/auth');

router.use(auth);

// GET /api/dashboard/stats - Obtiene las nuevas estadísticas del negocio
router.get('/stats', async (req, res) => {
    try {
        const ahora = new Date();
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
        finMes.setHours(23, 59, 59, 999);

        // --- 1. INGRESOS DEL MES (Lógica Precisa) ---
        // Suma todos los pagos individuales cuya fecha está en el mes actual.
        const ingresosAgregados = await Proyecto.aggregate([
            { $match: { isDeleted: false, 'pagos.0': { $exists: true } } }, // Proyectos con al menos un pago
            { $unwind: '$pagos' }, // Separa cada pago en un documento
            { $match: { 'pagos.fecha': { $gte: inicioMes, $lte: finMes } } }, // Filtra los pagos de este mes
            { $group: { _id: null, total: { $sum: '$pagos.monto' } } } // Suma los montos
        ]);

        const ingresosMes = ingresosAgregados.length > 0 ? ingresosAgregados[0].total : 0;

        // --- 2. PROYECTOS ACTIVOS ---
        // Cuenta proyectos en el flujo de trabajo (no cotizaciones, no completados).
        const proyectosActivos = await Proyecto.countDocuments({
            isDeleted: false,
            proceso: { $nin: ['Cotizacion', 'Completo'] }
        });

        // --- 3. PROYECTOS POR COBRAR ---
        // Cuenta proyectos con saldo pendiente.
        const proyectosPorCobrar = await Proyecto.countDocuments({
            isDeleted: false,
            estatus: { $in: ['Pendiente de Pago', 'Pagado Parcialmente'] }
        });

        res.json({
            ingresosMes,
            proyectosActivos,
            proyectosPorCobrar
        });

    } catch (error) {
        console.error("Error en /api/dashboard/stats:", error);
        res.status(500).json({ error: 'Error al calcular estadísticas' });
    }
});

module.exports = router;