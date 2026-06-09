const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: [true, 'El ID de empresa es obligatorio'],
        index: true
    },
    asesorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: [true, 'El ID de asesor es obligatorio'],
        index: true
    },
    nombre: {
        type: String,
        required: [true, 'El nombre del cliente es obligatorio'],
        trim: true
    },
    rfc: {
        type: String,
        trim: true,
        uppercase: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    telefono: {
        type: String,
        trim: true
    },
    direccion: {
        type: String,
        trim: true
    },
    // Soft delete para mantener integridad de datos históricos
    deletedAt: {
        type: Date,
        default: null,
        index: true
    }
}, {
    timestamps: true
});

// Índices para búsquedas multi-tenant y RBAC
clienteSchema.index({ empresaId: 1, asesorId: 1, deletedAt: 1 });
clienteSchema.index({ empresaId: 1, nombre: 1 }, { partialFilterExpression: { deletedAt: null } });
clienteSchema.index({ empresaId: 1, rfc: 1 }, { partialFilterExpression: { deletedAt: null } });

module.exports = mongoose.model('Cliente', clienteSchema);
