const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { crearCliente, obtenerClientes, obtenerClientePorId, migrarClientesHistoricos, actualizarCliente, eliminarCliente, obtenerClientesPapelera, restaurarClientePapelera, destruirClientePapelera } = require('../controllers/clienteController');

// Crear un nuevo cliente
router.post('/', auth, crearCliente);

// Obtener todos los clientes con sus pólizas asociadas
router.get('/', auth, obtenerClientes);

// Obtener un cliente por ID
router.get('/:id', auth, obtenerClientePorId);

// Migración temporal: Vincular pólizas históricas con clientes
router.get('/migrar-historico', auth, migrarClientesHistoricos);

// Actualizar un cliente
router.put('/:id', auth, actualizarCliente);

// Eliminar un cliente (soft delete)
router.delete('/:id', auth, eliminarCliente);

// --- PAPELERA DE RECICLAJE ---
// Obtener clientes eliminados (papelera)
router.get('/papelera', auth, obtenerClientesPapelera);

// Restaurar cliente de la papelera
router.put('/papelera/:id/restaurar', auth, restaurarClientePapelera);

// Destruir cliente definitivamente de la papelera
router.delete('/papelera/:id/destruir', auth, destruirClientePapelera);

module.exports = router;
