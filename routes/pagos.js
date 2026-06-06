const express = require('express');
const router = express.Router();
const pagoController = require('../controllers/pagoController');
const { auth, applyTenantFilter } = require('../middleware/auth');

// ==========================================
// RUTAS DE PAGOS (Colección Independiente)
// ==========================================

// Obtener todos los pagos (con filtro de empresa)
router.get('/', auth, applyTenantFilter, pagoController.obtenerPagos);

// Obtener un pago por ID
router.get('/:id', auth, applyTenantFilter, pagoController.obtenerPagoPorId);

// Crear un nuevo pago
router.post('/', auth, applyTenantFilter, pagoController.crearPago);

// Actualizar un pago
router.put('/:id', auth, applyTenantFilter, pagoController.actualizarPago);

// Eliminar un pago (soft delete)
router.delete('/:id', auth, applyTenantFilter, pagoController.eliminarPago);

// Obtener pagos de una póliza específica
router.get('/poliza/:polizaId', auth, applyTenantFilter, pagoController.obtenerPagosPorPoliza);

module.exports = router;
