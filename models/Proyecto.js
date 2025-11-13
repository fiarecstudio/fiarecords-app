// models/Proyecto.js
const mongoose = require('mongoose');

const PagoSchema = new mongoose.Schema({
    monto: { type: Number, required: true },
    metodo: { type: String, required: true },
    fecha: { type: Date, default: Date.now }
});

const ItemProyectoSchema = new mongoose.Schema({
    servicio: { type: mongoose.Schema.Types.ObjectId, ref: 'Servicio' },
    nombre: String,
    unidades: Number,
    precioUnitario: Number
});

const TrackDistribucionSchema = new mongoose.Schema({
    titulo: String,
    isrc: String
});

const ProyectoSchema = new mongoose.Schema({
    nombreProyecto: { type: String, default: '' }, // <-- ¡NUEVO CAMPO AÑADIDO!
    artista: { type: mongoose.Schema.Types.ObjectId, ref: 'Artista', default: null },
    items: [ItemProyectoSchema],
    total: { type: Number, required: true },
    fecha: { type: Date, default: Date.now },
    prioridad: { type: String, default: 'Normal' },
    proceso: { type: String, default: 'Cotizacion' },
    isDeleted: { type: Boolean, default: false },
    estatus: { type: String, default: 'Pendiente de Pago', enum: ['Cotizacion', 'Pendiente de Pago', 'Pagado Parcialmente', 'Pagado'] },
    montoPagado: { type: Number, default: 0 },
    pagos: [PagoSchema],
    esAlbum: { type: Boolean, default: false },
    enlaceEntrega: { type: String, default: '' },
    detallesContrato: {
        duracion: String,
        pagoInicial: Number,
        pagoFinal: Number,
        nombreAlbum: String,
        cantidadCanciones: Number
    },
    detallesDistribucion: {
        tituloLanzamiento: String,
        fechaLanzamiento: Date,
        upc: String,
        tracks: [TrackDistribucionSchema]
    }
}, { timestamps: true });

module.exports = mongoose.model('Proyecto', ProyectoSchema);