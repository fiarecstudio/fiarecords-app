const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UsuarioSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true 
    },
    
    email: {
        type: String,
        unique: true,
        sparse: true, // Permite nulos, pero si hay texto debe ser único
        trim: true,
        lowercase: true
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

    isDeleted: { 
        type: Boolean, 
        default: false 
    },
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

module.exports = mongoose.model('Usuario', UsuarioSchema);