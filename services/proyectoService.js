/**
 * PASO 5: CAPA DE SERVICIOS - Lógica de Negocio de Proyectos
 * ============================================================
 * Este archivo contiene toda la lógica de negocio relacionada con proyectos.
 * NO interactúa con req/res - solo recibe datos y devuelve resultados.
 */

const mongoose = require('mongoose');
const Proyecto = require('../models/Proyecto');
const Artista = require('../models/Artista');
const Configuracion = require('../models/Configuracion');
const { google } = require('googleapis');
const AppError = require('../errors/AppError');

// --- CONFIGURACIÓN GMAIL ---
const OAuth2 = google.auth.OAuth2;

const createTransporter = async () => {
    const oauth2Client = new OAuth2(
        process.env.GMAIL_CLIENT_ID, 
        process.env.GMAIL_CLIENT_SECRET, 
        "https://developers.google.com/oauthplayground"
    );
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
        await gmail.users.messages.send({ 
            userId: 'me', 
            requestBody: { 
                raw: makeBody(emailDestino, `"Fia Records Studio" <${process.env.EMAIL_USER}>`, asunto, htmlContent) 
            } 
        });
        console.log(`📧 Notificación enviada a: ${emailDestino}`);
    } catch (error) { 
        console.error("❌ Error enviando correo:", error.message); 
    }
};

const getArtistaEmail = async (artistaId) => {
    if (!artistaId) return null;
    try { 
        const artista = await Artista.findById(artistaId); 
        return artista ? artista.correo : null; 
    } catch(e) { return null; }
};

const formatearFechaMexico = (fechaIso) => {
    return new Date(fechaIso).toLocaleString('es-MX', { 
        timeZone: 'America/Mexico_City', 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
        hour: 'numeric', minute: 'numeric', hour12: true 
    });
};

// ============================================================
// SERVICIO: PROYECTOS
// ============================================================

class ProyectoService {
    
    // --- Helpers privados ---
    
    _getFiltroUsuario(user) {
        let filtro = { isDeleted: { $ne: true } };
        if (user.role !== 'cliente') return filtro;
        if (user.artistaId) {
            filtro.artista = new mongoose.Types.ObjectId(user.artistaId);
        } else {
            filtro.artista = new mongoose.Types.ObjectId(); 
        }
        return filtro;
    }
    
    _buildQueryFilter(tenantFilter, additionalFilters = {}) {
        const baseFilter = tenantFilter || {};
        return { ...baseFilter, ...additionalFilters };
    }
    
    _determinarEmpresaId(user, headerEmpresaId, bodyEmpresaId = null) {
        // Prioridad: body > header > usuario
        if (bodyEmpresaId && bodyEmpresaId !== 'all' && mongoose.Types.ObjectId.isValid(bodyEmpresaId)) {
            return bodyEmpresaId;
        }
        
        if (headerEmpresaId && headerEmpresaId !== 'all' && mongoose.Types.ObjectId.isValid(headerEmpresaId)) {
            return headerEmpresaId;
        }
        
        if (user.empresaId) {
            return user.empresaId;
        }
        
        return null;
    }
    
    _hasTenantAccess(user, tenantFilter, document) {
        if (user.isSuperAdmin) {
            if (tenantFilter && tenantFilter.empresaId) {
                if (!document || !document.empresaId) return false;
                return document.empresaId.toString() === tenantFilter.empresaId.toString();
            }
            return true;
        }
        
        if (!document) return false;
        
        const userEmpresaId = user.empresaId ? user.empresaId.toString() : null;
        const docEmpresaId = document.empresaId ? document.empresaId.toString() : null;
        
        return userEmpresaId && docEmpresaId && userEmpresaId === docEmpresaId;
    }
    
    // --- Métodos Públicos ---
    
    /**
     * Verificar disponibilidad de horarios para una fecha
     */
    async verificarDisponibilidad(fecha, tenantFilter) {
        if (!fecha) {
            throw new AppError('Fecha requerida', 400);
        }
        
        const fechaObj = new Date(fecha + 'T12:00:00'); 
        const diaSemana = fechaObj.getDay().toString();
        
        let config = await Configuracion.findOne({ singletonId: 'main_config' });
        if (!config) { config = new Configuracion(); }
        
        const horarioDia = config.horarioLaboral ? config.horarioLaboral.get(diaSemana) : null;
        
        if (!horarioDia || !horarioDia.activo) { 
            return []; 
        }
        
        const slotsPosibles = [];
        let [horaInicio, minInicio] = horarioDia.inicio.split(':').map(Number);
        let [horaFin, minFin] = horarioDia.fin.split(':').map(Number);
        
        for (let h = horaInicio; h < horaFin; h++) {
            const horaStr = h.toString().padStart(2, '0') + ':00';
            slotsPosibles.push(horaStr);
        }
        
        const start = new Date(fecha); start.setUTCHours(0,0,0,0);
        const end = new Date(fecha); end.setUTCHours(23,59,59,999);
        
        const filtroEmpresa = this._buildQueryFilter(tenantFilter, {});
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
        
        return slotsPosibles.filter(slot => !horasOcupadas.includes(slot));
    }
    
    /**
     * Listar todos los proyectos
     */
    async listarProyectos(user, tenantFilter) {
        const filtroUsuario = this._getFiltroUsuario(user);
        const filtro = this._buildQueryFilter(tenantFilter, filtroUsuario);
        
        console.log("\n=== DEBUG /api/proyectos ===");
        console.log("Query enviada a MongoDB:", JSON.stringify(filtro, null, 2));
        console.log("Usuario:", user ? { id: user._id, empresaId: user.empresaId, isSuperAdmin: user.isSuperAdmin } : 'N/A');
        
        const proyectos = await Proyecto.find(filtro).populate('artista').sort({ fecha: 1 }); 
        
        console.log("Proyectos encontrados:", proyectos.length);
        console.log("===========================\n");
        
        return proyectos;
    }
    
    /**
     * Listar proyectos para agenda/calendario
     */
    async listarAgenda(user, tenantFilter, headerEmpresaId) {
        const filtroUsuario = this._getFiltroUsuario(user);
        
        let matchStage = {};
        
        // 1. Leer el header directamente
        console.log("\n=== DEBUG FLUJO TRABAJO ===");
        console.log("1. Header recibido:", headerEmpresaId);
        
        // 2. Determinar ID final
        let targetEmpresaId = headerEmpresaId;
        if (!targetEmpresaId && user.empresaId) {
            targetEmpresaId = user.empresaId;
            console.log("2. Usando fallback de usuario:", targetEmpresaId);
        }
        
        // 3. Forzar el filtro si no es 'all'
        if (targetEmpresaId && targetEmpresaId !== 'all') {
            try {
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
        
        // Transformar a formato de eventos para calendario
        return proyectos.map(p => ({ 
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
    }
    
    /**
     * Listar cotizaciones
     */
    async listarCotizaciones(user, tenantFilter) {
        const filtroUsuario = this._getFiltroUsuario(user);
        const filtro = this._buildQueryFilter(tenantFilter, {
            ...filtroUsuario,
            estatus: 'Cotizacion'
        });
        return await Proyecto.find(filtro).populate('artista');
    }
    
    /**
     * Listar proyectos completos o cancelados
     */
    async listarCompletos(tenantFilter) {
        const filtroBase = this._buildQueryFilter(tenantFilter, { 
            $or: [
                { proceso: 'Completo' },
                { estatus: 'Cancelado' }
            ]
        });
        return await Proyecto.find(filtroBase).populate('artista').sort({ fecha: -1 });
    }
    
    /**
     * Obtener todos los pagos de todos los proyectos
     */
    async listarTodosPagos(tenantFilter) {
        const filtro = this._buildQueryFilter(tenantFilter, {
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
        return todosPagos;
    }
    
    /**
     * Listar proyectos por artista
     */
    async listarPorArtista(user, tenantFilter, artistaId) {
        if (user.role === 'cliente') { 
            const filtroPropio = this._getFiltroUsuario(user);
            if (filtroPropio.artista && filtroPropio.artista.toString() !== artistaId) { 
                throw new AppError('No autorizado.', 403);
            } 
        }
        
        const filtro = this._buildQueryFilter(tenantFilter, { 
            artista: artistaId, 
            isDeleted: { $ne: true } 
        });
        
        return await Proyecto.find(filtro).populate('artista').sort({ fecha: -1 });
    }
    
    /**
     * Obtener un proyecto por ID
     */
    async obtenerProyecto(user, tenantFilter, proyectoId) {
        const proyecto = await Proyecto.findById(proyectoId).populate('artista'); 
        if (!proyecto) {
            throw new AppError('No encontrado', 404);
        }
        
        // Verificar acceso por empresa
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado: El proyecto no pertenece a tu empresa.', 403);
        }
        
        // Verificar acceso para clientes
        if (user.role === 'cliente') { 
            const filtro = this._getFiltroUsuario(user);
            if (!proyecto.artista || proyecto.artista._id.toString() !== filtro.artista.toString()) { 
                throw new AppError('No autorizado.', 403);
            } 
        } 
        
        return proyecto;
    }
    
    /**
     * Actualizar proyecto general (firma del cliente, detalles)
     */
    async actualizarProyecto(user, tenantFilter, proyectoId, datos) {
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('Proyecto no encontrado', 404);
        }
        
        // Verificar acceso por empresa
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado: El proyecto no pertenece a tu empresa.', 403);
        }
        
        // Verificar autorización para clientes
        if (user.role === 'cliente') {
            const filtro = this._getFiltroUsuario(user);
            if (!proyecto.artista || proyecto.artista.toString() !== filtro.artista.toString()) {
                throw new AppError('No autorizado', 403);
            }
            // Cliente solo puede actualizar firmaCliente
            if (datos.firmaCliente !== undefined) {
                proyecto.firmaCliente = datos.firmaCliente;
                await proyecto.save();
                return proyecto;
            } else {
                throw new AppError('Solo puede actualizar la firma', 403);
            }
        }
        
        // Admin/empleado pueden actualizar campos permitidos
        const camposPermitidos = ['firmaCliente', 'detallesContrato', 'detallesDistribucion'];
        camposPermitidos.forEach(campo => {
            if (datos[campo] !== undefined) {
                proyecto[campo] = datos[campo];
            }
        });
        
        await proyecto.save();
        return proyecto;
    }
    
    /**
     * Actualizar nombre del proyecto
     */
    async actualizarNombre(user, tenantFilter, proyectoId, nombreProyecto) {
        if (!nombreProyecto || nombreProyecto.trim() === '') {
            throw new AppError('Nombre del proyecto requerido', 400);
        }
        
        if (user.role === 'cliente') {
            throw new AppError('No autorizado para cambiar el nombre', 403);
        }
        
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('Proyecto no encontrado', 404);
        }
        
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado: El proyecto no pertenece a tu empresa.', 403);
        }
        
        proyecto.nombreProyecto = nombreProyecto.trim();
        await proyecto.save();
        
        return proyecto;
    }
    
    /**
     * Actualizar fecha del proyecto
     */
    async actualizarFecha(user, tenantFilter, proyectoId, fecha) {
        if (!fecha) {
            throw new AppError('Fecha requerida', 400);
        }
        
        if (user.role === 'cliente') {
            throw new AppError('No autorizado para cambiar fechas', 403);
        }
        
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('Proyecto no encontrado', 404);
        }
        
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado: El proyecto no pertenece a tu empresa.', 403);
        }
        
        proyecto.fecha = new Date(fecha);
        
        // Si estaba en Cotizacion, cambiar estatus
        if (proyecto.estatus === 'Cotizacion') {
            proyecto.estatus = 'Pendiente de Pago';
        }
        
        await proyecto.save();
        return proyecto;
    }
    
    /**
     * Actualizar estatus del proyecto
     */
    async actualizarEstatus(user, tenantFilter, proyectoId, estatus) {
        if (!estatus) {
            throw new AppError('Estatus requerido', 400);
        }
        
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('Proyecto no encontrado', 404);
        }
        
        // Verificar acceso por empresa
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado: El proyecto no pertenece a tu empresa.', 403);
        }
        
        // Verificar que el usuario no sea cliente
        if (user.role === 'cliente') {
            throw new AppError('No autorizado para cambiar el estatus', 403);
        }
        
        // Actualizar el estatus
        proyecto.estatus = estatus;
        await proyecto.save();
        
        return proyecto;
    }

    /**
     * Actualizar proceso del proyecto
     */
    async actualizarProceso(user, tenantFilter, proyectoId, proceso) {
        if (!proceso) {
            throw new AppError('Proceso requerido', 400);
        }
        
        if (user.role === 'cliente') {
            throw new AppError('No autorizado para cambiar el proceso', 403);
        }
        
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('Proyecto no encontrado', 404);
        }
        
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado: El proyecto no pertenece a tu empresa.', 403);
        }
        
        proyecto.proceso = proceso;
        await proyecto.save();
        
        return proyecto;
    }
    
    /**
     * Crear proyecto directo (pasado/migración)
     */
    async crearProyectoDirecto(user, headerEmpresaId, datos) {
        if (user.role === 'cliente') {
            throw new AppError('No autorizado', 403);
        }
        
        const { artistaId, nombreProyecto, enlaceEntrega } = datos;
        
        const empresaIdAsignar = this._determinarEmpresaId(user, headerEmpresaId);
        
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
        
        return await nuevoProyecto.save();
    }
    
    /**
     * Crear proyecto/cotización nuevo
     */
    async crearProyecto(user, headerEmpresaId, datos) {
        if (user.role === 'cliente') {
            throw new AppError('No autorizado', 403);
        }
        
        const { 
            artista, nombreProyecto, items, total, descuento, 
            estatus, metodoPago, fecha, proceso, esAlbum, 
            esPlanMensual, serviciosPorMes, duracionMeses, 
            empresaId: bodyEmpresaId 
        } = datos;
        
        const empresaIdAsignar = this._determinarEmpresaId(user, headerEmpresaId, bodyEmpresaId);
        
        if (!empresaIdAsignar) {
            throw new AppError('No se pudo determinar la empresa. Selecciona una empresa específica.', 400);
        }
        
        if (!mongoose.Types.ObjectId.isValid(empresaIdAsignar)) {
            throw new AppError('ID de empresa inválido', 400);
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
        await guardado.populate('artista');
        
        return guardado;
    }
    
    /**
     * Eliminar proyecto (soft delete)
     */
    async eliminarProyecto(user, tenantFilter, proyectoId) {
        if (user.role === 'cliente') {
            throw new AppError('No autorizado', 403);
        }
        
        const proyecto = await Proyecto.findById(proyectoId); 
        if (!proyecto) {
            throw new AppError('No encontrado', 404);
        }
        
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado', 403);
        }
        
        await Proyecto.findByIdAndUpdate(proyectoId, { isDeleted: true });
        return { eliminado: true };
    }
    
    /**
     * Listar proyectos en papelera
     */
    async listarPapelera(user, tenantFilter) {
        if (user.role === 'cliente') {
            throw new AppError('No autorizado', 403);
        }
        
        const filtro = this._buildQueryFilter(tenantFilter, { isDeleted: true });
        return await Proyecto.find(filtro).populate('artista');
    }
    
    /**
     * Restaurar proyecto
     */
    async restaurarProyecto(user, tenantFilter, proyectoId) {
        if (user.role === 'cliente') {
            throw new AppError('No autorizado', 403);
        }
        
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('No encontrado', 404);
        }
        
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado', 403);
        }
        
        await Proyecto.findByIdAndUpdate(proyectoId, { isDeleted: false });
        return { restaurado: true };
    }
    
    /**
     * Eliminar proyecto permanentemente
     */
    async eliminarPermanente(user, tenantFilter, proyectoId) {
        if (user.role !== 'admin') {
            throw new AppError('Solo Admin', 403);
        }
        
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('No encontrado', 404);
        }
        
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado', 403);
        }
        
        await Proyecto.findByIdAndDelete(proyectoId);
        return { eliminado: true };
    }
    
    /**
     * Vaciar papelera
     */
    async vaciarPapelera(user) {
        if (user.role !== 'admin') {
            throw new AppError('Solo Admin', 403);
        }
        
        await Proyecto.deleteMany({ isDeleted: true });
        return { vaciado: true };
    }
    
    /**
     * Agregar pago a proyecto
     */
    async agregarPago(user, tenantFilter, proyectoId, datosPago) {
        if (user.role === 'cliente') {
            throw new AppError('No autorizado', 403);
        }
        
        const { monto, metodo, notas } = datosPago;
        
        if (!monto || monto <= 0) {
            throw new AppError('Monto inválido', 400);
        }
        
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('Proyecto no encontrado', 404);
        }
        
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado', 403);
        }
        
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
        return proyecto;
    }
    
    /**
     * Eliminar pago de proyecto
     */
    async eliminarPago(user, tenantFilter, proyectoId, pagoId) {
        if (user.role === 'cliente') {
            throw new AppError('No autorizado', 403);
        }
        
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('No encontrado', 404);
        }
        
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado', 403);
        }
        
        const pago = proyecto.pagos.id(pagoId);
        if (!pago) {
            throw new AppError('Pago no encontrado', 404);
        }
        
        proyecto.montoPagado -= pago.monto;
        pago.deleteOne();
        
        if (proyecto.montoPagado < (proyecto.total - (proyecto.descuento || 0))) {
            proyecto.estatus = 'Pendiente de Pago';
        }
        
        await proyecto.save();
        return proyecto;
    }
    
    /**
     * Enviar recibo por correo
     */
    async enviarRecibo(user, proyectoId, datos) {
        if (user.role === 'cliente') {
            throw new AppError('No autorizado', 403);
        }
        
        const { email, monto, metodo, saldoRestante } = datos;
        
        const proyecto = await Proyecto.findById(proyectoId).populate('artista');
        if (!proyecto) {
            throw new AppError('Proyecto no encontrado', 404);
        }
        
        if (!email) {
            throw new AppError('Correo requerido', 400);
        }
        
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
        return { message: 'Recibo enviado correctamente' };
    }
    
    /**
     * Guardar enlace de entrega (Drive)
     */
    async guardarEnlaceEntrega(user, tenantFilter, proyectoId, datos) {
        if (user.role === 'cliente') {
            throw new AppError('No autorizado', 403);
        }
        
        const { enlace, archivos } = datos;
        
        if (!enlace) {
            throw new AppError('Enlace requerido', 400);
        }
        
        const proyecto = await Proyecto.findById(proyectoId);
        if (!proyecto) {
            throw new AppError('Proyecto no encontrado', 404);
        }
        
        if (!this._hasTenantAccess(user, tenantFilter, proyecto)) {
            throw new AppError('No autorizado', 403);
        }
        
        proyecto.enlaceEntrega = enlace;
        if (archivos && Array.isArray(archivos)) {
            proyecto.archivos = archivos;
        }
        
        await proyecto.save();
        await proyecto.populate('artista');
        
        return proyecto;
    }
}

module.exports = new ProyectoService();
