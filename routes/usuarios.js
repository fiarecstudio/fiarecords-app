const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const auth = require('../middleware/auth'); // Tu middleware de verificar token

// 1. Proteger todas las rutas de este archivo
router.use(auth);

// 2. Middleware exclusivo para Admin
const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Solo admins.' });
    }
    next();
};

router.use(adminOnly);

// GET: Listar usuarios
router.get('/', async (req, res) => { 
    try { 
        const usuarios = await Usuario.find({ isDeleted: false }).select('-password'); 
        res.json(usuarios); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

// GET: Un usuario
router.get('/:id', async (req, res) => { 
    try { 
        const u = await Usuario.findById(req.params.id).select('-password'); 
        res.json(u); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

// POST: Crear usuario (Desde Panel Admin)
router.post('/', async (req, res) => { 
    try { 
        const { username, password, role, permisos, email } = req.body;
        const existe = await Usuario.findOne({ username });
        if (existe) return res.status(400).json({ error: "Usuario existente." });

        const nuevo = new Usuario({ username, password, role, permisos, email });
        await nuevo.save();
        
        const respuesta = await Usuario.findById(nuevo._id).select('-password');
        res.status(201).json(respuesta);
    } catch(e){ res.status(500).json({ error: e.message }); }
});

// PUT: Editar usuario
router.put('/:id', async (req, res) => { 
    try { 
        const { username, role, password, permisos, email } = req.body; 
        const user = await Usuario.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "No encontrado" });

        if (username) user.username = username;
        if (email) user.email = email;
        if (role) user.role = role.toLowerCase();
        if (permisos) user.permisos = permisos;

        // Solo actualizamos password si escribieron algo nuevo
        if (password && password.trim().length > 0) {
            user.password = password; // El modelo lo encriptará al guardar
        }

        await user.save();
        res.json(await Usuario.findById(user._id).select('-password'));
    } catch(e){ res.status(500).json({ error: e.message }); }
});

// DELETE: Papelera (Soft Delete)
router.delete('/:id', async (req, res) => { 
    try { 
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: true }); 
        res.status(204).send(); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

// RUTA EXTRA: Vaciar Papelera
router.delete('/papelera/vaciar', async (req, res) => {
    try { await Usuario.deleteMany({ isDeleted: true }); res.status(204).send(); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// RUTA EXTRA: Ver Papelera
router.get('/papelera/all', async (req, res) => {
    try { 
        const eliminados = await Usuario.find({ isDeleted: true }).select('-password');
        res.json(eliminados);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// RUTA EXTRA: Restaurar
router.put('/:id/restaurar', async (req, res) => {
    try { 
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: false });
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// RUTA EXTRA: Eliminar Permanente
router.delete('/:id/permanente', async (req, res) => {
    try { 
        await Usuario.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;