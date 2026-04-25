// ==========================================
// ARCHIVO: routes/auth.js (COMPLETO Y CORREGIDO)
// ==========================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs'); // Necesario para la comparación manual en login
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista');
const { google } = require('googleapis');

// PASO 4: Importar middleware de validación y esquemas Joi
const { validate } = require('../middleware/validate');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} = require('../validations/auth.validation');

// ============================================================
// CONFIGURACIÓN GMAIL API
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

// Función auxiliar para codificar caracteres especiales
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
        throw error; // Propagamos el error para manejarlo en la ruta
    }
};

// ============================================================
// 1. REGISTRO
// ============================================================
// PASO 4: Validación con Joi antes de procesar
router.post('/register', validate(registerSchema), async (req, res) => {
    try {
        const { username, email, password, nombre, createArtist } = req.body;
        
        // Validar si existe
        const userExists = await Usuario.findOne({ $or: [{ username }, { email }] });
        if (userExists) return res.status(400).json({ error: 'Usuario o correo ya existe.' });

        // Crear Usuario
        const newUser = new Usuario({
            username, email, password,
            role: 'cliente',
            permisos: ['dashboard', 'historial-proyectos', 'pagos', 'cotizaciones']
        });
        const savedUser = await newUser.save();

        // Crear Artista opcionalmente
        if (createArtist) {
            const newArtista = new Artista({
                nombre: nombre || username,
                nombreArtistico: nombre || username,
                correo: email,
                usuarioId: savedUser._id, // Vinculamos en el Artista
                telefono: ''
            });
            const savedArtista = await newArtista.save();
            
            // Opcional: Actualizamos el usuario con el ID del artista recién creado para consistencia
            savedUser.artistaId = savedArtista._id;
            await savedUser.save();
        }

        // PASO 7: Generar Tokens para el nuevo usuario
        // Access Token: 15 minutos
        const accessToken = jwt.sign({
            id: savedUser._id,
            role: savedUser.role,
            // --- FASE 2: MULTI-TENANT - CONTEXTO DE SESIÓN ---
            empresaId: savedUser.empresaId ? savedUser.empresaId.toString() : null,
            isSuperAdmin: savedUser.isSuperAdmin || false
            // -------------------------------------------------
        }, process.env.JWT_SECRET, { expiresIn: '15m' });

        // Refresh Token: 7 días
        const refreshToken = jwt.sign({
            id: savedUser._id,
            type: 'refresh'
        }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '7d' });

        // Guardar refreshToken en BD
        const refreshTokenHash = require('crypto')
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex');
        
        savedUser.refreshToken = refreshTokenHash;
        savedUser.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await savedUser.save();

        res.status(201).json({
            accessToken,
            refreshToken,
            role: savedUser.role,
            expiresIn: 900
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar.' });
    }
});

// ============================================================
// 2. LOGIN (CON LÓGICA DE PRIORIDAD MANUAL)
// ============================================================
// PASO 4: Validación con Joi antes de procesar
router.post('/login', validate(loginSchema), async (req, res) => {
    try {
        const { username, password } = req.body;

        // A. Buscar usuario por username O email
        const user = await Usuario.findOne({ 
            $or: [{ username: username }, { email: username }],
            isDeleted: false 
        });
        
        // B. Validar contraseña
        if (!user) return res.status(400).json({ error: 'Usuario no encontrado.' });

        let isMatch = false;
        if (user.matchPassword) {
            isMatch = await user.matchPassword(password);
        } else {
            isMatch = await bcrypt.compare(password, user.password);
        }

        if (!isMatch) return res.status(400).json({ error: 'Contraseña incorrecta.' });

        // C. --- BÚSQUEDA DE ARTISTA VINCULADO ---
        let artistaId = null;
        let artistaVinculado = null;

        // 1. PRIORIDAD MÁXIMA: Vínculo Manual en el Usuario (lo que agregamos en models/Usuario.js)
        if (user.artistaId) {
            artistaVinculado = await Artista.findById(user.artistaId);
            if (artistaVinculado) {
                console.log(`>> Login: Usando vínculo MANUAL: Usuario ${user.username} -> Artista ${artistaVinculado.nombre}`);
            }
        }

        // 2. Si no hay vínculo manual, buscamos si el Artista tiene guardado el usuarioId (Legacy)
        if (!artistaVinculado) {
            artistaVinculado = await Artista.findOne({ usuarioId: user._id });
        }

        // 3. Si sigue sin encontrar, intentamos Autodetectar por CORREO y vinculamos
        if (!artistaVinculado && user.email) {
            artistaVinculado = await Artista.findOne({ correo: user.email });
            if (artistaVinculado) {
                console.log(`>> Login: Auto-vinculando por CORREO.`);
                // Guardamos la relación en AMBOS lados para el futuro
                artistaVinculado.usuarioId = user._id;
                await artistaVinculado.save();
                user.artistaId = artistaVinculado._id;
                await user.save();
            }
        }

        // 4. Si sigue sin encontrar, intentamos Autodetectar por NOMBRE (username)
        if (!artistaVinculado) {
             artistaVinculado = await Artista.findOne({ 
                nombre: { $regex: new RegExp(`^${user.username}$`, 'i') } 
             });
             if (artistaVinculado) {
                 console.log(`>> Login: Auto-vinculando por NOMBRE.`);
                 artistaVinculado.usuarioId = user._id;
                 await artistaVinculado.save();
                 user.artistaId = artistaVinculado._id;
                 await user.save();
             }
        }

        if (artistaVinculado) {
            artistaId = artistaVinculado._id;
        }

        // D. Generar Tokens (PASO 7: Rotación de Tokens)
        // Access Token: 15 minutos (corto para seguridad)
        const accessToken = jwt.sign({
            id: user._id,
            username: user.username,
            role: user.role,
            permisos: user.permisos || [],
            artistaId: artistaId,
            nombre: artistaVinculado ? (artistaVinculado.nombreArtistico || artistaVinculado.nombre) : user.username,
            // --- FASE 2: MULTI-TENANT - CONTEXTO DE SESIÓN ---
            empresaId: user.empresaId ? user.empresaId.toString() : null,
            isSuperAdmin: user.isSuperAdmin || false
            // -------------------------------------------------
        }, process.env.JWT_SECRET, { expiresIn: '15m' });

        // Refresh Token: 7 días (largo para mantener sesión)
        const refreshToken = jwt.sign({
            id: user._id,
            type: 'refresh'
        }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '7d' });

        // Guardar refreshToken en BD (hashed para seguridad)
        const refreshTokenHash = require('crypto')
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex');
        
        user.refreshToken = refreshTokenHash;
        user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
        await user.save();

        res.json({
            accessToken,
            refreshToken,
            role: user.role,
            expiresIn: 900 // 15 minutos en segundos
        });

    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Error del servidor' }); 
    }
});

// ============================================================
// 3. RECUPERAR CONTRASEÑA (SOLICITUD)
// ============================================================
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
    console.log(" Iniciando solicitud de recuperación...");
    
    try {
        const { email } = req.body;
        const user = await Usuario.findOne({ email });
        
        if (!user) return res.status(404).json({ error: 'No existe cuenta con este correo.' });

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'; 
        const cleanFrontendUrl = frontendUrl.replace(/\/$/, ''); 
        const resetUrl = `${cleanFrontendUrl}/reset-password/${token}`;

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
        console.error(" ERROR:", error);
        res.status(500).json({ error: 'Error al enviar el correo.' });
    }
});

// ============================================================
// 4. RESET PASSWORD FINAL
// ============================================================
const procesarResetPassword = async (req, res, token) => {
    try {
        const { newPassword } = req.body;

        if (!token) return res.status(400).json({ error: 'Token no proporcionado.' });
        if (!newPassword || newPassword.trim().length === 0) return res.status(400).json({ error: 'La contraseña es obligatoria.' });

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

router.post('/reset-password/:token', async (req, res) => {
    return procesarResetPassword(req, res, req.params.token);
});

router.post('/reset-password', async (req, res) => {
    return procesarResetPassword(req, res, req.body.token);
});

// ============================================================
// PASO 7: ENDPOINT DE RENOVACIÓN DE ACCESS TOKEN
// ============================================================
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token requerido' });
        }

        // Verificar el refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
        } catch (err) {
            return res.status(403).json({ error: 'Refresh token inválido o expirado' });
        }

        // Buscar usuario y verificar que el token coincida con el de BD (hashed)
        const refreshTokenHash = require('crypto')
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex');

        const user = await Usuario.findOne({
            _id: decoded.id,
            refreshToken: refreshTokenHash,
            refreshTokenExpires: { $gt: Date.now() },
            isDeleted: false
        });

        if (!user) {
            return res.status(403).json({ error: 'Refresh token no válido o revocado' });
        }

        // Buscar artista vinculado para incluir en el nuevo token
        let artistaId = null;
        let artistaVinculado = null;
        
        if (user.artistaId) {
            artistaVinculado = await Artista.findById(user.artistaId);
        }
        if (!artistaVinculado) {
            artistaVinculado = await Artista.findOne({ usuarioId: user._id });
        }
        if (artistaVinculado) {
            artistaId = artistaVinculado._id;
        }

        // Generar NUEVO Access Token (15 minutos)
        const newAccessToken = jwt.sign({
            id: user._id,
            username: user.username,
            role: user.role,
            permisos: user.permisos || [],
            artistaId: artistaId,
            nombre: artistaVinculado ? (artistaVinculado.nombreArtistico || artistaVinculado.nombre) : user.username,
            empresaId: user.empresaId ? user.empresaId.toString() : null,
            isSuperAdmin: user.isSuperAdmin || false
        }, process.env.JWT_SECRET, { expiresIn: '15m' });

        res.json({
            accessToken: newAccessToken,
            expiresIn: 900 // 15 minutos en segundos
        });

    } catch (error) {
        console.error('[POST /refresh] Error:', error);
        res.status(500).json({ error: 'Error al renovar token' });
    }
});

// ============================================================
// PASO 7: LOGOUT SEGURO - INVALIDA REFRESH TOKEN
// ============================================================
const auth = require('../middleware/auth');

router.post('/logout', auth, async (req, res) => {
    try {
        // Limpiar el refreshToken del usuario actual
        const user = await Usuario.findById(req.user.id);
        if (user) {
            user.refreshToken = null;
            user.refreshTokenExpires = null;
            await user.save();
        }

        res.json({ message: 'Sesión cerrada correctamente' });
    } catch (error) {
        console.error('[POST /logout] Error:', error);
        res.status(500).json({ error: 'Error al cerrar sesión' });
    }
});

module.exports = router;