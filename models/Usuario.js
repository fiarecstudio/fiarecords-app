const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UsuarioSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    // ESTA LISTA DEBE COINCIDIR EXACTAMENTE CON TU MENÚ
    // Agregamos versiones con Mayúscula y minúscula para evitar errores
    enum: [
        'ingeniero', 'Ingeniero', 
        'admin', 'Admin', 
        'cliente', 'Cliente', 
        'diseñador', 'Diseñador'
    ], 
    default: 'Ingeniero' 
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