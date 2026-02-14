const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista'); 
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs'); 

router.use(auth);

// ==========================================
// OBTENER USUARIOS
// ==========================================
router.get('/', async (req, res) => {
    try {
        const usuarios = await Usuario.find({ isDeleted: false }).select('-password');
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// ==========================================
// CREAR USUARIO
// ==========================================
router.post('/', async (req, res) => {
    try {
        const { username, email, password, role, permisos } = req.body;
        
        // Validar correo único
        if (email) {
            const existeEmail = await Usuario.findOne({ email });
            if (existeEmail) return res.status(400).json({ error: 'El correo ya está en uso' });
        }

        // NOTA: Aquí confiamos en que tu modelo Usuario.js tiene el "pre-save hook" 
        // para encriptar la contraseña automáticamente.
        const nuevoUsuario = new Usuario({ username, email, password, role, permisos });
        
        await nuevoUsuario.save();
        res.status(201).json(nuevoUsuario);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al crear usuario' });
    }
});

// ==========================================
// ACTUALIZAR USUARIO (CORREGIDO)
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        const { username, email, role, permisos, password } = req.body;
        const usuarioId = req.params.id;

        // 1. Validar si el email nuevo ya existe (si es que se está cambiando)
        if (email) {
            const emailOcupado = await Usuario.findOne({ email: email, _id: { $ne: usuarioId } });
            if (emailOcupado) {
                return res.status(400).json({ error: 'El correo ya está siendo usado por otro usuario.' });
            }
        }

        // 2. Preparar objeto de actualización DINÁMICO
        // (Solo agregamos lo que viene en el body para no borrar datos existentes)
        let datosActualizar = {};
        if (username) datosActualizar.username = username;
        if (email) datosActualizar.email = email;
        if (role) datosActualizar.role = role;
        if (permisos) datosActualizar.permisos = permisos;

        // 3. Manejo de Contraseña y Sincronización
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            // Asignamos la contraseña encriptada al usuario
            datosActualizar.password = hashedPassword;

            // --- SINCRONIZACIÓN HACIA ARTISTA ---
            // Si tu modelo Artista tiene campo password, esto es correcto.
            if (email) {
                 await Artista.updateMany(
                    { correo: email }, // Ojo: Verifica si en Artista es 'email' o 'correo'
                    { password: hashedPassword }
                );
            } else {
                // Si no mandaron email en el body, buscamos el usuario actual para obtener su email
                const usuarioActual = await Usuario.findById(usuarioId);
                if(usuarioActual) {
                    await Artista.updateMany(
                        { correo: usuarioActual.email }, 
                        { password: hashedPassword }
                    );
                }
            }
            console.log(">> Sincronización: Contraseña actualizada.");
        }

        // 4. Actualizar Usuario
        // Usamos findByIdAndUpdate porque este método NO dispara el pre-save hook del modelo,
        // por eso encriptamos la contraseña manualmente arriba (paso 3).
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

// ==========================================
// ELIMINAR (Soft Delete)
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al eliminar' }); }
});

module.exports = router;