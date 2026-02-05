// ==========================================
// ARCHIVO: routes/proyectos.js
// ==========================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// IMPORTANTE: Aquí importamos el modelo que definimos en el otro archivo
// Asegúrate de que la ruta '../models/Proyecto' sea correcta
const Proyecto = require('../models/Proyecto');

// --- RUTAS ---

// 1. Obtener todos
router.get('/', async (req, res) => {
    try {
        const proyectos = await Proyecto.find().populate('artista').sort({ fecha: 1 });
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Obtener agenda (activos y no cancelados)
router.get('/agenda', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ 
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

// 3. Obtener cotizaciones
router.get('/cotizaciones', async (req, res) => {
    try {
        const cotizaciones = await Proyecto.find({ estatus: 'Cotizacion' }).populate('artista');
        res.json(cotizaciones);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Obtener completados
router.get('/completos', async (req, res) => {
    try {
        const completos = await Proyecto.find({ proceso: 'Completo' }).populate('artista').sort({ fecha: -1 });
        res.json(completos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Obtener pagos
router.get('/pagos/todos', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ "pagos.0": { $exists: true } });
        let todosPagos = [];
        proyectos.forEach(p => {
            p.pagos.forEach(pago => {
                todosPagos.push({
                    pagoId: pago._id,
                    proyectoId: p._id,
                    monto: pago.monto,
                    metodo: pago.metodo,
                    fecha: pago.fecha,
                    artista: pago.artista || (p.artista ? 'Artista' : 'General')
                });
            });
        });
        todosPagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        res.json(todosPagos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. Obtener por Artista
router.get('/por-artista/:id', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ artista: req.params.id }).populate('artista').sort({ fecha: -1 });
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 7. Obtener UNO por ID
router.get('/:id', async (req, res) => {
    try {
        const proyecto = await Proyecto.findById(req.params.id).populate('artista');
        if (!proyecto) return res.status(404).json({ error: 'No encontrado' });
        res.json(proyecto);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 8. Crear Proyecto
router.post('/', async (req, res) => {
    try {
        if (req.body._id && req.body._id.startsWith('temp')) delete req.body._id;
        const nuevo = new Proyecto(req.body);
        const guardado = await nuevo.save();
        res.status(201).json(guardado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 9. Actualizar Proceso
router.put('/:id/proceso', async (req, res) => {
    try {
        const updateData = { proceso: req.body.proceso };
        if (req.body.proceso === 'Agendado') updateData.estatus = 'Pendiente de Pago';
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 10. Actualizar Estatus (Cancelar)
router.put('/:id/estatus', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { estatus: req.body.estatus }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 11. Actualizar Nombre
router.put('/:id/nombre', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { nombreProyecto: req.body.nombreProyecto }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 12. Actualizar Fecha
router.put('/:id/fecha', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { fecha: req.body.fecha }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 13. Enlace Entrega
router.put('/:id/enlace-entrega', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { enlaceEntrega: req.body.enlace }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 14. Agregar Pago
router.post('/:id/pagos', async (req, res) => {
    try {
        const proyecto = await Proyecto.findById(req.params.id).populate('artista');
        if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });

        const nuevoPago = {
            monto: req.body.monto,
            metodo: req.body.metodo,
            fecha: new Date(),
            artista: proyecto.artista ? proyecto.artista.nombre : 'General'
        };

        proyecto.pagos.push(nuevoPago);
        proyecto.montoPagado = (proyecto.montoPagado || 0) + req.body.monto;
        
        if (proyecto.montoPagado >= proyecto.total - (proyecto.descuento || 0)) {
            proyecto.estatus = 'Pagado';
        }

        await proyecto.save();
        res.json(proyecto);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 15. Documentos
router.put('/:id/documentos', async (req, res) => {
    try {
        const update = {};
        if (req.body.tipo === 'contrato') update.detallesContrato = req.body.data;
        if (req.body.tipo === 'distribucion') update.detallesDistribucion = req.body.data;
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, update, { new: true }).populate('artista');
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 16. Eliminar
router.delete('/:id', async (req, res) => {
    try {
        await Proyecto.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 17. Eliminar Pago
router.delete('/:id/pagos/:pagoId', async (req, res) => {
    try {
        const proyecto = await Proyecto.findById(req.params.id);
        if(!proyecto) return res.status(404).json({error: 'Proyecto no encontrado'});

        const pago = proyecto.pagos.id(req.params.pagoId);
        if(!pago) return res.status(404).json({error: 'Pago no encontrado'});

        proyecto.montoPagado -= pago.monto;
        pago.deleteOne(); 
        
        if (proyecto.montoPagado < (proyecto.total - (proyecto.descuento || 0))) {
            proyecto.estatus = 'Pendiente de Pago';
        }

        await proyecto.save();
        res.json(proyecto);
    } catch(e) { res.status(500).json({error: e.message}); }
});

module.exports = router;