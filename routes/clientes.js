const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { applyTenantFilter } = require('../middleware/tenantFilter');
const { crearCliente, obtenerClientes, obtenerClientePorId, migrarClientesHistoricos, actualizarCliente, eliminarCliente, obtenerClientesPapelera, restaurarClientePapelera, destruirClientePapelera } = require('../controllers/clienteController');

// Crear un nuevo cliente
router.post('/', auth, applyTenantFilter, crearCliente);

// Obtener todos los clientes con sus pólizas asociadas
router.get('/', auth, applyTenantFilter, obtenerClientes);

// Migración temporal: Vincular pólizas históricas con clientes
router.get('/migrar-historico', auth, applyTenantFilter, migrarClientesHistoricos);

// --- PAPELERA DE RECICLAJE (rutas fijas antes de /:id) ---
router.get('/papelera', auth, applyTenantFilter, obtenerClientesPapelera);
router.put('/papelera/:id/restaurar', auth, applyTenantFilter, restaurarClientePapelera);
router.delete('/papelera/:id/destruir', auth, applyTenantFilter, destruirClientePapelera);

// Obtener un cliente por ID
router.get('/:id', auth, applyTenantFilter, obtenerClientePorId);

// Actualizar un cliente
router.put('/:id', auth, applyTenantFilter, actualizarCliente);

// Eliminar un cliente (soft delete)
router.delete('/:id', auth, applyTenantFilter, eliminarCliente);

module.exports = router;
