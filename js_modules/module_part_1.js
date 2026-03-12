document.addEventListener('DOMContentLoaded', () => {
    // ==================================================================
    // 1. VARIABLES GLOBALES Y CONFIGURACIÓN
    // ==================================================================
    
    const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    let horariosOcupadosDelDia = []; 

    let isInitialized = false;
    let proyectoActual = {};
    let logoBase64 = null; 
    let preseleccionArtistaId = null;

    // Estado de Paginación
    const paginationState = {
        artistas: { page: 1, limit: 10, filter: '' },
        servicios: { page: 1, limit: 10, filter: '' },
        usuarios: { page: 1, limit: 10, filter: '' }
    };

    const trashPagination = {
        proyectos: { page: 1, limit: 10 },
        artistas: { page: 1, limit: 10 },
        servicios: { page: 1, limit: 10 },
        usuarios: { page: 1, limit: 10 }
    };

    const tablePagination = {
        historial: { page: 1, limit: 10 },
        cotizaciones: { page: 1, limit: 10 },
        pagosPendientes: { page: 1, limit: 10 },
        pagosHistorial: { page: 1, limit: 10 }
    };

    // Configuración Google API
    const GAP_CONFIG = {
        apiKey: 'AIzaSyDaeTcNohqRxixSsAY58_pSyy62vsyJeXk',
        clientId: '769041146398-a0iqgdre2lrevbh1ud9i1mrs4v548rdq.apps.googleusercontent.com',
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
        scope: 'https://www.googleapis.com/auth/drive'
    };

    let tokenClient;
    let gapiInited = false;
    let gisInited = false;

    // Caché Local (Ahora se llenará de forma asíncrona desde IndexedDB)
    let localCache = {
        artistas: [],
        servicios: [],
        proyectos: [],
        cotizaciones: [],
        historial: [],
        pagos: [],
        usuarios: [],
        deudas: [], 
        trash: { proyectos: [], artistas: [], servicios: [], usuarios: [] } 
    };

    let currentCalendar = null;
    let configCache = null;
    let chartInstance = null;
    
    // Arrays temporales para tablas paginadas
    let historialCacheados = []; 
    let cotizacionesCacheadas = [];
    let pagosPendientesCacheados = [];
    let pagosHistorialCacheados = [];

    const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:5000'
        : '';

    const DOMElements = {
        loginContainer: document.getElementById('login-container'),
        appWrapper: document.getElementById('app-wrapper'),
        logoutButton: document.getElementById('logout-button'),
        welcomeUser: document.getElementById('welcome-user'),
        appLogo: document.getElementById('app-logo'),
        loginLogo: document.getElementById('login-logo'), 
        connectionStatus: document.getElementById('connection-status'),
        connectionText: document.getElementById('connection-text')
    };

    const PDF_DIMENSIONS = { WIDTH: 210, HEIGHT: 297, MARGIN: 14 };

    // ==================================================================
    // 2. UTILIDADES Y SISTEMA LOCAL (INDEXED-DB MIGRATION)
    // ==================================================================
    
    // Inicializar LocalForage (Base de datos local robusta)
    localforage.config({
        name: 'FiaRecordsApp',
        storeName: 'fia_cache'
    });

    async function cargarCacheDesdeIndexedDB() {
        try {
            const artistas = await localforage.getItem('cache_artistas');
            const servicios = await localforage.getItem('cache_servicios');
            const proyectos = await localforage.getItem('cache_proyectos');
            const pagos = await localforage.getItem('cache_pagos');
            const deudas = await localforage.getItem('cache_deudas');

            if(artistas) localCache.artistas = artistas;
            if(servicios) localCache.servicios = servicios;
            if(proyectos) localCache.proyectos = proyectos;
            if(pagos) localCache.pagos = pagos;
            if(deudas) localCache.deudas = deudas;

            console.log("📦 Caché local cargado desde IndexedDB");
        } catch (e) {
            console.error("Error leyendo IndexedDB:", e);
        }
    }

    function setupFooterYear() {
        const currentYear = new Date().getFullYear();
        document.querySelectorAll('.footer-year-span').forEach(el => {
            el.textContent = currentYear;
        });
    }

    function toggleTheme(isDark) {
        document.body.classList.toggle('dark-mode', isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light'); // El tema sí puede ir en localStorage (pesa 5 bytes)
        document.querySelectorAll('.theme-switch-checkbox').forEach(chk => {
            if (chk.checked !== isDark) {
                chk.checked = isDark;
            }
        });
    }

    function safeDate(dateStr) {
        if (!dateStr) return 'Sin fecha';
        try { return new Date(dateStr).toLocaleDateString(); } catch (e) { return 'Fecha inválida'; }
    }
    
    function safeMoney(amount) {
        if (typeof amount !== 'number') return '0.00';
        return amount.toFixed(2);
    }

    function safeString(str, defaultVal = '') {
        if (!str) return defaultVal;
        return escapeHTML(str);
    }

    function showToast(message, type = 'success') {
        const Toast = Swal.mixin({
            toast: true, position: 'top-end', showConfirmButton: false, timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer)
                toast.addEventListener('mouseleave', Swal.resumeTimer)
            }
        });
        Toast.fire({ icon: type === 'info' ? 'info' : type, title: message });
    }

    async function fetchPublicLogo() {
        try {
            const res = await fetch(`${API_URL}/api/configuracion/public/logo`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.logoBase64) {
                    const logoSrc = data.logoBase64;
                    if(document.getElementById('login-logo')) document.getElementById('login-logo').src = logoSrc;
                    if(document.getElementById('app-logo')) document.getElementById('app-logo').src = logoSrc;
                    logoBase64 = logoSrc;
                    await localforage.setItem('cached_logo_path', logoSrc);
                }
                if (data && data.faviconBase64) {
                    let link = document.querySelector("link[rel~='icon']");
                    if (!link) {
                        link = document.createElement('link');
                        link.rel = 'icon';
                        document.head.appendChild(link);
                    }
                    link.href = data.faviconBase64;
                    await localforage.setItem('cached_favicon_path', data.faviconBase64);
                }
            }
        } catch (e) { console.warn("Error cargando config pública", e); }
    }

    function getUserRoleAndId() {
        const token = localStorage.getItem('token'); // Token va en localStorage para persistir sesión fácil
        if (!token) return { role: null, id: null, artistaId: null };
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return { 
                role: payload.role ? payload.role.toLowerCase() : 'cliente',
                id: payload.id,
                artistaId: payload.artistaId,
                username: payload.username
            };
        } catch (e) {
            return { role: null, id: null, artistaId: null };
        }
    }

    function escapeHTML(str) { if (!str) return ''; return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])); }
    function showLoader() { const l = document.getElementById('loader-overlay'); if(l) l.style.display = 'flex'; }
    function hideLoader() { const l = document.getElementById('loader-overlay'); if(l) l.style.display = 'none'; }
    
    async function preloadLogoForPDF() {
        if (logoBase64) return;
        const appLogo = document.getElementById('app-logo');
        if(appLogo && appLogo.src.startsWith('data:image')) {
            logoBase64 = appLogo.src;
        } else {
             await fetchPublicLogo();
        }
    }

    async function loadInitialConfig() {
        try {
            const config = await fetchAPI('/api/configuracion');
            if (config) { configCache = config; if(config.logoBase64) logoBase64 = config.logoBase64; }
        } catch (e) { configCache = {}; }
    }

    // ==================================================================
    // 3. OFFLINE MANAGER (AHORA CON INDEXED DB)
    // ==================================================================
    const OfflineManager = {
        QUEUE_KEY: 'fia_offline_queue',
        
        getQueue: async () => {
            const queue = await localforage.getItem(OfflineManager.QUEUE_KEY);
            return queue || [];
        },

        addToQueue: async (url, options, tempId = null) => {
            const queue = await OfflineManager.getQueue();
            queue.push({ url, options, timestamp: Date.now(), tempId });
            await localforage.setItem(OfflineManager.QUEUE_KEY, queue);
            OfflineManager.updateIndicator();
        },

        updateIndicator: async () => {
            const queue = await OfflineManager.getQueue();
            if (navigator.onLine) {
                if (queue.length > 0) {
                    DOMElements.connectionStatus.className = 'connection-status status-syncing';
                    DOMElements.connectionText.textContent = `Sincronizando (${queue.length})`;
                    OfflineManager.sync();
                } else {
                    DOMElements.connectionStatus.className = 'connection-status status-online';
                    DOMElements.connectionText.textContent = 'En Línea';
                }
            } else {
                DOMElements.connectionStatus.className = 'connection-status status-offline';
                DOMElements.connectionText.textContent = queue.length > 0 ? `Offline (${queue.length})` : 'Modo Offline';
            }
        },

        sync: async () => {
            const queue = await OfflineManager.getQueue();
            if (queue.length === 0) return;
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
            let newQueue = [];
            
            for (const req of queue) {
                try {
                    let bodyObj = req.options.body ? JSON.parse(req.options.body) : {};
                    if (bodyObj._id && bodyObj._id.startsWith('temp_')) delete bodyObj._id;
                    const res = await fetch(req.url, { ...req.options, body: JSON.stringify(bodyObj), headers: { ...req.options.headers, ...headers } });
                    if (!res.ok) throw new Error('Failed');
                } catch (e) { 
                    newQueue.push(req); // Si falla (ej. internet intermitente), lo devuelve a la cola
                }
            }
            
            await localforage.setItem(OfflineManager.QUEUE_KEY, newQueue);
            
            if (newQueue.length === 0) {
                showToast('Sincronización completada', 'success');
                // Recargamos todos los cachés
                await Promise.all([
                    fetchAPI('/api/proyectos'), 
                    fetchAPI('/api/artistas'), 
                    fetchAPI('/api/servicios'),
                    fetchAPI('/api/deudas')
                ]);
                const currentHash = location.hash.replace('#', '');
                if (currentHash && window.app.mostrarSeccion) window.app.mostrarSeccion(currentHash, false);
            }
            OfflineManager.updateIndicator();
        },
        syncNow: () => { if (navigator.onLine) OfflineManager.sync(); }
    };

    // ==================================================================
    // 4. FETCH API
    // ==================================================================
    async function fetchAPI(url, options = {}) {
        if (!url.startsWith('/') && !url.startsWith('http')) { url = '/' + url; }
        const token = localStorage.getItem('token');
        const isPublic = url.includes('/auth/') || url.includes('/configuracion/public'); 

        if (!token && !isPublic) { 
            showLogin(); 
            throw new Error('No autenticado'); 
        }

        const headers = { 'Authorization': `Bearer ${token}` };
        if (!options.isFormData) { headers['Content-Type'] = 'application/json'; }

        // --- MODO OFFLINE (LECTURA DE CACHÉ) ---
        if ((!options.method || options.method === 'GET')) {
            if (!navigator.onLine) {
                if (url === '/api/artistas') return localCache.artistas;
                if (url === '/api/servicios') return localCache.servicios;
                if (url === '/api/usuarios') return localCache.usuarios;
                if (url === '/api/deudas') return localCache.deudas;
                if (url.includes('/proyectos')) {
                    if (url.includes('cotizaciones')) return localCache.proyectos.filter(p => p.estatus === 'Cotizacion' && !p.deleted);
                    if (url.includes('completos')) return localCache.proyectos.filter(p => (p.proceso === 'Completo' || p.estatus === 'Cancelado') && !p.deleted);
                    if (url.includes('agenda')) return localCache.proyectos.filter(p => p.estatus !== 'Cancelado' && !p.deleted).map(p => ({ id: p._id, title: p.nombreProyecto || (p.artista ? p.artista.nombre : 'Proyecto'), start: p.fecha, allDay: false, extendedProps: { ...p, servicios: p.items.map(i => i.nombre).join('\n') } }));
                    if (url.includes('papelera')) return localCache.proyectos.filter(p => p.deleted === true);
                    return localCache.proyectos.filter(p => !p.deleted);
                }
                if (url === '/api/pagos/todos') return localCache.pagos;
                if (url === '/api/dashboard/stats') return { showFinancials: false, ingresosMes: 0, proyectosActivos: 0, proyectosPorCobrar: 0, monthlyIncome: [] };
            }
        }

        // --- MODO OFFLINE (ESCRITURA A COLA) ---
        if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method)) {
             if (!navigator.onLine) {
                const tempId = `temp_${Date.now()}`;
                OfflineManager.addToQueue(`${API_URL}${url}`, { ...options, headers }, tempId);
                return { ok: true, offline: true, _id: tempId };
            }
        }

        if(!url.includes('/configuracion')) showLoader();
        
        try {
            const res = await fetch(`${API_URL}${url}`, { ...options, headers });
            
            if (res.status === 401 && !isPublic) { showLogin(); throw new Error('Sesión expirada.'); }
            if (res.status === 401 && url.includes('/configuracion')) { return null; }
            if (res.status === 204) return { ok: true };
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error del servidor');

            // --- ACTUALIZAR CACHÉ INDEXED-DB SI HAY INTERNET ---
            if (!options.method || options.method === 'GET') {
                if (url === '/api/artistas') { localCache.artistas = Array.isArray(data) ? data : []; await localforage.setItem('cache_artistas', localCache.artistas); }
                if (url === '/api/servicios') { localCache.servicios = data; await localforage.setItem('cache_servicios', data); }
                if (url === '/api/usuarios') { localCache.usuarios = data; }
                if (url === '/api/proyectos') { localCache.proyectos = data; await localforage.setItem('cache_proyectos', data); }
                if (url === '/api/pagos/todos') { localCache.pagos = data; await localforage.setItem('cache_pagos', data); }
                if (url === '/api/deudas') { localCache.deudas = data; await localforage.setItem('cache_deudas', data); }
            }
            return data;
        } catch (e) { throw e; } finally { hideLoader(); }
    }

    // ==================================================================
    // 5. GOOGLE DRIVE Y REPRODUCTOR
    // ==================================================================
    window.initializeGapiClient = function() {
        gapi.load('client', async () => {
            try { await gapi.client.init({ apiKey: GAP_CONFIG.apiKey, discoveryDocs: GAP_CONFIG.discoveryDocs }); gapiInited = true; } catch (error) { console.error("Error init GAPI", error); }
        });
    }

    window.initializeGisClient = function() {
        try { 
            tokenClient = google.accounts.oauth2.initTokenClient({ 
                client_id: GAP_CONFIG.clientId, 
                scope: GAP_CONFIG.scope, 
                callback: '',
                prompt: '' 
            }); 
            gisInited = true; 
        } catch (error) { console.error("Error init GIS", error); }
    }

    let checkGoogleLibsInterval = setInterval(() => {
        if (typeof gapi !== 'undefined' && !gapiInited) { initializeGapiClient(); }
        if (typeof google !== 'undefined' && !gisInited) { initializeGisClient(); }
        if (gapiInited && gisInited) { clearInterval(checkGoogleLibsInterval); }
    }, 500);

    async function obtenerCarpetaMaestra() {
        const nombreMaestra = "FIA_RECORDS_STUDIO";
        const q = `mimeType='application/vnd.google-apps.folder' and name='${nombreMaestra}' and trashed=false and 'root' in parents`;
        try {
            const response = await gapi.client.drive.files.list({ q: q, fields: 'files(id, name)' });
            const files = response.result.files;
            if (files && files.length > 0) { return files[0].id; } 
            else {
                const fileMetadata = { 'name': nombreMaestra, 'mimeType': 'application/vnd.google-apps.folder' };
                const createRes = await gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
                return createRes.result.id;
            }
        } catch (err) { throw new Error('Error de conexión con Drive.'); }
    }

    async function buscarOCrearCarpetaArtista(nombreArtista, idMaestra) {
        const q = `mimeType='application/vnd.google-apps.folder' and name='${nombreArtista}' and trashed=false and '${idMaestra}' in parents`;
        try {
            const response = await gapi.client.drive.files.list({ q: q, fields: 'files(id, name)' });
            const files = response.result.files;
            if (files && files.length > 0) { return files[0].id; } 
            else {
                const fileMetadata = { 'name': nombreArtista, 'mimeType': 'application/vnd.google-apps.folder', 'parents':[idMaestra] };
                const createRes = await gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
                return createRes.result.id;
            }
        } catch (err) { throw new Error('No se pudo crear la carpeta del artista.'); }
    }

    async function buscarOCrearCarpetaProyecto(nombreProyecto, idCarpetaArtista) {
        const nombreLimpio = nombreProyecto.trim() || "Proyecto Sin Nombre";
        const q = `mimeType='application/vnd.google-apps.folder' and name='${nombreLimpio}' and trashed=false and '${idCarpetaArtista}' in parents`;
        try {
            const response = await gapi.client.drive.files.list({ q: q, fields: 'files(id, name)' });
            const files = response.result.files;
            if (files && files.length > 0) { return files[0].id; } 
            else {
                const fileMetadata = { 'name': nombreLimpio, 'mimeType': 'application/vnd.google-apps.folder', 'parents': [idCarpetaArtista] };
                const createRes = await gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
                return createRes.result.id;
            }
        } catch (err) { throw new Error('No se pudo crear la carpeta del proyecto.'); }
    }

    async function hacerCarpetaPublica(fileId) {
        try {
            await gapi.client.drive.permissions.create({
                fileId: fileId,
                resource: { role: 'reader', type: 'anyone' }
            });
        } catch (error) { console.error("Error permisos carpeta:", error); }
    }

    async function subirADrive() {
        if (!gapiInited || !gisInited) {
            if(typeof gapi !== 'undefined') initializeGapiClient();
            if(typeof google !== 'undefined') initializeGisClient();
            return showToast('Cargando servicios de Google... Intenta de nuevo en 5 segundos.', 'info');
        }
        
        const fileInput = document.getElementById('drive-file-input');
        if (!fileInput || fileInput.files.length === 0) return showToast('Selecciona al menos un archivo.', 'warning');
        
        const files = fileInput.files; 
        const artistName = document.getElementById('delivery-artist-name').value || 'General';
        const projectName = document.getElementById('delivery-project-name').value || 'Sin Nombre';
        const statusSpan = document.getElementById('drive-status');
        const linkInput = document.getElementById('delivery-link-input');

        tokenClient.callback = async (resp) => {
            if (resp.error) throw resp;
            try {
                if(statusSpan) { statusSpan.textContent = 'Organizando carpetas...'; statusSpan.style.color = 'var(--primary-color)'; }
                showLoader();

                const idMaestra = await obtenerCarpetaMaestra();
                const idArtista = await buscarOCrearCarpetaArtista(artistName, idMaestra);
                await hacerCarpetaPublica(idArtista); 

                if(statusSpan) statusSpan.textContent = `Creando carpeta: ${projectName}...`;
                const idProyecto = await buscarOCrearCarpetaProyecto(projectName, idArtista);
                
                await hacerCarpetaPublica(idProyecto);

                if(statusSpan) statusSpan.textContent = 'Generando enlace...';
                const getFolderRes = await gapi.client.drive.files.get({ fileId: idProyecto, fields: 'webViewLink' });
                const folderLink = getFolderRes.result.webViewLink;

                const accessToken = gapi.client.getToken().access_token;
                
                const uploadedFiles = [];

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if(statusSpan) statusSpan.textContent = `Subiendo ${i + 1} de ${files.length}: "${file.name}"...`;
                    const metadata = { 'name': file.name, 'parents': [idProyecto] };
                    const form = new FormData();
                    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                    form.append('file', file);
                    
                    const resUpload = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
                        method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }), body: form
                    });
                    
                    const fileData = await resUpload.json();
                    
                    const nombreLow = file.name.toLowerCase();
                    let tipoArchivo = 'otro';
                    if (nombreLow.match(/\.(mp3|wav|ogg|m4a|aac)$/)) tipoArchivo = 'audio';
                    else if (nombreLow.match(/\.(mp4|mov|avi|mkv|webm)$/)) tipoArchivo = 'video';
                    else if (nombreLow.match(/\.(jpg|jpeg|png|gif|webp)$/)) tipoArchivo = 'imagen';

                    if(tipoArchivo !== 'otro') {
                        uploadedFiles.push({
                            nombre: file.name,
                            driveId: fileData.id,
                            urlDirecta: `https://drive.google.com/file/d/${fileData.id}/preview`,
                            tipo: tipoArchivo
                        });
                    }
                }

                if(linkInput) {
                    linkInput.value = folderLink; 
                    linkInput.style.borderColor = '#10b981'; 
                }
                
                if(statusSpan) { statusSpan.textContent = '¡Listo! Guardando datos...'; statusSpan.style.color = 'var(--success-color)'; }

                await saveDeliveryLink(false, folderLink, uploadedFiles); 
                
                showToast(`¡Archivos subidos y reproductor actualizado!`, 'success');

                if (document.getElementById('historial-proyectos').classList.contains('active')) cargarHistorial();
                if (document.getElementById('vista-artista').classList.contains('active')) {
                    const nombreEl = document.getElementById('vista-artista-nombre');
                    if (nombreEl) {
                        const n = nombreEl.textContent;
                        const a = localCache.artistas.find(ar => ar.nombre === n || ar.nombreArtistico === n);
                        if(a) mostrarVistaArtista(a._id, n, ''); 
                    }
                }
            } catch (err) {
                console.error(err);
                showToast('Error: ' + err.message, 'error');
                if(statusSpan) { statusSpan.textContent = 'Error en la subida.'; statusSpan.style.color = 'var(--danger-color)'; }
            } finally { hideLoader(); }
        };

        if (gapi.client.getToken() === null) { tokenClient.requestAccessToken({prompt: ''}); } 
        else { tokenClient.requestAccessToken({prompt: ''}); }
    }

    function openDeliveryModal(projectId, artistName, projectName) { 
        const modalEl = document.getElementById('delivery-modal'); 
        modalEl.querySelector('#delivery-project-id').value = projectId; 
        modalEl.querySelector('#delivery-artist-name').value = artistName; 
        modalEl.querySelector('#delivery-project-name').value = projectName; 
        
        const inputLink = document.getElementById('delivery-link-input');
        document.getElementById('drive-status').textContent = ''; 
        inputLink.value = 'Buscando enlace...';

        let proyecto = localCache.proyectos.find(p => p._id === projectId) || historialCacheados.find(p => p._id === projectId);
        
        fetchAPI(`/api/proyectos/${projectId}`).then(data => {
            if(data && data.enlaceEntrega) {
                inputLink.value = data.enlaceEntrega;
                if(proyecto) proyecto.enlaceEntrega = data.enlaceEntrega;
            } else {
                inputLink.value = '';
            }
        }).catch(() => {
            inputLink.value = (proyecto && proyecto.enlaceEntrega) ? proyecto.enlaceEntrega : '';
        });
        
        const userInfo = getUserRoleAndId();
        const uploadBtn = document.getElementById('btn-drive-upload');
        const fileInput = document.getElementById('drive-file-input');
        
        if (userInfo.role === 'cliente') {
            if(uploadBtn) uploadBtn.style.display = 'none';
            if(fileInput && fileInput.parentElement) fileInput.parentElement.style.display = 'none';
        } else {
             if(uploadBtn) uploadBtn.style.display = 'block';
             if(fileInput && fileInput.parentElement) fileInput.parentElement.style.display = 'block';
             uploadBtn.onclick = subirADrive; 
        }

        new bootstrap.Modal(modalEl).show(); 
    }

    function closeDeliveryModal() { const el = document.getElementById('delivery-modal'); const modal = bootstrap.Modal.getInstance(el); if (modal) modal.hide(); }

    async function saveDeliveryLink(cerrarModal = true, enlaceDirecto = null, archivosUpload = null) { 
        const projectId = document.getElementById('delivery-project-id').value; 
        const enlace = enlaceDirecto !== null ? enlaceDirecto : document.getElementById('delivery-link-input').value; 
        
        const payload = { enlace };
        if (archivosUpload !== null) payload.archivos = archivosUpload;

        try { 
            const result = await fetchAPI(`/api/proyectos/${projectId}/enlace-entrega`, { 
                method: 'PUT', 
                body: JSON.stringify(payload) 
            }); 
            
            const indexCache = localCache.proyectos.findIndex(p => p._id === projectId);
            if (indexCache !== -1) {
                localCache.proyectos[indexCache] = result;
                await localforage.setItem('cache_proyectos', localCache.proyectos);
            }

            const indexHistorial = historialCacheados.findIndex(p => p._id === projectId);
            if (indexHistorial !== -1) historialCacheados[indexHistorial] = result;

            showToast('Enlace guardado correctamente.', 'success'); 
            
            if (document.getElementById('historial-proyectos').classList.contains('active')) cargarHistorial();
            if (document.getElementById('vista-artista').classList.contains('active')) {
                const nombreEl = document.getElementById('vista-artista-nombre');
                if (nombreEl) {
                    const n = nombreEl.textContent;
                    const a = localCache.artistas.find(ar => ar.nombre === n || ar.nombreArtistico === n);
                    if(a) mostrarVistaArtista(a._id, n, ''); 
                }
            }
            if (cerrarModal) closeDeliveryModal(); 
        } catch (e) { showToast(`Error al guardar: ${e.message}`, 'error'); } 
    }

    function openPlayer(projectId) {
        let proj = localCache.proyectos.find(p => p._id === projectId) || historialCacheados.find(p => p._id === projectId);

        if (!proj || (!proj.archivos && !proj.enlaceEntrega)) {
            fetchAPI(`/api/proyectos/${projectId}`).then(data => { renderPlayerUI(data); }).catch(e => showToast('Error cargando proyecto', 'error'));
        } else {
            renderPlayerUI(proj);
        }
    }

    function renderPlayerUI(proj) {
        document.getElementById('player-project-name').textContent = proj.nombreProyecto || 'Proyecto';
        const playlist = document.getElementById('playlist-container');
        const container = document.getElementById('media-container');
        
        container.innerHTML = '<div class="text-muted small">Cargando...</div>';
        document.getElementById('current-track-name').textContent = 'Selecciona un archivo';

        let htmlList = '';
        let hasPlayableItems = false;

        if(proj.archivos && proj.archivos.length > 0) {
            htmlList += proj.archivos.map(file => {
                let icon = 'bi-file-earmark';
                if (file.tipo === 'audio') icon = 'bi-music-note-beamed text-info';
                if (file.tipo === 'video') icon = 'bi-film text-danger';
                if (file.tipo === 'imagen') icon = 'bi-image text-success';
                
                const urlToUse = file.urlDirecta || file.url; 

                return `
                <button class="list-group-item list-group-item-action text-white border-bottom border-secondary track-btn d-flex align-items-center" 
                        style="background-color: transparent;" 
                        onclick="app.playMedia('${urlToUse}', '${escapeHTML(file.nombre)}', '${file.tipo}', this)">
                    <i class="bi ${icon} me-3 fs-5"></i> 
                    <span class="text-truncate">${escapeHTML(file.nombre)}</span>
                </button>`;
            }).join('');
            hasPlayableItems = true;
        }

        if (!hasPlayableItems && proj.enlaceEntrega) {
            htmlList = `
            <div class="p-4 text-center">
                <p class="text-muted small mb-3">No hay archivos listados, pero existe una carpeta de Drive.</p>
                <button class="btn btn-outline-info btn-sm w-100 mb-3" onclick="app.sincronizarArchivosDrive('${proj._id}')">
                    <i class="bi bi-arrow-repeat"></i> Sincronizar desde Drive
                </button>
                <a href="${proj.enlaceEntrega}" target="_blank" class="btn btn-outline-secondary btn-sm w-100">
                    <i class="bi bi-folder"></i> Abrir Carpeta Original
                </a>
            </div>`;
        } else if (!hasPlayableItems && !proj.enlaceEntrega) {
             htmlList = '<div class="p-3 text-center text-muted small border-top border-secondary">No hay contenido multimedia ni enlaces.</div>';
        }

        playlist.innerHTML = htmlList;
        
        if(hasPlayableItems) {
            setTimeout(() => { const firstBtn = playlist.querySelector('.track-btn'); if(firstBtn) firstBtn.click(); }, 300);
        } else {
             container.innerHTML = `<div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted small">
                <i class="bi bi-music-note-list fs-1 mb-2"></i>
                Sin archivos para reproducir
             </div>`;
        }

        new bootstrap.Modal(document.getElementById('player-modal')).show();
    }

    async function sincronizarArchivosDrive(projectId) {
        let proj = localCache.proyectos.find(p => p._id === projectId) || historialCacheados.find(p => p._id === projectId);
        if (!proj || !proj.enlaceEntrega) return showToast('No hay enlace de Drive para sincronizar.', 'error');

        let folderId = null;
        if (proj.enlaceEntrega.includes('id=')) {
            folderId = proj.enlaceEntrega.split('id=')[1].split('&')[0];
        } else if (proj.enlaceEntrega.includes('/folders/')) {
            folderId = proj.enlaceEntrega.split('/folders/')[1].split('?')[0].split('/')[0];
        } else if (proj.enlaceEntrega.includes('/drive/u/0/folders/')) {
             folderId = proj.enlaceEntrega.split('/folders/')[1].split('?')[0];
        }

        if (!folderId) return showToast('No se pudo identificar el ID de la carpeta.', 'error');

        if (!gapiInited) {
            if(typeof gapi !== 'undefined') initializeGapiClient();
             return showToast('Conectando con Google... Intenta de nuevo.', 'info');
        }

        showLoader();
        try {
            const response = await gapi.client.drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType)'
            });

            const files = response.result.files;
            if (!files || files.length === 0) {
                hideLoader();
                return showToast('La carpeta de Drive está vacía.', 'warning');
            }

            const archivosDetectados = [];
            
            files.forEach(file => {
                const nombreLow = file.name.toLowerCase();
                let tipoArchivo = 'otro';
                if (nombreLow.match(/\.(mp3|wav|ogg|m4a|aac)$/) || file.mimeType.includes('audio')) tipoArchivo = 'audio';
                else if (nombreLow.match(/\.(mp4|mov|avi|mkv|webm)$/) || file.mimeType.includes('video')) tipoArchivo = 'video';
                else if (nombreLow.match(/\.(jpg|jpeg|png|gif|webp)$/) || file.mimeType.includes('image')) tipoArchivo = 'imagen';

                if (tipoArchivo !== 'otro') {
                    archivosDetectados.push({
                        nombre: file.name,
                        driveId: file.id,
                        urlDirecta: `https://drive.google.com/file/d/${file.id}/preview`,
                        tipo: tipoArchivo
                    });
                }
            });

            if (archivosDetectados.length === 0) {
                hideLoader();
                return showToast('No se encontraron archivos multimedia compatibles en la carpeta.', 'info');
            }

            const modalEl = document.getElementById('delivery-modal');
            modalEl.querySelector('#delivery-project-id').value = projectId;
            
            await saveDeliveryLink(false, proj.enlaceEntrega, archivosDetectados);

            proj.archivos = archivosDetectados;
            
            bootstrap.Modal.getInstance(document.getElementById('player-modal')).hide();
            setTimeout(() => {
                openPlayer(projectId);
                showToast(`¡Sincronizado! ${archivosDetectados.length} archivos encontrados.`, 'success');
            }, 500);

        } catch (e) {
            console.error(e);
            showToast('Error al leer carpeta de Drive. Verifica permisos o login.', 'error');
            if(tokenClient) tokenClient.requestAccessToken({prompt: ''});
        } finally {
            hideLoader();
        }
    }

    function playMedia(url, name, tipo, btnElement) {
        document.getElementById('current-track-name').textContent = name;
        const container = document.getElementById('media-container');
        
        container.innerHTML = '';

        let iframeUrl = url;
        let isFolder = false;
        let fileId = null;
        
        if (url.includes('/folders/')) {
            isFolder = true;
            fileId = url.split('/folders/')[1].split('?')[0].split('/')[0];
        } else if (url.includes('id=')) {
            fileId = url.split('id=')[1].split('&')[0];
        } else if (url.includes('/d/')) {
            fileId = url.split('/d/')[1].split('/')[0];
        }

        if (fileId && !isFolder) {
            iframeUrl = `https://drive.google.com/file/d/${fileId}/preview`;
        }

        if (isFolder) {
            container.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center h-100 p-4 text-center">
                    <i class="bi bi-folder-fill text-warning mb-3" style="font-size: 4rem;"></i>
                    <h5 class="text-white">Carpeta de Archivos</h5>
                    <p class="text-muted small">Por políticas de Google, las carpetas completas deben abrirse en una pestaña nueva.</p>
                    <a href="${url}" target="_blank" class="btn btn-primary mt-2">
                        <i class="bi bi-box-arrow-up-right"></i> Abrir en Drive
                    </a>
                </div>
            `;
        } else {
            container.innerHTML = `
                <iframe 
                    src="${iframeUrl}" 
                    width="100%" 
                    height="100%" 
                    style="border: none; border-radius: 10px; min-height: 400px; background-color: #000;" 
                    allow="autoplay; fullscreen">
                </iframe>
            `;
        }

        document.querySelectorAll('.track-btn').forEach(b => {
            b.classList.remove('active', 'bg-primary');
            b.style.backgroundColor = 'transparent';
        });
        if(btnElement) {
            btnElement.classList.add('active', 'bg-primary');
            btnElement.style.backgroundColor = 'var(--primary-color)';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const modalEl = document.getElementById('player-modal');
        if(modalEl) {
            modalEl.addEventListener('hidden.bs.modal', () => {
                document.getElementById('media-container').innerHTML = '<div class="text-muted small">Cargando reproductor...</div>';
            });
        }
    });

    // ==================================================================
    // 6. DASHBOARD SEGURO
    // ==================================================================
    async function cargarDashboard() { 
        try { 
            const stats = await fetchAPI('/api/dashboard/stats'); 
            const kpi