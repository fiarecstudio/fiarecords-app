const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista');

// ============================================================
// CONFIGURACIÓN DE CORREO (PUERTO 587 - MÁS COMPATIBLE)
// ============================================================
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // false para 587 (STARTTLS)
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false // Ayuda a evitar errores de certificados en la nube
    }
});

// Verificador
transporter.verify().then(() => {
    console.log('✅ Nodemailer: Listo (Puerto 587)');
}).catch((error) => {
    console.error('❌ Nodemailer Error:', error);
});

// 1. REGISTRO
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, nombre, createArtist } = req.body;

        const userExists = await Usuario.findOne({ $or: [{ username }, { email }] });
        if (userExists) return res.status(400).json({ error: 'Usuario o correo ya existe.' });

        const newUser = new Usuario({
            username, email, password,
            role: 'cliente',
            permisos: ['dashboard', 'historial-proyectos', 'pagos', 'cotizaciones']
        });
        const savedUser = await newUser.save();

        if (createArtist) {
            const newArtista = new Artista({
                nombre: nombre || username,
                nombreArtistico: nombre || username,
                correo: email,
                usuarioId: savedUser._id, // AHORA SÍ SE GUARDARÁ EN EL MODELO NUEVO
                telefono: ''
            });
            await newArtista.save();
        }

        const payload = { id: savedUser._id, username: savedUser.username, role: savedUser.role, permisos: savedUser.permisos };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.status(201).json({ token });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar.' });
    }
});

// 2. LOGIN
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await Usuario.findOne({ username, isDeleted: false });
        if (!user || !(await user.matchPassword(password))) {
            return res.status(400).json({ error: 'Credenciales inválidas.' });
        }
        const payload = { id: user._id, username: user.username, role: user.role, permisos: user.permisos || [] };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '8h' });
        res.json({ token, role: user.role });
    } catch (error) { res.status(500).json({ error: 'Error del servidor' }); }
});

// 3. RECUPERAR PASSWORD
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await Usuario.findOne({ email });
        if (!user) return res.status(404).json({ error: 'No existe cuenta con este correo.' });

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendUrl}/reset-password/${token}`;

        const mailOptions = {
            from: '"Fia Records" <fiarec.studio@gmail.com>',
            to: user.email,
            subject: 'Recuperar Contraseña',
            html: `<h3>Recuperar Contraseña</h3><p>Click aquí:</p><a href="${resetUrl}">Restablecer</a>`
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'Correo enviado.' });

    } catch (error) {
        console.error("Error envío correo:", error);
        res.status(500).json({ error: 'Error al enviar correo.' });
    }
});

// 4. RESET FINAL
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;
        const user = await Usuario.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        if (!user) return res.status(400).json({ error: 'Token inválido o expirado.' });

        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        res.json({ message: 'Contraseña actualizada.' });
    } catch (error) { res.status(500).json({ error: 'Error al restablecer.' }); }
});

module.exports = router;