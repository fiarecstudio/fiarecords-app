const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const Empresa = require('../models/Empresa');
const { enviarEmail } = require('../services/notificationService');

const MAX_INBOX_MESSAGES = 30;

function getImapConfig() {
    const { IMAP_HOST, IMAP_USER, IMAP_PASS } = process.env;
    const port = Number(process.env.IMAP_PORT || 993);

    if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
        throw new Error('Configura IMAP_HOST, IMAP_USER e IMAP_PASS para consultar la bandeja.');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('IMAP_PORT debe ser un puerto válido.');
    }

    return {
        imap: {
            user: IMAP_USER,
            password: IMAP_PASS,
            host: IMAP_HOST,
            port,
            tls: true,
            authTimeout: 10000,
            tlsOptions: { servername: IMAP_HOST }
        }
    };
}

function buscarUids(connection) {
    return new Promise((resolve, reject) => {
        connection.imap.search(['ALL'], (error, uids) => {
            if (error) return reject(error);
            resolve(uids);
        });
    });
}

function getTextPart(message) {
    return message.parts.find(part => part.which === '');
}

async function getInbox(req, res) {
    let connection;
    try {
        const config = getImapConfig();
        connection = await imaps.connect(config);
        connection.on('error', error => {
            console.error('[BandejaEntrada] Error de conexión IMAP:', error);
        });
        await connection.openBox('INBOX');

        const uids = await buscarUids(connection);
        const latestUids = uids.slice(-MAX_INBOX_MESSAGES).reverse();
        if (latestUids.length === 0) return res.json({ success: true, emails: [] });

        const messages = await connection.search(
            [['UID', latestUids.join(',')]],
            { bodies: [''], markSeen: false }
        );

        const emails = await Promise.all(messages.map(async message => {
            const sourcePart = getTextPart(message);
            if (!sourcePart) {
                throw new Error(`No se pudo obtener el contenido del correo UID ${message.attributes.uid}.`);
            }
            const rawEmail = sourcePart.body;
            const parsed = await simpleParser(rawEmail);
            const plainText = (parsed.text || '')
                .replace(/\s+/g, ' ')
                .trim();

            return {
                id: String(message.attributes.uid),
                from: parsed.from?.text || '',
                fromEmail: parsed.from?.value?.[0]?.address || '',
                subject: parsed.subject || '(Sin asunto)',
                date: parsed.date || null,
                snippet: plainText.slice(0, 240),
                text: parsed.text || plainText
            };
        }));

        emails.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        return res.json({ success: true, emails });
    } catch (error) {
        console.error('[BandejaEntrada] Error al consultar INBOX:', error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503 : 502;
        return res.status(status).json({
            success: false,
            error: status === 503 ? error.message : 'No fue posible consultar la bandeja IMAP.'
        });
    } finally {
        if (connection) connection.end();
    }
}

function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[character]));
}

async function replyEmail(req, res) {
    const destinatario = typeof req.body.destinatario === 'string' ? req.body.destinatario.trim() : '';
    const asuntoOriginal = typeof req.body.asunto === 'string' ? req.body.asunto.trim() : '';
    const mensaje = typeof req.body.mensaje === 'string' ? req.body.mensaje.trim() : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario) || !asuntoOriginal || !mensaje) {
        return res.status(400).json({
            success: false,
            error: 'Indica un destinatario válido, asunto y mensaje.'
        });
    }

    try {
        const empresaId = req.tenantFilter?.empresaId || req.user.empresaId || null;
        const empresa = empresaId ? await Empresa.findById(empresaId) : null;
        const replyTo = process.env.IMAP_USER || empresa?.email;
        if (!replyTo) {
            return res.status(503).json({
                success: false,
                error: 'Configura IMAP_USER o el correo de la empresa para recibir respuestas.'
            });
        }

        const asunto = /^re:/i.test(asuntoOriginal) ? asuntoOriginal : `Re: ${asuntoOriginal}`;
        const cuerpo = `<p>${escapeHtml(mensaje).replace(/\r?\n/g, '<br>')}</p>`;
        await enviarEmail({
            empresaId,
            destinatario,
            asunto,
            cuerpo,
            replyTo
        });

        return res.json({ success: true, message: 'Respuesta enviada correctamente.' });
    } catch (error) {
        console.error('[BandejaEntrada] Error al enviar respuesta con Brevo:', error);
        return res.status(502).json({
            success: false,
            error: 'Brevo no pudo enviar la respuesta.'
        });
    }
}

module.exports = { getInbox, replyEmail };
