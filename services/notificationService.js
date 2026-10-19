const Empresa = require('../models/Empresa');

const BREVO_TIMEOUT_MS = 10000;
const BREVO_MAX_RETRIES = 2;

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function enviarEmail({ empresaId, destinatario, cc, asunto, cuerpo, replyTo, attachments, headers }) {
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
        to: (Array.isArray(destinatario) ? destinatario : [destinatario])
            .map(email => ({ email })),
        subject: asunto,
        htmlContent: cuerpo
    };
    if (Array.isArray(cc) && cc.length) {
        payload.cc = cc.map(email => ({ email }));
    }

    if (replyTo) {
        payload.replyTo = { email: replyTo };
    }
    if (Array.isArray(attachments) && attachments.length) {
        payload.attachment = attachments.map(({ name, content }) => ({ name, content }));
    }
    if (headers && Object.keys(headers).length) {
        payload.headers = headers;
    }

    const requestBody = JSON.stringify(payload);
    for (let attempt = 0; attempt <= BREVO_MAX_RETRIES; attempt++) {
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), BREVO_TIMEOUT_MS);
        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'api-key': apiKey,
                    'content-type': 'application/json'
                },
                body: requestBody,
                signal: abortController.signal
            });

            if (response.ok) return await response.json();

            let errorBrevo;
            try {
                errorBrevo = await response.json();
            } catch (error) {
                if (response.status >= 500 && attempt < BREVO_MAX_RETRIES) {
                    await wait(500 * (attempt + 1));
                    continue;
                }
                throw new Error(`Brevo rechazó el envío (${response.status} ${response.statusText}) y no devolvió un error JSON válido.`);
            }

            const detalle = errorBrevo?.message
                || errorBrevo?.code
                || JSON.stringify(errorBrevo)
                || 'respuesta sin detalle';
            if (response.status >= 500 && attempt < BREVO_MAX_RETRIES) {
                await wait(500 * (attempt + 1));
                continue;
            }
            throw new Error(`Brevo rechazó el envío (${response.status}): ${detalle}`);
        } catch (error) {
            const isRetryable = error.name === 'AbortError' || error.name === 'TimeoutError'
                || (error instanceof TypeError && !error.message.startsWith('Brevo rechazó el envío'));
            if (!isRetryable || attempt >= BREVO_MAX_RETRIES) {
                if (error.name === 'AbortError' || error.name === 'TimeoutError') {
                    throw new Error(`La solicitud a Brevo excedió el tiempo límite de ${BREVO_TIMEOUT_MS / 1000} segundos.`, { cause: error });
                }
                throw error;
            }
            await wait(500 * (attempt + 1));
        } finally {
            clearTimeout(timeout);
        }
    }
    throw new Error('Brevo no pudo completar el envío tras varios intentos.');
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
