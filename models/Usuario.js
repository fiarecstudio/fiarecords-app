const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UsuarioSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        trim: true 
    },
    
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: null
    },

    password: { 
        type: String, 
        required: true 
    },
    
    role: { 
        type: String, 
        enum: ['ingeniero', 'admin', 'cliente', 'diseñador'], 
        default: 'cliente',
        lowercase: true, 
        trim: true
    },

    // Guardamos los permisos como un Array de Textos (ej: ['dashboard', 'agenda'])
    permisos: { 
        type: [String], 
        default: [] 
    },

    // --- NUEVO CAMPO: VINCULACIÓN MANUAL CON ARTISTA ---
    artistaId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Artista', 
        default: null 
    },
    // --------------------------------------------------

    // --- FASE 1: MULTI-TENANT - VINCULACIÓN CON EMPRESA ---
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true
    },
    // ----------------------------------------------------

    // --- FASE 1: MULTI-TENANT - ROL SUPER ADMIN ---
    isSuperAdmin: {
        type: Boolean,
        default: false
    },
    // ---------------------------------------------

    isDeleted: { 
        type: Boolean, 
        default: false 
    },

    // --- NUEVOS CAMPOS PARA RECUPERAR CONTRASEÑA ---
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },

}, { 
    timestamps: true 
});

// --- ENCRIPTADO AUTOMÁTICO ---
// Se ejecuta antes de guardar (Crear o Editar)
UsuarioSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        return next(error);
    }
});

// --- MÉTODO PARA VALIDAR CONTRASEÑA ---
UsuarioSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// --- ÍNDICES COMPUESTOS MULTI-TENANT ---
// Username único por empresa
UsuarioSchema.index({ empresaId: 1, username: 1 }, { unique: true });
// Email indexado para búsqueda rápida (unicidad se valida en el controlador)
UsuarioSchema.index({ empresaId: 1, email: 1 });

module.exports = mongoose.model('Usuario', UsuarioSchema);