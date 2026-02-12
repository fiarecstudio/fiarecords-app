const express = require('express');
const router = express.Router();
const Artista = require('../models/Artista');
const Usuario = require('../models/Usuario'); 
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs'); // <--- NUEVO: Necesario para encriptar pass

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
        // Nota: Agrego password aquí por si lo mandas al crear, aunque normalmente se crea sin pass al inicio
        const { nombre, nombreArtistico, telefono, correo, password } = req.body;
        const nuevoArtista = new Artista({ nombre, nombreArtistico, telefono, correo, password }); // El modelo debería manejar el hash si tiene pre-save, si no, habría que hashear aquí también.
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
// ACTUALIZAR (CON SYNC DE PASSWORD Y EMAIL)
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        const { nombre, nombreArtistico, telefono, correo, password } = req.body;
        const artistaId = req.params.id;

        // 1. Buscamos el artista actual
        const artistaActual = await Artista.findById(artistaId);
        if (!artistaActual) return res.status(404).json({ error: 'Artista no encontrado' });

        // Preparar objeto de actualización
        let datosUpdate = { nombre, nombreArtistico, telefono, correo };

        // ---------------------------------------------------------
        // A. MANEJO DE CONTRASEÑA (NUEVO)
        // ---------------------------------------------------------
        if (password && password.trim() !== "") {
            // Encriptamos la contraseña
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            datosUpdate.password = hashedPassword;

            // SYNC: Si el artista tiene un usuario vinculado, le actualizamos la pass también
            if (artistaActual.usuarioId) {
                await Usuario.findByIdAndUpdate(artistaActual.usuarioId, { password: hashedPassword });
                console.log(">> Password sincronizada al Usuario ID:", artistaActual.usuarioId);
            } 
            // Si no tiene usuarioId, intentamos buscar por correo como respaldo
            else if (correo) {
                await Usuario.findOneAndUpdate({ email: correo }, { password: hashedPassword });
                console.log(">> Password sincronizada al Usuario por Email:", correo);
            }
        }

        // ---------------------------------------------------------
        // B. LÓGICA DE SINCRONIZACIÓN DE CORREO (TU CÓDIGO ORIGINAL MEJORADO)
        // ---------------------------------------------------------
        if (artistaActual.usuarioId && correo) {
            const usuarioVinculado = await Usuario.findById(artistaActual.usuarioId);

            // Si el correo es diferente, intentamos actualizar el Usuario también
            if (usuarioVinculado && usuarioVinculado.email !== correo) {
                
                // Validamos que el nuevo correo no lo tenga OTRO usuario
                const emailOcupado = await Usuario.findOne({ 
                    email: correo, 
                    _id: { $ne: artistaActual.usuarioId } 
                });

                if (emailOcupado) {
                    return res.status(400).json({ error: 'El correo ya está en uso por otro usuario. No se puede sincronizar.' });
                }

                // Actualizamos el email del usuario
                await Usuario.findByIdAndUpdate(artistaActual.usuarioId, { email: correo });
                console.log(`✅ Email sincronizado: Usuario ${artistaActual.usuarioId} ahora tiene correo: ${correo}`);
            }
        }

        // 3. Actualizamos finalmente el Artista
        const artistaActualizado = await Artista.findByIdAndUpdate(
            artistaId, 
            datosUpdate, 
            { new: true }
        );
        
        res.json(artistaActualizado);

    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al actualizar' });
    }
});

// Rutas Papelera y Delete (Sin cambios, solo las incluyo para que el archivo esté completo)
router.delete('/:id', async (req, res) => {
    try {
        await Artista.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al eliminar' }); }
});

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