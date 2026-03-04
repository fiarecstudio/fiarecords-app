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

module.exports = mongoose.model('Deuda', DeudaSchema);