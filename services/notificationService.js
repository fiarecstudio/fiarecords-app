const nodemailer = require('nodemailer');
const Empresa = require('../models/Empresa');

async function obtenerTransportadorSMTP(empresaId) {
    try {
        const empresa = await Empresa.findById(empresaId);
        
        // Prioridad 1: Usar configuración SMTP específica de la empresa (desde el menú de configuración)
        if (empresa && empresa.notificaciones?.email?.enabled && empresa.notificaciones.email.smtpHost) {
            const config = empresa.notificaciones.email;
            console.log(`[NotificationService] Usando configuración SMTP de empresa: ${empresa.nombre}`);
            return nodemailer.createTransport({
                host: config.smtpHost,
                port: config.smtpPort || 587,
                secure: config.smtpPort === 465,
                auth: {
                    user: config.smtpUser,
                    pass: config.smtpPass
                }
            });
        }
        
        // Prioridad 2: Usar variables de entorno globales (fallback)
        if (process.env.SMTP_HOST) {
            console.log(`[NotificationService] Usando configuración SMTP global (.env)`);
            return nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_PORT === '465',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        }
        
        console.warn(`[NotificationService] No hay configuración SMTP disponible para empresa ${empresaId}`);
        return null;
    } catch (error) {
        console.error('[NotificationService] Error al inicializar SMTP para empresa:', empresaId, error.message);
        return null;
    }
}

async function enviarEmail({ empresaId, destinatario, asunto, cuerpo }) {
    const transporter = await obtenerTransportadorSMTP(empresaId);
    if (!transporter) throw new Error('No se pudo configurar un servicio de correo. Configura SMTP desde el menú de configuración.');
    
    const empresa = await Empresa.findById(empresaId);
    const remitente = empresa?.notificaciones?.email?.smtpUser || process.env.SMTP_USER || process.env.EMAIL_USER || 'Alertas Seguros';
    
    const mailOptions = {
        from: `"Alertas Seguros" <${remitente}>`,
        to: destinatario,
        subject: asunto,
        html: cuerpo
    };
    
    return await transporter.sendMail(mailOptions);
}

async function enviarWhatsApp({ empresaId, destinatario, mensaje }) {
    const empresa = await Empresa.findById(empresaId);
    console.log(`\n--- [WHATSAPP WEB] ---`);
    console.log(`Empresa ID: ${empresaId} (${empresa?.nombre || 'Desconocida'})`);
    console.log(`Destinatario: ${destinatario}`);
    console.log(`Mensaje: ${mensaje}`);
    console.log(`-----------------------\n`);
    
    // Generar URL de WhatsApp Web
    const mensajeCodificado = encodeURIComponent(mensaje);
    const whatsappUrl = `https://wa.me/${destinatario}?text=${mensajeCodificado}`;
    
    return { 
        success: true, 
        provider: 'whatsapp_web',
        url: whatsappUrl,
        mensaje,
        destinatario
    };
}

module.exports = { enviarEmail, enviarWhatsApp };
