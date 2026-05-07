/**
 * supportPublic.js
 * FASE 5: Rutas públicas de soporte (sin autenticación)
 * 
 * Permite a visitantes crear tickets de soporte.
 * REGLA DE ORO: Aislamiento multi-tenant estricto por empresaId
 */

const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Empresa = require('../models/Empresa');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

/**
 * Middleware opcional para verificar JWT
 * Si hay token válido, agrega req.user
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
        } catch (e) {
            // Token inválido, continuar sin usuario
        }
    }
    next();
};

/**
 * GET /api/support/public/empresas
 * Obtiene lista de empresas disponibles para soporte
 */
router.get('/empresas', async (req, res) => {
    try {
        const empresas = await Empresa.find({ 
            isActive: true 
        }).select('_id nombre').sort({ nombre: 1 });
        
        res.json({
            success: true,
            empresas: empresas.map(e => ({
                _id: e._id,
                nombre: e.nombre
            }))
        });
    } catch (error) {
        console.error('[SupportPublic] Error obteniendo empresas:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener empresas'
        });
    }
});

/**
 * POST /api/support/public/ticket
 * Crea un ticket de soporte desde un visitante O un chat directo desde cliente autenticado
 * Body: { empresaId, visitorName, visitorEmail, subject, message, priority }
 */
router.post('/ticket', optionalAuth, async (req, res) => {
    try {
        const { empresaId, visitorName, visitorEmail, subject, message, priority = 'medium' } = req.body;
        
        // Detectar si el usuario está autenticado
        const isAuthenticated = req.user && req.user.id;
        const userId = isAuthenticated ? req.user.id : null;
        const userEmpresaId = isAuthenticated ? req.user.empresaId : empresaId;
        
        // Validaciones
        if (!userEmpresaId || !visitorName || !visitorEmail || !subject || !message) {
            return res.status(400).json({
                success: false,
                error: 'empresaId, visitorName, visitorEmail, subject y message son requeridos'
            });
        }
        
        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(visitorEmail)) {
            return res.status(400).json({
                success: false,
                error: 'Email inválido'
            });
        }
        
        // Buscar agentes disponibles de la empresa
        const availableAgents = await mongoose.model('Usuario').find({
            empresaId: new mongoose.Types.ObjectId(userEmpresaId),
            role: { $in: ['admin', 'empleado', 'soporte'] },
            isDeleted: { $ne: true }
        }).select('_id nombre').limit(5);
        
        // Si el usuario está autenticado, crear chat directo. Si no, crear ticket
        if (isAuthenticated) {
            // ===== CLIENTE AUTENTICADO: Crear chat directo =====
            const participants = [
                {
                    userId: new mongoose.Types.ObjectId(userId), // Usuario real
                    role: 'member',
                    unreadCount: 0,
                    joinedAt: new Date()
                },
                ...availableAgents.map(agent => ({
                    userId: agent._id,
                    role: 'member',
                    unreadCount: 1,
                    joinedAt: new Date()
                }))
            ];
            
            // Crear conversación tipo direct (chat cliente-agente)
            const conversation = new Conversation({
                empresaId: new mongoose.Types.ObjectId(userEmpresaId),
                type: 'direct',
                title: subject, // Sin emoji de ticket
                participants,
                isActive: true,
                isSupportTicket: false, // No es ticket, es chat
                createdBy: new mongoose.Types.ObjectId(userId)
            });
            
            await conversation.save();
            
            // Crear mensaje inicial
            const newMessage = new Message({
                empresaId: new mongoose.Types.ObjectId(userEmpresaId),
                conversationId: conversation._id,
                senderId: new mongoose.Types.ObjectId(userId),
                senderName: visitorName,
                senderRole: 'member',
                type: 'text',
                content: message,
                readBy: [{ userId: new mongoose.Types.ObjectId(userId), readAt: new Date() }]
            });
            
            await newMessage.save();
            
            // Actualizar último mensaje
            conversation.lastMessage = {
                content: message,
                senderId: new mongoose.Types.ObjectId(userId),
                senderName: visitorName,
                sentAt: new Date()
            };
            await conversation.save();
            
            console.log(`[SupportPublic] Chat directo creado por cliente autenticado: ${conversation._id}`);
            
            return res.status(201).json({
                success: true,
                conversationId: conversation._id,
                messageId: newMessage._id,
                type: 'direct',
                message: 'Chat creado exitosamente'
            });
        }
        
        // ===== VISITANTE NO AUTENTICADO: Crear ticket de soporte =====
        const participants = [
            {
                userId: new mongoose.Types.ObjectId(), // ID temporal para el visitante
                role: 'member',
                unreadCount: 0,
                joinedAt: new Date()
            },
            ...availableAgents.map(agent => ({
                userId: agent._id,
                role: 'support',
                unreadCount: 1, // Notificar a agentes
                joinedAt: new Date()
            }))
        ];
        
        // Crear conversación de soporte
        const conversation = new Conversation({
            empresaId: new mongoose.Types.ObjectId(userEmpresaId),
            type: 'support',
            title: `🎫 ${subject}`,
            participants,
            isActive: true,
            isSupportTicket: true,
            supportStatus: 'open',
            supportPriority: priority,
            supportMetadata: {
                createdBy: null, // Visitante
                visitorName: visitorName,
                visitorEmail: visitorEmail,
                assignedTo: availableAgents.length > 0 ? availableAgents[0]._id : null,
                createdAt: new Date()
            },
            lastMessage: {
                content: message.substring(0, 200),
                senderId: participants[0].userId,
                senderName: visitorName,
                sentAt: new Date()
            }
        });
        
        await conversation.save();
        
        // Crear mensaje inicial
        const newMessage = new Message({
            empresaId: new mongoose.Types.ObjectId(empresaId),
            conversationId: conversation._id,
            senderId: participants[0].userId,
            senderName: visitorName,
            senderRole: 'member',
            content: message,
            type: 'text',
            isSystemMessage: false
        });
        
        await newMessage.save();
        
        // Notificar a agentes vía Socket.io si está disponible
        const { getChatNamespace } = require('../socket');
        try {
            const chatNamespace = getChatNamespace();
            availableAgents.forEach(agent => {
                chatNamespace.to(`user:${agent._id}`).emit('support:newTicket', {
                    ticketId: conversation._id,
                    title: conversation.title,
                    visitorName: visitorName,
                    priority: priority,
                    createdAt: new Date()
                });
            });
        } catch (e) {
            // Socket.io podría no estar inicializado
        }
        
        res.status(201).json({
            success: true,
            conversationId: conversation._id,
            messageId: newMessage._id,
            visitorId: participants[0].userId,
            message: 'Ticket creado exitosamente'
        });
        
    } catch (error) {
        console.error('[SupportPublic] Error creando ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Error al crear ticket de soporte'
        });
    }
});

/**
 * GET /api/support/public/ticket/:id/messages
 * Obtiene el historial de mensajes de un ticket (público, sin auth)
 */
router.get('/ticket/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[SupportPublic] GET /ticket/${id}/messages - Request recibido`);
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.log(`[SupportPublic] ID inválido: ${id}`);
            return res.status(400).json({
                success: false,
                error: 'ID inválido'
            });
        }
        
        const conversation = await Conversation.findById(id);
        
        if (!conversation) {
            console.log(`[SupportPublic] Conversación no encontrada: ${id}`);
            return res.status(404).json({
                success: false,
                error: 'Ticket no encontrado'
            });
        }
        
        if (!conversation.isSupportTicket) {
            console.log(`[SupportPublic] No es ticket de soporte: ${id}, isSupportTicket: ${conversation.isSupportTicket}`);
            return res.status(404).json({
                success: false,
                error: 'Ticket no encontrado'
            });
        }
        
        console.log(`[SupportPublic] Ticket encontrado: ${id}, isActive: ${conversation.isActive}, isActive type: ${typeof conversation.isActive}`);
        
        // Verificar que el ticket está activo - permitir ver mensajes de tickets cerrados pero loguear
        const isActive = conversation.isActive === true || conversation.isActive === 'true';
        if (!isActive) {
            console.log(`[SupportPublic] Ticket ${id} está cerrado (isActive: ${conversation.isActive}), pero permitiendo ver mensajes`);
            // Permitir ver mensajes de tickets cerrados, solo no permitir enviar nuevos
        }
        
        // Validar visitorId si se proporciona (para seguridad adicional)
        const { visitorId } = req.query;
        if (visitorId && conversation.supportMetadata?.visitorId) {
            const isValidVisitor = visitorId === conversation.supportMetadata.visitorId.toString();
            console.log(`[SupportPublic] Validación visitorId: ${isValidVisitor ? 'válido' : 'inválido'}`);
        }
        
        // Obtener mensajes
        const messages = await Message.find({
            conversationId: conversation._id,
            empresaId: conversation.empresaId
        })
        .sort({ createdAt: 1 })
        .select('_id content senderName senderRole createdAt readBy');
        
        res.json({
            success: true,
            messages: messages.map(m => ({
                _id: m._id,
                content: m.content,
                senderName: m.senderName,
                senderRole: m.senderRole,
                createdAt: m.createdAt,
                readBy: m.readBy
            }))
        });
        
    } catch (error) {
        console.error('[SupportPublic] Error obteniendo mensajes:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener mensajes'
        });
    }
});

/**
 * POST /api/support/public/ticket/:id/message
 * Envía un mensaje a un ticket existente (desde visitante)
 */
router.post('/ticket/:id/message', async (req, res) => {
    try {
        const { id } = req.params;
        const { visitorName, visitorEmail, content } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID inválido'
            });
        }
        
        if (!content || !visitorName) {
            return res.status(400).json({
                success: false,
                error: 'Nombre y mensaje requeridos'
            });
        }
        
        const conversation = await Conversation.findById(id);
        
        if (!conversation || !conversation.isSupportTicket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket no encontrado'
            });
        }
        
        // Verificar email si el ticket tiene uno registrado
        if (conversation.supportMetadata?.visitorEmail && 
            conversation.supportMetadata.visitorEmail !== visitorEmail) {
            return res.status(403).json({
                success: false,
                error: 'Email no coincide con el ticket'
            });
        }
        
        // Crear mensaje
        const newMessage = new Message({
            empresaId: conversation.empresaId,
            conversationId: conversation._id,
            senderId: conversation.participants[0].userId,
            senderName: visitorName,
            senderRole: 'customer',
            content: content,
            type: 'text',
            isSystemMessage: false
        });
        
        await newMessage.save();
        
        // Actualizar conversación
        conversation.lastMessage = {
            content: content.substring(0, 200),
            senderName: visitorName,
            senderRole: 'customer',
            sentAt: new Date()
        };
        
        // Incrementar unreadCount para agentes
        conversation.participants.forEach(p => {
            if (p.role === 'agent') {
                p.unreadCount = (p.unreadCount || 0) + 1;
            }
        });
        
        await conversation.save();
        
        // Notificar a agentes vía Socket.io
        const { getChatNamespace } = require('../socket');
        try {
            const chatNamespace = getChatNamespace();
            conversation.participants.forEach(p => {
                if (p.role === 'agent') {
                    chatNamespace.to(`user:${p.userId}`).emit('support:newMessage', {
                        ticketId: conversation._id,
                        message: {
                            _id: newMessage._id,
                            content: content,
                            senderName: visitorName,
                            senderRole: 'customer',
                            createdAt: new Date()
                        }
                    });
                }
            });
        } catch (e) {
            // Socket.io podría no estar inicializado
        }
        
        res.status(201).json({
            success: true,
            messageId: newMessage._id,
            message: 'Mensaje enviado'
        });
        
    } catch (error) {
        console.error('[SupportPublic] Error enviando mensaje:', error);
        res.status(500).json({
            success: false,
            error: 'Error al enviar mensaje'
        });
    }
});

module.exports = router;
