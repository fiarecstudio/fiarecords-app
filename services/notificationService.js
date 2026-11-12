const Empresa = require('../models/Empresa');

const BREVO_TIMEOUT_MS = 10000;
const BREVO_MAX_RETRIES = 2;

const FIRMA_HTML = `<br><br>
<div style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.4; color: #333333; margin-top: 20px;">
  <strong>ERICK RESENDIZ</strong><br>
  <span style="color: #d4af37;"><strong>Agente de Seguros | EME ASESORES</strong></span><br>
  📱 <strong>Tel / WhatsApp:</strong> <a href="tel:+528115851732" style="color: #0056b3; text-decoration: none;">+52 81 1585 1732</a><br>
  ✉️ <strong>Correo:</strong> <a href="mailto:cobranza@masesores.mx" style="color: #0056b3; text-decoration: none;">cobranza@masesores.mx</a><br>
  🛡️ <strong>Ramos:</strong> Auto | Vida | Gastos Médicos | Flotillas<br><br>
  
  <div style="font-size: 10px; color: #777777; line-height: 1.2; text-align: justify;">
    <strong>AVISO DE CONFIDENCIALIDAD:</strong> Este mensaje y sus archivos adjuntos contienen información confidencial dirigida exclusivamente a su destinatario. Si no es el destinatario legítimo, queda prohibido su uso, copia o distribución. Si lo recibió por error, notifique al remitente y elimínelo.<br><br>
    <strong>PROTECCIÓN DE DATOS PERSONALES:</strong> En cumplimiento con la LFPDPPP, <strong>EME ASESORES</strong> trata sus datos únicamente para cotización, emisión, cobro y atención de pólizas de seguros. Solicite el Aviso de Privacidad Integral respondiendo a este correo o escribiendo a <a href="mailto:cobranza@masesores.mx" style="color: #0056b3; text-decoration: none;">cobranza@masesores.mx</a>.
  </div>
</div>`;

function agregarFirmaCorreo(cuerpo) {
    const html = String(cuerpo || '');
    if (html.includes('<strong>ERICK RESENDIZ</strong>')) return html;
    return /<\/body\s*>/i.test(html)
        ? html.replace(/<\/body\s*>/i, `${FIRMA_HTML}</body>`)
        : `${html}${FIRMA_HTML}`;
}

function normalizarAdjuntos(attachments) {
    if (!Array.isArray(attachments) || !attachments.length) return [];
    return attachments.map(attachment => {
        const name = typeof attachment?.name === 'string'
            ? attachment.name.trim().replace(/[\\/]/g, '_').slice(0, 255)
            : '';
        const rawContent = Buffer.isBuffer(attachment?.content)
            ? attachment.content.toString('base64')
            : attachment?.content;
        const content = typeof rawContent === 'string'
            ? rawContent.replace(/^data:[^;]+;base64,/i, '')
            : '';
        if (!name || !content || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) {
            throw new Error('El adjunto de correo no tiene un nombre o contenido Base64 válido.');
        }
        return { name, content };
    });
}

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
        htmlContent: agregarFirmaCorreo(cuerpo)
    };
    if (Array.isArray(cc) && cc.length) {
        payload.cc = cc.map(email => ({ email }));
    }

    if (replyTo) {
        payload.replyTo = { email: replyTo };
    }
    const adjuntosNormalizados = normalizarAdjuntos(attachments);
    if (adjuntosNormalizados.length) {
        payload.attachment = adjuntosNormalizados;
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

module.exports = { enviarEmail, enviarWhatsApp, agregarFirmaCorreo };
