const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista'); // <--- NUEVO: Importamos Artista
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs'); 

router.use(auth);

// Obtener todos los usuarios
router.get('/', async (req, res) => {
    try {
        const usuarios = await Usuario.find({ isDeleted: false }).select('-password');
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// CREAR USUARIO
router.post('/', async (req, res) => {
    try {
        const { username, email, password, role, permisos } = req.body;
        
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

// ACTUALIZAR USUARIO (CON SYNC A ARTISTA)
router.put('/:id', async (req, res) => {
    try {
        const { username, email, role, permisos, password } = req.body;
        const usuarioId = req.params.id;

        // 1. Validar si el email nuevo ya existe
        if (email) {
            const emailOcupado = await Usuario.findOne({ email: email, _id: { $ne: usuarioId } });
            if (emailOcupado) {
                return res.status(400).json({ error: 'El correo ya está siendo usado por otro usuario.' });
            }
        }

        // 2. Preparar objeto de actualización
        let datosActualizar = { username, email, role, permisos };

        // 3. Manejo de Contraseña y Sincronización
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            // Asignamos la contraseña encriptada al usuario
            datosActualizar.password = hashedPassword;

            // --- SINCRONIZACIÓN HACIA ARTISTA ---
            // Buscamos si hay un artista con este mismo email y le actualizamos la pass
            // Usamos updateMany por si acaso hubiera duplicados, pero debería ser uno.
            await Artista.updateMany(
                { email: email }, // Busca artistas con este correo (el nuevo, si se cambió)
                { password: hashedPassword } // Les pone la misma contraseña encriptada
            );
            console.log(">> Sincronización: Contraseña actualizada en perfil de Artista asociado.");
        }

        // 4. Actualizar Usuario
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