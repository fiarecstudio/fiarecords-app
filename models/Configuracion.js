const mongoose = require('mongoose');

const ConfiguracionSchema = new mongoose.Schema({
    // ID único para asegurar que solo haya una configuración
    singletonId: { type: String, default: 'main_config', unique: true },
    
    // Configuración visual
    logoBase64: { type: String },
    faviconBase64: { type: String }, // <--- NUEVO CAMPO PARA FAVICON
    
    firmaBase64: { type: String },
    firmaPos: { type: Object }, 
    
    datosBancarios: {
        banco: String,
        titular: String,
        tarjeta: String,
        clabe: String
    },

    // Horarios de trabajo
    horarioLaboral: {
        type: Map,
        of: new mongoose.Schema({
            activo: { type: Boolean, default: true },
            inicio: { type: String, default: "10:00" },
            fin: { type: String, default: "20:00" }
        }),
        default: {
            "0": { activo: false, inicio: "10:00", fin: "18:00" },
            "1": { activo: true, inicio: "10:00", fin: "20:00" },
            "2": { activo: true, inicio: "10:00", fin: "20:00" },
            "3": { activo: true, inicio: "10:00", fin: "20:00" },
            "4": { activo: true, inicio: "10:00", fin: "20:00" },
            "5": { activo: true, inicio: "10:00", fin: "20:00" },
            "6": { activo: true, inicio: "10:00", fin: "16:00" }
        }
    },

    // --- NUEVO: PLANTILLAS DE DOCUMENTOS (CONTRATOS, RECIBOS, COTIZACIONES) ---
    plantillasDoc: {
        encabezado1: { type: String, default: "FiaRecords Studio" },
        encabezado2: { type: String, default: "Juárez N.L." },
        terminosCotizacion: { type: String, default: "Este presupuesto tiene una vigencia de 15 días." },
        terminosRecibo: { type: String, default: "¡Gracias por confiar en FiaRecords!" },
        plantillaContrato: { type: String, default: "CONTRATO DE PRESTACIÓN DE SERVICIOS\n\nEntre FiaRecords y {{CLIENTE}} para el proyecto {{PROYECTO}}...\n\n(Edita esto en configuración)" }
    }
});

module.exports = mongoose.model('Configuracion', ConfiguracionSchema);