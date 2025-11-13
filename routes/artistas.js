// routes/artistas.js
const express = require('express');
const router = express.Router();
const Artista = require('../models/Artista');
const auth = require('../middleware/auth');

router.use(auth);

// Obtener todos los artistas no eliminados
router.get('/', async (req, res) => {
    try {
        const artistas = await Artista.find({ isDeleted: false }).sort({ nombreArtistico: 1, nombre: 1 });
        res.json(artistas);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener artistas' });
    }
});

// Crear un nuevo artista con todos los campos
router.post('/', async (req, res) => {
    try {
        const { nombre, nombreArtistico, telefono, correo } = req.body;
        const nuevoArtista = new Artista({ nombre, nombreArtistico, telefono, correo });
        await nuevoArtista.save();
        res.status(201).json(nuevoArtista);
    } catch (err) {
        res.status(400).json({ error: 'Error al crear el artista' });
    }
});

// Obtener un artista por ID
router.get('/:id', async (req, res) => {
    try {
        const artista = await Artista.findById(req.params.id);
        if (!artista) return res.status(404).json({ error: 'Artista no encontrado' });
        res.json(artista);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar un artista
router.put('/:id', async (req, res) => {
    try {
        const { nombre, nombreArtistico, telefono, correo } = req.body;
        const artista = await Artista.findByIdAndUpdate(req.params.id, 
            { nombre, nombreArtistico, telefono, correo }, 
            { new: true }
        );
        if (!artista) return res.status(404).json({ error: 'Artista no encontrado' });
        res.json(artista);
    } catch (err) {
        res.status(400).json({ error: 'Error al actualizar el artista' });
    }
});

// Mover a la papelera (Soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const artista = await Artista.findByIdAndUpdate(req.params.id, { isDeleted: true });
        if (!artista) return res.status(404).json({ error: 'Artista no encontrado' });
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Error al mover a la papelera' });
    }
});

// --- Rutas de Papelera ---
router.get('/papelera/all', async (req, res) => {
    try {
        const artistas = await Artista.find({ isDeleted: true });
        res.json(artistas);
    } catch (err) { res.status(500).json({ error: "Error al obtener la papelera de artistas" }); }
});

router.put('/:id/restaurar', async (req, res) => {
    try {
        await Artista.findByIdAndUpdate(req.params.id, { isDeleted: false });
        res.json({ message: 'Artista restaurado' });
    } catch (err) { res.status(500).json({ error: 'Error al restaurar' }); }
});

router.delete('/:id/permanente', async (req, res) => {
    try {
        await Artista.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al eliminar permanentemente' }); }
});

router.delete('/papelera/vaciar', async (req, res) => {
    try {
        await Artista.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al vaciar la papelera' }); }
});

module.exports = router;