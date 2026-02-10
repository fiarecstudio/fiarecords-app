const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UsuarioSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    // AQUÍ ESTÁ LA CORRECCIÓN:
    // Agregamos 'Diseñador' y 'Cliente' tal como salen en tu menú.
    // Mantenemos 'admin' e 'ingeniero' (minúsculas) por compatibilidad y agregamos las versiones con Mayúscula.
    enum: ['ingeniero', 'admin', 'Ingeniero', 'Admin', 'Cliente', 'Diseñador'], 
    default: 'ingeniero' 
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