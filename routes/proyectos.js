// ==========================================
// ARCHIVO: routes/proyectos.js (FINAL - ADAPTADO A TUS MODELOS)
// ==========================================
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Proyecto = require('../models/Proyecto');
const Artista = require('../models/Artista'); 
const auth = require('../middleware/auth');   

// Middleware de seguridad general
router.use(auth);

// ------------------------------------------------------------------
// FUNCIÓN INTELIGENTE: FILTRO DE USUARIO
// Conecta el Usuario logueado con su perfil de Artista
// ------------------------------------------------------------------
const getFiltroUsuario = async (req) => {
    // 1. Filtro base: no mostrar lo borrado
    let filtro = { isDeleted: { $ne: true } };

    // 2. Si es ADMIN, STAFF o INGENIERO, ven todo.
    // (Ajusta los roles según tu sistema, aquí permito ver a todos menos 'cliente')
    if (!req.user.role || req.user.role !== 'cliente') {
        return filtro;
    }

    // 3. LOGICA PARA CLIENTES
    // Buscamos al Artista usando el ID del usuario conectado (req.user.id)
    // Esto es gracias al campo 'usuarioId' que vi en tu modelo Artista.
    
    // Paso A: Buscar por ID de Usuario (La forma más exacta)
    let artistaVinculado = await Artista.findOne({ usuarioId: req.user.id });

    // Paso B: Fallback (Si no tiene usuarioId vinculado, buscamos por correo)
    if (!artistaVinculado) {
        console.log(`Buscando artista por correo para: ${req.user.email}`);
        artistaVinculado = await Artista.findOne({ 
            correo: { $regex: new RegExp(`^${req.user.email}$`, 'i') } // 'correo' es el campo en tu modelo Artista
        });
    }

    // 4. Aplicar el filtro
    if (artistaVinculado) {
        filtro.artista = artistaVinculado._id;
        // Guardamos el ID en el request por si lo ocupamos más abajo
        req.user.artistaId = artistaVinculado._id; 
    } else {
        // SEGURIDAD: Es cliente pero no encontramos su Artista. BLOQUEAR.
        console.warn(`ALERTA: Usuario cliente ${req.user.email} sin perfil de artista.`);
        filtro.artista = new mongoose.Types.ObjectId(); // ID que no existe
    }

    return filtro;
};

// ------------------------------------------------------------------
// RUTAS GET (LECTURA)
// ------------------------------------------------------------------

// 1. Todos los proyectos
router.get('/', async (req, res) => {
    try {
        const filtro = await getFiltroUsuario(req);
        const proyectos = await Proyecto.find(filtro)
                                       .populate('artista')
                                       .sort({ fecha: 1 });
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Agenda
router.get('/agenda', async (req, res) => {
    try {
        const filtro = await getFiltroUsuario(req);
        filtro.estatus = { $ne: 'Cancelado' };
        filtro.proceso = { $ne: 'Completo' };

        const proyectos = await Proyecto.find(filtro).populate('artista');
        
        const eventos = proyectos.map(p => ({
            id: p._id,
            title: p.nombreProyecto || (p.artista ? p.artista.nombre : 'Sin Nombre'),
            start: p.fecha,
            allDay: false,
            extendedProps: {
                total: p.total,
                estatus: p.estatus,
                proceso: p.proceso,
                servicios: p.items ? p.items.map(i => i.nombre).join('\n') : '',
                artistaId: p.artista ? p.artista._id : null
            }
        }));
        res.json(eventos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Cotizaciones
router.get('/cotizaciones', async (req, res) => {
    try {
        const filtro = await getFiltroUsuario(req);
        filtro.estatus = 'Cotizacion';
        const cotizaciones = await Proyecto.find(filtro).populate('artista');
        res.json(cotizaciones);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Completados
router.get('/completos', async (req, res) => {
    try {
        const filtro = await getFiltroUsuario(req);
        filtro.proceso = 'Completo';
        const completos = await Proyecto.find(filtro).populate('artista').sort({ fecha: -1 });
        res.json(completos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Pagos
router.get('/pagos/todos', async (req, res) => {
    try {
        const filtro = await getFiltroUsuario(req);
        filtro["pagos.0"] = { $exists: true }; 

        const proyectos = await Proyecto.find(filtro).populate('artista');
        
        let todosPagos = [];
        proyectos.forEach(p => {
            if (p.pagos && p.pagos.length > 0) {
                p.pagos.forEach(pago => {
                    todosPagos.push({
                        pagoId: pago._id,
                        proyectoId: p._id,
                        monto: pago.monto,
                        metodo: pago.metodo,
                        fecha: pago.fecha,
                        artista: p.artista ? p.artista.nombre : 'General'
                    });
                });
            }
        });
        todosPagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        res.json(todosPagos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. Por ID de Artista (Seguridad Reforzada)
router.get('/por-artista/:id', async (req, res) => {
    try {
        if (req.user.role === 'cliente') {
             const filtroPropio = await getFiltroUsuario(req);
             // Validar que el ID solicitado coincida con el ID del artista del usuario
             if (filtroPropio.artista && filtroPropio.artista.toString() !== req.params.id) {
                 return res.status(403).json({ error: 'No autorizado.' });
             }
        }

        const proyectos = await Proyecto.find({ 
            artista: req.params.id, 
            isDeleted: { $ne: true } 
        }).populate('artista').sort({ fecha: -1 });
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 7. Proyecto individual por ID
router.get('/:id', async (req, res) => {
    try {
        const proyecto = await Proyecto.findById(req.params.id).populate('artista');
        if (!proyecto) return res.status(404).json({ error: 'No encontrado' });

        if (req.user.role === 'cliente') {
            const filtro = await getFiltroUsuario(req);
            // Si el proyecto no tiene artista o el ID no coincide, bloqueamos
            if (!proyecto.artista || proyecto.artista._id.toString() !== filtro.artista.toString()) {
                return res.status(403).json({ error: 'No tienes permiso.' });
            }
        }
        res.json(proyecto);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------------------------
// RUTAS POST/PUT (ESCRITURA)
// ------------------------------------------------------------------

// 8. Crear
router.post('/', async (req, res) => {
    try {
        if (req.body._id && req.body._id.startsWith('temp')) delete req.body._id;
        
        let datos = { ...req.body, isDeleted: false };

        // Si es Cliente, asignamos AUTOMÁTICAMENTE su artistaId
        if (req.user.role === 'cliente') {
            const filtro = await getFiltroUsuario(req);
            if (filtro.artista) {
                datos.artista = filtro.artista;
            } else {
                return res.status(400).json({ error: 'Error: No tienes un perfil de artista asociado.' });
            }
        }
        
        const nuevo = new Proyecto(datos);
        const guardado = await nuevo.save();
        res.status(201).json(guardado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 9. Actualizar Proceso
router.put('/:id/proceso', async (req, res) => {
    try {
        if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
        
        const updateData = { proceso: req.body.proceso };
        if (req.body.proceso === 'Agendado') updateData.estatus = 'Pendiente de Pago';
        
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 10. Actualizar Estatus
router.put('/:id/estatus', async (req, res) => {
    try {
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { estatus: req.body.estatus }, { new: true });
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 11-13. Ediciones varias (Solo Admin/Staff)
router.put('/:id/nombre', async (req, res) => {
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { nombreProyecto: req.body.nombreProyecto }, { new: true });
    res.json(actualizado);
});

router.put('/:id/fecha', async (req, res) => {
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { fecha: req.body.fecha }, { new: true });
    res.json(actualizado);
});

router.put('/:id/enlace-entrega', async (req, res) => {
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, { enlaceEntrega: req.body.enlace }, { new: true });
    res.json(actualizado);
});

// 14. Agregar Pago
router.post('/:id/pagos', async (req, res) => {
    try {
        if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });

        const proyecto = await Proyecto.findById(req.params.id).populate('artista');
        if (!proyecto) return res.status(404).json({ error: 'No encontrado' });

        const nuevoPago = {
            monto: req.body.monto,
            metodo: req.body.metodo,
            fecha: new Date(),
            artista: proyecto.artista ? proyecto.artista.nombre : 'General'
        };

        proyecto.pagos.push(nuevoPago);
        proyecto.montoPagado = (proyecto.montoPagado || 0) + parseFloat(req.body.monto);
        
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
        if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
        const update = {};
        if (req.body.tipo === 'contrato') update.detallesContrato = req.body.data;
        if (req.body.tipo === 'distribucion') update.detallesDistribucion = req.body.data;
        const actualizado = await Proyecto.findByIdAndUpdate(req.params.id, update, { new: true }).populate('artista');
        res.json(actualizado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------------------------------------------------------------------
// RUTAS BORRADO Y PAPELERA
// ------------------------------------------------------------------

router.delete('/:id', async (req, res) => {
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    try {
        await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/papelera/all', async (req, res) => {
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    try {
        const proyectos = await Proyecto.find({ isDeleted: true }).populate('artista');
        res.json(proyectos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/restaurar', async (req, res) => {
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    try {
        await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: false });
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/permanente', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo Admin' });
    try {
        await Proyecto.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/papelera/vaciar', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo Admin' });
    try {
        await Proyecto.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

router.delete('/:id/pagos/:pagoId', async (req, res) => {
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
    try {
        const proyecto = await Proyecto.findById(req.params.id);
        if(!proyecto) return res.status(404).json({error: 'No encontrado'});
        const pago = proyecto.pagos.id(req.params.pagoId);
        if(!pago) return res.status(404).json({error: 'Pago no encontrado'});
        proyecto.montoPagado -= pago.monto;
        pago.deleteOne(); 
        if (proyecto.montoPagado < (proyecto.total - (proyecto.descuento || 0))) proyecto.estatus = 'Pendiente de Pago';
        await proyecto.save();
        res.json(proyecto);
    } catch(e) { res.status(500).json({error: e.message}); }
});

module.exports = router;