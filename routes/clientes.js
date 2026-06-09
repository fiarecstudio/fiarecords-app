const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { crearCliente, obtenerClientes, migrarClientesHistoricos, actualizarCliente, eliminarCliente } = require('../controllers/clienteController');

// Crear un nuevo cliente
router.post('/', auth, crearCliente);

// Obtener todos los clientes con sus pólizas asociadas
router.get('/', auth, obtenerClientes);

// Migración temporal: Vincular pólizas históricas con clientes
router.get('/migrar-historico', auth, migrarClientesHistoricos);

// Actualizar un cliente
router.put('/:id', auth, actualizarCliente);

// Eliminar un cliente (soft delete)
router.delete('/:id', auth, eliminarCliente);

module.exports = router;
