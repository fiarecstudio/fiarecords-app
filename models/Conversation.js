const mongoose = require('mongoose');

/**
 * Modelo Conversation - Conversaciones de Chat
 * FASE 1: Multi-Tenant Chat System
 * 
 * Aislamiento estricto por empresaId - REGLA DE ORO:
 * TODAS las consultas DEBEN incluir empresaId
 */

const ConversationSchema = new mongoose.Schema({
    // --- ISOLAMIENTO MULTI-TENANT (CRÍTICO) ---
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true,
        index: true
    },
    
    // --- TIPO DE CHAT ---
    type: {
        type: String,
        enum: ['direct', 'group', 'support'],
        required: true,
        index: true
    },
    
    // --- PARTICIPANTES ---
    participants: [{
        userId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Usuario', 
            required: true 
        },
        role: { 
            type: String, 
            enum: ['member', 'admin', 'support'], 
            default: 'member' 
        },
        joinedAt: { 
            type: Date, 
            default: Date.now 
        },
        lastReadAt: { 
            type: Date, 
            default: Date.now 
        },
        unreadCount: { 
            type: Number, 
            default: 0 
        }
    }],
    
    // --- METADATOS ---
    title: { 
        type: String, 
        trim: true 
    },
    avatar: { 
        type: String 
    },
    
    // --- ESTADO ---
    isActive: { 
        type: Boolean, 
        default: true 
    },
    isSupportTicket: { 
        type: Boolean, 
        default: false 
    },
    supportStatus: { 
        type: String, 
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open'
    },
    
    // --- ÚLTIMO MENSAJE (Denormalizado) ---
    lastMessage: {
        messageId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Message' 
        },
        content: { 
            type: String 
        },
        senderId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Usuario' 
        },
        senderName: { 
            type: String 
        },
        type: { 
            type: String, 
            enum: ['text', 'image', 'file', 'audio'] 
        },
        sentAt: { 
            type: Date 
        }
    },
    
    // --- CONTADORES ---
    messageCount: { 
        type: Number, 
        default: 0 
    }
}, { 
    timestamps: true 
});

// ==================================================================
// ÍNDICES CRÍTICOS PARA PERFORMANCE MULTI-TENANT
// ==================================================================

// Listar conversaciones de una empresa ordenadas por actividad
ConversationSchema.index({ empresaId: 1, type: 1, updatedAt: -1 });

// Conversaciones de un usuario específico
ConversationSchema.index({ empresaId: 1, 'participants.userId': 1, updatedAt: -1 });

// Tickets de soporte por empresa y estado
ConversationSchema.index({ empresaId: 1, isSupportTicket: 1, supportStatus: 1 });

// Buscar conversación directa entre dos usuarios
ConversationSchema.index({ 
    empresaId: 1, 
    type: 1, 
    'participants.userId': 1 
});

module.exports = mongoose.model('Conversation', ConversationSchema);
