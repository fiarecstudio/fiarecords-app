/**
 * Utilidad para subir archivos a Google Drive
 * Usa las mismas credenciales de Google API que Gmail
 * 
 * IMPORTANTE: El refresh_token debe tener el scope de Drive.
 * Si ves "insufficient authentication scopes", necesitas regenerar el token.
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Configuración OAuth2 (mismas credenciales que Gmail)
const OAuth2 = google.auth.OAuth2;

// Scopes necesarios para Drive
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',  // Gmail (existente)
    'https://www.googleapis.com/auth/drive.file',   // Drive (nuevo)
    'https://www.googleapis.com/auth/drive'         // Drive full access
];

/**
 * Genera URL para autorizar Drive (si el token actual no tiene permisos)
 * Úsala una vez para obtener un nuevo refresh_token con los scopes correctos
 */
function generarURLAutorizacion() {
    const oauth2Client = new OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"  // O tu callback URL
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'  // Fuerza a pedir consentimiento y generar refresh_token
    });

    console.log('\n' + '='.repeat(70));
    console.log('🔗 URL DE AUTORIZACIÓN REQUERIDA');
    console.log('='.repeat(70));
    console.log('\nVisita esta URL para autorizar Google Drive:');
    console.log('\n' + authUrl);
    console.log('\n1. Inicia sesión con tu cuenta de Google');
    console.log('2. Acepta los permisos para Gmail Y Google Drive');
    console.log('3. Copia el código de autorización');
    console.log('4. Ve a https://developers.google.com/oauthplayground');
    console.log('5. Intercambia el código por un refresh_token');
    console.log('6. Actualiza tu variable GMAIL_REFRESH_TOKEN en .env');
    console.log('='.repeat(70) + '\n');

    return authUrl;
}

const getDriveClient = async () => {
    const oauth2Client = new OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    return google.drive({ version: 'v3', auth: oauth2Client });
};

/**
 * Busca o crea una carpeta en Drive
 * @param {string} folderName - Nombre de la carpeta
 * @returns {Promise<string>} - ID de la carpeta
 */
async function buscarOCrearCarpeta(folderName) {
    try {
        const drive = await getDriveClient();
        
        // Buscar si existe la carpeta
        const response = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });

        if (response.data.files.length > 0) {
            console.log(`📁 Carpeta '${folderName}' encontrada: ${response.data.files[0].id}`);
            return response.data.files[0].id;
        }

        // Crear la carpeta si no existe
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };

        const folder = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });

        console.log(`📁 Carpeta '${folderName}' creada: ${folder.data.id}`);
        return folder.data.id;

    } catch (error) {
        console.error('❌ Error con Drive:', error.message);
        
        // Detectar error de scopes insuficientes
        if (error.message && error.message.includes('insufficient authentication scopes')) {
            console.error('\n⚠️  El refresh_token no tiene permisos de Google Drive.');
            console.error('   Ejecuta: node -e "require(\'./utils/googleDrive\').generarURLAutorizacion()"');
            console.error('   O visita: https://developers.google.com/oauthplayground');
            console.error('   Y asegúrate de incluir los scopes de Drive.\n');
        }
        
        throw error;
    }
}

/**
 * Sube un archivo a Google Drive
 * @param {string} filePath - Ruta local del archivo
 * @param {string} folderId - ID de la carpeta en Drive
 * @returns {Promise<Object>} - Información del archivo subido
 */
async function subirArchivoADrive(filePath, folderId) {
    try {
        const drive = await getDriveClient();
        const fileName = path.basename(filePath);

        // Verificar si ya existe un archivo con el mismo nombre
        const existingFiles = await drive.files.list({
            q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });

        // Si existe, eliminar el anterior
        if (existingFiles.data.files.length > 0) {
            for (const file of existingFiles.data.files) {
                await drive.files.delete({ fileId: file.id });
                console.log(`🗑️ Archivo anterior eliminado: ${fileName}`);
            }
        }

        // Subir el nuevo archivo
        const fileMetadata = {
            name: fileName,
            parents: [folderId]
        };

        const media = {
            mimeType: 'application/json',
            body: fs.createReadStream(filePath)
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name, webViewLink, webContentLink'
        });

        // Hacer el archivo compartible (cualquiera con el link puede ver)
        await drive.permissions.create({
            fileId: file.data.id,
            resource: {
                role: 'reader',
                type: 'anyone'
            }
        });

        console.log(`✅ Archivo subido a Drive: ${fileName}`);
        console.log(`🔗 Link: ${file.data.webViewLink}`);
        
        return {
            id: file.data.id,
            name: file.data.name,
            viewLink: file.data.webViewLink,
            downloadLink: file.data.webContentLink
        };

    } catch (error) {
        console.error('❌ Error subiendo a Drive:', error.message);
        throw error;
    }
}

/**
 * Sube todos los archivos de backup a Google Drive
 * @param {Array<string>} archivos - Lista de rutas de archivos
 * @returns {Promise<Array>} - Lista de archivos subidos
 */
async function subirBackupsADrive(archivos) {
    try {
        const folderId = await buscarOCrearCarpeta('FiaRecords_Backups');
        const resultados = [];

        for (const archivo of archivos) {
            try {
                const resultado = await subirArchivoADrive(archivo, folderId);
                resultados.push(resultado);
            } catch (e) {
                console.error(`❌ Error subiendo ${archivo}:`, e.message);
            }
        }

        return resultados;

    } catch (error) {
        console.error('❌ Error en proceso de subida a Drive:', error.message);
        return [];
    }
}

/**
 * Lista los backups en Google Drive
 * @returns {Promise<Array>} - Lista de archivos en Drive
 */
async function listarBackupsEnDrive() {
    try {
        const drive = await getDriveClient();
        const folderId = await buscarOCrearCarpeta('FiaRecords_Backups');

        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false and mimeType='application/json'`,
            spaces: 'drive',
            fields: 'files(id, name, createdTime, size, webViewLink, webContentLink)',
            orderBy: 'createdTime desc'
        });

        return response.data.files.map(file => ({
            id: file.id,
            nombre: file.name,
            fecha: new Date(file.createdTime).toLocaleString('es-MX'),
            tamano: file.size ? (parseInt(file.size) / 1024).toFixed(2) + ' KB' : 'N/A',
            viewLink: file.webViewLink,
            downloadLink: file.webContentLink
        }));

    } catch (error) {
        console.error('❌ Error listando backups en Drive:', error.message);
        return [];
    }
}

module.exports = {
    subirBackupsADrive,
    listarBackupsEnDrive,
    buscarOCrearCarpeta,
    subirArchivoADrive,
    generarURLAutorizacion
};
