const mongoose = require('mongoose');

const ServicioSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  precio: { type: Number, required: true },
  // NUEVO: Controla si el cliente puede ver este servicio
  visible: { type: Boolean, default: true }, 
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Servicio', ServicioSchema);