// ==========================================
// ARCHIVO: routes/proyectos.js
// ==========================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Definir el esquema aquí o importarlo si tienes modelo separado
const ItemSchema = new mongoose.Schema({
    servicio: String, // ID del servicio
    nombre: String,
    unidades: Number,
    precioUnitario: Number
});

const PagoSchema = new mongoose.Schema({
    monto: Number,
    metodo: String,
    fecha: Date,
    artista: String
});

const ProyectoSchema = new mongoose.Schema({
    artista: { type: mongoose.Schema.Types.ObjectId, ref: 'Artista' }, // Referencia o null
    nombreProyecto: String,
    items: [ItemSchema],
    total: Number,
    descuento: Number,
    montoPagado: { type: Number, default: 0 },
    estatus: String, // 'Cotizacion', 'Pendiente de Pago', 'Pagado', 'Cancelado'
    metodoPago: String,
    fecha: Date,
    prioridad: String,
    proceso: String, // 'Agendado', 'Grabacion', 'Edicion', 'Mezcla', 'Mastering', 'Completo'
    esAlbum: Boolean,
    enlaceEntrega: String,
    pagos: [PagoSchema],
    createdAt: { type: Date, default: Date.now },
    detallesContrato: { type: Object, default: {} },
    detallesDistribucion: { type: Object, default: {} }
});

const Proyecto = mongoose.model('Proyecto', ProyectoSchema);

// --- RUTAS ---

// 1. Obtener todos (para caché inicial)
router.get('/', async (req, res) => {
    try {
        const proyectos = await Proyecto.find().populate('artista').sort({ fecha: 1 });
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Obtener agenda (proyectos activos)
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

// 4. Obtener completados (Historial)
router.get('/completos', async (req, res) => {
    try {
        const completos = await Proyecto.find({ proceso: 'Completo' }).populate('artista').sort({ fecha: -1 });
        res.json(completos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Obtener pagos globales
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

// 8. CREAR PROYECTO
router.post('/', async (req, res) => {
    try {
        // Quitamos _id si viene temp para que Mongo genere uno
        if (req.body._id && req.body._id.startsWith('temp')) delete req.body._id;
        
        const nuevo = new Proyecto(req.body);
        const guardado = await nuevo.save();
        res.status(201).json(guardado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 9. ACTUALIZAR PROCESO (Kanban)
router.put('/:id/proceso', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { 
            proceso: req.body.proceso,
            estatus: req.body.proceso === 'Agendado' ? 'Pendiente de Pago' : undefined // Si se aprueba cotizacion
        }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 10. ACTUALIZAR ESTATUS (Para Cancelar) - ESTA ERA LA RUTA QUE FALTABA
router.put('/:id/estatus', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { 
            estatus: req.body.estatus 
        }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 11. ACTUALIZAR NOMBRE
router.put('/:id/nombre', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { nombreProyecto: req.body.nombreProyecto }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 12. ACTUALIZAR FECHA
router.put('/:id/fecha', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { fecha: req.body.fecha }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 13. ACTUALIZAR ENLACE ENTREGA
router.put('/:id/enlace-entrega', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { enlaceEntrega: req.body.enlace }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 14. AGREGAR PAGO
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
        
        // Auto-actualizar estatus si se paga completo
        if (proyecto.montoPagado >= proyecto.total - (proyecto.descuento || 0)) {
            proyecto.estatus = 'Pagado';
        }

        await proyecto.save();
        res.json(proyecto);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 15. GUARDAR DOCUMENTOS
router.put('/:id/documentos', async (req, res) => {
    try {
        const update = {};
        if (req.body.tipo === 'contrato') update.detallesContrato = req.body.data;
        if (req.body.tipo === 'distribucion') update.detallesDistribucion = req.body.data;
        
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, update, { new: true }).populate('artista');
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 16. ELIMINAR PROYECTO
router.delete('/:id', async (req, res) => {
    try {
        // En un sistema real moveríamos a una colección 'Papelera', aquí borramos físico
        await Proyecto.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 17. ELIMINAR PAGO
router.delete('/:id/pagos/:pagoId', async (req, res) => {
    try {
        const proyecto = await Proyecto.findById(req.params.id);
        if(!proyecto) return res.status(404).json({error: 'Proyecto no encontrado'});

        const pago = proyecto.pagos.id(req.params.pagoId);
        if(!pago) return res.status(404).json({error: 'Pago no encontrado'});

        proyecto.montoPagado -= pago.monto;
        pago.deleteOne(); // Sintaxis Mongoose subdocumento
        
        if (proyecto.montoPagado < proyecto.total) {
            proyecto.estatus = 'Pendiente de Pago';
        }

        await proyecto.save();
        res.json(proyecto);
    } catch(e) { res.status(500).json({error: e.message}); }
});

module.exports = router;