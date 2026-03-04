const express = require('express');
const router = express.Router();
const Deuda = require('../models/Deuda');
const auth = require('../middleware/auth');

// ==========================================
// MIDDLEWARE DE SEGURIDAD ESTRICTO PARA ADMIN
// ==========================================
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden ver esta sección.' });
    }
};

// Aplicar protección a todas las rutas de este archivo
router.use(auth);
router.use(isAdmin);

// ==========================================
// OBTENER TODAS LAS DEUDAS ACTIVAS
// ==========================================
router.get('/', async (req, res) => {
    try {
        const deudas = await Deuda.find({ isDeleted: false }).sort({ createdAt: -1 });
        res.json(deudas);
    } catch (e) { 
        res.status(500).json({ error: 'Error al cargar las deudas' }); 
    }
});

// ==========================================
// CREAR NUEVA DEUDA
// ==========================================
router.post('/', async (req, res) => {
    try {
        const { concepto, total } = req.body;
        
        if (!concepto || !total || total <= 0) {
            return res.status(400).json({ error: 'Concepto y total válido son requeridos' });
        }

        const nuevaDeuda = new Deuda({
            concepto: concepto,
            total: parseFloat(total)
        });
        
        await nuevaDeuda.save();
        res.status(201).json(nuevaDeuda);
    } catch (e) { 
        res.status(500).json({ error: 'Error al crear la deuda' }); 
    }
});

// ==========================================
// REGISTRAR UN ABONO / PAGO A UNA DEUDA
// ==========================================
router.post('/:id/pagos', async (req, res) => {
    try {
        const deuda = await Deuda.findById(req.params.id);
        if (!deuda) return res.status(404).json({ error: 'Deuda no encontrada' });

        const montoAbono = parseFloat(req.body.monto);
        if (isNaN(montoAbono) || montoAbono <= 0) {
            return res.status(400).json({ error: 'Monto de abono inválido' });
        }

        // 1. Agregar el pago al historial de la deuda
        deuda.pagos.push({ 
            monto: montoAbono, 
            nota: req.body.nota || '' 
        });
        
        // 2. Sumar al acumulado pagado
        deuda.montoPagado += montoAbono;

        // 3. Verificar si ya se liquidó (con un margen de 50 centavos por posibles decimales)
        if (deuda.montoPagado >= (deuda.total - 0.5)) {
            deuda.estatus = 'Liquidada';
            deuda.montoPagado = deuda.total; // Cuadrar exacto para evitar $1000.000001
        }

        await deuda.save();
        res.json(deuda);
    } catch (e) { 
        res.status(500).json({ error: 'Error al registrar el abono' }); 
    }
});

// ==========================================
// ELIMINAR (OCULTAR) DEUDA
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        await Deuda.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (e) { 
        res.status(500).json({ error: 'Error al eliminar la deuda' }); 
    }
});

module.exports = router;