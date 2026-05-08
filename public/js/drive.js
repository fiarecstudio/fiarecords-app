/**
 * FIA RECORDS - Módulo de Google Drive
 * FASE 8 PASO 8: Extracción de toda la lógica de Drive
 * 
 * Este módulo centraliza:
 * - Autenticación con Google Drive API
 * - Gestión de carpetas (estructura de estudio)
 * - Subida de archivos
 * - Visualización de archivos (iconos, formatos)
 * - Gestión de enlaces de entrega
 * 
 * REGLA CRÍTICA: Todas las peticiones al servidor usan fetchAPI desde api.js
 * manteniendo el sistema de Refresh Tokens.
 */

(function() {
    'use strict';

    // ==================================================================
    // 1. CONFIGURACIÓN Y ESTADO
    // ==================================================================
    
    const GAP_CONFIG = {
        apiKey: 'AIzaSyDlUR3S-I0p3VKDt8QCi7YVsejBxoeQfho',
        clientId: '356661306993-u5ilnt843b71qqjkk56i9q32qi383brk.apps.googleusercontent.com',
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
        scope: 'https://www.googleapis.com/auth/drive'
    };

    let tokenClient;
    let gapiInited = false;
    let gisInited = false;
    let checkGoogleLibsInterval;

    // ==================================================================
    // 2. INICIALIZACIÓN DE GOOGLE API
    // ==================================================================

    function initializeGapiClient() {
        if (typeof gapi === 'undefined') return;
        gapi.load('client', async () => {
            try { 
                await gapi.client.init({ 
                    apiKey: GAP_CONFIG.apiKey, 
                    discoveryDocs: GAP_CONFIG.discoveryDocs 
                }); 
                gapiInited = true; 
                console.log('[DriveManager] GAPI inicializado');
            } catch (error) { 
                console.error("[DriveManager] Error init GAPI", error); 
            }
        });
    }

    function initializeGisClient() {
        if (typeof google === 'undefined') return;
        try { 
            tokenClient = google.accounts.oauth2.initTokenClient({ 
                client_id: GAP_CONFIG.clientId, 
                scope: GAP_CONFIG.scope, 
                callback: handleGoogleDriveCallback,
                prompt: 'select_account'
            }); 
            gisInited = true; 
            console.log('[DriveManager] GIS inicializado');
        } catch (error) { 
            console.error("[DriveManager] Error init GIS", error); 
        }
    }

    function startGoogleLibsCheck() {
        checkGoogleLibsInterval = setInterval(() => {
            if (typeof gapi !== 'undefined' && !gapiInited) { 
                initializeGapiClient(); 
            }
            if (typeof google !== 'undefined' && !gisInited) { 
                initializeGisClient(); 
            }
            if (gapiInited && gisInited) { 
                clearInterval(checkGoogleLibsInterval); 
                console.log('[DriveManager] Google APIs listas');
            }
        }, 500);
    }

    // ==================================================================
    // 3. CALLBACK DE AUTENTICACIÓN
    // ==================================================================

    function handleGoogleDriveCallback(tokenResponse) {
        if (tokenResponse && tokenResponse.access_token) {
            console.log('[DriveManager] Autenticación exitosa.');
            if (typeof processDriveUpload === 'function') {
                processDriveUpload();
            }
        }
    }

    // ==================================================================
    // 4. GESTIÓN DE CARPETAS EN DRIVE
    // ==================================================================

    /**
     * Busca o crea una carpeta en Drive
     */
    async function buscarOCrearCarpeta(nombre, padreId = null) {
        let query = `name = '${nombre}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        if (padreId) query += ` and '${padreId}' in parents`;

        console.log(`[DriveManager] Buscando carpeta "${nombre}"${padreId ? ` dentro de padre: ${padreId}` : ' en raíz'}...`);

        try {
            const response = await gapi.client.drive.files.list({
                q: query,
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            const files = response.result.files;
            if (files && files.length > 0) {
                console.log(`[DriveManager] Carpeta "${nombre}" encontrada con ID: ${files[0].id}`);
                return files[0].id;
            } else {
                console.log(`[DriveManager] Carpeta "${nombre}" no existe. Creando nueva...`);
                const fileMetadata = {
                    name: nombre,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: padreId ? [padreId] : []
                };
                const folder = await gapi.client.drive.files.create({
                    resource: fileMetadata,
                    fields: 'id'
                });
                console.log(`[DriveManager] Carpeta "${nombre}" creada con ID: ${folder.result.id}`);
                return folder.result.id;
            }
        } catch (error) {
            console.error('[DriveManager] Error al buscar/crear carpeta:', error);
            throw error;
        }
    }

    /**
     * Versión legacy - Busca o crea carpeta de artista
     */
    async function buscarOCrearCarpetaArtista(nombreArtista, idMaestra) {
        const q = `mimeType='application/vnd.google-apps.folder' and name='${nombreArtista}' and trashed=false and '${idMaestra}' in parents`;
        try {
            const response = await gapi.client.drive.files.list({ q: q, fields: 'files(id, name)' });
            const files = response.result.files;
            if (files && files.length > 0) { 
                return files[0].id; 
            } else {
                const fileMetadata = { 
                    name: nombreArtista, 
                    mimeType: 'application/vnd.google-apps.folder', 
                    parents: [idMaestra] 
                };
                const createRes = await gapi.client.drive.files.create({ 
                    resource: fileMetadata, 
                    fields: 'id' 
                });
                return createRes.result.id;
            }
        } catch (err) { 
            throw new Error('No se pudo crear la carpeta del artista.'); 
        }
    }

    /**
     * Versión legacy - Busca o crea carpeta de proyecto
     */
    async function buscarOCrearCarpetaProyecto(nombreProyecto, idCarpetaArtista) {
        const nombreLimpio = nombreProyecto.trim() || "Proyecto Sin Nombre";
        const q = `mimeType='application/vnd.google-apps.folder' and name='${nombreLimpio}' and trashed=false and '${idCarpetaArtista}' in parents`;
        try {
            const response = await gapi.client.drive.files.list({ q: q, fields: 'files(id, name)' });
            const files = response.result.files;
            if (files && files.length > 0) { 
                return files[0].id; 
            } else {
                const fileMetadata = { 
                    name: nombreLimpio, 
                    mimeType: 'application/vnd.google-apps.folder', 
                    parents: [idCarpetaArtista] 
                };
                const createRes = await gapi.client.drive.files.create({ 
                    resource: fileMetadata, 
                    fields: 'id' 
                });
                return createRes.result.id;
            }
        } catch (err) { 
            throw new Error('No se pudo crear la carpeta del proyecto.'); 
        }
    }

    /**
     * Hace una carpeta pública (permisos de lectura)
     */
    async function hacerCarpetaPublica(fileId) {
        try {
            await gapi.client.drive.permissions.create({
                fileId: fileId,
                resource: { role: 'reader', type: 'anyone' }
            });
        } catch (error) { 
            console.error("[DriveManager] Error permisos carpeta:", error); 
        }
    }

    // ==================================================================
    // 5. ESTRUCTURA MAESTRA DE CARPETAS
    // ==================================================================

    /**
     * Obtiene el nombre legible de la empresa actual
     * REGLA CRÍTICA: Usa fetchAPI (de api.js) para mantener Refresh Tokens
     */
    async function obtenerNombreEmpresaActual() {
        try {
            console.log('[DriveManager] Consultando nombre de empresa al API...');
            // fetchAPI viene de api.js (módulo cargado antes)
            const response = await window.fetchAPI('/api/configuracion/empresa');
            if (response && response.nombre && response.nombre !== 'Fia Records') {
                console.log('[DriveManager] Nombre de empresa obtenido:', response.nombre);
                return response.nombre;
            }
            console.log('[DriveManager] API retornó nombre genérico o no disponible:', response);
        } catch (e) {
            console.log('[DriveManager] No se pudo obtener nombre de empresa desde API:', e);
        }
        
        // Fallback: usar ID de empresa o nombre genérico
        const empresaId = localStorage.getItem('empresaActiva') || localStorage.getItem('selected_empresa_id');
        if (empresaId && empresaId !== 'all' && empresaId !== 'null') {
            return `Empresa_${empresaId.substring(0, 8)}`;
        }
        
        return 'FiaRecords_General';
    }

    /**
     * Función maestra para organizar la estructura del estudio
     * Crea: FiaRecords_Studio > [NombreEmpresa]
     */
    async function obtenerCarpetaMaestra() {
        try {
            console.log('[DriveManager] === INICIANDO CREACIÓN DE ESTRUCTURA DE CARPETAS ===');
            
            // 1. Carpeta Principal de FiaRecords
            console.log('[DriveManager] Paso 1: Creando/Buscando carpeta raíz FiaRecords_Studio...');
            const fiaId = await buscarOCrearCarpeta('FiaRecords_Studio');
            console.log(`[DriveManager] FiaRecords_Studio ID: ${fiaId}`);
            
            // 2. Obtener el nombre legible de la empresa
            const empresaNombre = await obtenerNombreEmpresaActual();
            console.log(`[DriveManager] Nombre de empresa detectado: "${empresaNombre}"`);
            
            console.log(`[DriveManager] Paso 2: Creando/Buscando carpeta de empresa "${empresaNombre}" dentro de FiaRecords_Studio...`);
            const empresaCarpetaId = await buscarOCrearCarpeta(empresaNombre, fiaId);
            console.log(`[DriveManager] Carpeta empresa ID: ${empresaCarpetaId}`);
            
            console.log('[DriveManager] === ESTRUCTURA BASE CREADA ===');
            return empresaCarpetaId;
        } catch (error) {
            console.error('[DriveManager] Error al crear carpeta maestra:', error);
            throw error;
        }
    }

    /**
     * Versión legacy - Obtiene carpeta maestra FIA_RECORDS_STUDIO
     */
    async function obtenerCarpetaMaestraLegacy() {
        const nombreMaestra = "FIA_RECORDS_STUDIO";
        const q = `mimeType='application/vnd.google-apps.folder' and name='${nombreMaestra}' and trashed=false and 'root' in parents`;
        try {
            const response = await gapi.client.drive.files.list({ q: q, fields: 'files(id, name)' });
            const files = response.result.files;
            if (files && files.length > 0) { 
                return files[0].id; 
            } else {
                const fileMetadata = { 
                    'name': nombreMaestra, 
                    'mimeType': 'application/vnd.google-apps.folder' 
                };
                const createRes = await gapi.client.drive.files.create({ 
                    resource: fileMetadata, 
                    fields: 'id' 
                });
                return createRes.result.id;
            }
        } catch (err) { 
            throw new Error('Error de conexión con Drive.'); 
        }
    }

    // ==================================================================
    // 6. SUBIDA DE ARCHIVOS
    // ==================================================================

    /**
     * Inicia el proceso de subida a Drive
     */
    function subirADrive() {
        if (!gapiInited || !gisInited) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'Servicios no listos',
                    text: 'Los servicios de Google Drive no están inicializados. Recarga la página e intenta nuevamente.',
                    confirmButtonText: 'Entendido'
                });
            } else if (typeof window.showToast === 'function') {
                window.showToast('Servicios de Google no listos.', 'error');
            }
            return;
        }
        
        const fileInput = document.getElementById('drive-file-input');
        if (!fileInput || fileInput.files.length === 0) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'warning',
                    title: 'Sin archivos',
                    text: 'Por favor selecciona al menos un archivo para subir.',
                    confirmButtonText: 'Entendido'
                });
            } else if (typeof window.showToast === 'function') {
                window.showToast('Selecciona un archivo.', 'warning');
            }
            return;
        }
        
        // Guardar los datos en una variable global para no perderlos tras el popup
        window.pendingDriveUpload = {
            files: Array.from(fileInput.files),
            statusSpan: document.getElementById('drive-status')
        };

        if (gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            handleGoogleDriveCallback({ access_token: gapi.client.getToken().access_token });
        }
    }

    /**
     * Procesa la subida de archivos al backend (que luego sube a Drive central)
     * REGLA CRÍTICA: Usa fetchAPI para mantener Refresh Tokens en las llamadas al servidor
     */
    async function processDriveUpload() {
        console.log('[DriveManager] Iniciando subida de archivos al servidor...');
        
        if (!window.pendingDriveUpload) {
            if (typeof window.showToast === 'function') {
                window.showToast('No hay archivos pendientes de subida.', 'error');
            }
            return;
        }
        
        const { files, statusSpan } = window.pendingDriveUpload;
        const artistName = document.getElementById('delivery-artist-name')?.value || 'General';
        const projectName = document.getElementById('delivery-project-name')?.value || 'Sin Nombre';
        const projectId = document.getElementById('delivery-project-id')?.value;
        const linkInput = document.getElementById('delivery-link-input');
        
        // Obtener empresaId del localStorage o del proyecto actual
        let empresaId = localStorage.getItem('empresaActiva') || localStorage.getItem('selected_empresa_id');
        
        // Si tenemos projectId, intentar obtener la empresa del proyecto en caché
        if (!empresaId && projectId && window.localCache) {
            const proyecto = window.localCache.proyectos?.find(p => p._id === projectId);
            if (proyecto && proyecto.empresaId) {
                empresaId = proyecto.empresaId;
            }
        }
        
        if (!empresaId) {
            if (typeof window.showToast === 'function') {
                window.showToast('Error: No se pudo determinar la empresa', 'error');
            }
            return;
        }
        
        try {
            if (statusSpan) { 
                statusSpan.textContent = 'Preparando archivos...'; 
                statusSpan.style.color = 'var(--primary-color)'; 
            }
            if (typeof window.showToast === 'function') {
                window.showToast('Subiendo archivos a Fia Records...', 'info');
            }

            // Preparar FormData para enviar al backend
            const formData = new FormData();
            
            // Agregar archivos
            for (let i = 0; i < files.length; i++) {
                formData.append('files', files[i]);
            }
            
            // Agregar metadatos
            formData.append('empresaId', empresaId);
            formData.append('artistaNombre', artistName);
            formData.append('proyectoNombre', projectName);
            formData.append('proyectoId', projectId || '');

            console.log(`[DriveManager] Enviando archivos al backend (empresaId: ${empresaId})...`);
            if (statusSpan) statusSpan.textContent = `Subiendo ${files.length} archivo(s) al servidor...`;

            // REGLA CRÍTICA: Usamos fetch directo para /api/drive/upload (no requiere auth token)
            // porque el archivo es FormData y el backend maneja su propia autenticación con Drive
            const response = await fetch('/api/drive/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Error en la subida');
            }

            const data = await response.json();
            console.log('[DriveManager] Respuesta del servidor:', data);

            if (!data.success) {
                throw new Error('La subida no fue exitosa');
            }

            const folderLink = data.folderLink;
            const uploadedFiles = data.files || [];

            if (linkInput) {
                linkInput.value = folderLink; 
                linkInput.style.borderColor = '#10b981'; 
            }
            
            if (statusSpan) { 
                statusSpan.textContent = '¡Subida exitosa! Guardando datos...'; 
                statusSpan.style.color = 'var(--success-color)'; 
            }

            // Guardar enlace en el proyecto
            if (typeof window.saveDeliveryLink === 'function' && projectId) {
                await window.saveDeliveryLink(false, folderLink, uploadedFiles);
            }
            
            // Notificación de éxito con SweetAlert
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: '¡Completado!',
                    text: `¡${files.length} archivo(s) subidos exitosamente a Drive de Fia Records!`,
                    confirmButtonText: 'Aceptar',
                    timer: 3000,
                    timerProgressBar: true
                });
            } else if (typeof window.showToast === 'function') {
                window.showToast(`¡Archivos subidos a Drive de Fia Records!`, 'success');
            }

            // Actualizar vistas si están activas
            if (document.getElementById('historial-proyectos')?.classList.contains('active') && typeof window.cargarHistorial === 'function') {
                window.cargarHistorial();
            }
            if (document.getElementById('vista-artista')?.classList.contains('active')) {
                const nombreEl = document.getElementById('vista-artista-nombre');
                if (nombreEl && typeof window.mostrarVistaArtista === 'function') {
                    const n = nombreEl.textContent;
                    const a = window.localCache?.artistas?.find(ar => ar.nombre === n || ar.nombreArtistico === n);
                    if (a) window.mostrarVistaArtista(a._id, n, ''); 
                }
            }
            
            // Limpiar el estado pendiente
            delete window.pendingDriveUpload;
            
        } catch (err) {
            console.error('[DriveManager] Error:', err);
            // Notificación de error con SweetAlert
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'Error en la subida',
                    text: err.message || 'No se pudieron subir los archivos. Intenta nuevamente.',
                    confirmButtonText: 'Entendido'
                });
            } else if (typeof window.showToast === 'function') {
                window.showToast('Error: ' + err.message, 'error');
            }
            if (statusSpan) { 
                statusSpan.textContent = 'Error en la subida.'; 
                statusSpan.style.color = 'var(--danger-color)'; 
            }
        } finally { 
            console.log('[DriveManager] Proceso de carga finalizado');
        }
    }

    // ==================================================================
    // 7. MODALES Y UI DE ENTREGA
    // ==================================================================

    /**
     * Abre el modal de entrega de archivos
     */
    function openDeliveryModal(projectId, artistName, projectName) { 
        const modalEl = document.getElementById('delivery-modal'); 
        if (!modalEl) return;
        
        modalEl.querySelector('#delivery-project-id').value = projectId; 
        modalEl.querySelector('#delivery-artist-name').value = artistName; 
        modalEl.querySelector('#delivery-project-name').value = projectName; 
        
        const inputLink = document.getElementById('delivery-link-input');
        const statusSpan = document.getElementById('drive-status');
        if (statusSpan) statusSpan.textContent = ''; 
        if (inputLink) inputLink.value = 'Buscando enlace...';

        let proyecto = null;
        if (window.localCache) {
            proyecto = window.localCache.proyectos?.find(p => p._id === projectId) || 
                      window.historialCacheados?.find(p => p._id === projectId);
        }
        
        // REGLA CRÍTICA: Usa fetchAPI para mantener Refresh Tokens
        if (typeof window.fetchAPI === 'function') {
            window.fetchAPI(`/api/proyectos/${projectId}`).then(data => {
                if (inputLink) {
                    if (data && data.enlaceEntrega) {
                        inputLink.value = data.enlaceEntrega;
                        if (proyecto) proyecto.enlaceEntrega = data.enlaceEntrega;
                    } else {
                        inputLink.value = '';
                    }
                }
            }).catch(() => {
                if (inputLink) {
                    inputLink.value = (proyecto && proyecto.enlaceEntrega) ? proyecto.enlaceEntrega : '';
                }
            });
        }
        
        const userInfo = typeof window.getUserRoleAndId === 'function' ? 
            window.getUserRoleAndId() : { role: null };
        const uploadBtn = document.getElementById('btn-drive-upload');
        const fileInput = document.getElementById('drive-file-input');
        
        if (userInfo.role === 'cliente') {
            if (uploadBtn) uploadBtn.style.display = 'none';
            if (fileInput && fileInput.parentElement) fileInput.parentElement.style.display = 'none';
        } else {
            if (uploadBtn) uploadBtn.style.display = 'block';
            if (fileInput && fileInput.parentElement) fileInput.parentElement.style.display = 'block';
            uploadBtn.onclick = subirADrive; 
        }

        // Usar Bootstrap si está disponible
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            new bootstrap.Modal(modalEl).show(); 
        }
    }

    /**
     * Cierra el modal de entrega
     */
    function closeDeliveryModal() { 
        const el = document.getElementById('delivery-modal'); 
        if (!el) return;
        
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            const modal = bootstrap.Modal.getInstance(el); 
            if (modal) modal.hide(); 
        } else {
            // Fallback: ocultar manualmente
            el.style.display = 'none';
            el.classList.remove('show');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
            document.body.classList.remove('modal-open');
        }
    }

    /**
     * Guarda el enlace de entrega en el proyecto
     * REGLA CRÍTICA: Usa fetchAPI para mantener Refresh Tokens
     */
    async function saveDeliveryLink(cerrarModal = true, enlaceDirecto = null, archivosUpload = null) { 
        const projectId = document.getElementById('delivery-project-id')?.value; 
        const enlace = enlaceDirecto !== null ? 
            enlaceDirecto : 
            document.getElementById('delivery-link-input')?.value; 
        
        if (!projectId || projectId === '' || projectId === 'null' || projectId === 'undefined') {
            console.error('[DriveManager] projectId no válido:', projectId);
            if (typeof window.showToast === 'function') {
                window.showToast('Error: No se pudo identificar el proyecto.', 'error');
            }
            return;
        }
        
        if (!enlace || enlace === '') {
            if (typeof window.showToast === 'function') {
                window.showToast('Error: No hay enlace para guardar.', 'error');
            }
            return;
        }
        
        const payload = { enlace };
        if (archivosUpload !== null) payload.archivos = archivosUpload;

        try { 
            console.log('[DriveManager] Guardando enlace para proyecto:', projectId);
            
            // REGLA CRÍTICA: Usa fetchAPI (de api.js) para mantener Refresh Tokens
            if (typeof window.fetchAPI !== 'function') {
                throw new Error('fetchAPI no está disponible. Asegúrate de cargar api.js antes que drive.js');
            }
            
            const result = await window.fetchAPI(`/api/proyectos/${projectId}/enlace-entrega`, { 
                method: 'PUT', 
                body: JSON.stringify(payload) 
            }); 
            
            // Actualizar caché local si existe
            if (window.localCache && window.localCache.proyectos) {
                const indexCache = window.localCache.proyectos.findIndex(p => p._id === projectId);
                if (indexCache !== -1) {
                    window.localCache.proyectos[indexCache].enlaceEntrega = enlace;
                    if (archivosUpload) {
                        window.localCache.proyectos[indexCache].archivos = archivosUpload;
                    }
                    if (typeof localforage !== 'undefined') {
                        localforage.setItem('cache_proyectos', window.localCache.proyectos);
                    }
                }
            }

            if (typeof window.historialCacheados !== 'undefined') {
                const indexHistorial = window.historialCacheados.findIndex(p => p._id === projectId);
                if (indexHistorial !== -1) {
                    window.historialCacheados[indexHistorial].enlaceEntrega = enlace;
                    if (archivosUpload) {
                        window.historialCacheados[indexHistorial].archivos = archivosUpload;
                    }
                }
            }

            if (typeof window.showToast === 'function') {
                window.showToast('Enlace guardado correctamente.', 'success'); 
            }
            
            if (document.getElementById('historial-proyectos')?.classList.contains('active') && typeof window.cargarHistorial === 'function') {
                window.cargarHistorial();
            }
            if (document.getElementById('vista-artista')?.classList.contains('active')) {
                const nombreEl = document.getElementById('vista-artista-nombre');
                if (nombreEl && typeof window.mostrarVistaArtista === 'function') {
                    const n = nombreEl.textContent;
                    const a = window.localCache?.artistas?.find(ar => ar.nombre === n || ar.nombreArtistico === n);
                    if (a) window.mostrarVistaArtista(a._id, n, ''); 
                }
            }
            
            if (cerrarModal) closeDeliveryModal(); 
        } catch (e) { 
            console.error('[DriveManager] Error completo:', e);
            if (e.message.includes('Unexpected token') || e.message.includes('<')) {
                if (typeof window.showToast === 'function') {
                    window.showToast('Error: El servidor no reconoce esta operación.', 'error');
                }
            } else {
                if (typeof window.showToast === 'function') {
                    window.showToast(`Error al guardar: ${e.message}`, 'error'); 
                }
            }
        } 
    }

    // ==================================================================
    // 8. UTILIDADES PARA VISUALIZACIÓN DE ARCHIVOS
    // ==================================================================

    /**
     * Formatea bytes a formato legible (KB, MB, GB)
     */
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Devuelve la clase de Bootstrap Icon según el tipo MIME o extensión
     */
    function getIconByMimeType(mimeType, nombre) {
        const nombreLow = (nombre || '').toLowerCase();
        const mime = (mimeType || '').toLowerCase();

        // Audio
        if (mime.includes('audio/') || nombreLow.match(/\.(mp3|wav|ogg|m4a|aac|flac|aiff|wma)$/)) {
            return 'bi-music-note-beamed text-info';
        }
        // Video
        if (mime.includes('video/') || nombreLow.match(/\.(mp4|mov|avi|mkv|webm|flv|wmv|mpg|mpeg)$/)) {
            return 'bi-play-btn text-danger';
        }
        // Imágenes
        if (mime.includes('image/') || nombreLow.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff|svg|ico)$/)) {
            return 'bi-image text-success';
        }
        // Comprimidos
        if (nombreLow.match(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz)$/)) {
            return 'bi-box-seam text-warning';
        }
        // PDF
        if (mime.includes('application/pdf') || nombreLow.endsWith('.pdf')) {
            return 'bi-file-pdf text-danger';
        }
        // Documentos de texto
        if (mime.includes('text/') || nombreLow.match(/\.(txt|rtf|doc|docx|odt|md|csv)$/)) {
            return 'bi-file-text text-secondary';
        }
        // Default
        return 'bi-file-earmark text-secondary';
    }

    // ==================================================================
    // 9. API PÚBLICA DEL MÓDULO
    // ==================================================================

    const DriveManager = {
        // Estado
        isReady: () => gapiInited && gisInited,
        gapiInited: () => gapiInited,
        gisInited: () => gisInited,
        
        // Inicialización
        init: startGoogleLibsCheck,
        
        // Carpetas
        buscarOCrearCarpeta,
        buscarOCrearCarpetaArtista,
        buscarOCrearCarpetaProyecto,
        hacerCarpetaPublica,
        obtenerCarpetaMaestra,
        obtenerCarpetaMaestraLegacy,
        obtenerNombreEmpresaActual,
        
        // Subida
        subirADrive,
        processDriveUpload,
        
        // Modales
        openDeliveryModal,
        closeDeliveryModal,
        saveDeliveryLink,
        
        // Utilidades
        formatBytes,
        getIconByMimeType,
        
        // Callback (expuesto para GIS)
        handleGoogleDriveCallback
    };

    // Exponer globalmente
    window.DriveManager = DriveManager;
    
    // También exponer funciones individuales para compatibilidad con código existente
    window.handleGoogleDriveCallback = handleGoogleDriveCallback;
    window.obtenerCarpetaMaestra = obtenerCarpetaMaestra;
    window.obtenerCarpetaMaestraLegacy = obtenerCarpetaMaestraLegacy;
    window.buscarOCrearCarpeta = buscarOCrearCarpeta;
    window.buscarOCrearCarpetaArtista = buscarOCrearCarpetaArtista;
    window.buscarOCrearCarpetaProyecto = buscarOCrearCarpetaProyecto;
    window.hacerCarpetaPublica = hacerCarpetaPublica;
    window.subirADrive = subirADrive;
    window.processDriveUpload = processDriveUpload;
    window.openDeliveryModal = openDeliveryModal;
    window.closeDeliveryModal = closeDeliveryModal;
    window.saveDeliveryLink = saveDeliveryLink;
    window.formatBytes = formatBytes;
    window.getIconByMimeType = getIconByMimeType;
    window.obtenerNombreEmpresaActual = obtenerNombreEmpresaActual;

    // Iniciar automáticamente
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startGoogleLibsCheck);
    } else {
        startGoogleLibsCheck();
    }

    if (window.Logger) Logger.debug('drive.js', 'Módulo cargado');

})();
