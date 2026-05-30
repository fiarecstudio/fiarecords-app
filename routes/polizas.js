const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const polizaController = require('../controllers/polizaController');

// Rutas protegidas con middleware de autenticación
router.post('/', auth, polizaController.crearPoliza);
router.get('/', auth, polizaController.obtenerPolizas);
router.put('/:id', auth, polizaController.actualizarPoliza);
router.delete('/:id', auth, polizaController.eliminarPoliza);

module.exports = router;
