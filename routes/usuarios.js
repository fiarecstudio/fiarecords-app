const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs'); // Necesario si cambias contraseña manual

router.use(auth);

// Obtener todos los usuarios (Asegúrate de que el frontend muestre el campo 'email')
router.get('/', async (req, res) => {
    try {
        const usuarios = await Usuario.find({ isDeleted: false }).select('-password');
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// CREAR USUARIO (Desde panel admin)
router.post('/', async (req, res) => {
    try {
        const { username, email, password, role, permisos } = req.body;
        
        // Validar correo único
        if (email) {
            const existeEmail = await Usuario.findOne({ email });
            if (existeEmail) return res.status(400).json({ error: 'El correo ya está en uso' });
        }

        const nuevoUsuario = new Usuario({ username, email, password, role, permisos });
        await nuevoUsuario.save();
        res.status(201).json(nuevoUsuario);
    } catch (err) {
        res.status(400).json({ error: 'Error al crear usuario' });
    }
});

// ACTUALIZAR USUARIO (Aquí agregamos la lógica para cambiar el EMAIL)
router.put('/:id', async (req, res) => {
    try {
        const { username, email, role, permisos, password } = req.body;
        const usuarioId = req.params.id;

        // 1. Validar si el email nuevo ya existe en otro usuario
        if (email) {
            const emailOcupado = await Usuario.findOne({ email: email, _id: { $ne: usuarioId } });
            if (emailOcupado) {
                return res.status(400).json({ error: 'El correo ya está siendo usado por otro usuario.' });
            }
        }

        // 2. Preparar objeto de actualización
        let datosActualizar = { username, email, role, permisos };

        // 3. Si mandaron contraseña, la encriptamos (si no lo hace el modelo automáticamente)
        if (password && password.trim() !== "") {
            // Nota: Como tu modelo tiene un "pre save" para hash, 
            // la mejor forma de actualizar pass es buscar, asignar y save()
            // Pero para hacerlo simple con update, la hasheamos aquí manual:
             const salt = await bcrypt.genSalt(10);
             datosActualizar.password = await bcrypt.hash(password, salt);
        }

        const usuarioActualizado = await Usuario.findByIdAndUpdate(
            usuarioId,
            datosActualizar,
            { new: true }
        ).select('-password');

        res.json(usuarioActualizado);

    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al actualizar usuario' });
    }
});

// Eliminar (Soft Delete)
router.delete('/:id', async (req, res) => {
    try {
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al eliminar' }); }
});

module.exports = router;