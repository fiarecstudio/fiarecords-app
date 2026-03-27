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

    const API_URL = 'http://localhost:5000';

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
            if (config) { 
                configCache = config; 
                if(config.logoBase64) logoBase64 = config.logoBase64; 
            }
        } catch (e) { 
            // EL CAMBIO ESTÁ AQUÍ: Asignamos null en lugar de {}
            configCache = null; 
        }
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
            const kpiIngresos = document.getElementById('kpi-ingresos-mes');
            const cardIngresos = kpiIngresos ? kpiIngresos.closest('.card') : null;
            const chartContainer = document.getElementById('incomeChart').parentElement.parentElement; 

            if (stats.showFinancials === false) {
                if(cardIngresos) cardIngresos.style.display = 'none';
                if(chartContainer) chartContainer.style.display = 'none';
            } else {
                if(cardIngresos) cardIngresos.style.display = 'block';
                if(chartContainer) chartContainer.style.display = 'block';
                
                kpiIngresos.textContent = `$${safeMoney(stats.ingresosMes)}`;
                
                const ctx = document.getElementById('incomeChart').getContext('2d'); 
                if (chartInstance) chartInstance.destroy(); 
                const labels =['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']; 
                const dataValues = stats.monthlyIncome || Array(12).fill(0); 
                chartInstance = new Chart(ctx, { 
                    type: 'line', 
                    data: { labels: labels, datasets:[{ label: 'Ingresos ($)', data: dataValues, borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.2)', fill: true, tension: 0.4 }] }, 
                    options: { responsive: true, maintainAspectRatio: false } 
                });
            }
            document.getElementById('kpi-proyectos-activos').textContent = stats.proyectosActivos || 0; 
            document.getElementById('kpi-proyectos-por-cobrar').textContent = stats.proyectosPorCobrar || 0; 
        } catch (e) { console.error("Error cargando dashboard:", e); } 
    }

    // ==================================================================
    // 7. GESTIÓN DE PROYECTOS Y AGENDA
    // ==================================================================
    
    async function verificarDisponibilidad() {
        const fechaInput = document.getElementById('fechaProyecto');
        const horaSelect = document.getElementById('horaProyecto');
        const alertaDiv = document.getElementById('alerta-disponibilidad');

        let fecha = fechaInput.value;
        if(fechaInput._flatpickr && fechaInput._flatpickr.selectedDates[0]) {
             const d = fechaInput._flatpickr.selectedDates[0];
             const year = d.getFullYear();
             const month = String(d.getMonth() + 1).padStart(2, '0');
             const day = String(d.getDate()).padStart(2, '0');
             fecha = `${year}-${month}-${day}`;
        }

        if (!fecha) {
            horaSelect.innerHTML = '<option value="">← Primero elige una fecha</option>';
            horaSelect.disabled = true;
            return;
        }

        horaSelect.innerHTML = '<option value="">Buscando horarios...</option>';
        horaSelect.disabled = true;
        alertaDiv.style.display = 'none';

        try {
            const horariosDisponibles = await fetchAPI(`/api/proyectos/disponibilidad?fecha=${fecha}`);
            
            horaSelect.innerHTML = ''; 

            if (horariosDisponibles.length === 0) {
                horaSelect.innerHTML = '<option value="">No hay horarios / Día Cerrado</option>';
                alertaDiv.textContent = 'Lo sentimos, no hay cupo disponible o el estudio no abre este día.';
                alertaDiv.style.display = 'block';
            } else {
                const defaultOp = document.createElement('option');
                defaultOp.value = ""; defaultOp.textContent = "-- Selecciona Hora --";
                horaSelect.appendChild(defaultOp);

                horariosDisponibles.forEach(hora => {
                    const option = document.createElement('option');
                    option.value = hora;
                    option.textContent = `${hora} hrs - Disponible`;
                    horaSelect.appendChild(option);
                });
                horaSelect.disabled = false;
            }

        } catch (e) { 
            console.error("Error verificando disponibilidad", e); 
            horaSelect.innerHTML = '<option value="">Error de conexión</option>';
        }
    }

    async function cargarOpcionesParaSelect(url, selectId, valueField, textFieldFn, addPublicoGeneral = false, currentValue = null) { 
        const select = document.getElementById(selectId); 
        try { 
            const data = await fetchAPI(url); 
            select.innerHTML = ''; 
            if (addPublicoGeneral) { const op = document.createElement('option'); op.value = 'publico_general'; op.textContent = 'Público General'; select.appendChild(op); } 
            const user = getUserRoleAndId();
            data.forEach(item => { 
                if (selectId === 'proyectoServicio' && user.role === 'cliente') { if (item.visible === false) return; }
                const option = document.createElement('option'); option.value = item[valueField]; option.textContent = textFieldFn(item); option.dataset.precio = item.precio || 0; select.appendChild(option); 
            }); 
            if (selectId === 'proyectoArtista' && preseleccionArtistaId) { select.value = preseleccionArtistaId; preseleccionArtistaId = null; } 
            else if (currentValue) { select.value = currentValue; } 
        } catch (error) { select.innerHTML = `<option value="">Error al cargar datos</option>`; } 
    }

    const cargarOpcionesParaProyecto = () => {
        const userInfo = getUserRoleAndId();
        const esCliente = userInfo.role === 'cliente';
        const artistaSelectContainer = document.querySelector('#proyectoArtista').parentElement;
        const btnNuevoArtista = document.getElementById('btnNuevoArtista');
        const containerDescuento = document.getElementById('containerDescuento');
        const btnGenerarCotizacion = document.getElementById('btnGenerarCotizacion');

        if (esCliente) {
            artistaSelectContainer.style.display = 'none';
            if (btnNuevoArtista) btnNuevoArtista.style.display = 'none';
            if(containerDescuento) { containerDescuento.classList.remove('d-flex'); containerDescuento.classList.add('d-none'); }
            document.getElementById('proyectoDescuento').value = 0;
            if(btnGenerarCotizacion) { btnGenerarCotizacion.classList.add('d-none'); }
            const select = document.getElementById('proyectoArtista');
            select.innerHTML = `<option value="${userInfo.artistaId}" selected>${userInfo.username}</option>`;
            if (!document.getElementById('info-artista-cliente')) {
                 const infoArtistaEl = document.createElement('p'); infoArtistaEl.innerHTML = `Registrando proyecto para: <strong>${userInfo.username}</strong>`; infoArtistaEl.id = 'info-artista-cliente'; infoArtistaEl.className = 'alert alert-info py-2'; artistaSelectContainer.parentElement.insertBefore(infoArtistaEl, artistaSelectContainer);
            }
        } else {
            artistaSelectContainer.style.display = 'flex';
            if (btnNuevoArtista) btnNuevoArtista.style.display = 'block';
            if(containerDescuento) { containerDescuento.classList.remove('d-none'); containerDescuento.classList.add('d-flex'); }
            if(btnGenerarCotizacion) { btnGenerarCotizacion.classList.remove('d-none'); }
            if (document.getElementById('info-artista-cliente')) { document.getElementById('info-artista-cliente').remove(); }
            cargarOpcionesParaSelect('/api/artistas', 'proyectoArtista', '_id', item => item.nombreArtistico || item.nombre, true);
        }
        cargarOpcionesParaSelect('/api/servicios', 'proyectoServicio', '_id', item => `${item.nombre} - $${item.precio.toFixed(2)}`); 
        
        const fp = flatpickr("#fechaProyecto", { 
            defaultDate: "today", 
            locale: "es",
            minDate: "today",
            onChange: function(selectedDates, dateStr, instance) {
                verificarDisponibilidad(); 
            }
        });
        
        const horaSelect = document.getElementById('horaProyecto');
        horaSelect.innerHTML = '<option value="">← Primero elige una fecha</option>';
        horaSelect.disabled = true;

        proyectoActual = {}; mostrarProyectoActual(); document.getElementById('formProyecto').reset();
    }

    function agregarAProyecto() { const select = document.getElementById('proyectoServicio'); if (!select.value) return; const id = `item-${select.value}-${Date.now()}`; proyectoActual[id] = { id, servicioId: select.value, nombre: select.options[select.selectedIndex].text.split(' - ')[0], unidades: parseInt(document.getElementById('proyectoUnidades').value) || 1, precioUnitario: parseFloat(select.options[select.selectedIndex].dataset.precio) }; mostrarProyectoActual(); }
    function quitarDeProyecto(id) { delete proyectoActual[id]; mostrarProyectoActual(); }
    function mostrarProyectoActual() { 
        const lista = document.getElementById('listaProyectoActual'); 
        let subtotal = 0; 
        lista.innerHTML = Object.values(proyectoActual).map(item => { const itemTotal = item.precioUnitario * item.unidades; subtotal += itemTotal; return `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${item.unidades}x ${escapeHTML(item.nombre)}</span><span>$${itemTotal.toFixed(2)} <button class="btn btn-sm btn-outline-danger ms-2" style="padding:0.1rem 0.4rem;" onclick="app.quitarDeProyecto('${item.id}')"><i class="bi bi-x-lg"></i></button></span></li>`; }).join(''); 
        const descuento = parseFloat(document.getElementById('proyectoDescuento').value) || 0; 
        
        // --- LÓGICA VISUAL DEL PLAN MENSUAL ---
        const esPlanMensual = document.getElementById('esPlanMensual')?.checked || false;
        let total = subtotal - descuento;
        
        if (esPlanMensual) {
            const serviciosPorMes = parseInt(document.getElementById('serviciosPorMes')?.value) || 1;
            const duracionMeses = parseInt(document.getElementById('duracionMeses')?.value) || 1;
            
            // Lógica para mostrar desglose...
            const subtotalMensual = subtotal * serviciosPorMes;
            const totalConPlan = subtotalMensual * duracionMeses - descuento;
            total = Math.max(0, totalConPlan);
            
            // Opcional: Mostrar información adicional en la UI
            const infoPlan = document.createElement('div');
            infoPlan.className = 'alert alert-info mt-2 small';
            infoPlan.innerHTML = `
                <strong>Plan Mensual Activado:</strong><br>
                • ${serviciosPorMes} servicio(s) por mes<br>
                • ${duracionMeses} meses de duración<br>
                • Subtotal mensual: $${subtotalMensual.toFixed(2)}<br>
                • Total del contrato: $${total.toFixed(2)}
            `;
            
            // Eliminar información anterior si existe
            const infoAnterior = lista.parentNode.querySelector('.alert-info');
            if (infoAnterior) infoAnterior.remove();
            
            // Agregar nueva información
            lista.parentNode.insertBefore(infoPlan, lista.nextSibling);
        } else {
            // Eliminar información del plan si está desactivado
            const infoPlan = lista.parentNode.querySelector('.alert-info');
            if (infoPlan) infoPlan.remove();
        }
        
        document.getElementById('totalAPagar').textContent = `$${total.toFixed(2)}`; 
    }

    async function guardarProyecto(procesoDestino) {
        const artistaSelect = document.getElementById('proyectoArtista');
        const artistaId = artistaSelect.value;
        const fechaInput = document.getElementById('fechaProyecto')._flatpickr.selectedDates[0];
        const horaInput = document.getElementById('horaProyecto').value;

        let fechaFinal = new Date();

        if (procesoDestino !== 'Cotizacion') {
            if (!fechaInput) { showToast('Selecciona una fecha', 'warning'); return null; }
            if (!horaInput || horaInput === "") { showToast('Selecciona una hora disponible', 'warning'); return null; }

            fechaFinal = new Date(fechaInput);
            const [hours, minutes] = horaInput.split(':');
            fechaFinal.setHours(hours);
            fechaFinal.setMinutes(minutes);
        } else {
            if (fechaInput) {
                fechaFinal = new Date(fechaInput);
                if (horaInput) {
                    const [hours, minutes] = horaInput.split(':');
                    fechaFinal.setHours(hours);
                    fechaFinal.setMinutes(minutes);
                }
            }
        }

        if (Object.keys(proyectoActual).length === 0) { showToast('Debes agregar al menos un servicio.', 'error'); return null; }

        const items = Object.values(proyectoActual).map(i => ({ servicio: i.servicioId, nombre: i.nombre, unidades: i.unidades, precioUnitario: i.precioUnitario }));
        
        // --- LÓGICA DE PLAN MENSUAL ---
        const esPlanMensual = document.getElementById('esPlanMensual')?.checked || false;
        const serviciosPorMes = parseInt(document.getElementById('serviciosPorMes')?.value) || 1;
        const duracionMeses = parseInt(document.getElementById('duracionMeses')?.value) || 1;
        
        // CÁLCULO LOGICO: (Subtotal * Servicios al mes * Meses) - Descuento
        const subtotalBase = items.reduce((sum, item) => sum + (item.precioUnitario * item.unidades), 0);
        const subtotalConPlan = esPlanMensual ? (subtotalBase * serviciosPorMes * duracionMeses) : subtotalBase;
        const descuento = parseFloat(document.getElementById('proyectoDescuento').value) || 0;
        const totalFinal = Math.max(0, subtotalConPlan - descuento);

        const procesoBD = procesoDestino === 'Cotizacion' ? 'Solicitud' : procesoDestino;

        const body = {
            artista: artistaId === 'publico_general' ? null : artistaId,
            nombreProyecto: document.getElementById('nombreProyecto').value,
            items: items,
            total: totalFinal,
            descuento: descuento,
            estatus: procesoDestino === 'Cotizacion' ? 'Cotizacion' : 'Pendiente de Pago',
            metodoPago: 'Pendiente',
            fecha: fechaFinal.toISOString(),
            prioridad: 'Normal',
            proceso: procesoBD,
            esAlbum: document.getElementById('esAlbum').checked,
            esPlanMensual: esPlanMensual,
            serviciosPorMes: serviciosPorMes,
            duracionMeses: duracionMeses
        };

        try {
            return await fetchAPI('/api/proyectos', { method: 'POST', body: JSON.stringify(body) });
        } catch (error) {
            showToast(`Error al guardar: ${error.message}`, 'error');
            return null;
        }
    }

    async function generarCotizacion() { const nuevoProyecto = await guardarProyecto('Cotizacion'); if (nuevoProyecto) { showToast('Cotización guardada.', 'success'); await generarCotizacionPDF(nuevoProyecto._id || nuevoProyecto); cargarOpcionesParaProyecto(); mostrarSeccion('cotizaciones'); } }
    
    async function enviarAFlujoDirecto() { 
        const nuevoProyecto = await guardarProyecto('Agendado'); 
        if (nuevoProyecto) { 
            showToast('¡Proyecto agendado con éxito!', 'success'); 
            cargarOpcionesParaProyecto(); 
            const user = getUserRoleAndId();
            if (user.role === 'cliente') { mostrarSeccion('vista-artista'); } else { mostrarSeccion('flujo-trabajo'); }
        } 
    }

    async function registrarNuevoArtistaDesdeFormulario() { const nombreInput = document.getElementById('nombreNuevoArtista'); const nombre = nombreInput.value.trim(); if (!nombre) { showToast('Introduce un nombre.', 'error'); return; } try { const nuevoArtista = await fetchAPI('/api/artistas', { method: 'POST', body: JSON.stringify({ nombre: nombre, nombreArtistico: nombre }) }); showToast('Artista guardado', 'success'); await cargarOpcionesParaSelect('/api/artistas', 'proyectoArtista', '_id', item => item.nombreArtistico || item.nombre, true); document.getElementById('proyectoArtista').value = nuevoArtista._id; document.getElementById('nuevoArtistaContainer').style.display = 'none'; nombreInput.value = ''; } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }

    function openEventModal(info) { const props = info.event.extendedProps; document.getElementById('modal-event-id').value = info.event.id; document.getElementById('modal-event-title').textContent = info.event.title; document.getElementById('modal-event-date').textContent = info.event.start.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); document.getElementById('modal-event-total').textContent = `$${safeMoney(props.total)}`; document.getElementById('modal-event-status').textContent = props.estatus; document.getElementById('modal-event-services').innerHTML = (props.servicios || '').split('\n').map(s => `<li>${escapeHTML(s)}</li>`).join(''); flatpickr("#edit-event-date", { defaultDate: info.event.start, locale: "es" }); const hours = String(info.event.start.getHours()).padStart(2, '0'); const minutes = String(info.event.start.getMinutes()).padStart(2, '0'); document.getElementById('edit-event-time').value = `${hours}:${minutes}`; new bootstrap.Modal(document.getElementById('event-modal')).show(); }
    async function cancelarCita(id) { Swal.fire({ title: '¿Cancelar esta cita?', text: "La fecha se liberará.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, cancelar', cancelButtonText: 'No', confirmButtonColor: '#d33' }).then(async (result) => { if(result.isConfirmed) { try { await fetchAPI(`/api/proyectos/${id}/estatus`, { method: 'PUT', body: JSON.stringify({ estatus: 'Cancelado' }) }); showToast('Cita cancelada.', 'info'); const el = document.getElementById('event-modal'); const m = bootstrap.Modal.getInstance(el); if(m) m.hide(); if(document.getElementById('agenda').classList.contains('active')) cargarAgenda(); if (document.getElementById('flujo-trabajo').classList.contains('active')) cargarFlujoDeTrabajo(); } catch (e) { showToast(`Error: ${e.message}`, 'error'); } } }); }
    async function actualizarHorarioProyecto() { const id = document.getElementById('modal-event-id').value; const newDateInput = document.getElementById('edit-event-date')._flatpickr.selectedDates[0]; const newTimeInput = document.getElementById('edit-event-time').value; if (!newDateInput) return showToast("Selecciona una nueva fecha", "error"); let finalDate = new Date(newDateInput); if (newTimeInput) { const [h, m] = newTimeInput.split(':'); finalDate.setHours(h); finalDate.setMinutes(m); } try { await cambiarAtributo(id, 'fecha', finalDate.toISOString()); showToast("Horario actualizado", "success"); const el = document.getElementById('event-modal'); const m = bootstrap.Modal.getInstance(el); if(m) m.hide(); cargarAgenda(); } catch (e) { showToast("Error al actualizar", "error"); } }
    async function cargarAgenda() { const calendarEl = document.getElementById('calendario'); if (currentCalendar) { currentCalendar.destroy(); } try { const eventos = await fetchAPI('/api/proyectos/agenda'); const isMobile = window.innerWidth < 768; currentCalendar = new FullCalendar.Calendar(calendarEl, { locale: 'es', initialView: isMobile ? 'listWeek' : 'dayGridMonth', headerToolbar: { left: 'prev,next today', center: 'title', right: isMobile ? 'listWeek,dayGridMonth' : 'dayGridMonth,timeGridWeek,listWeek' }, height: 'auto', dayMaxEvents: isMobile ? 1 : true, buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Lista' }, navLinks: true, editable: true, events: eventos, dateClick: (info) => { if (info.view.type.includes('Grid')) { mostrarSeccion('registrar-proyecto'); document.getElementById('fechaProyecto')._flatpickr.setDate(info.date); verificarDisponibilidad(); showToast(`Fecha preseleccionada`, 'info'); } }, eventClick: openEventModal, eventDrop: async (info) => { Swal.fire({ title: '¿Reagendar?', text: `Se moverá a: ${info.event.start.toLocaleDateString()}`, icon: 'question', showCancelButton: true, confirmButtonText: 'Sí', cancelButtonText: 'Cancelar' }).then(async (result) => { if (result.isConfirmed) { try { await cambiarAtributo(info.event.id, 'fecha', info.event.start.toISOString()); showToast('Reagendado.', 'success'); cargarFlujoDeTrabajo(); } catch (error) { info.revert(); showToast('Error al reagendar', 'error'); } } else { info.revert(); } }); }, eventContent: (arg) => { return { html: `<div class="fc-event-main-frame"><div class="fc-event-title">${escapeHTML(arg.event.title)}</div></div>` }; }, eventDidMount: function(info) { let colorVar = `var(--proceso-${info.event.extendedProps.proceso.replace(/\s+/g, '')}, var(--primary-color))`; info.el.style.backgroundColor = colorVar; info.el.style.borderColor = colorVar; } }); currentCalendar.render(); } catch (error) { calendarEl.innerHTML = '<p class="text-center text-danger">Error al cargar la agenda.</p>'; } }
    async function cambiarAtributo(id, campo, valor) { try { await fetchAPI(`/api/proyectos/${id}/${campo}`, { method: 'PUT', body: JSON.stringify({ [campo]: valor }) }); const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto) { proyecto[campo] = valor; await localforage.setItem('cache_proyectos', localCache.proyectos); } if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtroActual = document.querySelector('#filtrosFlujo button.active').textContent.trim(); filtrarFlujo(filtroActual); } } catch (e) { showToast(`Error: ${e.message}`, 'error'); } }

    async function aprobarCotizacion(id) { 
        Swal.fire({ 
            title: 'Aprobar y Agendar', 
            html: `
                <p class="small text-muted mb-3">Selecciona el día y la hora para agendar este proyecto en el estudio:</p>
                <input type="date" id="swal-fecha" class="form-control mb-2" min="${new Date().toISOString().split('T')[0]}">
                <input type="time" id="swal-hora" class="form-control">
            `, 
            icon: 'calendar', 
            showCancelButton: true, 
            confirmButtonText: 'Sí, Agendar', 
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const fecha = document.getElementById('swal-fecha').value;
                const hora = document.getElementById('swal-hora').value;
                if (!fecha || !hora) {
                    Swal.showValidationMessage('Debes seleccionar fecha y hora');
                }
                return { fecha, hora };
            }
        }).then(async (result) => { 
            if(result.isConfirmed) { 
                showLoader();
                try { 
                    const { fecha, hora } = result.value;
                    let fechaFinal = new Date(fecha);
                    const [h, m] = hora.split(':');
                    fechaFinal.setHours(h);
                    fechaFinal.setMinutes(m);
                    fechaFinal.setSeconds(0);

                    await fetchAPI(`/api/proyectos/${id}/fecha`, { method: 'PUT', body: JSON.stringify({ fecha: fechaFinal.toISOString() }) });
                    await fetchAPI(`/api/proyectos/${id}/proceso`, { method: 'PUT', body: JSON.stringify({ proceso: 'Agendado' }) }); 
                    
                    showToast('¡Cotización aprobada y agendada con éxito!', 'success'); 
                    mostrarSeccion('flujo-trabajo'); 
                } catch (error) { 
                    showToast(`Error al aprobar: ${error.message}`, 'error'); 
                } finally {
                    hideLoader();
                }
            } 
        }); 
    }

    async function compartirPorWhatsApp(proyectoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const nombreCliente = proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'cliente'; const mensaje = `¡Hola ${nombreCliente}! Aquí tienes el resumen de tu cotización en FiaRecords:\n\n*Servicios:*\n${proyecto.items.map(i => `- ${i.unidades}x ${i.nombre}`).join('\n')}\n\n*Total a Pagar: $${safeMoney(proyecto.total)} MXN*\n\nQuedamos a tus órdenes para confirmar y agendar tu proyecto.`; window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank'); } catch (error) { showToast('Error al obtener datos', 'error'); } }
    const procesos =['Solicitud', 'Agendado', 'Grabacion', 'Edicion', 'Mezcla', 'Mastering', 'Completo'];
    async function cargarFlujoDeTrabajo(filtroActivo = 'Todos') { const board = document.getElementById('kanbanBoard'); const filtros = document.getElementById('filtrosFlujo'); if (!filtros.innerHTML) { const botonesFiltro =['Todos', ...procesos.filter(p => p !== 'Completo' && p !== 'Solicitud')]; filtros.innerHTML = botonesFiltro.map(p => `<button class="btn btn-sm btn-outline-secondary" onclick="app.filtrarFlujo('${p}')">${p}</button>`).join(''); } board.innerHTML = procesos.filter(p => p !== 'Completo' && p !== 'Solicitud').map(p => `<div class="kanban-column" data-columna="${p}"><h3>${p}</h3><div id="columna-${p}" class="kanban-column-content"></div></div>`).join(''); try { await fetchAPI('/api/proyectos'); filtrarFlujo(filtroActivo); } catch (e) { console.error("Error cargando flujo:", e); } }
    function filtrarFlujo(filtro) { 
        document.querySelectorAll('#filtrosFlujo button').forEach(b => b.classList.remove('active', 'btn-primary')); 
        const activeBtn = Array.from(document.querySelectorAll('#filtrosFlujo button')).find(b => b.textContent === filtro); 
        if (activeBtn) { activeBtn.classList.add('active', 'btn-primary'); } 
        document.querySelectorAll('.kanban-column').forEach(c => c.style.display = (filtro === 'Todos' || c.dataset.columna === filtro) ? 'flex' : 'none'); 
        procesos.forEach(col => { if (document.getElementById(`columna-${col}`)) document.getElementById(`columna-${col}`).innerHTML = '' }); 
        
        if (localCache.proyectos) { 
            localCache.proyectos.filter(p => p.proceso !== 'Completo' && p.proceso !== 'Solicitud' && p.estatus !== 'Cancelado' && p.estatus !== 'Cotizacion' && !p.deleted).forEach(p => { 
                const colEl = document.getElementById(`columna-${p.proceso}`); if (!colEl) return; 
                const card = document.createElement('div'); card.className = `project-card`; card.dataset.id = p._id; 
                card.style.borderLeftColor = `var(--proceso-${(p.proceso || '').replace(/\s+/g, '')})`; 
                const serviciosHtml = (p.items && p.items.length > 0) ? p.items.map(i => `<li class="small">${escapeHTML(i.nombre)}</li>`).join('') : `<li>${escapeHTML(p.nombreProyecto || 'Sin servicios')}</li>`; 
                const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Público General'; 
                
                // Botones de Contrato y Firma
                const btnContrato = `<button class="btn btn-sm btn-outline-secondary" title="Generar Contrato" onclick="app.generarContratoPDF('${p._id}')"><i class="bi bi-file-earmark-ruled"></i></button>`;
                
                const userInfo = getUserRoleAndId();
                let btnFirma = '';
                
                if (p.firmaCliente) {
                    if (userInfo.role !== 'cliente') {
                        // Admin puede ver firmado + borrar
                        btnFirma = `
                            <div class="d-flex gap-1 align-items-center">
                                <span class="badge bg-success" style="font-size: 0.7rem;">✅ Firmado</span>
                                <button class="btn btn-sm btn-outline-danger" title="🗑️ Borrar Firma" onclick="app.borrarFirmaCliente('${p._id}')">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        `;
                    } else {
                        // Cliente solo ve que está firmado
                        btnFirma = `<span class="badge bg-success" style="font-size: 0.7rem;">✅ Firmado</span>`;
                    }
                } else {
                    btnFirma = `<button class="btn btn-sm btn-outline-warning" title="✍️ Firmar" onclick="app.abrirModalFirma('${p._id}')"><i class="bi bi-pen"></i> Firmar</button>`;
                }
                
                card.innerHTML = `<div class="project-card-header d-flex justify-content-between align-items-center mb-2"><strong class="text-primary ${p.artista ? 'clickable-artist' : ''}" ${p.artista ? `ondblclick="app.irAVistaArtista('${p.artista._id}', '${escapeHTML(p.artista.nombre)}', '')"` : ''}>${escapeHTML(p.nombreProyecto || artistaNombre)}</strong><select onchange="app.cambiarProceso('${p._id}', this.value)" class="form-select form-select-sm" style="width: auto;">${procesos.filter(pr => pr !== 'Solicitud').map(proc => `<option value="${proc}" ${p.proceso === proc ? 'selected' : ''}>${proc}</option>`).join('')}</select></div><div class="project-card-body"><div class="small text-muted mb-2">🗓️ ${safeDate(p.fecha)}</div><ul class="list-unstyled mb-0 small">${serviciosHtml}</ul></div><div class="project-card-footer"><strong class="text-success">$${safeMoney(p.total)}</strong><div class="btn-group">${btnContrato}${btnFirma}<button class="btn btn-sm btn-outline-primary" title="Pago" onclick="app.registrarPago('${p._id}')"><i class="bi bi-currency-dollar"></i></button><button class="btn btn-sm btn-outline-secondary" title="Editar" onclick="app.editarInfoProyecto('${p._id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" title="Borrar" onclick="app.eliminarProyecto('${p._id}')"><i class="bi bi-trash"></i></button></div></div>`; colEl.appendChild(card); 
            }); 
        } 
    }
    async function cambiarProceso(id, proceso) { try { const data = { proceso }; if (proceso === 'Completo') { const proyecto = localCache.proyectos.find(p => p._id === id); const restante = proyecto.total - (proyecto.montoPagado || 0); if (restante > 0) { const result = await Swal.fire({ title: 'Proyecto con Saldo Pendiente', text: `Este proyecto aún debe $${restante.toFixed(2)}. ¿Deseas completarlo?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, completar', cancelButtonText: 'Cancelar' }); if (!result.isConfirmed) { cargarFlujoDeTrabajo(); return; } } } await fetchAPI(`/api/proyectos/${id}/proceso`, { method: 'PUT', body: JSON.stringify(data) }); const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto) { proyecto.proceso = proceso; await localforage.setItem('cache_proyectos', localCache.proyectos); } if (proceso === 'Completo') { showToast('¡Proyecto completado y movido a historial!', 'success'); } const filtroActual = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos'; filtrarFlujo(filtroActual); } catch (e) { showToast(`Error: ${e.message}`, 'error'); } }
    
    // ==============================================================

    // CARGAR HISTORIAL (BOTÓN VISOR)
    // ==============================================================
    async function cargarHistorial() { 
        const tablaBody = document.getElementById('tablaHistorialBody'); 
        tablaBody.innerHTML = `<tr><td colspan="7">Cargando historial...</td></tr>`; 
        try { 
            historialCacheados = await fetchAPI('/api/proyectos/completos'); 
            tablePagination.historial.page = 1;
            renderHistorialTable();
        } catch (error) { 
            console.error(error);
            tablaBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error al cargar historial.</td></tr>`; 
        } 
    }

    function renderHistorialTable() {
        const tablaBody = document.getElementById('tablaHistorialBody');
        const items = historialCacheados ||[];
        const { page, limit } = tablePagination.historial;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit);

        if (items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="7" class="text-center">No hay proyectos.</td></tr>`; 
            renderTableControls('tablaHistorialBody', 'historial', 1, 0);
            return;
        }

        tablaBody.innerHTML = paginatedItems.map(p => { 
            const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Público General'; 
            const esCancelado = p.estatus === 'Cancelado';
            const estadoBadge = esCancelado ? `<span class="badge bg-secondary">Cancelado</span>` : `<span class="badge bg-success">Completado</span>`;
            const rowClass = esCancelado ? 'fila-cancelada' : '';

            const showPlayer = (p.archivos && p.archivos.length > 0) || (p.enlaceEntrega && p.enlaceEntrega.length > 0);

            return `
            <tr class="${rowClass}">
                <td data-label="Fecha">${safeDate(p.fecha)}</td>
                <td data-label="Artista" class="${p.artista ? 'clickable-artist' : ''}" ondblclick="app.irAVistaArtista('${p.artista ? p.artista._id : ''}', '${escapeHTML(artistaNombre)}', '')">${escapeHTML(artistaNombre)}</td>
                <td data-label="Proyecto">${escapeHTML(p.nombreProyecto || 'Sin nombre')}</td>
                <td data-label="Total">$${safeMoney(p.total)}</td>
                <td data-label="Pagado">$${safeMoney(p.montoPagado)}</td>
                <td data-label="Estado">${estadoBadge}</td>
                <td data-label="Acciones" class="table-actions">
                    ${showPlayer ? `<button class="btn btn-sm btn-info text-white" title="Visor Multimedia" onclick="app.openPlayer('${p._id}')"><i class="bi bi-play-circle-fill"></i></button>` : ''}
                    <button class="btn btn-sm btn-outline-primary" title="Entrega / Drive" onclick="app.openDeliveryModal('${p._id}', '${escapeHTML(artistaNombre)}', '${escapeHTML(p.nombreProyecto || 'Proyecto')}')"><i class="bi bi-cloud-arrow-up"></i></button>
                    <button class="btn btn-sm btn-outline-info" onclick="app.registrarPago('${p._id}', true)" title="Pagos"><i class="bi bi-cash-stack"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="app.eliminarProyecto('${p._id}')" title="Mover a Papelera"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`; 
        }).join(''); 
        
        renderTableControls('tablaHistorialBody', 'historial', page, totalPages);
    }

    async function eliminarProyecto(id, desdeCotizaciones = false) { Swal.fire({ title: '¿Mover a papelera?', text: "El proyecto se ocultará.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, mover', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33' }).then(async (result) => { if(result.isConfirmed) { try { await fetchAPI(`/api/proyectos/${id}`, { method: 'DELETE' }); showToast('Movido a papelera.', 'info'); if (desdeCotizaciones) { cargarCotizaciones(); } else if (document.getElementById('historial-proyectos').classList.contains('active')) { cargarHistorial(); } else if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtroActual = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos'; cargarFlujoDeTrabajo(filtroActual); } } catch (error) { showToast(`Error: ${error.message}`, 'error'); } } }); }
    
    // ==================================================================
    // FUNCION DE NAVEGACION CON GUARDIA DE SEGURIDAD ANTI-FLASH
    // ==================================================================
    async function mostrarSeccion(id, updateHistory = true) { 
        const userInfo = getUserRoleAndId();
        const esCliente = (userInfo.role === 'cliente');

        const seccionesProhibidasParaCliente = [
            'dashboard', 'agenda', 'flujo-trabajo', 'cotizaciones',
            'historial-proyectos', 'gestion-artistas', 'gestion-servicios',
            'gestion-usuarios', 'configuracion', 'papelera-reciclaje', 'mis-deudas'
        ];

        if (esCliente && seccionesProhibidasParaCliente.includes(id)) {
            id = 'vista-artista'; 
        }

        document.querySelectorAll('main > section').forEach(sec => sec.classList.remove('active')); 
        document.querySelectorAll('.nav-link-sidebar').forEach(link => link.classList.remove('active')); 
        
        const seccionActiva = document.getElementById(id); 
        const linkActivo = document.querySelector(`.nav-link-sidebar[data-seccion="${id}"]`); 
        
        const btnBack = document.getElementById('btn-global-back'); 
        if (btnBack) { if (id === 'dashboard' || (id === 'vista-artista' && esCliente)) { btnBack.style.display = 'none'; } else { btnBack.style.display = 'inline-flex'; } } 
        
        if (seccionActiva) { 
            seccionActiva.classList.add('active'); 
            if(linkActivo) linkActivo.classList.add('active'); 
            if (updateHistory && `#${id}` !== window.location.hash) { history.pushState(null, null, `#${id}`); } 
            
            if(document.getElementById('globalSearchPC')) document.getElementById('globalSearchPC').value = ''; 
            if(document.getElementById('globalSearchMobile')) document.getElementById('globalSearchMobile').value = ''; 
            
            if(id === 'gestion-artistas') renderPaginatedList('artistas'); 
            if(id === 'gestion-servicios') renderPaginatedList('servicios'); 
            if(id === 'gestion-usuarios') renderPaginatedList('usuarios'); 
            
            const loadDataActions = { 
                'dashboard': cargarDashboard, 
                'agenda': cargarAgenda, 
                'cotizaciones': cargarCotizaciones, 
                'flujo-trabajo': cargarFlujoDeTrabajo, 
                'pagos': cargarPagos, 
                'registrar-proyecto': cargarOpcionesParaProyecto, 
                'historial-proyectos': cargarHistorial, 
                'papelera-reciclaje': cargarPapelera, 
                'configuracion': cargarConfiguracion,
                'mis-deudas': cargarDeudas,
                'vista-artista': () => { } 
            }; 
            if(loadDataActions[id]) await loadDataActions[id](); 
        } 
    }

    function irAlDashboard() { 
        const role = document.body.getAttribute('data-role'); 
        if (role === 'cliente') { mostrarSeccion('vista-artista'); } 
        else { mostrarSeccion('dashboard'); } 
    }
    
    // --- VISTA ARTISTA ---
    async function mostrarVistaArtista(artistaId, nombre, nombreArtistico) {
        const userInfo = getUserRoleAndId(); const isClientView = (userInfo.role === 'cliente');
        const contenido = document.getElementById('vista-artista-contenido');
        contenido.innerHTML = '<div class="text-center p-5"><div class="spinner-border" role="status"></div></div>';
        try {
            const [proyectos, artistaInfo] = await Promise.all([fetchAPI(`/api/proyectos/por-artista/${artistaId}`), fetchAPI(`/api/artistas/${artistaId}`)]);
            
            let html = `<div class="mb-3">${!isClientView ? `<button class="btn-back-inline" onclick="app.irAlDashboard()"><i class="bi bi-arrow-left"></i> Volver</button>` : ''}<h2 class="mb-0" id="vista-artista-nombre">${escapeHTML(nombreArtistico || nombre)}</h2></div>
                        <div class="card mb-4" style="background-color: var(--card-bg, inherit); color: var(--text-color, inherit);"><div class="card-body"><div class="d-flex justify-content-between align-items-start flex-wrap"><div><p class="mb-1"><strong>Nombre Real:</strong> ${escapeHTML(artistaInfo.nombre)}</p><p class="mb-1"><strong>Tel:</strong> ${escapeHTML(artistaInfo.telefono || 'N/A')}</p><p class="mb-0"><strong>Email:</strong> ${escapeHTML(artistaInfo.correo || 'N/A')}</p></div>`;
            
            if (!isClientView) { 
                html += `<div class="btn-group mt-2 mt-md-0">
                            <button class="btn btn-sm btn-outline-secondary" onclick="app.abrirModalEditarArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}', '${escapeHTML(artistaInfo.nombreArtistico || '')}', '${escapeHTML(artistaInfo.telefono || '')}', '${escapeHTML(artistaInfo.correo || '')}')"><i class="bi bi-pencil"></i> Editar</button>
                            <button class="btn btn-sm btn-info text-white" onclick="app.abrirModalProyectoDirecto('${artistaInfo._id}')"><i class="bi bi-archive"></i> Catálogo Antiguo</button>
                            <button class="btn btn-sm btn-primary" onclick="app.nuevoProyectoParaArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}')"><i class="bi bi-plus-circle"></i> Nuevo Proyecto</button>
                         </div>`; 
            } else { 
                html += `<div class="btn-group mt-2 mt-md-0"><button class="btn btn-sm btn-primary" onclick="app.nuevoProyectoParaArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}')"><i class="bi bi-plus-circle"></i> Nuevo Proyecto</button></div>`; 
            }
            
            html += `</div></div></div><h3>Historial de Proyectos</h3>`;
            if (proyectos.length) { 
                html += '<div class="table-responsive"><table class="table table-hover"><thead><tr><th>Fecha</th><th>Proyecto</th><th>Total</th><th>Pagado</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'; 
                proyectos.forEach(p => { 
                    // Botones de Contrato y Firma
                    const btnContrato = `<button class="btn btn-sm btn-outline-secondary" title="Generar Contrato" onclick="app.generarContratoPDF('${p._id}')"><i class="bi bi-file-earmark-ruled"></i></button>`;
                    const userInfo = getUserRoleAndId();
                let btnFirma = '';
                
                if (p.firmaCliente) {
                    if (userInfo.role !== 'cliente') {
                        // Admin puede ver firmado + borrar
                        btnFirma = `
                            <div class="d-flex gap-1 align-items-center">
                                <span class="badge bg-success" style="font-size: 0.7rem;">✅ Firmado</span>
                                <button class="btn btn-sm btn-outline-danger" title="🗑️ Borrar Firma" onclick="app.borrarFirmaCliente('${p._id}')">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        `;
                    } else {
                        // Cliente solo ve que está firmado
                        btnFirma = `<span class="badge bg-success" style="font-size: 0.7rem;">✅ Firmado</span>`;
                    }
                } else {
                    btnFirma = `<button class="btn btn-sm btn-outline-warning" title="✍️ Firmar" onclick="app.abrirModalFirma('${p._id}')"><i class="bi bi-pen"></i> Firmar</button>`;
                }
                    
                    let accionesHtml = `${btnContrato}${btnFirma}<button class="btn btn-sm btn-outline-secondary" title="Cotización PDF" onclick="app.generarCotizacionPDF('${p._id}')"><i class="bi bi-file-earmark-pdf"></i></button>`; 
                    
                    if ((p.archivos && p.archivos.length > 0) || (p.enlaceEntrega && p.enlaceEntrega.length > 0)) {
                        accionesHtml += `<button class="btn btn-sm btn-info ms-1 text-white" title="Visor Multimedia" onclick="app.openPlayer('${p._id}')"><i class="bi bi-play-circle-fill"></i></button>`;
                    }

                    if (p.enlaceEntrega) accionesHtml += `<a href="${p.enlaceEntrega}" target="_blank" class="btn btn-sm btn-success ms-1" title="Descargar Carpeta"><i class="bi bi-cloud-download"></i></a>`; 
                    if (!isClientView) { accionesHtml += `<button class="btn btn-sm btn-outline-primary ms-1" title="Entrega/Drive" onclick="app.openDeliveryModal('${p._id}', '${escapeHTML(artistaInfo.nombre)}', '${escapeHTML(p.nombreProyecto || 'Proyecto')}')"><i class="bi bi-cloud-arrow-up"></i></button><button class="btn btn-sm btn-outline-danger ms-1" title="Borrar" onclick="app.eliminarProyecto('${p._id}')"><i class="bi bi-trash"></i></button>`; } 
                    
                    html += `<tr><td data-label="Fecha">${safeDate(p.fecha)}</td><td data-label="Proyecto">${escapeHTML(p.nombreProyecto || 'Proyecto sin nombre')}</td><td data-label="Total">$${safeMoney(p.total)}</td><td data-label="Pagado">$${safeMoney(p.montoPagado)}</td><td data-label="Estado"><span class="badge" style="background-color: var(--proceso-${(p.proceso || '').replace(/\s+/g, '')})">${p.proceso}</span></td><td data-label="Acciones" class="table-actions">${accionesHtml}</td></tr>`; 
                }); 
                html += '</tbody></table></div>'; 
            } else { html += '<p>Este artista aún no tiene proyectos registrados.</p>'; }
            
            contenido.innerHTML = html; mostrarSeccion('vista-artista', false); 
        } catch (e) { contenido.innerHTML = '<p class="text-danger text-center">Error al cargar el historial.</p>'; console.error(e); }
    }

    async function irAVistaArtista(artistaId, artistaNombre, nombreArtistico) { const userInfo = getUserRoleAndId(); if (!artistaId) { if (userInfo.role === 'cliente' && userInfo.artistaId) { artistaId = userInfo.artistaId; if (!artistaNombre) artistaNombre = userInfo.username; } else { const artistas = await fetchAPI('/api/artistas'); const artista = artistas.find(a => a.nombre === artistaNombre || a.nombreArtistico === artistaNombre); if (artista) artistaId = artista._id; else return; } } mostrarVistaArtista(artistaId, artistaNombre, nombreArtistico); }
    function nuevoProyectoParaArtista(idArtista, nombreArtista) { preseleccionArtistaId = idArtista; mostrarSeccion('registrar-proyecto'); showToast(`Iniciando proyecto para: ${nombreArtista}`, 'info'); }
    
    // --- LÓGICA PARA AÑADIR PROYECTO DIRECTO AL HISTORIAL ---
    function abrirModalProyectoDirecto(artistaId) {
        document.getElementById('directoArtistaId').value = artistaId;
        document.getElementById('directoNombreProyecto').value = '';
        document.getElementById('directoEnlace').value = '';
        new bootstrap.Modal(document.getElementById('modalProyectoDirecto')).show();
    }

    async function guardarProyectoDirecto(e) {
        e.preventDefault();
        const artistaId = document.getElementById('directoArtistaId').value;
        const nombreProyecto = document.getElementById('directoNombreProyecto').value;
        const enlaceEntrega = document.getElementById('directoEnlace').value;

        showLoader();
        try {
            await fetchAPI('/api/proyectos/directo', {
                method: 'POST',
                body: JSON.stringify({ artistaId, nombreProyecto, enlaceEntrega })
            });

            showToast('Proyecto anterior añadido al catálogo.', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalProyectoDirecto')).hide();
            
            // Recargar la vista del artista para ver el nuevo proyecto en la tabla
            const nombreArtisticoActual = document.getElementById('vista-artista-nombre').textContent;
            mostrarVistaArtista(artistaId, nombreArtisticoActual, '');

        } catch (error) {
            showToast('Error al añadir proyecto: ' + error.message, 'error');
        } finally {
            hideLoader();
        }
    }

    // Función de PDF
    function dibujarLogoEnPDF(pdf, logoData) { 
        if (!logoData) return; 
        const imgProps = pdf.getImageProperties(logoData); 
        const originalWidth = imgProps.width; 
        const originalHeight = imgProps.height; 
        const maxBoxWidth = 50; 
        const maxBoxHeight = 25; 
        let finalWidth = maxBoxWidth; 
        let finalHeight = (originalHeight * maxBoxWidth) / originalWidth; 
        if (finalHeight > maxBoxHeight) { finalHeight = maxBoxHeight; finalWidth = (originalWidth * maxBoxHeight) / originalHeight; } 
        pdf.addImage(logoData, 'PNG', 14, 15, finalWidth, finalHeight); 
    }

    async function addFirmaToPdf(pdf, docType, finalFileName, proyecto, yStartPos = 80) { 
        if (!configCache) await loadInitialConfig();
        
        let firmaSrc = configCache?.firmaBase64 || configCache?.firma?.base64 || configCache?.config?.firmaBase64 || null;
        let encabezado1 = configCache?.plantillasDoc?.encabezado1 || "FiaRecords Studio";
        let encabezado2 = configCache?.plantillasDoc?.encabezado2 || "Juárez N.L.";
        let terminos = "";
        
        // 1. CARGAR PLANTILLA SEGÚN TIPO
        if (docType === 'cotizacion') {
            terminos = `Este presupuesto es válido por 15 días. Para agendar, se requiere un anticipo del 50%. La entrega de archivos finales se realizará únicamente cuando el saldo pendiente esté liquidado al 100%.`;
            if (proyecto?.esPlanMensual) {
                terminos = `Este presupuesto es válido por 15 días. Para iniciar el plan mensual, se requiere el pago del primer mes. Los pagos subsecuentes se realizarán mensualmente. La entrega de archivos finales está sujeta a que todos los pagos estén al día.`;
            }
        } else if (docType === 'recibo') {
            terminos = configCache?.plantillasDoc?.terminosRecibo || "¡Gracias por confiar en FiaRecords!";
        } else {
            terminos = configCache?.plantillasDoc?.plantillaContrato || "CONTRATO DE PRESTACIÓN DE SERVICIOS";
        }

        // 2. LOGICA DE REEMPLAZO "TODO TERRENO" (Ignora espacios y comillas raras)
        if (proyecto) {
            const costoMensual = (proyecto.total + (proyecto.descuento || 0)) / (proyecto.duracionMeses || 1);
            const descuentoTexto = proyecto.descuento > 0 
                ? `DESCUENTO APLICADO: Se ha otorgado un descuento único de $${safeMoney(proyecto.descuento)} MXN aplicable al monto total del proyecto.\n` 
                : '';
            
            const dataMap = {
                'CLIENTE': proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'Público General',
                'PROYECTO': proyecto.nombreProyecto || 'Proyecto sin nombre',
                'TOTAL': `$${safeMoney(proyecto.total)}`,
                'PAGADO': `$${safeMoney(proyecto.montoPagado || 0)}`,
                'RESTANTE': `$${safeMoney(proyecto.total - (proyecto.montoPagado || 0))}`,
                'FECHA': safeDate(proyecto.fecha),
                'MODALIDAD': proyecto.esPlanMensual ? 'PLAN MENSUAL RECURRENTE' : 'SERVICIO ÚNICO',
                'DURACION_MESES': proyecto.duracionMeses || '1',
                'CANTIDAD_MENSUAL': proyecto.serviciosPorMes || '1',
                'COSTO_MENSUAL': `$${costoMensual.toFixed(2)}`,
                'DESCUENTO_INFO': descuentoTexto
            };

            // Reemplazo masivo con regex flexible: busca {{ TAG }}, {{TAG}}, {{ "TAG" }}, etc.
            Object.keys(dataMap).forEach(key => {
                const regex = new RegExp(`{{\\s*["'"""]?${key}["'"""]?\\s*}}`, 'g');
                terminos = terminos.replace(regex, dataMap[key]);
            });

            // Inyección de resumen para contrato
            if (docType === 'contrato' && proyecto.esPlanMensual) {
                const resumen = `RESUMEN DE PLAN RECURRENTE: Duración de ${proyecto.duracionMeses} meses. Incluye ${proyecto.serviciosPorMes} servicio(s) al mes. Costo mensual: $${costoMensual.toFixed(2)} MXN.\n\n`;
                terminos = resumen + terminos;
            }
        }

        //3. RENDERIZADO DE TEXTO
        pdf.setFontSize(9);
        pdf.text(encabezado1, 196, 20, { align: 'right' });
        pdf.text(encabezado2, 196, 25, { align: 'right' });

        let yPos = yStartPos;
        pdf.setFontSize(docType === 'contrato' ? 10 : 8);
        const parrafos = terminos.split('\n');
        
        for (let i = 0; i < parrafos.length; i++) {
            const parrafo = parrafos[i].trim();
            if (!parrafo) continue;
            
            // Detectar si es una línea importante (Cabecera o Cláusula)
            const esImportante = parrafo.toUpperCase().startsWith('CLÁUSULA') || 
                                 parrafo.startsWith('CONTRATO DE PRESTACIÓN') ||
                                 parrafo.startsWith('RESUMEN DE PLAN') ||
                                 parrafo.startsWith('DESCUENTO APLICADO') ||
                                 parrafo.startsWith('NOTA DE DESCUENTO');

            if (esImportante) {
                pdf.setFont(undefined, 'bold');
                pdf.setFontSize(docType === 'contrato' ? 11 : 9); // Un punto más grande
            } else {
                pdf.setFont(undefined, 'normal');
                pdf.setFontSize(docType === 'contrato' ? 10 : 8);
            }
            
            const splitLines = pdf.splitTextToSize(parrafo, 182);
            for (let j = 0; j < splitLines.length; j++) {
                if (yPos > 245) {
                    pdf.addPage();
                    if (logoBase64) dibujarLogoEnPDF(pdf, logoBase64);
                    yPos = 40;
                }
                pdf.text(splitLines[j], 14, yPos);
                yPos += (docType === 'contrato' ? 7 : 5);
            }
            yPos += 3;
        }

        // 4. FIRMAS ANCLADAS AL FONDO (Última Página)
        const baselineY = 265; // Posición fija al final de la hoja

        if (firmaSrc) {
            try {
                let base64data = firmaSrc;
                if (!firmaSrc.startsWith('data:image')) {
                    const res = await fetch(firmaSrc);
                    const blob = await res.blob();
                    base64data = await new Promise(r => {
                        const reader = new FileReader();
                        reader.onloadend = () => r(reader.result);
                        reader.readAsDataURL(blob);
                    });
                }
                pdf.line(140, baselineY, 190, baselineY);
                pdf.addImage(base64data, 'PNG', 140, baselineY - 22, 50, 20);
                pdf.setFontSize(9); pdf.setFont(undefined, 'normal');
                pdf.text("Erick Resendiz", 140, baselineY + 5);
                pdf.text("Representante FIA Records", 140, baselineY + 10);
            } catch (e) {}
        }
        
        if (proyecto && proyecto.firmaCliente) {
            try {
                pdf.line(20, baselineY, 70, baselineY);
                pdf.addImage(proyecto.firmaCliente, 'PNG', 20, baselineY - 22, 50, 20);
                pdf.setFontSize(9); pdf.setFont(undefined, 'normal');
                pdf.text("Firma del Cliente", 20, baselineY + 5);
            } catch (e) {}
        }

        pdf.save(finalFileName); 
    }

    async function generarReciboPDF(pagoEspecifico, proyecto) {
        try {
            const pdf = new jsPDF(); 
            const pago = pagoEspecifico || (proyecto.pagos && proyecto.pagos.length > 0 ? proyecto.pagos[proyecto.pagos.length - 1] : { monto: proyecto.montoPagado || 0, metodo: 'Varios' }); 
            if (!pago) return showToast('No hay pagos.', 'error'); 
            const saldoRestante = proyecto.total - proyecto.montoPagado; 

            await preloadLogoForPDF(); // Asegura que el logo esté cargado
            if (logoBase64) { dibujarLogoEnPDF(pdf, logoBase64); } 
            
            pdf.setFontSize(16); 
            pdf.setFont(undefined, 'bold').text(`RECIBO DE PAGO`, 105, 45, { align: 'center' }); 
            pdf.setFontSize(11); 
            pdf.setFont(undefined, 'normal'); 
            pdf.text(`Cliente: ${proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'General'}`, PDF_DIMENSIONS.MARGIN, 60); 
            
            pdf.autoTable({ 
                startY: 70, 
                theme: 'striped', 
                body: [
                    ['Total del Proyecto:', `$${safeMoney(proyecto.total)}`],
                    ['Monto de este Recibo:', `$${safeMoney(pago.monto)} (${pago.metodo})`],
                    ['Saldo Restante:', `$${safeMoney(saldoRestante)}`]
                ] 
            }); 
            const fileName = `Recibo_${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`; 
            await addFirmaToPdf(pdf, 'recibo', fileName, proyecto); 
        } catch (error) { 
            showToast('Error al generar recibo.', 'error'); 
        } 
    }

    async function generarCotizacionPDF(proyectoIdOrObject) { 
        try { 
            const proyecto = typeof proyectoIdOrObject === 'string' ? await fetchAPI(`/api/proyectos/${proyectoIdOrObject}`) : proyectoIdOrObject; 
            const { jsPDF } = window.jspdf; 
            const pdf = new jsPDF(); 

            await preloadLogoForPDF(); 
            if (logoBase64) { dibujarLogoEnPDF(pdf, logoBase64); } 
            
            pdf.setFontSize(11); 
            pdf.text(`Cliente: ${proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'Público General'}`, 14, 40); 
            pdf.text(`Fecha: ${new Date().toLocaleDateString()}`, 196, 40, { align: 'right' }); 
            
            let startY = 50;

            // --- MEJORA: DETALLE DEL PLAN VISIBLE ---
            if (proyecto.esPlanMensual) {
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'bold');
                pdf.setTextColor(0, 102, 204); // Color azul para resaltar
                pdf.text("MODALIDAD: PLAN MENSUAL RECURRENTE", 14, startY);
                pdf.setTextColor(0, 0, 0);
                pdf.setFontSize(10);
                pdf.setFont(undefined, 'normal');
                startY += 6;
                pdf.text(`Duración del contrato: ${proyecto.duracionMeses} meses.`, 14, startY);
                startY += 5;
                pdf.text(`Incluye: ${proyecto.serviciosPorMes} servicio(s) por mes detallados a continuación.`, 14, startY);
                startY += 10;
            }

            const body = proyecto.items.map(item =>[`${item.unidades}x ${item.nombre}`, `$${(item.precioUnitario * item.unidades).toFixed(2)}`]); 
    
    // Mostramos el subtotal mensual sin descuentos para que no haya duda
    if (proyecto.esPlanMensual) {
        const subtotalMensual = proyecto.items.reduce((sum, item) => sum + (item.precioUnitario * item.unidades), 0);
        const costoMensualBase = subtotalMensual * (proyecto.serviciosPorMes || 1);
        body.push([{ content: `COSTO MENSUAL BASE: $${costoMensualBase.toFixed(2)} / mes`, colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }]);
    }
            
            pdf.autoTable({ 
                startY: startY, 
                head: [['Servicio a realizar', 'Costo Unitario']], 
                body: body, 
                theme: 'grid', 
                styles: { fontSize: 10 }, 
                headStyles: { fillColor:[0, 0, 0] } 
            }); 
            
            let finalY = pdf.lastAutoTable.finalY + 10;
            
            // Si hay descuento, lo ponemos como una nota aclaratoria separada
            if (proyecto.descuento > 0) {
                pdf.setFontSize(10); pdf.setFont(undefined, 'normal');
                pdf.text(`(-) Descuento único aplicado al total: $${proyecto.descuento.toFixed(2)} MXN`, 196, finalY, { align: 'right' });
                finalY += 8;
            } 
            
            if (finalY > 230) {
                pdf.addPage();
                if (logoBase64) { dibujarLogoEnPDF(pdf, logoBase64); }
                finalY = 40; 
            }
            
            pdf.setFontSize(13); 
            pdf.setFont(undefined, 'bold'); 
            const textoTotal = proyecto.esPlanMensual ? `TOTAL DEL CONTRATO (${proyecto.duracionMeses} meses):` : 'TOTAL A PAGAR:';
            pdf.text(`${textoTotal} $${safeMoney(proyecto.total)} MXN`, 196, finalY, { align: 'right' }); 
            
            const fileName = `Cotizacion-${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`; 
            await addFirmaToPdf(pdf, 'cotizacion', fileName, proyecto, finalY + 15); 
        } catch (error) { 
            showToast("Error al generar PDF", 'error'); 
        } 
    }

    function setupMobileMenu() { const hamburger = document.getElementById('hamburger-menu'); const sidebar = document.querySelector('.sidebar'); const overlay = document.getElementById('sidebar-overlay'); const toggleMenu = () => { sidebar.classList.toggle('show'); overlay.classList.toggle('show'); }; if (hamburger) hamburger.addEventListener('click', toggleMenu); if (overlay) overlay.addEventListener('click', toggleMenu); document.querySelectorAll('.nav-link-sidebar, #btn-nuevo-proyecto-sidebar').forEach(link => { link.addEventListener('click', () => { if (window.innerWidth <= 768) { sidebar.classList.remove('show'); overlay.classList.remove('show'); } }); }); }
    
    // ==================================================================
    // AUTH & INIT CON REDIRECCION ESTRICTA
    // ==================================================================
    function showLogin() {
        document.body.classList.add('auth-visible');
        localStorage.removeItem('token');
        history.pushState("", document.title, window.location.pathname);
        DOMElements.loginContainer.style.display = 'flex'; 
        DOMElements.appWrapper.style.display = 'none';
        toggleAuth('login');
        document.body.style.opacity = '1'; document.body.style.visibility = 'visible';
        fetchPublicLogo();
    }
    
    async function showApp(payload) {
        document.body.classList.remove('auth-visible');
        const role = payload.role ? payload.role.toLowerCase() : 'cliente';
        document.body.setAttribute('data-role', role); 
        renderSidebar(payload); 
        
        if (!configCache) await loadInitialConfig();
        if(DOMElements.welcomeUser) DOMElements.welcomeUser.textContent = `Hola, ${escapeHTML(payload.username)}`;
        
        const datosBancariosBtn = document.querySelector('[data-bs-target="#modalDatosBancarios"]');
        if (datosBancariosBtn) {
            if (role === 'cliente') { datosBancariosBtn.style.display = 'none'; } 
            else { datosBancariosBtn.style.display = 'block'; }
        }

        if (!isInitialized) { initAppEventListeners(payload); isInitialized = true; }
        DOMElements.loginContainer.style.display = 'none'; 
        DOMElements.appWrapper.style.display = 'flex'; 
        
        setupCustomization(payload);

        if (role === 'cliente') {
             if(payload.artistaId) {
                 await mostrarVistaArtista(payload.artistaId, payload.username, payload.nombre || payload.username);
                 mostrarSeccion('vista-artista', false); 
             } else {
                 document.getElementById('vista-artista-contenido').innerHTML = '<div class="alert alert-warning">No se encontró un perfil de artista vinculado. Contacta a soporte.</div>';
                 mostrarSeccion('vista-artista', false);
             }
        } else { 
            const hashSection = location.hash.replace('#', '');
            mostrarSeccion(hashSection || 'dashboard', false); 
        }
        
        document.body.style.opacity = '1'; document.body.style.visibility = 'visible';
    }

    function setupAuthListeners() {
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!navigator.onLine) { return showToast('Se requiere internet.', 'error'); }
            showLoader();
            try {
                const userVal = document.getElementById('username').value;
                const passVal = document.getElementById('password').value;
                const res = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: userVal, password: passVal })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                localStorage.setItem('token', data.token);
                await showApp(JSON.parse(atob(data.token.split('.')[1])));
            } catch (error) { document.getElementById('login-error').textContent = error.message; } finally { hideLoader(); }
        });
        
        document.getElementById('toggle-password').addEventListener('click', () => {
             const passwordInput = document.getElementById('password');
             passwordInput.setAttribute('type', passwordInput.getAttribute('type') === 'password' ? 'text' : 'password');
        });
        document.getElementById('toggle-password-reg').addEventListener('click', () => {
            const passwordInput = document.getElementById('reg-password');
            passwordInput.setAttribute('type', passwordInput.getAttribute('type') === 'password' ? 'text' : 'password');
        });
    }

    // ==================================================================
    // FUNCIONES DE PAGINACIÓN DE TABLAS Y BUSCADOR INTELIGENTE
    // ==================================================================
    function renderTableControls(tableBodyId, listKey, page, totalPages) {
        const tbody = document.getElementById(tableBodyId);
        if (!tbody) return;
        const tableEl = tbody.closest('table');
        const wrapper = tableEl.parentNode;
        let controls = wrapper.querySelector('.table-pagination-controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'table-pagination-controls d-flex justify-content-between align-items-center mt-3';
            wrapper.appendChild(controls);
        }
        if (totalPages > 1) {
            controls.innerHTML = `
                <button class="btn btn-sm btn-outline-secondary" ${page === 1 ? 'disabled' : ''} onclick="app.changeTablePage('${listKey}', -1)">Anterior</button>
                <span class="small text-muted fw-bold">Pág ${page} de ${totalPages}</span>
                <button class="btn btn-sm btn-outline-secondary" ${page === totalPages ? 'disabled' : ''} onclick="app.changeTablePage('${listKey}', 1)">Siguiente</button>
            `;
        } else {
            controls.innerHTML = '';
        }
    }

    function changeTablePage(listKey, delta) {
        tablePagination[listKey].page += delta;
        if (listKey === 'historial') renderHistorialTable();
        if (listKey === 'cotizaciones') renderCotizacionesTable();
        if (listKey === 'pagosPendientes') renderPagosPendientesTable();
        if (listKey === 'pagosHistorial') renderPagosHistorialTable();
    }

    function changeTrashPage(endpoint, delta) {
        trashPagination[endpoint].page += delta;
        renderTrashList(endpoint);
    }

    function filtrarTablas(query) { 
        query = query.toLowerCase(); 
        const inputPC = document.getElementById('globalSearchPC'); 
        const inputMobile = document.getElementById('globalSearchMobile'); 
        if(document.activeElement === inputPC && inputMobile) inputMobile.value = query; 
        if(document.activeElement === inputMobile && inputPC) inputPC.value = query; 

        const activeSection = document.querySelector('section.active');
        if (!activeSection) return;
        const sectionId = activeSection.id;

        // 1. Listas Paginadas de Mantenimiento
        if (sectionId === 'gestion-artistas') renderPaginatedList('artistas', query); 
        else if (sectionId === 'gestion-servicios') renderPaginatedList('servicios', query); 
        else if (sectionId === 'gestion-usuarios') renderPaginatedList('usuarios', query); 
        
        // 2. Tablas Paginadas de Proyectos (Modifica el filtro y re-renderiza todo)
        else if (sectionId === 'historial-proyectos') {
            tablePagination.historial.filter = query;
            tablePagination.historial.page = 1;
            renderHistorialTable();
        }
        else if (sectionId === 'cotizaciones') {
            tablePagination.cotizaciones.filter = query;
            tablePagination.cotizaciones.page = 1;
            renderCotizacionesTable();
        }
        else if (sectionId === 'pagos') {
            if (document.getElementById('vista-pagos-pendientes').style.display !== 'none') {
                tablePagination.pagosPendientes.filter = query;
                tablePagination.pagosPendientes.page = 1;
                renderPagosPendientesTable();
            } else {
                tablePagination.pagosHistorial.filter = query;
                tablePagination.pagosHistorial.page = 1;
                renderPagosHistorialTable();
            }
        }
        
        // 3. Vistas Especiales (DOM Genérico)
        else if (sectionId === 'flujo-trabajo') {
            document.querySelectorAll('.project-card').forEach(card => { 
                const text = card.innerText.toLowerCase(); 
                card.style.display = text.includes(query) ? 'flex' : 'none'; 
            }); 
        }
        else if (sectionId === 'mis-deudas') {
            activeSection.querySelectorAll('tbody tr').forEach(row => { 
                const text = row.innerText.toLowerCase(); 
                row.style.display = text.includes(query) ? '' : 'none'; 
            });
        }
        else if (sectionId === 'papelera-reciclaje') {
            activeSection.querySelectorAll('.list-group-item').forEach(row => { 
                const text = row.innerText.toLowerCase(); 
                row.style.display = text.includes(query) ? '' : 'none'; 
            });
        }
        else {
            // Fallback genérico (Para Vista Artista, etc)
            activeSection.querySelectorAll('tbody tr').forEach(row => { 
                const text = row.innerText.toLowerCase(); 
                row.style.display = text.includes(query) ? '' : 'none'; 
            });
        }
    }

    async function guardarDatosBancarios() { const datos = { banco: document.getElementById('banco').value, titular: document.getElementById('titular').value, tarjeta: document.getElementById('tarjeta').value, clabe: document.getElementById('clabe').value }; try { await fetchAPI('/api/configuracion/datos-bancarios', { method: 'PUT', body: JSON.stringify({ datosBancarios: datos }) }); configCache.datosBancarios = datos; bootstrap.Modal.getInstance(document.getElementById('modalDatosBancarios')).hide(); Swal.fire({ icon: 'success', title: 'Datos bancarios guardados', timer: 1500, showConfirmButton: false }); } catch (e) { showToast('Error al guardar', 'error'); } }
    async function cargarDatosBancariosEnModal() { try { if (!configCache || !configCache.datosBancarios) { await loadInitialConfig(); } const db = (configCache && configCache.datosBancarios) ? configCache.datosBancarios : {}; document.getElementById('banco').value = db.banco || ''; document.getElementById('titular').value = db.titular || ''; document.getElementById('tarjeta').value = db.tarjeta || ''; document.getElementById('clabe').value = db.clabe || ''; } catch (error) { console.error("Error al cargar datos bancarios:", error); } }
    function generarDatosBancariosPDF() { if (!configCache || !configCache.datosBancarios) return showToast('Guarda los datos primero', 'warning'); const db = configCache.datosBancarios; const { jsPDF } = window.jspdf; const pdf = new jsPDF(); if (logoBase64) { dibujarLogoEnPDF(pdf, logoBase64); } pdf.setFontSize(18).setFont(undefined, 'bold').text("DATOS BANCARIOS", 105, 45, { align: 'center' }); const data = [['Banco:', db.banco || ''],['Titular:', db.titular || ''],['Número de Tarjeta:', db.tarjeta || ''],['CLABE Interbancaria:', db.clabe || '']]; pdf.autoTable({ startY: 60, body: data, theme: 'striped', styles: { fontSize: 14, cellPadding: 3 } }); pdf.save("FiaRecords_DatosBancarios.pdf"); }
    function compartirDatosBancariosWhatsApp() { if (!configCache || !configCache.datosBancarios) return showToast('Guarda los datos primero', 'warning'); const db = configCache.datosBancarios; const msg = `*Datos Bancarios FiaRecords*\n\n*Banco:* ${db.banco}\n*Titular:* ${db.titular}\n*Tarjeta:* ${db.tarjeta}\n*CLABE:* ${db.clabe}`; window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank'); }
    async function subirFirma(event) { const file = event.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('firmaFile', file); try { const data = await fetchAPI('/api/configuracion/upload-firma', { method: 'POST', body: formData, isFormData: true }); showToast('¡Firma subida!', 'success'); const newSrc = data.firmaBase64; document.getElementById('firma-preview-img').src = newSrc; if (configCache) configCache.firmaBase64 = data.firmaBase64; } catch (e) { showToast(`Error al subir la firma`, 'error'); } }
    
    // MODIFICADO: Ahora también carga las plantillas de documentos
    async function cargarConfiguracion() { 
        try { 
            if (!configCache) await loadInitialConfig();
            
            // EL CAMBIO: Creamos una variable segura por si sigue siendo null
            const configSegura = configCache || {};
            
            const firmaPreview = document.getElementById('firma-preview-img');
            let firmaSrc = 'https://placehold.co/150x60?text=Sin+Firma';
            if (configSegura.firmaBase64) firmaSrc = configSegura.firmaBase64; 
            firmaPreview.src = firmaSrc; 
            
            const db = configSegura.datosBancarios || {}; 
            document.getElementById('banco').value = db.banco || ''; 
            document.getElementById('titular').value = db.titular || ''; 
            document.getElementById('tarjeta').value = db.tarjeta || ''; 
            document.getElementById('clabe').value = db.clabe || ''; 

            const tbody = document.getElementById('tabla-horarios-body');
            tbody.innerHTML = '';
            
            const horarios = configSegura.horarioLaboral || {};
            
            DIAS_SEMANA.forEach((nombreDia, index) => {
                const h = horarios[index.toString()] || { activo: (index !== 0), inicio: "10:00", fin: "20:00" };
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${nombreDia}</strong></td>
                    <td>
                        <div class="form-check form-switch">
                            <input class="form-check-input check-dia-activo" type="checkbox" 
                                   id="dia-activo-${index}" ${h.activo ? 'checked' : ''} 
                                   onchange="app.toggleInputsHorario(${index})">
                            <label class="form-check-label" for="dia-activo-${index}">Abierto</label>
                        </div>
                    </td>
                    <td>
                        <input type="time" class="form-control input-hora" id="dia-inicio-${index}" 
                               value="${h.inicio}" ${!h.activo ? 'disabled' : ''}>
                    </td>
                    <td>
                        <input type="time" class="form-control input-hora" id="dia-fin-${index}" 
                               value="${h.fin}" ${!h.activo ? 'disabled' : ''}>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // NUEVO: Cargar plantillas de documentos usando configSegura
            const plantillas = configSegura.plantillasDoc || {};
            document.getElementById('plantilla-enc1').value = plantillas.encabezado1 || '';
            document.getElementById('plantilla-enc2').value = plantillas.encabezado2 || '';
            document.getElementById('plantilla-term-cotiz').value = plantillas.terminosCotizacion || '';
            document.getElementById('plantilla-term-recibo').value = plantillas.terminosRecibo || '';
            document.getElementById('plantilla-contrato').value = plantillas.plantillaContrato || '';

        } catch (e) { showToast('Error al cargar configuración.', 'error'); } 
    }

    // NUEVO: Función para guardar las plantillas de documentos
    async function guardarPlantillasConfig(e) {
        e.preventDefault();
        const plantillasDoc = {
            encabezado1: document.getElementById('plantilla-enc1').value,
            encabezado2: document.getElementById('plantilla-enc2').value,
            terminosCotizacion: document.getElementById('plantilla-term-cotiz').value,
            terminosRecibo: document.getElementById('plantilla-term-recibo').value,
            plantillaContrato: document.getElementById('plantilla-contrato').value
        };
        try {
            const res = await fetchAPI('/api/configuracion/plantillas', {
                method: 'PUT',
                body: JSON.stringify({ plantillasDoc })
            });
            // Actualizar la caché local con los nuevos valores
            configCache.plantillasDoc = res.plantillasDoc; 
            showToast('Plantillas guardadas correctamente', 'success');
        } catch (err) {
            showToast('Error al guardar plantillas', 'error');
        }
    }
    
    async function cargarCotizaciones() { 
        const tablaBody = document.getElementById('tablaCotizacionesBody'); 
        tablaBody.innerHTML = `<tr><td colspan="4">Cargando cotizaciones...</td></tr>`; 
        try { 
            cotizacionesCacheadas = await fetchAPI('/api/proyectos/cotizaciones'); 
            tablePagination.cotizaciones.page = 1;
            renderCotizacionesTable();
        } catch (e) { 
            tablaBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error al cargar.</td></tr>`; 
        } 
    }
    
    function renderCotizacionesTable() {
        const tablaBody = document.getElementById('tablaCotizacionesBody');
        let items = cotizacionesCacheadas ||[];

        const filterText = tablePagination.cotizaciones.filter || '';
        if (filterText) {
            items = items.filter(c => {
                const artista = c.artista ? (c.artista.nombreArtistico || c.artista.nombre) : 'Público General';
                return artista.toLowerCase().includes(filterText);
            });
        }

        const { page, limit } = tablePagination.cotizaciones;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit) || 1;
        
        if (items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="4" class="text-center">No hay cotizaciones pendientes.</td></tr>`;
            renderTableControls('tablaCotizacionesBody', 'cotizaciones', 1, 0);
            return;
        }
        
        tablaBody.innerHTML = paginatedItems.map(c => { 
            const artistaNombre = c.artista ? (c.artista.nombreArtistico || c.artista.nombre) : 'Público General';
            
            // Botones de Contrato y Firma
            const btnContrato = `<button class="btn btn-sm btn-outline-secondary" title="Generar Contrato" onclick="app.generarContratoPDF('${c._id}')"><i class="bi bi-file-earmark-ruled"></i></button>`;
            
            const userInfo = getUserRoleAndId();
            let btnFirma = '';
            
            if (c.firmaCliente) {
                if (userInfo.role !== 'cliente') {
                    // Admin puede ver firmado + borrar
                    btnFirma = `
                        <div class="d-flex gap-1 align-items-center">
                            <span class="badge bg-success" style="font-size: 0.7rem;">✅ Firmado</span>
                            <button class="btn btn-sm btn-outline-danger" title="🗑️ Borrar Firma" onclick="app.borrarFirmaCliente('${c._id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    `;
                } else {
                    // Cliente solo ve que está firmado
                    btnFirma = `<span class="badge bg-success" style="font-size: 0.7rem;">✅ Firmado</span>`;
                }
            } else {
                btnFirma = `<button class="btn btn-sm btn-outline-warning" title="✍️ Firmar" onclick="app.abrirModalFirma('${c._id}')"><i class="bi bi-pen"></i> Firmar</button>`;
            }
            
            return `
                <tr>
                    <td data-label="Fecha">${safeDate(c.fecha)}</td>
                    <td data-label="Artista">${escapeHTML(artistaNombre)}</td>
                    <td data-label="Total">$${safeMoney(c.total)}</td>
                    <td data-label="Acciones" class="table-actions">
                        <button class="btn btn-sm btn-outline-primary" title="Aprobar y Agendar" onclick="app.aprobarCotizacion('${c._id}')"><i class="bi bi-check-circle"></i></button>
                        <button class="btn btn-sm btn-outline-info" title="Cotización PDF" onclick="app.generarCotizacionPDF('${c._id}')"><i class="bi bi-file-earmark-pdf"></i></button>
                        ${btnContrato}${btnFirma}
                    </td>
                </tr>
            `;
        }).join('');
        
        renderTableControls('tablaCotizacionesBody', 'cotizaciones', page, totalPages);
    }

    async function cargarPapelera() {
        const endpoints =['servicios', 'artistas', 'usuarios', 'proyectos'];
        for (const endpoint of endpoints) {
            try {
                const data = await fetchAPI(`/api/${endpoint}/papelera/all`);
                localCache.trash[endpoint] = data; 
                trashPagination[endpoint].page = 1; 
                renderTrashList(endpoint); 
            } catch (e) {
                console.error(`Error loading trash for ${endpoint}:`, e);
                const listEl = document.getElementById(`papelera${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`);
                if(listEl) listEl.innerHTML = `<li class="list-group-item text-danger small">Error cargando.</li>`;
            }
        }
    }

    function renderTrashList(endpoint) {
        const listId = `papelera${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`;
        const listEl = document.getElementById(listId);
        const controlsEl = document.getElementById(`${listId}Controls`);
        if (!listEl) return;

        const items = localCache.trash[endpoint] ||[];
        const { page, limit } = trashPagination[endpoint];
        
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedItems = items.slice(start, end);
        const totalPages = Math.ceil(items.length / limit);

        if (paginatedItems.length === 0) {
            listEl.innerHTML = `<li class="list-group-item text-muted small">Papelera vacía.</li>`;
            if(controlsEl) controlsEl.innerHTML = '';
            return;
        }

        listEl.innerHTML = paginatedItems.map(item => {
            let displayName = 'Item sin nombre';
            if (endpoint === 'proyectos') {
                const nombreArt = item.artista ? (item.artista.nombreArtistico || item.artista.nombre) : 'Sin Artista';
                const nombreProj = item.nombreProyecto || 'Proyecto General';
                displayName = `${nombreProj} - ${nombreArt} (${safeDate(item.fecha)})`;
            } else {
                displayName = item.nombre || item.username || item.nombreArtistico || item.nombreProyecto || 'Item sin nombre';
                if (endpoint === 'servicios' && item.precio) displayName += ` ($${item.precio})`;
                if (endpoint === 'usuarios') displayName += ` (${item.role})`;
            }
            return `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <span class="text-truncate" style="max-width: 70%;">${escapeHTML(displayName)}</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-success" onclick="app.restaurarItem('${item._id}', '${endpoint}')" title="Restaurar"><i class="bi bi-arrow-counterclockwise"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="app.eliminarPermanente('${item._id}', '${endpoint}')" title="Eliminar Permanente"><i class="bi bi-x-octagon-fill"></i></button>
                </div>
            </li>`;
        }).join('');

        if (controlsEl) {
            if (totalPages > 1) {
                controlsEl.innerHTML = `
                    <button class="btn btn-sm btn-outline-secondary" ${page === 1 ? 'disabled' : ''} onclick="app.changeTrashPage('${endpoint}', -1)">Anterior</button>
                    <span class="small text-muted fw-bold">Pág ${page} de ${totalPages}</span>
                    <button class="btn btn-sm btn-outline-secondary" ${page === totalPages ? 'disabled' : ''} onclick="app.changeTrashPage('${endpoint}', 1)">Siguiente</button>
                `;
            } else {
                controlsEl.innerHTML = ''; 
            }
        }
    }

    function changeTrashPage(endpoint, delta) {
        trashPagination[endpoint].page += delta;
        renderTrashList(endpoint);
    }
    
    // ==================================================================
    // LISTAS NORMALES (ARTISTAS, SERVICIOS)
    // ==================================================================
    async function renderPaginatedList(endpoint, filterText = null) { 
        const listId = `lista${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`; 
        const listEl = document.getElementById(listId); 
        if(!listEl) return; 
        
        const userInfo = getUserRoleAndId(); 
        const isClient = (userInfo.role === 'cliente'); 
        
        if (navigator.onLine && filterText === null) {
            try { 
                localCache[endpoint] = await fetchAPI(`/api/${endpoint}`); 
                await localforage.setItem(`cache_${endpoint}`, localCache[endpoint]);
            } catch(e) { console.error("Error fetching " + endpoint); }
        } else if (!localCache[endpoint] || localCache[endpoint].length === 0) {
            try { localCache[endpoint] = await fetchAPI(`/api/${endpoint}`); } catch(e) {}
        }
        
        let data = localCache[endpoint] ||[];
        
        if (filterText !== null) { 
            paginationState[endpoint].filter = filterText.toLowerCase(); 
            paginationState[endpoint].page = 1; 
        } 
        
        const currentFilter = paginationState[endpoint].filter; 
        let filteredData = data; 
        
        if (currentFilter) { 
            filteredData = data.filter(item => { 
                const name = item.nombre || item.username || item.nombreArtistico || ''; 
                return name.toLowerCase().includes(currentFilter); 
            }); 
        } 
        
        const page = paginationState[endpoint].page; 
        const limit = paginationState[endpoint].limit; 
        const start = (page - 1) * limit; 
        const end = start + limit; 
        const paginatedItems = filteredData.slice(start, end); 
        const totalPages = Math.ceil(filteredData.length / limit) || 1; 
        
        listEl.innerHTML = paginatedItems.length ? paginatedItems.map(item => { 
            let displayName, editAction; 
            let viewButton = ''; 

            if (endpoint === 'artistas') { 
                displayName = `${item.nombreArtistico || item.nombre}`; 
                editAction = `app.abrirModalEditarArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}', '${escapeHTML(item.telefono || '')}', '${escapeHTML(item.correo || '')}')`;
                viewButton = `<button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); app.irAVistaArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}')" title="Ver Perfil"><i class="bi bi-eye"></i></button>`;
            } else if (endpoint === 'usuarios') { 
                displayName = `${item.username} (${item.role})`; 
                editAction = `app.abrirModalEditarUsuario('${escapeHTML(JSON.stringify(item))}')`; 
            } else { 
                const vis = item.visible !== false; 
                displayName = `${item.nombre} - $${item.precio.toFixed(2)} ${vis ? '' : '<span class="badge bg-warning text-dark ms-2">Oculto</span>'}`; 
                editAction = `app.abrirModalEditarServicio('${item._id}', '${escapeHTML(item.nombre)}', '${item.precio}', ${vis})`; 
            } 
            
            const clickHandler = (endpoint === 'artistas') ? `ondblclick="app.irAVistaArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}')"` : ''; 
            const listItemClass = `list-group-item d-flex justify-content-between align-items-center ${endpoint === 'artistas' ? 'list-group-item-action' : ''}`; 
            let buttonsHtml = ''; 
            
            if (!isClient) { 
                buttonsHtml = `<div class="btn-group">${viewButton}<button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); ${editAction}"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); app.eliminarItem('${item._id}', '${endpoint}')"><i class="bi bi-trash"></i></button></div>`; 
            } 
            
            return `<li class="${listItemClass}" ${clickHandler} style="${endpoint === 'artistas' ? 'cursor:pointer;' : ''}"><span>${displayName}</span>${buttonsHtml}</li>`; 
        }).join('') : `<li class="list-group-item">No hay resultados.</li>`; 
        
        renderPaginationControls(listEl, endpoint, page, totalPages); 
    }
    
    function renderPaginationControls(container, endpoint, currentPage, totalPages) { let controls = container.parentNode.querySelector('.pagination-controls'); if(controls) controls.remove(); if (totalPages <= 1) return; controls = document.createElement('div'); controls.className = 'pagination-controls'; controls.innerHTML = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="app.changePage('${endpoint}', -1)">Anterior</button><span class="pagination-info">Página ${currentPage} de ${totalPages}</span><button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="app.changePage('${endpoint}', 1)">Siguiente</button>`; container.parentNode.appendChild(controls); }
    function changePage(endpoint, delta) { paginationState[endpoint].page += delta; renderPaginatedList(endpoint, null); }
    function limpiarForm(formId) { const f = document.getElementById(formId); if(f) f.reset(); }
    async function saveItem(e, type) { e.preventDefault(); const form = e.target; let body; if (type === 'servicios') { const vis = document.getElementById('visibleServicio'); body = { nombre: form.nombreServicio.value, precio: parseFloat(form.precioServicio.value), visible: vis ? vis.checked : true }; } else if (type === 'artistas') { body = { nombre: form.nombreArtista.value, nombreArtistico: form.nombreArtisticoArtista.value, telefono: form.telefonoArtista.value, correo: form.correoArtista.value }; } else if (type === 'usuarios') { const userVal = document.getElementById('usernameUsuario').value; const emailVal = document.getElementById('emailUsuario').value; const roleVal = document.getElementById('roleUsuario').value; const passVal = document.getElementById('passwordUsuario').value; const checkboxes = document.querySelectorAll('#formUsuarios input[name="user_permisos"]:checked'); const permisos = Array.from(checkboxes).map(c => c.value); body = { username: userVal, email: emailVal, role: roleVal, permisos: permisos, password: passVal }; if (!passVal) { showToast('La contraseña es requerida para crear un usuario', 'error'); return; } } try { await fetchAPI(`/api/${type}`, { method: 'POST', body: JSON.stringify(body) }); showToast('Creado exitosamente', 'success'); limpiarForm(form.id); localCache[type] =[]; renderPaginatedList(type); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
    async function eliminarItem(id, endpoint) { Swal.fire({ title: '¿Mover a papelera?', text: "Podrás restaurarlo después.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, mover', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33', }).then(async (result) => { if (result.isConfirmed) { try { await fetchAPI(`/api/${endpoint}/${id}`, { method: 'DELETE' }); showToast('Movido a papelera', 'info'); localCache[endpoint] =[]; renderPaginatedList(endpoint); } catch (e) { showToast(e.message, 'error'); } } }); }
    async function restaurarItem(id, endpoint) { try { await fetchAPI(`/api/${endpoint}/${id}/restaurar`, { method: 'PUT' }); showToast('Elemento restaurado.', 'success'); cargarPapelera(); } catch (error) { showToast(error.message, 'error'); } }
    async function eliminarPermanente(id, endpoint) { Swal.fire({ title: '¿Eliminar Permanente?', text: "¡Acción irreversible!", icon: 'error', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33', }).then(async (result) => { if (result.isConfirmed) { try { await fetchAPI(`/api/${endpoint}/${id}/permanente`, { method: 'DELETE' }); showToast('Eliminado permanentemente.', 'success'); cargarPapelera(); } catch (error) { showToast(error.message, 'error'); } } }); }
    function abrirModalEditarArtista(id, nombre, artistico, tel, mail) { document.getElementById('editArtistId').value = id; document.getElementById('editArtistNombre').value = nombre; document.getElementById('editArtistNombreArtístico').value = artistico; document.getElementById('editArtistTelefono').value = tel; document.getElementById('editArtistCorreo').value = mail; new bootstrap.Modal(document.getElementById('edit-artist-modal')).show(); }
    async function guardarEdicionArtista(e) { e.preventDefault(); const id = document.getElementById('editArtistId').value; const body = { nombre: document.getElementById('editArtistNombre').value, nombreArtistico: document.getElementById('editArtistNombreArtístico').value, telefono: document.getElementById('editArtistTelefono').value, correo: document.getElementById('editArtistCorreo').value }; try { await fetchAPI(`/api/artistas/${id}`, { method: 'PUT', body: JSON.stringify(body) }); showToast('Artista actualizado', 'success'); bootstrap.Modal.getInstance(document.getElementById('edit-artist-modal')).hide(); if(document.getElementById('vista-artista').classList.contains('active')) mostrarVistaArtista(id, body.nombre, body.nombreArtistico); localCache.artistas =[]; renderPaginatedList('artistas'); } catch (e) { showToast(e.message, 'error'); } }
    function abrirModalEditarServicio(id, nombre, precio, visible) { document.getElementById('editServicioId').value = id; document.getElementById('editServicioNombre').value = nombre; document.getElementById('editServicioPrecio').value = precio; document.getElementById('editServicioVisible').checked = (visible === true || visible === 'true'); new bootstrap.Modal(document.getElementById('modalEditarServicio')).show(); }
    async function guardarEdicionServicio(e) { e.preventDefault(); const id = document.getElementById('editServicioId').value; const body = { nombre: document.getElementById('editServicioNombre').value, precio: parseFloat(document.getElementById('editServicioPrecio').value), visible: document.getElementById('editServicioVisible').checked }; try { await fetchAPI(`/api/servicios/${id}`, { method: 'PUT', body: JSON.stringify(body) }); showToast('Servicio actualizado', 'success'); bootstrap.Modal.getInstance(document.getElementById('modalEditarServicio')).hide(); localCache.servicios =[]; renderPaginatedList('servicios'); } catch (e) { showToast(e.message, 'error'); } }
    async function abrirModalEditarUsuario(itemStr) { const item = JSON.parse(itemStr.replace(/&apos;/g, "'").replace(/&quot;/g, '"')); document.getElementById('editUsuarioId').value = item._id; document.getElementById('editUsuarioName').value = item.username; document.getElementById('editUsuarioEmail').value = item.email || ''; document.getElementById('editUsuarioRole').value = item.role; document.getElementById('editUsuarioPass').value = ''; const selectArtista = document.getElementById('editUsuarioArtista'); if (selectArtista) { selectArtista.innerHTML = '<option value="">Cargando...</option>'; try { let artistas = localCache.artistas; if (!artistas || artistas.length === 0) { artistas = await fetchAPI('/api/artistas'); localCache.artistas = artistas; } let opts = '<option value="">-- Ninguno / Sin Vínculo --</option>'; artistas.forEach(a => { const selected = (item.artistaId === a._id) ? 'selected' : ''; opts += `<option value="${a._id}" ${selected}>${escapeHTML(a.nombreArtistico || a.nombre)}</option>`; }); selectArtista.innerHTML = opts; } catch (e) { selectArtista.innerHTML = '<option value="">Error al cargar</option>'; } } document.querySelectorAll('#editUsuarioPermisosContainer input').forEach(chk => chk.checked = false); if (item.permisos && Array.isArray(item.permisos)) { item.permisos.forEach(p => { const chk = document.querySelector(`#editUsuarioPermisosContainer input[value="${p}"]`); if(chk) chk.checked = true; }); } new bootstrap.Modal(document.getElementById('modalEditarUsuario')).show(); }
    async function guardarEdicionUsuario(e) { e.preventDefault(); const id = document.getElementById('editUsuarioId').value; const pass = document.getElementById('editUsuarioPass').value; const artistaSelect = document.getElementById('editUsuarioArtista'); const artistaId = artistaSelect ? artistaSelect.value : null; const checkboxes = document.querySelectorAll('#editUsuarioPermisosContainer input:checked'); const permisos = Array.from(checkboxes).map(c => c.value); const body = { username: document.getElementById('editUsuarioName').value, email: document.getElementById('editUsuarioEmail').value, role: document.getElementById('editUsuarioRole').value, permisos: permisos, artistaId: artistaId }; if(pass) body.password = pass; try { await fetchAPI(`/api/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(body) }); showToast('Usuario actualizado y vinculado.', 'success'); bootstrap.Modal.getInstance(document.getElementById('modalEditarUsuario')).hide(); localCache.usuarios =[]; renderPaginatedList('usuarios'); } catch (e) { showToast(e.message, 'error'); } }
    function editarInfoProyecto(id) { let proyecto = localCache.proyectos.find(p => p._id === id); if(!proyecto) proyecto = historialCacheados.find(p => p._id === id); if (!proyecto) return showToast('Proyecto no encontrado', 'error'); Swal.fire({ title: 'Editar Información', html: `<input id="swal-nombre" class="swal2-input" placeholder="Nombre del Proyecto" value="${escapeHTML(proyecto.nombreProyecto || '')}"><input id="swal-total" type="number" class="swal2-input" placeholder="Precio Total ($)" value="${proyecto.total || 0}">`, focusConfirm: false, preConfirm: () => { return[ document.getElementById('swal-nombre').value, document.getElementById('swal-total').value ] } }).then(async (result) => { if (result.isConfirmed) { const [nuevoNombre, nuevoTotalStr] = result.value; const nuevoTotal = parseFloat(nuevoTotalStr); try { if (nuevoNombre.trim() !== proyecto.nombreProyecto) { await fetchAPI(`/api/proyectos/${id}/nombre`, { method: 'PUT', body: JSON.stringify({ nombreProyecto: nuevoNombre.trim() }) }); proyecto.nombreProyecto = nuevoNombre.trim(); } if (!isNaN(nuevoTotal) && nuevoTotal !== proyecto.total) { await fetchAPI(`/api/proyectos/${id}`, { method: 'PUT', body: JSON.stringify({ total: nuevoTotal }) }); proyecto.total = nuevoTotal; } showToast('Proyecto actualizado.', 'success'); if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtro = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos'; cargarFlujoDeTrabajo(filtro); } else if (document.getElementById('vista-artista').classList.contains('active')) { const nombreActual = document.getElementById('vista-artista-nombre').textContent; const art = localCache.artistas.find(a => a.nombre === nombreActual || a.nombreArtistico === nombreActual); if (art) mostrarVistaArtista(art._id, nombreActual, ''); } } catch (e) { showToast(`Error al editar`, 'error'); } } }); }
    async function registrarPago(proyectoId, desdeHistorial = false) { let proyecto; try { proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); } catch(e) { return showToast('Proyecto no encontrado.', 'error'); } const restante = proyecto.total - (proyecto.montoPagado || 0); Swal.fire({ title: 'Registrar Pago', html: `<p>Saldo Restante: <strong class="text-danger">$${safeMoney(restante)}</strong></p>` + '<input id="swal-monto" type="number" class="swal2-input" placeholder="Monto a pagar" value="' + (restante > 0 ? restante.toFixed(2) : '0.00') + '">' + '<select id="swal-metodo" class="swal2-select"><option value="Transferencia">Transferencia</option><option value="Efectivo">Efectivo</option><option value="Tarjeta">Tarjeta</option></select>', focusConfirm: false, preConfirm: () => { return[ document.getElementById('swal-monto').value, document.getElementById('swal-metodo').value ] } }).then(async (result) => { if (result.value) { const [montoStr, metodo] = result.value; const monto = parseFloat(montoStr); if (isNaN(monto) || monto <= 0) return showToast('Monto inválido.', 'error'); try { const proyectoActualizado = await fetchAPI(`/api/proyectos/${proyectoId}/pagos`, { method: 'POST', body: JSON.stringify({ monto, metodo }) }); showToast(proyectoActualizado.offline ? 'Pago registrado en cola offline.' : '¡Pago registrado exitosamente!', proyectoActualizado.offline ? 'info' : 'success'); const ultimoPago = proyectoActualizado.pagos[proyectoActualizado.pagos.length - 1]; await generarReciboPDF(proyectoActualizado, ultimoPago); if (document.getElementById('pagos').classList.contains('active')) { cargarPagos(); } else if (desdeHistorial) { cargarHistorial(); } else { cargarFlujoDeTrabajo(); } } catch (error) { showToast(`Error: ${error.message}`, 'error'); } } }); }
    async function cargarPagos() { document.querySelector('#pagos .btn-group button.active')?.classList.remove('active'); const btnPendientes = document.querySelector('#pagos .btn-group button'); if (btnPendientes) btnPendientes.classList.add('active'); mostrarSeccionPagos('pendientes', btnPendientes); }
    function mostrarSeccionPagos(vista, btn) { document.querySelectorAll('#pagos .btn-group button').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); if (vista === 'pendientes') { document.getElementById('vista-pagos-pendientes').style.display = 'block'; document.getElementById('vista-pagos-historial').style.display = 'none'; cargarPagosPendientes(); } else { document.getElementById('vista-pagos-pendientes').style.display = 'none'; document.getElementById('vista-pagos-historial').style.display = 'block'; cargarHistorialPagos(); } }
    
    async function cargarPagosPendientes() { 
        const tabla = document.getElementById('tablaPendientesBody'); 
        tabla.innerHTML = '<tr><td colspan="5">Calculando saldos pendientes...</td></tr>'; 
        await fetchAPI('/api/proyectos'); 
        const userInfo = getUserRoleAndId(); 
        const isClient = userInfo.role === 'cliente'; 
        pagosPendientesCacheados = localCache.proyectos.filter(p => { 
            if (isClient && (!p.artista || p.artista._id !== userInfo.artistaId)) return false; 
            const pagado = p.montoPagado || 0; 
            return (p.total > pagado) && p.estatus !== 'Cancelado' && p.estatus !== 'Cotizacion' && !p.deleted; 
        }); 
        tablePagination.pagosPendientes.page = 1;
        renderPagosPendientesTable();
    }
    
    function renderPagosPendientesTable() {
        const tabla = document.getElementById('tablaPendientesBody');
        let items = pagosPendientesCacheados ||[];
        const userInfo = getUserRoleAndId(); 
        const isClient = userInfo.role === 'cliente'; 

        const filterText = tablePagination.pagosPendientes.filter || '';
        if(filterText) {
            items = items.filter(p => {
                const artista = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Cliente General';
                const proyecto = p.nombreProyecto || 'Proyecto sin nombre';
                return `${artista} ${proyecto}`.toLowerCase().includes(filterText);
            });
        }

        const { page, limit } = tablePagination.pagosPendientes;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit) || 1;

        if (items.length === 0) { 
            tabla.innerHTML = '<tr><td colspan="5" class="text-center">¡Todo al día! No hay pagos pendientes.</td></tr>'; 
            renderTableControls('tablaPendientesBody', 'pagosPendientes', 1, 0);
            return; 
        } 
        
        tabla.innerHTML = paginatedItems.map(p => { 
            const deuda = p.total - (p.montoPagado || 0); 
            const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Cliente General'; 
            const proyectoNombre = p.nombreProyecto || 'Proyecto sin nombre'; 
            let buttons = ''; 
            if (!isClient) { 
                buttons = `<button class="btn btn-sm btn-success" onclick="app.registrarPago('${p._id}')">Cobrar <i class="bi bi-cash"></i></button><button class="btn btn-sm btn-outline-primary" onclick="app.compartirRecordatorioPago('${p._id}')">Recordar <i class="bi bi-whatsapp"></i></button>`; 
            } 
            return `<tr><td data-label="Proyecto"><div style="font-weight:bold;">${escapeHTML(proyectoNombre)}</div><div style="font-size:0.85em; color:var(--text-color-light);">${escapeHTML(artistaNombre)}</div></td><td data-label="Total">$${safeMoney(p.total)}</td><td data-label="Pagado">$${safeMoney(p.montoPagado)}</td><td data-label="Restante" style="color:var(--danger-color); font-weight:700;">$${safeMoney(deuda)}</td><td data-label="Acciones" class="table-actions">${buttons}</td></tr>`; 
        }).join('');
        
        renderTableControls('tablaPendientesBody', 'pagosPendientes', page, totalPages);
    }

    async function cargarHistorialPagos() { 
        const tablaBody = document.getElementById('tablaPagosBody'); 
        tablaBody.innerHTML = `<tr><td colspan="5">Cargando historial de pagos...</td></tr>`; 
        const userInfo = getUserRoleAndId(); 
        const isClient = userInfo.role === 'cliente'; 
        try { 
            const proyectosFresh = await fetchAPI('/api/proyectos'); 
            let pagos =[]; 
            if (isClient) { 
                const misProyectos = proyectosFresh.filter(p => p.artista && p.artista._id === userInfo.artistaId); 
                misProyectos.forEach(proj => { 
                    if (proj.pagos && proj.pagos.length > 0) { 
                        proj.pagos.forEach(pago => { 
                            pagos.push({ fecha: pago.fecha || new Date().toISOString(), artista: proj.nombreProyecto || 'Proyecto', monto: pago.monto, metodo: pago.metodo, proyectoId: proj._id, pagoId: pago._id }); 
                        }); 
                    } 
                }); 
            } else { 
                proyectosFresh.forEach(proj => { 
                    if (proj.pagos && proj.pagos.length > 0) { 
                        proj.pagos.forEach(pago => { 
                            pagos.push({ fecha: pago.fecha || new Date().toISOString(), artista: proj.artista ? (proj.artista.nombreArtistico || proj.artista.nombre) : 'Público General', monto: pago.monto, metodo: pago.metodo, proyectoId: proj._id, pagoId: pago._id }); 
                        }); 
                    } 
                }); 
            } 
            pagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); 
            pagosHistorialCacheados = pagos;
            tablePagination.pagosHistorial.page = 1;
            renderPagosHistorialTable();
        } catch (e) { 
            tablaBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error al cargar el historial de pagos.</td></tr>`; 
        } 
    }
    
    function renderPagosHistorialTable() {
        const tablaBody = document.getElementById('tablaPagosBody');
        let items = pagosHistorialCacheados ||[];
        const userInfo = getUserRoleAndId(); 
        const isClient = userInfo.role === 'cliente'; 

        const filterText = tablePagination.pagosHistorial.filter || '';
        if (filterText) {
            items = items.filter(p => {
                return p.artista.toLowerCase().includes(filterText) || p.metodo.toLowerCase().includes(filterText);
            });
        }

        const { page, limit } = tablePagination.pagosHistorial;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit) || 1;

        if (items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay pagos registrados en el historial.</td></tr>`; 
            renderTableControls('tablaPagosBody', 'pagosHistorial', 1, 0);
            return;
        }

        tablaBody.innerHTML = paginatedItems.map(p => { 
            let buttons = `<button class="btn btn-sm btn-outline-secondary" title="Reimprimir Recibo" onclick="app.reimprimirRecibo('${p.proyectoId}', '${p.pagoId}')"><i class="bi bi-file-earmark-pdf"></i></button>`; 
            if (!isClient) { 
                buttons += `<button class="btn btn-sm btn-outline-danger" title="Eliminar Pago" onclick="app.eliminarPago('${p.proyectoId}', '${p.pagoId}')"><i class="bi bi-trash"></i></button>`; 
            } 
            return `<tr><td data-label="Fecha">${safeDate(p.fecha)}</td><td data-label="Proyecto">${escapeHTML(p.artista)}</td><td data-label="Monto">$${safeMoney(p.monto)}</td><td data-label="Método">${escapeHTML(p.metodo)}</td><td data-label="Acciones" class="table-actions">${buttons}</td></tr>`; 
        }).join('');

        renderTableControls('tablaPagosBody', 'pagosHistorial', page, totalPages);
    }

    async function reimprimirRecibo(proyectoId, pagoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const pago = proyecto.pagos.find(p => p._id === pagoId); if (!pago) return showToast('Pago no encontrado en el proyecto.', 'error'); await generarReciboPDF(proyecto, pago); } catch (e) { showToast('Error al generar recibo.', 'error'); } }
    async function compartirRecordatorioPago(proyectoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const nombreCliente = proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'cliente'; const restante = proyecto.total - (proyecto.montoPagado || 0); const mensaje = `¡Hola ${nombreCliente}! Te enviamos un recordatorio de FiaRecords sobre tu proyecto "${proyecto.nombreProyecto || 'General'}".\n\nEl saldo pendiente es de: *$${safeMoney(restante)} MXN*.\n\nQuedamos a tus órdenes.`; window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank'); } catch(e) { showToast('Error al obtener datos del proyecto', 'error'); } }
    async function eliminarPago(proyectoId, pagoId) { Swal.fire({ title: '¿Eliminar este pago?', text: "Esta acción afectará el saldo del proyecto.", icon: 'error', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33' }).then(async (result) => { if(result.isConfirmed){ try { await fetchAPI(`/api/proyectos/${proyectoId}/pagos/${pagoId}`, { method: 'DELETE' }); showToast('Pago eliminado.', 'success'); cargarPagos(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } } }); }
    function cerrarSesionConfirmacion() { Swal.fire({ title: '¿Salir?', text: "Cerrarás tu sesión actual", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Salir', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33' }).then((result) => { if (result.isConfirmed) showLogin(); }); }
    function toggleAuth(view) {['login-view', 'register-view', 'recover-view', 'reset-password-view'].forEach(v => { const el = document.getElementById(v); if(el) el.style.display = 'none'; }); const active = document.getElementById(`${view}-view`); if(active) active.style.display = 'block'; document.getElementById('login-error').textContent = ''; }
    function showResetPasswordView(token) { document.body.classList.add('auth-visible'); DOMElements.appWrapper.style.display = 'none'; DOMElements.loginContainer.style.display = 'flex'; document.getElementById('reset-token').value = token; toggleAuth('reset'); }
    async function resetPassword(e) { e.preventDefault(); const token = document.getElementById('reset-token').value; const password = document.getElementById('new-password').value; try { const res = await fetch(`${API_URL}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: password }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); showToast('¡Contraseña actualizada!', 'success'); toggleAuth('login'); } catch (err) { document.getElementById('login-error').textContent = err.message; } }
    async function registerUser(e) { e.preventDefault(); const username = document.getElementById('reg-username').value; const email = document.getElementById('reg-email').value; const password = document.getElementById('reg-password').value; const nombreArtistico = document.getElementById('reg-artistname').value; try { const res = await fetch(`${API_URL}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password, role: 'Cliente', nombre: nombreArtistico, createArtist: true }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); showToast('¡Cuenta creada!', 'success'); toggleAuth('login'); } catch (err) { document.getElementById('login-error').textContent = err.message; } }
    async function recoverPassword(e) { e.preventDefault(); const email = document.getElementById('rec-email').value; try { const res = await fetch(`${API_URL}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); showToast('Correo enviado.', 'success'); toggleAuth('login'); } catch (err) { document.getElementById('login-error').textContent = err.message; } }
    
    function toggleInputsHorario(index) {
        const isChecked = document.getElementById(`dia-activo-${index}`).checked;
        document.getElementById(`dia-inicio-${index}`).disabled = !isChecked;
        document.getElementById(`dia-fin-${index}`).disabled = !isChecked;
    }

    async function guardarHorariosConfig(e) {
        e.preventDefault();
        const horarioLaboral = {};
        for (let i = 0; i < 7; i++) {
            horarioLaboral[i.toString()] = {
                activo: document.getElementById(`dia-activo-${i}`).checked,
                inicio: document.getElementById(`dia-inicio-${i}`).value,
                fin: document.getElementById(`dia-fin-${i}`).value
            };
        }
        try {
            const res = await fetchAPI('/api/configuracion/horarios', {
                method: 'PUT',
                body: JSON.stringify({ horarioLaboral })
            });
            configCache.horarioLaboral = res.horarioLaboral; 
            showToast('Horarios actualizados correctamente', 'success');
        } catch (err) {
            showToast('Error al guardar horarios', 'error');
        }
    }
    
    function initAppEventListeners(payload) { 
        window.addEventListener('hashchange', () => { const section = location.hash.replace('#', ''); if (section) mostrarSeccion(section, false); }); 
        ['Servicios', 'Artistas', 'Usuarios'].forEach(type => { const form = document.getElementById(`form${type}`); if(form) form.addEventListener('submit', (e) => saveItem(e, type.toLowerCase())); }); 
        document.getElementById('formEditarArtista').addEventListener('submit', guardarEdicionArtista); 
        document.getElementById('formEditarServicio').addEventListener('submit', guardarEdicionServicio); 
        document.getElementById('formEditarUsuario').addEventListener('submit', guardarEdicionUsuario); 
        document.getElementById('firma-input').addEventListener('change', subirFirma); 
        document.getElementById('proyectoDescuento').addEventListener('input', mostrarProyectoActual); 
        
        // Plan Mensual event listeners
        const esPlanMensualCheckbox = document.getElementById('esPlanMensual');
        const camposPlanMensual = document.getElementById('camposPlanMensual');
        const serviciosPorMesInput = document.getElementById('serviciosPorMes');
        const duracionMesesInput = document.getElementById('duracionMeses');
        
        if (esPlanMensualCheckbox && camposPlanMensual) {
            esPlanMensualCheckbox.addEventListener('change', (e) => {
                camposPlanMensual.style.display = e.target.checked ? 'block' : 'none';
                mostrarProyectoActual(); // Recalculate total
            });
        }
        
        if (serviciosPorMesInput) {
            serviciosPorMesInput.addEventListener('input', mostrarProyectoActual);
        }
        
        if (duracionMesesInput) {
            duracionMesesInput.addEventListener('input', mostrarProyectoActual);
        }
        
        const modalDatosBancarios = document.getElementById('modalDatosBancarios'); 
        if (modalDatosBancarios) { modalDatosBancarios.addEventListener('show.bs.modal', function () { cargarDatosBancariosEnModal(); }); } 
        setupMobileMenu(); 
        if (DOMElements.logoutButton) { DOMElements.logoutButton.onclick = cerrarSesionConfirmacion; } 
        window.addEventListener('online', OfflineManager.updateIndicator); 
        window.addEventListener('offline', OfflineManager.updateIndicator); 
        OfflineManager.updateIndicator(); 
        
        document.querySelectorAll('.theme-switch-checkbox').forEach(chk => {
            chk.addEventListener('change', (e) => {
                toggleTheme(e.target.checked);
            });
        });

        // NUEVO: Listener para el formulario de plantillas
        const formPlantillas = document.getElementById('form-plantillas');
        if (formPlantillas) {
            formPlantillas.addEventListener('submit', guardarPlantillasConfig);
        }
    }
    
    function setupCustomization(payload) { 
        if (payload.role === 'admin') { 
            const appLogo = document.getElementById('app-logo');
            const logoInput = document.getElementById('logo-input');
            const faviconInput = document.getElementById('favicon-input');
            
            if (appLogo && logoInput) { 
                appLogo.style.cursor = 'pointer'; 
                appLogo.title = 'Haz clic para cambiar el logo'; 
                
                appLogo.onclick = () => {
                    logoInput.click();
                }; 
                
                logoInput.onchange = async (event) => { 
                    const file = event.target.files[0]; 
                    if (!file) return; 
                    const formData = new FormData(); 
                    formData.append('logoFile', file); 
                    try { 
                        const res = await fetchAPI('/api/configuracion/upload-logo', { method: 'POST', body: formData, isFormData: true }); 
                        showToast('Logo actualizado!', 'success'); 
                        
                        if(res && res.logoBase64) { 
                            appLogo.src = res.logoBase64; 
                            if (document.getElementById('login-logo')) document.getElementById('login-logo').src = res.logoBase64;
                            logoBase64 = res.logoBase64;
                            await localforage.setItem('cached_logo_path', res.logoBase64);
                        } else {
                            await loadInitialConfig(); 
                            if(configCache && configCache.logoBase64) { 
                                appLogo.src = configCache.logoBase64; 
                                if (document.getElementById('login-logo')) document.getElementById('login-logo').src = configCache.logoBase64;
                                logoBase64 = configCache.logoBase64;
                            } 
                        }
                    } catch (e) { 
                        showToast(`Error al subir logo`, 'error'); 
                    } 
                }; 
            } 

            if (faviconInput) {
                faviconInput.onchange = async (event) => {
                    const file = event.target.files[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('faviconFile', file);
                    try {
                        const res = await fetchAPI('/api/configuracion/upload-favicon', { method: 'POST', body: formData, isFormData: true });
                        showToast('Favicon actualizado!', 'success');
                        
                        let faviconUrl = res.faviconBase64;
                        if (!faviconUrl) {
                            await loadInitialConfig();
                            faviconUrl = configCache && configCache.faviconBase64 ? configCache.faviconBase64 : '';
                        }
                        if (faviconUrl) {
                            let link = document.querySelector("link[rel~='icon']");
                            if (!link) {
                                link = document.createElement('link');
                                link.rel = 'icon';
                                document.head.appendChild(link);
                            }
                            link.href = faviconUrl;
                            await localforage.setItem('cached_favicon_path', faviconUrl);
                        }
                    } catch (e) {
                        showToast(`Error al subir favicon`, 'error');
                    }
                };
            }
        } 
    }
    
    function renderSidebar(user) { 
        const navContainer = document.getElementById('sidebar-nav-container'); 
        let p = user.permisos ||[]; 
        const role = user.role ? user.role.toLowerCase() : 'cliente'; 
        let html = ''; 
        if (role === 'cliente') { 
            html = `<div class="nav-group mb-3"><div class="text-uppercase text-muted small fw-bold px-3 mb-2">Mi Espacio</div><a class="nav-link-sidebar active" data-seccion="vista-artista" onclick="app.irAVistaArtista()"><i class="bi music-note-beamed"></i> Mis Proyectos</a><a class="nav-link-sidebar" data-seccion="pagos"><i class="bi cash-stack"></i> Mis Pagos</a></div>`; 
        } else { 
            const isSuperAdmin = role === 'admin'; 
            const canAccess = (permKey) => isSuperAdmin || p.includes(permKey); 
            
            html = `<div class="nav-group mb-3">
                        <div class="text-uppercase text-muted small fw-bold px-3 mb-2">Proyectos</div>
                        ${canAccess('dashboard') ? '<a class="nav-link-sidebar" data-seccion="dashboard"><i class="bi speedometer2"></i> Dashboard</a>' : ''}
                        ${canAccess('agenda') ? '<a class="nav-link-sidebar" data-seccion="agenda"><i class="bi calendar-event"></i> Agenda</a>' : ''}
                        ${canAccess('flujo-trabajo') ? '<a class="nav-link-sidebar" data-seccion="flujo-trabajo"><i class="bi kanban"></i> Flujo de Trabajo</a>' : ''}
                        ${canAccess('cotizaciones') ? '<a class="nav-link-sidebar" data-seccion="cotizaciones"><i class="bi file-earmark-text"></i> Cotizaciones</a>' : ''}
                        ${canAccess('historial-proyectos') ? '<a class="nav-link-sidebar" data-seccion="historial-proyectos"><i class="bi clock-history"></i> Historial</a>' : ''}
                        ${canAccess('pagos') ? '<a class="nav-link-sidebar" data-seccion="pagos"><i class="bi cash-stack"></i> Gestión de Pagos</a>' : ''}
                    </div>
                    <div class="nav-group mb-3">
                        <div class="text-uppercase text-muted small fw-bold px-3 mb-2">Gestión</div>
                        ${canAccess('gestion-artistas') ? '<a class="nav-link-sidebar" data-seccion="gestion-artistas"><i class="bi people"></i> Artistas</a>' : ''}
                        ${canAccess('gestion-servicios') ? '<a class="nav-link-sidebar" data-seccion="gestion-servicios"><i class="bi tags"></i> Servicios</a>' : ''}
                        ${canAccess('gestion-usuarios') ? '<a class="nav-link-sidebar" data-seccion="gestion-usuarios"><i class="bi person-badge"></i> Usuarios</a>' : ''}
                    </div>`;

            if (isSuperAdmin) {
                html += `<div class="nav-group">
                            <div class="text-uppercase text-muted small fw-bold px-3 mb-2">Administrador</div>
                            <a class="nav-link-sidebar text-danger" data-seccion="mis-deudas"><i class="bi wallet2"></i> Mis Deudas</a>
                            <a class="nav-link-sidebar" data-seccion="configuracion"><i class="bi gear"></i> Configuración</a>
                            <a class="nav-link-sidebar" data-seccion="papelera-reciclaje"><i class="bi trash"></i> Papelera</a>
                         </div>`;
            }
        } 
        navContainer.innerHTML = html; 
        document.querySelectorAll('.nav-link-sidebar').forEach(link => { link.addEventListener('click', (e) => { if(!e.currentTarget.onclick) { e.preventDefault(); mostrarSeccion(e.currentTarget.dataset.seccion); } }); }); 
    }

    // ==================================================================
    // MODULO DE DEUDAS PERSONALES (ADMIN)
    // ==================================================================
    async function cargarDeudas() {
        const tabla = document.getElementById('tablaDeudasBody');
        if(!tabla) return;
        tabla.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
        try {
            const data = await fetchAPI('/api/deudas');
            localCache.deudas = data;
            renderDeudas();
        } catch (error) {
            tabla.innerHTML = '<tr><td colspan="6" class="text-danger">Error al cargar o acceso denegado.</td></tr>';
        }
    }

    function renderDeudas() {
        const tabla = document.getElementById('tablaDeudasBody');
        if(!tabla) return;
        let totalGlobal = 0;

        if (!localCache.deudas || localCache.deudas.length === 0) {
            tabla.innerHTML = '<tr><td colspan="6" class="text-center">No hay deudas registradas. ¡Excelente!</td></tr>';
            document.getElementById('total-deuda-global').textContent = '$0.00';
            return;
        }

        tabla.innerHTML = localCache.deudas.map(d => {
            const restante = d.total - d.montoPagado;
            totalGlobal += restante;

            const badge = d.estatus === 'Liquidada' 
                ? '<span class="badge bg-success">Liquidada</span>' 
                : '<span class="badge bg-danger">Pendiente</span>';
            
            let btnPagar = d.estatus !== 'Liquidada' 
                ? `<button class="btn btn-sm btn-success text-white" title="Abonar" onclick="app.abonarDeuda('${d._id}', ${restante})"><i class="bi bi-cash"></i></button>`
                : '';

            return `
            <tr class="${d.estatus === 'Liquidada' ? 'fila-cancelada' : ''}">
                <td data-label="Concepto"><strong>${escapeHTML(d.concepto)}</strong></td>
                <td data-label="Total">$${safeMoney(d.total)}</td>
                <td data-label="Abonado">$${safeMoney(d.montoPagado)}</td>
                <td data-label="Restante" class="text-danger fw-bold">$${safeMoney(restante)}</td>
                <td data-label="Estatus">${badge}</td>
                <td data-label="Acciones" class="table-actions">
                    ${btnPagar}
                    <button class="btn btn-sm btn-outline-info" title="Historial" onclick="app.verHistorialDeuda('${d._id}')"><i class="bi bi-clock-history"></i></button>
                    <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="app.eliminarDeuda('${d._id}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('');

        document.getElementById('total-deuda-global').textContent = `$${safeMoney(totalGlobal)}`;
    }

    function abrirModalNuevaDeuda() {
        Swal.fire({
            title: 'Registrar Deuda',
            html: `
                <input id="deuda-concepto" class="swal2-input" placeholder="¿Qué se debe? (Ej: Micro, Banco)">
                <input id="deuda-total" type="number" class="swal2-input" placeholder="Monto total ($)" step="0.01" min="0">
            `,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const c = document.getElementById('deuda-concepto').value;
                const t = document.getElementById('deuda-total').value;
                if (!c || !t) {
                    Swal.showValidationMessage('Llena todos los campos');
                    return false;
                }
                return { concepto: c, total: t };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await fetchAPI('/api/deudas', { method: 'POST', body: JSON.stringify(result.value) });
                    showToast('Deuda registrada', 'success');
                    cargarDeudas();
                } catch (e) { showToast(e.message, 'error'); }
            }
        });
    }

    function abonarDeuda(id, maxRestante) {
        Swal.fire({
            title: 'Registrar Abono',
            html: `
                <p>Restante: <strong class="text-danger">$${safeMoney(maxRestante)}</strong></p>
                <input id="abono-monto" type="number" class="swal2-input" placeholder="Monto a abonar" value="${maxRestante}" step="0.01" min="0.01" max="${maxRestante}">
                <input id="abono-nota" class="swal2-input" placeholder="Nota (Opcional)">
            `,
            showCancelButton: true,
            confirmButtonText: 'Abonar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const m = document.getElementById('abono-monto').value;
                const n = document.getElementById('abono-nota').value;
                if (!m || m <= 0) {
                    Swal.showValidationMessage('Monto inválido');
                    return false;
                }
                return { monto: m, nota: n };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await fetchAPI(`/api/deudas/${id}/pagos`, { method: 'POST', body: JSON.stringify(result.value) });
                    showToast('Abono registrado', 'success');
                    cargarDeudas();
                } catch (e) { showToast(e.message, 'error'); }
            }
        });
    }

    function verHistorialDeuda(id) {
        const deuda = localCache.deudas.find(d => d._id === id);
        if(!deuda || !deuda.pagos || deuda.pagos.length === 0) {
            return Swal.fire('Historial', 'No hay abonos registrados en esta deuda.', 'info');
        }
        
        let htmlLista = deuda.pagos.map(p => `
            <div class="d-flex justify-content-between border-bottom p-2 small text-start">
                <span>${safeDate(p.fecha)} ${p.nota ? `(<i class="text-muted">${escapeHTML(p.nota)}</i>)` : ''}</span>
                <strong class="text-success">+$${safeMoney(p.monto)}</strong>
            </div>
        `).join('');

        Swal.fire({
            title: `Abonos: ${escapeHTML(deuda.concepto)}`,
            html: `<div style="max-height: 250px; overflow-y:auto;">${htmlLista}</div>`,
            confirmButtonText: 'Cerrar'
        });
    }

    function eliminarDeuda(id) {
        Swal.fire({
            title: '¿Borrar deuda?',
            text: 'Se eliminará de tu lista visible.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, borrar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await fetchAPI(`/api/deudas/${id}`, { method: 'DELETE' });
                    showToast('Deuda eliminada', 'info');
                    cargarDeudas();
                } catch (e) { showToast(e.message, 'error'); }
            }
        });
    }

    // ==================================================================
    // INITIALIZATION & EVENT LISTENERS
    // ==================================================================
    (async function init() {
        // 1. CARGAR DB LOCAL PRIMERO
        await cargarCacheDesdeIndexedDB();

        // 2. CARGAR ASSETS LOCALES
        const cachedLogo = await localforage.getItem('cached_logo_path');
        if(cachedLogo) {
            if(DOMElements.appLogo) DOMElements.appLogo.src = cachedLogo; 
            if(DOMElements.loginLogo) DOMElements.loginLogo.src = cachedLogo;
            logoBase64 = cachedLogo;
        }

        const cachedFavicon = await localforage.getItem('cached_favicon_path');
        if (cachedFavicon) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = cachedFavicon;
        }

        setupFooterYear();

        document.querySelectorAll('.theme-switch-checkbox').forEach(chk => {
            chk.addEventListener('change', (e) => {
                toggleTheme(e.target.checked);
            });
        });

        await fetchPublicLogo();
        await loadInitialConfig();
        setTimeout(preloadLogoForPDF, 2000);
        
        const savedTheme = localStorage.getItem('theme') === 'dark'; 
        toggleTheme(savedTheme);
        
        setupAuthListeners();

        const path = window.location.pathname;
        if (path.startsWith('/reset-password/')) {
             const token = path.split('/').pop();
             if(token) showResetPasswordView(token);
             return;
        }

        const token = localStorage.getItem('token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (navigator.onLine && payload.exp * 1000 < Date.now()) return showLogin();
                await showApp(payload);
            } catch (e) { showLogin(); }
        } else { showLogin(); }
    })();

    // ==================================================================
    // GENERACIÓN DE CONTRATOS PDF CON MEJORAS PROFESIONALES
    // ==================================================================
    async function generarContratoPDF(proyectoId) {
        try {
            // TAREA 1: SIEMPRE hacer fetch para obtener datos frescos (incluyendo firmaCliente)
            let proyecto;
            if (typeof proyectoId === 'string') {
                proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`);
            } else {
                proyecto = proyectoId;
            }
            
            if (!proyecto) {
                showToast('Proyecto no encontrado', 'error');
                return;
            }

            // Cargar configuración si no existe
            if (!configCache) {
                await loadInitialConfig();
            }

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF();

            await preloadLogoForPDF();
            if (logoBase64) {
                dibujarLogoEnPDF(pdf, logoBase64);
            }

            // Título del contrato
            pdf.setFontSize(18);
            pdf.setFont(undefined, 'bold');
            pdf.text('CONTRATO DE PRESTACIÓN DE SERVICIOS', 105, 60, { align: 'center' });

            const fileName = `Contrato-${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`;
            await addFirmaToPdf(pdf, 'contrato', fileName, proyecto);
            
            showToast('Contrato generado exitosamente', 'success');
        } catch (error) {
            console.error('Error al generar contrato:', error);
            showToast('Error al generar contrato', 'error');
        }
    }

    // ==================================================================
    // TAREA 2: FIRMA DIGITAL DEL CLIENTE (Lógica Completa)
    // ==================================================================
    let canvasFirma = null;
    let ctxFirma = null;
    let isDrawing = false;
    let proyectoActualFirma = null;

    function inicializarCanvasFirma() {
        canvasFirma = document.getElementById('canvas-firma');
        if (!canvasFirma) return;
        
        ctxFirma = canvasFirma.getContext('2d');
        const rect = canvasFirma.getBoundingClientRect();
        canvasFirma.width = rect.width;
        canvasFirma.height = 200;
        
        ctxFirma.strokeStyle = '#000';
        ctxFirma.lineWidth = 2;
        ctxFirma.lineCap = 'round';
        ctxFirma.lineJoin = 'round';
        
        canvasFirma.addEventListener('mousedown', startDrawing);
        canvasFirma.addEventListener('mousemove', draw);
        canvasFirma.addEventListener('mouseup', stopDrawing);
        canvasFirma.addEventListener('mouseout', stopDrawing);
        
        canvasFirma.addEventListener('touchstart', handleTouch, {passive: false});
        canvasFirma.addEventListener('touchmove', handleTouch, {passive: false});
        canvasFirma.addEventListener('touchend', stopDrawing);
    }

    function startDrawing(e) {
        isDrawing = true;
        const rect = canvasFirma.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        ctxFirma.beginPath();
        ctxFirma.moveTo(x, y);
    }

    function draw(e) {
        if (!isDrawing) return;
        const rect = canvasFirma.getBoundingClientRect();
        const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
        const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
        ctxFirma.lineTo(x, y);
        ctxFirma.stroke();
    }

    function stopDrawing() { isDrawing = false; }

    function handleTouch(e) {
        e.preventDefault();
        if (e.type === 'touchstart') startDrawing(e);
        else if (e.type === 'touchmove') draw(e);
    }

    function limpiarCanvas() {
        if (!ctxFirma || !canvasFirma) return;
        ctxFirma.clearRect(0, 0, canvasFirma.width, canvasFirma.height);
    }

    function abrirModalFirma(proyectoId) {
        proyectoActualFirma = proyectoId;
        const modalEl = document.getElementById('modal-firma-cliente');
        if (!modalEl) {
            showToast('Error: No se encontró el modal de firma en el HTML', 'error');
            return;
        }
        
        modalEl.removeAttribute('aria-hidden'); // Elimina el conflicto de accesibilidad
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        
        // Inicializar el canvas después de que el modal se muestre
        setTimeout(inicializarCanvasFirma, 300);
    }

    async function guardarFirmaCliente() {
        if (!canvasFirma || !proyectoActualFirma) return;
        
        // Verificar si el canvas está vacío
        const blank = document.createElement('canvas');
        blank.width = canvasFirma.width;
        blank.height = canvasFirma.height;
        if (canvasFirma.toDataURL() === blank.toDataURL()) {
            showToast('Por favor, firme antes de guardar', 'warning');
            return;
        }
        
        try {
            showLoader();
            const firmaBase64 = canvasFirma.toDataURL('image/png');
            
            // Actualizar proyecto con la firma
            await fetchAPI(`/api/proyectos/${proyectoActualFirma}`, {
                method: 'PUT',
                body: JSON.stringify({ firmaCliente: firmaBase64 })
            });
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('modal-firma-cliente'));
            if (modal) modal.hide();
            
            showToast('Firma guardada correctamente', 'success');
            
            // Recargar datos para ver el badge de "Firmado"
            const currentHash = location.hash.replace('#', '') || 'dashboard';
            mostrarSeccion(currentHash, false);
            
        } catch (error) {
            showToast('Error al guardar firma: ' + error.message, 'error');
        } finally {
            hideLoader();
        }
    }

    // Función para borrar firma del cliente (solo admin)
    async function borrarFirmaCliente(proyectoId) {
        const userInfo = getUserRoleAndId();
        if (userInfo.role === 'cliente') {
            showToast('No autorizado para esta acción', 'error');
            return;
        }

        if (!confirm('¿Estás seguro de que deseas borrar la firma del cliente? Esta acción no se puede deshacer.')) {
            return;
        }

        try {
            showLoader();
            await fetchAPI(`/api/proyectos/${proyectoId}`, {
                method: 'PUT',
                body: JSON.stringify({ firmaCliente: null })
            });
            
            showToast('Firma del cliente eliminada correctamente', 'success');
            
            // Recargar datos para actualizar la vista
            const currentHash = location.hash.replace('#', '') || 'dashboard';
            mostrarSeccion(currentHash, false);
            
        } catch (error) {
            showToast('Error al borrar firma: ' + error.message, 'error');
        } finally {
            hideLoader();
        }
    }

    // --- EXPORTS ---
    window.app = {
        eliminarItem, restaurarItem, eliminarPermanente, cambiarProceso, filtrarFlujo, eliminarProyecto,
        quitarDeProyecto, agregarAProyecto, cambiarAtributo, aprobarCotizacion, generarCotizacionPDF,
        compartirPorWhatsApp, registrarPago, reimprimirRecibo, compartirRecordatorioPago, eliminarPago,
        mostrarVistaArtista, irAVistaArtista, guardarDatosBancarios, generarDatosBancariosPDF,
        compartirDatosBancariosWhatsApp, openDeliveryModal, saveDeliveryLink, editarInfoProyecto,
        filtrarTablas, actualizarHorarioProyecto, cargarAgenda, cancelarCita, subirADrive,
        syncNow: OfflineManager.syncNow, mostrarSeccion, mostrarSeccionPagos, cargarPagos,
        nuevoProyectoParaArtista, abrirModalEditarArtista, abrirModalEditarServicio, abrirModalEditarUsuario,
        guardarEdicionArtista, guardarEdicionServicio, guardarEdicionUsuario, generarReciboPDF,
        cerrarSesionConfirmacion, registrarNuevoArtistaDesdeFormulario, generarCotizacion,
        enviarAFlujoDirecto, toggleAuth, registerUser, recoverPassword, resetPassword,
        showResetPasswordView, changePage, irAlDashboard, verificarDisponibilidad,
        toggleInputsHorario, guardarHorariosConfig, changeTrashPage, changeTablePage,
        toggleTheme, openPlayer, playMedia, sincronizarArchivosDrive,
        cargarDeudas, abrirModalNuevaDeuda, abonarDeuda, verHistorialDeuda, eliminarDeuda,
        abrirModalProyectoDirecto, guardarProyectoDirecto,
        guardarPlantillasConfig,
        generarContratoPDF,
        abrirModalFirma, limpiarCanvas, guardarFirmaCliente, borrarFirmaCliente
    };

}); // <-- CIERRE DEL DOMCONTENTLOADED

// --- SERVICE WORKER ---
if ('serviceWorker' in navigator) { 
    window.addEventListener('load', function () { 
        navigator.serviceWorker.register('sw.js').then(function (registration) { 
            console.log('ServiceWorker OK: ', registration.scope); 
        }, function (err) { 
            console.log('ServiceWorker Falló: ', err); 
        }); 
    }); 
}