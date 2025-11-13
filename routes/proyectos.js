// routes/proyectos.js
const express = require('express');
const router = express.Router();
const Proyecto = require('../models/Proyecto');
const auth = require('../middleware/auth');

router.use(auth);

// --- RUTA PARA VISTA DE ARTISTA ---
router.get('/por-artista/:artistaId', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ artista: req.params.artistaId, isDeleted: false }).populate('artista').sort({ fecha: -1 });
        res.json(proyectos);
    } catch (err) { res.status(500).json({ error: 'Error al obtener los proyectos del artista' }); }
});

// --- RUTA PARA GUARDAR DETALLES DE DOCUMENTOS ---
router.put('/:id/documentos', async (req, res) => {
    try {
        const { tipo, data } = req.body;
        let updateData = {};
        if (tipo === 'contrato') { updateData.detallesContrato = data; } 
        else if (tipo === 'distribucion') { updateData.detallesDistribucion = data; } 
        else { return res.status(400).json({ error: 'Tipo de documento no válido' }); }
        const proyecto = await Proyecto.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
        res.json(proyecto);
    } catch (err) { res.status(500).json({ error: 'Error al guardar los detalles del documento' }); }
});

// --- RUTA PARA GUARDAR EL ENLACE DE ENTREGA ---
router.put('/:id/enlace-entrega', async (req, res) => {
    try {
        const { enlace } = req.body;
        const proyecto = await Proyecto.findByIdAndUpdate(req.params.id, { $set: { enlaceEntrega: enlace } }, { new: true });
        if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
        res.json(proyecto);
    } catch (err) { res.status(500).json({ error: 'Error al guardar el enlace' }); }
});

// --- ¡NUEVA RUTA PARA ACTUALIZAR EL NOMBRE DEL PROYECTO! ---
router.put('/:id/nombre', async (req, res) => {
    try {
        const { nombreProyecto } = req.body;
        const proyecto = await Proyecto.findByIdAndUpdate(req.params.id, { $set: { nombreProyecto: nombreProyecto } }, { new: true });
        if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
        res.json(proyecto);
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar el nombre del proyecto' });
    }
});

// (El resto de las rutas no cambia)
router.get('/pagos/todos', async (req, res) => { try { const pagos = await Proyecto.aggregate([ { $unwind: '$pagos' }, { $sort: { 'pagos.fecha': -1 } }, { $lookup: { from: 'artistas', localField: 'artista', foreignField: '_id', as: 'artistaInfo' } }, { $project: { _id: '$pagos._id', pagoId: '$pagos._id', fecha: '$pagos.fecha', monto: '$pagos.monto', metodo: '$pagos.metodo', proyectoId: '$_id', artista: { $ifNull: [ { $arrayElemAt: ['$artistaInfo.nombre', 0] }, 'Público General' ] } }}, { $sort: { 'artista': 1, 'fecha': -1 } } ]); res.json(pagos); } catch (err) { console.error("Error al obtener todos los pagos:", err); res.status(500).json({ error: 'Error al obtener el historial de pagos' }); } });
router.delete('/:proyectoId/pagos/:pagoId', async (req, res) => { try { const { proyectoId, pagoId } = req.params; const proyecto = await Proyecto.findById(proyectoId); if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' }); const pagoAEliminar = proyecto.pagos.id(pagoId); if (!pagoAEliminar) return res.status(404).json({ error: 'Pago no encontrado' }); proyecto.montoPagado -= pagoAEliminar.monto; if (proyecto.montoPagado <= 0) { proyecto.montoPagado = 0; proyecto.estatus = 'Pendiente de Pago'; } else if (proyecto.montoPagado < proyecto.total) { proyecto.estatus = 'Pagado Parcialmente'; } else { proyecto.estatus = 'Pagado'; } proyecto.pagos.pull(pagoId); await proyecto.save(); res.status(200).json({ message: 'Pago eliminado correctamente' }); } catch (err) { console.error("Error al eliminar pago:", err); res.status(500).json({ error: 'Error del servidor al eliminar el pago' }); } });
router.get('/cotizaciones', async (req, res) => { try { const cotizaciones = await Proyecto.find({ isDeleted: false, proceso: 'Cotizacion' }).populate('artista', 'nombre').sort({ createdAt: -1 }); res.json(cotizaciones); } catch (err) { res.status(500).json({ error: 'Error al obtener cotizaciones' }); } });
router.get('/', async (req, res) => { try { const proyectos = await Proyecto.find({ isDeleted: false, proceso: { $nin: ['Completo', 'Cotizacion'] } }).populate('artista', 'nombre').populate('items.servicio', 'nombre').sort({ createdAt: -1 }); res.json(proyectos); } catch (err) { res.status(500).json({ error: 'Error del servidor' }); } });
router.get('/completos', async (req, res) => { try { const proyectos = await Proyecto.find({ isDeleted: false, proceso: 'Completo' }).populate('artista', 'nombre').sort({ fecha: -1 }); res.json(proyectos); } catch (err) { res.status(500).json({ error: 'Error del servidor' }); } });
router.get('/agenda', async (req, res) => { try { const colorMap={'Agendado':'#5a67d8','Grabacion':'#d53f8c','Edicion':'#dd6b20','Mezcla':'#38a169','Mastering':'#00b5d8','default':'#808080'}; const proyectos = await Proyecto.find({isDeleted:false,proceso:{$nin:['Cotizacion','Completo']}}).populate('artista').populate('items.servicio','nombre'); const eventos = proyectos.map(p => { const serviciosLista = p.items.map(item => `- ${item.unidades}x ${item.servicio ? item.servicio.nombre : 'N/A'}`).join('\n'); const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Público General'; return {id:p._id,title:`${p.nombreProyecto || artistaNombre}`,start:p.fecha,color:colorMap[p.proceso]||colorMap.default,extendedProps:{artistaId: p.artista ? p.artista._id : null, artistaNombre: p.artista ? p.artista.nombre : 'Público General', proceso:p.proceso,estatus:p.estatus,total:p.total,servicios:serviciosLista}}}); res.json(eventos); } catch (err) { console.error("Error en agenda:", err); res.status(500).json({ error: 'Error al obtener datos para la agenda' }); } });
router.get('/:id', async (req, res) => { try { const proyecto = await Proyecto.findById(req.params.id).populate('artista', 'nombre').populate('items.servicio', 'nombre'); if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' }); res.json(proyecto); } catch (err) { res.status(500).json({ error: 'Error del servidor' }); } });
router.post('/', async (req, res) => { try { let datosProyecto = req.body; if (datosProyecto.artista === 'publico_general' || !datosProyecto.artista) { datosProyecto.artista = null; } const nuevoProyecto = new Proyecto(datosProyecto); await nuevoProyecto.save(); res.status(201).json(nuevoProyecto); } catch (err) { console.error("Error al guardar proyecto:", err); res.status(500).json({ error: 'Error al guardar el proyecto. Revisa los datos enviados.' }); } });
router.post('/:id/pagos', async (req, res) => { try { const { monto, metodo } = req.body; const proyecto = await Proyecto.findById(req.params.id); if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' }); proyecto.pagos.push({ monto, metodo }); proyecto.montoPagado = (proyecto.montoPagado || 0) + monto; if (proyecto.montoPagado >= proyecto.total) { proyecto.estatus = 'Pagado'; } else { proyecto.estatus = 'Pagado Parcialmente'; } await proyecto.save(); const proyectoActualizado = await Proyecto.findById(proyecto._id).populate('artista', 'nombre').populate('items.servicio', 'nombre'); res.json(proyectoActualizado); } catch (err) { console.error("Error al registrar pago:", err); res.status(500).json({ error: 'Error al registrar el pago' }); } });
async function actualizarCampo(req, res) { const { id } = req.params; const campo = Object.keys(req.body)[0]; const valor = req.body[campo]; try { const proyecto = await Proyecto.findByIdAndUpdate(id, { [campo]: valor }, { new: true }); if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' }); res.json(proyecto); } catch (err) { res.status(500).json({ error: 'Error al actualizar' }); } }
router.put('/:id/proceso', actualizarCampo);
router.put('/:id/prioridad', actualizarCampo);
router.put('/:id/fecha', actualizarCampo);
router.delete('/:id', async (req, res) => { try { await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: true }); res.status(204).send(); } catch (err) { res.status(500).json({ error: "Error al mover a la papelera" }); } });

module.exports = router;