const Conversation = require('../../models/Conversation');
const mongoose = require('mongoose');

/**
 * Handler de Salas (Rooms)
 * FASE 2: Gestión de unión/salida de conversaciones
 * 
 * REGLA DE ORO: Validar empresaId + participación antes de unir a sala
 */

module.exports = (socket, io) => {
    
    // ============================================================
    // UNIRSE A UNA CONVERSACIÓN
    // ============================================================
    
    socket.on('room:join', async (data, callback) => {
        try {
            const { conversationId } = data;
            
            if (!conversationId) {
                return callback?.({ 
                    success: false, 
                    error: 'conversationId requerido' 
                });
            }
            
            // Validar ObjectId
            if (!mongoose.Types.ObjectId.isValid(conversationId)) {
                return callback?.({ 
                    success: false, 
                    error: 'conversationId inválido' 
                });
            }
            
            const isAdmin = socket.user.role === 'admin' || socket.user.isSuperAdmin;

            // REGLA DE ORO: Verificar acceso para usuarios normales.
            // Los admins/superadmins pueden unirse a cualquier conversación sin el filtro estricto de empresa.
            const conversationQuery = {
                _id: conversationId,
                isActive: true
            };

            if (!isAdmin) {
                conversationQuery.empresaId = socket.user.empresaId;
                conversationQuery['participants.userId'] = socket.user.id;
            }

            const conversation = await Conversation.findOne(conversationQuery);
            
            if (!conversation) {
                console.warn(`[Rooms] Acceso denegado: ${socket.user.username} a conversación ${conversationId}`);
                return callback?.({ 
                    success: false, 
                    error: 'Acceso denegado a la conversación' 
                });
            }
            
            // Unir a la sala
            const roomName = `conversation:${conversationId}`;
            socket.join(roomName);
            
            console.log(`[Rooms] ${socket.user.username} unido a ${roomName}`);
            
            // Notificar a otros participantes (que alguien entró)
            socket.to(roomName).emit('user:joined', {
                conversationId,
                userId: socket.user.id,
                username: socket.user.username,
                timestamp: new Date()
            });
            
            // Resetear contador de no leídos para esta conversación
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
            
            callback?.({ 
                success: true, 
                conversation: {
                    id: conversation._id,
                    type: conversation.type,
                    title: conversation.title,
                    participants: conversation.participants.map(p => ({
                        userId: p.userId,
                        role: p.role
                    }))
                }
            });
            
        } catch (error) {
            console.error('[Rooms] Error en room:join:', error);
            callback?.({ 
                success: false, 
                error: 'Error al unirse a la conversación' 
            });
        }
    });
    
    // ============================================================
    // SALIR DE UNA CONVERSACIÓN (cuando el usuario cambia de chat)
    // ============================================================
    
    socket.on('room:leave', async (data, callback) => {
        try {
            const { conversationId } = data;
            
            if (!conversationId) {
                return callback?.({
                    success: false,
                    error: 'conversationId requerido'
                });
            }
            
            const roomName = `conversation:${conversationId}`;
            socket.leave(roomName);
            
            console.log(`[Rooms] ${socket.user.username} salió de ${roomName}`);
            
            // Notificar a otros que salió
            socket.to(roomName).emit('user:left', {
                conversationId,
                userId: socket.user.id,
                username: socket.user.username,
                timestamp: new Date()
            });
            
            // Responder al cliente
            callback?.({ success: true });
            
        } catch (error) {
            console.error('[Rooms] Error en room:leave:', error);
            callback?.({ 
                success: false, 
                error: 'Error al salir de la conversación' 
            });
        }
    });
    
    // ============================================================
    // CREAR NUEVA CONVERSACIÓN DIRECTA
    // ============================================================
    
    socket.on('room:createDirect', async (data, callback) => {
        try {
            const { targetUserId } = data;
            
            if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
                return callback?.({ 
                    success: false, 
                    error: 'targetUserId inválido' 
                });
            }
            
            // No permitir conversación consigo mismo
            if (targetUserId === socket.user.id.toString()) {
                return callback?.({ 
                    success: false, 
                    error: 'No puedes crear conversación contigo mismo' 
                });
            }

            const Usuario = require('../../models/Usuario');
            const STAFF_ROLES = ['admin', 'administrador', 'empleado', 'employee', 'ingeniero', 'diseñador', 'soporte', 'support'];
            const requesterRole = (socket.user.role || '').toLowerCase();

            if (requesterRole === 'cliente') {
                const targetUser = await Usuario.findOne({
                    _id: targetUserId,
                    empresaId: socket.user.empresaId,
                    isDeleted: { $ne: true }
                }).select('role');

                if (!targetUser || !STAFF_ROLES.includes((targetUser.role || '').toLowerCase())) {
                    return callback?.({
                        success: false,
                        error: 'Solo puedes chatear con el equipo de administración de tu empresa'
                    });
                }
            }
            
            // Verificar si ya existe conversación directa entre estos usuarios
            const existingConversation = await Conversation.findOne({
                empresaId: socket.user.empresaId,  // 🔒 Aislamiento
                type: 'direct',
                isActive: true,
                'participants.userId': { 
                    $all: [
                        new mongoose.Types.ObjectId(socket.user.id),
                        new mongoose.Types.ObjectId(targetUserId)
                    ]
                }
            });
            
            if (existingConversation) {
                // Poblar la conversación existente
                const populatedConv = await Conversation.findById(existingConversation._id)
                    .populate('participants.userId', 'username nombre email role');

                // Unir a la sala existente
                socket.join(`conversation:${existingConversation._id}`);

                return callback?.({
                    success: true,
                    conversationId: existingConversation._id,
                    conversation: populatedConv,
                    existed: true
                });
            }

            // Crear nueva conversación
            const newConversation = new Conversation({
                empresaId: socket.user.empresaId,
                type: 'direct',
                participants: [
                    {
                        userId: socket.user.id,
                        role: 'member',
                        joinedAt: new Date()
                    },
                    {
                        userId: new mongoose.Types.ObjectId(targetUserId),
                        role: 'member',
                        joinedAt: new Date()
                    }
                ],
                isActive: true
            });

            await newConversation.save();

            // Poblar la conversación recién creada
            const populatedConv = await Conversation.findById(newConversation._id)
                .populate('participants.userId', 'username nombre email role');

            // Unir al creador
            socket.join(`conversation:${newConversation._id}`);

            console.log(`[Rooms] Nueva conversación creada: ${newConversation._id}`);

            // Emitir evento conversation:updated a la sala de empresa para actualizar interfaces
            const empresaRoom = `empresa:${socket.user.empresaId}`;
            io.of('/chat').to(empresaRoom).emit('conversation:updated', {
                conversationId: populatedConv._id,
                title: populatedConv.title,
                participants: populatedConv.participants,
                type: populatedConv.type,
                lastMessage: populatedConv.lastMessage,
                updatedAt: populatedConv.updatedAt,
                unreadIncrement: 1
            });

            callback?.({
                success: true,
                conversationId: newConversation._id,
                conversation: populatedConv,
                existed: false
            });
            
        } catch (error) {
            console.error('[Rooms] Error creando conversación:', error);
            callback?.({ 
                success: false, 
                error: 'Error al crear conversación' 
            });
        }
    });
    
    // ============================================================
    // OBTENER PARTICIPANTES ONLINE DE UNA CONVERSACIÓN
    // ============================================================
    
    socket.on('room:getOnlineUsers', async (data, callback) => {
        try {
            const { conversationId } = data;
            
            if (!conversationId) {
                return callback?.({ 
                    success: false, 
                    error: 'conversationId requerido' 
                });
            }
            
            // Verificar acceso
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
            
            // Obtener sockets en la sala
            const roomName = `conversation:${conversationId}`;
            const socketsInRoom = await io.in(roomName).fetchSockets();
            
            const onlineUsers = socketsInRoom.map(s => ({
                userId: s.user.id,
                username: s.user.username
            }));
            
            callback?.({
                success: true,
                onlineUsers
            });
            
        } catch (error) {
            console.error('[Rooms] Error obteniendo usuarios online:', error);
            callback?.({ 
                success: false, 
                error: 'Error al obtener usuarios online' 
            });
        }
    });
};
