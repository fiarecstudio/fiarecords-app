const mongoose = require('mongoose');

const FirmaPosicionSchema = new mongoose.Schema({
    vAlign: { type: String, default: 'bottom' },
    hAlign: { type: String, default: 'right' },
    offsetX: { type: Number, default: 0 },
    offsetY: { type: Number, default: 0 },
    w: { type: Number, default: 50 },
    h: { type: Number, default: 20 }
});

const ConfiguracionSchema = new mongoose.Schema({
    singletonId: { type: String, default: 'main_config', unique: true }, 
    
    // Imágenes en Base64 para persistencia robusta
    logoBase64: { type: String, default: null },
    firmaBase64: { type: String, default: null },
    
    // Rutas legacy (por compatibilidad)
    logoPath: String, 
    firmaPath: String,

    // --- CONFIGURACIÓN DE HORARIOS ---
    horario: {
        inicio: { type: String, default: "10:00" }, 
        fin: { type: String, default: "22:00" },    
        diasLaborales: { type: [Number], default: [1,2,3,4,5,6] } // 1=Lun, 6=Sab
    },

    firmaPos: {
        cotizacion: { type: FirmaPosicionSchema, default: () => ({ vAlign: 'bottom', hAlign: 'left', w: 50, h: 20 }) },
        recibo:     { type: FirmaPosicionSchema, default: () => ({ vAlign: 'bottom', hAlign: 'left', w: 50, h: 20 }) },
        contrato:   { type: FirmaPosicionSchema, default: () => ({ vAlign: 'bottom', hAlign: 'right', w: 50, h: 20 }) },
        distribucion: { type: FirmaPosicionSchema, default: () => ({ vAlign: 'bottom', hAlign: 'left', w: 50, h: 20 }) }
    },
    datosBancarios: {
        banco: String,
        titular: String,
        tarjeta: String, 
        clabe: String
    }
});

module.exports = mongoose.model('Configuracion', ConfiguracionSchema);