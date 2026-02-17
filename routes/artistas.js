// ==========================================
// ARCHIVO: routes/artistas.js (CORREGIDO Y BLINDADO)
// ==========================================
const express = require('express');
const router = express.Router();
const Artista = require('../models/Artista');
const Usuario = require('../models/Usuario'); 
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs'); 

router.use(auth);

// ==========================================
// OBTENER ARTISTAS (CON SEGURIDAD PARA CLIENTES)
// ==========================================
router.get('/', async (req, res) => {
    try {
        let filtro = { isDeleted: false };

        // --- MODIFICACIÓN CLAVE: BLINDAJE ---
        // Si el usuario es 'cliente', forzamos el filtro para que SOLO traiga su propio ID.
        if (req.user.role === 'cliente') {
            if (req.user.artistaId) {
                filtro._id = req.user.artistaId;
            } else {
                // Si es cliente pero no tiene vínculo, devolvemos lista vacía por seguridad
                return res.json([]); 
            }
        }
        // -------------------------------------

        const artistas = await Artista.find(filtro).sort({ nombreArtistico: 1, nombre: 1 });
        res.json(artistas);
    } catch (err) { res.status(500).json({ error: 'Error al obtener artistas' }); }
});

// Crear uno nuevo
router.post('/', async (req, res) => {
    try {
        const { nombre, nombreArtistico, telefono, correo, password } = req.body;
        const nuevoArtista = new Artista({ nombre, nombreArtistico, telefono, correo, password }); 
        await nuevoArtista.save();
        res.status(201).json(nuevoArtista);
    } catch (err) { res.status(400).json({ error: 'Error al crear el artista' }); }
});

// Obtener por ID
router.get('/:id', async (req, res) => {
    try {
        // --- SEGURIDAD EXTRA ---
        // Si un cliente intenta consultar un ID que no es el suyo, bloqueamos.
        if (req.user.role === 'cliente' && req.user.artistaId !== req.params.id) {
            return res.status(403).json({ error: 'No autorizado' });
        }

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
        // --- SEGURIDAD EXTRA ---
        // El cliente solo puede editar su propio perfil (si la interfaz lo permite)
        if (req.user.role === 'cliente' && req.user.artistaId !== req.params.id) {
             return res.status(403).json({ error: 'No autorizado' });
        }

        const { nombre, nombreArtistico, telefono, correo, password } = req.body;
        const artistaId = req.params.id;

        // 1. Buscamos el artista actual
        const artistaActual = await Artista.findById(artistaId);
        if (!artistaActual) return res.status(404).json({ error: 'Artista no encontrado' });

        // Preparar objeto de actualización
        let datosUpdate = { nombre, nombreArtistico, telefono, correo };

        // ---------------------------------------------------------
        // A. MANEJO DE CONTRASEÑA (TU LÓGICA ORIGINAL)
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
        // B. LÓGICA DE SINCRONIZACIÓN DE CORREO (TU LÓGICA ORIGINAL)
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

// ==========================================
// RUTAS DE BORRADO Y PAPELERA (PROTEGIDAS)
// ==========================================

router.delete('/:id', async (req, res) => {
    // Cliente NO puede borrar artistas
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    try {
        await Artista.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al eliminar' }); }
});

router.get('/papelera/all', async (req, res) => {
    // Cliente NO ve la papelera
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    try {
        const artistas = await Artista.find({ isDeleted: true });
        res.json(artistas);
    } catch (err) { res.status(500).json({ error: "Error papelera" }); }
});

router.put('/:id/restaurar', async (req, res) => {
    // Cliente NO puede restaurar
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    try {
        await Artista.findByIdAndUpdate(req.params.id, { isDeleted: false });
        res.json({ message: 'Restaurado' });
    } catch (err) { res.status(500).json({ error: 'Error restaurar' }); }
});

router.delete('/:id/permanente', async (req, res) => {
    // Cliente NO puede borrar permanente
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    try {
        await Artista.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error eliminar permanente' }); }
});

router.delete('/papelera/vaciar', async (req, res) => {
    // Cliente NO puede vaciar papelera
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    try {
        await Artista.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error vaciar' }); }
});

module.exports = router;