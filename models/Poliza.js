const mongoose = require('mongoose');

// ==========================================
// SUBDOCUMENTO: RECIBO (FASE 1 - NUEVO)
// ==========================================
const reciboSchema = new mongoose.Schema({
    numeroRecibo: {
        type: String
    },
    periodoCobertura: {
        type: String,
        required: true,
        trim: true
    },
    montoRecibo: {
        type: Number,
        required: true,
        min: [0, 'El monto del recibo debe ser mayor o igual a 0']
    },
    montoPagoNeto: {
        type: Number,
        min: [0, 'El pago neto del recibo debe ser mayor o igual a 0']
    },
    fechaEmision: {
        type: Date,
        default: Date.now
    },
    fechaVencimientoRecibo: {
        type: Date,
        required: true
    },
    fechaPago: {
        type: Date,
        default: null
    },
    estadoRecibo: {
        type: String,
        enum: ['pendiente', 'pagado', 'atrasado', 'cancelado'],
        default: 'pendiente'
    },
    metodoPago: {
        type: String,
        trim: true
    },
    reciboUrl: {
        type: String,
        trim: true
    },
    enlacePago: {
        type: String,
        trim: true,
        default: null
    },
    historialNotificaciones: [{
        fecha: {
            type: Date,
            default: Date.now
        },
        tipo: {
            type: String,
            enum: ['vencimiento_recibo', 'pago_pendiente', 'recordatorio_manual'],
            required: true
        },
        canal: {
            type: String,
            enum: ['email', 'whatsapp', 'sms'],
            required: true
        },
        mensaje: {
            type: String,
            required: true
        },
        estado: {
            type: String,
            enum: ['enviada', 'fallida'],
            default: 'enviada'
        },
        diasRestantes: {
            type: Number,
            default: 0
        },
        enviadoManualmente: {
            type: Boolean,
            default: false
        }
    }]
}, { _id: true });

// ==========================================
// SUBDOCUMENTO: RENOVACION (FASE 1 - NUEVO)
// ==========================================
const renovacionSchema = new mongoose.Schema({
    anioRenovacion: {
        type: Number,
        required: true
    },
    fechaRenovacion: {
        type: Date,
        default: Date.now
    },
    primaAnterior: {
        type: Number,
        required: true
    },
    primaNueva: {
        type: Number,
        required: true
    },
    documentoDriveId: {
        type: String,
        trim: true
    },
    motivoRenovacion: {
        type: String,
        enum: ['renovacion_normal', 'cambio_cobertura', 'cambio_aseguradora', 'cambio_prima'],
        default: 'renovacion_normal'
    },
    notas: {
        type: String,
        trim: true
    },
    estadoRenovacion: {
        type: String,
        enum: ['pendiente', 'en_proceso', 'completada', 'cancelada'],
        default: 'pendiente'
    }
}, { _id: true });

// ==========================================
// ESQUEMA PRINCIPAL: POLIZA
// ==========================================
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
    asesorNombre: {
        type: String,
        trim: true,
        default: 'General'
    },
    clienteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cliente',
        index: true
    },
    polizaAnteriorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poliza',
        default: null
    },
    numeroPoliza: {
        type: String,
        required: [true, 'El número de póliza es obligatorio'],
        trim: true,
        index: true
    },
    // LEGACY/TRANSICIONAL: Mantener este campo temporalmente para compatibilidad con pólizas existentes
    // En el futuro, las pólizas deberían usar clienteId para referenciar al modelo Cliente
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
        enum: ['anual', 'trimestral', 'semestral', 'mensual'],
        default: 'anual'
    },
    duracionMeses: {
        type: Number,
        default: 12,
        min: [1, 'La duración debe ser de al menos un mes'],
        validate: {
            validator: Number.isInteger,
            message: 'La duración debe expresarse en meses enteros'
        }
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
    primaNeta: {
        type: Number,
        default: 0
    },
    gastosExpedicion: {
        type: Number,
        default: 0,
        min: [0, 'Los gastos de expedición deben ser mayores o iguales a 0']
    },
    emisionEnPrimerPago: {
        type: Boolean,
        default: false
    },
    estado: {
        type: String,
        enum: {
            values: ['Activa', 'Por Vencer', 'Vencida', 'Cancelada', 'Renovada', 'PendienteRenovacion'],
            message: '{VALUE} no es un estado válido'
        },
        default: 'Activa'
    },
    // FASE 1: PERIODO DE GRACIA Y RENOVACION
    diasGracia: {
        type: Number,
        default: 30,
        min: [0, 'Los días de gracia deben ser mayores o iguales a 0'],
        comment: 'Días permitidos después del vencimiento antes de cancelar la póliza'
    },
    fechaLimiteRenovacion: {
        type: Date,
        default: null,
        comment: 'Fecha límite para renovar antes de la cancelación (vencimiento + diasGracia)'
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
        reciboId: { type: mongoose.Schema.Types.ObjectId, default: null },
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
    },
    // CAMPOS DE CONFIGURACIÓN DINÁMICA DE RECORDATORIOS
    recordatoriosPago: {
        type: [Number],
        default: [7, 3, 1, 0], // Días previos al vencimiento para enviar recordatorios
        validate: {
            validator: function(arr) {
                return arr.every(num => num >= 0);
            },
            message: 'Los días de recordatorio deben ser mayores o iguales a 0'
        }
    },
    ultimaNotificacionPago: {
        type: Date,
        default: null
    },
    historialNotificaciones: [{
        fecha: {
            type: Date,
            default: Date.now
        },
        tipo: {
            type: String,
            enum: ['vencimiento_poliza', 'pago_pendiente', 'recordatorio_manual'],
            required: true
        },
        canal: {
            type: String,
            enum: ['email', 'whatsapp', 'sms'],
            required: true
        },
        mensaje: {
            type: String,
            required: true
        },
        estado: {
            type: String,
            enum: ['enviada', 'fallida'],
            default: 'enviada'
        },
        diasRestantes: {
            type: Number,
            default: 0
        },
        enviadoManualmente: {
            type: Boolean,
            default: false
        }
    }],
    // Cobranza Diaria: Marcar como resuelta
    cobranzaResuelta: {
        type: Boolean,
        default: false
    },
    fechaResolucionCobranza: {
        type: Date,
        default: null
    },
    // Enlace de pago personalizado
    enlacePago: {
        type: String,
        trim: true,
        default: null
    },
    // FASE 1: SUBDOCUMENTOS (NUEVOS - COMPATIBLES CON PAGOS[] EXISTENTE)
    recibos: {
        type: [reciboSchema],
        default: [],
        comment: 'Array de recibos estructurados (FASE 1 - nuevo, coexiste con pagos[])'
    },
    renovaciones: {
        type: [renovacionSchema],
        default: [],
        comment: 'Array de historial de renovaciones anuales (FASE 1 - nuevo)'
    }
}, {
    timestamps: true
});

// Índice compuesto para búsquedas multi-tenant
polizaSchema.index({ empresaId: 1, numeroPoliza: 1 }, { partialFilterExpression: { deletedAt: null } });
polizaSchema.index({ empresaId: 1, estado: 1 });
polizaSchema.index({ empresaId: 1, fechas: 1 });
polizaSchema.index({ empresaId: 1, deletedAt: 1 });
// Índices optimizados para cobranza diaria
polizaSchema.index({ empresaId: 1, 'fechas.vencimiento': 1 }, { partialFilterExpression: { deletedAt: null } });
polizaSchema.index({ empresaId: 1, proximoPago: 1 }, { partialFilterExpression: { deletedAt: null } });
// FASE 1: Índices para nuevos campos
polizaSchema.index({ empresaId: 1, fechaLimiteRenovacion: 1 }, { partialFilterExpression: { deletedAt: null } });
polizaSchema.index({ empresaId: 1, estado: 1, 'recibos.estadoRecibo': 1 }, { partialFilterExpression: { deletedAt: null } });

// Middleware pre-save para limitar el tamaño de historialNotificaciones
polizaSchema.pre('save', function(next) {
    const mesesPorTipo = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };
    const intervaloMeses = mesesPorTipo[String(this.tipoPago || 'anual').toLowerCase()] || 12;
    const duracionMeses = Number(this.duracionMeses) || 12;
    const cantidadEsperada = Math.ceil(duracionMeses / intervaloMeses);
    if (this.recibos && this.recibos.length > cantidadEsperada) {
        const recibosPagados = this.recibos.filter(recibo =>
            String(recibo.estadoRecibo || recibo.estado || '').toLowerCase() === 'pagado'
        );
        const recibosRestantes = this.recibos.filter(recibo =>
            String(recibo.estadoRecibo || recibo.estado || '').toLowerCase() !== 'pagado'
        );
        const cupoRestante = Math.max(0, cantidadEsperada - recibosPagados.length);
        this.recibos = [
            ...recibosPagados.map(recibo => recibo.toObject()),
            ...recibosRestantes.slice(0, cupoRestante).map(recibo => recibo.toObject())
        ];
    }

    if (this.historialNotificaciones && this.historialNotificaciones.length > 50) {
        this.historialNotificaciones = this.historialNotificaciones.slice(-50);
    }
    next();
});

module.exports = mongoose.model('Poliza', polizaSchema);
