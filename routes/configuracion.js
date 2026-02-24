const express = require('express');
const router = express.Router();
const Configuracion = require('../models/Configuracion');
const auth = require('../middleware/auth');
const multer = require('multer');

// Configuración de Multer (Memoria) para subir imágenes
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 2 * 1024 * 1024 } // Límite de 2MB
});

// Ruta pública (sin auth) para obtener el logo en el Login
router.get('/public/logo', async (req, res) => {
    try {
        const config = await Configuracion.findOne({ singletonId: 'main_config' });
        res.json({ logoBase64: config ? config.logoBase64 : null });
    } catch (err) { res.status(500).json({ error: 'Error al obtener el logo' }); }
});

// --- A PARTIR DE AQUÍ REQUIERE LOGIN ---
router.use(auth);

// Middleware para verificar si es Admin
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }
};

// Obtener la configuración completa
router.get('/', async (req, res) => {
    try {
        let config = await Configuracion.findOne({ singletonId: 'main_config' });
        if (!config) {
            config = new Configuracion();
            await config.save();
        }
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error al obtener la configuración.' }); }
});

// Guardar Datos Bancarios
router.put('/datos-bancarios', isAdmin, async (req, res) => {
    try {
        const { datosBancarios } = req.body;
        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' },
            { $set: { datosBancarios: datosBancarios } },
            { new: true, upsert: true }
        );
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error al guardar datos bancarios.' }); }
});

// --- NUEVO: GUARDAR HORARIOS LABORALES ---
router.put('/horarios', isAdmin, async (req, res) => {
    try {
        const { horarioLaboral } = req.body;
        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' },
            { $set: { horarioLaboral: horarioLaboral } },
            { new: true, upsert: true }
        );
        res.json(config);
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: 'Error al guardar horarios.' }); 
    }
});

// Subida de Firma
router.post('/upload-firma', [isAdmin, upload.single('firmaFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo.' });
    try {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' }, 
            { $set: { firmaBase64: dataURI } },
            { new: true, upsert: true }
        );
        res.json({ message: 'Firma guardada.', firmaBase64: config.firmaBase64 });
    } catch (err) { res.status(500).json({ error: 'Error al guardar firma.' }); }
});

// Subida de Logo
router.post('/upload-logo', [isAdmin, upload.single('logoFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo.' });
    try {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' }, 
            { $set: { logoBase64: dataURI } },
            { new: true, upsert: true }
        );
        res.json({ message: 'Logo guardado.', logoBase64: config.logoBase64 });
    } catch (err) { res.status(500).json({ error: 'Error al guardar logo.' }); }
});

module.exports = router;