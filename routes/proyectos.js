const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Proyecto = require('../models/Proyecto');
const Artista = require('../models/Artista'); 
const Configuracion = require('../models/Configuracion'); 
const auth = require('../middleware/auth');   
const { applyTenantFilter, buildQueryFilter, hasTenantAccess } = require('../middleware/tenantFilter');
const { google } = require('googleapis');

// --- CONFIGURACIÓN GMAIL ---
const OAuth2 = google.auth.OAuth2;
const createTransporter = async () => {
    const oauth2Client = new OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET, "https://developers.google.com/oauthplayground");
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    return oauth2Client;
};

const makeBody = (to, from, subject, message) => {
    const str = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        message
    ].join('\n');
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
router.use(applyTenantFilter); // FASE 3: Aplicar filtro de empresa automáticamente

const getFiltroUsuario = async (req) => {
    let filtro = { isDeleted: { $ne: true } };
    if (req.user.role !== 'cliente') return filtro;
    if (req.user.artistaId) filtro.artista = new mongoose.Types.ObjectId(req.user.artistaId);
    else filtro.artista = new mongoose.Types.ObjectId(); 
    return filtro;
};

// --- RUTA: VERIFICAR DISPONIBILIDAD ---
router.get('/disponibilidad', async (req, res) => {
    try {
        const { fecha } = req.query; 
        if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });

        const fechaObj = new Date(fecha + 'T12:00:00'); 
        const diaSemana = fechaObj.getDay().toString();

        let config = await Configuracion.findOne({ singletonId: 'main_config' });
        if (!config) { config = new Configuracion(); }

        const horarioDia = config.horarioLaboral ? config.horarioLaboral.get(diaSemana) : null;
        
        if (!horarioDia || !horarioDia.activo) { return res.json([]); }

        const slotsPosibles = [];
        let [horaInicio, minInicio] = horarioDia.inicio.split(':').map(Number);
        let [horaFin, minFin] = horarioDia.fin.split(':').map(Number);

        for (let h = horaInicio; h < horaFin; h++) {
            const horaStr = h.toString().padStart(2, '0') + ':00';
            slotsPosibles.push(horaStr);
        }

        const start = new Date(fecha); start.setUTCHours(0,0,0,0);
        const end = new Date(fecha); end.setUTCHours(23,59,59,999);

        // FASE 4: Aplicar filtro de empresa para slots de disponibilidad
        const filtroEmpresa = buildQueryFilter(req, {});
        const proyectosOcupados = await Proyecto.find({
            ...filtroEmpresa,
            fecha: { $gte: start, $lte: end }, 
            estatus: { $ne: 'Cancelado' },
            proceso: { $ne: 'Cotizacion' }, 
            isDeleted: false
        }).select('fecha');

        const horasOcupadas = proyectosOcupados.map(p => {
            const horaMexico = new Date(p.fecha).toLocaleString("es-MX", {
                timeZone: "America/Mexico_City", hour: '2-digit', minute: '2-digit', hour12: false 
            });
            let [h, m] = horaMexico.split(':');
            return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
        });

        const slotsFinales = slotsPosibles.filter(slot => !horasOcupadas.includes(slot));
        res.json(slotsFinales);

    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => { 
    try { 
        const filtroUsuario = await getFiltroUsuario(req); 
        // FASE 3: Combinar filtro de empresa + filtro de usuario
        const filtro = buildQueryFilter(req, filtroUsuario);
        
        // DEBUG FASE 5: Mostrar query exacta enviada a MongoDB
        console.log("\n=== DEBUG /api/proyectos ===");
        console.log("Query enviada a MongoDB:", JSON.stringify(filtro, null, 2));
        console.log("tenantFilter en req:", req.tenantFilter);
        console.log("Headers X-Empresa-Id:", req.headers['x-empresa-id'] || req.headers['X-Empresa-Id']);
        console.log("Usuario:", req.user ? { id: req.user._id, empresaId: req.user.empresaId, isSuperAdmin: req.user.isSuperAdmin } : 'N/A');
        
        const proyectos = await Proyecto.find(filtro).populate('artista').sort({ fecha: 1 }); 
        
        // DEBUG FASE 5: Mostrar resultados
        console.log("Proyectos encontrados:", proyectos.length);
        console.log("===========================\n");
        
        res.json(proyectos); 
    } catch (e) { 
        console.error("Error en GET /api/proyectos:", e);
        res.status(500).json({ error: e.message }); 
    } 
});

router.get('/agenda', async (req, res) => { 
    try { 
        const filtroUsuario = await getFiltroUsuario(req); 
        
        // FASE 4: Parche de rastreo para depuración
        let matchStage = {};

        // 1. Leer el header directamente para evitar pérdidas en middlewares intermedios
        const headerEmpresaId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
        console.log("\n=== DEBUG FLUJO TRABAJO ===");
        console.log("1. Header recibido:", headerEmpresaId);

        // 2. Determinar ID final (priorizar el header, luego el usuario)
        let targetEmpresaId = headerEmpresaId;
        if (!targetEmpresaId && req.user) {
            targetEmpresaId = req.user.empresaId;
            console.log("2. Usando fallback de usuario:", targetEmpresaId);
        }

        // 3. Forzar el filtro si no es 'all'
        if (targetEmpresaId && targetEmpresaId !== 'all') {
            try {
                // .trim() evita errores si el frontend manda espacios ocultos
                matchStage.empresaId = new mongoose.Types.ObjectId(targetEmpresaId.toString().trim());
                console.log("3. MatchStage exitoso:", matchStage);
            } catch (error) {
                console.error("3. ERROR FATAL de ObjectId:", error.message);
            }
        } else {
            console.log("3. Mostrando GLOBAL (sin filtro)");
        }
        console.log("===========================\n");
        
        const filtro = {
            ...matchStage,
            ...filtroUsuario,
            estatus: { $ne: 'Cancelado' },
            proceso: { $ne: 'Completo' }
        };
        
        const proyectos = await Proyecto.find(filtro).populate('artista'); 
        const eventos = proyectos.map(p => ({ id: p._id, title: p.nombreProyecto || (p.artista ? p.artista.nombre : 'Sin Nombre'), start: p.fecha, allDay: false, extendedProps: { total: p.total, estatus: p.estatus, proceso: p.proceso, servicios: p.items ? p.items.map(i => i.nombre).join('\n') : '', artistaId: p.artista ? p.artista._id : null } })); 
        res.json(eventos); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

router.get('/cotizaciones', async (req, res) => { 
    try { 
        const filtroUsuario = await getFiltroUsuario(req); 
        // FASE 3: Combinar filtro de empresa + filtro de usuario + filtro de cotización
        const filtro = buildQueryFilter(req, {
            ...filtroUsuario,
            estatus: 'Cotizacion'
        });
        const cotizaciones = await Proyecto.find(filtro).populate('artista'); 
        res.json(cotizaciones); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

router.get('/completos', async (req, res) => { 
    try { 
        const filtroBase = buildQueryFilter(req, { 
            $or: [
                { proceso: 'Completo' },
                { estatus: 'Cancelado' }
            ]
        });

        const completos = await Proyecto.find(filtroBase).populate('artista').sort({ fecha: -1 }); 
        res.json(completos); 
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    } 
});

router.get('/pagos/todos', async (req, res) => { 
    try { 
        const filtro = buildQueryFilter(req, {
            "pagos.0": { $exists: true }
        });
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
                        artista: p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'General' 
                    }); 
                }); 
            } 
        }); 
        todosPagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); 
        res.json(todosPagos); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

router.get('/por-artista/:id', async (req, res) => { 
    try { 
        if (req.user.role === 'cliente') { 
            const filtroPropio = await getFiltroUsuario(req); 
            if (filtroPropio.artista && filtroPropio.artista.toString() !== req.params.id) { 
                return res.status(403).json({ error: 'No autorizado.' }); 
            } 
        }
        // Construir filtro con empresa
        const filtro = buildQueryFilter(req, { 
            artista: req.params.id, 
            isDeleted: { $ne: true } 
        });
        const proyectos = await Proyecto.find(filtro).populate('artista').sort({ fecha: -1 }); 
        res.json(proyectos); 
    } catch (e) { res.status(500).json({ error: 'Error al obtener historial.' }); } 
});

router.get('/:id', async (req, res) => { 
    try { 
        const proyecto = await Proyecto.findById(req.params.id).populate('artista'); 
        if (!proyecto) return res.status(404).json({ error: 'No encontrado' }); 
        // FASE 3: Verificar acceso por empresa
        if (!hasTenantAccess(req, proyecto)) {
            return res.status(403).json({ error: 'No autorizado: El proyecto no pertenece a tu empresa.' });
        }
        if (req.user.role === 'cliente') { 
            const filtro = await getFiltroUsuario(req); 
            if (!proyecto.artista || proyecto.artista._id.toString() !== filtro.artista.toString()) { 
                return res.status(403).json({ error: 'No autorizado.' }); 
            } 
        } 
        res.json(proyecto); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

// ==============================================================
// RUTA PUT GENERAL PARA ACTUALIZAR PROYECTO (Firma del Cliente)
// ==============================================================
router.put('/:id', async (req, res) => {
    try {
        const proyecto = await Proyecto.findById(req.params.id);
        if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
        
        // FASE 3: Verificar acceso por empresa
        if (!hasTenantAccess(req, proyecto)) {
            return res.status(403).json({ error: 'No autorizado: El proyecto no pertenece a tu empresa.' });
        }
        
        // Verificar autorización para clientes
        if (req.user.role === 'cliente') {
            const filtro = await getFiltroUsuario(req);
            if (!proyecto.artista || proyecto.artista.toString() !== filtro.artista.toString()) {
                return res.status(403).json({ error: 'No autorizado' });
            }
            // Cliente solo puede actualizar firmaCliente
            if (req.body.firmaCliente !== undefined) {
                proyecto.firmaCliente = req.body.firmaCliente;
                await proyecto.save();
                return res.json(proyecto);
            } else {
                return res.status(403).json({ error: 'Solo puede actualizar la firma' });
            }
        }
        
        // Admin/empleado pueden actualizar cualquier campo permitido
        const camposPermitidos = ['firmaCliente', 'detallesContrato', 'detallesDistribucion'];
        camposPermitidos.forEach(campo => {
            if (req.body[campo] !== undefined) {
                proyecto[campo] = req.body[campo];
            }
        });
        
        await proyecto.save();
        res.json(proyecto);
    } catch (error) {
        console.error('Error al actualizar proyecto:', error);
        res.status(500).json({ error: 'Error al actualizar proyecto' });
    }
});

// ==============================================================
// RUTA PUT /:id/nombre - ACTUALIZAR NOMBRE DEL PROYECTO
// ==============================================================
router.put('/:id/nombre', async (req, res) => {
    try {
        const { nombreProyecto } = req.body;
        if (!nombreProyecto || nombreProyecto.trim() === '') {
            return res.status(400).json({ error: 'Nombre del proyecto requerido' });
        }

        const proyecto = await Proyecto.findById(req.params.id);
        if (!proyecto) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // FASE 3: Verificar acceso por empresa (multi-tenant)
        if (!hasTenantAccess(req, proyecto)) {
            return res.status(403).json({ error: 'No autorizado: El proyecto no pertenece a tu empresa.' });
        }

        // Verificar que el usuario no sea cliente
        if (req.user.role === 'cliente') {
            return res.status(403).json({ error: 'No autorizado para cambiar el nombre' });
        }

        // Actualizar el nombre
        proyecto.nombreProyecto = nombreProyecto.trim();
        await proyecto.save();

        res.json(proyecto);
    } catch (error) {
        console.error('[PUT /:id/nombre] Error:', error);
        res.status(500).json({ error: 'Error al actualizar el nombre del proyecto' });
    }
});

// ==============================================================
// RUTA PUT /:id/fecha - ACTUALIZAR FECHA DEL PROYECTO
// ==============================================================
router.put('/:id/fecha', async (req, res) => {
    try {
        const { fecha } = req.body;
        if (!fecha) {
            return res.status(400).json({ error: 'Fecha requerida' });
        }

        const proyecto = await Proyecto.findById(req.params.id);
        if (!proyecto) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // FASE 3: Verificar acceso por empresa (multi-tenant)
        if (!hasTenantAccess(req, proyecto)) {
            return res.status(403).json({ error: 'No autorizado: El proyecto no pertenece a tu empresa.' });
        }

        // Verificar que el usuario no sea cliente (solo admin/empleado pueden cambiar fechas)
        if (req.user.role === 'cliente') {
            return res.status(403).json({ error: 'No autorizado para cambiar fechas' });
        }

        // Actualizar la fecha
        proyecto.fecha = new Date(fecha);
        
        // Si estaba en Cotizacion, cambiar estatus para que aparezca en el flujo de trabajo
        if (proyecto.estatus === 'Cotizacion') {
            proyecto.estatus = 'Pendiente de Pago';
        }
        
        await proyecto.save();

        res.json(proyecto);
    } catch (error) {
        console.error('[PUT /:id/fecha] Error:', error);
        res.status(500).json({ error: 'Error al actualizar la fecha' });
    }
});

// ==============================================================
// RUTA PUT /:id/proceso - ACTUALIZAR PROCESO DEL PROYECTO
// ==============================================================
router.put('/:id/proceso', async (req, res) => {
    try {
        const { proceso } = req.body;
        if (!proceso) {
            return res.status(400).json({ error: 'Proceso requerido' });
        }

        const proyecto = await Proyecto.findById(req.params.id);
        if (!proyecto) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // FASE 3: Verificar acceso por empresa (multi-tenant)
        if (!hasTenantAccess(req, proyecto)) {
            return res.status(403).json({ error: 'No autorizado: El proyecto no pertenece a tu empresa.' });
        }

        // Verificar que el usuario no sea cliente
        if (req.user.role === 'cliente') {
            return res.status(403).json({ error: 'No autorizado para cambiar el proceso' });
        }

        // Actualizar el proceso
        proyecto.proceso = proceso;
        await proyecto.save();

        res.json(proyecto);
    } catch (error) {
        console.error('[PUT /:id/proceso] Error:', error);
        res.status(500).json({ error: 'Error al actualizar el proceso' });
    }
});

// ==============================================================
// NUEVA RUTA: CREAR PROYECTO DIRECTO (PASADO)
// ==============================================================
router.post('/directo', async (req, res) => {
    try {
        if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
        
        const { artistaId, nombreProyecto, enlaceEntrega } = req.body;

        // FASE 4: Determinar empresaId
        let empresaIdAsignar;
        if (req.user.isSuperAdmin) {
            const headerEmpresaId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
            empresaIdAsignar = headerEmpresaId || req.user.empresaId;
        } else {
            empresaIdAsignar = req.user.empresaId;
        }
        
        const nuevoProyecto = new Proyecto({
            artista: artistaId,
            empresaId: empresaIdAsignar,
            nombreProyecto: nombreProyecto || 'Proyecto Anterior',
            fecha: new Date(),
            items: [{ nombre: 'Proyecto de Catálogo (Migración)', unidades: 1, precioUnitario: 0 }],
            total: 0,
            descuento: 0,
            montoPagado: 0,
            estatus: 'Pagado',
            proceso: 'Completo',
            metodoPago: 'N/A',
            enlaceEntrega: enlaceEntrega || ''
        });

        const guardado = await nuevoProyecto.save();
        res.status(201).json(guardado);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => { 
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); 
    try { 
        const proyecto = await Proyecto.findById(req.params.id); 
        if (!proyecto) return res.status(404).json({ error: 'No encontrado' }); 
        if (!hasTenantAccess(req, proyecto)) return res.status(403).json({ error: 'No autorizado' }); 
        await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: true }); 
        res.status(204).send(); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

router.get('/papelera/all', async (req, res) => { 
    if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); 
    try { 
        // FASE 3: Filtrar papelera por empresa
        const filtro = buildQueryFilter(req, { isDeleted: true });
        const proyectos = await Proyecto.find(filtro).populate('artista'); 
        res.json(proyectos); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

router.put('/:id/restaurar', async (req, res) => { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); try { const proyecto = await Proyecto.findById(req.params.id); if (!proyecto) return res.status(404).json({ error: 'No encontrado' }); if (!hasTenantAccess(req, proyecto)) return res.status(403).json({ error: 'No autorizado' }); await Proyecto.findByIdAndUpdate(req.params.id, { isDeleted: false }); res.status(204).send(); } catch (e) { res.status(500).json({ error: e.message }); } });

router.delete('/:id/permanente', async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo Admin' }); try { const proyecto = await Proyecto.findById(req.params.id); if (!proyecto) return res.status(404).json({ error: 'No encontrado' }); if (!hasTenantAccess(req, proyecto)) return res.status(403).json({ error: 'No autorizado' }); await Proyecto.findByIdAndDelete(req.params.id); res.status(204).send(); } catch (e) { res.status(500).json({ error: e.message }); } });

// ==============================================================
// RUTA POST / - CREAR NUEVO PROYECTO/COTIZACIÓN (MULTI-TENANT)
// ==============================================================
router.post('/', async (req, res) => {
    try {
        if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
        
        const { artista, nombreProyecto, items, total, descuento, estatus, metodoPago, fecha, proceso, esAlbum, esPlanMensual, serviciosPorMes, duracionMeses, empresaId: bodyEmpresaId } = req.body;
        
        // FASE 4: Determinar empresaId - prioridad: body > header > usuario
        let empresaIdAsignar;
        
        // 1. Si viene en el body y es válido, usarlo
        if (bodyEmpresaId && bodyEmpresaId !== 'all' && mongoose.Types.ObjectId.isValid(bodyEmpresaId)) {
            empresaIdAsignar = bodyEmpresaId;
        }
        // 2. Si no, usar el header
        else {
            const headerEmpresaId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
            if (headerEmpresaId && headerEmpresaId !== 'all' && mongoose.Types.ObjectId.isValid(headerEmpresaId)) {
                empresaIdAsignar = headerEmpresaId;
            }
            // 3. Si no hay header válido, usar el del usuario
            else if (req.user.empresaId) {
                empresaIdAsignar = req.user.empresaId;
            }
            // 4. Fallback: no se puede crear sin empresa
            else {
                return res.status(400).json({ error: 'No se pudo determinar la empresa. Selecciona una empresa específica.' });
            }
        }
        
        // Validar que empresaId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(empresaIdAsignar)) {
            return res.status(400).json({ error: 'ID de empresa inválido' });
        }
        
        const nuevoProyecto = new Proyecto({
            artista: artista === 'publico_general' ? null : artista,
            empresaId: new mongoose.Types.ObjectId(empresaIdAsignar),
            nombreProyecto: nombreProyecto || 'Sin nombre',
            items: items || [],
            total: total || 0,
            descuento: descuento || 0,
            estatus: estatus || 'Cotizacion',
            metodoPago: metodoPago || 'Pendiente',
            fecha: fecha ? new Date(fecha) : new Date(),
            proceso: proceso || 'Solicitud',
            esAlbum: esAlbum || false,
            esPlanMensual: esPlanMensual || false,
            serviciosPorMes: serviciosPorMes || 1,
            duracionMeses: duracionMeses || 1,
            montoPagado: 0
        });
        
        const guardado = await nuevoProyecto.save();
        
        // Poblar el artista para la respuesta
        await guardado.populate('artista');
        
        res.status(201).json(guardado);
    } catch (e) {
        console.error('[POST /api/proyectos] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/papelera/vaciar', async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo Admin' }); try { await Proyecto.deleteMany({ isDeleted: true }); res.status(204).send(); } catch (err) { res.status(500).json({ error: "Error" }); } });

// --- RUTA: AGREGAR PAGO A PROYECTO ---
router.post('/:id/pagos', async (req, res) => {
    try {
        if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
        
        const { monto, metodo, notas } = req.body;
        if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });
        
        const proyecto = await Proyecto.findById(req.params.id);
        if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
        if (!hasTenantAccess(req, proyecto)) return res.status(403).json({ error: 'No autorizado' });
        
        const nuevoPago = {
            monto: Number(monto),
            metodo: metodo || 'Efectivo',
            fecha: new Date(),
            notas: notas || ''
        };
        
        proyecto.pagos.push(nuevoPago);
        proyecto.montoPagado = (proyecto.montoPagado || 0) + Number(monto);
        
        // Actualizar estatus según el pago
        const totalConDescuento = proyecto.total - (proyecto.descuento || 0);
        if (proyecto.montoPagado >= totalConDescuento) {
            proyecto.estatus = 'Pagado';
        } else if (proyecto.montoPagado > 0) {
            proyecto.estatus = 'Pendiente de Pago';
        }
        
        await proyecto.save();
        res.json(proyecto);
    } catch (e) {
        console.error('[POST /:id/pagos] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id/pagos/:pagoId', async (req, res) => { if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' }); try { const proyecto = await Proyecto.findById(req.params.id); if(!proyecto) return res.status(404).json({error: 'No encontrado'}); if (!hasTenantAccess(req, proyecto)) return res.status(403).json({ error: 'No autorizado' }); const pago = proyecto.pagos.id(req.params.pagoId); if(!pago) return res.status(404).json({error: 'Pago no encontrado'}); proyecto.montoPagado -= pago.monto; pago.deleteOne(); if (proyecto.montoPagado < (proyecto.total - (proyecto.descuento || 0))) proyecto.estatus = 'Pendiente de Pago'; await proyecto.save(); res.json(proyecto); } catch(e) { res.status(500).json({error: e.message}); } });

// --- NUEVA RUTA: ENVIAR RECIBO POR CORREO ---
router.post('/:id/enviar-recibo', async (req, res) => {
    try {
        if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
        
        const { email, monto, metodo, saldoRestante } = req.body;
        const proyecto = await Proyecto.findById(req.params.id).populate('artista');
        
        if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
        if (!email) return res.status(400).json({ error: 'Correo requerido' });
        
        const nombreProyecto = proyecto.nombreProyecto || 'General';
        const nombreCliente = proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'Cliente';
        
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 600px; margin: auto;">
                <h2 style="color: #10b981;">¡Comprobante de Pago Recibido! 🎵</h2>
                <p>Hola <strong>${nombreCliente}</strong>,</p>
                <p>Hemos registrado exitosamente tu pago para el proyecto <strong>${nombreProyecto}</strong>.</p>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Monto pagado:</strong> $${parseFloat(monto).toFixed(2)} MXN</p>
                    <p><strong>Método:</strong> ${metodo}</p>
                    <p><strong>Saldo pendiente:</strong> $${parseFloat(saldoRestante).toFixed(2)} MXN</p>
                </div>
                <p style="color: #666; font-size: 14px;">Gracias por tu confianza en Fia Records Studio.</p>
            </div>
        `;
        
        await enviarNotificacion(email, "Comprobante de Pago - Fia Records", htmlContent);
        res.json({ message: 'Recibo enviado correctamente' });
        
    } catch (e) { 
        console.error("❌ Error enviando recibo:", e.message);
        res.status(500).json({ error: 'Error al enviar el recibo' }); 
    }
});

// --- NUEVA RUTA: GUARDAR ENLACE DE ENTREGA (DRIVE) ---
router.put('/:id/enlace-entrega', async (req, res) => {
    try {
        if (req.user.role === 'cliente') return res.status(403).json({ error: 'No autorizado' });
        
        const { enlace, archivos } = req.body;
        if (!enlace) return res.status(400).json({ error: 'Enlace requerido' });
        
        const proyecto = await Proyecto.findById(req.params.id);
        if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
        if (!hasTenantAccess(req, proyecto)) return res.status(403).json({ error: 'No autorizado' });
        
        // Actualizar enlace y archivos
        proyecto.enlaceEntrega = enlace;
        if (archivos && Array.isArray(archivos)) {
            proyecto.archivos = archivos;
        }
        
        await proyecto.save();
        
        // Poblar artista para la respuesta
        await proyecto.populate('artista');
        
        res.json(proyecto);
    } catch (e) {
        console.error('[PUT /:id/enlace-entrega] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;