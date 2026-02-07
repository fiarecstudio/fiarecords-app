const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Proyecto = require('../models/Proyecto');
const auth = require('../middleware/auth'); // Asegúrate de tener el middleware de auth

// Aplicar middleware de autenticación si lo usas igual que en servicios
router.use(auth);

// 1. Obtener todos (Solo los NO eliminados)
router.get('/', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ isDeleted: false }).populate('artista').sort({ fecha: 1 });
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Obtener agenda (Solo NO eliminados)
router.get('/agenda', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ 
            isDeleted: false,
            estatus: { $ne: 'Cancelado' },
            proceso: { $ne: 'Completo' }
        }).populate('artista');
        
        const eventos = proyectos.map(p => ({
            id: p._id,
            title: p.nombreProyecto || (p.artista ? p.artista.nombre : 'Sin Nombre'),
            start: p.fecha,
            allDay: false,
            extendedProps: {
                total: p.total,
                estatus: p.estatus,
                proceso: p.proceso,
                servicios: p.items.map(i => i.nombre).join('\n'),
                artistaId: p.artista ? p.artista._id : null,
                artistaNombre: p.artista ? p.artista.nombre : null
            }
        }));
        res.json(eventos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Cotizaciones (Solo NO eliminadas)
router.get('/cotizaciones', async (req, res) => {
    try {
        const cotizaciones = await Proyecto.find({ isDeleted: false, estatus: 'Cotizacion' }).populate('artista');
        res.json(cotizaciones);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Completados (Solo NO eliminados)
router.get('/completos', async (req, res) => {
    try {
        const completos = await Proyecto.find({ isDeleted: false, proceso: 'Completo' }).populate('artista').sort({ fecha: -1 });
        res.json(completos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Pagos Globales (Solo de proyectos NO eliminados)
router.get('/pagos/todos', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ isDeleted: false, "pagos.0": { $exists: true } }).populate('artista');
        let todosPagos = [];
        proyectos.forEach(p => {
            p.pagos.forEach(pago => {
                let nombreArtista = 'General';
                if (p.artista && p.artista.nombre) {
                    nombreArtista = p.artista.nombre;
                } else if (pago.artista) {
                    nombreArtista = pago.artista;
                }
                todosPagos.push({
                    pagoId: pago._id,
                    proyectoId: p._id,
                    monto: pago.monto,
                    metodo: pago.metodo,
                    fecha: pago.fecha,
                    artista: nombreArtista
                });
            });
        });
        todosPagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        res.json(todosPagos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. Por Artista (Solo NO eliminados)
router.get('/por-artista/:id', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ isDeleted: false, artista: req.params.id }).populate('artista').sort({ fecha: -1 });
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 7. Por ID
router.get('/:id', async (req, res) => {
    try {
        const proyecto = await Proyecto.findById(req.params.id).populate('artista');
        if (!proyecto) return res.status(404).json({ error: 'No encontrado' });
        res.json(proyecto);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 8. Crear
router.post('/', async (req, res) => {
    try {
        if (req.body._id && req.body._id.startsWith('temp')) delete req.body._id;
        const nuevo = new Proyecto(req.body);
        const guardado = await nuevo.save();
        res.status(201).json(guardado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ... (Rutas de actualización nombre, fecha, enlace, documentos permanecen igual) ...
router.put('/:id/proceso', async (req, res) => { try { const updateData = { proceso: req.body.proceso }; if (req.body.proceso === 'Agendado') updateData.estatus = 'Pendiente de Pago'; const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, updateData, { new: true }); res.json(actualizado); } catch (e) { res.status(500).json({ error: e.message }); }});
router.put('/:id/estatus', async (req, res) => { try { const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { estatus: req.body.estatus }, { new: true }); res.json(actualizado); } catch (e) { res.status(500).json({ error: e.message }); }});
router.put('/:id/nombre', async (req, res) => { try { const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { nombreProyecto: req.body.nombreProyecto }, { new: true }); res.json(actualizado); } catch (e) { res.status(500).json({ error: e.message }); }});
router.put('/:id/fecha', async (req, res) => { try { const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { fecha: req.body.fecha }, { new: true }); res.json(actualizado); } catch (e) { res.status(500).json({ error: e.message }); }});
router.put('/:id/enlace-entrega', async (req, res) => { try { const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { enlaceEntrega: req.body.enlace }, { new: true }); res.json(actualizado); } catch (e) { res.status(500).json({ error: e.message }); }});
router.post('/:id/pagos', async (req, res) => { try { const proyecto = await Proyecto.findById(req.params.id).populate('artista'); if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' }); const nuevoPago = { monto: req.body.monto, metodo: req.body.metodo, fecha: new Date(), artista: proyecto.artista ? proyecto.artista.nombre : 'General' }; proyecto.pagos.push(nuevoPago); proyecto.montoPagado = (proyecto.montoPagado || 0) + req.body.monto; if (proyecto.montoPagado >= (proyecto.total - (proyecto.descuento || 0))) { proyecto.estatus = 'Pagado'; } await proyecto.save(); res.json(proyecto); } catch (e) { res.status(500).json({ error: e.message }); }});
router.put('/:id/documentos', async (req, res) => { try { const update = {}; if (req.body.tipo === 'contrato') update.detallesContrato = req.body.data; if (req.body.tipo === 'distribucion') update.detallesDistribucion = req.body.data; const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, update, { new: true }).populate('artista'); res.json(actualizado); } catch (e) { res.status(500).json({ error: e.message }); }});

// ==========================================
// RUTAS DE PAPELERA (Soft Delete)
// ==========================================

// 16. Mover a papelera (Soft Delete)
router.delete('/:id', async (req, res) => {
    try {
        await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 18. Obtener todos los de la papelera
router.get('/papelera/all', async (req, res) => {
    try {
        const d = await Proyecto.find({ isDeleted: true }).populate('artista');
        res.json(d);
    } catch (e) { res.status(500).json({ error: 'Error al obtener papelera' }); }
});

// 19. Restaurar proyecto
router.put('/:id/restaurar', async (req, res) => {
    try {
        await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: false });
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: 'Error al restaurar' }); }
});

// 20. Eliminar permanente
router.delete('/:id/permanente', async (req, res) => {
    try {
        await Proyecto.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: 'Error al eliminar permanente' }); }
});

// 21. Vaciar papelera
router.delete('/papelera/vaciar', async (req, res) => {
    try {
        await Proyecto.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: "Error al vaciar la papelera" }); }
});

module.exports = router;
