/**
 * MÓDULO: Google Drive URL Formatter
 * ================================================================
 * Soluciona el error 403 en iframes de Google Drive formateando 
 * las URLs para que sean compatibles con embeddedfolderview y preview.
 * 
 * PROBLEMA: URLs estándar de Drive (/view, /folders) son bloqueadas
 * SOLUCIÓN: Convertir a formatos seguros para iframes (/preview, embeddedfolderview)
 */

(function() {
    'use strict';

    /**
     * FUNCIÓN PRINCIPAL: Formatea URL de Google Drive para usar en iframe
     * ================================================================
     * 
     * @param {string} url - URL de Google Drive a formatear
     * @returns {string} URL formateada segura para iframe o null si no es válida
     * 
     * CASOS MANEJADOS:
     * 1. Archivo individual: /file/d/ID/view → /file/d/ID/preview
     * 2. Archivo individual: /file/d/ID → /file/d/ID/preview
     * 3. Carpeta: /drive/folders/ID → embeddedfolderview?id=ID#grid
     * 4. Carpeta: /folders/ID → embeddedfolderview?id=ID#grid
     * 5. Carpeta: id=ID → embeddedfolderview?id=ID#grid
     */
    function formatGoogleDriveUrlForIframe(url) {
        if (!url || typeof url !== 'string') {
            console.warn('[DriveUrlFormatter] URL inválida:', url);
            return null;
        }

        try {
            // ================================================================
            // CASO 1: DETECTAR SI ES CARPETA (folder)
            // ================================================================
            // Regex para detectar carpetas: /drive/folders/ID, /folders/ID, o id=ID
            const folderRegex = /(?:\/drive\/(?:u\/\d+\/)?)?folders\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)/;
            const folderMatch = url.match(folderRegex);

            if (folderMatch) {
                const folderId = folderMatch[1] || folderMatch[2];
                if (folderId) {
                    const formattedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`;
                    console.log('[DriveUrlFormatter] Carpeta detectada:', {
                        original: url,
                        folderId: folderId,
                        formatted: formattedUrl
                    });
                    return formattedUrl;
                }
            }

            // ================================================================
            // CASO 2: DETECTAR SI ES ARCHIVO (/file/d/ID)
            // ================================================================
            // Regex para detectar archivos: /file/d/ID/view, /file/d/ID/preview, o solo /file/d/ID
            const fileRegex = /\/file\/d\/([a-zA-Z0-9_-]+)(?:\/(?:view|preview|edit))?/;
            const fileMatch = url.match(fileRegex);

            if (fileMatch) {
                const fileId = fileMatch[1];
                if (fileId) {
                    const formattedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
                    console.log('[DriveUrlFormatter] Archivo detectado:', {
                        original: url,
                        fileId: fileId,
                        formatted: formattedUrl
                    });
                    return formattedUrl;
                }
            }

            // ================================================================
            // CASO 3: DETECTAR FORMATO ALTERNATIVO (¿solo ID?)
            // ================================================================
            // Si la URL solo contiene el ID (patrón: string alfanumérico)
            if (/^[a-zA-Z0-9_-]+$/.test(url.trim())) {
                // Asumir que es un archivo ID
                const formattedUrl = `https://drive.google.com/file/d/${url.trim()}/preview`;
                console.log('[DriveUrlFormatter] ID de archivo detectado:', {
                    original: url,
                    formatted: formattedUrl
                });
                return formattedUrl;
            }

            console.warn('[DriveUrlFormatter] URL de Drive no reconocida:', url);
            return null;

        } catch (error) {
            console.error('[DriveUrlFormatter] Error al procesar URL:', error);
            return null;
        }
    }

    /**
     * FUNCIÓN AUXILIAR: Detecta si una URL es de carpeta
     * ================================================================
     */
    function isGoogleDriveFolder(url) {
        if (!url || typeof url !== 'string') return false;
        return /(?:\/drive\/(?:u\/\d+\/)?)?folders\/|id=/.test(url);
    }

    /**
     * FUNCIÓN AUXILIAR: Extrae el ID de carpeta de una URL
     * ================================================================
     */
    function extractFolderId(url) {
        if (!url || typeof url !== 'string') return null;
        const folderRegex = /(?:\/drive\/(?:u\/\d+\/)?)?folders\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)/;
        const match = url.match(folderRegex);
        return match ? (match[1] || match[2]) : null;
    }

    /**
     * FUNCIÓN AUXILIAR: Extrae el ID de archivo de una URL
     * ================================================================
     */
    function extractFileId(url) {
        if (!url || typeof url !== 'string') return null;
        const fileRegex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
        const match = url.match(fileRegex);
        return match ? match[1] : null;
    }

    // ================================================================
    // EXPORTAR AL OBJETO GLOBAL window
    // ================================================================
    window.GoogleDriveUrlFormatter = {
        format: formatGoogleDriveUrlForIframe,
        isFolder: isGoogleDriveFolder,
        extractFolderId: extractFolderId,
        extractFileId: extractFileId
    };

    // Alias corto para acceso rápido
    window.formatDriveUrl = formatGoogleDriveUrlForIframe;

    if (window.Logger) {
        window.Logger.debug('googleDriveUrlFormatter.js', 'Módulo cargado');
    } else {
        console.log('[DriveUrlFormatter] Módulo cargado correctamente');
    }

})();
