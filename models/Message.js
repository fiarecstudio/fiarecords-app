const mongoose = require('mongoose');

/**
 * Modelo Message - Mensajes de Chat
 * FASE 1: Multi-Tenant Chat System
 * 
 * Aislamiento estricto por empresaId - REGLA DE ORO:
 * TODAS las consultas DEBEN incluir empresaId
 */

const MessageSchema = new mongoose.Schema({
    // --- ISOLAMIENTO MULTI-TENANT (CRÍTICO) ---
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true,
        index: true
    },
    
    // --- REFERENCIAS ---
    conversationId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Conversation', 
        required: true,
        index: true 
    },
    senderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Usuario', 
        required: true 
    },
    senderName: { 
        type: String, 
        required: true 
    },
    senderRole: { 
        type: String 
    },
    
    // --- CONTENIDO ---
    type: { 
        type: String, 
        enum: ['text', 'image', 'file', 'audio', 'system'], 
        default: 'text' 
    },
    content: { 
        type: String, 
        required: true 
    },
    
    // --- METADATOS DE ARCHIVO ---
    fileData: {
        originalName: { type: String },
        mimeType: { type: String },
        size: { type: Number },
        driveId: { type: String },
        url: { type: String }
    },
    
    // --- ESTADO ---
    isDeleted: { 
        type: Boolean, 
        default: false 
    },
    deletedAt: { 
        type: Date 
    },
    
    // --- LECTURAS (Confirmación de lectura) ---
    readBy: [{
        userId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Usuario' 
        },
        readAt: { 
            type: Date, 
            default: Date.now 
        }
    }],
    
    // --- REPLY ---
    replyTo: {
        messageId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Message' 
        },
        content: { 
            type: String 
        },
        senderName: { 
            type: String 
        }
    },
    
    // --- REACCIONES ---
    reactions: [{
        userId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Usuario' 
        },
        emoji: { 
            type: String 
        },
        createdAt: { 
            type: Date, 
            default: Date.now 
        }
    }]
}, { 
    timestamps: true 
});

// ==================================================================
// ÍNDICES CRÍTICOS PARA PERFORMANCE MULTI-TENANT
// ==================================================================

// Historial de mensajes paginado
MessageSchema.index({ empresaId: 1, conversationId: 1, createdAt: -1 });

// Mensajes no leídos por usuario
MessageSchema.index({ 
    empresaId: 1, 
    conversationId: 1, 
    'readBy.userId': 1 
});

// Mensajes enviados por un usuario
MessageSchema.index({ empresaId: 1, senderId: 1, createdAt: -1 });

// Buscar mensajes por contenido (text search)
MessageSchema.index({ 
    empresaId: 1, 
    conversationId: 1, 
    content: 'text' 
});

module.exports = mongoose.model('Message', MessageSchema);
