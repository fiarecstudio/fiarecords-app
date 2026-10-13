const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const Empresa = require('../models/Empresa');
const { enviarEmail } = require('../services/notificationService');

const MAX_INBOX_MESSAGES = 50;

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

function decodeHtmlEntities(value) {
    return value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (match, code) => {
            const point = Number(code);
            return point <= 0x10ffff ? String.fromCodePoint(point) : match;
        })
        .replace(/&#x([a-f\d]+);/gi, (match, code) => {
            const point = parseInt(code, 16);
            return point <= 0x10ffff ? String.fromCodePoint(point) : match;
        });
}

function cleanSnippet(text, html) {
    const source = text || String(html || '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]*>/g, ' ');
    const lines = decodeHtmlEntities(source)
        .replace(/<https?:\/\/([^>]+)>/gi, 'https://$1')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200D\uFEFF]/g, ' ')
        .split(/\r?\n+/)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(line => line && !/(?:^|[\s-])(?:confidentiality notice|confidential|disclaimer|unsubscribe|privacy policy|aviso de confidencialidad|aviso de privacidad|cancelar suscripci[oó]n)(?:$|[\s:.-])/i.test(line));
    return lines.join(' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function htmlWithInlineAttachments(parsed) {
    if (typeof parsed.html !== 'string') return '';
    const inlineAttachments = new Map((parsed.attachments || [])
        .filter(attachment => attachment.cid && attachment.content)
        .map(attachment => [
            attachment.cid.replace(/^<|>$/g, '').toLowerCase(),
            `data:${attachment.contentType || 'application/octet-stream'};base64,${attachment.content.toString('base64')}`
        ]));
    return parsed.html.replace(/cid:([^"'\s)>]+)/gi, (match, cid) => {
        let normalizedCid = cid;
        try {
            normalizedCid = decodeURIComponent(cid);
        } catch (error) {
            normalizedCid = cid;
        }
        return inlineAttachments.get(normalizedCid.replace(/^<|>$/g, '').toLowerCase()) || match;
    });
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

        const uids = (await buscarUids(connection)).sort((a, b) => a - b);
        const latestUids = uids.slice(-MAX_INBOX_MESSAGES);
        if (latestUids.length === 0) return res.json({ success: true, emails: [] });

        const messages = await connection.search(
            [['UID', `${latestUids[0]}:${latestUids[latestUids.length - 1]}`]],
            { bodies: [''], markSeen: false }
        );

        const emails = await Promise.all(messages.map(async message => {
            const sourcePart = getTextPart(message);
            if (!sourcePart) {
                throw new Error(`No se pudo obtener el contenido del correo UID ${message.attributes.uid}.`);
            }
            const rawEmail = sourcePart.body;
            const parsed = await simpleParser(rawEmail);
            const plainText = parsed.text || '';

            const flags = message.attributes.flags || [];
            const fromValue = parsed.from?.value?.[0];
            const recipients = addresses => (addresses?.value || [])
                .map(({ address }) => address)
                .filter(Boolean);
            const replyAllEmails = [
                ...(parsed.from?.value || []),
                ...(parsed.to?.value || []),
                ...(parsed.cc?.value || [])
            ]
                .map(({ address }) => address)
                .filter(address => address && address.toLowerCase() !== process.env.IMAP_USER?.toLowerCase())
                .filter((address, index, all) => all.findIndex(item => item.toLowerCase() === address.toLowerCase()) === index);

            return {
                id: String(message.attributes.uid),
                fromName: fromValue?.name || fromValue?.address || parsed.from?.text || 'Remitente desconocido',
                fromEmail: fromValue?.address || '',
                subject: parsed.subject || '(Sin asunto)',
                date: parsed.date ? parsed.date.toISOString() : null,
                snippet: cleanSnippet(plainText, parsed.html),
                text: plainText,
                html: htmlWithInlineAttachments(parsed),
                toEmails: recipients(parsed.to),
                ccEmails: recipients(parsed.cc),
                replyAllEmails,
                seen: flags.some(flag => flag.toLowerCase() === '\\seen')
            };
        }));

        emails.reverse();
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

async function markUnread(req, res) {
    const uid = Number(req.body?.id);
    if (!Number.isSafeInteger(uid) || uid < 1) {
        return res.status(400).json({ success: false, error: 'El identificador del correo no es válido.' });
    }

    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        connection.on('error', error => {
            console.error('[BandejaEntrada] Error de conexión IMAP:', error);
        });
        await connection.openBox('INBOX');
        await connection.delFlags(uid, '\\Seen');
        return res.json({ success: true, message: 'El correo se marcó como no leído.' });
    } catch (error) {
        console.error('[BandejaEntrada] Error al marcar correo como no leído:', error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503 : 502;
        return res.status(status).json({
            success: false,
            error: status === 503 ? error.message : 'No fue posible actualizar el estado del correo.'
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
    const destinatarios = typeof req.body?.destinatario === 'string'
        ? [...new Set(req.body.destinatario.split(/[;,]/).map(address => address.trim()).filter(Boolean))]
        : [];
    const asuntoOriginal = typeof req.body.asunto === 'string' ? req.body.asunto.trim() : '';
    const mensaje = typeof req.body.mensaje === 'string' ? req.body.mensaje.trim() : '';

    if (!destinatarios.length
        || destinatarios.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        || !asuntoOriginal
        || !mensaje) {
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

        const asunto = /^(?:re|fwd?):/i.test(asuntoOriginal) ? asuntoOriginal : `Re: ${asuntoOriginal}`;
        const cuerpo = `<p>${escapeHtml(mensaje).replace(/\r?\n/g, '<br>')}</p>`;
        await enviarEmail({
            empresaId,
            destinatario: destinatarios,
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

module.exports = { getInbox, markUnread, replyEmail };
