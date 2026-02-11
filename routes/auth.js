const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista'); // IMPORTANTE: Necesitamos esto para crear el perfil

// POST /api/auth/register (NUEVO: Para que los clientes se registren solos)
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, nombre, createArtist } = req.body;

        // 1. Validar que no exista
        const userExists = await Usuario.findOne({ $or: [{ username }, { email }] });
        if (userExists) {
            return res.status(400).json({ error: 'El usuario o correo ya existe.' });
        }

        // 2. Crear el Usuario (Rol Cliente por defecto)
        const newUser = new Usuario({
            username,
            email,
            password, // El modelo lo encriptará
            role: 'cliente',
            permisos: ['dashboard', 'historial-proyectos', 'pagos', 'cotizaciones'] // Permisos base
        });

        const savedUser = await newUser.save();

        // 3. LOGICA AUTOMÁTICA: Crear Perfil de Artista vinculado
        if (createArtist) {
            const newArtista = new Artista({
                nombre: nombre || username,       // Nombre Real
                nombreArtistico: nombre || username, // Nombre Artístico (inicialmente igual)
                correo: email,
                usuarioId: savedUser._id, // <--- VINCULACIÓN CLAVE
                telefono: ''
            });
            await newArtista.save();
        }

        // 4. Generar Token (Auto-login)
        const payload = {
            id: savedUser._id,
            username: savedUser.username,
            role: savedUser.role,
            permisos: savedUser.permisos
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

        res.status(201).json({ token });

    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ error: 'Error del servidor al registrar.' });
    }
});

// POST /api/auth/login (Ya lo tenías, pero optimizado)
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Buscar usuario activo
        const user = await Usuario.findOne({ username, isDeleted: false });
        if (!user) return res.status(400).json({ error: 'Credenciales inválidas.' });

        // Usar el método del modelo para comparar
        const isMatch = await user.matchPassword(password);
        if (!isMatch) return res.status(400).json({ error: 'Credenciales inválidas.' });

        // Generar Token
        const payload = { 
            id: user._id, 
            username: user.username, 
            role: user.role,
            permisos: user.permisos || []
        };
        
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '8h' });

        res.json({ token, role: user.role });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;