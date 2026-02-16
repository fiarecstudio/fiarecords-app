// ==========================================
// ARCHIVO: routes/configuracion.js (PROTEGIDO)
// ==========================================
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
        if (!fs.existsSync(uploadPath)){
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const newFilename = file.fieldname === 'logoFile' ? 'logo' : 'firma';
        cb(null, newFilename + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Ruta pública (sin auth) para que el login pueda ver el logo
router.get('/public/logo', async (req, res) => {
    try {
        const config = await Configuracion.findOne({ singletonId: 'main_config' });
        res.json({ filePath: config ? config.logoPath : null });
    } catch (err) { res.status(500).json({ error: 'Error al obtener el logo' }); }
});

// A partir de aquí, todo requiere login
router.use(auth);

// Middleware para verificar si es ADMIN
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
};

// Obtener configuración (Clientes pueden ver, pero no editar)
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

// --- RUTAS PROTEGIDAS (SOLO ADMIN) ---

router.put('/firma-pos', isAdmin, async (req, res) => {
    try {
        const { firmaPos } = req.body;
        const config = await Configuracion.findOneAndUpdate({ singletonId: 'main_config' }, { $set: { firmaPos: firmaPos } }, { new: true, upsert: true });
        res.json(config);
    } catch (err) { res.status(500).json({ error: 'Error al guardar la posición de la firma.' }); }
});

// PROTEGER DATOS BANCARIOS: Solo admin puede modificar
router.put('/datos-bancarios', isAdmin, async (req, res) => {
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

router.post('/upload-firma', [isAdmin, upload.single('firmaFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo.' });
    try {
        const filePath = `/${req.file.path.replace(/\\/g, "/")}`;
        const config = await Configuracion.findOneAndUpdate({ singletonId: 'main_config' }, { $set: { firmaPath: filePath } }, { new: true, upsert: true });
        res.json({ message: 'Firma guardada.', filePath: config.firmaPath });
    } catch (err) { res.status(500).json({ error: 'Error al guardar la ruta de la firma.' }); }
});

router.post('/upload-logo', [isAdmin, upload.single('logoFile')], async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo.' });
    try {
        const filePath = `/${req.file.path.replace(/\\/g, "/")}`;
        await Configuracion.findOneAndUpdate({ singletonId: 'main_config' }, { $set: { logoPath: filePath } }, { new: true, upsert: true });
        res.json({ message: 'Logo guardado.', filePath });
    } catch (err) { res.status(500).json({ error: 'Error al guardar el logo.' }); }
});

module.exports = router;