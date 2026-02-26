const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista'); 
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs'); 

router.use(auth);

// ==========================================
// OBTENER USUARIOS (ACTIVOS)
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
// NUEVO: OBTENER USUARIOS EN PAPELERA (SOLUCIÓN TEMA 1)
// ==========================================
// Esta ruta faltaba, por eso no cargaban en la papelera.
router.get('/papelera/all', async (req, res) => {
    try {
        const usuarios = await Usuario.find({ isDeleted: true }).select('-password');
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener papelera de usuarios' });
    }
});

// ==========================================
// CREAR USUARIO
// ==========================================
router.post('/', async (req, res) => {
    try {
        const { username, email, password, role, permisos, artistaId } = req.body;
        
        // Validar correo único
        if (email) {
            const existeEmail = await Usuario.findOne({ email });
            if (existeEmail) return res.status(400).json({ error: 'El correo ya está en uso' });
        }

        const nuevoUsuario = new Usuario({ 
            username, 
            email, 
            password, 
            role, 
            permisos,
            artistaId: artistaId || null 
        });
        
        await nuevoUsuario.save();
        res.status(201).json(nuevoUsuario);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al crear usuario' });
    }
});

// ==========================================
// ACTUALIZAR USUARIO
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        const { username, email, role, permisos, password, artistaId } = req.body;
        const usuarioId = req.params.id;

        // 1. Validar si el email nuevo ya existe
        if (email) {
            const emailOcupado = await Usuario.findOne({ email: email, _id: { $ne: usuarioId } });
            if (emailOcupado) {
                return res.status(400).json({ error: 'El correo ya está siendo usado por otro usuario.' });
            }
        }

        // 2. Preparar objeto de actualización
        let datosActualizar = {};
        if (username) datosActualizar.username = username;
        if (email) datosActualizar.email = email;
        if (role) datosActualizar.role = role;
        if (permisos) datosActualizar.permisos = permisos;
        
        if (artistaId !== undefined) {
            datosActualizar.artistaId = artistaId || null;
        }

        // 3. Manejo de Contraseña
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            datosActualizar.password = hashedPassword;
        }

        // 4. Actualizar Usuario
        const usuarioActualizado = await Usuario.findByIdAndUpdate(
            usuarioId,
            { $set: datosActualizar },
            { new: true }
        ).select('-password');

        res.json(usuarioActualizado);

    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al actualizar usuario' });
    }
});

// ==========================================
// MOVER A PAPELERA (Soft Delete)
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// ==========================================
// RESTAURAR USUARIO (NUEVO PARA FUNCIONALIDAD COMPLETA)
// ==========================================
router.put('/:id/restaurar', async (req, res) => {
    try {
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: false });
        res.json({ message: 'Usuario restaurado' });
    } catch (err) { res.status(500).json({ error: 'Error al restaurar' }); }
});

// ==========================================
// ELIMINAR PERMANENTE
// ==========================================
router.delete('/:id/permanente', async (req, res) => {
    try {
        await Usuario.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error eliminar permanente' }); }
});

module.exports = router;