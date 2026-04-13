const mongoose = require('mongoose');

const ServicioSchema = new mongoose.Schema({
  // --- FASE 1: MULTI-TENANT - VINCULACIÓN CON EMPRESA ---
  empresaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Empresa',
    required: true
  },
  // ----------------------------------------------------
  
  nombre: { type: String, required: true },
  precio: { type: Number, required: true },
  // NUEVO: Controla si el cliente puede ver este servicio
  visible: { type: Boolean, default: true }, 
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Servicio', ServicioSchema);