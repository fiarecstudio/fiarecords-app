const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista');

// ============================================================
// CONFIGURACIÓN DE CORREO CORREGIDA (SOLUCIÓN ERROR IPV6)
// ============================================================
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',   // Host explícito de Gmail
    port: 465,                // Puerto seguro SSL
    secure: true,             // Usar SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // ESTA LÍNEA SOLUCIONA EL ERROR "ENETUNREACH":
    family: 4,                // Fuerza a Node.js a usar IPv4 en lugar de IPv6
});

// Verificación de conexión en los Logs
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ ERROR CRÍTICO AL CONECTAR CON GMAIL:', error);
    } else {
        console.log('✅ CONEXIÓN EXITOSA CON GMAIL (IPv4). Listo para enviar.');
    }
});

// ============================================================
// 1. REGISTRO
// ============================================================
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
                usuarioId: savedUser._id,
                telefono: ''
            });
            await newArtista.save();
        }

        const token = jwt.sign({ id: savedUser._id, role: savedUser.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.status(201).json({ token });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar.' });
    }
});

// ============================================================
// 2. LOGIN
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await Usuario.findOne({ username, isDeleted: false });
        
        if (!user || !(await user.matchPassword(password))) {
            return res.status(400).json({ error: 'Credenciales inválidas.' });
        }

        const token = jwt.sign({ 
            id: user._id, 
            username: user.username, 
            role: user.role,
            permisos: user.permisos || []
        }, process.env.JWT_SECRET || 'secret', { expiresIn: '8h' });

        res.json({ token, role: user.role });
    } catch (error) { res.status(500).json({ error: 'Error del servidor' }); }
});

// ============================================================
// 3. RECUPERAR CONTRASEÑA
// ============================================================
router.post('/forgot-password', async (req, res) => {
    console.log("📩 Iniciando solicitud de recuperación...");
    
    try {
        const { email } = req.body;
        const user = await Usuario.findOne({ email });
        
        if (!user) {
            console.log("❌ Usuario no encontrado: " + email);
            return res.status(404).json({ error: 'No existe cuenta con este correo.' });
        }

        // Generar Token
        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
        await user.save();

        // Asegúrate de que FRONTEND_URL no tenga slash al final en tus env vars, o ajusta aquí
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendUrl}/reset-password/${token}`;

        const mailOptions = {
            from: '"Soporte Fia Records" <fiarec.studio@gmail.com>',
            to: user.email,
            subject: 'Recuperar Contraseña',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h3>Recupera tu acceso</h3>
                    <p>Has solicitado restablecer tu contraseña.</p>
                    <p>Da clic en el siguiente enlace (válido por 1 hora):</p>
                    <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
                    <p style="margin-top: 20px; font-size: 12px; color: #777;">Si no solicitaste esto, ignora este correo.</p>
                </div>
            `
        };

        console.log("🚀 Intentando enviar correo a Gmail (vía IPv4)...");
        
        // Enviar
        await transporter.sendMail(mailOptions);
        
        console.log("✅ Correo enviado con éxito.");
        res.json({ message: 'Correo enviado correctamente.' });

    } catch (error) {
        console.error("❌ ERROR AL ENVIAR EL CORREO:", error);
        res.status(500).json({ error: 'Error enviando correo: ' + error.message });
    }
});

// ============================================================
// 4. RESET PASSWORD FINAL
// ============================================================
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { newPassword } = req.body;
        const user = await Usuario.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ error: 'Token inválido o expirado.' });

        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save(); // Aquí se ejecuta el pre-save del modelo para hashear el password

        res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Error al restablecer la contraseña.' }); 
    }
});

module.exports = router;