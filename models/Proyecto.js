const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    servicio: { type: mongoose.Schema.Types.ObjectId, ref: 'Servicio' },
    nombre: String,
    unidades: { type: Number, default: 1 },
    precioUnitario: Number
});

const PagoSchema = new mongoose.Schema({
    monto: Number,
    metodo: String, // Transferencia, Efectivo, Tarjeta
    fecha: { type: Date, default: Date.now },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' } // Quién registró el pago
});

const ProyectoSchema = new mongoose.Schema({
    artista: { type: mongoose.Schema.Types.ObjectId, ref: 'Artista' },
    nombreProyecto: { type: String }, // Opcional, ej: nombre del EP o Single
    esAlbum: { type: Boolean, default: false },
    
    fecha: { type: Date, required: true }, // Fecha agendada
    
    items: [ItemSchema],
    
    total: { type: Number, required: true },
    descuento: { type: Number, default: 0 },
    montoPagado: { type: Number, default: 0 },
    
    estatus: { 
        type: String, 
        enum: ['Cotizacion', 'Pendiente de Pago', 'Pagado', 'Cancelado'],
        default: 'Cotizacion'
    },
    
    proceso: {
        type: String,
        enum: ['Solicitud', 'Agendado', 'Grabacion', 'Edicion', 'Mezcla', 'Mastering', 'Completo'],
        default: 'Solicitud'
    },

    metodoPago: { type: String, default: 'Pendiente' },
    
    // --- AQUÍ ESTABA EL FALTANTE ---
    enlaceEntrega: { type: String, default: '' }, // <--- ESTO ES LO QUE HACÍA FALTA
    
    detallesContrato: { type: Object },
    detallesDistribucion: { type: Object },

    pagos: [PagoSchema], // Historial de pagos parciales

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Proyecto', ProyectoSchema);