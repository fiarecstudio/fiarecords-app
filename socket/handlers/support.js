/**
 * support.js
 * FASE 4: Handler de Soporte al Cliente
 * 
 * Maneja: creación de tickets, asignación a agentes, escalamiento
 */

const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const mongoose = require('mongoose');

/**
 * Configura handlers de soporte para un socket
 * @param {Socket} socket - Socket del usuario
 * @param {Namespace} io - Namespace de chat
 */
module.exports = function(socket, io) {
    
    // ============================================================
    // CREAR TICKET DE SOPORTE
    // ============================================================
    
    /**
     * Evento: Cliente crea un ticket de soporte
     * Payload: { subject, message, priority: 'low'|'medium'|'high' }
     */
    socket.on('support:createTicket', async (data, callback) => {
        try {
            const { subject, message, priority = 'medium' } = data;
            
            if (!subject || !message) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Asunto y mensaje requeridos' });
                }
                return;
            }
            
            // Buscar agentes disponibles (empleados de la empresa)
            const availableAgents = await mongoose.model('User').find({
                empresaId: socket.user.empresaId,
                role: { $in: ['admin', 'employee', 'support'] },
                isActive: true
            }).select('_id username').limit(5);
            
            // Preparar participantes (cliente + agentes)
            const participants = [
                {
                    userId: socket.user.id,
                    role: 'customer',
                    unreadCount: 0,
                    joinedAt: new Date()
                },
                ...availableAgents.map(agent => ({
                    userId: agent._id,
                    role: 'agent',
                    unreadCount: 1, // Notificar a agentes
                    joinedAt: new Date()
                }))
            ];
            
            // Crear conversación de soporte
            const conversation = new Conversation({
                empresaId: socket.user.empresaId,
                type: 'support',
                title: `🎫 Soporte: ${subject}`,
                participants,
                isSupportTicket: true,
                supportStatus: 'open',
                supportPriority: priority,
                supportMetadata: {
                    createdBy: socket.user.id,
                    assignedTo: availableAgents.length > 0 ? availableAgents[0]._id : null,
                    createdAt: new Date()
                },
                lastMessage: {
                    content: message.substring(0, 200),
                    senderId: socket.user.id,
                    senderName: socket.user.username,
                    sentAt: new Date()
                }
            });
            
            await conversation.save();
            
            // Crear mensaje inicial
            const newMessage = new Message({
                empresaId: socket.user.empresaId,
                conversationId: conversation._id,
                senderId: socket.user.id,
                senderName: socket.user.username,
                senderRole: socket.user.role,
                content: message,
                type: 'text',
                isSystemMessage: false
            });
            
            await newMessage.save();
            
            // Unir al cliente a la sala
            socket.join(`conversation:${conversation._id}`);
            
            // Notificar a agentes asignados
            availableAgents.forEach(agent => {
                io.to(`user:${agent._id}`).emit('support:newTicket', {
                    ticketId: conversation._id,
                    title: conversation.title,
                    priority,
                    customer: {
                        id: socket.user.id,
                        username: socket.user.username
                    },
                    message: message.substring(0, 100),
                    createdAt: new Date()
                });
            });
            
            // Emitir confirmación al cliente
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    conversationId: conversation._id,
                    ticketId: conversation._id,
                    assigned: availableAgents.length > 0,
                    agentName: availableAgents[0]?.username || null,
                    estimatedResponse: '15 minutos' // Podría calcularse basado en histórico
                });
            }
            
            console.log(`[Support] Ticket creado: ${conversation._id} por ${socket.user.username}`);
            
        } catch (error) {
            console.error('[Support] Error creando ticket:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Error al crear ticket' });
            }
        }
    });
    
    // ============================================================
    // ASIGNAR AGENTE A TICKET
    // ============================================================
    
    /**
     * Evento: Asignar un agente a un ticket existente
     * Payload: { ticketId, agentId }
     */
    socket.on('support:assignAgent', async (data, callback) => {
        try {
            const { ticketId, agentId } = data;
            
            // Validar que el usuario sea admin o el agente asignado
            const conversation = await Conversation.findOne({
                _id: ticketId,
                empresaId: socket.user.empresaId,
                isSupportTicket: true,
                isActive: true
            });
            
            if (!conversation) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Ticket no encontrado' });
                }
                return;
            }
            
            // Verificar permisos (admin, superadmin, o agente ya asignado)
            const isAdmin = socket.user.role === 'admin' || socket.user.isSuperAdmin;
            const isCurrentAgent = conversation.supportMetadata?.assignedTo?.toString() === socket.user.id;
            
            if (!isAdmin && !isCurrentAgent) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'No tienes permisos para asignar' });
                }
                return;
            }
            
            // Verificar que el nuevo agente existe y pertenece a la empresa
            const newAgent = await mongoose.model('User').findOne({
                _id: agentId,
                empresaId: socket.user.empresaId,
                isActive: true
            });
            
            if (!newAgent) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Agente no encontrado' });
                }
                return;
            }
            
            // Agregar como participante si no lo es
            const isParticipant = conversation.participants.some(
                p => (p.userId._id || p.userId).toString() === agentId
            );
            
            if (!isParticipant) {
                conversation.participants.push({
                    userId: agentId,
                    role: 'agent',
                    unreadCount: 1,
                    joinedAt: new Date()
                });
            }
            
            // Actualizar asignación
            conversation.supportMetadata.assignedTo = agentId;
            conversation.supportMetadata.assignedAt = new Date();
            conversation.supportMetadata.assignedBy = socket.user.id;
            
            await conversation.save();
            
            // Notificar al nuevo agente
            io.to(`user:${agentId}`).emit('support:ticketAssigned', {
                ticketId,
                title: conversation.title,
                assignedBy: socket.user.username,
                customer: conversation.participants.find(p => p.role === 'customer')?.userId
            });
            
            // Crear mensaje de sistema
            const systemMessage = new Message({
                empresaId: socket.user.empresaId,
                conversationId: ticketId,
                senderId: null,
                senderName: 'Sistema',
                content: `🔄 Ticket asignado a ${newAgent.username}`,
                type: 'system',
                isSystemMessage: true
            });
            
            await systemMessage.save();
            
            // Emitir a la conversación
            io.to(`conversation:${ticketId}`).emit('message:received', {
                message: systemMessage
            });
            
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    assignedTo: newAgent.username,
                    assignedAt: new Date()
                });
            }
            
            console.log(`[Support] Ticket ${ticketId} asignado a ${newAgent.username}`);
            
        } catch (error) {
            console.error('[Support] Error asignando agente:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Error al asignar agente' });
            }
        }
    });
    
    // ============================================================
    // ACTUALIZAR ESTADO DE TICKET
    // ============================================================
    
    /**
     * Evento: Cambiar estado del ticket
     * Payload: { ticketId, status: 'open'|'pending'|'resolved'|'closed' }
     */
    socket.on('support:updateStatus', async (data, callback) => {
        try {
            const { ticketId, status } = data;
            
            const validStatuses = ['open', 'pending', 'resolved', 'closed'];
            if (!validStatuses.includes(status)) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Estado inválido' });
                }
                return;
            }
            
            // Validar acceso
            const conversation = await Conversation.findOne({
                _id: ticketId,
                empresaId: socket.user.empresaId,
                isSupportTicket: true
            });
            
            if (!conversation) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Ticket no encontrado' });
                }
                return;
            }
            
            // Verificar que sea participante o admin
            const isParticipant = conversation.participants.some(
                p => (p.userId._id || p.userId).toString() === socket.user.id
            );
            const isAdmin = socket.user.role === 'admin' || socket.user.isSuperAdmin;
            
            if (!isParticipant && !isAdmin) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'No autorizado' });
                }
                return;
            }
            
            // Actualizar estado
            conversation.supportStatus = status;
            
            if (status === 'resolved') {
                conversation.supportMetadata.resolvedAt = new Date();
                conversation.supportMetadata.resolvedBy = socket.user.id;
            } else if (status === 'closed') {
                conversation.supportMetadata.closedAt = new Date();
                conversation.supportMetadata.closedBy = socket.user.id;
            }
            
            await conversation.save();
            
            // Crear mensaje de sistema
            const statusMessages = {
                'open': '🟢 Ticket reabierto',
                'pending': '⏳ Ticket en espera',
                'resolved': '✅ Ticket resuelto',
                'closed': '🔒 Ticket cerrado'
            };
            
            const systemMessage = new Message({
                empresaId: socket.user.empresaId,
                conversationId: ticketId,
                senderId: null,
                senderName: 'Sistema',
                content: statusMessages[status],
                type: 'system',
                isSystemMessage: true
            });
            
            await systemMessage.save();
            
            // Notificar a todos en la conversación
            io.to(`conversation:${ticketId}`).emit('support:statusUpdate', {
                ticketId,
                status,
                updatedBy: socket.user.username,
                updatedAt: new Date()
            });
            
            io.to(`conversation:${ticketId}`).emit('message:received', {
                message: systemMessage
            });
            
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    status,
                    updatedAt: new Date()
                });
            }
            
            console.log(`[Support] Ticket ${ticketId} -> ${status} por ${socket.user.username}`);
            
        } catch (error) {
            console.error('[Support] Error actualizando estado:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Error al actualizar estado' });
            }
        }
    });
    
    // ============================================================
    // OBTENER TICKETS DE SOPORTE (para agentes)
    // ============================================================
    
    /**
     * Evento: Obtener tickets de soporte asignados o de la empresa
     * Payload: { filter: 'all'|'assigned'|'open'|'pending', limit }
     */
    socket.on('support:getTickets', async (data, callback) => {
        try {
            const { filter = 'all', limit = 50 } = data || {};
            
            // Construir filtro base
            const query = {
                empresaId: socket.user.empresaId,
                isSupportTicket: true,
                isActive: true
            };
            
            // Filtrar por estado
            if (filter === 'open') {
                query.supportStatus = 'open';
            } else if (filter === 'pending') {
                query.supportStatus = 'pending';
            } else if (filter === 'resolved') {
                query.supportStatus = 'resolved';
            }
            
            // Si no es admin, solo mostrar tickets asignados al usuario
            const isAdmin = socket.user.role === 'admin' || socket.user.isSuperAdmin;
            if (!isAdmin && filter === 'assigned') {
                query['supportMetadata.assignedTo'] = socket.user.id;
            }
            
            const tickets = await Conversation.find(query)
                .sort({ 'supportPriority': -1, 'supportMetadata.createdAt': -1 })
                .limit(limit)
                .lean();
            
            // Formatear respuesta
            const formattedTickets = tickets.map(t => ({
                id: t._id,
                title: t.title,
                status: t.supportStatus,
                priority: t.supportPriority,
                createdAt: t.supportMetadata?.createdAt,
                assignedTo: t.supportMetadata?.assignedTo,
                customer: t.participants?.find(p => p.role === 'customer'),
                lastMessage: t.lastMessage,
                unreadCount: t.participants?.find(
                    p => (p.userId._id || p.userId).toString() === socket.user.id
                )?.unreadCount || 0
            }));
            
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    tickets: formattedTickets,
                    total: formattedTickets.length,
                    filter
                });
            }
            
        } catch (error) {
            console.error('[Support] Error obteniendo tickets:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Error al obtener tickets' });
            }
        }
    });
    
    console.log(`[Support] Handlers registrados para: ${socket.user.username}`);
};
