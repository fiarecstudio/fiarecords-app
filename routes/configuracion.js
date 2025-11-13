// routes/configuracion.js
const express = require('express');
const router = express.Router();
const Configuracion = require('../models/Configuracion');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/';
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const newFilename = file.fieldname === 'logoFile' ? 'logo' : 'firma';
        cb(null, newFilename + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

router.get('/public/logo', async (req, res) => {
    try {
        const config = await Configuracion.findOne({ singletonId: 'main_config' });
        res.json({ filePath: config ? config.logoPath : null });
    } catch (err) { res.status(500).json({ error: 'Error al obtener el logo' }); }
});

router.use(auth);

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

router.get('/defaults', (req, res) => {
    try {
        const defaultConfig = new Configuracion();
        res.json(defaultConfig.firmaPos);
    } catch (err) { res.status(500).json({ error: 'Error al obtener los valores predeterminados.' }); }
});

router.put('/firma-pos', async (req, res) => {
    try {
        const { firmaPos } = req.body;
        const config = await Configuracion.findOneAndUpdate({ singletonId: 'main_config' }, { $set: { firmaPos: firmaPos } }, { new: true, upsert: true });
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error al guardar la posición de la firma.' }); }
});

// NUEVA RUTA PARA GUARDAR DATOS BANCARIOS
router.put('/datos-bancarios', async (req, res) => {
    try {
        const { datosBancarios } = req.body;
        const config = await Configuracion.findOneAndUpdate(
            { singletonId: 'main_config' },
            { $set: { datosBancarios: datosBancarios } },
            { new: true, upsert: true }
        );
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: 'Error al guardar los datos bancarios.' });
    }
});

router.post('/upload-firma', upload.single('firmaFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo.' });
    try {
        const filePath = `/${req.file.path.replace(/\\/g, "/")}`;
        const config = await Configuracion.findOneAndUpdate({ singletonId: 'main_config' }, { $set: { firmaPath: filePath } }, { new: true, upsert: true });
        res.json({ message: 'Firma guardada.', filePath: config.firmaPath });
    } catch (err) { res.status(500).json({ error: 'Error al guardar la ruta de la firma.' }); }
});

router.post('/upload-logo', upload.single('logoFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo.' });
    try {
        const filePath = `/${req.file.path.replace(/\\/g, "/")}`;
        await Configuracion.findOneAndUpdate({ singletonId: 'main_config' }, { $set: { logoPath: filePath } }, { new: true, upsert: true });
        res.json({ message: 'Logo guardado.', filePath });
    } catch (err) { res.status(500).json({ error: 'Error al guardar el logo.' }); }
});

module.exports = router;
