const mongoose = require('mongoose');

const ListaNegraCorreoSchema = new mongoose.Schema({
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true,
        index: true
    },
    emailODominio: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 255
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { versionKey: false });

ListaNegraCorreoSchema.index({ empresaId: 1, emailODominio: 1 }, { unique: true });

module.exports = mongoose.model('ListaNegraCorreo', ListaNegraCorreoSchema);
