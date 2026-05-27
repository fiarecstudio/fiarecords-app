const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { applyTenantFilter } = require('../middleware/tenantFilter');
const chatController = require('../controllers/chatController');

/**
 * Rutas de Chat
 * FASE 2: Endpoints REST para chat
 * 
 * Todas las rutas requieren autenticación JWT
 * El controlador maneja el aislamiento por empresaId
 */

// ============================================================
// MIDDLEWARE: Todas las rutas requieren auth y filtro de empresa
// ============================================================
router.use(auth);
router.use(applyTenantFilter);

// ============================================================
// CONVERSACIONES
// ============================================================

// GET /api/chat/conversations - Listar conversaciones del usuario
router.get('/conversations', chatController.getConversations);

// GET /api/chat/conversations/:id - Obtener detalle de conversación
router.get('/conversations/:id', chatController.getConversationById);

// POST /api/chat/conversations - Crear nueva conversación (grupo/soporte)
router.post('/conversations', chatController.createConversation);

// PUT /api/chat/conversations/:id/close - Cerrar conversación (soft delete)
router.put('/conversations/:id/close', chatController.closeConversation);

// PUT /api/chat/conversations/:id/reopen - Reabrir conversación
router.put('/conversations/:id/reopen', chatController.reopenConversation);

// DELETE /api/chat/conversations/:id - Eliminar conversación
router.delete('/conversations/:id', chatController.deleteConversation);

// ============================================================
// MENSAJES
// ============================================================

// GET /api/chat/conversations/:id/messages - Historial paginado
router.get('/conversations/:id/messages', chatController.getMessages);

// GET /api/chat/unread-count - Total de mensajes no leídos
router.get('/unread-count', chatController.getUnreadCount);

// ============================================================
// SOPORTE (Tickets)
// ============================================================

// GET /api/chat/support/tickets - Listar tickets (solo empleados)
router.get('/support/tickets', chatController.getSupportTickets);

// PATCH /api/chat/support/tickets/:id/status - Actualizar estado de ticket
router.patch('/support/tickets/:id/status', chatController.updateTicketStatus);

// DELETE /api/chat/support/tickets/:id - Cerrar ticket (marcar como inactivo)
router.delete('/support/tickets/:id', chatController.closeTicket);
// PATCH /api/chat/support/tickets/:id/status - Cerrar ticket o actualizar estado
router.patch('/support/tickets/:id/status', chatController.updateTicketStatus);

// ============================================================
// USUARIOS (para crear conversaciones)
// ============================================================

// GET /api/chat/users - Listar usuarios de la empresa para chat
router.get('/users', chatController.getUsersForChat);

module.exports = router;
