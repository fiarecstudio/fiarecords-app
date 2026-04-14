const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Configuracion = require('../models/Configuracion');
const Empresa = require('../models/Empresa'); // Importar para buscar empresa principal
const auth = require('../middleware/auth');
const { applyTenantFilter, buildQueryFilter, hasTenantAccess, limpiarEmpresaId, getEmpresaPrincipalId } = require('../middleware/tenantFilter');
const multer = require('multer');

// Configuración de Multer
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// Ruta pública: obtener logo Y FAVICON
// REGLA DE NEGOCIO: Login siempre muestra FIA RECORDS (empresa principal)
// Si hay empresaId, muestra logo de esa empresa (con fallback a FIA si no tiene)
// NUNCA devuelve error 500 ni objeto vacío - siempre hay fallback a FIA RECORDS
router.get('/public/logo', async (req, res) => {
    try {
        // FASE 5: Usar función de utilidad para limpiar el empresaId
        let empresaId = limpiarEmpresaId(req.query.empresaId || req.headers['x-empresa-id']);
        
        // Si no hay empresaId válido, usar fallback automático a empresa principal
        if (!empresaId) {
            empresaId = await getEmpresaPrincipalId();
            console.log(`[Logo] ID no válido o no proporcionado. Usando fallback automático: ${empresaId}`);
        }
        
        console.log(`[Logo] Procesando petición para empresaId: ${empresaId || 'FALLBACK FINAL'}`);
        
        let config = null;
        let configPrincipal = null;
        
        // Siempre obtener la configuración principal (FIA RECORDS) como respaldo definitivo
        const empresaPrincipalId = await getEmpresaPrincipalId();
        if (empresaPrincipalId) {
            configPrincipal = await Configuracion.findOne({ 
                empresaId: new mongoose.Types.ObjectId(empresaPrincipalId) 
            });
        }
        
        if (empresaId && empresaId !== empresaPrincipalId) {
            // Si se proporciona empresaId válido diferente de la principal, buscar esa config
            config = await Configuracion.findOne({ 
                empresaId: new mongoose.Types.ObjectId(empresaId) 
            });
            // Si la empresa no tiene logo, usar el de la principal (fallback)
            if (!config || !config.logoBase64) {
                console.log(`[Logo] Empresa ${empresaId} no tiene logo propio, aplicando fallback de FIA RECORDS`);
                config = configPrincipal;
            }
        } else {
            // Usar empresa principal directamente
            console.log('[Logo] Sirviendo logo de empresa principal (FIA RECORDS)');
            config = configPrincipal;
        }
        
        // ÚLTIMO RESGUARDO: Si aún no hay config, buscar CUALQUIER configuración
        if (!config) {
            console.warn('[Logo] No se encontró config principal, buscando cualquier configuración disponible');
            config = await Configuracion.findOne({ logoBase64: { $exists: true, $ne: null } });
        }
        
        // Respuesta garantizada: NUNCA 500, NUNCA vacío si hay datos en el sistema
        const respuesta = {
            logoBase64: config && config.logoBase64 ? config.logoBase64 : null,
            faviconBase64: config && config.faviconBase64 ? config.faviconBase64 : null,
            empresaId: empresaId || empresaPrincipalId || null
        };
        
        console.log(`[Logo] Respuesta enviada: logo=${respuesta.logoBase64 ? 'SÍ' : 'NO'}, favicon=${respuesta.faviconBase64 ? 'SÍ' : 'NO'}`);
        
        res.json(respuesta);
    } catch (err) { 
        console.error('[Logo] Error crítico (pero controlado):', err);
        // ÚLTIMO RESGUARDO: Devolver nulls pero con status 200 para no romper el frontend
        res.status(200).json({ 
            logoBase64: null, 
            faviconBase64: null,
            empresaId: null,
            _error: true,
            _message: 'Error interno, pero la petición no se rompe'
        }); 
    }
});

// --- REQUIERE LOGIN ---
router.use(auth);

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') next();
    else return res.status(403).json({ error: 'Acceso denegado.' });
};

// FASE 3: Helper para obtener/crear config de la empresa del usuario
const getOrCreateConfig = async (empresaId) => {
    let config = await Configuracion.findOne({ empresaId });
    if (!config) {
        config = new Configuracion({ empresaId });
        await config.save();
    }
    return config;
};

router.get('/', async (req, res) => {
    try {
        // FASE 4: Identidad Automática - Priorizar header o usar empresa del usuario
        const headerId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
        
        // 1. Prioridad Máxima: El header del Super Admin (si no es 'all')
        let finalEmpresaId = (headerId && headerId !== 'all') ? headerId : null;
        
        // 2. Prioridad de Identidad: Si no hay header válido, usar el ID del usuario logueado
        if (!finalEmpresaId && req.user && req.user.empresaId) {
            finalEmpresaId = req.user.empresaId;
        }
        
        console.log('[Config] Usuario:', req.user?.username, '| Rol:', req.user?.role, '| Header:', headerId, '| Empresa Final:', finalEmpresaId);
        
        if (!finalEmpresaId) {
            return res.status(400).json({ error: 'No se pudo determinar la empresa' });
        }
        
        let config = await getOrCreateConfig(finalEmpresaId);
        
        // FASE 4: Fallback de logo - Si la empresa no tiene logo, usar el de FIA RECORDS
        if (!config.logoBase64) {
            console.log(`[Config] Empresa ${finalEmpresaId} no tiene logo, buscando fallback de FIA RECORDS`);
            const empresaPrincipal = await Empresa.findOne({ isDefault: true });
            if (empresaPrincipal) {
                const configPrincipal = await Configuracion.findOne({ empresaId: empresaPrincipal._id });
                if (configPrincipal && configPrincipal.logoBase64) {
                    console.log('[Config] Aplicando logo de FIA RECORDS como fallback');
                    config = config.toObject(); // Convertir a objeto plano para modificar
                    config.logoBase64 = configPrincipal.logoBase64;
                    config.faviconBase64 = configPrincipal.faviconBase64;
                }
            }
        }
        
        res.json(config);
    } catch (err) { 
        console.error('[Config] Error:', err);
        res.status(500).json({ error: 'Error config' }); 
    }
});

// GET /empresa - Obtener nombre de la empresa actual
router.get('/empresa', async (req, res) => {
    try {
        const headerId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
        let finalEmpresaId = (headerId && headerId !== 'all') ? headerId : null;
        
        if (!finalEmpresaId && req.user && req.user.empresaId) {
            finalEmpresaId = req.user.empresaId;
        }
        
        if (!finalEmpresaId) {
            return res.json({ nombre: 'Fia Records' });
        }
        
        const Empresa = require('../models/Empresa');
        const empresa = await Empresa.findById(finalEmpresaId);
        
        if (empresa) {
            res.json({ nombre: empresa.nombre });
        } else {
            res.json({ nombre: 'Fia Records' });
        }
    } catch (err) {
        console.error('[Config/Empresa] Error:', err);
        res.json({ nombre: 'Fia Records' });
    }
});

router.put('/datos-bancarios', isAdmin, async (req, res) => {
    try {
        const config = await Configuracion.findOneAndUpdate(
            { empresaId: req.user.empresaId },
            { $set: { datosBancarios: req.body.datosBancarios } },
            { new: true, upsert: true }
        );
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error guardar banco' }); }
});

router.put('/horarios', isAdmin, async (req, res) => {
    try {
        const config = await Configuracion.findOneAndUpdate(
            { empresaId: req.user.empresaId },
            { $set: { horarioLaboral: req.body.horarioLaboral } },
            { new: true, upsert: true }
        );
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error guardar horarios' }); }
});

// ==========================================================
// --- NUEVO: GUARDAR PLANTILLAS DE DOCUMENTOS (CONTRATOS) ---
// ==========================================================
router.put('/plantillas', isAdmin, async (req, res) => {
    try {
        const config = await Configuracion.findOneAndUpdate(
            { empresaId: req.user.empresaId },
            { $set: { plantillasDoc: req.body.plantillasDoc } },
            { new: true, upsert: true }
        );
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error al guardar plantillas' }); }
});
// ==========================================================

router.post('/upload-firma', [isAdmin, upload.single('firmaFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No archivo' });
    try {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        const config = await Configuracion.findOneAndUpdate(
            { empresaId: req.user.empresaId }, 
            { $set: { firmaBase64: dataURI } },
            { new: true, upsert: true }
        );
        res.json({ message: 'Firma guardada', firmaBase64: config.firmaBase64 });
    } catch (err) { res.status(500).json({ error: 'Error subida' }); }
});

router.post('/upload-logo', [isAdmin, upload.single('logoFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No archivo' });
    try {
        // FASE 5: Prioridad ABSOLUTA: header X-Empresa-Id, fallback a empresa del usuario
        const headerId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
        const userEmpresaId = req.user && req.user.empresaId ? req.user.empresaId.toString() : null;
        
        // Limpiar y validar: header tiene prioridad, luego el usuario
        let targetId = limpiarEmpresaId(headerId) || userEmpresaId;
        
        if (!targetId) {
            return res.status(400).json({ 
                error: "No se pudo determinar la empresa. Selecciona una empresa específica o verifica tu sesión." 
            });
        }
        
        console.log(`[Upload Logo] Subiendo logo para empresa: ${targetId} (Header: ${headerId || 'N/A'}, Usuario: ${userEmpresaId || 'N/A'})`);
        
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        
        // Usar upsert: true para crear la configuración si no existe
        const config = await Configuracion.findOneAndUpdate(
            { empresaId: new mongoose.Types.ObjectId(targetId) }, 
            { $set: { logoBase64: dataURI } },
            { new: true, upsert: true }
        );
        
        console.log(`[Upload Logo] Logo guardado exitosamente para empresa: ${targetId}`);
        res.json({ message: 'Logo guardado exitosamente', logoBase64: config.logoBase64 });
    } catch (err) { 
        console.error('[Upload Logo] Error:', err);
        res.status(500).json({ error: 'Error al subir el logo', details: err.message }); 
    }
});

// --- SUBIR FAVICON ---
router.post('/upload-favicon', [isAdmin, upload.single('faviconFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No archivo' });
    try {
        // FASE 5: Prioridad ABSOLUTA: header X-Empresa-Id, fallback a empresa del usuario
        const headerId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
        const userEmpresaId = req.user && req.user.empresaId ? req.user.empresaId.toString() : null;
        
        // Limpiar y validar: header tiene prioridad, luego el usuario
        let targetId = limpiarEmpresaId(headerId) || userEmpresaId;
        
        if (!targetId) {
            return res.status(400).json({ 
                error: "No se pudo determinar la empresa. Selecciona una empresa específica o verifica tu sesión." 
            });
        }
        
        console.log(`[Upload Favicon] Subiendo favicon para empresa: ${targetId} (Header: ${headerId || 'N/A'}, Usuario: ${userEmpresaId || 'N/A'})`);
        
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        
        // Usar upsert: true para crear la configuración si no existe
        const config = await Configuracion.findOneAndUpdate(
            { empresaId: new mongoose.Types.ObjectId(targetId) }, 
            { $set: { faviconBase64: dataURI } },
            { new: true, upsert: true }
        );
        
        console.log(`[Upload Favicon] Favicon guardado exitosamente para empresa: ${targetId}`);
        res.json({ message: 'Favicon guardado exitosamente', faviconBase64: config.faviconBase64 });
    } catch (err) { 
        console.error('[Upload Favicon] Error:', err);
        res.status(500).json({ error: 'Error al subir el favicon', details: err.message }); 
    }
});

module.exports = router;