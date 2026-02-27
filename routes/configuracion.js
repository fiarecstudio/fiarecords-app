const express = require('express');
const router = express.Router();
const Configuracion = require('../models/Configuracion');
const auth = require('../middleware/auth');
const multer = require('multer');

// Configuración de Multer
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// Ruta pública: obtener logo Y FAVICON
router.get('/public/logo', async (req, res) => {
    try {
        const config = await Configuracion.findOne({ singletonId: 'main_config' });
        res.json({ 
            logoBase64: config ? config.logoBase64 : null,
            faviconBase64: config ? config.faviconBase64 : null // <--- NUEVO
        });
    } catch (err) { res.status(500).json({ error: 'Error al obtener assets' }); }
});

// --- REQUERE LOGIN ---
router.use(auth);

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') next();
    else return res.status(403).json({ error: 'Acceso denegado.' });
};

router.get('/', async (req, res) => {
    try {
        let config = await Configuracion.findOne({ singletonId: 'main_config' });
        if (!config) {
            config = new Configuracion();
            await config.save();
        }
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error config' }); }
});

router.put('/datos-bancarios', isAdmin, async (req, res) => {
    try {
        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' },
            { $set: { datosBancarios: req.body.datosBancarios } },
            { new: true, upsert: true }
        );
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error guardar banco' }); }
});

router.put('/horarios', isAdmin, async (req, res) => {
    try {
        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' },
            { $set: { horarioLaboral: req.body.horarioLaboral } },
            { new: true, upsert: true }
        );
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error guardar horarios' }); }
});

router.post('/upload-firma', [isAdmin, upload.single('firmaFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No archivo' });
    try {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' }, 
            { $set: { firmaBase64: dataURI } },
            { new: true, upsert: true }
        );
        res.json({ message: 'Firma guardada', firmaBase64: config.firmaBase64 });
    } catch (err) { res.status(500).json({ error: 'Error subida' }); }
});

router.post('/upload-logo', [isAdmin, upload.single('logoFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No archivo' });
    try {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' }, 
            { $set: { logoBase64: dataURI } },
            { new: true, upsert: true }
        );
        res.json({ message: 'Logo guardado', logoBase64: config.logoBase64 });
    } catch (err) { res.status(500).json({ error: 'Error subida' }); }
});

// --- NUEVO: SUBIR FAVICON ---
router.post('/upload-favicon', [isAdmin, upload.single('faviconFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No archivo' });
    try {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' }, 
            { $set: { faviconBase64: dataURI } },
            { new: true, upsert: true }
        );
        res.json({ message: 'Favicon guardado', faviconBase64: config.faviconBase64 });
    } catch (err) { res.status(500).json({ error: 'Error subida favicon' }); }
});

module.exports = router;