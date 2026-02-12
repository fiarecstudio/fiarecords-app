const express = require('express');
const router = express.Router();
const Artista = require('../models/Artista');
const Usuario = require('../models/Usuario'); // IMPORTANTE
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
// ACTUALIZAR (CON AUTOCURACIÓN DE USUARIO)
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        const { nombre, nombreArtistico, telefono, correo } = req.body;
        const artistaId = req.params.id;

        // 1. Buscamos el artista actual
        const artistaActual = await Artista.findById(artistaId);
        if (!artistaActual) return res.status(404).json({ error: 'Artista no encontrado' });

        // 2. LÓGICA DE SINCRONIZACIÓN INTELIGENTE (AUTOCURACIÓN)
        // Verificamos directamente contra la base de datos de USUARIOS
        if (artistaActual.usuarioId && correo) {
            
            const usuarioVinculado = await Usuario.findById(artistaActual.usuarioId);

            // Si existe el usuario Y su email en el LOGIN es diferente al que viene del formulario...
            // (Esto arregla el problema aunque el Artista ya tenga el correo "bien")
            if (usuarioVinculado && usuarioVinculado.email !== correo) {
                
                // A. Verificar si el nuevo correo ya lo usa OTRO usuario distinto
                const emailOcupado = await Usuario.findOne({ 
                    email: correo, 
                    _id: { $ne: artistaActual.usuarioId } 
                });

                if (emailOcupado) {
                    return res.status(400).json({ error: 'El correo ya está en uso por otro usuario (Login). No se puede sincronizar.' });
                }

                // B. Forzamos la actualización en Usuarios
                await Usuario.findByIdAndUpdate(artistaActual.usuarioId, { email: correo });
                console.log(`✅ CORREGIDO: Usuario ${artistaActual.usuarioId} sincronizado al correo: ${correo}`);
            }
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

// ... (El resto de tus rutas DELETE y PAPELERA siguen igual)
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