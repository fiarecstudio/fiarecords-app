const express = require('express');
const router = express.Router();
const Artista = require('../models/Artista');
const Usuario = require('../models/Usuario'); // Necesario para actualizar el login
const auth = require('../middleware/auth');

router.use(auth);

// Obtener todos
router.get('/', async (req, res) => {
    try {
        const artistas = await Artista.find({ isDeleted: false }).sort({ nombreArtistico: 1, nombre: 1 });
        res.json(artistas);
    } catch (err) { res.status(500).json({ error: 'Error al obtener artistas' }); }
});

// Crear uno nuevo
router.post('/', async (req, res) => {
    try {
        const { nombre, nombreArtistico, telefono, correo } = req.body;
        const nuevoArtista = new Artista({ nombre, nombreArtistico, telefono, correo });
        await nuevoArtista.save();
        res.status(201).json(nuevoArtista);
    } catch (err) { res.status(400).json({ error: 'Error al crear el artista' }); }
});

// Obtener por ID
router.get('/:id', async (req, res) => {
    try {
        const artista = await Artista.findById(req.params.id);
        if (!artista) return res.status(404).json({ error: 'Artista no encontrado' });
        res.json(artista);
    } catch (err) { res.status(500).json({ error: 'Error del servidor' }); }
});

// ==========================================
// ACTUALIZAR (CON SINCRONIZACIÓN DE USUARIO)
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        const { nombre, nombreArtistico, telefono, correo } = req.body;
        const artistaId = req.params.id;

        // 1. Buscamos el artista actual
        const artista = await Artista.findById(artistaId);
        if (!artista) return res.status(404).json({ error: 'Artista no encontrado' });

        // 2. Si tiene usuario vinculado y cambiamos el correo...
        if (artista.usuarioId && correo && correo !== artista.correo) {
            // Verificar si el correo ya existe en otro usuario
            const emailOcupado = await Usuario.findOne({ email: correo, _id: { $ne: artista.usuarioId } });
            if (emailOcupado) {
                return res.status(400).json({ error: 'El correo ya está en uso por otro usuario.' });
            }
            // Actualizar el Usuario (Login)
            await Usuario.findByIdAndUpdate(artista.usuarioId, { email: correo });
            console.log(`✅ Correo de usuario actualizado a: ${correo}`);
        }

        // 3. Actualizamos el Artista
        const artistaActualizado = await Artista.findByIdAndUpdate(artistaId, 
            { nombre, nombreArtistico, telefono, correo }, 
            { new: true }
        );
        res.json(artistaActualizado);

    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al actualizar' });
    }
});

// Soft Delete
router.delete('/:id', async (req, res) => {
    try {
        await Artista.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al eliminar' }); }
});

// Rutas Papelera
router.get('/papelera/all', async (req, res) => {
    try {
        const artistas = await Artista.find({ isDeleted: true });
        res.json(artistas);
    } catch (err) { res.status(500).json({ error: "Error papelera" }); }
});

router.put('/:id/restaurar', async (req, res) => {
    try {
        await Artista.findByIdAndUpdate(req.params.id, { isDeleted: false });
        res.json({ message: 'Restaurado' });
    } catch (err) { res.status(500).json({ error: 'Error restaurar' }); }
});

router.delete('/:id/permanente', async (req, res) => {
    try {
        await Artista.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error eliminar permanente' }); }
});

router.delete('/papelera/vaciar', async (req, res) => {
    try {
        await Artista.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error vaciar' }); }
});

module.exports = router;