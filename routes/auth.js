const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista');
const { google } = require('googleapis');

// ============================================================
// CONFIGURACIÓN GMAIL API (HTTP PUERTO 443)
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

// Función auxiliar para codificar caracteres especiales (Corrige la "ñ")
const makeBody = (to, from, subject, message) => {
    const encodedSubject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const str = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: ${encodedSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        message
    ].join('\n');

    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

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
        
        console.log(`✅ Correo enviado a ${emailDestino}`);
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
// 3. RECUPERAR CONTRASEÑA (SOLICITUD)
// ============================================================
router.post('/forgot-password', async (req, res) => {
    console.log("📩 Iniciando solicitud de recuperación...");
    
    try {
        const { email } = req.body;
        const user = await Usuario.findOne({ email });
        
        if (!user) return res.status(404).json({ error: 'No existe cuenta con este correo.' });

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendUrl}/reset-password/${token}`;

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; max-width: 600px; margin: auto;">
                <h2 style="color: #333;">Recuperación de Contraseña</h2>
                <p>Hola,</p>
                <p>Has solicitado restablecer tu contraseña en Fia Records.</p>
                <div style="margin: 30px 0; text-align: center;">
                    <a href="${resetUrl}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                        Restablecer Contraseña
                    </a>
                </div>
                <p style="font-size: 12px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p style="font-size: 12px; color: #2563EB; word-break: break-all;">${resetUrl}</p>
                <p style="font-size: 12px; color: #999; margin-top: 20px;">Enlace válido por 1 hora.</p>
            </div>
        `;

        await enviarCorreoGmailAPI(user.email, "Restablecer Contraseña - Fia Records", htmlContent);
        
        res.json({ message: 'Correo enviado correctamente.' });

    } catch (error) {
        console.error("❌ ERROR:", error);
        res.status(500).json({ error: 'Error al enviar el correo.' });
    }
});

// ============================================================
// 4. RESET PASSWORD FINAL (LÓGICA COMPARTIDA)
// ============================================================

// Función auxiliar para realizar el cambio de contraseña
const procesarResetPassword = async (req, res, token) => {
    try {
        const { newPassword } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Token no proporcionado.' });
        }

        if (!newPassword || newPassword.trim().length === 0) {
            return res.status(400).json({ error: 'La contraseña es obligatoria.' });
        }

        const user = await Usuario.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ error: 'Token inválido o expirado.' });

        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        return res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al restablecer contraseña.' });
    }
};

// RUTA A: Cuando el token viene en la URL (ej: /reset-password/abc12345)
router.post('/reset-password/:token', async (req, res) => {
    return procesarResetPassword(req, res, req.params.token);
});

// RUTA B: Cuando el token viene en el cuerpo (ej: /reset-password) <- ESTA ES LA QUE TE FALTABA
router.post('/reset-password', async (req, res) => {
    return procesarResetPassword(req, res, req.body.token);
});

module.exports = router;