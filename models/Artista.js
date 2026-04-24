const mongoose = require('mongoose');

const ArtistaSchema = new mongoose.Schema({
    nombre: { type: String, required: true }, // Nombre Real
    nombreArtistico: { type: String },
    telefono: { type: String },
    correo: { type: String },
    
    // --- CAMPO NUEVO IMPORTANTE ---
    // Esto conecta al Artista con su cuenta de Login (Usuario)
    usuarioId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Usuario' 
    },

    // --- FASE 1: MULTI-TENANT - VINCULACIÓN CON EMPRESA ---
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true
    },
    // ----------------------------------------------------

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// ==================================================================
// ÍNDICES COMPUESTOS PARA OPTIMIZACIÓN MULTI-TENANT
// ==================================================================
ArtistaSchema.index({ empresaId: 1, isDeleted: 1 });
ArtistaSchema.index({ empresaId: 1, nombre: 1 });
// Índice para búsquedas por usuario vinculado
ArtistaSchema.index({ empresaId: 1, usuarioId: 1 });

module.exports = mongoose.model('Artista', ArtistaSchema);