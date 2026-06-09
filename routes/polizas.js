const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule.PDFParse || (pdfParseModule.default && pdfParseModule.default.PDFParse) || pdfParseModule.default || pdfParseModule;

if (typeof PDFParse !== 'function') {
    console.error('[pdf-parse] export inválida:', typeof PDFParse, pdfParseModule && Object.keys(pdfParseModule));
}

const auth = require('../middleware/auth');
const { applyTenantFilter } = require('../middleware/tenantFilter');
const polizaController = require('../controllers/polizaController');
const Poliza = require('../models/Poliza');

/**
 * Normaliza el texto del PDF respetando saltos de línea vitales
 */
function normalizeText(text) {
    return text
        .replace(/\r\n/g, '\n') 
        .replace(/[ \t]+\n/g, '\n') 
        .replace(/\n[ \t]+/g, '\n') 
        .replace(/\t+/g, ' ') 
        .replace(/\n{3,}/g, '\n\n') 
        .replace(/\u00A0/g, ' ') 
        .replace(/[\u200B-\u200F\uFEFF]/g, '') 
        .replace(/[ \t]{2,}/g, ' ') 
        .trim();
}

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ==========================================
// RUTAS DE PÓLIZAS
// ==========================================
router.post('/', auth, applyTenantFilter, polizaController.crearPoliza);
router.get('/', auth, applyTenantFilter, polizaController.obtenerPolizas);
router.get('/agenda/eventos', auth, polizaController.obtenerEventosAgenda);
router.get('/migrar-fechas-agenda', auth, polizaController.migrarFechasAgenda);
router.get('/migrar-asesor-historico', auth, async (req, res) => {
    try {
        console.log('[Migración asesorId] Iniciando migración...');
        console.log('[Migración asesorId] Usuario:', req.user);
        
        // Verificar que el usuario sea admin
        if (req.user.role !== 'admin') {
            console.log('[Migración asesorId] Acceso denegado: usuario no es admin');
            return res.status(403).json({ 
                error: 'Acceso denegado. Solo administradores pueden ejecutar esta migración.' 
            });
        }

        const empresaId = req.user.empresaId;
        const adminId = req.user._id || req.user.id;
        
        console.log('[Migración asesorId] empresaId:', empresaId);
        console.log('[Migración asesorId] adminId:', adminId);

        // Buscar pólizas sin asesorId (campo no existe o null)
        const filtro = {
            empresaId,
            $or: [
                { asesorId: { $exists: false } },
                { asesorId: null }
            ]
        };

        console.log('[Migración asesorId] Filtro de búsqueda:', JSON.stringify(filtro));

        const resultado = await Poliza.updateMany(
            filtro,
            { asesorId: adminId }
        );

        console.log('[Migración asesorId] Resultado:', resultado);

        res.json({
            success: true,
            mensaje: 'Migración completada exitosamente',
            polizasActualizadas: resultado.modifiedCount
        });
    } catch (error) {
        console.error('[Migración asesorId] Error detallado:', error);
        console.error('[Migración asesorId] Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Error al ejecutar migración', 
            details: error.message,
            stack: error.stack
        });
    }
});
router.get('/:id', auth, applyTenantFilter, polizaController.obtenerPolizaPorId);
router.put('/:id', auth, applyTenantFilter, polizaController.actualizarPoliza);
router.delete('/:id', auth, applyTenantFilter, polizaController.eliminarPoliza);

// ==========================================
// FASE 2: PAPELERA DE RECICLAJE
// ==========================================
router.get('/papelera/recuperar', auth, applyTenantFilter, polizaController.obtenerPapelera);
router.put('/papelera/restaurar/:id', auth, applyTenantFilter, polizaController.restaurarPoliza);
router.delete('/papelera/definitivo/:id', auth, applyTenantFilter, polizaController.eliminarDefinitivamente);

// ==========================================
// FASE 3: GESTIÓN DE PAGOS
// ==========================================
router.post('/:id/pagos', auth, applyTenantFilter, polizaController.registrarPago);
router.delete('/:id/pagos/:pagoIndex', auth, applyTenantFilter, polizaController.eliminarPago);
router.put('/:id/proximo-pago', auth, applyTenantFilter, polizaController.actualizarProximoPago);

// FASE 7: RENOVACIÓN DE PAGO
router.put('/:id/renovar-pago', auth, applyTenantFilter, polizaController.renovarPago);

// FASE 8: RENOVACIÓN DE PÓLIZA (CRM)
router.post('/:id/renovar', auth, applyTenantFilter, upload.single('pdf'), polizaController.renovarPoliza);

// FASE 5: NOTIFICACIONES MANUALES
router.post('/:id/notificar-manual', auth, applyTenantFilter, polizaController.enviarRecordatorioManual);
router.post('/enviar-recordatorio', auth, applyTenantFilter, polizaController.enviarRecordatorioCorreo);

// FASE 6: MÉTRICAS DEL DASHBOARD DE SEGUROS
router.get('/dashboard/metricas', auth, applyTenantFilter, polizaController.obtenerMetricasSeguros);

/**
 * ENDPOINT DE EXTRACCIÓN (Optimizado con Lógica Posicional para CHUBB)
 */
router.post('/extraer-datos', auth, upload.single('archivo'), async (req, res) => {
    try {
        console.log('[Extraer Datos] Iniciando proceso de extracción...');

        if (!req.file) {
            console.log('[Extraer Datos] Error: No se proporcionó archivo');
            return res.status(400).json({ success: false, message: 'No se proporcionó archivo' });
        }

        console.log('[Extraer Datos] Procesando PDF:', req.file.originalname);
        console.log('[Extraer Datos] Tamaño del archivo:', req.file.size, 'bytes');

        let pdfData;
        try {
            console.log('[Extraer Datos] Iniciando parser PDF...');
            const parser = new PDFParse({ data: req.file.buffer });
            pdfData = await parser.getText();
            console.log('[Extraer Datos] PDF parseado exitosamente, longitud del texto:', pdfData.text.length);
            await parser.destroy();
            console.log('[Extraer Datos] Parser destruido');
        } catch (pdfError) {
            console.error('[Extraer Datos] Error al procesar PDF:', pdfError.message);
            console.error('[Extraer Datos] Stack trace:', pdfError.stack);
            return res.status(400).json({ success: false, message: 'No se pudo procesar el PDF', error: pdfError.message });
        }

        console.log('[Extraer Datos] Normalizando texto...');
        const textoCompleto = normalizeText(pdfData.text);
        console.log('[Extraer Datos] Texto normalizado, longitud:', textoCompleto.length);

        const lineas = textoCompleto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        console.log('[Extraer Datos] Número de líneas:', lineas.length);

        const datos = {
            numeroPoliza: '',
            cliente: '',
            aseguradora: 'CHUBB',
            inciso: '',
            tipoSeguro: 'Vehicular',
            paquete: '',
            fechaInicio: '',
            fechaVencimiento: '',
            primaTotal: 0
        };

        console.log('[Extraer Datos] Extrayendo fechas...');
        const regexFechas = /\b(\d{1,2}\/[A-Za-z]{3}\/\d{4}|\d{1,2}\/\d{1,2}\/\d{4})\b/ig;
        const todasLasFechas = [...textoCompleto.matchAll(regexFechas)].map(m => m[1]);
        console.log('[Extraer Datos] Fechas encontradas:', todasLasFechas);
        const fechasVigencia = todasLasFechas.filter(f => parseInt(f.split('/')[2]) >= 2020);
        console.log('[Extraer Datos] Fechas de vigencia (>=2020):', fechasVigencia);

        if (fechasVigencia.length >= 2) {
            datos.fechaInicio = fechasVigencia[0];
            datos.fechaVencimiento = fechasVigencia[1];
            console.log('[Extraer Datos] Fechas asignadas - Inicio:', datos.fechaInicio, 'Vencimiento:', datos.fechaVencimiento);
        }

        console.log('[Extraer Datos] Extrayendo número de póliza...');
        const polizaMatch = textoCompleto.match(/\b(AN[\s\-]*\d{8})\b/i);
        if (polizaMatch) {
            datos.numeroPoliza = polizaMatch[1].replace(/\s+/g, '');
            console.log('[Extraer Datos] Número de póliza encontrado:', datos.numeroPoliza);
        }

        console.log('[Extraer Datos] Procesando líneas para extraer inciso, paquete, cliente y prima...');
        for (let i = 0; i < lineas.length; i++) {
            const linea = lineas[i];
            const lineaUpper = linea.toUpperCase();

            if (datos.numeroPoliza && lineaUpper.replace(/\s+/g, '') === datos.numeroPoliza.replace(/\s+/g, '')) {
                if (lineas[i + 1] && lineas[i + 1].match(/^\d{1,2}$/)) {
                    datos.inciso = lineas[i + 1];
                    console.log('[Extraer Datos] Inciso encontrado:', datos.inciso);
                }
            }

            const paqueteMatch = lineaUpper.match(/\b(AMPLIA|LIMITADA|INTEGRAL|BASICA|PREMIER|ESENCIAL)\b/);
            if (paqueteMatch && !datos.paquete) {
                datos.paquete = paqueteMatch[1];
                console.log('[Extraer Datos] Paquete encontrado:', datos.paquete);
                if (lineas[i + 1]) {
                    datos.cliente = lineas[i + 1];
                    console.log('[Extraer Datos] Cliente encontrado (después de paquete):', datos.cliente);
                }
            }

            if (lineaUpper === 'CARÁTULA' || lineaUpper === 'CARATULA') {
                if (i > 0 && lineas[i - 1].match(/[0-9,]+\.[0-9]{2}/)) {
                    const montoRaw = lineas[i - 1].match(/[0-9,]+\.[0-9]{2}/)[0];
                    datos.primaTotal = parseFloat(montoRaw.replace(/,/g, ''));
                    console.log('[Extraer Datos] Prima total encontrada:', datos.primaTotal);
                }
            }
        }

        if (!datos.inciso) {
            datos.inciso = "1";
            console.log('[Extraer Datos] Inciso no encontrado, usando default: 1');
        }

        if (!datos.cliente) {
            console.log('[Extraer Datos] Cliente no encontrado, buscando fallback...');
            const clienteFallback = textoCompleto.match(/Asegurado:\s*([A-Z\s]{10,})/i);
            if (clienteFallback) {
                datos.cliente = clienteFallback[1].trim();
                console.log('[Extraer Datos] Cliente encontrado en fallback:', datos.cliente);
            } else {
                console.log('[Extraer Datos] Cliente no encontrado en fallback');
            }
        }

        console.log('[Extraer Datos] Datos extraídos exitosamente:', JSON.stringify(datos, null, 2));
        console.log('[Extraer Datos] Enviando respuesta JSON...');
        res.json({ success: true, datos: datos });
        console.log('[Extraer Datos] Respuesta enviada exitosamente');
    } catch (error) {
        console.error('[Extraer Datos] Error general:', error.message);
        console.error('[Extraer Datos] Stack trace:', error.stack);
        res.status(500).json({ success: false, message: 'Error interno', error: error.message });
    }
});

module.exports = router;