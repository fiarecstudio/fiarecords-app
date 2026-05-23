/**
 * GUÍA TÉCNICA: Solución del Error 403 en Iframes de Google Drive
 * ================================================================
 * 
 * PROBLEMA:
 * --------
 * El visor de documentos (iframe) devolvía error 403 al intentar mostrar
 * URLs estándar de Google Drive como:
 * - https://drive.google.com/file/d/ID/view
 * - https://drive.google.com/drive/folders/ID
 * 
 * CAUSA:
 * -----
 * Google bloquea el endpoint /view en iframes por razones de seguridad.
 * Las carpetas no pueden ser embebidas directamente en iframes.
 * 
 * SOLUCIÓN IMPLEMENTADA:
 * =====================
 * Se creó un módulo JavaScript (googleDriveUrlFormatter.js) que convierte
 * automáticamente las URLs al formato seguro antes de inyectarlas en el iframe.
 * 
 * 
 * 1. FUNCIÓN PRINCIPAL: formatGoogleDriveUrlForIframe()
 * =====================================================
 * 
 * UBICACIÓN: /public/js/googleDriveUrlFormatter.js
 * 
 * USO GLOBAL:
 *   - window.GoogleDriveUrlFormatter.format(url)
 *   - window.formatDriveUrl(url)  [Alias corto]
 * 
 * 
 * 2. CONVERSIONES REALIZADAS
 * ==========================
 * 
 * CASO 1: Archivo Individual
 * --------------------------
 * INPUT:  https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/view
 * OUTPUT: https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/preview
 * 
 * INPUT:  https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/view?usp=sharing
 * OUTPUT: https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/preview
 * 
 * INPUT:  https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN
 * OUTPUT: https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/preview
 * 
 * 
 * CASO 2: Carpeta
 * ----------------
 * INPUT:  https://drive.google.com/drive/folders/1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg
 * OUTPUT: https://drive.google.com/embeddedfolderview?id=1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg#grid
 * 
 * INPUT:  https://drive.google.com/drive/u/0/folders/1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg
 * OUTPUT: https://drive.google.com/embeddedfolderview?id=1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg#grid
 * 
 * INPUT:  https://drive.google.com/embeddedfolderview?id=1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg
 * OUTPUT: https://drive.google.com/embeddedfolderview?id=1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg#grid
 * 
 * 
 * 3. INTEGRACIÓN EN EL CÓDIGO
 * ===========================
 * 
 * A) En la función playMedia (script.js, línea ~930)
 * ---------------------------------------------------
 * 
 *   function playMedia(url, name, tipo, btnElement) {
 *       // ...
 *       const isFolder = window.GoogleDriveUrlFormatter && 
 *                       window.GoogleDriveUrlFormatter.isFolder(url);
 *       
 *       if (isFolder) {
 *           // Mostrar botón para abrir carpeta en pestaña nueva
 *       } else {
 *           // Formatear URL antes de inyectar en iframe
 *           let iframeUrl = url;
 *           
 *           if (window.GoogleDriveUrlFormatter && window.GoogleDriveUrlFormatter.format) {
 *               const formattedUrl = window.GoogleDriveUrlFormatter.format(url);
 *               if (formattedUrl) {
 *                   iframeUrl = formattedUrl;
 *               }
 *           }
 *           
 *           container.innerHTML = `
 *               <iframe src="${iframeUrl}" ...></iframe>
 *           `;
 *       }
 *   }
 * 
 * 
 * B) En renderPlayerUI (script.js, línea ~614)
 * -----------------------------------------------
 * 
 *   // Usar webViewLink si está disponible, sino construir URL segura
 *   let urlToUse = file.webViewLink;
 *   
 *   if (!urlToUse && file.driveId) {
 *       // Construir URL segura para iframe (usar /preview en lugar de /view)
 *       urlToUse = `https://drive.google.com/file/d/${file.driveId}/preview`;
 *   }
 * 
 * 
 * 4. FUNCIONES AUXILIARES DISPONIBLES
 * ===================================
 * 
 * A) Detectar si es carpeta:
 * ----------------------------
 *   window.GoogleDriveUrlFormatter.isFolder(url)
 *   
 *   Ejemplo:
 *   if (GoogleDriveUrlFormatter.isFolder('https://drive.google.com/drive/folders/ID')) {
 *       console.log('Es una carpeta');
 *   }
 * 
 * 
 * B) Extraer ID de carpeta:
 * ---------------------------
 *   window.GoogleDriveUrlFormatter.extractFolderId(url)
 *   
 *   Ejemplo:
 *   const folderId = GoogleDriveUrlFormatter.extractFolderId(
 *       'https://drive.google.com/drive/folders/1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg'
 *   );
 *   // Resultado: '1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg'
 * 
 * 
 * C) Extraer ID de archivo:
 * ---------------------------
 *   window.GoogleDriveUrlFormatter.extractFileId(url)
 *   
 *   Ejemplo:
 *   const fileId = GoogleDriveUrlFormatter.extractFileId(
 *       'https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/view'
 *   );
 *   // Resultado: '1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN'
 * 
 * 
 * 5. EXPRESIONES REGULARES UTILIZADAS
 * ====================================
 * 
 * Para CARPETAS:
 * ---------------
 * /(?:\/drive\/(?:u\/\d+\/)?)?folders\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)/
 * 
 * Coincide con:
 * - /drive/folders/ID
 * - /drive/u/0/folders/ID
 * - /folders/ID
 * - id=ID
 * 
 * 
 * Para ARCHIVOS:
 * ---------------
 * /\/file\/d\/([a-zA-Z0-9_-]+)(?:\/(?:view|preview|edit))?/
 * 
 * Coincide con:
 * - /file/d/ID
 * - /file/d/ID/view
 * - /file/d/ID/preview
 * - /file/d/ID/edit
 * 
 * 
 * 6. LOGGING Y DEBUGGING
 * ======================
 * 
 * El módulo registra todos los cambios en la consola del navegador:
 * 
 *   [DriveUrlFormatter] Archivo detectado: {
 *       original: "https://drive.google.com/file/d/ID/view",
 *       fileId: "ID",
 *       formatted: "https://drive.google.com/file/d/ID/preview"
 *   }
 * 
 *   [DriveUrlFormatter] Carpeta detectada: {
 *       original: "https://drive.google.com/drive/folders/ID",
 *       folderId: "ID",
 *       formatted: "https://drive.google.com/embeddedfolderview?id=ID#grid"
 *   }
 * 
 * 
 * 7. COMPATIBILIDAD Y FALLBACKS
 * =============================
 * 
 * - Si window.GoogleDriveUrlFormatter no existe, la URL se usa tal cual
 * - Si la URL no es reconocida, retorna null
 * - El código intenta varios patrones para máxima compatibilidad
 * - Compatible con URLs antiguas y nuevas de Google Drive
 * 
 * 
 * 8. ARCHIVO NUEVAMENTE CREADO
 * ============================
 * 
 * Ubicación: /public/js/googleDriveUrlFormatter.js
 * 
 * Este archivo debe ser cargado ANTES de script.js en index.html:
 * 
 *   <script src="public/js/googleDriveUrlFormatter.js"></script>
 *   <script src="script.js"></script>
 * 
 * 
 * 9. TESTING Y VALIDACIÓN
 * =======================
 * 
 * Para probar en la consola del navegador:
 * 
 *   // Probar conversión de archivo
 *   formatDriveUrl('https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/view')
 *   // Retorna: 'https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/preview'
 *   
 *   // Probar conversión de carpeta
 *   formatDriveUrl('https://drive.google.com/drive/folders/1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg')
 *   // Retorna: 'https://drive.google.com/embeddedfolderview?id=1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg#grid'
 *   
 *   // Verificar si es carpeta
 *   GoogleDriveUrlFormatter.isFolder('https://drive.google.com/drive/folders/ID')
 *   // Retorna: true
 * 
 * 
 * 10. CAMBIOS REALIZADOS EN LOS ARCHIVOS
 * =======================================
 * 
 * A) index.html
 *    - Agregado: <script src="public/js/googleDriveUrlFormatter.js"></script>
 *    - Posición: Después de ui.js, antes de PDF.js
 * 
 * B) script.js
 *    - Función playMedia() (línea ~930): Ahora usa GoogleDriveUrlFormatter
 *    - Función renderPlayerUI() (línea ~614): URLs construidas con /preview
 *    - Función sincronizarArchivosDrive() (línea ~870): URLs con /preview
 * 
 * C) public/js/googleDriveUrlFormatter.js (NUEVO)
 *    - Módulo IIFE que expone funciones de formateo
 *    - Accesible vía: window.GoogleDriveUrlFormatter o window.formatDriveUrl
 * 
 */

// ================================================================
// EJEMPLOS DE USO PRÁCTICO
// ================================================================

// Ejemplo 1: Formatear URL de archivo
const urlArchivo = 'https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/view';
const urlFormateada = window.formatDriveUrl(urlArchivo);
// Resultado: 'https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/preview'

// Crear iframe con URL formateada
const iframe = document.createElement('iframe');
iframe.src = urlFormateada;
iframe.style.width = '100%';
iframe.style.height = '600px';
document.getElementById('container').appendChild(iframe);


// Ejemplo 2: Detectar tipo y procesar
const url = 'https://drive.google.com/drive/folders/1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg';

if (window.GoogleDriveUrlFormatter.isFolder(url)) {
    // Es carpeta: abrir en nueva pestaña
    window.open(url, '_blank');
} else {
    // Es archivo: embeber en iframe
    const urlSegura = window.formatDriveUrl(url);
    document.getElementById('preview').innerHTML = 
        `<iframe src="${urlSegura}" width="100%" height="600px"></iframe>`;
}


// Ejemplo 3: Extraer IDs
const carpetaUrl = 'https://drive.google.com/drive/folders/1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg';
const folderId = window.GoogleDriveUrlFormatter.extractFolderId(carpetaUrl);
console.log('ID de carpeta:', folderId);
// Output: '1J9K2gdMB8ANm_9AYRKieJmqr3aLBmPwg'

const archivoUrl = 'https://drive.google.com/file/d/1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN/view';
const fileId = window.GoogleDriveUrlFormatter.extractFileId(archivoUrl);
console.log('ID de archivo:', fileId);
// Output: '1C_92tKvj9a8Y-mKzj_hfFS2-xcO7VffN'
