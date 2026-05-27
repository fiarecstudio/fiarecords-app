const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
const mongoose = require('mongoose');
const { getIO } = require('../index');

/**
 * Handler de Mensajes
 * FASE 2: Enviar, recibir, y persistir mensajes
 * 
 * REGLA DE ORO: Validar empresaId + participación en CADA operación
 */

module.exports = (socket, io) => {
    
    // ============================================================
    // ENVIAR MENSAJE
    // ============================================================
    
    socket.on('message:send', async (data, callback) => {
        try {
            const { 
                conversationId, 
                content, 
                type = 'text', 
                replyTo = null,
                fileData = null
            } = data;
            
            // Validaciones básicas
            if (!conversationId || !content) {
                return callback?.({ 
                    success: false, 
                    error: 'conversationId y content son requeridos' 
                });
            }
            
            // Validar tipo de mensaje
            const validTypes = ['text', 'image', 'file', 'audio', 'system'];
            if (!validTypes.includes(type)) {
                return callback?.({ 
                    success: false, 
                    error: 'Tipo de mensaje inválido' 
                });
            }
            
            // Validar ObjectId
            if (!mongoose.Types.ObjectId.isValid(conversationId)) {
                return callback?.({ 
                    success: false, 
                    error: 'conversationId inválido' 
                });
            }
            
            // REGLA DE ORO: Validar participación (empresaId + membresía)
            const conversation = await Conversation.findOne({
                _id: conversationId,
                empresaId: socket.user.empresaId,  // 🔒 Aislamiento crítico
                'participants.userId': socket.user.id,  // 🔒 Verificar participación
                isActive: true
            }).populate('participants.userId', 'username nombre email role');

            if (!conversation) {
                console.warn(`[Messages] Acceso denegado: ${socket.user.username} a conversación ${conversationId}`);
                return callback?.({
                    success: false,
                    error: 'Acceso denegado a la conversación'
                });
            }
            
            // Crear el mensaje
            const messageData = {
                empresaId: socket.user.empresaId,
                conversationId: new mongoose.Types.ObjectId(conversationId),
                senderId: socket.user.id,
                senderName: socket.user.username,
                senderRole: socket.user.role,
                type,
                content: content.trim(),
                replyTo: replyTo ? {
                    messageId: new mongoose.Types.ObjectId(replyTo.messageId),
                    content: replyTo.content,
                    senderName: replyTo.senderName
                } : null
            };
            
            // Agregar datos de archivo si existe
            if (fileData && (type === 'image' || type === 'file' || type === 'audio')) {
                messageData.fileData = {
                    originalName: fileData.originalName,
                    mimeType: fileData.mimeType,
                    size: fileData.size,
                    driveId: fileData.driveId,
                    url: fileData.url
                };
            }
            
            const message = new Message(messageData);
            await message.save();
            
            // Actualizar conversación (último mensaje + contador)
            await Conversation.updateOne(
                { _id: conversationId },
                {
                    $set: {
                        lastMessage: {
                            messageId: message._id,
                            content: type === 'text' ? content : `[${type}]`,
                            senderId: message.senderId,
                            senderName: message.senderName,
                            type: message.type,
                            sentAt: message.createdAt
                        },
                        updatedAt: new Date()
                    },
                    $inc: { messageCount: 1 }
                }
            );
            
            // Incrementar unreadCount para otros participantes
            await Conversation.updateOne(
                { 
                    _id: conversationId,
                    'participants.userId': { $ne: socket.user.id }
                },
                {
                    $inc: { 'participants.$[].unreadCount': 1 }
                }
            );
            
            // Preparar objeto de respuesta para emitir
            const messageResponse = {
                _id: message._id,
                conversationId: message.conversationId,
                senderId: message.senderId,
                senderName: message.senderName,
                senderRole: message.senderRole,
                type: message.type,
                content: message.content,
                fileData: message.fileData,
                replyTo: message.replyTo,
                createdAt: message.createdAt,
                readBy: []  // Inicialmente no leído por nadie
            };
            
            // EMITIR a la sala de la conversación
            // socket.to() excluye al emisor (mensaje ya aparece en UI local)
            const conversationRoom = `conversation:${conversationId}`;
            const participantIds = conversation.participants
                .map(p => (p.userId._id || p.userId).toString())
                .filter(id => id !== socket.user.id.toString());

            console.log('[Messages] EMITIENDO message:received a sala de conversación:', conversationRoom);
            console.log('[Messages] Emisor:', {
                socketId: socket.id,
                userId: socket.user.id,
                username: socket.user.username
            });
            console.log('[Messages] Destinatarios esperados:', participantIds);

            io.to(conversationRoom).emit('message:received', {
                message: messageResponse
            });

            // Fallback: si hay participantes conectados por user room y no están unidos a la sala,
            // enviarles el mensaje directamente para evitar que se pierda si la sala no fue unida.
            try {
                const activeConversationSockets = await io.in(conversationRoom).allSockets();
                console.log('[Messages] Sockets activos en', conversationRoom, ':', Array.from(activeConversationSockets));

                participantIds.forEach(async (participantId) => {
                    const userRoom = `user:${participantId}`;
                    try {
                        const userSockets = await io.in(userRoom).allSockets();

                        userSockets.forEach((socketId) => {
                            const joinedConversationRoom = activeConversationSockets.has(socketId);
                            console.log('[Messages] Verificando socket receptor:', {
                                participantId,
                                socketId,
                                userRoom,
                                joinedConversationRoom
                            });

                            if (!joinedConversationRoom) {
                                io.to(socketId).emit('message:received', {
                                    message: messageResponse
                                });
                                console.log('[Messages] Fallback emit enviado a socket directo:', socketId, 'para usuario', participantId);
                            }
                        });
                    } catch (err) {
                        console.warn('[Messages] Error obteniendo sockets para user room:', userRoom, err.message);
                    }
                });
            } catch (fallbackError) {
                console.warn('[Messages] Fallback socket delivery falló:', fallbackError.message);
            }
            
            // También emitir al namespace /support para visitantes
            try {
                const mainIO = getIO();
                mainIO.of('/support').to(conversationRoom).emit('message:received', {
                    message: messageResponse
                });
            } catch (err) {
                console.log('[Messages] Namespace /support no disponible');
            }
            
            // Notificar a cada participante para actualizar su lista de conversaciones
            const participants = conversation.participants
                .filter(p => (p.userId._id || p.userId).toString() !== socket.user.id.toString());

            participants.forEach(participant => {
                io.to(`user:${participant.userId._id || participant.userId}`).emit('conversation:updated', {
                    conversationId,
                    title: conversation.title,
                    participants: conversation.participants,
                    type: conversation.type,
                    lastMessage: {
                        content: messageResponse.content,
                        senderName: messageResponse.senderName,
                        type: messageResponse.type,
                        sentAt: messageResponse.createdAt
                    },
                    unreadIncrement: 1
                });
            });
            
            console.log(`[Messages] Mensaje enviado: ${message._id} por ${socket.user.username}`);
            
            // Responder al emisor con confirmación
            callback?.({ 
                success: true, 
                message: messageResponse 
            });
            
        } catch (error) {
            console.error('[Messages] Error enviando mensaje:', error);
            callback?.({ 
                success: false, 
                error: 'Error al enviar mensaje' 
            });
        }
    });
    
    // ============================================================
    // MARCAR MENSAJES COMO LEÍDOS
    // ============================================================
    
    socket.on('message:read', async (data, callback) => {
        try {
            const { conversationId, messageIds } = data;
            
            if (!conversationId || !Array.isArray(messageIds) || messageIds.length === 0) {
                return callback?.({ 
                    success: false, 
                    error: 'conversationId y messageIds[] son requeridos' 
                });
            }
            
            // Validar ObjectIds
            if (!mongoose.Types.ObjectId.isValid(conversationId)) {
                return callback?.({ 
                    success: false, 
                    error: 'conversationId inválido' 
                });
            }
            
            const validMessageIds = messageIds
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
            
            if (validMessageIds.length === 0) {
                return callback?.({ 
                    success: false, 
                    error: 'No hay messageIds válidos' 
                });
            }
            
            // REGLA DE ORO: Verificar acceso a la conversación
            const hasAccess = await Conversation.exists({
                _id: conversationId,
                empresaId: socket.user.empresaId,  // 🔒 Aislamiento
                'participants.userId': socket.user.id,
                isActive: true
            });
            
            if (!hasAccess) {
                return callback?.({ 
                    success: false, 
                    error: 'Acceso denegado' 
                });
            }
            
            // Marcar mensajes como leídos (solo si no los ha leído ya)
            const result = await Message.updateMany(
                {
                    _id: { $in: validMessageIds },
                    conversationId: new mongoose.Types.ObjectId(conversationId),
                    empresaId: socket.user.empresaId,  // 🔒 Aislamiento
                    'readBy.userId': { $ne: socket.user.id }  // No leído aún por este usuario
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
            
            // Resetear contador de no leídos del usuario en esta conversación
            await Conversation.updateOne(
                { 
                    _id: conversationId, 
                    'participants.userId': socket.user.id 
                },
                { 
                    $set: { 
                        'participants.$.unreadCount': 0,
                        'participants.$.lastReadAt': new Date()
                    } 
                }
            );
            
            // Notificar a la sala que estos mensajes fueron leídos
            socket.to(`conversation:${conversationId}`).emit('message:readReceipt', {
                conversationId,
                messageIds: validMessageIds,
                readBy: {
                    userId: socket.user.id,
                    username: socket.user.username
                },
                readAt: new Date()
            });
            
            console.log(`[Messages] ${result.modifiedCount} mensajes marcados como leídos por ${socket.user.username}`);
            
            callback?.({ 
                success: true, 
                modifiedCount: result.modifiedCount 
            });
            
        } catch (error) {
            console.error('[Messages] Error marcando como leído:', error);
            callback?.({ 
                success: false, 
                error: 'Error al marcar mensajes como leídos' 
            });
        }
    });
    
    // ============================================================
    // OBTENER HISTORIAL DE MENSAJES (vía Socket - alternativa al REST)
    // ============================================================
    
    socket.on('message:getHistory', async (data, callback) => {
        try {
            const { 
                conversationId, 
                before = null,  // MensajeId para paginación (antes de este)
                limit = 50 
            } = data;
            
            if (!conversationId) {
                return callback?.({ 
                    success: false, 
                    error: 'conversationId requerido' 
                });
            }
            
            // REGLA DE ORO: Verificar acceso
            const hasAccess = await Conversation.exists({
                _id: conversationId,
                empresaId: socket.user.empresaId,  // 🔒 Aislamiento
                'participants.userId': socket.user.id,
                isActive: true
            });
            
            if (!hasAccess) {
                return callback?.({ 
                    success: false, 
                    error: 'Acceso denegado' 
                });
            }
            
            // Construir query de paginación
            const query = {
                conversationId: new mongoose.Types.ObjectId(conversationId),
                empresaId: socket.user.empresaId,  // 🔒 Aislamiento
                isDeleted: false
            };
            
            if (before && mongoose.Types.ObjectId.isValid(before)) {
                query._id = { $lt: new mongoose.Types.ObjectId(before) };
            }
            
            // Obtener mensajes ordenados por fecha descendente (más nuevos primero)
            const messages = await Message.find(query)
                .sort({ createdAt: -1 })
                .limit(Math.min(limit, 100))  // Máximo 100
                .lean();
            
            // Invertir para orden cronológico (más antiguos primero)
            messages.reverse();
            
            callback?.({ 
                success: true, 
                messages: messages.map(m => ({
                    _id: m._id,
                    senderId: m.senderId,
                    senderName: m.senderName,
                    senderRole: m.senderRole,
                    type: m.type,
                    content: m.content,
                    fileData: m.fileData,
                    replyTo: m.replyTo,
                    createdAt: m.createdAt,
                    readBy: m.readBy
                })),
                hasMore: messages.length === limit
            });
            
        } catch (error) {
            console.error('[Messages] Error obteniendo historial:', error);
            callback?.({ 
                success: false, 
                error: 'Error al obtener historial' 
            });
        }
    });
    
    // ============================================================
    // EDITAR MENSAJE (solo si es el remitente y dentro de 15 min)
    // ============================================================
    
    socket.on('message:edit', async (data, callback) => {
        try {
            const { messageId, newContent } = data;
            
            if (!messageId || !newContent || !mongoose.Types.ObjectId.isValid(messageId)) {
                return callback?.({ 
                    success: false, 
                    error: 'Datos inválidos' 
                });
            }
            
            // Buscar mensaje validando empresaId + remitente
            const message = await Message.findOne({
                _id: messageId,
                empresaId: socket.user.empresaId,  // 🔒 Aislamiento
                senderId: socket.user.id,  // Solo puede editar el remitente
                isDeleted: false
            });
            
            if (!message) {
                return callback?.({ 
                    success: false, 
                    error: 'Mensaje no encontrado o no tienes permiso' 
                });
            }
            
            // Verificar que sea dentro de los 15 minutos
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
            if (message.createdAt < fifteenMinutesAgo) {
                return callback?.({ 
                    success: false, 
                    error: 'No puedes editar mensajes de hace más de 15 minutos' 
                });
            }
            
            // Actualizar mensaje
            message.content = newContent.trim();
            message.updatedAt = new Date();
            await message.save();
            
            // Notificar a la sala
            io.to(`conversation:${message.conversationId}`).emit('message:edited', {
                messageId: message._id,
                conversationId: message.conversationId,
                newContent: message.content,
                editedAt: message.updatedAt
            });
            
            callback?.({ success: true });
            
        } catch (error) {
            console.error('[Messages] Error editando mensaje:', error);
            callback?.({ 
                success: false, 
                error: 'Error al editar mensaje' 
            });
        }
    });
};
