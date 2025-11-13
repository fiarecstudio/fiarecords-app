// models/Artista.js
const mongoose = require('mongoose');

const ArtistaSchema = new mongoose.Schema({
    nombre: { type: String, required: true }, // Ahora representa el Nombre Real
    nombreArtistico: { type: String },
    telefono: { type: String },
    correo: { type: String },
    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Artista', ArtistaSchema);
