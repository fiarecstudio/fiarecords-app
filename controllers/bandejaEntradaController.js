const imaps = require('imap-simple');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const sanitizeHtml = require('sanitize-html');
const Empresa = require('../models/Empresa');
const { enviarEmail } = require('../services/notificationService');

const MAX_INBOX_MESSAGES = 50;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const EMAIL_HTML_OPTIONS = {
    allowedTags: [
        'a', 'b', 'blockquote', 'br', 'caption', 'center', 'div', 'em', 'font',
        'h1', 'h2', 'h3', 'h4', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
        'span', 'strong', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
        'u', 'ul'
    ],
    allowedAttributes: {
        a: ['href', 'name', 'target', 'rel', 'style'],
        div: ['align', 'style', 'data-email-signature', 'data-original-quote'],
        font: ['color', 'face', 'size', 'style'],
        img: ['src', 'alt', 'width', 'height', 'style'],
        p: ['align', 'style'],
        span: ['style'],
        table: ['align', 'border', 'cellpadding', 'cellspacing', 'style', 'width'],
        td: ['align', 'colspan', 'rowspan', 'style', 'valign', 'width'],
        th: ['align', 'colspan', 'rowspan', 'style', 'valign', 'width'],
        '*': ['style']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false
};

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

function buscarUids(connection, query) {
    return new Promise((resolve, reject) => {
        const criteria = query
            ? [['OR', ['SUBJECT', query], ['OR', ['FROM', query], ['TO', query]]]]
            : ['ALL'];
        connection.imap.search(criteria, (error, uids) => {
            if (error) return reject(error);
            resolve(uids);
        });
    });
}

function getTextPart(message) {
    return message.parts.find(part => part.which === '');
}

function fetchByUids(connection, uids, options) {
    return new Promise((resolve, reject) => {
        const fetch = connection.imap.fetch(uids, options);
        const pendingMessages = [];
        fetch.on('message', message => {
            pendingMessages.push(new Promise((resolveMessage, rejectMessage) => {
                let attributes;
                const parts = [];
                message.on('attributes', value => {
                    attributes = value;
                });
                message.on('body', (stream, info) => {
                    let body = '';
                    stream.on('data', chunk => {
                        body += chunk.toString('utf8');
                    });
                    stream.once('error', rejectMessage);
                    stream.once('end', () => {
                        const part = { which: info.which, size: info.size, body };
                        if (/^HEADER/i.test(part.which)) part.body = Imap.parseHeader(part.body);
                        parts.push(part);
                    });
                });
                message.once('error', rejectMessage);
                message.once('end', () => resolveMessage({ attributes, parts }));
            }));
        });
        fetch.once('error', reject);
        fetch.once('end', () => {
            Promise.all(pendingMessages).then(resolve, reject);
        });
    });
}

function getPart(message, prefix) {
    return message.parts.find(part => part.which.toUpperCase().startsWith(prefix));
}

function headerText(headers, name) {
    return (headers[name.toLowerCase()] || []).join(' ');
}

function headerToRaw(headers) {
    return Object.entries(headers)
        .map(([name, values]) => `${name}: ${values.join(' ')}`)
        .join('\r\n');
}

function flattenBoxes(boxes, parent = '', result = []) {
    for (const [name, box] of Object.entries(boxes || {})) {
        const delimiter = box.delimiter || '.';
        const fullName = parent ? `${parent}${delimiter}${name}` : name;
        result.push(fullName);
        flattenBoxes(box.children, fullName, result);
    }
    return result;
}

async function resolveMailbox(connection, requestedFolder) {
    if (!requestedFolder || requestedFolder.toLowerCase() === 'inbox') return 'INBOX';
    const requestedKey = requestedFolder.toLowerCase().replace(/[._\s-]/g, '');
    if (!requestedKey.includes('sent') && !requestedKey.includes('enviados')) {
        throw new Error('La carpeta solicitada no está permitida.');
    }
    const available = flattenBoxes(await connection.getBoxes());
    const normalized = available.map(name => ({ name, key: name.toLowerCase().replace(/[._\s-]/g, '') }));
    const sent = normalized.find(box => box.key === requestedKey)
        || normalized.find(box => box.key === 'sent')
        || normalized.find(box => box.key === 'enviados')
        || normalized.find(box => box.key.includes('sent'))
        || normalized.find(box => box.key.includes('enviados'));
    if (!sent) throw new Error('No se encontró una carpeta de enviados en el servidor IMAP.');
    return sent.name;
}

async function formatListEmail(message, folder) {
    const header = getPart(message, 'HEADER');
    if (!header) throw new Error(`No se pudieron obtener las cabeceras del correo UID ${message.attributes.uid}.`);
    const headers = header.body;
    const parsed = await simpleParser(headerToRaw(headers));
    const fromValue = parsed.from?.value?.[0];
    const toEmails = (parsed.to?.value || []).map(({ address }) => address).filter(Boolean);
    const rawDate = parsed.date;
    const date = rawDate && !Number.isNaN(rawDate.getTime()) ? rawDate.toISOString() : null;
    const subject = parsed.subject || '(Sin asunto)';
    const snippet = cleanSnippet(subject, '') || 'Correo recibido';
    return {
        id: String(message.attributes.uid),
        folder,
        fromName: fromValue?.name || fromValue?.address || parsed.from?.text || 'Remitente desconocido',
        fromEmail: fromValue?.address || '',
        toEmails,
        subject,
        date,
        snippet,
        seen: (message.attributes.flags || []).some(flag => flag.toLowerCase() === '\\seen'),
        messageId: parsed.messageId || headerText(headers, 'message-id'),
        inReplyTo: Array.isArray(parsed.inReplyTo) ? parsed.inReplyTo : parsed.inReplyTo ? [parsed.inReplyTo] : [],
        references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []
    };
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
    const source = decodeHtmlEntities(String(text || html || ''))
        .replace(/<((?:https?:\/\/)[^>\s]+)>/gi, '$1')
        .replace(/<!doctype[^>]*>/gi, ' ')
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<(?:meta|link)\b[^>]*>/gi, ' ')
        .replace(/<br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]*>/g, ' ');
    const lines = source
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
        const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
        const config = getImapConfig();
        connection = await imaps.connect(config);
        connection.on('error', error => {
            console.error('[BandejaEntrada] Error de conexión IMAP:', error);
        });
        const mailbox = await resolveMailbox(connection, String(req.query.folder || 'INBOX'));
        await connection.openBox(mailbox);

        const uids = (await buscarUids(connection, query)).sort((a, b) => a - b);
        const latestUids = uids.slice(-MAX_INBOX_MESSAGES);
        if (latestUids.length === 0) return res.json({ success: true, emails: [], folder: mailbox });

        const messages = await fetchByUids(
            connection,
            latestUids,
            { bodies: ['HEADER'], markSeen: false }
        );

        const emails = await Promise.all(messages
            .map(message => formatListEmail(message, mailbox)));

        emails.reverse();
        return res.json({ success: true, emails, folder: mailbox, query });
    } catch (error) {
        console.error('[BandejaEntrada] Error al consultar INBOX:', error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503
            : /no está permitida/.test(error.message) ? 400 : 502;
        return res.status(status).json({
            success: false,
            error: status !== 502 ? error.message : 'No fue posible consultar la bandeja IMAP.'
        });
    } finally {
        if (connection) connection.end();
    }
}

async function getUnreadCount(req, res) {
    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        connection.on('error', error => console.error('[BandejaEntrada] Error de conexión IMAP:', error));
        await connection.openBox('INBOX');
        const uids = await new Promise((resolve, reject) => {
            connection.imap.search(['UNSEEN'], (error, results) => {
                if (error) return reject(error);
                resolve(results || []);
            });
        });
        return res.json({ success: true, unreadCount: uids.length });
    } catch (error) {
        console.error('[BandejaEntrada] Error al consultar correos no leídos:', error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503 : 502;
        return res.status(status).json({
            success: false,
            error: status !== 502 ? error.message : 'No fue posible consultar los correos no leídos.'
        });
    } finally {
        if (connection) connection.end();
    }
}

async function getEmailDetail(req, res) {
        const uid = Number(req.params.id);
        if (!Number.isSafeInteger(uid) || uid < 1) {
            return res.status(400).json({ success: false, error: 'El identificador del correo no es válido.' });
        }

        let connection;
        try {
            connection = await imaps.connect(getImapConfig());
            connection.on('error', error => console.error('[BandejaEntrada] Error de conexión IMAP:', error));
            const mailbox = await resolveMailbox(connection, String(req.query.folder || 'INBOX'));
            await connection.openBox(mailbox);
            const messages = await connection.search([['UID', String(uid)]], { bodies: [''], markSeen: false });
            const message = messages.find(item => String(item.attributes.uid) === String(uid));
            const sourcePart = message && getTextPart(message);
            if (!sourcePart) return res.status(404).json({ success: false, error: 'El correo ya no existe en esa carpeta.' });

            const parsed = await simpleParser(sourcePart.body);
            const fromValue = parsed.from?.value?.[0];
            const recipients = addresses => (addresses?.value || []).map(({ address }) => address).filter(Boolean);
            const replyAllEmails = [
                ...(parsed.from?.value || []),
                ...(parsed.to?.value || []),
                ...(parsed.cc?.value || [])
            ].map(({ address }) => address)
                .filter(address => address && address.toLowerCase() !== process.env.IMAP_USER?.toLowerCase())
                .filter((address, index, all) => all.findIndex(item => item.toLowerCase() === address.toLowerCase()) === index);
            const email = {
                id: String(message.attributes.uid),
                folder: mailbox,
                fromName: fromValue?.name || fromValue?.address || parsed.from?.text || 'Remitente desconocido',
                fromEmail: fromValue?.address || '',
                subject: parsed.subject || '(Sin asunto)',
                date: parsed.date ? parsed.date.toISOString() : null,
                snippet: cleanSnippet(parsed.text, parsed.html),
                text: parsed.text || '',
                html: sanitizeHtml(htmlWithInlineAttachments(parsed), EMAIL_HTML_OPTIONS),
                messageId: parsed.messageId || '',
                inReplyTo: Array.isArray(parsed.inReplyTo) ? parsed.inReplyTo : parsed.inReplyTo ? [parsed.inReplyTo] : [],
                references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [],
                toEmails: recipients(parsed.to),
                ccEmails: recipients(parsed.cc),
                replyAllEmails,
                attachments: (parsed.attachments || []).map(attachment => ({
                    name: attachment.filename || 'archivo',
                    contentType: attachment.contentType,
                    size: attachment.size,
                    content: attachment.content.toString('base64')
                })),
                seen: (message.attributes.flags || []).some(flag => flag.toLowerCase() === '\\seen')
            };
            return res.json({ success: true, email });
        } catch (error) {
            console.error('[BandejaEntrada] Error al consultar detalle:', error);
            const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503
                : /no está permitida/.test(error.message) ? 400 : 502;
            return res.status(status).json({
                success: false,
                error: status !== 502 ? error.message : 'No fue posible consultar el correo seleccionado.'
            });
        } finally {
            if (connection) connection.end();
    }
}

async function updateSeenFlag(req, res, seen) {
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
        const mailbox = await resolveMailbox(connection, String(req.body?.folder || 'INBOX'));
        await connection.openBox(mailbox);
        if (seen) {
            await connection.addFlags(uid, '\\Seen');
        } else {
            await connection.delFlags(uid, '\\Seen');
        }
        return res.json({
            success: true,
            seen,
            message: seen ? 'El correo se marcó como leído.' : 'El correo se marcó como no leído.'
        });
    } catch (error) {
        console.error(`[BandejaEntrada] Error al marcar correo como ${seen ? 'leído' : 'no leído'}:`, error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503 : 502;
        return res.status(status).json({
            success: false,
            error: status === 503 ? error.message : 'No fue posible actualizar el estado del correo.'
        });
    } finally {
        if (connection) connection.end();
    }
}

async function markRead(req, res) {
    return updateSeenFlag(req, res, true);
}

async function markUnread(req, res) {
    return updateSeenFlag(req, res, false);
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

function wrapBase64(value) {
    return value.match(/.{1,76}/g)?.join('\r\n') || '';
}

function encodeHeader(value) {
    const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
    return /^[\x20-\x7E]*$/.test(text)
        ? text
        : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function createRawSentMessage({ sender, destinatarios, asunto, cuerpo, attachments, headers }) {
    const safeSender = String(sender || '').replace(/[\r\n<>]/g, '');
    const safeRecipients = destinatarios.map(address => String(address).replace(/[\r\n<>]/g, ''));
    const messageHeaders = [
        `From: ${safeSender}`,
        `To: ${safeRecipients.join(', ')}`,
        `Subject: ${encodeHeader(asunto)}`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`
    ];
    if (headers) {
        if (headers['In-Reply-To']) messageHeaders.push(`In-Reply-To: ${headers['In-Reply-To']}`);
        if (headers.References) messageHeaders.push(`References: ${headers.References}`);
    }

    if (!attachments.length) {
        messageHeaders.push('Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64');
        return `${messageHeaders.join('\r\n')}\r\n\r\n${wrapBase64(Buffer.from(cuerpo, 'utf8').toString('base64'))}\r\n`;
    }

    const boundary = `fiarecords-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    messageHeaders.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const parts = [
        `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapBase64(Buffer.from(cuerpo, 'utf8').toString('base64'))}`
    ];
    for (const attachment of attachments) {
        const safeName = attachment.name.replace(/["\r\n]/g, '_');
        parts.push(`--${boundary}\r\nContent-Type: application/octet-stream; name="${safeName}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${safeName}"\r\n\r\n${wrapBase64(attachment.content)}`);
    }
    parts.push(`--${boundary}--`);
    return `${messageHeaders.join('\r\n')}\r\n\r\n${parts.join('\r\n')}\r\n`;
}

async function saveSentCopy({ destinatarios, asunto, cuerpo, attachments, headers, empresa }) {
    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        connection.on('error', error => console.error('[BandejaEntrada] Error de conexión IMAP Sent:', error));
        const mailbox = await resolveMailbox(connection, 'Sent');
        const senderEmail = empresa?.notificaciones?.email?.smtpUser || process.env.SMTP_USER || process.env.IMAP_USER;
        const sender = senderEmail ? `${empresa?.nombre || 'M Asesores'} <${senderEmail}>` : process.env.IMAP_USER;
        const raw = createRawSentMessage({ sender, destinatarios, asunto, cuerpo, attachments, headers });
        await connection.append(raw, { mailbox, flags: ['\\Seen'] });
        return true;
    } catch (error) {
        console.warn('[BandejaEntrada] No se pudo guardar copia en Enviados:', error.message);
        return false;
    } finally {
        if (connection) connection.end();
    }
}

async function replyEmail(req, res) {
    const destinatarios = typeof req.body?.destinatario === 'string'
        ? [...new Set(req.body.destinatario.split(/[;,]/).map(address => address.trim()).filter(Boolean))]
        : [];
    const asuntoOriginal = typeof req.body.asunto === 'string' ? req.body.asunto.trim().replace(/[\r\n]+/g, ' ') : '';
    const mensaje = typeof req.body.mensaje === 'string' ? req.body.mensaje.trim() : '';
    const tipo = ['new', 'reply', 'replyAll', 'forward'].includes(req.body?.tipo) ? req.body.tipo : 'reply';
    const attachments = req.body?.attachments ?? [];
    const originalMessageId = typeof req.body?.originalMessageId === 'string'
        ? req.body.originalMessageId.trim()
        : '';

    if (!destinatarios.length
        || destinatarios.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        || !asuntoOriginal
        || typeof mensaje !== 'string'
        || !mensaje.trim()
        || !Array.isArray(attachments)) {
        return res.status(400).json({
            success: false,
            error: 'Indica un destinatario válido, asunto, mensaje y adjuntos válidos.'
        });
    }

    const attachmentsValidos = [];
    let totalAttachmentBytes = 0;
    for (const attachment of attachments) {
        if (!attachment || typeof attachment.name !== 'string'
            || !attachment.name.trim() || attachment.name.length > 255
            || /[\r\n]/.test(attachment.name)
            || typeof attachment.content !== 'string'
            || !attachment.content
            || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.content)) {
            return res.status(400).json({ success: false, error: 'Uno de los archivos adjuntos no es válido.' });
        }
        const contentBytes = Buffer.from(attachment.content, 'base64').length;
        totalAttachmentBytes += contentBytes;
        if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
            return res.status(413).json({ success: false, error: 'El tamaño total de los adjuntos no puede exceder 10 MB.' });
        }
        attachmentsValidos.push({ name: attachment.name.trim(), content: attachment.content });
    }
    if (originalMessageId.length > 998 || /[\r\n]/.test(originalMessageId)) {
        return res.status(400).json({ success: false, error: 'El identificador del correo original no es válido.' });
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

        const asunto = tipo === 'new' || /^(?:re|fwd?):/i.test(asuntoOriginal)
            ? asuntoOriginal
            : `${tipo === 'forward' ? 'Fwd' : 'Re'}: ${asuntoOriginal}`;
        const signatureHtml = sanitizeHtml(
            empresa?.notificaciones?.email?.firmaHTML || empresa?.notificaciones?.email?.signatureHtml || '',
            EMAIL_HTML_OPTIONS
        );
        const mensajeHtml = req.body?.mensajeHtml === true
            ? sanitizeHtml(mensaje, EMAIL_HTML_OPTIONS)
            : `<div>${escapeHtml(mensaje).replace(/\r?\n/g, '<br>')}</div>`;
        const textoRedactado = sanitizeHtml(mensaje, {
            ...EMAIL_HTML_OPTIONS,
            exclusiveFilter: frame => frame.tag === 'div'
                && ['true'].includes(frame.attribs['data-email-signature'] || frame.attribs['data-original-quote'])
        }).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
        if (!textoRedactado) {
            return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío.' });
        }
        const mensajeSinFirma = req.body?.mensajeHtml === true
            ? sanitizeHtml(mensaje, {
                ...EMAIL_HTML_OPTIONS,
                exclusiveFilter: frame => frame.tag === 'div' && frame.attribs['data-email-signature'] === 'true'
            })
            : mensajeHtml;
        const cuerpo = `${mensajeSinFirma}${signatureHtml ? `<br>${signatureHtml}` : ''}`;
        const headers = tipo === 'reply' || tipo === 'replyAll'
            ? originalMessageId
                ? { 'In-Reply-To': originalMessageId, References: originalMessageId }
                : undefined
            : undefined;
        await enviarEmail({
            empresaId,
            destinatario: destinatarios,
            asunto,
            cuerpo,
            replyTo,
            attachments: attachmentsValidos,
            headers
        });
        const sentCopySaved = await saveSentCopy({
            destinatarios,
            asunto,
            cuerpo,
            attachments: attachmentsValidos,
            headers,
            empresa
        });

        return res.json({
            success: true,
            message: 'Respuesta enviada correctamente.',
            sentCopySaved
        });
    } catch (error) {
        console.error('[BandejaEntrada] Error al enviar respuesta con Brevo:', error);
        return res.status(502).json({
            success: false,
            error: 'Brevo no pudo enviar la respuesta.'
        });
    }
}

module.exports = { getInbox, getUnreadCount, getEmailDetail, markRead, markUnread, replyEmail };
