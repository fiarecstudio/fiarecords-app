const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Proyecto = require('../models/Proyecto');
const Artista = require('../models/Artista'); 
const auth = require('../middleware/auth');   
const { google } = require('googleapis');

// --- CONFIGURACIÓN GMAIL ---
const OAuth2 = google.auth.OAuth2;
const createTransporter = async () => {
    const oauth2Client = new OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET, "https://developers.google.com/oauthplayground");
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    return oauth2Client;
};

const makeBody = (to, from, subject, message) => {
    const str = [`To: ${to}`, `From: ${from}`, `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=utf-8', '', message].join('\n');
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const enviarNotificacion = async (emailDestino, asunto, htmlContent) => {
    if (!emailDestino) return;
    try {
        const authClient = await createTransporter();
        const gmail = google.gmail({ version: 'v1', auth: authClient });
        await gmail.users.messages.send({ userId: 'me', requestBody: { raw: makeBody(emailDestino, `"Fia Records Studio" <${process.env.EMAIL_USER}>`, asunto, htmlContent) } });
        console.log(`📧 Notificación enviada a: ${emailDestino}`);
    } catch (error) { console.error("❌ Error enviando correo:", error.message); }
};

const getArtistaEmail = async (artistaId) => {
    if (!artistaId) return null;
    try { const artista = await Artista.findById(artistaId); return artista ? artista.correo : null; } catch(e) { return null; }
};

const formatearFechaMexico = (fechaIso) => {
    return new Date(fechaIso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
};

router.use(auth);

const getFiltroUsuario = async (req) => {
    let filtro = { isDeleted: { $ne: true } };
    if (req.user.role !== 'cliente') return filtro;
    if (req.user.artistaId) filtro.artista = new mongoose.Types.ObjectId(req.user.artistaId);
    else filtro.artista = new mongoose.Types.ObjectId(); 
    return filtro;
};

// --- NUEVA RUTA: VERIFICAR DISPONIBILIDAD ---
router.get('/disponibilidad', async (req, res) => {
    try {
        const { fecha } = req.query; // YYYY-MM-DD
        if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });

        const start = new Date(fecha); start.setHours(0, 0, 0, 0);
        const end = new Date(fecha); end.setHours(23, 59, 59, 999);

        // Buscar proyectos activos ese día
        const ocupados = await Proyecto.find({
            fecha: { $gte: start, $lte: end },
            estatus: { $ne: 'Cancelado' },
            proceso: { $ne: 'Cotizacion' }, 
            isDeleted: false
        }).select('fecha nombreProyecto');

        const horarios = ocupados.map(p => {
            const d = new Date(p.fecha);
            return {
                hora: d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'),
                proyecto: p.nombreProyecto
            };
        });
        res.json(horarios);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => { try { const filtro = await getFiltroUsuario(req); const proyectos = await Proyecto.find(filtro).populate('artista').sort({ fecha: 1 }); res.json(proyectos); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/agenda', async (req, res) => { try { const filtro = await getFiltroUsuario(req); filtro.estatus = { $ne: 'Cancelado' }; filtro.proceso = { $ne: 'Completo' }; const proyectos = await Proyecto.find(filtro).populate('artista'); const eventos = proyectos.map(p => ({ id: p._id, title: p.nombreProyecto || (p.artista ? p.artista.nombre : 'Sin Nombre'), start: p.fecha, allDay: false, extendedProps: { total: p.total, estatus: p.estatus, proceso: p.proceso, servicios: p.items ? p.items.map(i => i.nombre).join('\n') : '', artistaId: p.artista ? p.artista._id : null } })); res.json(eventos); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/cotizaciones', async (req, res) => { try { const filtro = await getFiltroUsuario(req); filtro.estatus = 'Cotizacion'; const cotizaciones = await Proyecto.find(filtro).populate('artista'); res.json(cotizaciones); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/completos', async (req, res) => { try { const filtro = await getFiltroUsuario(req); filtro.proceso = 'Completo'; const completos = await Proyecto.find(filtro).populate('artista').sort({ fecha: -1 }); res.json(completos); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/pagos/todos', async (req, res) => { try { const filtro = await getFiltroUsuario(req); filtro["pagos.0"] = { $exists: true }; const proyectos = await Proyecto.find(filtro).populate('artista'); let todosPagos = []; proyectos.forEach(p => { if (p.pagos && p.pagos.length > 0) { p.pagos.forEach(pago => { todosPagos.push({ pagoId: pago._id, proyectoId: p._id, monto: pago.monto, metodo: pago.metodo, fecha: pago.fecha, artista: p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'General' }); }); } }); todosPagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); res.json(todosPagos); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/por-artista/:id', async (req, res) => { try { if (req.user.role === 'cliente') { const filtroPropio = await getFiltroUsuario(req); if (filtroPropio.artista && filtroPropio.artista.toString() !== req.params.id) { return res.status(403).json({ error: 'No autorizado.' }); } } const proyectos = await Proyecto.find({ artista: req.params.id, isDeleted: { $ne: true } }).populate('artista').sort({ fecha: -1 }); res.json(proyectos); } catch (e) { res.status(500).json({ error: 'Error al obtener historial.' }); } });
router.get('/:id', async (req, res) => { try { const proyecto = await Proyecto.findById(req.params.id).populate('artista'); if (!proyecto) return res.status(404).json({ error: 'No encontrado' }); if (req.user.role === 'cliente') { const filtro = await getFiltroUsuario(req); if (!proyecto.artista || proyecto.artista._id.toString() !== filtro.artista.toString()) { return res.status(403).json({ error: 'No autorizado.' }); } } res.json(proyecto); } catch (e) { res.status(500).json({ error: e.message }); } });

router.post('/', async (req, res) => {
    try {
        if (req.body._id && req.body._id.startsWith('temp')) delete req.body._id;
        let datos = { ...req.body, isDeleted: false };
        if (req.user.role === 'cliente') { const filtro = await getFiltroUsuario(req); if (filtro.artista) { datos.artista = filtro.artista; } else { return res.status(400).json({ error: 'Error: Sin perfil de artista.' }); } }
        const nuevo = new Proyecto(datos);
        const guardado = await nuevo.save();
        if (guardado.proceso === 'Agendado' && guardado.artista) { const email = await getArtistaEmail(guardado.artista); const fechaFmt = formatearFechaMexico(guardado.fecha); enviarNotificacion(email, "📅 Cita Confirmada - Fia Records", `<div style="font-family: Arial;"><h2>¡Proyecto Agendado!</h2><p>Tu proyecto <strong>${guardado.nombreProyecto}</strong> ha sido confirmado.</p><p><strong>Fecha:</strong> ${fechaFmt}</p></div>`); }
        res.status(201).json(guardado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/proceso', async (req, res) => { try { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); const updateData = { proceso: req.body.proceso }; if (req.body.proceso === 'Agendado') updateData.estatus = 'Pendiente de Pago'; const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate('artista'); if (req.body.proceso === 'Agendado' && actualizado.artista) { const email = actualizado.artista.correo; const fechaFmt = formatearFechaMexico(actualizado.fecha); enviarNotificacion(email, "✅ Tu cita ha sido confirmada", `<div style="font-family: Arial;"><h2>¡Cotización Aprobada!</h2><p>Tu proyecto <strong>${actualizado.nombreProyecto}</strong> ya está en nuestra agenda.</p><p><strong>Fecha:</strong> ${fechaFmt}</p></div>`); } res.json(actualizado); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/:id/estatus', async (req, res) => { try { const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { estatus: req.body.estatus }, { new: true }).populate('artista'); if (req.body.estatus === 'Cancelado' && actualizado.artista) { const email = actualizado.artista.correo; enviarNotificacion(email, "❌ Cita Cancelada - Fia Records", `<div style="font-family: Arial;"><h2>Cita Cancelada</h2><p>El proyecto <strong>${actualizado.nombreProyecto}</strong> ha sido cancelado.</p></div>`); } res.json(actualizado); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/:id/fecha', async (req, res) => { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { fecha: req.body.fecha }, { new: true }).populate('artista'); if (actualizado.artista) { const email = actualizado.artista.correo; const fechaFmt = formatearFechaMexico(req.body.fecha); enviarNotificacion(email, "📅 Cambio de Horario", `<p>Tu proyecto <strong>${actualizado.nombreProyecto}</strong> se movió al: <strong>${fechaFmt}</strong> (Hora CDMX).</p>`); } res.json(actualizado); });
router.put('/:id/nombre', async (req, res) => { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { nombreProyecto: req.body.nombreProyecto }, { new: true }); res.json(actualizado); });

// --- RUTA CLAVE PARA GUARDAR ENLACE EN BD ---
router.put('/:id/enlace-entrega', async (req, res) => {
    try {
        const proyecto = await Proyecto.findById(req.params.id);
        if(!proyecto) return res.status(404).json({error: "No existe el proyecto"});
        if(req.user.role === 'cliente') { const filtro = await getFiltroUsuario(req); if(!proyecto.artista || proyecto.artista.toString() !== filtro.artista.toString()) { return res.status(403).json({ error: 'No autorizado' }); } }
        
        // ACTUALIZA Y DEVUELVE EL NUEVO OBJETO
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { enlaceEntrega: req.body.enlace }, { new: true }).populate('artista');
        
        if (req.body.enlace && actualizado.artista && req.user.role !== 'cliente') {
            const email = actualizado.artista.correo;
            enviarNotificacion(email, "🚀 Entrega de Material - Fia Records", `<div style="font-family: sans-serif; text-align: center; padding: 20px; border: 1px solid #ddd; border-radius: 10px;"><h2>¡Tu material está listo! 🎵</h2><p>El proyecto <strong>${actualizado.nombreProyecto}</strong> ha sido finalizado.</p><br><a href="${req.body.enlace}" style="background-color: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px;">DESCARGAR AHORA</a></div>`);
        }
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: "Error al guardar el enlace" }); }
});

router.post('/:id/pagos', async (req, res) => { try { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); const proyecto = await Proyecto.findById(req.params.id).populate('artista'); if (!proyecto) return res.status(404).json({ error: 'No encontrado' }); const nuevoPago = { monto: req.body.monto, metodo: req.body.metodo, fecha: new Date(), artista: proyecto.artista ? proyecto.artista.nombre : 'General' }; proyecto.pagos.push(nuevoPago); proyecto.montoPagado = (proyecto.montoPagado || 0) + parseFloat(req.body.monto); if (proyecto.montoPagado >= (proyecto.total - (proyecto.descuento || 0))) { proyecto.estatus = 'Pagado'; } await proyecto.save(); res.json(proyecto); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/:id/documentos', async (req, res) => { try { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); const update = {}; if (req.body.tipo === 'contrato') update.detallesContrato = req.body.data; if (req.body.tipo === 'distribucion') update.detallesDistribucion = req.body.data; const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, update, { new: true }).populate('artista'); res.json(actualizado); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/:id', async (req, res) => { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); try { await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: true }); res.status(204).send(); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/papelera/all', async (req, res) => { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); try { const proyectos = await Proyecto.find({ isDeleted: true }).populate('artista'); res.json(proyectos); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/:id/restaurar', async (req, res) => { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); try { await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: false }); res.status(204).send(); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/:id/permanente', async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo Admin' }); try { await Proyecto.findByIdAndDelete(req.params.id); res.status(204).send(); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/papelera/vaciar', async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo Admin' }); try { await Proyecto.deleteMany({ isDeleted: true }); res.status(204).send(); } catch (err) { res.status(500).json({ error: "Error" }); } });
router.delete('/:id/pagos/:pagoId', async (req, res) => { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); try { const proyecto = await Proyecto.findById(req.params.id); if(!proyecto) return res.status(404).json({error: 'No encontrado'}); const pago = proyecto.pagos.id(req.params.pagoId); if(!pago) return res.status(404).json({error: 'Pago no encontrado'}); proyecto.montoPagado -= pago.monto; pago.deleteOne(); if (proyecto.montoPagado < (proyecto.total - (proyecto.descuento || 0))) proyecto.estatus = 'Pendiente de Pago'; await proyecto.save(); res.json(proyecto); } catch(e) { res.status(500).json({error: e.message}); } });

module.exports = router;