const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista');

// ============================================================
// CONFIGURACIÓN DEL CORREO (MODO SEGURO SSL)
// ============================================================
// Esta configuración es más compatible con servidores como Render
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // true para 465, false para otros puertos
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verificación de conexión al iniciar (Te avisará en los logs de Render si conecta bien)
transporter.verify().then(() => {
    console.log('✅ Nodemailer: Listo para enviar correos');
}).catch((error) => {
    console.error('❌ Nodemailer Error:', error);
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

        // 1. Verificar usuario
        const user = await Usuario.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'No existe una cuenta con este correo.' });
        }

        // 2. Generar Token
        const token = crypto.randomBytes(20).toString('hex');
        
        // 3. Guardar Token (1 hora)
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        // 4. Link
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendUrl}/reset-password/${token}`;

        // 5. Enviar Correo
        const mailOptions = {
            from: '"Soporte Fia Records" <fiarec.studio@gmail.com>',
            to: user.email,
            subject: 'Recuperación de Contraseña - Fia Records',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #4F46E5;">Recuperación de Contraseña</h2>
                    <p>Hola <strong>${user.username}</strong>,</p>
                    <p>Has solicitado restablecer tu contraseña.</p>
                    <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 10px;">Restablecer Contraseña</a>
                    <br><br>
                    <p style="font-size: 12px; color: #777;">El enlace expira en 1 hora.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        
        res.json({ message: 'Correo enviado correctamente.' });

    } catch (error) {
        console.error("Error enviando correo:", error);
        res.status(500).json({ error: 'Error al enviar el correo. Revisa los logs del servidor.' });
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