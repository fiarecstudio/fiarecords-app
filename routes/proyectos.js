// ==========================================
// ARCHIVO: routes/proyectos.js (CORREGIDO PARA DATOS ANTIGUOS)
// ==========================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Proyecto = require('../models/Proyecto');

// --- RUTAS GET PRINCIPALES ---

// 1. Obtener todos (Activos + Antiguos sin campo isDeleted)
router.get('/', async (req, res) => {
    try {
        // CAMBIO CLAVE: { $ne: true } significa "Que no sea verdadero"
        // Esto incluye 'false' y también los que no tienen el campo (viejos)
        const proyectos = await Proyecto.find({ isDeleted: { $ne: true } })
                                        .populate('artista')
                                        .sort({ fecha: 1 });
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Obtener agenda
router.get('/agenda', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ 
            estatus: { $ne: 'Cancelado' },
            proceso: { $ne: 'Completo' },
            isDeleted: { $ne: true } // Muestra activos y viejos
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

// 3. Cotizaciones
router.get('/cotizaciones', async (req, res) => {
    try {
        const cotizaciones = await Proyecto.find({ 
            estatus: 'Cotizacion', 
            isDeleted: { $ne: true } 
        }).populate('artista');
        res.json(cotizaciones);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Completados
router.get('/completos', async (req, res) => {
    try {
        const completos = await Proyecto.find({ 
            proceso: 'Completo', 
            isDeleted: { $ne: true } 
        }).populate('artista').sort({ fecha: -1 });
        res.json(completos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Pagos Globales
router.get('/pagos/todos', async (req, res) => {
    try {
        // Filtramos para no traer pagos de proyectos borrados
        const proyectos = await Proyecto.find({ 
            "pagos.0": { $exists: true }, 
            isDeleted: { $ne: true } 
        }).populate('artista');
        
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

// 6. Por Artista
router.get('/por-artista/:id', async (req, res) => {
    try {
        const proyectos = await Proyecto.find({ 
            artista: req.params.id, 
            isDeleted: { $ne: true } 
        }).populate('artista').sort({ fecha: -1 });
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- RUTAS DE PAPELERA ---

router.get('/papelera/all', async (req, res) => {
    try {
        // Aquí SI buscamos explícitamente los borrados (true)
        const proyectos = await Proyecto.find({ isDeleted: true }).populate('artista');
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/restaurar', async (req, res) => {
    try {
        await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: false });
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/permanente', async (req, res) => {
    try {
        await Proyecto.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/papelera/vaciar', async (req, res) => {
    try {
        await Proyecto.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: "Error al vaciar la papelera" }); }
});


// --- RUTAS STANDARD ---

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
        // Al crear uno nuevo, le ponemos isDeleted: false explícitamente
        const datos = { ...req.body, isDeleted: false };
        const nuevo = new Proyecto(datos);
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

// 11. Nombre
router.put('/:id/nombre', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { nombreProyecto: req.body.nombreProyecto }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 12. Fecha
router.put('/:id/fecha', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { fecha: req.body.fecha }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 13. Enlace
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
        
        if (proyecto.montoPagado >= (proyecto.total - (proyecto.descuento || 0))) {
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

// 16. Eliminar (SOFT DELETE)
router.delete('/:id', async (req, res) => {
    try {
        // Marcamos como borrado en lugar de eliminar
        await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
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