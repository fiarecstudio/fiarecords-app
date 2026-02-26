document.addEventListener('DOMContentLoaded', () => {
    // ==================================================================
    // 1. VARIABLES GLOBALES Y CONFIGURACIÓN
    // ==================================================================
    
    const DIAS_SEMANA =['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    let horariosOcupadosDelDia =[]; 

    let isInitialized = false;
    let proyectoActual = {};
    let logoBase64 = null; 
    let preseleccionArtistaId = null;

    const paginationState = {
        artistas: { page: 1, limit: 10, filter: '' },
        servicios: { page: 1, limit: 10, filter: '' },
        usuarios: { page: 1, limit: 10, filter: '' }
    };

    // --- ESTADO DE PAGINACIÓN PARA PAPELERA ---
    const trashPagination = {
        proyectos: { page: 1, limit: 10 },
        artistas: { page: 1, limit: 10 },
        servicios: { page: 1, limit: 10 },
        usuarios: { page: 1, limit: 10 }
    };

    const GAP_CONFIG = {
        apiKey: 'AIzaSyDaeTcNohqRxixSsAY58_pSyy62vsyJeXk',
        clientId: '769041146398-a0iqgdre2lrevbh1ud9i1mrs4v548rdq.apps.googleusercontent.com',
        discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
        scope: 'https://www.googleapis.com/auth/drive'
    };

    let tokenClient;
    let gapiInited = false;
    let gisInited = false;

    // Caché Local
    let localCache = {
        artistas: (JSON.parse(localStorage.getItem('cache_artistas') || '[]') ||[]),
        servicios: JSON.parse(localStorage.getItem('cache_servicios') || '[]'),
        proyectos: JSON.parse(localStorage.getItem('cache_proyectos') || '[]'),
        cotizaciones: [],
        historial:[],
        pagos: JSON.parse(localStorage.getItem('cache_pagos') || '[]'),
        usuarios: [],
        trash: { proyectos: [], artistas: [], servicios:[], usuarios:[] } 
    };

    let currentCalendar = null;
    let configCache = null;
    let chartInstance = null;
    let historialCacheados =[]; 

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
    // 2. UTILIDADES
    // ==================================================================
    
    // --- FUNCIÓN PARA AÑO DINÁMICO EN TODOS LOS FOOTERS ---
    function setupFooterYear() {
        const currentYear = new Date().getFullYear();
        document.querySelectorAll('.footer-year-span').forEach(el => {
            el.textContent = currentYear;
        });
    }

    // --- FUNCIÓN UNIFICADA PARA MODO OSCURO ---
    function toggleTheme(isDark) {
        document.body.classList.toggle('dark-mode', isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        // Sincroniza todos los interruptores (Login y App) para que muestren el mismo estado
        document.querySelectorAll('.theme-switch-checkbox').forEach(chk => {
            chk.checked = isDark;
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
                    localStorage.setItem('cached_logo_path', logoSrc);
                }
            }
        } catch (e) { console.warn("Error cargando logo público", e); }
    }

    function getUserRoleAndId() {
        const token = localStorage.getItem('token');
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
    // 3. OFFLINE MANAGER
    // ==================================================================
    const OfflineManager = {
        QUEUE_KEY: 'fia_offline_queue',
        getQueue: () => JSON.parse(localStorage.getItem(OfflineManager.QUEUE_KEY) || '[]'),
        addToQueue: (url, options, tempId = null) => {
            const queue = OfflineManager.getQueue();
            queue.push({ url, options, timestamp: Date.now(), tempId });
            localStorage.setItem(OfflineManager.QUEUE_KEY, JSON.stringify(queue));
            OfflineManager.updateIndicator();
        },
        updateIndicator: () => {
            const queue = OfflineManager.getQueue();
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
            const queue = OfflineManager.getQueue();
            if (queue.length === 0) return;
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
            let newQueue =[];
            for (const req of queue) {
                try {
                    let bodyObj = req.options.body ? JSON.parse(req.options.body) : {};
                    if (bodyObj._id && bodyObj._id.startsWith('temp_')) delete bodyObj._id;
                    const res = await fetch(req.url, { ...req.options, body: JSON.stringify(bodyObj), headers: { ...req.options.headers, ...headers } });
                    if (!res.ok) throw new Error('Failed');
                } catch (e) { newQueue.push(req); }
            }
            localStorage.setItem(OfflineManager.QUEUE_KEY, JSON.stringify(newQueue));
            if (newQueue.length === 0) {
                showToast('Sincronización completada', 'success');
                await Promise.all([fetchAPI('/api/proyectos'), fetchAPI('/api/artistas'), fetchAPI('/api/servicios')]);
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

        if ((!options.method || options.method === 'GET')) {
            if (!navigator.onLine) {
                if (url.includes('/artistas')) return localCache.artistas;
                if (url.includes('/servicios')) return localCache.servicios;
                if (url.includes('/usuarios')) return localCache.usuarios;
                if (url.includes('/proyectos')) {
                    if (url.includes('cotizaciones')) return localCache.proyectos.filter(p => p.estatus === 'Cotizacion' && !p.deleted);
                    if (url.includes('completos')) return localCache.proyectos.filter(p => p.proceso === 'Completo' && p.estatus !== 'Cancelado' && !p.deleted);
                    if (url.includes('agenda')) return localCache.proyectos.filter(p => p.estatus !== 'Cancelado' && !p.deleted).map(p => ({ id: p._id, title: p.nombreProyecto || (p.artista ? p.artista.nombre : 'Proyecto'), start: p.fecha, allDay: false, extendedProps: { ...p, servicios: p.items.map(i => i.nombre).join('\n') } }));
                    if (url.includes('papelera')) return localCache.proyectos.filter(p => p.deleted === true);
                    return localCache.proyectos.filter(p => !p.deleted);
                }
                if (url.includes('/pagos')) return localCache.pagos;
                if (url.includes('/dashboard/stats')) return { showFinancials: false, ingresosMes: 0, proyectosActivos: 0, proyectosPorCobrar: 0, monthlyIncome: [] };
            }
        }

        if (options.method &&['POST', 'PUT', 'DELETE'].includes(options.method)) {
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

            if (!options.method || options.method === 'GET') {
                if (url.includes('/artistas')) { localCache.artistas = Array.isArray(data) ? data :[]; localStorage.setItem('cache_artistas', JSON.stringify(localCache.artistas)); }
                if (url.includes('/servicios')) { localCache.servicios = data; localStorage.setItem('cache_servicios', JSON.stringify(data)); }
                if (url.includes('/usuarios')) { localCache.usuarios = data; }
                if (url.includes('/proyectos') && !url.includes('agenda')) { if (Array.isArray(data) && url === '/api/proyectos') { localCache.proyectos = data; localStorage.setItem('cache_proyectos', JSON.stringify(data)); } }
                if (url.includes('/pagos/todos')) { localCache.pagos = data; localStorage.setItem('cache_pagos', JSON.stringify(data)); }
            }
            return data;
        } catch (e) { throw e; } finally { hideLoader(); }
    }

    // ==================================================================
    // 5. GOOGLE DRIVE
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
                const fileMetadata = { 'name': nombreArtista, 'mimeType': 'application/vnd.google-apps.folder', 'parents': [idMaestra] };
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
                const fileMetadata = { 'name': nombreLimpio, 'mimeType': 'application/vnd.google-apps.folder', 'parents':[idCarpetaArtista] };
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
                
                if(statusSpan) statusSpan.textContent = 'Configurando permisos públicos...';
                await hacerCarpetaPublica(idProyecto);

                if(statusSpan) statusSpan.textContent = 'Generando enlace...';
                const getFolderRes = await gapi.client.drive.files.get({ fileId: idProyecto, fields: 'webViewLink' });
                const folderLink = getFolderRes.result.webViewLink;

                const accessToken = gapi.client.getToken().access_token;

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if(statusSpan) statusSpan.textContent = `Subiendo ${i + 1} de ${files.length}: "${file.name}"...`;
                    const metadata = { 'name': file.name, 'parents':[idProyecto] };
                    const form = new FormData();
                    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                    form.append('file', file);
                    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
                        method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }), body: form
                    });
                }

                if(linkInput) {
                    linkInput.value = folderLink; 
                    linkInput.style.borderColor = '#10b981'; 
                }
                
                if(statusSpan) { statusSpan.textContent = '¡Listo!'; statusSpan.style.color = 'var(--success-color)'; }

                await saveDeliveryLink(false, folderLink); 
                
                showToast(`¡${files.length} archivos subidos y enlace guardado!`, 'success');

                if (document.getElementById('historial-proyectos').classList.contains('active')) cargarHistorial();
                if (document.getElementById('vista-artista').classList.contains('active')) {
                    const nombreEl = document.getElementById('vista-artista-nombre');
                    if (nombreEl) {
                        const nombreActual = nombreEl.textContent;
                        const artistaEnCache = localCache.artistas.find(a => a.nombre === nombreActual || a.nombreArtistico === nombreActual);
                        if(artistaEnCache) irAVistaArtista(artistaEnCache._id, nombreActual, '');
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
        
        let proyecto = localCache.proyectos.find(p => p._id === projectId);
        if (!proyecto) {
            proyecto = historialCacheados.find(p => p._id === projectId);
        }
        
        const linkActual = proyecto ? (proyecto.enlaceEntrega || '') : '';
        modalEl.querySelector('#delivery-link-input').value = linkActual; 
        document.getElementById('drive-status').textContent = ''; 
        
        const token = localStorage.getItem('token');
        const payload = JSON.parse(atob(token.split('.')[1]));
        const isClient = payload.role.toLowerCase() === 'cliente';
        
        const uploadBtn = document.getElementById('btn-drive-upload');
        const fileInput = document.getElementById('drive-file-input');
        
        if (isClient) {
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

    async function saveDeliveryLink(cerrarModal = true, enlaceDirecto = null) { 
        const projectId = document.getElementById('delivery-project-id').value; 
        const enlace = enlaceDirecto || document.getElementById('delivery-link-input').value; 
        
        try { 
            await fetchAPI(`/api/proyectos/${projectId}/enlace-entrega`, { 
                method: 'PUT', 
                body: JSON.stringify({ enlace }) 
            }); 
            
            const indexCache = localCache.proyectos.findIndex(p => p._id === projectId);
            if (indexCache !== -1) {
                localCache.proyectos[indexCache].enlaceEntrega = enlace;
            }

            const indexHistorial = historialCacheados.findIndex(p => p._id === projectId);
            if (indexHistorial !== -1) {
                historialCacheados[indexHistorial].enlaceEntrega = enlace;
            }

            showToast('Enlace guardado permanentemente.', 'success'); 
            
            if (document.getElementById('historial-proyectos').classList.contains('active')) cargarHistorial();
            if (document.getElementById('vista-artista').classList.contains('active')) {
                const nombreEl = document.getElementById('vista-artista-nombre');
                if (nombreEl) {
                    const nombreActual = nombreEl.textContent;
                    const artistaId = localCache.artistas.find(a => a.nombre === nombreActual || a.nombreArtistico === nombreActual)?._id;
                    if(artistaId) mostrarVistaArtista(artistaId, nombreActual, ''); 
                }
            }

            if (cerrarModal) { closeDeliveryModal(); }
        } catch (e) { showToast(`Error al guardar: ${e.message}`, 'error'); } 
    }

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
    function mostrarProyectoActual() { const lista = document.getElementById('listaProyectoActual'); let subtotal = 0; lista.innerHTML = Object.values(proyectoActual).map(item => { const itemTotal = item.precioUnitario * item.unidades; subtotal += itemTotal; return `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${item.unidades}x ${escapeHTML(item.nombre)}</span><span>$${itemTotal.toFixed(2)} <button class="btn btn-sm btn-outline-danger ms-2" style="padding:0.1rem 0.4rem;" onclick="app.quitarDeProyecto('${item.id}')"><i class="bi bi-x-lg"></i></button></span></li>`; }).join(''); const descuento = parseFloat(document.getElementById('proyectoDescuento').value) || 0; const total = subtotal - descuento; document.getElementById('totalAPagar').textContent = `$${total.toFixed(2)}`; }

    async function guardarProyecto(procesoDestino) {
        const artistaSelect = document.getElementById('proyectoArtista'); const artistaId = artistaSelect.value; 
        const fechaInput = document.getElementById('fechaProyecto')._flatpickr.selectedDates[0]; 
        const horaInput = document.getElementById('horaProyecto').value; 

        if (!fechaInput) { showToast('Selecciona una fecha', 'warning'); return null; }
        if (!horaInput || horaInput === "") { showToast('Selecciona una hora disponible', 'warning'); return null; }

        let fechaFinal = new Date(fechaInput); 
        if (horaInput) { const [hours, minutes] = horaInput.split(':'); fechaFinal.setHours(hours); fechaFinal.setMinutes(minutes); }
        
        if (Object.keys(proyectoActual).length === 0) { showToast('Debes agregar al menos un servicio.', 'error'); return null; }
        
        const items = Object.values(proyectoActual).map(i => ({ servicio: i.servicioId, nombre: i.nombre, unidades: i.unidades, precioUnitario: i.precioUnitario }));
        const subtotal = items.reduce((sum, item) => sum + (item.precioUnitario * item.unidades), 0);
        const descuento = parseFloat(document.getElementById('proyectoDescuento').value) || 0;
        const total = Math.max(0, subtotal - descuento);
        
        const body = { artista: artistaId === 'publico_general' ? null : artistaId, nombreProyecto: document.getElementById('nombreProyecto').value, items: items, total: total, descuento: descuento, estatus: procesoDestino === 'Cotizacion' ? 'Cotizacion' : 'Pendiente de Pago', metodoPago: 'Pendiente', fecha: fechaFinal.toISOString(), prioridad: 'Normal', proceso: procesoDestino, esAlbum: document.getElementById('esAlbum').checked };
        try { return await fetchAPI('/api/proyectos', { method: 'POST', body: JSON.stringify(body) }); } catch (error) { showToast(`Error al guardar: ${error.message}`, 'error'); return null; }
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
    async function cambiarAtributo(id, campo, valor) { try { await fetchAPI(`/api/proyectos/${id}/${campo}`, { method: 'PUT', body: JSON.stringify({ [campo]: valor }) }); const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto) proyecto[campo] = valor; if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtroActual = document.querySelector('#filtrosFlujo button.active').textContent.trim(); filtrarFlujo(filtroActual); } } catch (e) { showToast(`Error: ${e.message}`, 'error'); } }
    async function aprobarCotizacion(id) { Swal.fire({ title: '¿Aprobar?', text: "Se agendará.", icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, aprobar', cancelButtonText: 'Cancelar' }).then(async (result) => { if(result.isConfirmed) { try { await fetchAPI(`/api/proyectos/${id}/proceso`, { method: 'PUT', body: JSON.stringify({ proceso: 'Agendado' }) }); showToast('¡Cotización aprobada!', 'success'); mostrarSeccion('flujo-trabajo'); } catch (error) { showToast(`Error al aprobar: ${error.message}`, 'error'); } } }); }
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
                card.innerHTML = `<div class="project-card-header d-flex justify-content-between align-items-center mb-2"><strong class="text-primary ${p.artista ? 'clickable-artist' : ''}" ${p.artista ? `ondblclick="app.irAVistaArtista('${p.artista._id}', '${escapeHTML(p.artista.nombre)}', '')"` : ''}>${escapeHTML(p.nombreProyecto || artistaNombre)}</strong><select onchange="app.cambiarProceso('${p._id}', this.value)" class="form-select form-select-sm" style="width: auto;">${procesos.filter(pr => pr !== 'Solicitud').map(proc => `<option value="${proc}" ${p.proceso === proc ? 'selected' : ''}>${proc}</option>`).join('')}</select></div><div class="project-card-body"><div class="small text-muted mb-2">🗓️ ${safeDate(p.fecha)}</div><ul class="list-unstyled mb-0 small">${serviciosHtml}</ul></div><div class="project-card-footer"><strong class="text-success">$${safeMoney(p.total)}</strong><div class="btn-group"><button class="btn btn-sm btn-outline-primary" title="Pago" onclick="app.registrarPago('${p._id}')"><i class="bi bi-currency-dollar"></i></button><button class="btn btn-sm btn-outline-secondary" title="Editar" onclick="app.editarInfoProyecto('${p._id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" title="Borrar" onclick="app.eliminarProyecto('${p._id}')"><i class="bi bi-trash"></i></button></div></div>`; colEl.appendChild(card); 
            }); 
        } 
    }
    async function cambiarProceso(id, proceso) { try { const data = { proceso }; if (proceso === 'Completo') { const proyecto = localCache.proyectos.find(p => p._id === id); const restante = proyecto.total - (proyecto.montoPagado || 0); if (restante > 0) { const result = await Swal.fire({ title: 'Proyecto con Saldo Pendiente', text: `Este proyecto aún debe $${restante.toFixed(2)}. ¿Deseas completarlo?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, completar', cancelButtonText: 'Cancelar' }); if (!result.isConfirmed) { cargarFlujoDeTrabajo(); return; } } } await fetchAPI(`/api/proyectos/${id}/proceso`, { method: 'PUT', body: JSON.stringify(data) }); const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto) proyecto.proceso = proceso; if (proceso === 'Completo') { showToast('¡Proyecto completado y movido a historial!', 'success'); } const filtroActual = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos'; filtrarFlujo(filtroActual); } catch (e) { showToast(`Error: ${e.message}`, 'error'); } }
    async function cargarHistorial() { 
        const tablaBody = document.getElementById('tablaHistorialBody'); 
        tablaBody.innerHTML = `<tr><td colspan="5">Cargando historial...</td></tr>`; 
        try { 
            historialCacheados = await fetchAPI('/api/proyectos/completos'); 
            tablaBody.innerHTML = historialCacheados.length ? historialCacheados.map(p => { 
                const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Público General'; 
                return `<tr><td data-label="Artista" class="${p.artista ? 'clickable-artist' : ''}" ondblclick="app.irAVistaArtista('${p.artista ? p.artista._id : ''}', '${escapeHTML(artistaNombre)}', '')">${escapeHTML(artistaNombre)}</td><td data-label="Total">$${safeMoney(p.total)}</td><td data-label="Pagado">$${safeMoney(p.montoPagado)}</td><td data-label="Fecha">${safeDate(p.fecha)}</td><td data-label="Acciones" class="table-actions"><button class="btn btn-sm btn-outline-primary" title="Entrega / Drive" onclick="app.openDeliveryModal('${p._id}', '${escapeHTML(artistaNombre)}', '${escapeHTML(p.nombreProyecto || 'Proyecto')}')"><i class="bi bi-cloud-arrow-up"></i></button><button class="btn btn-sm btn-outline-info" onclick="app.registrarPago('${p._id}', true)" title="Pagos"><i class="bi bi-cash-stack"></i></button><button class="btn btn-sm btn-outline-danger" onclick="app.eliminarProyecto('${p._id}')" title="Borrar"><i class="bi bi-trash"></i></button></td></tr>`; 
            }).join('') : `<tr><td colspan="5" class="text-center">No hay proyectos.</td></tr>`; 
        } catch (error) { 
            console.error(error);
            tablaBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error al cargar historial.</td></tr>`; 
        } 
    }
    async function eliminarProyecto(id, desdeCotizaciones = false) { Swal.fire({ title: '¿Mover a papelera?', text: "El proyecto se ocultará.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, mover', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33' }).then(async (result) => { if(result.isConfirmed) { try { await fetchAPI(`/api/proyectos/${id}`, { method: 'DELETE' }); showToast('Movido a papelera.', 'info'); if (desdeCotizaciones) { cargarCotizaciones(); } else if (document.getElementById('historial-proyectos').classList.contains('active')) { cargarHistorial(); } else if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtroActual = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos'; cargarFlujoDeTrabajo(filtroActual); } } catch (error) { showToast(`Error: ${error.message}`, 'error'); } } }); }
    
    // Función para manejar navegación y botón "VOLVER"
    async function mostrarSeccion(id, updateHistory = true) { 
        document.querySelectorAll('main > section').forEach(sec => sec.classList.remove('active')); 
        document.querySelectorAll('.nav-link-sidebar').forEach(link => link.classList.remove('active')); 
        const seccionActiva = document.getElementById(id); 
        const linkActivo = document.querySelector(`.nav-link-sidebar[data-seccion="${id}"]`); 
        
        const btnBack = document.getElementById('btn-global-back'); 
        if (btnBack) { if (id === 'dashboard' || (id === 'vista-artista' && document.body.getAttribute('data-role') === 'cliente')) { btnBack.style.display = 'none'; } else { btnBack.style.display = 'inline-flex'; } } 
        
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
            
            if (!isClientView) { html += `<div class="btn-group mt-2 mt-md-0"><button class="btn btn-sm btn-outline-secondary" onclick="app.abrirModalEditarArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}', '${escapeHTML(artistaInfo.nombreArtistico || '')}', '${escapeHTML(artistaInfo.telefono || '')}', '${escapeHTML(artistaInfo.correo || '')}')"><i class="bi bi-pencil"></i> Editar</button><button class="btn btn-sm btn-primary" onclick="app.nuevoProyectoParaArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}')"><i class="bi bi-plus-circle"></i> Nuevo Proyecto</button></div>`; } 
            else { html += `<div class="btn-group mt-2 mt-md-0"><button class="btn btn-sm btn-primary" onclick="app.nuevoProyectoParaArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}')"><i class="bi bi-plus-circle"></i> Nuevo Proyecto</button></div>`; }
            
            html += `</div></div></div><h3>Historial de Proyectos</h3>`;
            if (proyectos.length) { 
                html += '<div class="table-responsive"><table class="table table-hover"><thead><tr><th>Fecha</th><th>Proyecto</th><th>Total</th><th>Pagado</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'; 
                proyectos.forEach(p => { 
                    let accionesHtml = `<button class="btn btn-sm btn-outline-secondary" title="Cotización PDF" onclick="app.generarCotizacionPDF('${p._id}')"><i class="bi bi-file-earmark-pdf"></i></button>`; 
                    if (p.enlaceEntrega) accionesHtml += `<a href="${p.enlaceEntrega}" target="_blank" class="btn btn-sm btn-success ms-1" title="Descargar Archivos"><i class="bi bi-cloud-download"></i></a>`; 
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

    async function addFirmaToPdf(pdf, docType, finalFileName, proyecto) { let firmaSrc = null; if (configCache) { if (configCache.firmaBase64) firmaSrc = configCache.firmaBase64; else if (configCache.firmaPath) firmaSrc = configCache.firmaPath; } try { if (firmaSrc) { let base64data = firmaSrc; if (!firmaSrc.startsWith('data:image')) { const response = await fetch(firmaSrc); if (!response.ok) throw new Error('No se pudo cargar la firma.'); const firmaImg = await response.blob(); const reader = new FileReader(); const promise = new Promise((resolve) => { reader.onloadend = () => { resolve(reader.result); }; reader.readAsDataURL(firmaImg); }); base64data = await promise; } const pos = {x: PDF_DIMENSIONS.WIDTH - 64, y: PDF_DIMENSIONS.HEIGHT - 44, w: 50, h: 20}; pdf.addImage(base64data, 'PNG', pos.x, pos.y, pos.w, pos.h); pdf.line(pos.x, pos.y + pos.h + 2, pos.x + pos.w, pos.y + pos.h + 2); pdf.text("Erick Resendiz", pos.x, pos.y + pos.h + 7, { align: 'left' }); pdf.text("Representante FIA Records", pos.x, pos.y + pos.h + 12, { align: 'left' }); } pdf.save(finalFileName); } catch (e) { console.error("Error firma PDF:", e); pdf.save(finalFileName); } }
    async function generarCotizacionPDF(proyectoIdOrObject) { try { const proyecto = typeof proyectoIdOrObject === 'string' ? await fetchAPI(`/api/proyectos/${proyectoIdOrObject}`) : proyectoIdOrObject; const { jsPDF } = window.jspdf; const pdf = new jsPDF(); if (logoBase64) { dibujarLogoEnPDF(pdf, logoBase64); } pdf.setFontSize(9); pdf.text("FiaRecords Studio", 196, 20, { align: 'right' }); pdf.text("Juárez N.L.", 196, 25, { align: 'right' }); pdf.setFontSize(11); pdf.text(`Cliente: ${proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'Público General'}`, 14, 50); pdf.text(`Fecha: ${new Date().toLocaleDateString()}`, 196, 50, { align: 'right' }); const body = proyecto.items.map(item =>[`${item.unidades}x ${item.nombre}`, `$${(item.precioUnitario * item.unidades).toFixed(2)}`]); if (proyecto.descuento && proyecto.descuento > 0) { body.push(['Descuento', `-$${proyecto.descuento.toFixed(2)}`]); } pdf.autoTable({ startY: 70, head: [['Servicio', 'Subtotal']], body: body, theme: 'grid', styles: { fontSize: 10 }, headStyles: { fillColor:[0, 0, 0] } }); let finalY = pdf.lastAutoTable.finalY + 10; pdf.setFontSize(12); pdf.setFont(undefined, 'bold'); pdf.text(`Total: $${safeMoney(proyecto.total)} MXN`, 196, finalY, { align: 'right' }); const fileName = `Cotizacion-${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`; await addFirmaToPdf(pdf, 'cotizacion', fileName, proyecto); } catch (error) { showToast("Error al generar PDF", 'error'); } }
    async function generarReciboPDF(proyecto, pagoEspecifico) { try { const { jsPDF } = window.jspdf; const pdf = new jsPDF(); const pago = pagoEspecifico || (proyecto.pagos && proyecto.pagos.length > 0 ? proyecto.pagos[proyecto.pagos.length - 1] : { monto: proyecto.montoPagado || 0, metodo: 'Varios' }); if (!pago) return showToast('No hay pagos.', 'error'); const saldoRestante = proyecto.total - proyecto.montoPagado; if (logoBase64) { dibujarLogoEnPDF(pdf, logoBase64); } pdf.setFontSize(16); pdf.setFont(undefined, 'bold').text(`RECIBO DE PAGO`, 105, 45, { align: 'center' }); pdf.setFontSize(11); pdf.setFont(undefined, 'normal'); pdf.text(`Cliente: ${proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'General'}`, 14, 60); pdf.autoTable({ startY: 70, theme: 'striped', body: [['Total del Proyecto:', `$${safeMoney(proyecto.total)}`],['Monto de este Recibo:', `$${safeMoney(pago.monto)} (${pago.metodo})`], ['Saldo Restante:', `$${safeMoney(saldoRestante)}`]] }); const fileName = `Recibo_${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`; await addFirmaToPdf(pdf, 'recibo', fileName, proyecto); } catch (error) { showToast('Error al generar recibo.', 'error'); } }

    function setupMobileMenu() { const hamburger = document.getElementById('hamburger-menu'); const sidebar = document.querySelector('.sidebar'); const overlay = document.getElementById('sidebar-overlay'); const toggleMenu = () => { sidebar.classList.toggle('show'); overlay.classList.toggle('show'); }; if (hamburger) hamburger.addEventListener('click', toggleMenu); if (overlay) overlay.addEventListener('click', toggleMenu); document.querySelectorAll('.nav-link-sidebar, #btn-nuevo-proyecto-sidebar').forEach(link => { link.addEventListener('click', () => { if (window.innerWidth <= 768) { sidebar.classList.remove('show'); overlay.classList.remove('show'); } }); }); }
    
    // Auth & Init
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
        
        // Ejecuta configuración de logo
        setupCustomization(payload);

        const hashSection = location.hash.replace('#', '');
        if (role === 'cliente') {
             if(payload.artistaId) {
                 await mostrarVistaArtista(payload.artistaId, payload.username, payload.nombre || payload.username);
                 mostrarSeccion('vista-artista', false); 
             } else {
                 document.getElementById('vista-artista-contenido').innerHTML = '<div class="alert alert-warning">No se encontró un perfil de artista vinculado. Contacta a soporte.</div>';
                 mostrarSeccion('vista-artista', false);
             }
        } else { mostrarSeccion(hashSection || 'dashboard', false); }
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

    // Funciones sueltas
    function filtrarTablas(query) { query = query.toLowerCase(); const inputPC = document.getElementById('globalSearchPC'); const inputMobile = document.getElementById('globalSearchMobile'); if(document.activeElement === inputPC && inputMobile) inputMobile.value = query; if(document.activeElement === inputMobile && inputPC) inputPC.value = query; document.querySelectorAll('section.active tbody tr').forEach(row => { const text = row.innerText.toLowerCase(); row.style.display = text.includes(query) ? '' : 'none'; }); document.querySelectorAll('section.active .project-card').forEach(card => { const text = card.innerText.toLowerCase(); card.style.display = text.includes(query) ? 'flex' : 'none'; }); const activeSection = document.querySelector('section.active').id; if(activeSection === 'gestion-artistas') renderPaginatedList('artistas', query); if(activeSection === 'gestion-servicios') renderPaginatedList('servicios', query); if(activeSection === 'gestion-usuarios') renderPaginatedList('usuarios', query); }
    async function guardarDatosBancarios() { const datos = { banco: document.getElementById('banco').value, titular: document.getElementById('titular').value, tarjeta: document.getElementById('tarjeta').value, clabe: document.getElementById('clabe').value }; try { await fetchAPI('/api/configuracion/datos-bancarios', { method: 'PUT', body: JSON.stringify({ datosBancarios: datos }) }); configCache.datosBancarios = datos; bootstrap.Modal.getInstance(document.getElementById('modalDatosBancarios')).hide(); Swal.fire({ icon: 'success', title: 'Datos bancarios guardados', timer: 1500, showConfirmButton: false }); } catch (e) { showToast('Error al guardar', 'error'); } }
    async function cargarDatosBancariosEnModal() { try { if (!configCache || !configCache.datosBancarios) { await loadInitialConfig(); } const db = configCache.datosBancarios || {}; document.getElementById('banco').value = db.banco || ''; document.getElementById('titular').value = db.titular || ''; document.getElementById('tarjeta').value = db.tarjeta || ''; document.getElementById('clabe').value = db.clabe || ''; } catch (error) { console.error("Error al cargar datos bancarios:", error); } }
    function generarDatosBancariosPDF() { if (!configCache || !configCache.datosBancarios) return showToast('Guarda los datos primero', 'warning'); const db = configCache.datosBancarios; const { jsPDF } = window.jspdf; const pdf = new jsPDF(); if (logoBase64) { dibujarLogoEnPDF(pdf, logoBase64); } pdf.setFontSize(18).setFont(undefined, 'bold').text("DATOS BANCARIOS", 105, 45, { align: 'center' }); const data = [['Banco:', db.banco || ''],['Titular:', db.titular || ''], ['Número de Tarjeta:', db.tarjeta || ''],['CLABE Interbancaria:', db.clabe || '']]; pdf.autoTable({ startY: 60, body: data, theme: 'striped', styles: { fontSize: 14, cellPadding: 3 } }); pdf.save("FiaRecords_DatosBancarios.pdf"); }
    function compartirDatosBancariosWhatsApp() { if (!configCache || !configCache.datosBancarios) return showToast('Guarda los datos primero', 'warning'); const db = configCache.datosBancarios; const msg = `*Datos Bancarios FiaRecords*\n\n*Banco:* ${db.banco}\n*Titular:* ${db.titular}\n*Tarjeta:* ${db.tarjeta}\n*CLABE:* ${db.clabe}`; window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank'); }
    async function subirFirma(event) { const file = event.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('firmaFile', file); try { const data = await fetchAPI('/api/configuracion/upload-firma', { method: 'POST', body: formData, isFormData: true }); showToast('¡Firma subida!', 'success'); const newSrc = data.firmaBase64; document.getElementById('firma-preview-img').src = newSrc; if (configCache) configCache.firmaBase64 = data.firmaBase64; } catch (e) { showToast(`Error al subir la firma`, 'error'); } }
    async function cargarConfiguracion() { 
        try { 
            if (!configCache) await loadInitialConfig();
            
            const firmaPreview = document.getElementById('firma-preview-img');
            let firmaSrc = 'https://placehold.co/150x60?text=Subir+Firma';
            if (configCache && configCache.firmaBase64) firmaSrc = configCache.firmaBase64; 
            firmaPreview.src = firmaSrc; 
            
            const db = configCache.datosBancarios || {}; 
            document.getElementById('banco').value = db.banco || ''; 
            document.getElementById('titular').value = db.titular || ''; 
            document.getElementById('tarjeta').value = db.tarjeta || ''; 
            document.getElementById('clabe').value = db.clabe || ''; 

            const tbody = document.getElementById('tabla-horarios-body');
            tbody.innerHTML = '';
            
            const horarios = configCache.horarioLaboral || {};
            
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

        } catch (e) { showToast('Error al cargar configuración.', 'error'); } 
    }
    async function cargarCotizaciones() { const tablaBody = document.getElementById('tablaCotizacionesBody'); tablaBody.innerHTML = `<tr><td colspan="4">Cargando cotizaciones...</td></tr>`; try { const cotizaciones = await fetchAPI('/api/proyectos/cotizaciones'); tablaBody.innerHTML = cotizaciones.length ? cotizaciones.map(c => { const esArtistaRegistrado = c.artista && c.artista._id; const nombreArtista = esArtistaRegistrado ? (c.artista.nombreArtistico || c.artista.nombre) : 'Público General'; return `<tr><td data-label="Artista" class="${esArtistaRegistrado ? 'clickable-artist' : ''}" ${esArtistaRegistrado ? `ondblclick="app.irAVistaArtista('${c.artista._id}', '${escapeHTML(c.artista.nombre)}', '${escapeHTML(c.artista.nombreArtistico || '')}')"` : ''}>${escapeHTML(nombreArtista)}</td><td data-label="Total">$${safeMoney(c.total)}</td><td data-label="Fecha">${safeDate(c.createdAt)}</td><td data-label="Acciones" class="table-actions"><button class="btn btn-sm btn-success" onclick="app.aprobarCotizacion('${c._id}')" title="Aprobar"><i class="bi bi-check-lg"></i></button><button class="btn btn-sm btn-outline-secondary" title="Generar PDF" onclick="app.generarCotizacionPDF('${c._id}')"><i class="bi bi-file-earmark-pdf"></i></button><button class="btn btn-sm btn-outline-success" title="WhatsApp" onclick="app.compartirPorWhatsApp('${c._id}')"><i class="bi bi-whatsapp"></i></button><button class="btn btn-sm btn-outline-danger" onclick="app.eliminarProyecto('${c._id}', true)" title="Borrar"><i class="bi bi-trash"></i></button></td></tr>`; }).join('') : `<tr><td colspan="4" class="text-center">No hay cotizaciones pendientes.</td></tr>`; } catch (e) { tablaBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error al cargar.</td></tr>`; } }
    
    // ==================================================================
    // LÓGICA DE PAPELERA PAGINADA
    // ==================================================================
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
    
    // Listas normales de paginación
    async function renderPaginatedList(endpoint, filterText = null) { const listId = `lista${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`; const listEl = document.getElementById(listId); if(!listEl) return; const userInfo = getUserRoleAndId(); const isClient = (userInfo.role === 'cliente'); let data = localCache[endpoint]; if (!data || data.length === 0) { try { data = await fetchAPI(`/api/${endpoint}`); localCache[endpoint] = data; } catch(e) { console.error("Error fetching " + endpoint); data =[]; } } if (filterText !== null) { paginationState[endpoint].filter = filterText.toLowerCase(); paginationState[endpoint].page = 1; } const currentFilter = paginationState[endpoint].filter; let filteredData = data; if (currentFilter) { filteredData = data.filter(item => { const name = item.nombre || item.username || item.nombreArtistico || ''; return name.toLowerCase().includes(currentFilter); }); } const page = paginationState[endpoint].page; const limit = paginationState[endpoint].limit; const start = (page - 1) * limit; const end = start + limit; const paginatedItems = filteredData.slice(start, end); const totalPages = Math.ceil(filteredData.length / limit); listEl.innerHTML = paginatedItems.length ? paginatedItems.map(item => { let displayName, editAction; if (endpoint === 'artistas') { displayName = `${item.nombreArtistico || item.nombre}`; editAction = `app.abrirModalEditarArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}', '${escapeHTML(item.telefono || '')}', '${escapeHTML(item.correo || '')}')`; } else if (endpoint === 'usuarios') { displayName = `${item.username} (${item.role})`; editAction = `app.abrirModalEditarUsuario('${escapeHTML(JSON.stringify(item))}')`; } else { const vis = item.visible !== false; displayName = `${item.nombre} - $${item.precio.toFixed(2)} ${vis ? '' : '<span class="badge bg-warning text-dark ms-2">Oculto</span>'}`; editAction = `app.abrirModalEditarServicio('${item._id}', '${escapeHTML(item.nombre)}', '${item.precio}', ${vis})`; } const clickHandler = (endpoint === 'artistas') ? `ondblclick="app.irAVistaArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}')"` : ''; const listItemClass = `list-group-item d-flex justify-content-between align-items-center ${endpoint === 'artistas' ? 'list-group-item-action' : ''}`; let buttonsHtml = ''; if (!isClient) { buttonsHtml = `<div class="btn-group"><button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); ${editAction}"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); app.eliminarItem('${item._id}', '${endpoint}')"><i class="bi bi-trash"></i></button></div>`; } return `<li class="${listItemClass}" ${clickHandler} style="${endpoint === 'artistas' ? 'cursor:pointer;' : ''}"><span>${displayName}</span>${buttonsHtml}</li>`; }).join('') : `<li class="list-group-item">No hay resultados.</li>`; renderPaginationControls(listEl, endpoint, page, totalPages); }
    function renderPaginationControls(container, endpoint, currentPage, totalPages) { let controls = container.parentNode.querySelector('.pagination-controls'); if(controls) controls.remove(); if (totalPages <= 1) return; controls = document.createElement('div'); controls.className = 'pagination-controls'; controls.innerHTML = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="app.changePage('${endpoint}', -1)">Anterior</button><span class="pagination-info">Página ${currentPage} de ${totalPages}</span><button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="app.changePage('${endpoint}', 1)">Siguiente</button>`; container.parentNode.appendChild(controls); }
    function changePage(endpoint, delta) { paginationState[endpoint].page += delta; renderPaginatedList(endpoint, null); }
    function limpiarForm(formId) { const f = document.getElementById(formId); if(f) f.reset(); }
    async function saveItem(e, type) { e.preventDefault(); const form = e.target; let body; if (type === 'servicios') { const vis = document.getElementById('visibleServicio'); body = { nombre: form.nombreServicio.value, precio: parseFloat(form.precioServicio.value), visible: vis ? vis.checked : true }; } else if (type === 'artistas') { body = { nombre: form.nombreArtista.value, nombreArtistico: form.nombreArtisticoArtista.value, telefono: form.telefonoArtista.value, correo: form.correoArtista.value }; } else if (type === 'usuarios') { const userVal = document.getElementById('usernameUsuario').value; const emailVal = document.getElementById('emailUsuario').value; const roleVal = document.getElementById('roleUsuario').value; const passVal = document.getElementById('passwordUsuario').value; const checkboxes = document.querySelectorAll('#formUsuarios input[name="user_permisos"]:checked'); const permisos = Array.from(checkboxes).map(c => c.value); body = { username: userVal, email: emailVal, role: roleVal, permisos: permisos, password: passVal }; if (!passVal) { showToast('La contraseña es requerida para crear un usuario', 'error'); return; } } try { await fetchAPI(`/api/${type}`, { method: 'POST', body: JSON.stringify(body) }); showToast('Creado exitosamente', 'success'); limpiarForm(form.id); localCache[type] =[]; renderPaginatedList(type); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
    async function eliminarItem(id, endpoint) { Swal.fire({ title: '¿Mover a papelera?', text: "Podrás restaurarlo después.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, mover', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33', }).then(async (result) => { if (result.isConfirmed) { try { await fetchAPI(`/api/${endpoint}/${id}`, { method: 'DELETE' }); showToast('Movido a papelera', 'info'); localCache[endpoint] =[]; renderPaginatedList(endpoint); } catch (e) { showToast(e.message, 'error'); } } }); }
    async function restaurarItem(id, endpoint) { try { await fetchAPI(`/api/${endpoint}/${id}/restaurar`, { method: 'PUT' }); showToast('Elemento restaurado.', 'success'); cargarPapelera(); } catch (error) { showToast(error.message, 'error'); } }
    async function eliminarPermanente(id, endpoint) { Swal.fire({ title: '¿Eliminar Permanentemente?', text: "¡Acción irreversible!", icon: 'error', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33', }).then(async (result) => { if (result.isConfirmed) { try { await fetchAPI(`/api/${endpoint}/${id}/permanente`, { method: 'DELETE' }); showToast('Eliminado permanentemente.', 'success'); cargarPapelera(); } catch (error) { showToast(error.message, 'error'); } } }); }
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
    async function cargarPagosPendientes() { const tabla = document.getElementById('tablaPendientesBody'); tabla.innerHTML = '<tr><td colspan="5">Calculando saldos pendientes...</td></tr>'; await fetchAPI('/api/proyectos'); const userInfo = getUserRoleAndId(); const isClient = userInfo.role === 'cliente'; const pendientes = localCache.proyectos.filter(p => { if (isClient && (!p.artista || p.artista._id !== userInfo.artistaId)) return false; const pagado = p.montoPagado || 0; return (p.total > pagado) && p.estatus !== 'Cancelado' && p.estatus !== 'Cotizacion' && !p.deleted; }); if (pendientes.length === 0) { tabla.innerHTML = '<tr><td colspan="5" class="text-center">¡Todo al día! No hay pagos pendientes.</td></tr>'; return; } tabla.innerHTML = pendientes.map(p => { const deuda = p.total - (p.montoPagado || 0); const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Cliente General'; const proyectoNombre = p.nombreProyecto || 'Proyecto sin nombre'; let buttons = ''; if (!isClient) { buttons = `<button class="btn btn-sm btn-success" onclick="app.registrarPago('${p._id}')">Cobrar <i class="bi bi-cash"></i></button><button class="btn btn-sm btn-outline-primary" onclick="app.compartirRecordatorioPago('${p._id}')">Recordar <i class="bi bi-whatsapp"></i></button>`; } return `<tr><td data-label="Proyecto"><div style="font-weight:bold;">${escapeHTML(proyectoNombre)}</div><div style="font-size:0.85em; color:var(--text-color-light);">${escapeHTML(artistaNombre)}</div></td><td data-label="Total">$${safeMoney(p.total)}</td><td data-label="Pagado">$${safeMoney(p.montoPagado)}</td><td data-label="Restante" style="color:var(--danger-color); font-weight:700;">$${safeMoney(deuda)}</td><td data-label="Acciones" class="table-actions">${buttons}</td></tr>`; }).join(''); }
    async function cargarHistorialPagos() { const tablaBody = document.getElementById('tablaPagosBody'); tablaBody.innerHTML = `<tr><td colspan="5">Cargando historial de pagos...</td></tr>`; const userInfo = getUserRoleAndId(); const isClient = userInfo.role === 'cliente'; try { const proyectosFresh = await fetchAPI('/api/proyectos'); let pagos =[]; if (isClient) { const misProyectos = proyectosFresh.filter(p => p.artista && p.artista._id === userInfo.artistaId); misProyectos.forEach(proj => { if (proj.pagos && proj.pagos.length > 0) { proj.pagos.forEach(pago => { pagos.push({ fecha: pago.fecha || new Date().toISOString(), artista: proj.nombreProyecto || 'Proyecto', monto: pago.monto, metodo: pago.metodo, proyectoId: proj._id, pagoId: pago._id }); }); } }); } else { proyectosFresh.forEach(proj => { if (proj.pagos && proj.pagos.length > 0) { proj.pagos.forEach(pago => { pagos.push({ fecha: pago.fecha || new Date().toISOString(), artista: proj.artista ? (proj.artista.nombreArtistico || proj.artista.nombre) : 'Público General', monto: pago.monto, metodo: pago.metodo, proyectoId: proj._id, pagoId: pago._id }); }); } }); } pagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); tablaBody.innerHTML = pagos.length ? pagos.map(p => { let buttons = `<button class="btn btn-sm btn-outline-secondary" title="Reimprimir Recibo" onclick="app.reimprimirRecibo('${p.proyectoId}', '${p.pagoId}')"><i class="bi bi-file-earmark-pdf"></i></button>`; if (!isClient) { buttons += `<button class="btn btn-sm btn-outline-danger" title="Eliminar Pago" onclick="app.eliminarPago('${p.proyectoId}', '${p.pagoId}')"><i class="bi bi-trash"></i></button>`; } return `<tr><td data-label="Fecha">${safeDate(p.fecha)}</td><td data-label="Proyecto">${escapeHTML(p.artista)}</td><td data-label="Monto">$${safeMoney(p.monto)}</td><td data-label="Método">${escapeHTML(p.metodo)}</td><td data-label="Acciones" class="table-actions">${buttons}</td></tr>`; }).join('') : `<tr><td colspan="5" class="text-center">No hay pagos registrados en el historial.</td></tr>`; } catch (e) { tablaBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error al cargar el historial de pagos.</td></tr>`; } }
    async function reimprimirRecibo(proyectoId, pagoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const pago = proyecto.pagos.find(p => p._id === pagoId); if (!pago) return showToast('Pago no encontrado en el proyecto.', 'error'); await generarReciboPDF(proyecto, pago); } catch (e) { showToast('Error al generar recibo.', 'error'); } }
    async function compartirRecordatorioPago(proyectoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const nombreCliente = proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'cliente'; const restante = proyecto.total - (proyecto.montoPagado || 0); const mensaje = `¡Hola ${nombreCliente}! Te enviamos un recordatorio de FiaRecords sobre tu proyecto "${proyecto.nombreProyecto || 'General'}".\n\nEl saldo pendiente es de: *$${safeMoney(restante)} MXN*.\n\nQuedamos a tus órdenes.`; window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank'); } catch(e) { showToast('Error al obtener datos del proyecto', 'error'); } }
    async function eliminarPago(proyectoId, pagoId) { Swal.fire({ title: '¿Eliminar este pago?', text: "Esta acción afectará el saldo del proyecto.", icon: 'error', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33' }).then(async (result) => { if(result.isConfirmed){ try { await fetchAPI(`/api/proyectos/${proyectoId}/pagos/${pagoId}`, { method: 'DELETE' }); showToast('Pago eliminado.', 'success'); cargarPagos(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } } }); }
    function cerrarSesionConfirmacion() { Swal.fire({ title: '¿Salir?', text: "Cerrarás tu sesión actual", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Salir', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33' }).then((result) => { if (result.isConfirmed) showLogin(); }); }
    function toggleAuth(view) {['login-view', 'register-view', 'recover-view', 'reset-password-view'].forEach(v => { const el = document.getElementById(v); if(el) el.style.display = 'none'; }); const active = document.getElementById(`${view}-view`); if(active) active.style.display = 'block'; document.getElementById('login-error').textContent = ''; }
    function showResetPasswordView(token) { document.body.classList.add('auth-visible'); DOMElements.appWrapper.style.display = 'none'; DOMElements.loginContainer.style.display = 'flex'; document.getElementById('reset-token').value = token; toggleAuth('reset'); }
    async function resetPassword(e) { e.preventDefault(); const token = document.getElementById('reset-token').value; const password = document.getElementById('new-password').value; try { const res = await fetch(`${API_URL}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: password }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); showToast('¡Contraseña actualizada!', 'success'); toggleAuth('login'); } catch (err) { document.getElementById('login-error').textContent = err.message; } }
    async function registerUser(e) { e.preventDefault(); const username = document.getElementById('reg-username').value; const email = document.getElementById('reg-email').value; const password = document.getElementById('reg-password').value; const nombreArtistico = document.getElementById('reg-artistname').value; try { const res = await fetch(`${API_URL}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password, role: 'Cliente', nombre: nombreArtistico, createArtist: true }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); showToast('¡Cuenta creada!', 'success'); toggleAuth('login'); } catch (err) { document.getElementById('login-error').textContent = err.message; } }
    async function recoverPassword(e) { e.preventDefault(); const email = document.getElementById('rec-email').value; try { const res = await fetch(`${API_URL}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); showToast('Correo enviado.', 'success'); toggleAuth('login'); } catch (err) { document.getElementById('login-error').textContent = err.message; } }
    
    // --- FUNCIONES PARA HORARIOS ---
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
        // Eliminado el listener individual de #theme-switch ya que usamos la clase inline en el HTML
        ['Servicios', 'Artistas', 'Usuarios'].forEach(type => { const form = document.getElementById(`form${type}`); if(form) form.addEventListener('submit', (e) => saveItem(e, type.toLowerCase())); }); 
        document.getElementById('formEditarArtista').addEventListener('submit', guardarEdicionArtista); 
        document.getElementById('formEditarServicio').addEventListener('submit', guardarEdicionServicio); 
        document.getElementById('formEditarUsuario').addEventListener('submit', guardarEdicionUsuario); 
        document.getElementById('firma-input').addEventListener('change', subirFirma); 
        document.getElementById('proyectoDescuento').addEventListener('input', mostrarProyectoActual); 
        const modalDatosBancarios = document.getElementById('modalDatosBancarios'); 
        if (modalDatosBancarios) { modalDatosBancarios.addEventListener('show.bs.modal', function () { cargarDatosBancariosEnModal(); }); } 
        setupMobileMenu(); 
        if (DOMElements.logoutButton) { DOMElements.logoutButton.onclick = cerrarSesionConfirmacion; } 
        window.addEventListener('online', OfflineManager.updateIndicator); 
        window.addEventListener('offline', OfflineManager.updateIndicator); 
        OfflineManager.updateIndicator(); 
    }
    
    // ==================================================================
    // ARREGLO LOGO CLICKEABLE
    // ==================================================================
    function setupCustomization(payload) { 
        if (payload.role === 'admin') { 
            const appLogo = document.getElementById('app-logo');
            const logoInput = document.getElementById('logo-input');
            
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
                            document.getElementById('login-logo').src = res.logoBase64;
                            logoBase64 = res.logoBase64;
                            localStorage.setItem('cached_logo_path', res.logoBase64);
                        } else {
                            await loadInitialConfig(); 
                            if(configCache && configCache.logoBase64) { 
                                appLogo.src = configCache.logoBase64; 
                                document.getElementById('login-logo').src = configCache.logoBase64;
                                logoBase64 = configCache.logoBase64;
                            } 
                        }
                    } catch (e) { 
                        showToast(`Error al subir logo`, 'error'); 
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
        if (role === 'cliente') { html = `<div class="nav-group mb-3"><div class="text-uppercase text-muted small fw-bold px-3 mb-2">Mi Espacio</div><a class="nav-link-sidebar active" data-seccion="vista-artista" onclick="app.irAVistaArtista()"><i class="bi bi-music-note-beamed"></i> Mis Proyectos</a><a class="nav-link-sidebar" data-seccion="pagos"><i class="bi bi-cash-stack"></i> Mis Pagos</a></div>`; } else { const isSuperAdmin = role === 'admin'; const canAccess = (permKey) => isSuperAdmin || p.includes(permKey); html = `<div class="nav-group mb-3"><div class="text-uppercase text-muted small fw-bold px-3 mb-2">Proyectos</div>${canAccess('dashboard') ? '<a class="nav-link-sidebar" data-seccion="dashboard"><i class="bi bi-speedometer2"></i> Dashboard</a>' : ''}${canAccess('agenda') ? '<a class="nav-link-sidebar" data-seccion="agenda"><i class="bi bi-calendar-event"></i> Agenda</a>' : ''}${canAccess('flujo-trabajo') ? '<a class="nav-link-sidebar" data-seccion="flujo-trabajo"><i class="bi bi-kanban"></i> Flujo de Trabajo</a>' : ''}${canAccess('cotizaciones') ? '<a class="nav-link-sidebar" data-seccion="cotizaciones"><i class="bi bi-file-earmark-text"></i> Cotizaciones</a>' : ''}${canAccess('historial-proyectos') ? '<a class="nav-link-sidebar" data-seccion="historial-proyectos"><i class="bi bi-clock-history"></i> Historial</a>' : ''}${canAccess('pagos') ? '<a class="nav-link-sidebar" data-seccion="pagos"><i class="bi bi-cash-stack"></i> Gestión de Pagos</a>' : ''}</div><div class="nav-group mb-3"><div class="text-uppercase text-muted small fw-bold px-3 mb-2">Gestión</div>${canAccess('gestion-artistas') ? '<a class="nav-link-sidebar" data-seccion="gestion-artistas"><i class="bi bi-people"></i> Artistas</a>' : ''}${canAccess('gestion-servicios') ? '<a class="nav-link-sidebar" data-seccion="gestion-servicios"><i class="bi bi-tags"></i> Servicios</a>' : ''}${canAccess('gestion-usuarios') ? '<a class="nav-link-sidebar" data-seccion="gestion-usuarios"><i class="bi bi-person-badge"></i> Usuarios</a>' : ''}</div>${isSuperAdmin ? `<div class="nav-group"><div class="text-uppercase text-muted small fw-bold px-3 mb-2">Sistema</div><a class="nav-link-sidebar" data-seccion="configuracion"><i class="bi bi-gear"></i> Configuración</a><a class="nav-link-sidebar" data-seccion="papelera-reciclaje"><i class="bi bi-trash"></i> Papelera</a></div>` : ''}`; } 
        navContainer.innerHTML = html; 
        document.querySelectorAll('.nav-link-sidebar').forEach(link => { link.addEventListener('click', (e) => { if(!e.currentTarget.onclick) { e.preventDefault(); mostrarSeccion(e.currentTarget.dataset.seccion); } }); }); 
    }

    // --- INICIALIZACIÓN ---
    (async function init() {
        const cachedLogo = localStorage.getItem('cached_logo_path');
        if(cachedLogo) {
            if(DOMElements.appLogo) DOMElements.appLogo.src = cachedLogo; 
            if(DOMElements.loginLogo) DOMElements.loginLogo.src = cachedLogo;
            logoBase64 = cachedLogo;
        }

        // Carga inicial del año en todos los footers
        setupFooterYear();

        await fetchPublicLogo();
        await loadInitialConfig();
        setTimeout(preloadLogoForPDF, 2000);
        
        // Carga y sincroniza el tema oscuro guardado
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
        toggleInputsHorario, guardarHorariosConfig, changeTrashPage, 
        toggleTheme // EXPORTAMOS EL TOGGLE THEME PARA QUE EL HTML LO PUEDA USAR
    };
});

if ('serviceWorker' in navigator) { 
    window.addEventListener('load', function () { 
        navigator.serviceWorker.register('sw.js').then(function (registration) { 
            console.log('ServiceWorker OK: ', registration.scope); 
        }, function (err) { 
            console.log('ServiceWorker Falló: ', err); 
        }); 
    }); 
}