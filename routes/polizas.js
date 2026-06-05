const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule.PDFParse || (pdfParseModule.default && pdfParseModule.default.PDFParse) || pdfParseModule.default || pdfParseModule;
if (typeof PDFParse !== 'function') {
    console.error('[pdf-parse] export inválida:', typeof PDFParse, pdfParseModule && Object.keys(pdfParseModule));
}
const auth = require('../middleware/auth');
const polizaController = require('../controllers/polizaController');

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

// Rutas normales protegidas
router.post('/', auth, polizaController.crearPoliza);
router.get('/', auth, polizaController.obtenerPolizas);
router.get('/:id', auth, polizaController.obtenerPolizaPorId);
router.put('/:id', auth, polizaController.actualizarPoliza);
router.delete('/:id', auth, polizaController.eliminarPoliza);

// FASE 2: PAPELERA DE RECICLAJE
router.get('/papelera/recuperar', auth, polizaController.obtenerPapelera);
router.put('/papelera/restaurar/:id', auth, polizaController.restaurarPoliza);
router.delete('/papelera/definitivo/:id', auth, polizaController.eliminarDefinitivamente);

// FASE 3: GESTIÓN DE PAGOS
router.post('/:id/pagos', auth, polizaController.registrarPago);
router.delete('/:id/pagos/:pagoIndex', auth, polizaController.eliminarPago);
router.put('/:id/proximo-pago', auth, polizaController.actualizarProximoPago);

// FASE 7: RENOVACIÓN DE PAGO (Actualizar fechaProximoPago al siguiente ciclo)
router.put('/:id/renovar-pago', auth, polizaController.renovarPago);

// FASE 5: NOTIFICACIONES MANUALES
router.post('/:id/notificar-manual', auth, polizaController.enviarRecordatorioManual);
router.post('/enviar-recordatorio', auth, polizaController.enviarRecordatorioCorreo);

// FASE 6: MÉTRICAS DEL DASHBOARD DE SEGUROS
router.get('/dashboard/metricas', auth, polizaController.obtenerMetricasSeguros);

/**
 * ENDPOINT DE EXTRACCIÓN (Optimizado con Lógica Posicional para CHUBB)
 */
router.post('/extraer-datos', auth, upload.single('archivo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No se proporcionó archivo' });
        }

        console.log('\n======================================');
        console.log('[Extraer Datos] Procesando PDF:', req.file.originalname);

        let pdfData;
        try {
            const parser = new PDFParse({ data: req.file.buffer });
            pdfData = await parser.getText();
            await parser.destroy();
        } catch (pdfError) {
            return res.status(400).json({ success: false, message: 'No se pudo procesar el PDF' });
        }

        const textoCompleto = normalizeText(pdfData.text);
        
        // Convertimos el texto en un arreglo de líneas exactas
        const lineas = textoCompleto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

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

        // 1. FECHAS DE VIGENCIA (La lógica que ya nos funcionó perfecto)
        const regexFechas = /\b(\d{1,2}\/[A-Za-z]{3}\/\d{4}|\d{1,2}\/\d{1,2}\/\d{4})\b/ig;
        const todasLasFechas = [...textoCompleto.matchAll(regexFechas)].map(m => m[1]);
        const fechasVigencia = todasLasFechas.filter(f => {
            const año = parseInt(f.split('/')[2]);
            return año >= 2020; 
        });

        if (fechasVigencia.length >= 2) {
            datos.fechaInicio = fechasVigencia[0];
            datos.fechaVencimiento = fechasVigencia[1];
        }

        // 2. NÚMERO DE PÓLIZA (Busca formato CHUBB: AN seguido de 8 números)
        const polizaMatch = textoCompleto.match(/\b(AN[\s\-]*\d{8})\b/i);
        if (polizaMatch) {
            datos.numeroPoliza = polizaMatch[1].replace(/\s+/g, ''); // Lo deja como "AN46037175"
        }

        // 3. EXTRACCIÓN LÍNEA POR LÍNEA (Lógica de Posición)
        for (let i = 0; i < lineas.length; i++) {
            const linea = lineas[i];
            const lineaUpper = linea.toUpperCase();

            // INCISO: En CHUBB suele estar exactamente en la línea debajo del número de póliza
            if (datos.numeroPoliza && lineaUpper.replace(/\s+/g, '') === datos.numeroPoliza.replace(/\s+/g, '')) {
                // Si la línea de abajo es un número corto (ej. "1"), es el inciso
                if (lineas[i + 1] && lineas[i + 1].match(/^\d{1,2}$/)) {
                    datos.inciso = lineas[i + 1];
                }
            }

            // PAQUETE y CLIENTE: 
            // Buscamos la línea que contenga la palabra AMPLIA, LIMITADA, etc.
            const paqueteMatch = lineaUpper.match(/\b(AMPLIA|LIMITADA|INTEGRAL|BASICA|PREMIER|ESENCIAL)\b/);
            if (paqueteMatch && !datos.paquete) {
                datos.paquete = paqueteMatch[1]; // Guarda "AMPLIA"
                
                // El nombre del cliente siempre está en la línea INMEDIATAMENTE inferior al paquete
                if (lineas[i + 1]) {
                    datos.cliente = lineas[i + 1];
                }
            }

            // PRIMA TOTAL:
            // En el "desorden" del PDF, el total SIEMPRE aparece una línea arriba de la palabra "CARÁTULA"
            if (lineaUpper === 'CARÁTULA' || lineaUpper === 'CARATULA') {
                if (i > 0 && lineas[i - 1].match(/[0-9,]+\.[0-9]{2}/)) {
                    // Agarramos el número de arriba, quitamos comas y convertimos a decimal
                    const montoRaw = lineas[i - 1].match(/[0-9,]+\.[0-9]{2}/)[0];
                    datos.primaTotal = parseFloat(montoRaw.replace(/,/g, ''));
                }
            }
        }

        // 4. RESPALDOS (Por si algo llegara a fallar)
        if (!datos.inciso) datos.inciso = "1"; // Default normal de pólizas
        if (!datos.cliente) {
            // Plan B para el cliente si no encontró el paquete
            const clienteFallback = textoCompleto.match(/Asegurado:\s*([A-Z\s]{10,})/i);
            if (clienteFallback) datos.cliente = clienteFallback[1].trim();
        }

        console.log("🔥 Datos limpios extraídos:", JSON.stringify(datos, null, 2));
        console.log('======================================\n');

        res.json({ success: true, datos: datos });

    } catch (error) {
        console.error('[Extraer Datos] Error general:', error.message);
        res.status(500).json({ success: false, message: 'Error interno del servidor al procesar' });
    }
});

module.exports = router;