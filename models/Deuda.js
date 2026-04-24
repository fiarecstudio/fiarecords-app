const mongoose = require('mongoose');

// Esquema para el historial de abonos/pagos de cada deuda
const PagoDeudaSchema = new mongoose.Schema({
    monto: { 
        type: Number, 
        required: true 
    },
    fecha: { 
        type: Date, 
        default: Date.now 
    },
    nota: { 
        type: String 
    }
});

// Esquema principal de la Deuda
const DeudaSchema = new mongoose.Schema({
    // --- FASE 1: MULTI-TENANT - VINCULACIÓN CON EMPRESA ---
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true
    },
    // ----------------------------------------------------
    
    concepto: { 
        type: String, 
        required: true 
    }, // Ej: "Préstamo Banco", "Micrófono Nuevo", "Renta Local"
    
    total: { 
        type: Number, 
        required: true 
    },
    
    montoPagado: { 
        type: Number, 
        default: 0 
    },
    
    estatus: { 
        type: String, 
        enum: ['Pendiente', 'Liquidada'], 
        default: 'Pendiente' 
    },
    
    pagos: [PagoDeudaSchema], // Aquí se guardan los abonos
    
    isDeleted: { 
        type: Boolean, 
        default: false 
    }
}, { 
    timestamps: true // Guarda fecha de creación y actualización automáticamente
});

// ==================================================================
// ÍNDICES COMPUESTOS PARA OPTIMIZACIÓN MULTI-TENANT
// ==================================================================
DeudaSchema.index({ empresaId: 1, estatus: 1 });
DeudaSchema.index({ empresaId: 1, isDeleted: 1 });
DeudaSchema.index({ empresaId: 1, createdAt: -1 });

module.exports = mongoose.model('Deuda', DeudaSchema);