const express = require('express');
const router = express.Router();
const Artista = require('../models/Artista');
const Usuario = require('../models/Usuario'); // IMPORTANTE: Necesario para actualizar el login
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
        // Nota: Al crear aquí, aún no vinculamos usuario (eso se hace usualmente en el registro)
        // O podrías crear el usuario aquí si fuera necesario.
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

        // 1. Buscamos el artista actual para ver sus datos viejos
        const artistaActual = await Artista.findById(artistaId);
        if (!artistaActual) return res.status(404).json({ error: 'Artista no encontrado' });

        // 2. LÓGICA DE SINCRONIZACIÓN
        // Si el artista tiene un usuario vinculado Y estamos intentando cambiar el correo...
        if (artistaActual.usuarioId && correo && correo !== artistaActual.correo) {
            
            // A. Verificar si el nuevo correo ya lo usa OTRO usuario
            const emailOcupado = await Usuario.findOne({ 
                email: correo, 
                _id: { $ne: artistaActual.usuarioId } // Que no sea el mismo usuario
            });

            if (emailOcupado) {
                return res.status(400).json({ error: 'El correo ya está en uso por otro usuario. No se puede actualizar.' });
            }

            // B. Si está libre, actualizamos la tabla de USUARIOS (Login)
            await Usuario.findByIdAndUpdate(artistaActual.usuarioId, { email: correo });
            console.log(`✅ Login actualizado para el usuario: ${artistaActual.usuarioId} con correo: ${correo}`);
        }

        // 3. Actualizamos la tabla de ARTISTAS (Perfil visual)
        const artistaActualizado = await Artista.findByIdAndUpdate(artistaId, 
            { nombre, nombreArtistico, telefono, correo }, 
            { new: true } // Devuelve el dato ya actualizado
        );
        
        res.json(artistaActualizado);

    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al actualizar' });
    }
});

// Soft Delete (Papelera)
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