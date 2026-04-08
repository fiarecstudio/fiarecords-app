/**
 * Rutas para gestión y descarga de backups
 * Solo accesible para administradores
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const auth = require('../middleware/auth');
const { backupManual } = require('../utils/backupDatabase');

const BACKUP_DIR = path.join(__dirname, '..', 'backup');

// Aplicar middleware de auth a todas las rutas
router.use(auth);

// GET /api/backups - Listar todos los backups disponibles
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            return res.json({ backups: [], message: 'No hay backups disponibles' });
        }

        const archivos = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const stats = fs.statSync(path.join(BACKUP_DIR, f));
                return {
                    nombre: f,
                    coleccion: f.split('_')[0],
                    fecha: f.match(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}/)?.[0] || 'desconocida',
                    tamano: (stats.size / 1024).toFixed(2) + ' KB',
                    creado: stats.mtime
                };
            })
            .sort((a, b) => new Date(b.creado) - new Date(a.creado));

        res.json({ 
            backups: archivos,
            total: archivos.length,
            carpeta: BACKUP_DIR
        });
    } catch (error) {
        console.error('Error listando backups:', error);
        res.status(500).json({ error: 'Error al listar backups' });
    }
});

// GET /api/backups/descargar/:nombre - Descargar un backup específico
router.get('/descargar/:nombre', (req, res) => {
    try {
        const { nombre } = req.params;
        
        // Validar que solo sea archivo .json
        if (!nombre.endsWith('.json') || nombre.includes('..')) {
            return res.status(400).json({ error: 'Nombre de archivo inválido' });
        }

        const filepath = path.join(BACKUP_DIR, nombre);
        
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
        
        const fileStream = fs.createReadStream(filepath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('Error descargando backup:', error);
        res.status(500).json({ error: 'Error al descargar backup' });
    }
});

// POST /api/backups/crear - Crear backup manual inmediato
router.post('/crear', async (req, res) => {
    try {
        console.log('🧪 Backup manual solicitado via API');
        await backupManual();
        res.json({ message: 'Backup creado exitosamente' });
    } catch (error) {
        console.error('Error creando backup:', error);
        res.status(500).json({ error: 'Error al crear backup' });
    }
});

module.exports = router;
