const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista'); 
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs'); 

router.use(auth);

// ==========================================
// OBTENER USUARIOS
// ==========================================
router.get('/', async (req, res) => {
    try {
        const usuarios = await Usuario.find({ isDeleted: false }).select('-password');
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// ==========================================
// CREAR USUARIO
// ==========================================
router.post('/', async (req, res) => {
    try {
        // Desestructuramos artistaId por si lo quieres mandar al crear también
        const { username, email, password, role, permisos, artistaId } = req.body;
        
        // Validar correo único
        if (email) {
            const existeEmail = await Usuario.findOne({ email });
            if (existeEmail) return res.status(400).json({ error: 'El correo ya está en uso' });
        }

        // NOTA: Aquí confiamos en que tu modelo Usuario.js tiene el "pre-save hook" 
        // para encriptar la contraseña automáticamente.
        const nuevoUsuario = new Usuario({ 
            username, 
            email, 
            password, 
            role, 
            permisos,
            artistaId: artistaId || null // Guardamos vínculo si viene
        });
        
        await nuevoUsuario.save();
        res.status(201).json(nuevoUsuario);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al crear usuario' });
    }
});

// ==========================================
// ACTUALIZAR USUARIO (CORREGIDO CON VÍNCULO)
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        // --- CAMBIO CLAVE AQUÍ: Recibimos artistaId ---
        const { username, email, role, permisos, password, artistaId } = req.body;
        const usuarioId = req.params.id;

        // 1. Validar si el email nuevo ya existe (si es que se está cambiando)
        if (email) {
            const emailOcupado = await Usuario.findOne({ email: email, _id: { $ne: usuarioId } });
            if (emailOcupado) {
                return res.status(400).json({ error: 'El correo ya está siendo usado por otro usuario.' });
            }
        }

        // 2. Preparar objeto de actualización DINÁMICO
        let datosActualizar = {};
        if (username) datosActualizar.username = username;
        if (email) datosActualizar.email = email;
        if (role) datosActualizar.role = role;
        if (permisos) datosActualizar.permisos = permisos;
        
        // --- AQUÍ GUARDAMOS EL VÍNCULO MANUAL ---
        // Si nos mandan un artistaId, lo guardamos. Si mandan cadena vacía, lo ponemos null (desvincular)
        if (artistaId !== undefined) {
            datosActualizar.artistaId = artistaId || null;
        }

        // 3. Manejo de Contraseña y Sincronización
        // Al usar findByIdAndUpdate, el pre-save del modelo NO se ejecuta, así que encriptamos manual aquí.
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            // Asignamos la contraseña encriptada al usuario
            datosActualizar.password = hashedPassword;

            // --- SINCRONIZACIÓN HACIA ARTISTA (OPCIONAL) ---
            // Solo si quieres que al cambiar la clave del usuario, cambie en el Artista (si Artista tuviera login propio)
            // Si Artista no usa password para login, puedes borrar este bloque if/else.
            /* if (email) {
                 await Artista.updateMany(
                    { correo: email }, 
                    { password: hashedPassword }
                );
            } else {
                const usuarioActual = await Usuario.findById(usuarioId);
                if(usuarioActual) {
                    await Artista.updateMany(
                        { correo: usuarioActual.email }, 
                        { password: hashedPassword }
                    );
                }
            }
            */
            console.log(">> Contraseña actualizada.");
        }

        // 4. Actualizar Usuario
        const usuarioActualizado = await Usuario.findByIdAndUpdate(
            usuarioId,
            { $set: datosActualizar }, // Usamos $set para ser explícitos
            { new: true }
        ).select('-password');

        res.json(usuarioActualizado);

    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Error al actualizar usuario' });
    }
});

// ==========================================
// ELIMINAR (Soft Delete)
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: 'Error al eliminar' }); }
});

module.exports = router;