const nodemailer = require('nodemailer');
const Empresa = require('../models/Empresa');

async function obtenerTransportadorSMTP(empresaId) {
    try {
        const empresa = await Empresa.findById(empresaId);
        
        const configEmpresa = empresa?.notificaciones?.email;
        const usaConfigEmpresa = Boolean(configEmpresa?.enabled && configEmpresa.smtpHost);

        if (!usaConfigEmpresa && !process.env.SMTP_HOST) {
            console.warn(`[NotificationService] No hay configuración SMTP disponible para empresa ${empresaId}`);
            return null;
        }

        if (usaConfigEmpresa) {
            console.log(`[NotificationService] Usando configuración SMTP de empresa: ${empresa.nombre}`);
        } else {
            console.log(`[NotificationService] Usando configuración SMTP global (.env)`);
        }

        const config = usaConfigEmpresa ? configEmpresa : {};
        const puertoSMTP = Number(config.smtpPort) || Number(process.env.SMTP_PORT) || 587;

        return nodemailer.createTransport({
            host: config.smtpHost || process.env.SMTP_HOST,
            port: puertoSMTP,
            secure: puertoSMTP === 465,
            auth: {
                user: config.smtpUser || process.env.SMTP_USER,
                pass: config.smtpPass || process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000
        });
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
