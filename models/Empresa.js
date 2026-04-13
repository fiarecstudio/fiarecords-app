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
        default: ''
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
        default: ''
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    // Campo para identificar la empresa principal durante migración
    isDefault: {
        type: Boolean,
        default: false
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Empresa', EmpresaSchema);
