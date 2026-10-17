const mongoose = require('mongoose');

const ReglaCorreoSchema = new mongoose.Schema({
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true,
        index: true
    },
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    activa: {
        type: Boolean,
        default: true
    },
    condicion: {
        campo: { type: String, enum: ['remitente', 'asunto', 'cuerpo'], required: true },
        operador: { type: String, enum: ['contiene', 'es_igual', 'empieza_con'], required: true },
        valor: { type: String, required: true, trim: true, maxlength: 200 }
    },
    acciones: {
        moverACarpeta: { type: String, default: '', trim: true, maxlength: 255 },
        marcarLeido: { type: Boolean, default: false },
        marcarImportante: { type: Boolean, default: false }
    }
}, { timestamps: true, versionKey: false });

ReglaCorreoSchema.index({ empresaId: 1, activa: 1 });

module.exports = mongoose.model('ReglaCorreo', ReglaCorreoSchema);
