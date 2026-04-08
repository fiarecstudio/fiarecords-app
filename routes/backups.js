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
const { listarBackupsEnDrive, generarURLAutorizacion } = require('../utils/googleDrive');

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

// GET /api/backups/drive - Listar backups en Google Drive
router.get('/drive', async (req, res) => {
    try {
        console.log('☁️ Listando backups en Google Drive...');
        const backups = await listarBackupsEnDrive();
        res.json({ 
            backups, 
            total: backups.length,
            ubicacion: 'Google Drive - Carpeta: FiaRecords_Backups'
        });
    } catch (error) {
        console.error('Error listando backups en Drive:', error);
        
        // Detectar error de scopes
        if (error.message && error.message.includes('insufficient authentication scopes')) {
            return res.status(403).json({ 
                error: 'Permisos insuficientes para Google Drive',
                solucion: 'Visita /api/backups/auth-drive para obtener nueva URL de autorización',
                instrucciones: 'El refresh_token actual solo tiene permisos de Gmail. Necesitas regenerarlo con permisos de Drive.'
            });
        }
        
        res.status(500).json({ error: 'Error al listar backups en Drive' });
    }
});

// GET /api/backups/auth-drive - Generar URL de autorización para Drive
router.get('/auth-drive', (req, res) => {
    try {
        // Verificar que las variables de entorno estén configuradas
        const clientId = process.env.GMAIL_CLIENT_ID;
        const clientSecret = process.env.GMAIL_CLIENT_SECRET;
        
        if (!clientId || clientId === 'tu_gmail_client_id_aqui' || clientId === 'your_google_client_id_here') {
            return res.status(500).json({
                error: 'GMAIL_CLIENT_ID no configurado',
                mensaje: 'Debes configurar las credenciales de Google API en tu archivo .env',
                archivo: '.env',
                variablesRequeridas: [
                    'GMAIL_CLIENT_ID',
                    'GMAIL_CLIENT_SECRET', 
                    'GMAIL_REFRESH_TOKEN'
                ],
                pasos: [
                    '1. Ve a https://console.cloud.google.com/apis/credentials',
                    '2. Crea un proyecto o selecciona el existente',
                    '3. Crea credenciales OAuth 2.0',
                    '4. Copia Client ID y Client Secret a tu archivo .env',
                    '5. Luego visita esta URL nuevamente para obtener el refresh_token'
                ]
            });
        }
        
        if (!clientSecret || clientSecret === 'tu_gmail_client_secret_aqui') {
            return res.status(500).json({
                error: 'GMAIL_CLIENT_SECRET no configurado',
                mensaje: 'Debes agregar el Client Secret en tu archivo .env'
            });
        }
        
        console.log('🔐 Generando URL de autorización para Google Drive...');
        console.log('   Client ID:', clientId.substring(0, 10) + '...');
        
        const authUrl = generarURLAutorizacion();
        
        res.json({
            mensaje: 'URL de autorización generada',
            instrucciones: [
                '1. Visita la URL en tu navegador',
                '2. Inicia sesión y acepta TODOS los permisos (Gmail + Drive)',
                '3. Copia el código de autorización',
                '4. Ve a https://developers.google.com/oauthplayground',
                '5. Selecciona "Exchange authorization code for tokens"',
                '6. Pega el código y obtén el refresh_token',
                '7. Actualiza GMAIL_REFRESH_TOKEN en tu archivo .env'
            ],
            url: authUrl,
            nota: 'El refresh_token actual debe ser reemplazado por uno que incluya scopes de Drive'
        });
    } catch (error) {
        console.error('Error generando URL:', error);
        res.status(500).json({ 
            error: 'Error al generar URL de autorización',
            detalle: error.message 
        });
    }
});

module.exports = router;
