const mongoose = require('mongoose');

const CorreoProgramadoSchema = new mongoose.Schema({
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true,
        index: true
    },
    destinatario: {
        type: [String],
        required: true,
        validate: value => Array.isArray(value) && value.length > 0
    },
    cc: {
        type: [String],
        default: []
    },
    asunto: {
        type: String,
        required: true,
        trim: true,
        maxlength: 998
    },
    mensaje: {
        type: String,
        required: true
    },
    attachments: {
        type: [{
            name: { type: String, required: true, maxlength: 255 },
            content: { type: String, required: true }
        }],
        default: []
    },
    importance: {
        type: String,
        enum: ['normal', 'high', 'low'],
        default: 'normal'
    },
    requestReadReceipt: {
        type: Boolean,
        default: false
    },
    followUp: {
        type: Boolean,
        default: false
    },
    fechaProgramada: {
        type: Date,
        required: true,
        index: true
    },
    estatus: {
        type: String,
        enum: ['pendiente', 'enviado', 'cancelado'],
        default: 'pendiente',
        index: true
    },
    processingUntil: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { versionKey: false });

CorreoProgramadoSchema.index({ estatus: 1, fechaProgramada: 1, processingUntil: 1 });

module.exports = mongoose.model('CorreoProgramado', CorreoProgramadoSchema);
