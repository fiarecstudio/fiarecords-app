// ==================================================================
// FIA RECORDS - SCRIPT INTEGRAL (OFFLINE + DRIVE + PDF + CORRECCIONES)
// ==================================================================
document.addEventListener('DOMContentLoaded', () => {
    let isInitialized = false; 
    let proyectoActual = {}; 
    let logoBase64 = null;
    let preseleccionArtistaId = null; 
    let currentCalendar = null; 
    let configCache = null; 
    let chartInstance = null; 
    let historialCacheados = [];
    const API_URL = '';

    // --- CONFIGURACIÓN GOOGLE DRIVE ---
    const GAP_CONFIG = {
        apiKey: 'AIzaSyDaeTcNohqRxixSsAY58_pSyy62vsyJeXk', 
        clientId: '769041146398-a0iqgdre2lrevbh1ud9i1mrs4v548rdq.apps.googleusercontent.com', 
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
        scope: 'https://www.googleapis.com/auth/drive.file' 
    };
    let tokenClient;
    let gapiInited = false;
    let gisInited = false;

    // --- 1. INICIALIZAR CACHÉ ---
    let localCache = {
        artistas: JSON.parse(localStorage.getItem('cache_artistas') || '[]'), 
        servicios: JSON.parse(localStorage.getItem('cache_servicios') || '[]'),
        proyectos: JSON.parse(localStorage.getItem('cache_proyectos') || '[]'),
        pagos: JSON.parse(localStorage.getItem('cache_pagos') || '[]'),
        usuarios: []
    };

    // --- 2. SELECTORES DE DOM (CON VALIDACIÓN) ---
    const getEl = (id) => document.getElementById(id);
    const DOMElements = { 
        loginContainer: getEl('login-container'), 
        appWrapper: getEl('app-wrapper'), 
        logoutButton: getEl('logout-button'), 
        welcomeUser: getEl('welcome-user'), 
        appLogo: getEl('app-logo'), 
        loginLogo: getEl('login-logo'), 
        connectionStatus: getEl('connection-status'), 
        connectionText: getEl('connection-text') 
    };
    const PDF_DIMENSIONS = { WIDTH: 210, HEIGHT: 297, MARGIN: 14 };

    // --- 3. UTILIDADES ---
    const showToast = (msg, icon = 'success') => Swal.fire({ toast: true, position: 'top-end', icon, title: msg, showConfirmButton: false, timer: 3000 });
    const showLoader = () => { if(getEl('loader-overlay')) getEl('loader-overlay').style.display = 'flex'; };
    const hideLoader = () => { if(getEl('loader-overlay')) getEl('loader-overlay').style.display = 'none'; };
    const escapeHTML = (str) => str ? String(str).replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag])) : '';

    // --- 4. OFFLINE MANAGER ---
    const OfflineManager = {
        QUEUE_KEY: 'fia_offline_queue',
        getQueue: () => JSON.parse(localStorage.getItem(OfflineManager.QUEUE_KEY) || '[]'),
        updateIndicator: () => {
            const queue = OfflineManager.getQueue();
            if (!DOMElements.connectionStatus) return;
            if (navigator.onLine) {
                DOMElements.connectionStatus.className = 'connection-status status-online';
                DOMElements.connectionText.textContent = queue.length > 0 ? `Sincronizando (${queue.length})` : 'En Línea';
                if(queue.length > 0) OfflineManager.sync();
            } else {
                DOMElements.connectionStatus.className = 'connection-status status-offline';
                DOMElements.connectionText.textContent = 'Modo Offline';
            }
        },
        sync: async () => {
            const queue = OfflineManager.getQueue();
            const token = localStorage.getItem('token');
            let newQueue = [];
            for (const req of queue) {
                try {
                    const res = await fetch(req.url, { ...req.options, headers: { ...req.options.headers, 'Authorization': `Bearer ${token}` } });
                    if(!res.ok) newQueue.push(req);
                } catch (e) { newQueue.push(req); }
            }
            localStorage.setItem(OfflineManager.QUEUE_KEY, JSON.stringify(newQueue));
            OfflineManager.updateIndicator();
        }
    };

    // --- 5. NÚCLEO API ---
    async function fetchAPI(url, options = {}) {
        const token = localStorage.getItem('token');
        if (!token && !url.includes('/auth/')) { showLogin(); return; }
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        
        if (!navigator.onLine && (options.method === 'POST' || options.method === 'PUT')) {
            const queue = OfflineManager.getQueue();
            queue.push({ url, options, timestamp: Date.now() });
            localStorage.setItem(OfflineManager.QUEUE_KEY, JSON.stringify(queue));
            OfflineManager.updateIndicator();
            showToast('Guardado localmente (Offline)', 'info');
            return { offline: true };
        }

        showLoader();
        try {
            const res = await fetch(`${API_URL}${url}`, { ...options, headers });
            if (res.status === 401) { showLogin(); return; }
            if (res.status === 204) return { ok: true };
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error');
            return data;
        } catch (e) {
            console.error(e);
            throw e;
        } finally { hideLoader(); }
    }

    // --- 6. AUTENTICACIÓN ---
    function showLogin() {
        if(DOMElements.loginContainer) DOMElements.loginContainer.style.display = 'block';
        if(DOMElements.appWrapper) DOMElements.appWrapper.style.display = 'none';
        localStorage.removeItem('token');
    }

    async function showApp(payload) {
        if(DOMElements.loginContainer) DOMElements.loginContainer.style.display = 'none';
        if(DOMElements.appWrapper) DOMElements.appWrapper.style.display = window.innerWidth <= 768 ? 'block' : 'flex';
        if(DOMElements.welcomeUser) DOMElements.welcomeUser.textContent = `Hola, ${payload.username}`;
        
        renderSidebar(payload);
        if (!isInitialized) { initAppEventListeners(payload); isInitialized = true; }
        
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        mostrarSeccion(hash, false);
        OfflineManager.updateIndicator();
    }

    // --- 7. DRIVE & ARCHIVOS ---
    function initializeGapiClient() { gapi.load('client', () => { gapi.client.init({ apiKey: GAP_CONFIG.apiKey, discoveryDocs: GAP_CONFIG.discoveryDocs }).then(() => gapiInited = true); }); }
    function initializeGisClient() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GAP_CONFIG.clientId, scope: GAP_CONFIG.scope, callback: '' }); gisInited = true; }
    
    async function subirADrive() {
        if (!gapiInited) return showToast('Google Drive no cargado', 'error');
        const file = getEl('drive-file-input').files[0];
        if (!file) return showToast('Selecciona un archivo', 'info');

        tokenClient.callback = async (resp) => {
            const metadata = { name: file.name, mimeType: file.type };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);

            const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + resp.access_token }),
                body: form
            });
            const data = await res.json();
            getEl('delivery-link-input').value = `https://drive.google.com/file/d/${data.id}/view`;
            showToast('Subido con éxito');
        };
        tokenClient.requestAccessToken();
    }

    // --- 8. PDF & DOCUMENTOS ---
    async function addFirmaToPdf(pdf, docType, fileName, proyecto) {
        const firmaPath = configCache?.firmaPath || 'https://placehold.co/150x60?text=Firma';
        try {
            const res = await fetch(firmaPath);
            const blob = await res.blob();
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                pdf.addImage(reader.result, 'PNG', 140, 240, 50, 20);
                pdf.save(fileName);
            };
        } catch(e) { pdf.save(fileName); }
    }

    // --- 9. FUNCIONES DE GESTIÓN (REPARADAS) ---
    async function restaurarItem(id, endpoint) {
        try { await fetchAPI(`/api/${endpoint}/${id}/restaurar`, { method: 'PUT' }); showToast('Restaurado'); cargarPapelera(); } catch(e) { console.error(e); }
    }

    async function eliminarPermanente(id, endpoint) {
        if (!confirm('Esta acción es irreversible. ¿Continuar?')) return;
        try { await fetchAPI(`/api/${endpoint}/${id}/permanente`, { method: 'DELETE' }); showToast('Eliminado definitivamente'); cargarPapelera(); } catch(e) { console.error(e); }
    }

    function revertirADefecto() {
        if(confirm('¿Restablecer configuración de PDF?')) {
            configCache.firmaPos = { cotizacion: { vAlign:'bottom', hAlign:'right', w:50 } };
            showToast('Configuración reseteada');
        }
    }

    // --- 10. EVENTOS E INICIALIZACIÓN ---
    function initAppEventListeners(payload) {
        if(getEl('logout-button')) getEl('logout-button').addEventListener('click', () => { if(confirm('¿Cerrar Sesión?')) showLogin(); });
        if(getEl('login-form')) {
            getEl('login-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = getEl('username').value;
                const password = getEl('password').value;
                try {
                    const data = await fetchAPI('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
                    localStorage.setItem('token', data.token);
                    showApp(JSON.parse(atob(data.token.split('.')[1])));
                } catch(err) { getEl('login-error').textContent = err.message; }
            });
        }
        // Inicializar GAPI si están los scripts
        if(typeof gapi !== 'undefined') initializeGapiClient();
        if(typeof google !== 'undefined') initializeGisClient();
    }

    // --- EXPORTACIÓN GLOBAL PARA ONCLICK ---
    window.app = {
        mostrarSeccion: (id) => mostrarSeccion(id),
        restaurarItem,
        eliminarPermanente,
        revertirADefecto,
        subirADrive,
        toggleAuth: (v) => toggleAuth(v),
        irAVistaArtista: (id, nombre) => mostrarVistaArtista(id, nombre),
        abrirModalEditarArtista: (id, nom, art, tel, mail) => abrirModalEditarArtista(id, nom, art, tel, mail),
        generarCotizacionPDF: (id) => generarCotizacionPDF(id),
        registrarPago: (id) => registrarPago(id),
        eliminarProyecto: (id) => eliminarProyecto(id),
        quitarDeProyecto: (id) => quitarDeProyecto(id),
        closeDeliveryModal: () => { const m = bootstrap.Modal.getInstance(getEl('delivery-modal')); if(m) m.hide(); }
    };

    // Arranque
    const token = localStorage.getItem('token');
    if(token) { try { showApp(JSON.parse(atob(token.split('.')[1]))); } catch(e) { showLogin(); } } else { showLogin(); }
});

// Funciones fuera del DOMContentLoaded para asegurar visibilidad si es necesario
function mostrarSeccion(id, updateHistory = true) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if(target) target.classList.add('active');
    if(updateHistory) window.location.hash = id;
}

function toggleAuth(view) {
    ['login-view', 'register-view', 'recover-view', 'reset-password-view'].forEach(v => {
        const el = document.getElementById(v);
        if(el) el.style.display = 'none';
    });
    const target = document.getElementById(`${view}-view`);
    if(target) target.style.display = 'block';
}

function renderSidebar(user) {
    const container = document.getElementById('sidebar-nav-container');
    if(!container) return;
    const p = user.permisos || [];
    const isAdmin = user.role === 'admin';
    const can = (perm) => isAdmin || p.includes(perm);

    container.innerHTML = `
        <div class="nav-group">
            ${can('dashboard') ? `<a class="nav-link-sidebar" onclick="app.mostrarSeccion('dashboard')"><i class="bi bi-speedometer2"></i> Dashboard</a>` : ''}
            ${can('agenda') ? `<a class="nav-link-sidebar" onclick="app.mostrarSeccion('agenda')"><i class="bi bi-calendar-event"></i> Agenda</a>` : ''}
            ${can('flujo-trabajo') ? `<a class="nav-link-sidebar" onclick="app.mostrarSeccion('flujo-trabajo')"><i class="bi bi-kanban"></i> Flujo</a>` : ''}
        </div>
        <div class="nav-group mt-3">
            ${can('gestion-artistas') ? `<a class="nav-link-sidebar" onclick="app.mostrarSeccion('gestion-artistas')"><i class="bi bi-people"></i> Artistas</a>` : ''}
            ${can('gestion-servicios') ? `<a class="nav-link-sidebar" onclick="app.mostrarSeccion('gestion-servicios')"><i class="bi bi-tags"></i> Servicios</a>` : ''}
        </div>
        ${can('configuracion') ? `
        <div class="nav-group mt-3">
            <a class="nav-link-sidebar" onclick="app.mostrarSeccion('configuracion')"><i class="bi bi-gear"></i> Configuración</a>
            <a class="nav-link-sidebar" onclick="app.mostrarSeccion('papelera-reciclaje')"><i class="bi bi-trash"></i> Papelera</a>
        </div>` : ''}
    `;
}