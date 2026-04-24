const express = require('express');
const router = express.Router();
const multer = require('multer');
const { google } = require('googleapis');
const fs = require('fs');
const Empresa = require('../models/Empresa');

// Configurar multer para archivos temporales
const upload = multer({ dest: 'uploads/' });

// Configurar autenticación OAuth2 con variables de entorno
const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground' // URL de callback para refresh token
);

// Establecer credenciales usando el refresh token
oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

const ROOT_FOLDER_ID = process.env.GOOGLE_ROOT_FOLDER_ID;

/**
 * TASK 2: ELIMINADA - Función hacerCarpetaPublica
 * Razón: Seguridad - Las carpetas ya NO se hacen públicas automáticamente.
 * Los archivos y carpetas solo son accesibles por el dueño de la cuenta de Drive.
 * Para compartir, el administrador debe hacerlo explícitamente desde Google Drive.
 */

/**
 * Busca o crea una carpeta en Drive
 * @param {string} nombre - Nombre de la carpeta
 * @param {string|null} parentId - ID de la carpeta padre (opcional)
 * @returns {Promise<string>} - ID de la carpeta
 */
async function buscarOCrearCarpeta(nombre, parentId = null) {
    try {
        // Construir query de búsqueda
        let query = `name = '${nombre}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        if (parentId) {
            query += ` and '${parentId}' in parents`;
        }

        // Buscar si la carpeta ya existe
        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (response.data.files && response.data.files.length > 0) {
            console.log(`[DRIVE] Carpeta "${nombre}" encontrada: ${response.data.files[0].id}`);
            return response.data.files[0].id;
        }

        // Crear la carpeta si no existe
        const fileMetadata = {
            name: nombre,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : []
        };

        const folder = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });

        console.log(`[DRIVE] Carpeta "${nombre}" creada: ${folder.data.id}`);
        return folder.data.id;
    } catch (error) {
        console.error('[DRIVE] Error al buscar/crear carpeta:', error);
        throw error;
    }
}

/**
 * Endpoint: POST /api/drive/upload
 * Sube archivos a Google Drive organizados por empresa (usando nombre real), artista y proyecto
 */
router.post('/upload', upload.array('files'), async (req, res) => {
    const tempFiles = [];
    
    try {
        const { empresaId, artistaNombre, proyectoNombre, proyectoId } = req.body;
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se proporcionaron archivos' });
        }

        if (!empresaId) {
            return res.status(400).json({ error: 'Se requiere el ID de la empresa' });
        }

        console.log(`[DRIVE] Iniciando subida para empresaId: ${empresaId}`);
        console.log(`[DRIVE] Artista: ${artistaNombre}, Proyecto: ${proyectoNombre}`);

        // =========================================================================
        // PASO 1: OBTENER EL NOMBRE REAL DE LA EMPRESA DESDE MONGODB
        // =========================================================================
        let nombreEmpresa;
        try {
            const empresa = await Empresa.findById(empresaId);
            if (empresa && empresa.nombre) {
                nombreEmpresa = empresa.nombre;
                console.log(`[DRIVE] Nombre real de empresa obtenido: "${nombreEmpresa}"`);
            } else {
                // Fallback: usar ID truncado si no se encuentra la empresa
                nombreEmpresa = `Empresa_${empresaId.substring(0, 8)}`;
                console.warn(`[DRIVE] Empresa no encontrada, usando fallback: "${nombreEmpresa}"`);
            }
        } catch (dbError) {
            console.error('[DRIVE] Error al buscar empresa en MongoDB:', dbError);
            nombreEmpresa = `Empresa_${empresaId.substring(0, 8)}`;
        }

        // =========================================================================
        // PASO 2: CREAR ESTRUCTURA DE CARPETAS EN DRIVE USANDO EL NOMBRE DE EMPRESA
        // =========================================================================
        
        // 2.1 Crear/Buscar carpeta de la empresa (con el NOMBRE real, no el ID)
        const empresaFolderId = await buscarOCrearCarpeta(nombreEmpresa, ROOT_FOLDER_ID);
        
        // TASK 2: ELIMINADO - Las carpetas ya NO se hacen públicas automáticamente
        // Los archivos solo son accesibles por el dueño de la cuenta de Drive
        console.log(`[DRIVE] Carpeta privada creada/verificada: ${empresaFolderId}`);
        
        // 2.2 Crear/Buscar carpeta del artista dentro de la empresa
        const artistaFolderId = await buscarOCrearCarpeta(artistaNombre || 'Sin Artista', empresaFolderId);
        
        // 2.3 Crear/Buscar carpeta del proyecto dentro del artista
        const proyectoFolderId = await buscarOCrearCarpeta(proyectoNombre || 'Sin Proyecto', artistaFolderId);

        // Obtener enlace de la carpeta del proyecto
        const folderInfo = await drive.files.get({
            fileId: proyectoFolderId,
            fields: 'webViewLink'
        });
        const folderLink = folderInfo.data.webViewLink;

        // =========================================================================
        // PASO 3: SUBIR ARCHIVOS
        // =========================================================================
        const uploadedFiles = [];
        
        for (const file of req.files) {
            tempFiles.push(file.path);
            
            const fileMetadata = {
                name: file.originalname,
                parents: [proyectoFolderId]
            };

            const media = {
                mimeType: file.mimetype,
                body: fs.createReadStream(file.path)
            };

            // TASK 1: Detectar si usar Resumable Upload (> 5MB)
            const fileSize = file.size; // Multer ya tiene el tamaño
            const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
            const usarResumable = fileSize > (5 * 1024 * 1024); // 5MB

            let uploadedFile;

            if (usarResumable) {
                console.log(`[DRIVE] Usando RESUMABLE UPLOAD: ${file.originalname} (${fileSizeMB} MB)`);
                uploadedFile = await drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id, name, mimeType, webViewLink, webContentLink, size',
                    uploadType: 'resumable'
                }, {
                    timeout: 600000 // 10 minutos para archivos grandes
                });
            } else {
                console.log(`[DRIVE] Subida normal: ${file.originalname} (${fileSizeMB} MB)`);
                uploadedFile = await drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id, name, mimeType, webViewLink, webContentLink, size'
                });
            }

            // TASK 2: ELIMINADO - No se hacen permisos públicos automáticos
            // Los archivos solo son accesibles por el dueño de la cuenta de Drive

            // Detectar tipo de archivo
            const nombreLow = file.originalname.toLowerCase();
            let tipoArchivo = 'otro';
            if (nombreLow.match(/\.(mp3|wav|ogg|m4a|aac|flac|aiff)$/)) tipoArchivo = 'audio';
            else if (nombreLow.match(/\.(mp4|mov|avi|mkv|webm|flv)$/)) tipoArchivo = 'video';
            else if (nombreLow.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/)) tipoArchivo = 'imagen';
            else if (nombreLow.match(/\.(pdf|doc|docx|txt|rtf)$/)) tipoArchivo = 'documento';
            else if (nombreLow.match(/\.(zip|rar|7z|tar|gz)$/)) tipoArchivo = 'comprimido';

            // TASK 3: Guardar información completa incluyendo size, mimeType, webViewLink, webContentLink
            const archivoInfo = {
                nombre: file.originalname,
                driveId: uploadedFile.data.id,
                urlDirecta: uploadedFile.data.webViewLink || `https://drive.google.com/file/d/${uploadedFile.data.id}/preview`,
                urlDescarga: uploadedFile.data.webContentLink || `https://drive.google.com/uc?export=download&id=${uploadedFile.data.id}`,
                webViewLink: uploadedFile.data.webViewLink,      // Link de visualización
                webContentLink: uploadedFile.data.webContentLink, // Link de descarga directa
                tipo: tipoArchivo,
                mimeType: uploadedFile.data.mimeType || file.mimetype,
                size: parseInt(uploadedFile.data.size || fileSize),
                subidoEn: new Date()
            };

            uploadedFiles.push(archivoInfo);

            console.log(`[DRIVE] ✅ Archivo subido: ${file.originalname} (${fileSizeMB} MB)`);
            console.log(`[DRIVE] 🔒 Archivo privado - solo accesible por cuenta de Drive`);
        }

        // Limpiar archivos temporales
        tempFiles.forEach(path => {
            try { fs.unlinkSync(path); } catch (e) { /* ignore */ }
        });

        res.json({
            success: true,
            message: 'Archivos subidos correctamente',
            folderLink: folderLink,
            files: uploadedFiles,
            folderStructure: {
                empresa: nombreEmpresa,
                empresaFolderId: empresaFolderId,
                artista: artistaNombre,
                proyecto: proyectoNombre,
                proyectoFolderId: proyectoFolderId
            }
        });

    } catch (error) {
        console.error('[DRIVE] Error en upload:', error);
        
        // Limpiar archivos temporales en caso de error
        tempFiles.forEach(path => {
            try { fs.unlinkSync(path); } catch (e) { /* ignore */ }
        });

        res.status(500).json({
            error: 'Error al subir archivos a Drive',
            details: error.message
        });
    }
});

module.exports = router;
