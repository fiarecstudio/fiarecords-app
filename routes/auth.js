const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista');
const { google } = require('googleapis'); // IMPORTANTE: Usamos la librería oficial

// ============================================================
// CONFIGURACIÓN GMAIL API (HTTP PUERTO 443 - NO SMTP)
// ============================================================
const OAuth2 = google.auth.OAuth2;

const createTransporter = async () => {
    const oauth2Client = new OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    return oauth2Client;
};

// Función auxiliar para codificar el mensaje en formato compatible con Gmail
const makeBody = (to, from, subject, message) => {
    const str = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        message
    ].join('\n');

    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// Función de envío directo
const enviarCorreoGmailAPI = async (emailDestino, asunto, htmlContent) => {
    try {
        const authClient = await createTransporter();
        const gmail = google.gmail({ version: 'v1', auth: authClient });

        const rawMessage = makeBody(
            emailDestino,
            `"Soporte Fia Records" <${process.env.EMAIL_USER}>`,
            asunto,
            htmlContent
        );

        await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: rawMessage }
        });
        
        console.log(`✅ Correo enviado a ${emailDestino} vía API (HTTPS)`);
        return true;
    } catch (error) {
        console.error("❌ Error API Gmail:", error.message);
        throw error;
    }
};

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
// 3. RECUPERAR CONTRASEÑA (SOLUCIÓN DEFINITIVA)
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

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendUrl}/reset-password/${token}`;

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
                <h2 style="color: #333;">Recuperación de Contraseña</h2>
                <p>Hola,</p>
                <p>Has solicitado restablecer tu contraseña en Fia Records.</p>
                <div style="margin: 20px 0;">
                    <a href="${resetUrl}" style="background-color: #2563EB; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                        Restablecer Contraseña
                    </a>
                </div>
                <p style="font-size: 12px; color: #666;">Enlace válido por 1 hora.</p>
            </div>
        `;

        console.log("🚀 Enviando correo vía Google API (HTTP)...");
        
        // AQUÍ USAMOS LA NUEVA FUNCIÓN QUE NO SE BLOQUEA
        await enviarCorreoGmailAPI(user.email, "Restablecer Contraseña - Fia Records", htmlContent);
        
        res.json({ message: 'Correo enviado correctamente.' });

    } catch (error) {
        console.error("❌ ERROR CRÍTICO AL ENVIAR:", error);
        res.status(500).json({ error: 'Error al enviar el correo.' });
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

        res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Error al restablecer la contraseña.' }); 
    }
});

module.exports = router;