const Empresa = require('../models/Empresa');

async function enviarEmail({ empresaId, destinatario, asunto, cuerpo }) {
    const empresa = await Empresa.findById(empresaId);
    const configEmpresa = empresa?.notificaciones?.email;
    const config = configEmpresa?.enabled ? configEmpresa : {};
    const apiKey = config.smtpPass || process.env.SMTP_PASS || process.env.BREVO_API_KEY;

    if (!apiKey) {
        throw new Error('No se configuró la API key de Brevo. Configúrala en las notificaciones de la empresa o en BREVO_API_KEY.');
    }

    const payload = {
        sender: {
            name: config.senderName || 'M Asesores',
            email: config.smtpUser || process.env.SMTP_USER || 'cobranza@masesores.mx'
        },
        to: [{ email: destinatario }],
        subject: asunto,
        htmlContent: cuerpo
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let errorBrevo;
        try {
            errorBrevo = await response.json();
        } catch (error) {
            throw new Error(`Brevo rechazó el envío (${response.status} ${response.statusText}) y no devolvió un error JSON válido.`);
        }

        const detalle = errorBrevo?.message
            || errorBrevo?.code
            || JSON.stringify(errorBrevo)
            || 'respuesta sin detalle';
        throw new Error(`Brevo rechazó el envío (${response.status}): ${detalle}`);
    }

    return response.json();
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
