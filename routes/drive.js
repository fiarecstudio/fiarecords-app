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
 * Hace una carpeta pública (cualquiera con el enlace puede ver)
 * @param {string} fileId - ID de la carpeta
 */
async function hacerCarpetaPublica(fileId) {
    try {
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });
        console.log(`[DRIVE] Permisos públicos aplicados a carpeta: ${fileId}`);
    } catch (error) {
        console.error(`[DRIVE] Error al aplicar permisos públicos:`, error);
        // No lanzamos error para no interrumpir el flujo si falla
    }
}

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
        
        // 2.1.1 Hacer la carpeta de empresa pública (cualquiera con enlace puede ver)
        await hacerCarpetaPublica(empresaFolderId);
        
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

            const uploadedFile = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, name, mimeType'
            });

            // Detectar tipo de archivo
            const nombreLow = file.originalname.toLowerCase();
            let tipoArchivo = 'otro';
            if (nombreLow.match(/\.(mp3|wav|ogg|m4a|aac)$/)) tipoArchivo = 'audio';
            else if (nombreLow.match(/\.(mp4|mov|avi|mkv|webm)$/)) tipoArchivo = 'video';
            else if (nombreLow.match(/\.(jpg|jpeg|png|gif|webp)$/)) tipoArchivo = 'imagen';

            if (tipoArchivo !== 'otro') {
                uploadedFiles.push({
                    nombre: file.originalname,
                    driveId: uploadedFile.data.id,
                    urlDirecta: `https://drive.google.com/file/d/${uploadedFile.data.id}/preview`,
                    urlDescarga: `https://drive.google.com/uc?export=download&id=${uploadedFile.data.id}`,
                    tipo: tipoArchivo
                });
            }

            console.log(`[DRIVE] Archivo subido: ${file.originalname} (${uploadedFile.data.id})`);
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
