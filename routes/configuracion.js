// routes/configuracion.js
const express = require('express');
const router = express.Router();
const Configuracion = require('../models/Configuracion');
const auth = require('../middleware/auth');
const multer = require('multer');

// CAMBIO: Usamos memoryStorage para no depender del disco duro del servidor
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 2 * 1024 * 1024 } // Límite de 2MB para no saturar la BD
});

// Ruta pública (sin auth) para que el login pueda ver el logo
router.get('/public/logo', async (req, res) => {
    try {
        const config = await Configuracion.findOne({ singletonId: 'main_config' });
        // Devolvemos el Base64 directo
        res.json({ logoBase64: config ? config.logoBase64 : null });
    } catch (err) { res.status(500).json({ error: 'Error al obtener el logo' }); }
});

// A partir de aquí, todo requiere login
router.use(auth);

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }
};

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

router.put('/firma-pos', isAdmin, async (req, res) => {
    try {
        const { firmaPos } = req.body;
        const config = await Configuracion.findOneAndUpdate({ singletonId: 'main_config' }, { $set: { firmaPos: firmaPos } }, { new: true, upsert: true });
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error al guardar posición.' }); }
});

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

// --- SUBIDA DE IMÁGENES A BASE DE DATOS (Base64) ---

router.post('/upload-firma', [isAdmin, upload.single('firmaFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo.' });
    try {
        // Convertir buffer a Base64
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' }, 
            { $set: { firmaBase64: dataURI } }, // Guardamos el string largo
            { new: true, upsert: true }
        );
        res.json({ message: 'Firma guardada en BD.', firmaBase64: config.firmaBase64 });
    } catch (err) { res.status(500).json({ error: 'Error al guardar firma.' }); }
});

router.post('/upload-logo', [isAdmin, upload.single('logoFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo.' });
    try {
        // Convertir buffer a Base64
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' }, 
            { $set: { logoBase64: dataURI } }, // Guardamos el string largo
            { new: true, upsert: true }
        );
        res.json({ message: 'Logo guardado en BD.', logoBase64: config.logoBase64 });
    } catch (err) { res.status(500).json({ error: 'Error al guardar logo.' }); }
});

module.exports = router;