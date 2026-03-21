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
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' } 
});

const ProyectoSchema = new mongoose.Schema({
    artista: { type: mongoose.Schema.Types.ObjectId, ref: 'Artista' },
    nombreProyecto: { type: String }, 
    esAlbum: { type: Boolean, default: false },
    
    fecha: { type: Date, required: true },
    
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
    
    // Enlace a la carpeta general de Drive
    enlaceEntrega: { type: String, default: '' }, 

    // --- NUEVO: GUARDA LOS ARCHIVOS MULTIMEDIA (AUDIO, VIDEO, IMAGEN) ---
    archivos: [{
        nombre: String,
        driveId: String,
        urlDirecta: String,
        tipo: String // 'audio', 'video', 'imagen', 'otro'
    }],
    
    detallesContrato: { type: Object },
    detallesDistribucion: { type: Object },
    
    // Firma del cliente en base64
    firmaCliente: { type: String },

    pagos: [PagoSchema], 

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Proyecto', ProyectoSchema);