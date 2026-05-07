/**
 * presence.js
 * FASE 4: Handler de Presencia y Estados
 * 
 * Maneja: typing indicators, read receipts, user activity status
 */

const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');

/**
 * Configura handlers de presencia para un socket
 * @param {Socket} socket - Socket del usuario
 * @param {Namespace} io - Namespace de chat
 */
module.exports = function(socket, io) {
    
    // ============================================================
    // TYPING INDICATORS
    // ============================================================
    
    /**
     * Evento: Usuario está escribiendo
     * Payload: { conversationId, isTyping }
     */
    socket.on('presence:typing', async (data) => {
        try {
            const { conversationId, isTyping } = data;
            
            if (!conversationId) return;
            
            // Validar acceso a la conversación
            const hasAccess = await Conversation.findOne({
                _id: conversationId,
                empresaId: socket.user.empresaId,
                'participants.userId': socket.user.id,
                isActive: true
            });
            
            if (!hasAccess) {
                return; // Silenciosamente ignorar si no tiene acceso
            }
            
            // Emitir a otros participantes de la conversación (no al emisor)
            socket.to(`conversation:${conversationId}`).emit('presence:typing', {
                conversationId,
                userId: socket.user.id,
                username: socket.user.username,
                isTyping: !!isTyping,
                timestamp: new Date()
            });
            
        } catch (error) {
            console.error('[Presence] Error en typing:', error);
        }
    });
    
    // ============================================================
    // READ RECEIPTS (Confirmaciones de lectura en tiempo real)
    // ============================================================
    
    /**
     * Evento: Marcar mensaje como leído con notificación inmediata
     * Payload: { conversationId, messageIds }
     */
    socket.on('presence:markRead', async (data, callback) => {
        try {
            const { conversationId, messageIds } = data;
            
            if (!conversationId || !messageIds || !Array.isArray(messageIds)) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Datos inválidos' });
                }
                return;
            }
            
            // Validar acceso
            const conversation = await Conversation.findOne({
                _id: conversationId,
                empresaId: socket.user.empresaId,
                'participants.userId': socket.user.id,
                isActive: true
            });
            
            if (!conversation) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Acceso denegado' });
                }
                return;
            }
            
            // Actualizar mensajes
            const result = await Message.updateMany(
                {
                    _id: { $in: messageIds },
                    conversationId,
                    empresaId: socket.user.empresaId,
                    senderId: { $ne: socket.user.id }, // Solo mensajes de otros
                    'readBy.userId': { $ne: socket.user.id } // No duplicar
                },
                {
                    $push: {
                        readBy: {
                            userId: socket.user.id,
                            readAt: new Date()
                        }
                    }
                }
            );
            
            // Resetear contador de no leídos para este usuario
            await Conversation.updateOne(
                {
                    _id: conversationId,
                    'participants.userId': socket.user.id
                },
                {
                    $set: { 'participants.$.unreadCount': 0 }
                }
            );
            
            // Notificar al remitente en tiempo real
            const messages = await Message.find({
                _id: { $in: messageIds },
                conversationId
            }).select('senderId');
            
            // Emitir read receipt a cada remitente único
            const senderIds = [...new Set(messages.map(m => m.senderId.toString()))];
            
            senderIds.forEach(senderId => {
                if (senderId !== socket.user.id) {
                    io.to(`user:${senderId}`).emit('message:readReceipt', {
                        conversationId,
                        messageIds,
                        readBy: {
                            userId: socket.user.id,
                            username: socket.user.username,
                            readAt: new Date()
                        }
                    });
                }
            });
            
            // También emitir a la sala de conversación
            socket.to(`conversation:${conversationId}`).emit('conversation:read', {
                conversationId,
                userId: socket.user.id,
                username: socket.user.username,
                messageIds,
                timestamp: new Date()
            });
            
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    modifiedCount: result.modifiedCount,
                    readBy: {
                        userId: socket.user.id,
                        username: socket.user.username
                    }
                });
            }
            
        } catch (error) {
            console.error('[Presence] Error en markRead:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Error al marcar como leído' });
            }
        }
    });
    
    // ============================================================
    // ACTIVITY STATUS (última vez activo)
    // ============================================================
    
    let activityTimeout;
    
    /**
     * Evento: Reportar actividad del usuario
     * Payload: { status: 'active' | 'away' | 'busy' }
     */
    socket.on('presence:activity', async (data) => {
        try {
            const { status } = data;
            
            // Guardar en estado del socket para consultas posteriores
            socket.userStatus = status || 'active';
            
            // Notificar a empresa sobre cambio de estado
            socket.to(`empresa:${socket.user.empresaId}`).emit('presence:update', {
                userId: socket.user.id,
                username: socket.user.username,
                status: socket.userStatus,
                lastSeen: new Date()
            });
            
            // Auto-reset a 'away' después de 5 minutos de inactividad
            clearTimeout(activityTimeout);
            if (status === 'active') {
                activityTimeout = setTimeout(() => {
                    socket.userStatus = 'away';
                    socket.to(`empresa:${socket.user.empresaId}`).emit('presence:update', {
                        userId: socket.user.id,
                        username: socket.user.username,
                        status: 'away',
                        lastSeen: new Date()
                    });
                }, 5 * 60 * 1000); // 5 minutos
            }
            
        } catch (error) {
            console.error('[Presence] Error en activity:', error);
        }
    });
    
    // ============================================================
    // GET PRESENCE STATUS (Obtener estado de usuarios)
    // ============================================================
    
    /**
     * Evento: Consultar estado de usuarios
     * Payload: { userIds: [] } - si vacío, devuelve todos en la empresa
     */
    socket.on('presence:getStatus', async (data, callback) => {
        try {
            const { userIds } = data || {};
            
            // Obtener sockets conectados en la empresa
            const empresaRoom = io.adapter.rooms.get(`empresa:${socket.user.empresaId}`);
            const onlineUserIds = new Set();
            
            if (empresaRoom) {
                // Obtener IDs de sockets en la sala
                for (const socketId of empresaRoom) {
                    const socketData = io.sockets.get(socketId);
                    if (socketData && socketData.user) {
                        onlineUserIds.add({
                            userId: socketData.user.id,
                            username: socketData.user.username,
                            status: socketData.userStatus || 'active',
                            lastSeen: new Date()
                        });
                    }
                }
            }
            
            // Si se solicitaron usuarios específicos, filtrar
            let users = Array.from(onlineUserIds);
            if (userIds && Array.isArray(userIds) && userIds.length > 0) {
                users = users.filter(u => userIds.includes(u.userId));
            }
            
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    onlineUsers: users,
                    totalOnline: users.length
                });
            }
            
        } catch (error) {
            console.error('[Presence] Error en getStatus:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Error al obtener estado' });
            }
        }
    });
    
    // ============================================================
    // LIMPIEZA AL DESCONECTAR
    // ============================================================
    
    socket.on('disconnect', () => {
        clearTimeout(activityTimeout);
        
        // Notificar que el usuario está offline (el handler principal también lo hace)
        // Esto es redundante pero asegura que el estado de presencia se actualice
        socket.to(`empresa:${socket.user.empresaId}`).emit('presence:update', {
            userId: socket.user.id,
            username: socket.user.username,
            status: 'offline',
            lastSeen: new Date()
        });
    });
    
    console.log(`[Presence] Handlers registrados para: ${socket.user.username}`);
};
