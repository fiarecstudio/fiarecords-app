/**
 * PASO 5: ROUTES LIMPIAS - Proyectos
 * ==================================
 * Este archivo solo define las rutas y las conecta con el controlador.
 * Toda la lógica de negocio está en el ProyectoController y ProyectoService.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Proyecto = require('../models/Proyecto');
const Artista = require('../models/Artista');
const Configuracion = require('../models/Configuracion');
const auth = require('../middleware/auth');
const { applyTenantFilter, hasTenantAccess } = require('../middleware/tenantFilter');
const { google } = require('googleapis');

// PASO 5: Importar el controlador
const proyectoController = require('../controllers/proyectoController');

// PASO 5: Wrapper catchAsync para manejar errores automáticamente
// Elimina la necesidad de try/catch en cada ruta
const catchAsync = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// --- CONFIGURACIÓN GMAIL (solo para ruta /notificar que no está en el controlador) ---
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

const enviarNotificacion = async (emailDestino, asunto, htmlContent, nombreRemitente = null) => {
    if (!emailDestino) return;
    try {
        const authClient = await createTransporter();
        const gmail = google.gmail({ version: 'v1', auth: authClient });
        const remitente = nombreRemitente ? `"${nombreRemitente}" <${process.env.EMAIL_USER}>` : process.env.EMAIL_USER;
        await gmail.users.messages.send({ userId: 'me', requestBody: { raw: makeBody(emailDestino, remitente, asunto, htmlContent) } });
        console.log(`📧 Notificación enviada a: ${emailDestino}`);
    } catch (error) { console.error("❌ Error enviando correo:", error.message); }
};

// Middleware de autenticación y filtro de empresa
router.use(auth);
router.use(applyTenantFilter);

// Helper para filtros de usuario (cliente vs admin)
const getFiltroUsuario = async (req) => {
    let filtro = { isDeleted: { $ne: true } };
    if (req.user.role !== 'cliente') return filtro;
    if (req.user.artistaId) filtro.artista = new mongoose.Types.ObjectId(req.user.artistaId);
    else filtro.artista = new mongoose.Types.ObjectId();
    return filtro;
};

// ============================================================
// RUTAS LIMPIAS - Conectadas al ProyectoController
// ============================================================

// --- RUTAS GET ---
router.get('/disponibilidad', catchAsync(proyectoController.verificarDisponibilidad));
router.get('/', catchAsync(proyectoController.listar));
router.get('/agenda', catchAsync(proyectoController.listarAgenda));
router.get('/cotizaciones', catchAsync(proyectoController.listarCotizaciones));
router.get('/completos', catchAsync(proyectoController.listarCompletos));
router.get('/pagos/todos', catchAsync(proyectoController.listarTodosPagos));
router.get('/por-artista/:id', catchAsync(proyectoController.listarPorArtista));
router.get('/papelera/all', catchAsync(proyectoController.listarPapelera));
router.get('/:id', catchAsync(proyectoController.obtener));

// --- RUTAS POST ---
router.post('/', catchAsync(proyectoController.crear));
router.post('/directo', catchAsync(proyectoController.crearDirecto));
router.post('/:id/pagos', catchAsync(proyectoController.agregarPago));
router.post('/:id/enviar-recibo', catchAsync(proyectoController.enviarRecibo));

// --- RUTAS PUT ---
router.put('/:id', catchAsync(proyectoController.actualizar));
router.put('/:id/nombre', catchAsync(proyectoController.actualizarNombre));
router.put('/:id/fecha', catchAsync(proyectoController.actualizarFecha));
router.put('/:id/estatus', catchAsync(proyectoController.actualizarEstatus));
router.put('/:id/proceso', catchAsync(proyectoController.actualizarProceso));
router.put('/:id/restaurar', catchAsync(proyectoController.restaurar));
router.put('/:id/enlace-entrega', catchAsync(proyectoController.guardarEnlaceEntrega));

// --- RUTAS DELETE ---
router.delete('/:id', catchAsync(proyectoController.eliminar));
router.delete('/:id/permanente', catchAsync(proyectoController.eliminarPermanente));
router.delete('/:id/pagos/:pagoId', catchAsync(proyectoController.eliminarPago));
router.delete('/papelera/vaciar', catchAsync(proyectoController.vaciarPapelera));

// RUTA ESPECIAL: NOTIFICACIÓN MANUAL A ARTISTA (EMAIL/WHATSAPP)
// Esta ruta no está en el controlador porque usa lógica específica
// de Gmail API que ya está configurada en este archivo.
// ==================================================================
router.post('/:id/notificar', catchAsync(async (req, res) => {
    if (req.user.role === 'cliente') {
        return res.status(403).json({ error: 'No autorizado' });
    }
    
    const { tipo, medio, mensajePersonalizado } = req.body;
    const { id } = req.params;
    
    if (!tipo || !medio) {
        return res.status(400).json({ error: 'Tipo y medio son requeridos' });
    }
    
    if (!['email', 'whatsapp'].includes(medio)) {
        return res.status(400).json({ error: 'Medio debe ser email o whatsapp' });
    }
    
    if (!['entrega', 'resumen', 'recordatorio'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo no válido' });
    }
    
    // Obtener proyecto con artista poblado
    const proyecto = await Proyecto.findById(id).populate('artista');
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (!hasTenantAccess(req, proyecto)) return res.status(403).json({ error: 'No autorizado' });
    
    // Obtener configuración de la empresa
    const configuracion = await Configuracion.findOne({ empresaId: proyecto.empresaId });
    const nombreEmpresa = configuracion?.plantillasDoc?.encabezado1 || 'Estudio';
    
    // Verificar datos del artista según medio
    const artista = proyecto.artista;
    if (medio === 'email' && (!artista || !artista.correo)) {
        return res.status(400).json({ error: 'Artista sin correo registrado' });
    }
    if (medio === 'whatsapp' && (!artista || !artista.telefono)) {
        return res.status(400).json({ error: 'Artista sin teléfono registrado' });
    }
    
    const nombreArtista = artista ? (artista.nombreArtistico || artista.nombre) : 'Cliente';
    const nombreProyecto = proyecto.nombreProyecto || 'Proyecto';
    const saldoPendiente = proyecto.total - (proyecto.montoPagado || 0);
    
    let resultado = {};
    
    if (medio === 'email') {
        // Construir asunto y cuerpo del correo
        const asunto = `Novedades de ${nombreEmpresa} para tu proyecto ${nombreProyecto}`;
        
        let contenido = '';
        
        switch (tipo) {
            case 'entrega':
                contenido = `
                    <h2>¡Tu proyecto está listo! 🎵</h2>
                    <p>Hola ${nombreArtista},</p>
                    <p>Tu proyecto <strong>${nombreProyecto}</strong> tiene nuevos archivos disponibles.</p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Link de acceso:</strong></p>
                        <a href="${proyecto.enlaceEntrega || '#'}">${proyecto.enlaceEntrega || 'No disponible'}</a>
                    </div>
                `;
                break;
                
            case 'resumen':
                contenido = `
                    <h2>Resumen de tu proyecto</h2>
                    <p>Hola ${nombreArtista},</p>
                    <p>Te compartimos los detalles de <strong>${nombreProyecto}</strong>:</p>
                    <ul>
                        <li><strong>Total:</strong> $${proyecto.total.toFixed(2)} MXN</li>
                        <li><strong>Pagado:</strong> $${(proyecto.montoPagado || 0).toFixed(2)} MXN</li>
                        <li><strong>Saldo:</strong> $${saldoPendiente.toFixed(2)} MXN</li>
                        <li><strong>Estado:</strong> ${proyecto.proceso}</li>
                    </ul>
                `;
                break;
                
            case 'recordatorio':
                if (saldoPendiente <= 0) {
                    return res.status(400).json({ error: 'El proyecto no tiene saldo pendiente' });
                }
                contenido = `
                    <h2>Recordatorio de pago</h2>
                    <p>Hola ${nombreArtista},</p>
                    <p>Tu proyecto <strong>${nombreProyecto}</strong> tiene un saldo pendiente:</p>
                    <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <p style="font-size: 24px; font-weight: bold; margin: 0;">$${saldoPendiente.toFixed(2)} MXN</p>
                    </div>
                `;
                break;
        }
        
        // Agregar mensaje personalizado si existe
        if (mensajePersonalizado) {
            contenido += `<div style="margin-top: 20px; padding: 10px; border-left: 3px solid #10b981;"><p><strong>Nota:</strong> ${mensajePersonalizado}</p></div>`;
        }
        
        // Footer con nombre de empresa
        contenido += `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;"><p>${nombreEmpresa}</p></div>`;
        
        await enviarNotificacion(artista.correo, asunto, contenido, nombreEmpresa);
        resultado = { success: true, message: 'Correo enviado correctamente', destinatario: artista.correo };
        
    } else if (medio === 'whatsapp') {
        // Construir mensaje para WhatsApp
        let mensaje = `Hola ${nombreArtista}, te escribe ${nombreEmpresa}...`;
        
        switch (tipo) {
            case 'entrega':
                const linkCarpeta = proyecto.enlaceEntrega || 'No disponible';
                mensaje += `\n\n✅ ¡Tu proyecto "${nombreProyecto}" está listo!\n\n`;
                mensaje += `📁 Link de entrega:\n${linkCarpeta}\n\n`;
                if (proyecto.archivos && proyecto.archivos.length > 0) {
                    mensaje += `📦 ${proyecto.archivos.length} archivo(s) disponible(s)\n`;
                }
                break;
                
            case 'resumen':
                mensaje += `\n\n📋 Resumen de tu proyecto "${nombreProyecto}":\n`;
                mensaje += `• Total: $${proyecto.total.toFixed(2)} MXN\n`;
                mensaje += `• Pagado: $${(proyecto.montoPagado || 0).toFixed(2)} MXN\n`;
                mensaje += `• Saldo: $${saldoPendiente.toFixed(2)} MXN\n`;
                mensaje += `• Estado: ${proyecto.proceso}\n`;
                break;
                
            case 'recordatorio':
                if (saldoPendiente <= 0) {
                    return res.status(400).json({ error: 'El proyecto no tiene saldo pendiente' });
                }
                mensaje += `\n\n💰 Recordatorio de saldo pendiente:\n\n`;
                mensaje += `Proyecto: ${nombreProyecto}\n`;
                mensaje += `Saldo a pagar: *$${saldoPendiente.toFixed(2)} MXN*\n\n`;
                mensaje += `Quedamos atentos para cualquier duda.`;
                break;
        }
        
        // Agregar mensaje personalizado si existe
        if (mensajePersonalizado) {
            mensaje += `\n\n📝 Nota: ${mensajePersonalizado}`;
        }
        
        // Generar link de WhatsApp
        const telefonoLimpio = artista.telefono.replace(/[^0-9]/g, '');
        const waLink = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje)}`;
        
        resultado = { 
            success: true, 
            message: 'Link de WhatsApp generado', 
            waLink: waLink,
            telefono: artista.telefono,
            preview: mensaje.substring(0, 100) + '...'
        };
    }
    
    res.json(resultado);
}));

module.exports = router;