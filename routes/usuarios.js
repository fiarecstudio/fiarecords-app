const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista'); 
const auth = require('../middleware/auth');
const { applyTenantFilter, buildQueryFilter, hasTenantAccess } = require('../middleware/tenantFilter');
const bcrypt = require('bcryptjs'); 

router.use(auth);
router.use(applyTenantFilter); // FASE 3: Aplicar filtro de empresa automáticamente

// ==========================================
// OBTENER USUARIOS (ACTIVOS)
// ==========================================
router.get('/', async (req, res) => {
    try {
        const filtro = buildQueryFilter(req, { isDeleted: false });
        const usuarios = await Usuario.find(filtro).select('-password');
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
        const filtro = buildQueryFilter(req, { isDeleted: true });
        const usuarios = await Usuario.find(filtro).select('-password');
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
        let { username, email, password, role, permisos, artistaId, empresaId } = req.body;
        
        // Limpiar email vacío para que sparse index lo ignore
        if (email === "" || (email && email.trim() === "")) {
            email = undefined;
        }
        
        console.log("Datos recibidos en el servidor:", req.body);
        console.log('[POST /api/usuarios] Usuario creador:', req.user);
        
        // FASE 4: Determinar empresaId según rol del creador (ANTES de validar email)
        let empresaIdFinal;
        if (req.user.isSuperAdmin && empresaId) {
            // Super Admin puede asignar a cualquier empresa
            empresaIdFinal = empresaId;
        } else {
            // Admin estándar obligado a heredar su empresa
            empresaIdFinal = req.user.empresaId;
        }
        
        // Validar correo único por empresa (solo si se proporcionó email válido)
        if (email && email.trim() !== '') {
            const existeEmail = await Usuario.findOne({ 
                email: email.trim(), 
                empresaId: empresaIdFinal,
                isDeleted: false 
            });
            if (existeEmail) {
                return res.status(400).json({ error: 'El correo ya está en uso en esta empresa' });
            }
        }

        // Preparar datos del usuario (excluir email si es null/vacío para evitar duplicados)
        const userData = { 
            username, 
            password, 
            role, 
            permisos,
            artistaId: artistaId || null,
            empresaId: empresaIdFinal // FASE 4: Asignar empresa según contexto
        };
        
        // Solo incluir email si tiene valor válido
        if (email && email.trim() !== '') {
            userData.email = email.trim();
        }
        
        const nuevoUsuario = new Usuario(userData);
        
        await nuevoUsuario.save();
        res.status(201).json(nuevoUsuario);
    } catch (err) {
        console.error("[Error crear usuario]", err.message);
        console.error("[Error detalle]", err);
        res.status(400).json({ error: 'Error al crear usuario: ' + err.message });
    }
});

// ==========================================
// ACTUALIZAR USUARIO
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        const { username, email, role, permisos, password, artistaId, empresaId } = req.body;
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

        // FASE 4: Manejo de empresaId (solo Super Admin puede cambiarlo)
        if (req.user.isSuperAdmin && empresaId !== undefined) {
            datosActualizar.empresaId = empresaId;
        }

        // 3. Manejo de Contraseña
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            datosActualizar.password = hashedPassword;
        }

        // 4. Actualizar Usuario
        // FASE 3: Verificar que el usuario a actualizar pertenece a la empresa (si no es Super Admin)
        const usuarioExistente = await Usuario.findById(usuarioId);
        if (!usuarioExistente) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (!hasTenantAccess(req, usuarioExistente)) {
            return res.status(403).json({ error: 'No autorizado: El usuario no pertenece a tu empresa.' });
        }

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
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (!hasTenantAccess(req, usuario)) return res.status(403).json({ error: 'No autorizado' });
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// ==========================================
// RESTAURAR USUARIO (NUEVO PARA FUNCIONALIDAD COMPLETA)
// ==========================================
router.put('/:id/restaurar', async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (!hasTenantAccess(req, usuario)) return res.status(403).json({ error: 'No autorizado' });
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: false });
        res.json({ message: 'Usuario restaurado' });
    } catch (err) { res.status(500).json({ error: 'Error al restaurar' }); }
});

// ==========================================
// ELIMINAR PERMANENTE
// ==========================================
router.delete('/:id/permanente', async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (!hasTenantAccess(req, usuario)) return res.status(403).json({ error: 'No autorizado' });
        await Usuario.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error eliminar permanente' }); }
});

module.exports = router;