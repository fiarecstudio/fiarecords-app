const mongoose = require('mongoose');

const plantillaCorreoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    asunto: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    cuerpo: {
        type: String,
        required: true,
        trim: true,
        maxlength: 20000
    },
    tipo: {
        type: String,
        enum: ['pago', 'recordatorio', 'general'],
        default: 'general'
    },
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true,
        index: true
    },
    fechaCreacion: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

plantillaCorreoSchema.index({ empresaId: 1, tipo: 1, fechaCreacion: -1 });

module.exports = mongoose.model('PlantillaCorreo', plantillaCorreoSchema);
