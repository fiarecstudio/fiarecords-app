const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UsuarioSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true 
    },
    
    password: { 
        type: String, 
        required: true 
    },
    
    // --- AQUÍ ESTÁ LA SOLUCIÓN DEL ERROR ---
    role: { 
        type: String, 
        // Lista completa de roles permitidos (en minúsculas)
        enum: ['ingeniero', 'admin', 'cliente', 'diseñador'], 
        default: 'cliente',
        // Esto convierte automáticamente "Diseñador" -> "diseñador" antes de guardar
        lowercase: true, 
        trim: true
    },

    // Configuración para guardar tus checkboxes
    permisos: { 
        type: mongoose.Schema.Types.Mixed, // Permite cualquier estructura de objeto
        default: {} 
    },

    isDeleted: { 
        type: Boolean, 
        default: false 
    },
}, { 
    timestamps: true, // Crea automáticamente createdAt y updatedAt
    minimize: false   // Importante: permite guardar objetos vacíos {} en permisos
});

// --- ENCRIPTADO DE CONTRASEÑA ---
// Se ejecuta automáticamente antes de guardar un usuario nuevo o modificado
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

// --- MÉTODO PARA EL LOGIN (Te servirá pronto) ---
// Compara la contraseña que escribe el usuario con la encriptada en la BD
UsuarioSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Usuario', UsuarioSchema);