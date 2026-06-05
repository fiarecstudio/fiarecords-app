const mongoose = require('mongoose');

const EmpresaSchema = new mongoose.Schema({
    nombre: { 
        type: String, 
        required: true,
        trim: true
    },
    rfc: { 
        type: String, 
        trim: true,
        default: '',
        sparse: true,
        unique: true
    },
    direccion: { 
        type: String, 
        trim: true,
        default: ''
    },
    telefono: { 
        type: String, 
        trim: true,
        default: ''
    },
    email: { 
        type: String, 
        trim: true,
        lowercase: true,
        default: '',
        sparse: true,
        unique: true
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    // Campo para identificar la empresa principal durante migración
    isDefault: {
        type: Boolean,
        default: false
    },
    // Campo para activar módulo de Seguros por empresa
    moduloSeguros: {
        type: Boolean,
        default: false
    },
    // FASE 1: TIPO DE DASHBOARD PERSONALIZADO
    tipoDashboard: {
        type: String,
        enum: ['estandar', 'seguros'],
        default: 'estandar'
    },
    // FASE 1: CONFIGURACIÓN DE NOTIFICACIONES
    notificaciones: {
        email: {
            enabled: { type: Boolean, default: true },
            smtpHost: { type: String, default: '' },
            smtpPort: { type: Number, default: 587 },
            smtpUser: { type: String, default: '' },
            smtpPass: { type: String, default: '' }
        },
        whatsapp: {
            enabled: { type: Boolean, default: false },
            apiKey: { type: String, default: '' },
            phoneNumber: { type: String, default: '' }
        }
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Empresa', EmpresaSchema);
