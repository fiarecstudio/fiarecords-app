const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    servicio: { type: mongoose.Schema.Types.ObjectId, ref: 'Servicio' },
    nombre: String,
    unidades: { type: Number, default: 1 },
    precioUnitario: Number,
    esProvisional: { type: Boolean, default: false }
});

const PagoSchema = new mongoose.Schema({
    monto: Number,
    metodo: String, // Transferencia, Efectivo, Tarjeta
    fecha: { type: Date, default: Date.now },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' } 
});

const ProyectoSchema = new mongoose.Schema({
    artista: { type: mongoose.Schema.Types.ObjectId, ref: 'Artista' },
    
    // --- FASE 1: MULTI-TENANT - VINCULACIÓN CON EMPRESA ---
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true
    },
    // ----------------------------------------------------
    
    nombreProyecto: { type: String }, 
    esAlbum: { type: Boolean, default: false },
    
    // 👇 AQUÍ ESTÁN LOS CAMPOS NUEVOS QUE FALTABAN 👇
    esPlanMensual: { type: Boolean, default: false },
    serviciosPorMes: { type: Number, default: 1 },
    duracionMeses: { type: Number, default: 1 },
    // 👆 ========================================= 👆

    fecha: { type: Date, required: true },
    
    items: [ItemSchema],
    
    total: { type: Number, required: true },
    descuento: { type: Number, default: 0 },
    montoPagado: { type: Number, default: 0 },
    
    estatus: { 
        type: String, 
        enum: ['Cotizacion', 'Pendiente de Pago', 'Pagado', 'Cancelado'],
        default: 'Cotizacion'
    },
    
    proceso: {
        type: String,
        enum: ['Solicitud', 'Agendado', 'Grabacion', 'Edicion', 'Mezcla', 'Mastering', 'Completo'],
        default: 'Solicitud'
    },

    metodoPago: { type: String, default: 'Pendiente' },
    
    // Enlace a la carpeta general de Drive
    enlaceEntrega: { type: String, default: '' }, 

    // Guarda los archivos multimedia
    // TASK 3: Esquema mejorado con campos completos de Google Drive
    archivos: [{
        nombre: String,                          // Nombre original del archivo
        driveId: String,                       // ID de Google Drive
        urlDirecta: String,                    // URL para preview/embed
        urlDescarga: String,                   // URL alternativa de descarga
        webViewLink: String,                   // Link oficial de visualización Drive
        webContentLink: String,                // Link oficial de descarga directa Drive
        tipo: {                                // 'audio', 'video', 'imagen', 'documento', 'comprimido', 'otro'
            type: String,
            enum: ['audio', 'video', 'imagen', 'documento', 'comprimido', 'otro'],
            default: 'otro'  // Default seguro para evitar fallos de validación
        },
        mimeType: String,                      // MIME type real del archivo
        size: { type: Number, default: 0 },    // Tamaño en bytes
        subidoEn: { type: Date, default: Date.now } // Fecha de subida
    }],
    
    detallesContrato: { type: Object },
    detallesDistribucion: { type: Object },
    
    // Firma del cliente en base64
    firmaCliente: { type: String },

    pagos: [PagoSchema], 

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// ==================================================================
// ÍNDICES COMPUESTOS PARA OPTIMIZACIÓN MULTI-TENANT
// ==================================================================
ProyectoSchema.index({ empresaId: 1, estatus: 1 });
ProyectoSchema.index({ empresaId: 1, proceso: 1 });
ProyectoSchema.index({ empresaId: 1, fecha: -1 });
ProyectoSchema.index({ empresaId: 1, isDeleted: 1 });
ProyectoSchema.index({ empresaId: 1, artista: 1 });
// Índice para consultas de disponibilidad
ProyectoSchema.index({ empresaId: 1, fecha: 1, estatus: 1, proceso: 1 });

module.exports = mongoose.model('Proyecto', ProyectoSchema);