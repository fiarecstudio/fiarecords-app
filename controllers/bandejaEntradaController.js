const imaps = require('imap-simple');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const sanitizeHtml = require('sanitize-html');
const Empresa = require('../models/Empresa');
const CorreoProgramado = require('../models/CorreoProgramado');
const ReglaCorreo = require('../models/ReglaCorreo');
const ListaNegraCorreo = require('../models/ListaNegraCorreo');
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
        const attributes = Array.isArray(box.attribs) ? box.attribs : [];
        if (!attributes.some(attribute => String(attribute).toLowerCase() === '\\noselect')) {
            result.push({ name: fullName, attributes });
        }
        flattenBoxes(box.children, fullName, result);
    }
    return result;
}

async function resolveMailbox(connection, requestedFolder) {
    const available = flattenBoxes(await connection.getBoxes());
    if (!requestedFolder || requestedFolder.toLowerCase() === 'inbox') {
        return available.find(box => box.name.toLowerCase() === 'inbox')?.name || 'INBOX';
    }
    const requestedKey = requestedFolder.toLowerCase().replace(/[._\s-]/g, '');
    const normalized = available.map(box => ({
        ...box,
        key: box.name.toLowerCase().replace(/[._\s-]/g, '')
    }));
    const exact = normalized.find(box => box.key === requestedKey);
    if (exact) return exact.name;
    if (requestedKey.includes('sent') || requestedKey.includes('enviados')) {
        const sent = normalized.find(box => box.key === 'sent')
            || normalized.find(box => box.key === 'enviados')
            || normalized.find(box => box.key.includes('sent'))
            || normalized.find(box => box.key.includes('enviados'));
        if (sent) return sent.name;
    }
    throw new Error('La carpeta solicitada no existe en el servidor IMAP.');
}

function getMailboxRole(name, attributes = []) {
    const key = `${name} ${attributes.join(' ')}`.toLowerCase();
    if (/\\junk|spam|junk|correo no deseado/.test(key)) return 'spam';
    if (/\\trash|\\deleted|trash|papelera|deleted|eliminados/.test(key)) return 'trash';
    if (/\\sent|sent|enviados/.test(key)) return 'sent';
    if (/\\inbox|inbox|entrada/.test(key)) return 'inbox';
    return 'folder';
}

async function getFolders(req, res) {
    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        connection.on('error', error => console.error('[BandejaEntrada] Error de conexión IMAP:', error));
        const folders = flattenBoxes(await connection.getBoxes())
            .map(({ name, attributes }) => ({ name, role: getMailboxRole(name, attributes) }));
        return res.json({ success: true, folders });
    } catch (error) {
        console.error('[BandejaEntrada] Error al consultar carpetas IMAP:', error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503 : 502;
        return res.status(status).json({
            success: false,
            error: status === 503 ? error.message : 'No fue posible consultar las carpetas IMAP.'
        });
    } finally {
        if (connection) connection.end();
    }
}

async function createFolder(req, res) {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 120 || /[\r\n\x00]/.test(name) || name.startsWith('/') || name.endsWith('/')) {
        return res.status(400).json({ success: false, error: 'Indica un nombre de carpeta válido (máximo 120 caracteres).' });
    }
    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        connection.on('error', error => console.error('[BandejaEntrada] Error de conexión IMAP:', error));
        await connection.addBox(name);
        return res.status(201).json({ success: true, folder: name });
    } catch (error) {
        console.error('[BandejaEntrada] Error al crear carpeta IMAP:', error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503 : 502;
        return res.status(status).json({
            success: false,
            error: status === 503 ? error.message : 'No fue posible crear la carpeta en el servidor IMAP.'
        });
    } finally {
        if (connection) connection.end();
    }
}

function validateRulePayload(body = {}) {
    const name = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const field = body.condicion?.campo;
    const operator = body.condicion?.operador;
    const value = typeof body.condicion?.valor === 'string' ? body.condicion.valor.trim() : '';
    const folder = typeof body.acciones?.moverACarpeta === 'string'
        ? body.acciones.moverACarpeta.trim()
        : '';
    if (!name || name.length > 120
        || !['remitente', 'asunto', 'cuerpo'].includes(field)
        || !['contiene', 'es_igual', 'empieza_con'].includes(operator)
        || !value || value.length > 200
        || folder.length > 255 || /[\r\n\x00]/.test(folder)
        || typeof body.acciones?.marcarLeido !== 'boolean'
        || typeof body.acciones?.marcarImportante !== 'boolean'
        || (!folder && !body.acciones.marcarLeido && !body.acciones.marcarImportante)) {
        return { error: 'Revisa nombre, condición y al menos una acción válida para la regla.' };
    }
    return {
        rule: {
            nombre: name,
            activa: body.activa !== false,
            condicion: { campo: field, operador: operator, valor: value },
            acciones: {
                moverACarpeta: folder,
                marcarLeido: body.acciones.marcarLeido,
                marcarImportante: body.acciones.marcarImportante
            }
        }
    };
}

async function getMailRules(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) return res.status(400).json({ success: false, error: 'Selecciona una empresa para consultar sus reglas.' });
    try {
        const rules = await ReglaCorreo.find({ empresaId }).sort({ createdAt: -1 }).lean();
        return res.json({ success: true, rules });
    } catch (error) {
        console.error('[BandejaEntrada] Error al consultar reglas:', error);
        return res.status(500).json({ success: false, error: 'No fue posible consultar las reglas de correo.' });
    }
}

async function createMailRule(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) return res.status(400).json({ success: false, error: 'Selecciona una empresa para crear reglas.' });
    const validation = validateRulePayload(req.body);
    if (validation.error) return res.status(400).json({ success: false, error: validation.error });
    try {
        const rule = await ReglaCorreo.create({ empresaId, ...validation.rule });
        return res.status(201).json({ success: true, rule });
    } catch (error) {
        console.error('[BandejaEntrada] Error al crear regla:', error);
        return res.status(500).json({ success: false, error: 'No fue posible guardar la regla de correo.' });
    }
}

async function deleteMailRule(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) return res.status(400).json({ success: false, error: 'Selecciona una empresa para eliminar reglas.' });
    try {
        const deleted = await ReglaCorreo.findOneAndDelete({ _id: req.params.id, empresaId });
        if (!deleted) return res.status(404).json({ success: false, error: 'No se encontró la regla de correo.' });
        return res.json({ success: true, message: 'Regla eliminada.' });
    } catch (error) {
        console.error('[BandejaEntrada] Error al eliminar regla:', error);
        return res.status(400).json({ success: false, error: 'No fue posible eliminar la regla de correo.' });
    }
}

async function getBlacklist(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) return res.status(400).json({ success: false, error: 'Selecciona una empresa para consultar la lista negra.' });
    try {
        const entries = await ListaNegraCorreo.find({ empresaId }).sort({ createdAt: -1 }).lean();
        return res.json({ success: true, entries });
    } catch (error) {
        console.error('[BandejaEntrada] Error al consultar lista negra:', error);
        return res.status(500).json({ success: false, error: 'No fue posible consultar la lista negra.' });
    }
}

async function addBlacklistEntry(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) return res.status(400).json({ success: false, error: 'Selecciona una empresa para modificar la lista negra.' });
    const raw = typeof req.body?.emailODominio === 'string' ? req.body.emailODominio.trim().toLowerCase() : '';
    const normalized = raw.startsWith('@') ? raw.slice(1) : raw;
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
        || /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(normalized);
    if (!valid) return res.status(400).json({ success: false, error: 'Indica un correo o dominio válido.' });
    try {
        const value = normalized.includes('@') ? normalized : `@${normalized}`;
        const entry = await ListaNegraCorreo.findOneAndUpdate(
            { empresaId, emailODominio: value },
            { $setOnInsert: { empresaId, emailODominio: value } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return res.status(201).json({ success: true, entry });
    } catch (error) {
        console.error('[BandejaEntrada] Error al agregar entrada a lista negra:', error);
        return res.status(500).json({ success: false, error: 'No fue posible agregar la entrada a la lista negra.' });
    }
}

async function removeBlacklistEntry(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) return res.status(400).json({ success: false, error: 'Selecciona una empresa para modificar la lista negra.' });
    try {
        const removed = await ListaNegraCorreo.findOneAndDelete({ _id: req.params.id, empresaId });
        if (!removed) return res.status(404).json({ success: false, error: 'No se encontró la entrada de lista negra.' });
        return res.json({ success: true, message: 'Entrada eliminada de la lista negra.' });
    } catch (error) {
        console.error('[BandejaEntrada] Error al eliminar entrada de lista negra:', error);
        return res.status(400).json({ success: false, error: 'No fue posible modificar la lista negra.' });
    }
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
        flagged: (message.attributes.flags || []).some(flag => flag.toLowerCase() === '\\flagged'),
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

function ruleConditionMatches(rule, email, bodyText = '') {
    const condition = rule.condicion;
    const source = condition.campo === 'remitente'
        ? email.fromEmail
        : condition.campo === 'asunto'
            ? email.subject
            : bodyText;
    const actual = String(source || '').toLocaleLowerCase();
    const expected = String(condition.valor || '').toLocaleLowerCase();
    if (condition.operador === 'es_igual') return actual === expected;
    if (condition.operador === 'empieza_con') return actual.startsWith(expected);
    return actual.includes(expected);
}

function remitenteEnListaNegra(emailAddress, entries) {
    const normalizedEmail = String(emailAddress || '').trim().toLowerCase();
    const domain = normalizedEmail.split('@')[1] || '';
    return entries.some(entry => {
        const blacklisted = String(entry.emailODominio || '').trim().toLowerCase();
        return blacklisted.startsWith('@')
            ? domain === blacklisted.slice(1)
            : blacklisted.includes('@')
                ? normalizedEmail === blacklisted
                : domain === blacklisted;
    });
}

async function obtenerTextoCompletoCorreo(connection, uid) {
    const messages = await connection.search([['UID', String(uid)]], { bodies: [''], markSeen: false });
    const message = messages.find(item => String(item.attributes.uid) === String(uid));
    const source = message && getTextPart(message);
    if (!source) throw new Error(`No se pudo leer el cuerpo del correo UID ${uid} para aplicar las reglas.`);
    const parsed = await simpleParser(source.body);
    return [parsed.text || '', parsed.html ? sanitizeHtml(parsed.html, EMAIL_HTML_OPTIONS) : '']
        .join('\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function aplicarPoliticasEntrantes(connection, mailbox, emails, empresaId) {
    if (!empresaId || getMailboxRole(mailbox) !== 'inbox') return emails;
    const [rules, blacklist] = await Promise.all([
        ReglaCorreo.find({ empresaId, activa: true }).lean(),
        ListaNegraCorreo.find({ empresaId }).select('emailODominio').lean()
    ]);
    if (!rules.length && !blacklist.length) return emails;
    const spamFolder = flattenBoxes(await connection.getBoxes())
        .find(({ name, attributes }) => getMailboxRole(name, attributes) === 'spam')?.name;
    const bodyRules = rules.some(rule => rule.condicion.campo === 'cuerpo');
    const visibleEmails = [];

    for (const email of emails) {
        const uid = Number(email.id);
        try {
            if (remitenteEnListaNegra(email.fromEmail, blacklist)) {
                if (!spamFolder) throw new Error('No se encontró una carpeta de correo no deseado en IMAP.');
                await connection.moveMessage(uid, spamFolder);
                continue;
            }

            const bodyText = bodyRules ? await obtenerTextoCompletoCorreo(connection, uid) : '';
            const matchedRules = rules.filter(rule => ruleConditionMatches(rule, email, bodyText));
            let destinationName = '';
            let markedSeen = false;
            let flagged = false;
            for (const rule of matchedRules) {
                if (!destinationName && rule.acciones?.moverACarpeta) destinationName = rule.acciones.moverACarpeta;
                markedSeen ||= rule.acciones?.marcarLeido === true;
                flagged ||= rule.acciones?.marcarImportante === true;
            }
            if (markedSeen) await connection.addFlags(uid, '\\Seen');
            if (flagged) await connection.addFlags(uid, '\\Flagged');
            if (destinationName) {
                const destination = await resolveMailbox(connection, destinationName);
                if (destination !== mailbox) {
                    await connection.moveMessage(uid, destination);
                    continue;
                }
            }
            email.seen ||= markedSeen;
            email.flagged ||= flagged;
            visibleEmails.push(email);
        } catch (error) {
            console.error(`[BandejaEntrada] No fue posible aplicar políticas al correo ${email.id}:`, error);
            visibleEmails.push(email);
        }
    }
    return visibleEmails;
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

        let emails = await Promise.all(messages
            .map(message => formatListEmail(message, mailbox)));

        emails = await aplicarPoliticasEntrantes(
            connection,
            mailbox,
            emails,
            resolveScheduledCompanyId(req)
        );
        emails.reverse();
        return res.json({ success: true, emails, folder: mailbox, query });
    } catch (error) {
        console.error('[BandejaEntrada] Error al consultar INBOX:', error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503
            : /no está permitida|no existe en el servidor IMAP/.test(error.message) ? 400 : 502;
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
                seen: (message.attributes.flags || []).some(flag => flag.toLowerCase() === '\\seen'),
                flagged: (message.attributes.flags || []).some(flag => flag.toLowerCase() === '\\flagged')
            };
            return res.json({ success: true, email });
        } catch (error) {
            console.error('[BandejaEntrada] Error al consultar detalle:', error);
            const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503
                : /no está permitida|no existe en el servidor IMAP/.test(error.message) ? 400 : 502;
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

async function updateFlag(req, res) {
    const uid = Number(req.params.id);
    const flagged = req.body?.flagged;
    if (!Number.isSafeInteger(uid) || uid < 1 || typeof flagged !== 'boolean') {
        return res.status(400).json({ success: false, error: 'El identificador o la bandera del correo no son válidos.' });
    }

    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        connection.on('error', error => console.error('[BandejaEntrada] Error de conexión IMAP:', error));
        const mailbox = await resolveMailbox(connection, String(req.body?.folder || 'INBOX'));
        await connection.openBox(mailbox);
        if (flagged) {
            await connection.addFlags(uid, '\\Flagged');
        } else {
            await connection.delFlags(uid, '\\Flagged');
        }
        return res.json({ success: true, flagged });
    } catch (error) {
        console.error('[BandejaEntrada] Error al actualizar seguimiento:', error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503
            : /no existe en el servidor IMAP/.test(error.message) ? 400 : 502;
        return res.status(status).json({
            success: false,
            error: status === 503 || status === 400 ? error.message : 'No fue posible actualizar el seguimiento del correo.'
        });
    } finally {
        if (connection) connection.end();
    }
}

async function moveEmailTo(req, res, destinationResolver, beforeMove = async () => {}) {
    const uid = Number(req.params.id);
    if (!Number.isSafeInteger(uid) || uid < 1) {
        return res.status(400).json({ success: false, error: 'El identificador del correo no es válido.' });
    }

    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        connection.on('error', error => console.error('[BandejaEntrada] Error de conexión IMAP:', error));
        const source = await resolveMailbox(connection, String(req.body?.folder || 'INBOX'));
        await connection.openBox(source);
        const destination = await destinationResolver(connection);
        if (destination === source) {
            return res.status(400).json({ success: false, error: 'El correo ya está en esa carpeta.' });
        }
        await beforeMove(connection, uid);
        await connection.moveMessage(uid, destination);
        return res.json({ success: true, folder: destination });
    } catch (error) {
        console.error('[BandejaEntrada] Error al mover correo:', error);
        const status = /Configura IMAP_|IMAP_PORT/.test(error.message) ? 503
            : /no existe en el servidor IMAP|No se encontró/.test(error.message) ? 404
                : /Selecciona una empresa|remitente|dirección de correo válida/.test(error.message) ? 400 : 502;
        return res.status(status).json({
            success: false,
            error: status === 503 || status === 404 || status === 400 ? error.message : 'No fue posible mover el correo.'
        });
    } finally {
        if (connection) connection.end();
    }
}

async function moveEmail(req, res) {
    const destinationName = typeof req.body?.destination === 'string' ? req.body.destination.trim() : '';
    if (!destinationName) {
        return res.status(400).json({ success: false, error: 'Selecciona una carpeta de destino.' });
    }
    return moveEmailTo(req, res, async connection => resolveMailbox(connection, destinationName));
}

async function moveEmailToRole(req, res, role, label) {
    return moveEmailTo(req, res, async connection => {
        const folder = flattenBoxes(await connection.getBoxes())
            .find(({ name, attributes }) => getMailboxRole(name, attributes) === role);
        if (!folder) throw new Error(`No se encontró una carpeta de ${label} en el servidor IMAP.`);
        return folder.name;
    });
}

async function moveEmailToSpam(req, res) {
    return moveEmailTo(req, res, async connection => {
        const folder = flattenBoxes(await connection.getBoxes())
            .find(({ name, attributes }) => getMailboxRole(name, attributes) === 'spam');
        if (!folder) throw new Error('No se encontró una carpeta de correo no deseado en el servidor IMAP.');
        return folder.name;
    }, async (connection, uid) => {
        const empresaId = resolveScheduledCompanyId(req);
        if (!empresaId) throw new Error('Selecciona una empresa para guardar el remitente en la lista negra.');
        const messages = await connection.search([['UID', String(uid)]], { bodies: ['HEADER'], markSeen: false });
        const message = messages.find(item => String(item.attributes.uid) === String(uid));
        const header = message && getPart(message, 'HEADER');
        if (!header) throw new Error('No se pudo obtener el remitente para agregarlo a la lista negra.');
        const parsed = await simpleParser(headerToRaw(header.body));
        const sender = parsed.from?.value?.[0]?.address?.trim().toLowerCase();
        if (!sender || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
            throw new Error('El remitente no tiene una dirección de correo válida para la lista negra.');
        }
        await ListaNegraCorreo.updateOne(
            { empresaId, emailODominio: sender },
            { $setOnInsert: { empresaId, emailODominio: sender } },
            { upsert: true }
        );
    });
}

async function moveEmailToTrash(req, res) {
    return moveEmailToRole(req, res, 'trash', 'papelera');
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

function createRawSentMessage({ sender, destinatarios, cc = [], asunto, cuerpo, attachments, headers }) {
    const safeSender = String(sender || '').replace(/[\r\n<>]/g, '');
    const safeRecipients = destinatarios.map(address => String(address).replace(/[\r\n<>]/g, ''));
    const messageHeaders = [
        `From: ${safeSender}`,
        `To: ${safeRecipients.join(', ')}`,
        `Subject: ${encodeHeader(asunto)}`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`
    ];
    if (cc.length) {
        messageHeaders.push(`Cc: ${cc.map(address => String(address).replace(/[\r\n<>]/g, '')).join(', ')}`);
    }
    for (const [name, value] of Object.entries(headers || {})) {
        if (/^[A-Za-z0-9-]+$/.test(name) && typeof value === 'string' && !/[\r\n]/.test(value)) {
            messageHeaders.push(`${name}: ${value}`);
        }
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

async function saveSentCopy({ destinatarios, cc = [], asunto, cuerpo, attachments, headers, empresa, followUp }) {
    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        connection.on('error', error => console.error('[BandejaEntrada] Error de conexión IMAP Sent:', error));
        const mailbox = await resolveMailbox(connection, 'Sent');
        const senderEmail = empresa?.notificaciones?.email?.smtpUser || process.env.SMTP_USER || process.env.IMAP_USER;
        const sender = senderEmail ? `${empresa?.nombre || 'M Asesores'} <${senderEmail}>` : process.env.IMAP_USER;
        const raw = createRawSentMessage({ sender, destinatarios, cc, asunto, cuerpo, attachments, headers });
        await connection.append(raw, { mailbox, flags: ['\\Seen', ...(followUp ? ['\\Flagged'] : [])] });
        return true;
    } catch (error) {
        console.warn('[BandejaEntrada] No se pudo guardar copia en Enviados:', error.message);
        return false;
    } finally {
        if (connection) connection.end();
    }
}

function resolveScheduledCompanyId(req) {
    return req.tenantFilter?.empresaId || (req.user?.isSuperAdmin ? null : req.user?.empresaId) || null;
}

function parseEmailAddresses(value) {
    if (typeof value !== 'string') return [];
    return [...new Set(value.split(/[;,]/).map(address => address.trim()).filter(Boolean))];
}

function validateScheduledAttachments(attachments) {
    if (!Array.isArray(attachments)) return { error: 'Los adjuntos deben enviarse como una lista.' };
    const validAttachments = [];
    let totalBytes = 0;
    for (const attachment of attachments) {
        if (!attachment || typeof attachment.name !== 'string'
            || !attachment.name.trim() || attachment.name.length > 255
            || /[\r\n]/.test(attachment.name)
            || typeof attachment.content !== 'string'
            || !attachment.content
            || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.content)) {
            return { error: 'Uno de los archivos adjuntos no es válido.' };
        }
        totalBytes += Buffer.from(attachment.content, 'base64').length;
        if (totalBytes > MAX_ATTACHMENT_BYTES) {
            return { error: 'El tamaño total de los adjuntos no puede exceder 10 MB.', status: 413 };
        }
        validAttachments.push({ name: attachment.name.trim(), content: attachment.content });
    }
    return { attachments: validAttachments };
}

function prepararSalidaCorreo({ empresa, mensaje, importance, requestReadReceipt, followUp }) {
    const signatureHtml = sanitizeHtml(
        empresa?.notificaciones?.email?.firmaHTML || empresa?.notificaciones?.email?.signatureHtml || '',
        EMAIL_HTML_OPTIONS
    );
    const sanitizedMessage = sanitizeHtml(mensaje, EMAIL_HTML_OPTIONS);
    const messageText = sanitizeHtml(sanitizedMessage, {
        ...EMAIL_HTML_OPTIONS,
        exclusiveFilter: frame => frame.tag === 'div'
            && ['true'].includes(frame.attribs['data-email-signature'] || frame.attribs['data-original-quote'])
    }).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
    if (!messageText) throw new Error('El mensaje no puede estar vacío.');
    const messageWithoutSignature = sanitizeHtml(sanitizedMessage, {
        ...EMAIL_HTML_OPTIONS,
        exclusiveFilter: frame => frame.tag === 'div' && frame.attribs['data-email-signature'] === 'true'
    });
    const cuerpo = `<div style="font-family:Arial,sans-serif;color:#333333;font-size:14px;">${messageWithoutSignature}</div>${signatureHtml ? `<br>${signatureHtml}` : ''}`;
    const senderEmail = String(empresa?.notificaciones?.email?.smtpUser
        || process.env.SMTP_USER
        || 'cobranza@masesores.mx').replace(/[\r\n]/g, '');
    if (requestReadReceipt && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
        throw new Error('Configura un correo remitente válido para solicitar confirmación de lectura.');
    }
    const headers = {};
    if (importance === 'high') {
        headers['X-Priority'] = '1';
        headers.Importance = 'high';
    } else if (importance === 'low') {
        headers['X-Priority'] = '5';
        headers.Importance = 'low';
    }
    if (requestReadReceipt) {
        headers['Disposition-Notification-To'] = senderEmail;
        headers['Return-Receipt-To'] = senderEmail;
    }
    if (followUp) headers['X-Follow-Up'] = 'Follow up';
    return { cuerpo, headers };
}

async function enviarCorreoProgramado(correo) {
    const empresa = await Empresa.findById(correo.empresaId).lean();
    if (!empresa) throw new Error('La empresa asociada al correo programado ya no existe.');
    const replyTo = process.env.IMAP_USER || empresa.email;
    if (!replyTo) throw new Error('Configura IMAP_USER o el correo de la empresa para recibir respuestas.');
    const { cuerpo, headers } = prepararSalidaCorreo({
        empresa,
        mensaje: correo.mensaje,
        importance: correo.importance,
        requestReadReceipt: correo.requestReadReceipt,
        followUp: correo.followUp
    });
    await enviarEmail({
        empresaId: correo.empresaId,
        destinatario: correo.destinatario,
        cc: correo.cc,
        asunto: correo.asunto,
        cuerpo,
        replyTo,
        attachments: correo.attachments,
        headers
    });
    const sentCopySaved = await saveSentCopy({
        destinatarios: correo.destinatario,
        cc: correo.cc,
        asunto: correo.asunto,
        cuerpo,
        attachments: correo.attachments,
        headers,
        empresa,
        followUp: correo.followUp
    });
    if (!sentCopySaved) {
        console.warn(`[BandejaEntrada] Correo programado ${correo._id} enviado, pero no se guardó en Enviados.`);
    }
}

async function reclamarCorreoProgramado(filter) {
    const now = new Date();
    return CorreoProgramado.findOneAndUpdate({
        ...filter,
        estatus: 'pendiente',
        $or: [
            { processingUntil: null },
            { processingUntil: { $exists: false } },
            { processingUntil: { $lte: now } }
        ]
    }, {
        $set: { processingUntil: new Date(now.getTime() + 5 * 60 * 1000) }
    }, { new: true });
}

async function procesarCorreoProgramado(correo) {
    try {
        await enviarCorreoProgramado(correo);
        const result = await CorreoProgramado.updateOne(
            { _id: correo._id, estatus: 'pendiente', processingUntil: correo.processingUntil },
            { $set: { estatus: 'enviado' }, $unset: { processingUntil: 1 } }
        );
        if (!result.matchedCount) {
            throw new Error('El correo se envió, pero no fue posible actualizar su estatus en la base de datos.');
        }
    } catch (error) {
        await CorreoProgramado.updateOne(
            { _id: correo._id, estatus: 'pendiente', processingUntil: correo.processingUntil },
            { $unset: { processingUntil: 1 } }
        );
        throw error;
    }
}

async function procesarCorreosProgramados() {
    let processed = 0;
    for (let index = 0; index < 20; index += 1) {
        const correo = await reclamarCorreoProgramado({ fechaProgramada: { $lte: new Date() } });
        if (!correo) break;
        try {
            await procesarCorreoProgramado(correo);
            processed += 1;
        } catch (error) {
            console.error(`[CorreoProgramado] Falló el envío ${correo._id}; quedará pendiente para reintento:`, error);
        }
    }
    return processed;
}

async function programarCorreo(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Selecciona una empresa para programar el correo.' });
    }
    const destinatario = parseEmailAddresses(req.body?.destinatario);
    const cc = parseEmailAddresses(req.body?.cc || '');
    const asunto = typeof req.body?.asunto === 'string' ? req.body.asunto.trim() : '';
    const mensaje = typeof req.body?.mensaje === 'string' ? req.body.mensaje : '';
    const fechaProgramada = new Date(req.body?.fechaProgramada);
    const importance = ['normal', 'high', 'low'].includes(req.body?.importance) ? req.body.importance : 'normal';
    const requestReadReceipt = req.body?.requestReadReceipt === true;
    const followUp = req.body?.followUp === true;
    const attachmentResult = validateScheduledAttachments(req.body?.attachments ?? []);

    if (!destinatario.length
        || destinatario.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        || cc.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        || !asunto || asunto.length > 998
        || !mensaje.trim()
        || Number.isNaN(fechaProgramada.getTime())
        || fechaProgramada <= new Date()
        || attachmentResult.error) {
        return res.status(attachmentResult.status || 400).json({
            success: false,
            error: attachmentResult.error || 'Indica destinatarios válidos, asunto, mensaje y una fecha futura válida.'
        });
    }
    try {
        const safeMessage = sanitizeHtml(mensaje, EMAIL_HTML_OPTIONS);
        const hasContent = sanitizeHtml(safeMessage, {
            ...EMAIL_HTML_OPTIONS,
            exclusiveFilter: frame => frame.tag === 'div'
                && ['true'].includes(frame.attribs['data-email-signature'] || frame.attribs['data-original-quote'])
        }).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
        if (!hasContent) {
            return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío.' });
        }
        const scheduled = await CorreoProgramado.create({
            empresaId,
            destinatario,
            cc,
            asunto,
            mensaje: safeMessage,
            attachments: attachmentResult.attachments,
            importance,
            requestReadReceipt,
            followUp,
            fechaProgramada,
            estatus: 'pendiente'
        });
        const scheduledSummary = scheduled.toObject();
        scheduledSummary.attachments = scheduledSummary.attachments.map(({ name }) => ({ name }));
        return res.status(201).json({
            success: true,
            message: 'Correo programado correctamente.',
            scheduled: scheduledSummary
        });
    } catch (error) {
        console.error('[CorreoProgramado] Error al programar correo:', error);
        return res.status(500).json({ success: false, error: 'No fue posible programar el correo.' });
    }
}

async function getScheduledEmails(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Selecciona una empresa para consultar sus correos programados.' });
    }
    try {
        const scheduled = await CorreoProgramado.find({ empresaId, estatus: 'pendiente' })
            .sort({ fechaProgramada: 1 })
            .select('-attachments.content -processingUntil')
            .lean();
        const count = await CorreoProgramado.countDocuments({ empresaId, estatus: 'pendiente' });
        return res.json({ success: true, scheduled, count });
    } catch (error) {
        console.error('[CorreoProgramado] Error al consultar programados:', error);
        return res.status(500).json({ success: false, error: 'No fue posible consultar los correos programados.' });
    }
}

async function cancelScheduledEmail(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Selecciona una empresa para cancelar el correo.' });
    }
    try {
        const cancelled = await CorreoProgramado.findOneAndUpdate({
            _id: req.params.id,
            empresaId,
            estatus: 'pendiente',
            $or: [
                { processingUntil: null },
                { processingUntil: { $exists: false } },
                { processingUntil: { $lte: new Date() } }
            ]
        }, {
            $set: { estatus: 'cancelado' },
            $unset: { processingUntil: 1 }
        }, { new: true });
        if (!cancelled) {
            return res.status(404).json({ success: false, error: 'El correo no existe, ya se está procesando o ya no está pendiente.' });
        }
        return res.json({ success: true, message: 'Correo programado cancelado.' });
    } catch (error) {
        console.error('[CorreoProgramado] Error al cancelar correo:', error);
        return res.status(400).json({ success: false, error: 'No fue posible cancelar el correo programado.' });
    }
}

async function sendScheduledEmailNow(req, res) {
    const empresaId = resolveScheduledCompanyId(req);
    if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Selecciona una empresa para enviar el correo.' });
    }
    try {
        const correo = await reclamarCorreoProgramado({ _id: req.params.id, empresaId });
        if (!correo) {
            return res.status(404).json({ success: false, error: 'El correo no existe, ya se está procesando o ya no está pendiente.' });
        }
        await procesarCorreoProgramado(correo);
        return res.json({ success: true, message: 'Correo programado enviado.' });
    } catch (error) {
        console.error('[CorreoProgramado] Error al enviar ahora:', error);
        return res.status(502).json({ success: false, error: error.message || 'No fue posible enviar el correo programado.' });
    }
}

async function replyEmail(req, res) {
    const destinatarios = typeof req.body?.destinatario === 'string'
        ? [...new Set(req.body.destinatario.split(/[;,]/).map(address => address.trim()).filter(Boolean))]
        : [];
    const copias = typeof req.body?.cc === 'string'
        ? [...new Set(req.body.cc.split(/[;,]/).map(address => address.trim()).filter(Boolean))]
        : [];
    const asuntoOriginal = typeof req.body.asunto === 'string' ? req.body.asunto.trim().replace(/[\r\n]+/g, ' ') : '';
    const mensaje = typeof req.body.mensaje === 'string' ? req.body.mensaje.trim() : '';
    const tipo = ['new', 'reply', 'replyAll', 'forward'].includes(req.body?.tipo) ? req.body.tipo : 'reply';
    const attachments = req.body?.attachments ?? [];
    const importance = ['high', 'low'].includes(req.body?.importance) ? req.body.importance : 'normal';
    const requestReadReceipt = req.body?.requestReadReceipt === true;
    const followUp = req.body?.followUp === true;
    const originalMessageId = typeof req.body?.originalMessageId === 'string'
        ? req.body.originalMessageId.trim()
        : '';

    if (!destinatarios.length
        || destinatarios.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        || copias.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
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
        const empresa = empresaId ? await Empresa.findById(empresaId).lean() : null;
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
        const cuerpo = `<div style="font-family:Arial,sans-serif;color:#333333;font-size:14px;">${mensajeSinFirma}</div>${signatureHtml ? `<br>${signatureHtml}` : ''}`;
        const headers = tipo === 'reply' || tipo === 'replyAll'
            ? originalMessageId
                ? { 'In-Reply-To': originalMessageId, References: originalMessageId }
                : undefined
            : undefined;
        const senderEmail = String(empresa?.notificaciones?.email?.smtpUser
            || process.env.SMTP_USER
            || 'cobranza@masesores.mx').replace(/[\r\n]/g, '');
        if (requestReadReceipt && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
            return res.status(503).json({
                success: false,
                error: 'Configura un correo remitente válido para solicitar confirmación de lectura.'
            });
        }
        const emailHeaders = { ...(headers || {}) };
        if (importance === 'high') {
            emailHeaders['X-Priority'] = '1';
            emailHeaders.Importance = 'high';
        } else if (importance === 'low') {
            emailHeaders['X-Priority'] = '5';
            emailHeaders.Importance = 'low';
        }
        if (requestReadReceipt) {
            emailHeaders['Disposition-Notification-To'] = senderEmail;
            emailHeaders['Return-Receipt-To'] = senderEmail;
        }
        if (followUp) emailHeaders['X-Follow-Up'] = 'Follow up';
        await enviarEmail({
            empresaId,
            destinatario: destinatarios,
            cc: copias,
            asunto,
            cuerpo,
            replyTo,
            attachments: attachmentsValidos,
            headers: emailHeaders
        });
        const sentCopySaved = await saveSentCopy({
            destinatarios,
            cc: copias,
            asunto,
            cuerpo,
            attachments: attachmentsValidos,
            headers: emailHeaders,
            empresa,
            followUp
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

module.exports = {
    getInbox,
    getUnreadCount,
    getEmailDetail,
    getFolders,
    createFolder,
    getMailRules,
    createMailRule,
    deleteMailRule,
    getBlacklist,
    addBlacklistEntry,
    removeBlacklistEntry,
    markRead,
    markUnread,
    updateFlag,
    moveEmail,
    moveEmailToSpam,
    moveEmailToTrash,
    replyEmail,
    programarCorreo,
    getScheduledEmails,
    cancelScheduledEmail,
    sendScheduledEmailNow,
    procesarCorreosProgramados
};
