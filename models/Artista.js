const mongoose = require('mongoose');

const ArtistaSchema = new mongoose.Schema({
    nombre: { type: String, required: true }, // Nombre Real
    nombreArtistico: { type: String },
    telefono: { type: String },
    correo: { type: String },
    
    // --- CAMPO NUEVO IMPORTANTE ---
    // Esto conecta al Artista con su cuenta de Login (Usuario)
    usuarioId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Usuario' 
    },

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Artista', ArtistaSchema);