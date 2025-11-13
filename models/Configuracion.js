// models/Configuracion.js (Versión Actualizada)
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
    logoPath: String,
    firmaPath: String,
    firmaPos: {
        cotizacion: { type: FirmaPosicionSchema, default: () => ({ vAlign: 'bottom', hAlign: 'left', w: 50, h: 20 }) },
        recibo:     { type: FirmaPosicionSchema, default: () => ({ vAlign: 'bottom', hAlign: 'left', w: 50, h: 20 }) },
        contrato:   { type: FirmaPosicionSchema, default: () => ({ vAlign: 'bottom', hAlign: 'right', w: 50, h: 20 }) },
        distribucion: { type: FirmaPosicionSchema, default: () => ({ vAlign: 'bottom', hAlign: 'left', w: 50, h: 20 }) }
    },
    datosBancarios: {
        banco: String,
        titular: String,
        tarjeta: String, // Campo actualizado (antes numeroCuenta)
        clabe: String
    }
});

module.exports = mongoose.model('Configuracion', ConfiguracionSchema);