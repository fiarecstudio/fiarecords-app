// routes/artistas.js
const express = require('express');
const router = express.Router();
const Artista = require('../models/Artista');
const Usuario = require('../models/Usuario'); // <--- IMPORTANTE: Agregamos esto para poder editar el usuario
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

// ============================================================
// ACTUALIZAR ARTISTA (Y SINCRONIZAR CON USUARIO)
// ============================================================
router.put('/:id', async (req, res) => {
    try {
        const { nombre, nombreArtistico, telefono, correo } = req.body;
        const artistaId = req.params.id;

        // 1. Buscamos el artista primero (sin actualizar aún)
        const artista = await Artista.findById(artistaId);
        if (!artista) return res.status(404).json({ error: 'Artista no encontrado' });

        // 2. LOGICA DE SINCRONIZACIÓN:
        // Si el artista tiene un usuario vinculado Y estamos cambiando el correo...
        if (artista.usuarioId && correo && correo !== artista.correo) {
            console.log(`Actualizando correo del usuario vinculado: ${artista.usuarioId}`);
            
            // Verificamos que el correo no esté ocupado por OTRO usuario
            const emailOcupado = await Usuario.findOne({ email: correo, _id: { $ne: artista.usuarioId } });
            if (emailOcupado) {
                return res.status(400).json({ error: 'Este correo ya está siendo usado por otro usuario.' });
            }

            // Actualizamos el email en la colección de Usuarios
            await Usuario.findByIdAndUpdate(artista.usuarioId, { email: correo });
        }

        // 3. Actualizamos los datos del Artista
        // Usamos findByIdAndUpdate para aplicar los cambios finales
        const artistaActualizado = await Artista.findByIdAndUpdate(artistaId, 
            { nombre, nombreArtistico, telefono, correo }, 
            { new: true } // Devuelve el dato actualizado
        );

        res.json(artistaActualizado);

    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al actualizar el artista. Verifique los datos.' });
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