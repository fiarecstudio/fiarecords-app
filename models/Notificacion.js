const mongoose = require('mongoose');

const notificacionSchema = new mongoose.Schema({
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true,
        index: true
    },
    polizaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poliza',
        required: true
    },
    tipo: {
        type: String,
        enum: ['vencimiento_poliza', 'pago_pendiente', 'pago_atrasado', 'recordatorio_pago'],
        required: true
    },
    canal: {
        type: String,
        enum: ['email', 'whatsapp', 'ambos'],
        required: true
    },
    destinatario: {
        type: String,
        required: true
    },
    estado: {
        type: String,
        enum: ['pendiente', 'enviada', 'fallida'],
        default: 'pendiente'
    },
    fechaEnvio: {
        type: Date
    },
    mensaje: {
        type: String,
        required: true
    },
    errorDetalle: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Notificacion', notificacionSchema);
