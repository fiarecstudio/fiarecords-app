const Conversation = require('../../models/Conversation');

/**
 * Handler de Conexión/Desconexión
 * FASE 2: Gestión de estado online y salas personales
 * 
 * REGLA DE ORO: Toda operación valida empresaId del socket
 */

module.exports = (socket, io) => {
    console.log('[Connection] Handler connection ejecutado');
    console.log(`[Connection] Handler cargado para: ${socket.user?.username || 'unknown'}`);
    
    // ============================================================
    // CONEXIÓN INICIAL
    // ============================================================
    
    // Unir al usuario a su sala personal para mensajes directos
    // Formato: user:{userId}
    const userRoom = `user:${socket.user.id}`;
    socket.join(userRoom);
    console.log(`[Connection] ${socket.user.username} unido a sala personal: ${userRoom}`);
    
    // Notificar a la empresa que el usuario está online
    // Todos los usuarios de la misma empresa reciben la notificación
    if (socket.user.empresaId) {
        const empresaRoom = `empresa:${socket.user.empresaId}`;
        socket.join(empresaRoom);
        
        // Emitir a otros usuarios de la empresa (excluyendo al que se conecta)
        socket.to(empresaRoom).emit('user:online', {
            userId: socket.user.id,
            username: socket.user.username,
            role: socket.user.role,
            timestamp: new Date()
        });
    }
    
    // ============================================================
    // EVENTO: Obtener conversaciones activas al conectar
    // ============================================================
    
    socket.on('user:getConversations', async (data, callback) => {
        console.log('[Connection] ===========================================');
        console.log('[Connection] EVENTO user:getConversations RECIBIDO');
        console.log('[Connection] Usuario:', socket.user?.username);
        console.log('[Connection] Data:', data);
        console.log('[Connection] Callback es funcion:', typeof callback === 'function');
        
        try {
            console.log('[Connection] EmpresaId:', socket.user.empresaId);
            console.log('[Connection] UserId:', socket.user.id);
            
            // REGLA DE ORO: Filtrar por empresaId
            const conversations = await Conversation.find({
                empresaId: socket.user.empresaId,
                'participants.userId': socket.user.id,
                isActive: true
            })
            .select('_id type title participants lastMessage updatedAt isSupportTicket supportStatus')
            .populate('participants.userId', 'username nombre email role')
            .sort({ updatedAt: -1 })
            .limit(50);

            // Unir automáticamente a las salas de cada conversación
            conversations.forEach(conv => {
                socket.join(`conversation:${conv._id}`);
            });

            console.log(`[Connection] ${socket.user.username} unido a ${conversations.length} conversaciones`);

            const response = {
                success: true,
                conversations: conversations.map(c => ({
                    _id: c._id,
                    type: c.type,
                    title: c.title,
                    participants: c.participants,
                    lastMessage: c.lastMessage,
                    updatedAt: c.updatedAt,
                    isSupportTicket: c.isSupportTicket,
                    supportStatus: c.supportStatus,
                    unreadCount: c.participants.find(
                        p => (p.userId._id || p.userId).toString() === socket.user.id
                    )?.unreadCount || 0
                }))
            };

            console.log('[Connection] Enviando respuesta con', response.conversations.length, 'conversaciones');
            console.log('[Connection] DEBUG - Primera conversación:', JSON.stringify(response.conversations[0], null, 2));
            
            // SIEMPRE ejecutar el callback si es función
            if (typeof callback === 'function') {
                callback(response);
                console.log('[Connection] ✅ Callback ejecutado correctamente');
            } else {
                console.log('[Connection] ⚠️ No hay callback, enviando evento broadcast');
                socket.emit('user:conversationsLoaded', response);
            }
            
        } catch (error) {
            console.error('[Connection] ❌ Error obteniendo conversaciones:', error);
            const errorResponse = { 
                success: false, 
                error: 'Error al obtener conversaciones', 
                details: error.message 
            };
            
            if (typeof callback === 'function') {
                callback(errorResponse);
            } else {
                socket.emit('user:conversationsError', errorResponse);
            }
        }
        
        console.log('[Connection] ===========================================');
    });
    
    // ============================================================
    // DESCONEXIÓN
    // ============================================================
    
    socket.on('disconnect', async (reason) => {
        console.log(`[Connection] Desconexión: ${socket.user.username} - Razón: ${reason}`);
        
        // Notificar offline a la empresa
        if (socket.user.empresaId) {
            const empresaRoom = `empresa:${socket.user.empresaId}`;
            socket.to(empresaRoom).emit('user:offline', {
                userId: socket.user.id,
                username: socket.user.username,
                timestamp: new Date()
            });
        }
        
        // Actualizar lastReadAt en todas las conversaciones donde participa
        try {
            await Conversation.updateMany(
                {
                    empresaId: socket.user.empresaId,
                    'participants.userId': socket.user.id
                },
                {
                    $set: {
                        'participants.$.lastReadAt': new Date()
                    }
                }
            );
        } catch (error) {
            console.error('[Connection] Error actualizando lastReadAt:', error);
        }
    });
    
    // ============================================================
    // EVENTO: Heartbeat/Ping para mantener conexión activa
    // ============================================================
    
    socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
            callback({ 
                success: true, 
                timestamp: new Date().toISOString(),
                user: {
                    id: socket.user.id,
                    username: socket.user.username,
                    empresaId: socket.user.empresaId
                }
            });
        }
    });
};
