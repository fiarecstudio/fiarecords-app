const mongoose = require('mongoose');

const pagoSchema = new mongoose.Schema({
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: [true, 'El ID de empresa es obligatorio'],
        index: true
    },
    polizaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poliza',
        required: [true, 'El ID de póliza es obligatorio'],
        index: true
    },
    monto: {
        type: Number,
        required: [true, 'El monto es obligatorio'],
        min: [0, 'El monto debe ser mayor o igual a 0']
    },
    fechaPago: {
        type: Date,
        default: Date.now
    },
    metodoPago: {
        type: String,
        trim: true,
        default: 'efectivo'
    },
    nota: {
        type: String,
        trim: true
    },
    estado: {
        type: String,
        enum: ['pagado', 'pendiente', 'atrasado'],
        default: 'pendiente'
    },
    reciboUrl: {
        type: String,
        trim: true
    },
    // Soft delete para pagos independientes
    deletedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Índices compuestos para búsquedas multi-tenant
pagoSchema.index({ empresaId: 1, polizaId: 1 });
pagoSchema.index({ empresaId: 1, fechaPago: -1 });
pagoSchema.index({ empresaId: 1, estado: 1 });
pagoSchema.index({ empresaId: 1, deletedAt: 1 });

module.exports = mongoose.model('Pago', pagoSchema);
