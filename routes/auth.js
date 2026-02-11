const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Necesario para tokens
const nodemailer = require('nodemailer'); // Necesario para enviar correos
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista');

// ============================================================
// CONFIGURACIÓN DEL CORREO (NODEMAILER)
// ============================================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ============================================================
// 1. REGISTRO (POST /api/auth/register)
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, nombre, createArtist } = req.body;

        const userExists = await Usuario.findOne({ $or: [{ username }, { email }] });
        if (userExists) {
            return res.status(400).json({ error: 'El usuario o correo ya existe.' });
        }

        const newUser = new Usuario({
            username,
            email,
            password,
            role: 'cliente',
            permisos: ['dashboard', 'historial-proyectos', 'pagos', 'cotizaciones']
        });

        const savedUser = await newUser.save();

        if (createArtist) {
            const newArtista = new Artista({
                nombre: nombre || username,
                nombreArtistico: nombre || username,
                correo: email,
                usuarioId: savedUser._id,
                telefono: ''
            });
            await newArtista.save();
        }

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

// ============================================================
// 2. LOGIN (POST /api/auth/login)
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await Usuario.findOne({ username, isDeleted: false });
        if (!user) return res.status(400).json({ error: 'Credenciales inválidas.' });

        const isMatch = await user.matchPassword(password);
        if (!isMatch) return res.status(400).json({ error: 'Credenciales inválidas.' });

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

// ============================================================
// 3. RECUPERAR CONTRASEÑA (POST /api/auth/forgot-password)
// ============================================================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await Usuario.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'No existe una cuenta con este correo.' });
        }

        // Generar Token
        const token = crypto.randomBytes(20).toString('hex');
        
        // Guardar Token en BD (1 hora de validez)
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        // Crear Link
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendUrl}/reset-password/${token}`;

        // Enviar Correo
        const mailOptions = {
            from: '"Soporte Fia Records" <fiarec.studio@gmail.com>',
            to: user.email,
            subject: 'Recuperación de Contraseña - Fia Records',
            html: `
                <h3>Recuperación de Contraseña</h3>
                <p>Hola ${user.username}, haz clic abajo para cambiar tu contraseña:</p>
                <a href="${resetUrl}" style="background:#4F46E5; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Cambiar Contraseña</a>
                <p>El enlace expira en 1 hora.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        
        res.json({ message: 'Correo enviado correctamente.' });

    } catch (error) {
        console.error("Error enviando correo:", error);
        res.status(500).json({ error: 'Error al enviar el correo.' });
    }
});

// ============================================================
// 4. RESTABLECER FINAL (POST /api/auth/reset-password/:token)
// ============================================================
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;

        const user = await Usuario.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'El enlace es inválido o ha expirado.' });
        }

        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save();

        res.json({ message: 'Contraseña actualizada correctamente.' });

    } catch (error) {
        console.error("Error reset password:", error);
        res.status(500).json({ error: 'Error al restablecer contraseña.' });
    }
});

module.exports = router;