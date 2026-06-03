const mongoose = require('mongoose');

const polizaSchema = new mongoose.Schema({
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: [true, 'El ID de empresa es obligatorio'],
        index: true
    },
    numeroPoliza: {
        type: String,
        required: [true, 'El número de póliza es obligatorio'],
        trim: true,
        index: true
    },
    cliente: {
        type: String,
        required: [true, 'El cliente es obligatorio'],
        trim: true
    },
    tipoSeguro: {
        type: String,
        required: [true, 'El tipo de seguro es obligatorio'],
        enum: {
            values: ['Vehicular', 'Vida', 'Gastos Médicos', 'Daños'],
            message: '{VALUE} no es un tipo de seguro válido'
        }
    },
    aseguradora: {
        type: String,
        required: [true, 'La aseguradora es obligatoria'],
        trim: true
    },
    inciso: {
        type: String,
        default: '1',
        trim: true
    },
    paquete: {
        type: String,
        trim: true
    },
    fechas: {
        inicio: {
            type: Date,
            required: [true, 'La fecha de inicio es obligatoria']
        },
        vencimiento: {
            type: Date,
            required: [true, 'La fecha de vencimiento es obligatoria']
        }
    },
    primaTotal: {
        type: Number,
        required: [true, 'La prima total es obligatoria'],
        min: [0, 'La prima total debe ser mayor o igual a 0']
    },
    estado: {
        type: String,
        enum: {
            values: ['Activa', 'Por Vencer', 'Vencida', 'Cancelada', 'Renovada'],
            message: '{VALUE} no es un estado válido'
        },
        default: 'Activa'
    },
    documentoDriveId: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Índice compuesto para búsquedas multi-tenant
polizaSchema.index({ empresaId: 1, numeroPoliza: 1 });
polizaSchema.index({ empresaId: 1, estado: 1 });
polizaSchema.index({ empresaId: 1, fechas: 1 });

module.exports = mongoose.model('Poliza', polizaSchema);
