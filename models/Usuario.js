const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UsuarioSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  
  // 1. Guardamos el rol. El "lowercase: true" forzará a que se guarde en minúsculas siempre.
  role: { 
    type: String, 
    enum: ['ingeniero', 'admin', 'cliente', 'diseñador'], 
    default: 'ingeniero',
    lowercase: true, // ESTO ARREGLA EL PROBLEMA DE "Admin" vs "admin"
    trim: true
  },

  // 2. AQUÍ ESTABA EL ERROR: Faltaba este campo para guardar los checkboxes
  permisos: { 
    type: mongoose.Schema.Types.Mixed, // Permite guardar un objeto con los true/false de los checkboxes
    default: {} 
  },

  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

UsuarioSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

module.exports = mongoose.model('Usuario', UsuarioSchema);