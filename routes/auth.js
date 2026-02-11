const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista');

// ============================================================
// CONFIGURACIÓN DE CORREO (MODO "A PRUEBA DE FALLOS")
// ============================================================
const transporter = nodemailer.createTransport({
    service: 'gmail', // Usar el servicio predefinido de Gmail facilita las cosas
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/* NOTA: Si el de arriba falla, probaremos esta configuración manual:
   host: "smtp.googlemail.com", // Servidor alternativo de Google
   port: 465,
   secure: true,
   auth: { ... },
   tls: { rejectUnauthorized: false }
*/

// Verificación de conexión en los Logs
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ ERROR CRÍTICO AL CONECTAR CON GMAIL:', error);
    } else {
        console.log('✅ CONEXIÓN EXITOSA CON GMAIL. Listo para enviar.');
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
// 3. RECUPERAR CONTRASEÑA (CON LOGS DE DEPURACIÓN)
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
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${token}`;

        const mailOptions = {
            from: '"Soporte Fia Records" <fiarec.studio@gmail.com>',
            to: user.email,
            subject: 'Recuperar Contraseña',
            html: `<h3>Recupera tu acceso</h3><p>Da clic aquí para crear una nueva contraseña:</p><a href="${resetUrl}">Restablecer Contraseña</a>`
        };

        console.log("🚀 Intentando enviar correo a Gmail...");
        
        // Enviar
        await transporter.sendMail(mailOptions);
        
        console.log("✅ Correo enviado con éxito.");
        res.json({ message: 'Correo enviado correctamente.' });

    } catch (error) {
        console.error("❌ ERROR AL ENVIAR EL CORREO:", error);
        // IMPORTANTE: Devolvemos el error exacto para verlo en el frontend si falla
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
        await user.save();

        res.json({ message: 'Contraseña actualizada.' });
    } catch (error) { res.status(500).json({ error: 'Error al restablecer.' }); }
});

module.exports = router;