const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Usuario = require('../models/Usuario');
const { hasTenantAccess, buildQueryFilter } = require('../middleware/tenantFilter');

/** Roles que un cliente puede ver/contactar (sin otros clientes). */
const STAFF_ROLES_FOR_CLIENT_CONTACT = [
    'admin',
    'administrador',
    'empleado',
    'employee',
    'ingeniero',
    'diseñador',
    'soporte',
    'support'
];

function normalizeUserRole(role) {
    return (role || '').toString().trim().toLowerCase();
}

function isClienteRole(role) {
    return normalizeUserRole(role) === 'cliente';
}

function isStaffRoleForClientContact(role) {
    return STAFF_ROLES_FOR_CLIENT_CONTACT.includes(normalizeUserRole(role));
}

/**
 * Chat Controller
 * FASE 2: Endpoints REST para chat
 * 
 * REGLA DE ORO: Todas las queries filtran por empresaId del usuario
 */

// ============================================================
// CONVERSACIONES
// ============================================================

/**
 * GET /api/chat/conversations
 * Obtener lista de conversaciones del usuario
 */
exports.getConversations = async (req, res) => {
    try {
        console.log('[ChatController] GET /conversations - User:', req.user?.username, 'Empresa:', req.user?.empresaId);
        
        const { type } = req.query;  // 'direct', 'group', 'support' o undefined para todos
        
        // REGLA DE ORO: Usar buildQueryFilter para respetar aislamiento multi-tenant
        const tenantFilter = buildQueryFilter(req);
        const filter = {
            ...tenantFilter,
            'participants.userId': req.user.id,
            isActive: true
        };
        
        if (type && ['direct', 'group', 'support'].includes(type)) {
            filter.type = type;
        }
        
        const conversations = await Conversation.find(filter)
            .select('_id type title participants lastMessage updatedAt isSupportTicket supportStatus')
            .populate('participants.userId', 'role username')
            .sort({ updatedAt: -1 })
            .lean();

        let visibleConversations = conversations;

        // Cliente: solo hilos directos/soporte con personal de la empresa (no otros clientes ni grupos)
        if (isClienteRole(req.user.role)) {
            visibleConversations = conversations.filter((conv) => {
                if (conv.type === 'group') return false;
                if (!['direct', 'support'].includes(conv.type)) return false;

                const otherParticipants = (conv.participants || []).filter(
                    (p) => p.userId && p.userId._id.toString() !== req.user.id.toString()
                );

                if (otherParticipants.length === 0) return conv.type === 'support';

                return otherParticipants.every(
                    (p) => p.userId && isStaffRoleForClientContact(p.userId.role)
                );
            });
        }
        
        // Formatear respuesta
        const formattedConversations = visibleConversations.map(conv => {
            const myParticipant = conv.participants.find(
                p => p.userId.toString() === req.user.id.toString()
            );
            
            return {
                id: conv._id,
                type: conv.type,
                title: conv.title,
                lastMessage: conv.lastMessage,
                updatedAt: conv.updatedAt,
                unreadCount: myParticipant?.unreadCount || 0,
                isSupportTicket: conv.isSupportTicket,
                supportStatus: conv.supportStatus
            };
        });
        
        res.json({
            success: true,
            count: formattedConversations.length,
            conversations: formattedConversations
        });
        
    } catch (error) {
        console.error('[ChatController] Error getConversations:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener conversaciones' 
        });
    }
};

/**
 * GET /api/chat/conversations/:id
 * Obtener detalle de una conversación
 */
exports.getConversationById = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false, 
                error: 'ID inválido' 
            });
        }
        
        // REGLA DE ORO: Usar buildQueryFilter + verificar participación
        const tenantFilter = buildQueryFilter(req);
        const conversation = await Conversation.findOne({
            _id: id,
            ...tenantFilter,
            'participants.userId': req.user.id,
            isActive: true
        })
        .populate('participants.userId', 'username role')  // Populate datos básicos
        .lean();
        
        if (!conversation) {
            return res.status(404).json({ 
                success: false, 
                error: 'Conversación no encontrada' 
            });
        }
        
        // Contar mensajes totales (usar mismo tenantFilter)
        const messageCount = await Message.countDocuments({
            conversationId: id,
            ...tenantFilter,
            isDeleted: false
        });
        
        res.json({
            success: true,
            conversation: {
                id: conversation._id,
                type: conversation.type,
                title: conversation.title,
                participants: conversation.participants.map(p => ({
                    userId: p.userId._id,
                    username: p.userId.username,
                    role: p.userId.role,
                    roleInChat: p.role,
                    joinedAt: p.joinedAt
                })),
                lastMessage: conversation.lastMessage,
                messageCount,
                isSupportTicket: conversation.isSupportTicket,
                supportStatus: conversation.supportStatus,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt
            }
        });
        
    } catch (error) {
        console.error('[ChatController] Error getConversationById:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener conversación' 
        });
    }
};

/**
 * POST /api/chat/conversations
 * Crear nueva conversación (grupo, directa o soporte)
 */
exports.createConversation = async (req, res) => {
    try {
        const { type, title, participantIds, isSupportTicket, message } = req.body;
        
        // Validaciones
        if (!type || !['direct', 'group', 'support'].includes(type)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Tipo inválido. Use "direct", "group" o "support"' 
            });
        }
        
        let participants = [];
        
        // Si es ticket de soporte y no hay participantIds (o está vacío), buscar agentes disponibles
        if (type === 'support' && (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0)) {
            console.log('[ChatController] Creando ticket de soporte, buscando agentes...');
            
            // Buscar agentes disponibles (admin, empleado, soporte)
            const agentFilter = buildQueryFilter(req, {
                role: { $in: STAFF_ROLES_FOR_CLIENT_CONTACT },
                isDeleted: { $ne: true }
            });
            const agents = await Usuario.find(agentFilter).select('_id').limit(5);
            
            if (agents.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No hay agentes de soporte disponibles en esta empresa'
                });
            }
            
            // Participantes: cliente + agentes
            participants = [
                {
                    userId: req.user.id,
                    role: 'member',  // Cliente es member
                    joinedAt: new Date()
                },
                ...agents.map(agent => ({
                    userId: agent._id,
                    role: 'support',  // Agentes son support
                    unreadCount: 1,  // Notificar a agentes
                    joinedAt: new Date()
                }))
            ];
            
            console.log(`[ChatController] Ticket creado con ${agents.length} agentes`);
        } else {
            // Para tipos 'direct' y 'group', validar participantIds
            if (type !== 'support' && (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Se requieren participantIds' 
                });
            }
            
            // Construir participantes normal
            participants = [
                {
                    userId: req.user.id,
                    role: 'admin',  // Creador es admin
                    joinedAt: new Date()
                }
            ];
            
            for (const pid of participantIds) {
                if (pid === req.user.id.toString() || !mongoose.Types.ObjectId.isValid(pid)) continue;

                if (isClienteRole(req.user.role)) {
                    const targetUser = await Usuario.findOne({
                        _id: pid,
                        ...buildQueryFilter(req),
                        isDeleted: { $ne: true }
                    }).select('role');

                    if (!targetUser || !isStaffRoleForClientContact(targetUser.role)) {
                        return res.status(403).json({
                            success: false,
                            error: 'Solo puedes iniciar chat con el equipo de administración de tu empresa'
                        });
                    }
                }

                participants.push({
                    userId: new mongoose.Types.ObjectId(pid),
                    role: 'member',
                    joinedAt: new Date()
                });
            }
        }
        
        // Determinar título según tipo
        let defaultTitle;
        if (type === 'support') {
            defaultTitle = '🎫 Ticket de Soporte';
        } else if (type === 'direct') {
            defaultTitle = 'Chat Directo';
        } else {
            defaultTitle = 'Grupo';
        }
        
        // REGLA DE ORO: Crear con empresaId del filtro tenant
        const tenantFilter = buildQueryFilter(req);
        const conversation = new Conversation({
            empresaId: tenantFilter.empresaId || req.user.empresaId,
            type,
            title: title || defaultTitle,
            participants,
            isSupportTicket: isSupportTicket || type === 'support',
            supportStatus: type === 'support' ? 'open' : undefined
        });
        
        await conversation.save();
        
        // Si hay mensaje inicial, crearlo
        if (message && message.trim()) {
            const newMessage = new Message({
                empresaId: tenantFilter.empresaId || req.user.empresaId,
                conversationId: conversation._id,
                senderId: req.user.id,
                senderName: req.user.nombre || req.user.username || 'Usuario',
                senderRole: type === 'support' ? 'member' : 'admin',
                type: 'text',
                content: message.trim(),
                readBy: [{ userId: req.user.id, readAt: new Date() }]
            });
            
            await newMessage.save();
            
            // Actualizar último mensaje de la conversación
            conversation.lastMessage = {
                content: message.trim(),
                senderId: req.user.id,
                senderName: req.user.nombre || req.user.username || 'Usuario',
                sentAt: new Date()
            };
            await conversation.save();
            
            console.log('[ChatController] Mensaje inicial creado');
        }
        
        res.status(201).json({
            success: true,
            conversation: {
                _id: conversation._id,
                type: conversation.type,
                title: conversation.title,
                participants: conversation.participants
            }
        });
        
    } catch (error) {
        console.error('[ChatController] Error createConversation:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al crear conversación' 
        });
    }
};

// ============================================================
// MENSAJES
// ============================================================

/**
 * GET /api/chat/conversations/:id/messages
 * Obtener historial paginado de mensajes
 */
exports.getMessages = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { 
            before,      // ID del mensaje (obtener antes de este)
            after,       // ID del mensaje (obtener después de este)
            limit = 50   // Máximo mensajes por página
        } = req.query;
        
        const pageSize = Math.min(parseInt(limit) || 50, 100);  // Max 100
        
        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'ID de conversación inválido' 
            });
        }
        
        // REGLA DE ORO: Verificar acceso a la conversación usando tenantFilter
        const tenantFilter = buildQueryFilter(req);
        const hasAccess = await Conversation.exists({
            _id: conversationId,
            ...tenantFilter,
            'participants.userId': req.user.id,
            isActive: true
        });
        
        if (!hasAccess) {
            return res.status(403).json({ 
                success: false, 
                error: 'Acceso denegado a la conversación' 
            });
        }
        
        // Construir query con tenantFilter
        const query = {
            conversationId: new mongoose.Types.ObjectId(conversationId),
            ...tenantFilter,
            isDeleted: false
        };
        
        // Paginación por cursor
        if (before && mongoose.Types.ObjectId.isValid(before)) {
            query._id = { $lt: new mongoose.Types.ObjectId(before) };
        } else if (after && mongoose.Types.ObjectId.isValid(after)) {
            query._id = { $gt: new mongoose.Types.ObjectId(after) };
        }
        
        // Si se especifica after, orden ascendente (más nuevos al final)
        // Si no, orden descendente (más nuevos primero)
        const sortOrder = after ? 1 : -1;
        
        const messages = await Message.find(query)
            .sort({ createdAt: sortOrder })
            .limit(pageSize)
            .lean();
        
        // Si es paginación descendente, invertir para orden cronológico
        if (!after) {
            messages.reverse();
        }
        
        // Marcar mensajes como leídos automáticamente al obtener historial
        const unreadMessageIds = messages
            .filter(m => 
                m.senderId.toString() !== req.user.id.toString() &&
                !m.readBy.some(r => r.userId.toString() === req.user.id.toString())
            )
            .map(m => m._id);
        
        if (unreadMessageIds.length > 0) {
            await Message.updateMany(
                {
                    _id: { $in: unreadMessageIds },
                    ...tenantFilter
                },
                {
                    $push: {
                        readBy: {
                            userId: req.user.id,
                            readAt: new Date()
                        }
                    }
                }
            );
        }
        
        res.json({
            success: true,
            messages: messages.map(m => ({
                id: m._id,
                senderId: m.senderId,
                senderName: m.senderName,
                senderRole: m.senderRole,
                type: m.type,
                content: m.content,
                fileData: m.fileData,
                replyTo: m.replyTo,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
                readBy: m.readBy
            })),
            pagination: {
                hasMore: messages.length === pageSize,
                firstId: messages[0]?._id || null,
                lastId: messages[messages.length - 1]?._id || null
            }
        });
        
    } catch (error) {
        console.error('[ChatController] Error getMessages:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener mensajes' 
        });
    }
};

/**
 * GET /api/chat/unread-count
 * Obtener conteo total de mensajes no leídos
 */
exports.getUnreadCount = async (req, res) => {
    try {
        // REGLA DE ORO: Usar buildQueryFilter para respetar aislamiento
        const tenantFilter = buildQueryFilter(req);
        const conversations = await Conversation.find({
            ...tenantFilter,
            'participants.userId': req.user.id,
            isActive: true
        })
        .select('participants.$')
        .lean();
        
        const totalUnread = conversations.reduce((sum, conv) => {
            const myParticipant = conv.participants.find(
                p => p.userId.toString() === req.user.id.toString()
            );
            return sum + (myParticipant?.unreadCount || 0);
        }, 0);
        
        res.json({
            success: true,
            unreadCount: totalUnread
        });
        
    } catch (error) {
        console.error('[ChatController] Error getUnreadCount:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener conteo' 
        });
    }
};

// ============================================================
// SOPORTE (Tickets)
// ============================================================

/**
 * GET /api/chat/support/tickets
 * Obtener tickets de soporte (solo para empleados)
 */
exports.getSupportTickets = async (req, res) => {
    try {
        const { status } = req.query;  // 'open', 'in_progress', 'resolved', 'closed'
        
        // Solo empleados pueden ver tickets
        const employeeRoles = ['admin', 'ingeniero', 'diseñador'];
        if (!employeeRoles.includes(req.user.role) && !req.user.isSuperAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tienes permiso para ver tickets' 
            });
        }
        
        const tenantFilter = buildQueryFilter(req);
        const filter = {
            ...tenantFilter,
            isSupportTicket: true,
            isActive: true
        };
        
        if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
            filter.supportStatus = status;
        }
        
        const tickets = await Conversation.find(filter)
            .select('_id title participants lastMessage supportStatus updatedAt')
            .sort({ updatedAt: -1 })
            .lean();
        
        res.json({
            success: true,
            tickets: tickets.map(t => ({
                id: t._id,
                title: t.title,
                clientName: t.participants.find(p => p.role === 'member')?.userId || 'Cliente',
                lastMessage: t.lastMessage,
                status: t.supportStatus,
                updatedAt: t.updatedAt
            }))
        });
        
    } catch (error) {
        console.error('[ChatController] Error getSupportTickets:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener tickets' 
        });
    }
};

/**
 * PATCH /api/chat/support/tickets/:id/status
 * Actualizar estado de un ticket
 */
exports.updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;  // 'open', 'in_progress', 'resolved', 'closed'
        
        if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Estado inválido' 
            });
        }
        
        // Solo empleados pueden actualizar tickets
        const employeeRoles = ['admin', 'ingeniero', 'diseñador'];
        if (!employeeRoles.includes(req.user.role) && !req.user.isSuperAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tienes permiso para actualizar tickets' 
            });
        }
        
        const tenantFilter = buildQueryFilter(req);
        const ticket = await Conversation.findOneAndUpdate(
            {
                _id: id,
                ...tenantFilter,
                isSupportTicket: true
            },
            {
                $set: {
                    supportStatus: status,
                    updatedAt: new Date()
                }
            },
            { new: true }
        );
        
        if (!ticket) {
            return res.status(404).json({ 
                success: false, 
                error: 'Ticket no encontrado' 
            });
        }
        
        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                status: ticket.supportStatus
            }
        });
        
    } catch (error) {
        console.error('[ChatController] Error updateTicketStatus:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al actualizar ticket' 
        });
    }
};

// ============================================================
// USUARIOS PARA CHAT
// ============================================================

/**
 * GET /api/chat/users
 * Obtener usuarios de la empresa disponibles para chat
 * REGLA DE ORO: Usar buildQueryFilter para respetar aislamiento multi-tenant
 */
exports.getUsersForChat = async (req, res) => {
    try {
        // Usar buildQueryFilter para obtener el filtro de empresa correcto
        const tenantFilter = buildQueryFilter(req);
        console.log('[ChatController] GET /users - TenantFilter:', tenantFilter);
        
        // Combinar filtro de empresa con filtros adicionales
        const filter = {
            ...tenantFilter,
            _id: { $ne: req.user.id },
            isDeleted: { $ne: true }
        };

        if (isClienteRole(req.user.role)) {
            filter.role = { $in: STAFF_ROLES_FOR_CLIENT_CONTACT };
        }
        
        console.log('[ChatController] GET /users - Query final:', filter);
        
        const users = await Usuario.find(filter)
            .select('_id nombre email role username empresaId')
            .sort({ nombre: 1 })
            .limit(50);
        
        console.log(`[ChatController] GET /users - Encontrados: ${users.length} usuarios`);
        
        res.json({
            success: true,
            count: users.length,
            users: users.map(u => ({
                id: u._id,
                _id: u._id,
                nombre: u.nombre || u.username,
                username: u.username,
                email: u.email,
                role: u.role
            }))
        });
        
    } catch (error) {
        console.error('[ChatController] Error getUsersForChat:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener usuarios',
            details: error.message
        });
    }
};

// ============================================================
// ELIMINAR CONVERSACIÓN
// ============================================================

/**
 * DELETE /api/chat/conversations/:id
 * Eliminar conversación (soft delete para el usuario actual)
 */
exports.deleteConversation = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { permanent } = req.query; // ?permanent=true para eliminar permanentemente
        
        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'ID de conversación inválido' 
            });
        }
        
        // REGLA DE ORO: Verificar participación usando tenantFilter
        const tenantFilter = buildQueryFilter(req);
        const conversation = await Conversation.findOne({
            _id: conversationId,
            ...tenantFilter,
            'participants.userId': req.user.id
        });
        
        if (!conversation) {
            return res.status(403).json({ 
                success: false, 
                error: 'Conversación no encontrada o sin acceso' 
            });
        }
        
        if (permanent === 'true') {
            // Solo admins pueden eliminar permanentemente
            if (!['admin', 'soporte'].includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    error: 'Solo administradores pueden eliminar permanentemente'
                });
            }
            
            // Eliminar mensajes y conversación
            await Message.deleteMany({ conversationId });
            await Conversation.deleteOne({ _id: conversationId });
            
            console.log(`[ChatController] Conversación ${conversationId} eliminada permanentemente`);
        } else {
            // Soft delete: marcar como inactiva
            await Conversation.updateOne(
                { _id: conversationId },
                { 
                    isActive: false,
                    $pull: { participants: { userId: req.user.id } }
                }
            );
            
            console.log(`[ChatController] Usuario ${req.user.id} salió de conversación ${conversationId}`);
        }
        
        res.json({
            success: true,
            message: permanent === 'true' ? 'Conversación eliminada permanentemente' : 'Conversación eliminada'
        });
        
    } catch (error) {
        console.error('[ChatController] Error deleteConversation:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al eliminar conversación',
            details: error.message
        });
    }
};

// ============================================================
// CERRAR TICKET
// ============================================================

/**
 * DELETE /api/chat/support/tickets/:id
 * Cierra un ticket de soporte (marca como inactivo)
 */
exports.closeTicket = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Solo empleados pueden cerrar tickets
        const employeeRoles = ['admin', 'ingeniero', 'diseñador', 'soporte', 'empleado'];
        if (!employeeRoles.includes(req.user.role) && !req.user.isSuperAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tienes permiso para cerrar tickets' 
            });
        }
        
        const tenantFilter = buildQueryFilter(req);
        const ticket = await Conversation.findOneAndUpdate(
            {
                _id: id,
                ...tenantFilter,
                isSupportTicket: true
            },
            {
                $set: {
                    isActive: false,
                    supportStatus: 'closed',
                    updatedAt: new Date()
                }
            },
            { new: true }
        );
        
        if (!ticket) {
            return res.status(404).json({ 
                success: false, 
                error: 'Ticket no encontrado' 
            });
        }
        
        res.json({
            success: true,
            message: 'Ticket cerrado exitosamente'
        });
        
    } catch (error) {
        console.error('[ChatController] Error closeTicket:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al cerrar ticket' 
        });
    }
};
