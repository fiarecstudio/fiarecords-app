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

// ==================================================================
// ÍNDICES COMPUESTOS PARA OPTIMIZACIÓN MULTI-TENANT
// ==================================================================
ServicioSchema.index({ empresaId: 1, isDeleted: 1 });
ServicioSchema.index({ empresaId: 1, nombre: 1 });
ServicioSchema.index({ empresaId: 1, visible: 1 });

module.exports = mongoose.model('Servicio', ServicioSchema);