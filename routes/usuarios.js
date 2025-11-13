// Contenido COMPLETO para: routes/usuarios.js
const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const auth = require('../middleware/auth');

router.use(auth);

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') { return res.status(403).json({ error: 'Acceso denegado.' }); }
  next();
};
router.use(adminOnly); // Aplicar a todas las rutas de este archivo

router.get('/', async (req, res) => { try { const d = await Usuario.find({isDeleted:false}).select('-password'); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.get('/:id', async (req, res) => { try { const d = await Usuario.findById(req.params.id).select('-password'); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.post('/', async (req, res) => { try { const d = new Usuario(req.body); await d.save(); res.status(201).json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.put('/:id', async (req, res) => { try { const { username, role, password } = req.body; const updateData = { username, role }; if (password) { const user = await Usuario.findById(req.params.id); user.password = password; await user.save(); } const d = await Usuario.findByIdAndUpdate(req.params.id, updateData, {new:true}).select('-password'); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.delete('/:id', async (req, res) => { try { await Usuario.findByIdAndUpdate(req.params.id, {isDeleted:true}); res.status(204).send(); } catch(e){res.status(500).json({e:'Error'})}});
router.get('/papelera/all', async (req, res) => { try { const d = await Usuario.find({isDeleted:true}).select('-password'); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.put('/:id/restaurar', async (req, res) => { try { await Usuario.findByIdAndUpdate(req.params.id, {isDeleted:false}); res.status(204).send(); } catch(e){res.status(500).json({e:'Error'})}});
router.delete('/:id/permanente', async (req, res) => { try { await Usuario.findByIdAndDelete(req.params.id); res.status(204).send(); } catch(e){res.status(500).json({e:'Error'})}});

router.delete('/papelera/vaciar', async (req, res) => {
    try {
        await Usuario.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: "Error al vaciar la papelera" }); }
});

module.exports = router;