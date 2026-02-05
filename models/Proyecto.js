// ==========================================
// ARCHIVO: models/Proyecto.js
// ==========================================
const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    servicio: String,
    nombre: String,
    unidades: Number,
    precioUnitario: Number
});

const PagoSchema = new mongoose.Schema({
    monto: Number,
    metodo: String,
    fecha: { type: Date, default: Date.now },
    artista: String
});

const ProyectoSchema = new mongoose.Schema({
    artista: { type: mongoose.Schema.Types.ObjectId, ref: 'Artista' },
    nombreProyecto: String,
    items: [ItemSchema],
    total: Number,
    descuento: Number,
    montoPagado: { type: Number, default: 0 },
    estatus: String, // 'Cotizacion', 'Pendiente de Pago', 'Pagado', 'Cancelado'
    metodoPago: String,
    fecha: Date,
    prioridad: String,
    proceso: String, // 'Agendado', 'Grabacion', 'Edicion', 'Mezcla', 'Mastering', 'Completo'
    esAlbum: Boolean,
    enlaceEntrega: String,
    pagos: [PagoSchema],
    createdAt: { type: Date, default: Date.now },
    detallesContrato: { type: Object, default: {} },
    detallesDistribucion: { type: Object, default: {} }
});

// ESTA LÍNEA ES LA QUE ARREGLA EL ERROR "OVERWRITE MODEL":
// Verifica si el modelo ya existe antes de crearlo.
module.exports = mongoose.models.Proyecto || mongoose.model('Proyecto', ProyectoSchema);