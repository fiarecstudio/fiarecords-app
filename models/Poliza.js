const mongoose = require('mongoose');

const polizaSchema = new mongoose.Schema({
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
    clienteEmail: {
        type: String,
        trim: true
    },
    clienteTelefono: {
        type: String,
        trim: true
    },
    tipoPago: {
        type: String,
        enum: ['anual', 'trimestral', 'mensual'],
        default: 'anual'
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
    },
    // FASE 1: SOFT DELETE Y GESTIÓN DE PAGOS
    deletedAt: {
        type: Date,
        default: null
    },
    pagos: [{
        fechaPago: { type: Date },
        monto: { type: Number, required: true },
        estado: {
            type: String,
            enum: ['pagado', 'pendiente', 'atrasado'],
            default: 'pendiente'
        },
        metodoPago: { type: String },
        reciboUrl: { type: String }
    }],
    proximoPago: {
        type: Date
    },
    // FASE 4: CAMPOS FINANCIEROS
    montoAbono: {
        type: Number,
        default: 0,
        min: [0, 'El monto de abono debe ser mayor o igual a 0']
    },
    primerPago: {
        type: Number,
        default: 0,
        min: [0, 'El primer pago debe ser mayor o igual a 0']
    },
    saldoRestante: {
        type: Number,
        default: 0,
        min: [0, 'El saldo restante debe ser mayor o igual a 0']
    },
    diasAnticipacionAviso: {
        type: Number,
        default: 3,
        min: [0, 'Los días de anticipación deben ser mayor o igual a 0']
    },
    estadoPago: {
        type: String,
        enum: ['pendiente', 'al_corriente', 'pagado_completo'],
        default: 'pendiente'
    }
}, {
    timestamps: true
});

// Índice compuesto para búsquedas multi-tenant
polizaSchema.index({ empresaId: 1, numeroPoliza: 1 }, { partialFilterExpression: { deletedAt: null } });
polizaSchema.index({ empresaId: 1, estado: 1 });
polizaSchema.index({ empresaId: 1, fechas: 1 });
polizaSchema.index({ empresaId: 1, deletedAt: 1 });

module.exports = mongoose.model('Poliza', polizaSchema);
