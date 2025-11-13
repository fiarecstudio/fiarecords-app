// Contenido COMPLETO para: routes/servicios.js
const express = require('express');
const router = express.Router();
const Servicio = require('../models/Servicio');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => { try { const d = await Servicio.find({isDeleted:false}); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.get('/:id', async (req, res) => { try { const d = await Servicio.findById(req.params.id); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.post('/', async (req, res) => { try { const d = new Servicio(req.body); await d.save(); res.status(201).json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.put('/:id', async (req, res) => { try { const d = await Servicio.findByIdAndUpdate(req.params.id, req.body, {new:true}); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.delete('/:id', async (req, res) => { try { await Servicio.findByIdAndUpdate(req.params.id, {isDeleted:true}); res.status(204).send(); } catch(e){res.status(500).json({e:'Error'})}});
router.get('/papelera/all', async (req, res) => { try { const d = await Servicio.find({isDeleted:true}); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.put('/:id/restaurar', async (req, res) => { try { await Servicio.findByIdAndUpdate(req.params.id, {isDeleted:false}); res.status(204).send(); } catch(e){res.status(500).json({e:'Error'})}});
router.delete('/:id/permanente', async (req, res) => { try { await Servicio.findByIdAndDelete(req.params.id); res.status(204).send(); } catch(e){res.status(500).json({e:'Error'})}});

router.delete('/papelera/vaciar', async (req, res) => {
    try {
        await Servicio.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: "Error al vaciar la papelera" }); }
});

module.exports = router;