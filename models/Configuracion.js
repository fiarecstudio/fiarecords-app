const mongoose = require('mongoose');

const ConfiguracionSchema = new mongoose.Schema({
    // ID único para asegurar que solo haya una configuración
    singletonId: { type: String, default: 'main_config', unique: true },
    
    // Configuración visual y bancaria (lo que ya tenías)
    logoBase64: { type: String },
    firmaBase64: { type: String },
    firmaPos: { type: Object }, 
    datosBancarios: {
        banco: String,
        titular: String,
        tarjeta: String,
        clabe: String
    },

    // --- NUEVO: HORARIOS DE TRABAJO ---
    // Claves: "0" (Domingo) hasta "6" (Sábado)
    horarioLaboral: {
        type: Map,
        of: new mongoose.Schema({
            activo: { type: Boolean, default: true },   // ¿Abre ese día?
            inicio: { type: String, default: "10:00" }, // Hora apertura HH:mm
            fin: { type: String, default: "20:00" }     // Hora cierre HH:mm
        }),
        default: {
            "0": { activo: false, inicio: "10:00", fin: "18:00" }, // Domingo cerrado por defecto
            "1": { activo: true, inicio: "10:00", fin: "20:00" },  // Lunes
            "2": { activo: true, inicio: "10:00", fin: "20:00" },
            "3": { activo: true, inicio: "10:00", fin: "20:00" },
            "4": { activo: true, inicio: "10:00", fin: "20:00" },
            "5": { activo: true, inicio: "10:00", fin: "20:00" },
            "6": { activo: true, inicio: "10:00", fin: "16:00" }   // Sábado horario corto
        }
    }
});

module.exports = mongoose.model('Configuracion', ConfiguracionSchema);