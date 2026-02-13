document.addEventListener('DOMContentLoaded', () => {
    // --- VARIABLES GLOBALES ---
    let isInitialized = false; 
    let proyectoActual = {}; 
    let logoBase64 = null;
    let preseleccionArtistaId = null; 
    let currentCalendar = null; 
    let configCache = null; 
    let chartInstance = null; 
    
    // Cambiar si tu backend está en otro dominio/puerto. Dejar vacío si es el mismo origen.
    const API_URL = ''; 

    // --- DOM ELEMENTS (Cacheamos referencias principales) ---
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

    // --- CONFIGURACIÓN GOOGLE DRIVE INTEGRADA ---
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
        artistas: (JSON.parse(localStorage.getItem('cache_artistas') || '[]') || []), 
        servicios: JSON.parse(localStorage.getItem('cache_servicios') || '[]'),
        proyectos: JSON.parse(localStorage.getItem('cache_proyectos') || '[]'),
        pagos: JSON.parse(localStorage.getItem('cache_pagos') || '[]'),
        usuarios: []
    };

    // --- UTILS ---
    function showToast(message, type = 'success') { 
        let bg = type === 'error' ? "linear-gradient(to right, #ff5f6d, #ffc371)" : "linear-gradient(to right, #00b09b, #96c93d)";
        if(type==='info') bg = "var(--secondary-button-bg)";
        
        // Usamos Toastify si está cargado, si no, alert (fallback)
        if (typeof Toastify !== 'undefined') {
            Toastify({ 
                text: message, 
                duration: 3000, 
                gravity: "top", 
                position: "right", 
                style: { background: bg, borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", color: type==='info' ? '#333' : '#fff' } 
            }).showToast(); 
        } else {
            console.log(type.toUpperCase() + ": " + message);
        }
    }

    function escapeHTML(str) { if (!str) return ''; return str.replace(/[&<>'"]/g, tag => ({'&': '&amp;','<': '&lt;','>': '&gt;',"'": '&#39;','"': '&quot;'}[tag])); }
    function showLoader() { const l = document.getElementById('loader-overlay'); if(l) l.style.display = 'flex'; }
    function hideLoader() { const l = document.getElementById('loader-overlay'); if(l) l.style.display = 'none'; }
    
    async function preloadLogoForPDF() {
        const imgUrl = DOMElements.appLogo ? DOMElements.appLogo.src : '';
        if(!imgUrl) return;
        try {
            const response = await fetch(imgUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => { logoBase64 = reader.result; };
            reader.readAsDataURL(blob);
        } catch(e) { console.warn("No se pudo precargar logo para PDF offline"); }
    }

    // --- 2. OFFLINE MANAGER ---
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
                    if(DOMElements.connectionStatus) DOMElements.connectionStatus.className = 'connection-status status-syncing';
                    if(DOMElements.connectionText) DOMElements.connectionText.textContent = `Sincronizando (${queue.length})`;
                    OfflineManager.sync(); 
                } else {
                    if(DOMElements.connectionStatus) DOMElements.connectionStatus.className = 'connection-status status-online';
                    if(DOMElements.connectionText) DOMElements.connectionText.textContent = 'En Línea';
                }
            } else {
                if(DOMElements.connectionStatus) DOMElements.connectionStatus.className = 'connection-status status-offline';
                if(DOMElements.connectionText) DOMElements.connectionText.textContent = queue.length > 0 ? `Offline (${queue.length})` : 'Modo Offline';
            }
        },
        sync: async () => {
            const queue = OfflineManager.getQueue();
            if (queue.length === 0) return;
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
            let newQueue = [];
            for (const req of queue) {
                try {
                    let bodyObj = req.options.body ? JSON.parse(req.options.body) : {};
                    if(bodyObj._id && bodyObj._id.startsWith('temp_')) delete bodyObj._id;
                    const res = await fetch(req.url, { ...req.options, body: JSON.stringify(bodyObj), headers: { ...req.options.headers, ...headers } });
                    if(!res.ok) throw new Error('Failed');
                } catch (e) { newQueue.push(req); }
            }
            localStorage.setItem(OfflineManager.QUEUE_KEY, JSON.stringify(newQueue));
            if(newQueue.length === 0) { 
                showToast('Sincronización completada', 'success'); 
                await Promise.all([fetchAPI('/api/proyectos'), fetchAPI('/api/artistas'), fetchAPI('/api/servicios')]);
                const currentHash = location.hash.replace('#', '');
                if (currentHash) window.app.mostrarSeccion(currentHash, false);
            }
            OfflineManager.updateIndicator();
        },
        syncNow: () => { if(navigator.onLine) OfflineManager.sync(); }
    };

    // --- 3. FETCH API MEJORADO ---
    async function fetchAPI(url, options = {}) { 
        if (!url.startsWith('/') && !url.startsWith('http')) url = '/' + url;
        
        const token = localStorage.getItem('token'); 
        // Permitir requests sin token solo para Auth y Public
        if (!token && !url.includes('/auth/') && !url.includes('/public/')) { 
            showLogin(); throw new Error('No autenticado'); 
        } 
        
        const headers = { 'Authorization': `Bearer ${token}` }; 
        if (!options.isFormData) { headers['Content-Type'] = 'application/json'; } 
        
        // --- MANEJO OFFLINE (GET) ---
        if ((!options.method || options.method === 'GET')) {
            if (!navigator.onLine) {
               if(url.includes('/artistas')) return localCache.artistas;
               if(url.includes('/servicios')) return localCache.servicios;
               if(url.includes('/proyectos')) {
                   if(url.includes('cotizaciones')) return localCache.proyectos.filter(p => p.estatus === 'Cotizacion' && !p.deleted);
                   if(url.includes('completos')) return localCache.proyectos.filter(p => p.proceso === 'Completo' && p.estatus !== 'Cancelado' && !p.deleted);
                   if(url.includes('agenda')) return localCache.proyectos.filter(p => p.estatus !== 'Cancelado' && !p.deleted).map(p => ({ id: p._id, title: p.nombreProyecto || (p.artista ? p.artista.nombre : 'Proyecto'), start: p.fecha, allDay: false, extendedProps: { ...p, servicios: p.items.map(i=>i.nombre).join('\n') } }));
                   if(url.includes('papelera')) return localCache.proyectos.filter(p => p.deleted === true);
                   if(url.includes('/por-artista')) {
                       const artId = url.split('/').pop();
                       return localCache.proyectos.filter(p => !p.deleted && (p.artista && p.artista._id === artId));
                   }
                   return localCache.proyectos.filter(p => !p.deleted);
               }
               if(url.includes('/pagos')) return localCache.pagos;
               if(url.includes('/dashboard/stats')) {
                   const activos = localCache.proyectos.filter(p => p.proceso !== 'Completo' && p.estatus !== 'Cancelado' && !p.deleted).length;
                   const porCobrar = localCache.proyectos.filter(p => (p.total - (p.montoPagado||0)) > 0 && p.estatus !== 'Cancelado' && !p.deleted).length;
                   const now = new Date();
                   const ingresosMes = localCache.pagos.filter(p => { const d = new Date(p.fecha); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((sum, p) => sum + p.monto, 0);
                   return { ingresosMes, proyectosActivos: activos, proyectosPorCobrar: porCobrar, monthlyIncome: [] };
               }
            }
        }

        // --- MANEJO OFFLINE (POST/PUT/DELETE) ---
        if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method)) {
             // Simulación Optimista
             const body = options.body ? JSON.parse(options.body) : {};
             const tempId = body._id || `temp_${Date.now()}`;
             
             if (url.includes('/proyectos')) {
                 if (options.method === 'POST') {
                    localCache.proyectos.push({ ...body, _id: tempId, createdAt: new Date().toISOString(), montoPagado: 0, pagos: [], deleted: false });
                 } else if (options.method === 'DELETE') {
                    let idTarget = url.split('/').pop();
                    localCache.proyectos = localCache.proyectos.filter(p => p._id !== idTarget);
                 }
                 // Guardar caché local actualizado
                 localStorage.setItem('cache_proyectos', JSON.stringify(localCache.proyectos));
             }

             if (!navigator.onLine) {
                 OfflineManager.addToQueue(`${API_URL}${url}`, { ...options, headers }, tempId);
                 if (url.includes('/proyectos') && options.method === 'POST') { return { ...body, _id: tempId, offline: true }; }
                 return { ok: true, offline: true, _id: tempId };
             }
        }

        showLoader();
        try {
            const res = await fetch(`${API_URL}${url}`, { ...options, headers }); 
            const contentType = res.headers.get("content-type");
            
            if (res.status === 401) { showLogin(); throw new Error('Sesión expirada.'); } 
            if (res.status === 204 || (options.method === 'DELETE' && res.ok)) return {ok: true}; 
            
            if (contentType && contentType.indexOf("application/json") === -1) {
                const text = await res.text();
                console.error("Respuesta no JSON:", text);
                throw new Error("Error de conexión con el servidor.");
            }

            const data = await res.json(); 
            if (!res.ok) throw new Error(data.error || 'Error del servidor'); 
             
            if (!options.method || options.method === 'GET') {
                if(url.includes('/artistas')) { localCache.artistas = Array.isArray(data) ? data : []; localStorage.setItem('cache_artistas', JSON.stringify(localCache.artistas)); }
                if(url.includes('/servicios')) { localCache.servicios = data; localStorage.setItem('cache_servicios', JSON.stringify(data)); }
                if(url.includes('/proyectos') && !url.includes('agenda')) { 
                    if(Array.isArray(data) && url === '/api/proyectos') { localCache.proyectos = data; localStorage.setItem('cache_proyectos', JSON.stringify(data)); }
                }
                if(url.includes('/usuarios')) { localCache.usuarios = data; }
                if(url.includes('/pagos/todos')) { localCache.pagos = data; localStorage.setItem('cache_pagos', JSON.stringify(data)); }
            }
            return data; 
        } catch(e) {
            if (!navigator.onLine || e.message.includes('Failed to fetch')) {
                 OfflineManager.updateIndicator(); 
                 // Si falla el fetch por red, encolamos si es mutación
                 if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method)) {
                     const body = options.body ? JSON.parse(options.body) : {};
                     const tempId = body._id || `temp_${Date.now()}`;
                     OfflineManager.addToQueue(`${API_URL}${url}`, { ...options, headers }, tempId);
                     return { ok: true, offline: true, _id: tempId };
                 }
                 throw new Error('Sin conexión.');
            }
            throw e;
        } finally { hideLoader(); }
    }

    // --- CARGA INICIAL Y AUTH ---
    async function loadPublicLogo() {
        try {
            const res = await fetch(`${API_URL}/api/configuracion/public/logo`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.filePath) {
                const logoSrc = data.filePath + `?t=${new Date().getTime()}`;
                if(DOMElements.loginLogo) DOMElements.loginLogo.src = logoSrc;
                if(DOMElements.appLogo) DOMElements.appLogo.src = logoSrc;
                const favicon = document.getElementById('dynamic-favicon');
                if(favicon) favicon.href = logoSrc;
            }
        } catch (e) { console.warn("Offline: Usando logo cacheado"); }
    }

    function showLogin() { 
        document.body.classList.add('auth-visible');
        localStorage.removeItem('token'); 
        if(DOMElements.loginContainer) DOMElements.loginContainer.style.display = 'block'; 
        if(DOMElements.appWrapper) DOMElements.appWrapper.style.display = 'none'; 
        document.body.style.opacity = '1'; 
        document.body.style.visibility = 'visible'; 
        toggleAuth('login');
    }

    function toggleAuth(view) {
        // Ocultar todas las vistas de auth
        ['login-view', 'register-view', 'recover-view', 'reset-password-view'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });
        // Mostrar la solicitada
        const target = document.getElementById(`${view}-view`);
        if(target) target.style.display = 'block';
        
        const errDiv = document.getElementById('login-error');
        if(errDiv) errDiv.textContent = '';
    }

    // --- MANEJO DE FORMULARIOS DE LOGIN/REGISTRO ---
    const loginForm = document.getElementById('login-form');
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => { 
            e.preventDefault(); 
            if (!navigator.onLine) { return showToast('Se requiere internet.', 'error'); }
            showLoader();
            try { 
                const usernameVal = document.getElementById('username').value;
                const passwordVal = document.getElementById('password').value;
                const res = await fetch(`${API_URL}/api/auth/login`, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ username: usernameVal, password: passwordVal }) 
                }); 
                const data = await res.json(); 
                if (!res.ok) throw new Error(data.error); 
                localStorage.setItem('token', data.token); 
                await showApp(JSON.parse(atob(data.token.split('.')[1]))); 
            } catch (error) { 
                const errDiv = document.getElementById('login-error');
                if(errDiv) errDiv.textContent = error.message; 
            } finally { hideLoader(); }
        });
    }

    // --- MOSTRAR APP PRINCIPAL ---
    async function showApp(payload) { 
        document.body.classList.remove('auth-visible');
        if (!configCache) await loadInitialConfig();
        
        if(DOMElements.welcomeUser) DOMElements.welcomeUser.textContent = `Hola, ${escapeHTML(payload.username)}`; 
        
        renderSidebar(payload); // Generar menú según permisos

        if (!isInitialized) { 
            initAppEventListeners(payload); 
            isInitialized = true; 
        } 

        if(DOMElements.loginContainer) DOMElements.loginContainer.style.display = 'none'; 
        if(DOMElements.appWrapper) DOMElements.appWrapper.style.display = window.innerWidth <= 768 ? 'block' : 'flex'; 
        
        const hashSection = location.hash.replace('#', '');
        mostrarSeccion(hashSection || 'dashboard', false);
        
        OfflineManager.updateIndicator();
        document.body.style.opacity = '1';
        document.body.style.visibility = 'visible'; 
    }

    // --- NAVEGACIÓN ---
    async function mostrarSeccion(id, updateHistory = true) { 
        document.querySelectorAll('section').forEach(sec => sec.classList.remove('active')); 
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active-link')); 
        
        const seccionActiva = document.getElementById(id); 
        const linkActivo = document.querySelector(`.nav-link[data-seccion="${id}"]`); 
        
        if (seccionActiva) { 
            seccionActiva.classList.add('active'); 
            if(linkActivo) {
                linkActivo.classList.add('active-link');
                const parentGroup = linkActivo.closest('.nav-group');
                if (parentGroup) parentGroup.setAttribute('open', '');
            }
            if(updateHistory) history.pushState(null, null, `#${id}`);
            
            const searchInput = document.getElementById('globalSearch');
            if(searchInput) { searchInput.value = ''; }

            const loadDataActions = { 
                'dashboard': cargarDashboard, 
                'agenda': cargarAgenda, 
                'cotizaciones': cargarCotizaciones, 
                'flujo-trabajo': cargarFlujoDeTrabajo, 
                'pagos': cargarPagos, 
                'registrar-proyecto': cargarOpcionesParaProyecto, 
                'registro-manual': cargarOpcionesParaProyectoManual, 
                'historial-proyectos': cargarHistorial, 
                'gestion-servicios': () => renderList('servicios'), 
                'gestion-artistas': () => renderList('artistas', true), 
                'gestion-usuarios': () => renderList('usuarios'), 
                'papelera-reciclaje': cargarPapelera, 
                'configuracion': cargarConfiguracion, 
            }; 
            await loadDataActions[id]?.(); 
        } 
    }

    // --- CRUD GENÉRICO CON MODALES BOOTSTRAP (NUEVO) ---
    
    // Función para renderizar lista
    async function renderList(endpoint, makeClickable = false) { 
        const listId = `lista${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`; 
        try { 
            const data = await fetchAPI(`/api/${endpoint}`); 
            document.getElementById(listId).innerHTML = data.length ? data.map(item => { 
                let displayName; 
                if (endpoint === 'artistas') { displayName = `${item.nombreArtistico || item.nombre} ${item.nombreArtistico ? `(${item.nombre})` : ''}`; } 
                else if (endpoint === 'usuarios') { displayName = `${item.username || 'Usuario'} (${item.role})`; } 
                else { displayName = `${item.nombre || 'Sin Nombre'} - $${item.precio.toFixed(2)}`; }
                
                const clickHandler = makeClickable ? `ondblclick="app.irAVistaArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}')"` : '';
                
                return `
                <li class="list-item" ${clickHandler} style="${makeClickable ? 'cursor:pointer;' : ''}">
                    <span>${escapeHTML(displayName)}</span>
                    <div class="list-item-actions">
                        <button class="btn-secondary" onclick="event.stopPropagation(); app.abrirModalEditar('${item._id}', '${endpoint}')">✏️</button>
                        <button class="btn-eliminar" onclick="event.stopPropagation(); app.eliminarItem('${item._id}', '${endpoint}')">🗑️</button>
                    </div>
                </li>`; 
            }).join('') : `<li class="list-item">No hay elementos.</li>`; 
        } catch (e) { document.getElementById(listId).innerHTML = `<li>Error al cargar.</li>`; } 
    }

    // Abrir Modal Crear (Bootstrap)
    window.app.abrirModalCrear = function(tipo) {
        const modalId = `modal${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
        const formId = `formModal${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
        const form = document.getElementById(formId);
        if(form) {
            form.reset();
            const hiddenInput = form.querySelector('input[type="hidden"]');
            if(hiddenInput) hiddenInput.value = ""; 
        }
        // Instancia y muestra modal Bootstrap
        const myModal = new bootstrap.Modal(document.getElementById(modalId));
        myModal.show();
    };

    // Abrir Modal Editar (Bootstrap)
    window.app.abrirModalEditar = function(id, tipo) {
        let item;
        if (tipo === 'servicios') item = localCache.servicios.find(i => i._id === id);
        else if (tipo === 'artistas') item = localCache.artistas.find(i => i._id === id);
        else if (tipo === 'usuarios') item = localCache.usuarios.find(i => i._id === id);

        if (!item) return showToast('Elemento no encontrado', 'error');

        // Llenar campos según tipo
        if (tipo === 'servicios') {
            document.getElementById('modalIdServicio').value = item._id;
            document.getElementById('modalNombreServicio').value = item.nombre;
            document.getElementById('modalPrecioServicio').value = item.precio;
        } else if (tipo === 'artistas') {
            document.getElementById('modalIdArtista').value = item._id;
            document.getElementById('modalNombreArtista').value = item.nombre;
            document.getElementById('modalNombreArtistico').value = item.nombreArtistico || '';
            document.getElementById('modalTelefonoArtista').value = item.telefono || '';
            document.getElementById('modalCorreoArtista').value = item.correo || '';
        } else if (tipo === 'usuarios') {
            document.getElementById('modalIdUsuario').value = item._id;
            document.getElementById('modalUsername').value = item.username;
            document.getElementById('modalEmail').value = item.email || '';
            document.getElementById('modalRole').value = item.role;
            document.getElementById('modalPassword').value = ''; 
        }

        const modalId = `modal${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
        const myModal = new bootstrap.Modal(document.getElementById(modalId));
        myModal.show();
    };

    // Guardar desde Modal Bootstrap
    window.app.guardarDesdeModal = async function(tipo) {
        const formId = `formModal${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
        const form = document.getElementById(formId);
        const id = form.querySelector('input[type="hidden"]').value;
        const method = id ? 'PUT' : 'POST';
        const url = `/api/${tipo}/${id || ''}`;
        
        let body = {};

        // Recoger datos
        if (tipo === 'servicios') {
            body = { 
                nombre: document.getElementById('modalNombreServicio').value, 
                precio: parseFloat(document.getElementById('modalPrecioServicio').value) 
            };
        } else if (tipo === 'artistas') {
            body = { 
                nombre: document.getElementById('modalNombreArtista').value, 
                nombreArtistico: document.getElementById('modalNombreArtistico').value,
                telefono: document.getElementById('modalTelefonoArtista').value, 
                correo: document.getElementById('modalCorreoArtista').value
            };
        } else if (tipo === 'usuarios') {
            body = { 
                username: document.getElementById('modalUsername').value, 
                email: document.getElementById('modalEmail').value,
                role: document.getElementById('modalRole').value 
            };
            const pass = document.getElementById('modalPassword').value;
            if(pass) body.password = pass;
            if(!id && !pass) return showToast('La contraseña es obligatoria', 'error');
        }

        try {
            const res = await fetchAPI(url, { method, body: JSON.stringify(body) });
            showToast(res.offline ? 'Guardado localmente' : 'Guardado con éxito', 'success');
            
            // Cerrar modal
            const modalEl = document.getElementById(`modal${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            modalInstance.hide();
            
            // Recargar lista
            renderList(tipo, tipo === 'artistas');
        } catch(error) {
            showToast('Error al guardar: ' + error.message, 'error');
        }
    };

    // Eliminar
    async function eliminarItem(id, endpoint) { 
        if (!confirm(`¿Mover a la papelera?`)) return; 
        try { 
            await fetchAPI(`/api/${endpoint}/${id}`, { method: 'DELETE' }); 
            showToast('Movido a papelera.', 'info'); 
            renderList(endpoint, endpoint === 'artistas'); 
        } 
        catch (error) { showToast(`Error: ${error.message}`, 'error'); } 
    }

    // --- FUNCIONES DE PAPELERA ---
    async function cargarPapelera() { 
      const endpoints = ['servicios', 'artistas', 'usuarios', 'proyectos']; 
      for (const endpoint of endpoints) { 
          const listId = `papelera${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`; 
          try { 
              const data = await fetchAPI(`/api/${endpoint}/papelera/all`); 
              const ul = document.getElementById(listId);
              if(ul) {
                  ul.innerHTML = data.length ? data.map(item => {
                      let displayName = item.nombre || item.username || item.nombreProyecto || 'Item';
                      return `<li class="list-item">
                        <span>${escapeHTML(displayName)}</span>
                        <div class="list-item-actions">
                            <button class="btn-restaurar" onclick="app.restaurarItem('${item._id}', '${endpoint}')">↩️</button>
                            <button class="btn-eliminar" onclick="app.eliminarPermanente('${item._id}', '${endpoint}')">❌</button>
                        </div>
                      </li>`;
                  }).join('') : `<li>Vacía.</li>`; 
              }
          } catch (e) { console.log("Error papelera", e); } 
      } 
    }
    
    async function restaurarItem(id, endpoint) { try { await fetchAPI(`/api/${endpoint}/${id}/restaurar`, { method: 'PUT' }); showToast('Restaurado.', 'success'); cargarPapelera(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
    async function eliminarPermanente(id, endpoint) { if (!confirm('¡Irreversible!')) return; try { await fetchAPI(`/api/${endpoint}/${id}/permanente`, { method: 'DELETE' }); showToast('Eliminado.', 'success'); cargarPapelera(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
    async function vaciarPapelera(endpoint) { if (!confirm(`¿Vaciar ${endpoint}?`)) return; try { await fetchAPI(`/api/${endpoint}/papelera/vaciar`, { method: 'DELETE' }); showToast(`Vaciada.`, 'success'); cargarPapelera(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }

    // --- PROYECTOS & COTIZACIONES ---
    const cargarOpcionesParaProyecto = () => { cargarOpcionesParaSelect('/api/artistas', 'proyectoArtista', '_id', item => item.nombreArtistico || item.nombre, true); cargarOpcionesParaSelect('/api/servicios', 'proyectoServicio', '_id', item => `${item.nombre} - $${item.precio.toFixed(2)}`); }
    const cargarOpcionesParaProyectoManual = () => { cargarOpcionesParaSelect('/api/artistas', 'manualProyectoArtista', '_id', item => item.nombreArtistico || item.nombre, false); flatpickr("#manualFechaProyecto", { defaultDate: "today", locale: "es" }); };
    
    async function cargarOpcionesParaSelect(url, selectId, valueField, textFieldFn, addPublicoGeneral = false, currentValue = null) { 
        const select = document.getElementById(selectId); 
        try { 
            const data = await fetchAPI(url); 
            select.innerHTML = ''; 
            if (addPublicoGeneral) { 
                const op = document.createElement('option'); op.value = 'publico_general'; op.textContent = 'Público General'; select.appendChild(op); 
            } 
            data.forEach(item => { 
                const option = document.createElement('option'); option.value = item[valueField]; option.textContent = textFieldFn(item); option.dataset.precio = item.precio || 0; select.appendChild(option); 
            }); 
              
            if (selectId === 'proyectoArtista' && preseleccionArtistaId) {
                select.value = preseleccionArtistaId;
                preseleccionArtistaId = null; 
            } else if (currentValue) {
                select.value = currentValue; 
            }
        } catch (error) { select.innerHTML = `<option value="">Error o Offline</option>`; } 
    }

    function agregarAProyecto() { 
        const select = document.getElementById('proyectoServicio'); 
        if (!select.value) return; 
        const id = `item-${select.value}-${Date.now()}`; 
        proyectoActual[id] = { id, servicioId: select.value, nombre: select.options[select.selectedIndex].text.split(' - ')[0], unidades: parseInt(document.getElementById('proyectoUnidades').value) || 1, precioUnitario: parseFloat(select.options[select.selectedIndex].dataset.precio) }; 
        mostrarProyectoActual(); 
    }

    function mostrarProyectoActual() { 
        const lista = document.getElementById('listaProyectoActual'); 
        let total = 0; 
        lista.innerHTML = Object.values(proyectoActual).map(item => { 
            const subtotal = item.precioUnitario * item.unidades; total += subtotal; 
            return `<li class="list-item"><span>${item.unidades}x ${escapeHTML(item.nombre)}</span><span>$${subtotal.toFixed(2)} <button class="btn-eliminar" style="padding:0.2rem 0.5rem;height:auto;" onclick="app.quitarDeProyecto('${item.id}')">X</button></span></li>`; 
        }).join(''); 
        document.getElementById('totalAPagar').textContent = `$${total.toFixed(2)}`; 
    }
    
    function quitarDeProyecto(id) { delete proyectoActual[id]; mostrarProyectoActual(); }

    async function guardarProyecto(procesoDestino) { 
        const artistaSelect = document.getElementById('proyectoArtista'); const artistaId = artistaSelect.value; const fechaInput = document.getElementById('fechaProyecto')._flatpickr.selectedDates[0]; const horaInput = document.getElementById('horaProyecto').value;
        let fechaFinal = new Date(); if(fechaInput) { fechaFinal = fechaInput; if(horaInput) { const [hours, minutes] = horaInput.split(':'); fechaFinal.setHours(hours); fechaFinal.setMinutes(minutes); } }
        if (Object.keys(proyectoActual).length === 0) { showToast('Faltan servicios.', 'error'); return null; } 
        const items = Object.values(proyectoActual).map(i => ({ servicio: i.servicioId, nombre: i.nombre, unidades: i.unidades, precioUnitario: i.precioUnitario }));
        const subtotal = items.reduce((sum, item) => sum + (item.precioUnitario * item.unidades), 0);
        const descuento = parseFloat(document.getElementById('proyectoDescuento').value) || 0;
        const total = Math.max(0, subtotal - descuento);
        const body = { artista: artistaId === 'publico_general' ? null : artistaId, nombreProyecto: document.getElementById('nombreProyecto').value, items: items, total: total, descuento: descuento, estatus: procesoDestino === 'Cotizacion' ? 'Cotizacion' : 'Pendiente de Pago', metodoPago: 'Pendiente', fecha: fechaFinal.toISOString(), prioridad: 'Normal', proceso: procesoDestino, esAlbum: document.getElementById('esAlbum').checked }; 
        try { return await fetchAPI('/api/proyectos', { method: 'POST', body: JSON.stringify(body) }); } catch (error) { showToast(`Error: ${error.message}`, 'error'); return null; } 
    }

    async function generarCotizacion() { const nuevoProyecto = await guardarProyecto('Cotizacion'); if (nuevoProyecto) { showToast(nuevoProyecto.offline?'Guardado offline.':'Cotización guardada.', nuevoProyecto.offline?'warning':'success'); await generarCotizacionPDF(nuevoProyecto._id || nuevoProyecto); proyectoActual = {}; document.getElementById('proyectoDescuento').value = ''; document.getElementById('horaProyecto').value = ''; mostrarProyectoActual(); document.getElementById('formProyecto').reset(); mostrarSeccion('cotizaciones'); } }
    async function enviarAFlujoDirecto() { const nuevoProyecto = await guardarProyecto('Agendado'); if (nuevoProyecto) { showToast('Agendado.', 'success'); proyectoActual = {}; document.getElementById('proyectoDescuento').value = ''; document.getElementById('horaProyecto').value = ''; mostrarProyectoActual(); document.getElementById('formProyecto').reset(); mostrarSeccion('flujo-trabajo'); } }

    async function guardarProyectoManual() {
      const artistaId = document.getElementById('manualProyectoArtista').value; const nombreProyecto = document.getElementById('manualNombreProyecto').value; const fecha = document.getElementById('manualFechaProyecto')._flatpickr.selectedDates[0]; const descripcion = document.getElementById('manualDescripcion').value;
      if (!artistaId || !nombreProyecto || !fecha) { return showToast('Datos incompletos.', 'error'); }
      const body = { artista: artistaId, nombreProyecto: nombreProyecto, items: [{ nombre: descripcion, unidades: 1, precioUnitario: 0 }], total: 0, estatus: 'Pagado', proceso: 'Agendado', fecha: fecha.toISOString(), };
      try { await fetchAPI('/api/proyectos', { method: 'POST', body: JSON.stringify(body) }); showToast('Guardado.', 'success'); document.getElementById('formProyectoManual').reset(); mostrarSeccion('flujo-trabajo'); } catch(e) { showToast(`Error: ${e.message}`, 'error'); }
    }
    
    async function cargarCotizaciones() { const tablaBody = document.getElementById('tablaCotizacionesBody'); tablaBody.innerHTML = `<tr><td colspan="4">Cargando...</td></tr>`; try { const cotizaciones = await fetchAPI('/api/proyectos/cotizaciones'); tablaBody.innerHTML = cotizaciones.length ? cotizaciones.map(c => { const esArtistaRegistrado = c.artista && c.artista._id; const nombreArtista = esArtistaRegistrado ? c.artista.nombre : 'Público General'; const claseTd = esArtistaRegistrado ? 'clickable-artist' : ''; const eventoDblClick = esArtistaRegistrado ? `ondblclick="app.irAVistaArtista('${c.artista._id}', '${escapeHTML(c.artista.nombre)}', '')"` : ''; return `<tr><td class="${claseTd}" ${eventoDblClick}>${escapeHTML(nombreArtista)}</td><td>$${c.total.toFixed(2)}</td><td>${new Date(c.createdAt).toLocaleDateString()}</td><td class="table-actions"><button class="btn-aprobar" onclick="app.aprobarCotizacion('${c._id}')">✓</button><button class="btn-secondary" title="PDF" onclick="app.generarCotizacionPDF('${c._id}')">📄</button><button class="btn-secondary" title="WhatsApp" onclick="app.compartirPorWhatsApp('${c._id}')">💬</button><button class="btn-eliminar" onclick="app.eliminarProyecto('${c._id}', true)">🗑️</button></td></tr>`; }).join('') : `<tr><td colspan="4">Sin cotizaciones.</td></tr>`; } catch(e) { tablaBody.innerHTML = `<tr><td colspan="4">Error offline.</td></tr>`; } }
    async function aprobarCotizacion(id) { if (!confirm('¿Aprobar cotización?')) return; try { await fetchAPI(`/api/proyectos/${id}/proceso`, { method: 'PUT', body: JSON.stringify({ proceso: 'Agendado' }) }); showToast('¡Aprobada!', 'success'); mostrarSeccion('flujo-trabajo'); } catch(error) { showToast(`Error`, 'error'); } }
    async function eliminarProyecto(id, desdeCotizaciones = false) { if (!confirm('¿Mover a papelera?')) return; try { await fetchAPI(`/api/proyectos/${id}`, { method: 'DELETE' }); showToast('Movido a papelera.', 'info'); if (desdeCotizaciones) cargarCotizaciones(); else if (document.getElementById('historial-proyectos').classList.contains('active')) cargarHistorial(); else { const filtroActual = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos'; filtrarFlujo(filtroActual); } } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
    async function compartirPorWhatsApp(proyectoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const nombreCliente = proyecto.artista ? proyecto.artista.nombre : 'cliente'; const mensaje = `¡Hola ${nombreCliente}! Resumen FiaRecords:\n\nServicios:\n${proyecto.items.map(i => `- ${i.unidades}x ${i.nombre}`).join('\n')}\n\n*Total: $${proyecto.total.toFixed(2)} MXN*\n\nContáctanos para confirmar.`; window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank'); } catch (error) { showToast('Error.', 'error'); } }

    // --- DASHBOARD ---
    async function cargarDashboard() { 
      try { 
          const stats = await fetchAPI('/api/dashboard/stats'); 
          document.getElementById('kpi-ingresos-mes').textContent = `$${(stats.ingresosMes||0).toFixed(2)}`; 
          document.getElementById('kpi-proyectos-activos').textContent = stats.proyectosActivos || 0; 
          document.getElementById('kpi-proyectos-por-cobrar').textContent = stats.proyectosPorCobrar || 0; 
          
          const ctx = document.getElementById('incomeChart').getContext('2d');
          if (chartInstance) chartInstance.destroy();
          const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
          const dataValues = stats.monthlyIncome || [0,0,0,0,0,0,0,0,0,0,0,0];
          chartInstance = new Chart(ctx, { 
              type: 'line', 
              data: { labels: labels, datasets: [{ label: 'Ingresos ($)', data: dataValues, borderColor: '#6366f1', fill: true, tension: 0.4 }] }, 
              options: { responsive: true, maintainAspectRatio: false } 
          });
      } catch(e) { console.error("Error dashboard:", e); } 
    }

    // --- FLUJO DE TRABAJO (KANBAN) ---
    const procesos = ['Solicitud', 'Agendado', 'Grabacion', 'Edicion', 'Mezcla', 'Mastering', 'Completo'];
    async function cargarFlujoDeTrabajo(filtroActivo = 'Todos') { 
        const board = document.getElementById('kanbanBoard'); 
        const filtros = document.getElementById('filtrosFlujo'); 
        if(!filtros.innerHTML) { filtros.innerHTML = `<button class="btn-secondary active" onclick="app.filtrarFlujo('Todos')">Todos</button>` + procesos.filter(p=>p!=='Completo').map(p => `<button class="btn-secondary" onclick="app.filtrarFlujo('${p}')">${p}</button>`).join(''); } 
        board.innerHTML = procesos.filter(p => p !== 'Completo').map(p => `<div class="kanban-column" data-columna="${p}"><h3>${p}</h3><div id="columna-${p}"></div></div>`).join(''); 
        try { localCache.proyectos = await fetchAPI('/api/proyectos'); filtrarFlujo(filtroActivo); } catch(e) { console.error("Error flujo:", e); } 
    }
    
    function filtrarFlujo(filtro) { 
        document.querySelectorAll('#filtrosFlujo button').forEach(b => { b.classList.remove('active'); b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); }); 
        const activeBtn = document.querySelector(`#filtrosFlujo button[onclick="app.filtrarFlujo('${filtro}')"]`);
        if(activeBtn) { activeBtn.classList.add('active'); activeBtn.classList.remove('btn-secondary'); activeBtn.classList.add('btn-primary'); }
        
        document.querySelectorAll('.kanban-column').forEach(c => c.style.display = (filtro === 'Todos' || c.dataset.columna === filtro) ? 'block' : 'none'); 
        procesos.forEach(col => { if(document.getElementById(`columna-${col}`)) document.getElementById(`columna-${col}`).innerHTML = '' }); 
        
        if(localCache.proyectos) {
          localCache.proyectos.filter(p => p.proceso !== 'Completo' && p.estatus !== 'Cancelado').forEach(p => { 
              const card = document.createElement('div'); card.className = `project-card`; card.dataset.id = p._id; card.style.borderColor = `var(--proceso-${p.proceso})`; 
              const serviciosHtml = p.items.length > 0 ? p.items.map(i => `<li>${escapeHTML(i.nombre)}</li>`).join('') : `<li>${escapeHTML(p.nombreProyecto || 'Sin servicios')}</li>`;
              const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Público General'; 
              
              card.innerHTML = `<div class="project-card-header">
                                              <span class="${p.artista?'clickable-artist':''}" ${p.artista?`ondblclick="app.irAVistaArtista('${p.artista._id}', '${escapeHTML(p.artista.nombre)}', '')"`:''}>${escapeHTML(p.nombreProyecto || artistaNombre)}</span>
                                              <div style="display:flex;gap:4px;">
                                                  <button class="btn-secondary" style="width:24px;height:24px;padding:0;font-size:0.7em;" title="Editar Info" onclick="app.editarInfoProyecto('${p._id}')">✏️</button>
                                                  <button class="btn-eliminar" style="width:24px;height:24px;padding:0;font-size:0.7em;" title="Eliminar Proyecto" onclick="app.eliminarProyecto('${p._id}')">🗑️</button>
                                              </div>
                                      </div>
                                      <div class="project-card-body"><div style="font-weight:600;margin-bottom:8px;font-size:0.9em;">🗓️ ${new Date(p.fecha).toLocaleDateString()}</div><ul style="padding-left:0;list-style:none;font-size:0.85em;color:var(--text-color-light);">${serviciosHtml}</ul></div>
                                      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;padding-top:0.5rem;border-top:1px solid var(--border-color);">
                                              <strong style="font-size:0.9em;">$${p.total.toFixed(2)}</strong>
                                              <div style="display:flex;gap:4px;align-items:center;">
                                                  <button class="btn-eliminar" title="Cancelar Cita" style="width:auto;padding:0.3rem 0.5rem;font-size:0.7em;" onclick="app.cancelarCita('${p._id}')">🚫</button>
                                                  <button class="btn-secondary" style="width:auto;padding:0.3rem 0.5rem;font-size:0.7em;" onclick="app.registrarPago('${p._id}')">$</button>
                                                  <select onchange="app.cambiarProceso('${p._id}', this.value)" style="width:20px;padding:0;border:none;background:transparent;margin:0;">${procesos.map(proc => `<option value="${proc}" ${p.proceso === proc ? 'selected' : ''}>${proc}</option>`).join('')}</select>
                                              </div>
                                      </div>`; 
              document.getElementById(`columna-${p.proceso}`)?.appendChild(card); 
          });
        }
    }
    
    async function cambiarProceso(id, proceso) { try { const data = { proceso }; if (proceso === 'Completo') { const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto.estatus !== 'Pagado') { if (!confirm('Este proyecto no está pagado. ¿Completar?')) return; } } await fetchAPI(`/api/proyectos/${id}/proceso`, { method: 'PUT', body: JSON.stringify(data) }); const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto) proyecto.proceso = proceso; const filtroActual = document.querySelector('#filtrosFlujo button.active').textContent.trim(); if(proceso === 'Completo') { showToast('¡Proyecto completado!', 'success'); } filtrarFlujo(filtroActual); } catch (e) { showToast(`Error: ${e.message}`, 'error'); } }
    async function cancelarCita(id) { if (!confirm('¿Cancelar cita? Se liberará la fecha.')) return; try { await fetchAPI(`/api/proyectos/${id}/estatus`, { method: 'PUT', body: JSON.stringify({ estatus: 'Cancelado' }) }); showToast('Cancelada.', 'info'); app.cargarAgenda(); if (document.getElementById('flujo-trabajo').classList.contains('active')) app.filtrarFlujo('Todos'); } catch(e) { showToast(`Error: ${e.message}`, 'error'); } }
    async function editarInfoProyecto(id) {
        const proyecto = localCache.proyectos.find(p => p._id === id);
        if (!proyecto) return;
        const nuevoNombre = prompt('Editar Nombre del Proyecto/Canción:', proyecto.nombreProyecto || '');
        if (nuevoNombre === null) return;
        const nuevoTotalStr = prompt('Editar Precio Total ($):', proyecto.total || 0);
        if (nuevoTotalStr === null) return;
        const nuevoTotal = parseFloat(nuevoTotalStr);
        try { 
            if (nuevoNombre.trim() !== proyecto.nombreProyecto) { await fetchAPI(`/api/proyectos/${id}/nombre`, { method: 'PUT', body: JSON.stringify({ nombreProyecto: nuevoNombre.trim() }) }); proyecto.nombreProyecto = nuevoNombre.trim(); }
            if (!isNaN(nuevoTotal) && nuevoTotal !== proyecto.total) { await fetchAPI(`/api/proyectos/${id}`, { method: 'PUT', body: JSON.stringify({ total: nuevoTotal }) }); proyecto.total = nuevoTotal; }
            showToast('Proyecto actualizado.', 'success'); 
            if(document.getElementById('flujo-trabajo').classList.contains('active')) { const filtro = document.querySelector('#filtrosFlujo button.active').textContent.trim(); filtrarFlujo(filtro); }
        } catch (e) { showToast(`Error al editar`, 'error'); }
    }

    // --- AGENDA (FULLCALENDAR) ---
    async function cargarAgenda() {
      const calendarEl = document.getElementById('calendario');
      if (currentCalendar) { currentCalendar.destroy(); }
      try {
          const eventos = await fetchAPI('/api/proyectos/agenda');
          const isMobile = window.innerWidth < 768;
          currentCalendar = new FullCalendar.Calendar(calendarEl, {
              locale: 'es', initialView: 'dayGridMonth',
              headerToolbar: { left: 'prev,next today', center: 'title', right: isMobile ? 'dayGridMonth,listMonth' : 'dayGridMonth,timeGridWeek,listWeek' },
              height: 'auto', dayMaxEvents: true,
              events: eventos,
              dateClick: (info) => { mostrarSeccion('registrar-proyecto'); document.getElementById('fechaProyecto')._flatpickr.setDate(info.date); showToast(`Fecha seleccionada: ${info.date.toLocaleDateString()}`, 'info'); },
              eventClick: openEventModal,
              eventDrop: async (info) => { if (!confirm(`¿Mover proyecto?`)) { info.revert(); return; } try { await app.cambiarAtributo(info.event.id, 'fecha', info.event.start.toISOString()); showToast('Actualizado.', 'success'); cargarFlujoDeTrabajo('Todos'); } catch (error) { info.revert(); } },
              eventContent: (arg) => { if(isMobile && !arg.view.type.includes('list')) { return { html: '' }; } else { return { html: `<div class="fc-event-main-frame"><div class="fc-event-title">${escapeHTML(arg.event.title)}</div></div>` }; } },
              eventDidMount: function(info) { if(isMobile && !info.view.type.includes('list')) { let colorVar = `var(--proceso-${info.event.extendedProps.proceso}, var(--primary-color))`; info.el.style.backgroundColor = colorVar; } }
          });
          currentCalendar.render();
      } catch (error) { calendarEl.innerHTML = '<p>Error agenda.</p>'; }
    }

    function openEventModal(info) { 
        const props = info.event.extendedProps; 
        document.getElementById('modal-event-id').value = info.event.id;
        document.getElementById('modal-event-title').textContent = info.event.title; 
        document.getElementById('modal-event-date').textContent = info.event.start.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); 
        document.getElementById('modal-event-total').textContent = `$${(props.total||0).toFixed(2)}`; 
        document.getElementById('modal-event-status').textContent = props.estatus; 
        document.getElementById('modal-event-process').textContent = props.proceso; 
        document.getElementById('modal-event-services').innerHTML = (props.servicios || '').split('\n').map(s => `<li>${escapeHTML(s)}</li>`).join(''); 
        flatpickr("#edit-event-date", { defaultDate: info.event.start, locale: "es" });
        const hours = String(info.event.start.getHours()).padStart(2, '0');
        const minutes = String(info.event.start.getMinutes()).padStart(2, '0');
        document.getElementById('edit-event-time').value = `${hours}:${minutes}`;
        document.getElementById('btn-go-to-workflow').onclick = () => { closeEventModal(); mostrarSeccion('flujo-trabajo'); setTimeout(() => { const card = document.querySelector(`.project-card[data-id="${info.event.id}"]`); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200); }; 
        const btnArtist = document.getElementById('btn-go-to-artist'); 
        if (props.artistaId || props.artista) { btnArtist.style.display = 'block'; btnArtist.onclick = () => { closeEventModal(); app.irAVistaArtista(props.artistaId || props.artista._id, props.artistaNombre || (props.artista ? props.artista.nombre : ''), ''); }; } else { btnArtist.style.display = 'none'; } 
        const oldCancelBtn = document.getElementById('btn-cancelar-evento-modal'); if(oldCancelBtn) oldCancelBtn.remove();
        if (props.estatus !== 'Cancelado') { const btnCancelar = document.createElement('button'); btnCancelar.id = 'btn-cancelar-evento-modal'; btnCancelar.textContent = '❌ Cancelar Cita'; btnCancelar.className = 'btn-eliminar'; btnCancelar.style.marginTop = '1rem'; btnCancelar.style.width = '100%'; btnCancelar.onclick = () => app.cancelarCita(info.event.id); document.querySelector('#event-modal .modal-content').appendChild(btnCancelar); }
        document.getElementById('event-modal').style.display = 'flex'; 
    }
    
    function closeEventModal() { document.getElementById('event-modal').style.display = 'none'; }
    async function actualizarHorarioProyecto() {
        const id = document.getElementById('modal-event-id').value;
        const newDateInput = document.getElementById('edit-event-date')._flatpickr.selectedDates[0];
        const newTimeInput = document.getElementById('edit-event-time').value;
        if (!newDateInput) return showToast("Selecciona fecha", "error");
        let finalDate = new Date(newDateInput);
        if (newTimeInput) { const [h, m] = newTimeInput.split(':'); finalDate.setHours(h); finalDate.setMinutes(m); }
        try { await app.cambiarAtributo(id, 'fecha', finalDate.toISOString()); showToast("Actualizado", "success"); closeEventModal(); app.cargarAgenda(); } catch(e) { showToast("Error", "error"); }
    }
    async function cambiarAtributo(id, campo, valor) { try { await fetchAPI(`/api/proyectos/${id}/${campo}`, { method: 'PUT', body: JSON.stringify({ [campo]: valor }) }); const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto) proyecto[campo] = valor; if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtroActual = document.querySelector('#filtrosFlujo button.active').textContent.trim(); filtrarFlujo(filtroActual); } } catch (e) { showToast(`Error: ${e.message}`, 'error'); } }

    // --- PAGOS Y HISTORIAL ---
    async function cargarHistorial() { const tablaBody = document.getElementById('tablaHistorialBody'); tablaBody.innerHTML = `<tr><td colspan="5">Cargando...</td></tr>`; try { const historial = await fetchAPI('/api/proyectos/completos'); tablaBody.innerHTML = historial.length ? historial.map(p => { const artistaNombre = p.artista ? p.artista.nombre : 'Público General'; return `<tr><td class="${p.artista?'clickable-artist':''}" ${p.artista?`ondblclick="app.irAVistaArtista('${p.artista._id}', '${escapeHTML(p.artista.nombre)}', '')"`:''}>${escapeHTML(artistaNombre)}</td><td>$${p.total.toFixed(2)}</td><td>$${(p.montoPagado || 0).toFixed(2)}</td><td>${new Date(p.fecha).toLocaleDateString()}</td><td class="table-actions"><button class="btn-secondary" title="Entrega / Drive" onclick="app.openDeliveryModal('${p._id}', '${escapeHTML(artistaNombre)}', '${escapeHTML(p.nombreProyecto || 'Proyecto')}')">☁️</button><button class="btn-secondary" onclick="app.openDocumentsModal('${p._id}')">Docs</button><button class="btn-secondary" onclick="app.registrarPago('${p._id}', true)">$</button><button class="btn-eliminar" onclick="app.eliminarProyecto('${p._id}')">🗑️</button></td></tr>`; }).join('') : `<tr><td colspan="5">Sin historial.</td></tr>`; } catch(error) { tablaBody.innerHTML = `<tr><td colspan="5">Error.</td></tr>`; } }
    async function registrarPago(proyectoId, desdeHistorial = false) { 
        const cache = desdeHistorial ? (await fetchAPI('/api/proyectos/completos')) : localCache.proyectos; 
        let proyecto = cache.find(p => p._id === proyectoId); 
        if (!proyecto) { try { proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); } catch(e) { return showToast('No encontrado.', 'error'); }} 
        const restante = proyecto.total - (proyecto.montoPagado || 0); 
        const montoStr = prompt(`Registrar pago\nRestante: $${restante.toFixed(2)}\n¿Monto?`, restante > 0 ? restante.toFixed(2) : '0.00'); 
        if (montoStr === null) return; 
        const monto = parseFloat(montoStr); 
        if (isNaN(monto) || monto <= 0) return showToast('Monto inválido.', 'error'); 
        const metodo = prompt('Método (Efectivo, Transferencia):', 'Efectivo'); if (!metodo) return; 
        try { 
            const proyectoActualizado = await fetchAPI(`/api/proyectos/${proyectoId}/pagos`, { method: 'POST', body: JSON.stringify({ monto, metodo }) }); 
            showToast(proyectoActualizado.offline ? 'Offline. Recibo local.' : '¡Pago registrado!', proyectoActualizado.offline ? 'info' : 'success');
            const ultimoPago = proyectoActualizado.pagos[proyectoActualizado.pagos.length - 1];
            await generarReciboPDF(proyectoActualizado, ultimoPago); 
            if (document.getElementById('pagos').classList.contains('active')) { app.cargarPagos(); } 
            else if (desdeHistorial) { cargarHistorial(); } 
            else { cargarFlujoDeTrabajo(); } 
        } catch (error) { showToast(`Error: ${error.message}`, 'error'); } 
    }
    
    // Pestañas de Pagos
    async function cargarPagos() { mostrarSeccionPagos('pendientes', document.querySelector('.filter-buttons button.active')); }
    function mostrarSeccionPagos(vista, btn) {
        document.querySelectorAll('#pagos .filter-buttons button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if(vista === 'pendientes') {
            document.getElementById('vista-pagos-pendientes').style.display = 'block';
            document.getElementById('vista-pagos-historial').style.display = 'none';
            cargarPagosPendientes();
        } else {
            document.getElementById('vista-pagos-pendientes').style.display = 'none';
            document.getElementById('vista-pagos-historial').style.display = 'block';
            cargarHistorialPagos();
        }
    }
    async function cargarPagosPendientes() {
        const tabla = document.getElementById('tablaPendientesBody');
        tabla.innerHTML = '<tr><td colspan="5">Calculando...</td></tr>';
        const pendientes = localCache.proyectos.filter(p => {
            const pagado = p.montoPagado || 0;
            return (p.total > pagado) && p.estatus !== 'Cancelado' && p.estatus !== 'Cotizacion';
        });
        if(pendientes.length === 0) { tabla.innerHTML = '<tr><td colspan="5">¡Todo al día! No hay pagos pendientes.</td></tr>'; return; }
        tabla.innerHTML = pendientes.map(p => {
            const deuda = p.total - (p.montoPagado || 0);
            const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Cliente General';
            return `<tr><td><div style="font-weight:bold;">${escapeHTML(p.nombreProyecto || 'Proyecto')}</div><div style="font-size:0.85em; color:var(--text-color-light);">${escapeHTML(artistaNombre)}</div></td><td>$${p.total.toFixed(2)}</td><td>$${(p.montoPagado||0).toFixed(2)}</td><td style="color:var(--danger-color); font-weight:700;">$${deuda.toFixed(2)}</td><td class="table-actions"><button class="btn-secondary" onclick="app.registrarPago('${p._id}')">Cobrar 💵</button><button class="btn-secondary" onclick="app.compartirPorWhatsApp('${p._id}')">Recordar 💬</button></td></tr>`;
        }).join('');
    }
    async function cargarHistorialPagos() { 
        const tablaBody = document.getElementById('tablaPagosBody'); 
        tablaBody.innerHTML = `<tr><td colspan="5">Cargando...</td></tr>`; 
        try { 
            const pagos = await fetchAPI('/api/proyectos/pagos/todos'); 
            tablaBody.innerHTML = pagos.length ? pagos.map(p => `<tr><td>${new Date(p.fecha).toLocaleDateString()}</td><td class="clickable-artist" ondblclick="app.irAVistaArtista(null, '${escapeHTML(p.artista)}', '')">${escapeHTML(p.artista)}</td><td>$${p.monto.toFixed(2)}</td><td>${escapeHTML(p.metodo)}</td><td class="table-actions"><button class="btn-secondary" title="Recibo" onclick="app.reimprimirRecibo('${p.proyectoId}', '${p.pagoId}')">📄</button><button class="btn-secondary" title="WhatsApp" onclick="app.compartirPagoPorWhatsApp(JSON.stringify(${JSON.stringify(p)}).replace(/'/g, '&apos;'))">💬</button><button class="btn-eliminar" title="Eliminar" onclick="app.eliminarPago('${p.proyectoId}', '${p.pagoId}')">🗑️</button></td></tr>`).join('') : `<tr><td colspan="5">Sin pagos.</td></tr>`; 
        } catch (e) { tablaBody.innerHTML = `<tr><td colspan="5">Error offline.</td></tr>`; } 
    }
    async function reimprimirRecibo(proyectoId, pagoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const pago = proyecto.pagos.find(p => p._id === pagoId) || proyecto.pagos.find(p => p._id.startsWith('temp')); if (!pago) return showToast('No encontrado.', 'error'); await generarReciboPDF(proyecto, pago); } catch(e) { showToast('Error.', 'error'); } }
    function compartirPagoPorWhatsApp(pagoString) { const pago = JSON.parse(pagoString); const mensaje = `Confirmación de pago FiaRecords:\n\n*Fecha:* ${new Date(pago.fecha).toLocaleDateString()}\n*Monto:* $${pago.monto.toFixed(2)} MXN\n*Método:* ${pago.metodo}\n\n¡Gracias!`; window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank'); }
    async function eliminarPago(proyectoId, pagoId) { if (!confirm('¿Eliminar pago? Afectará el saldo.')) return; try { await fetchAPI(`/api/proyectos/${proyectoId}/pagos/${pagoId}`, { method: 'DELETE' }); showToast('Eliminado.', 'success'); cargarPagos(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }

    // --- GOOGLE DRIVE INTEGRATION ---
    function initializeGapiClient() {
      gapi.load('client', async () => {
        await gapi.client.init({ apiKey: GAP_CONFIG.apiKey, discoveryDocs: GAP_CONFIG.discoveryDocs });
        gapiInited = true;
      });
    }
    function initializeGisClient() {
      tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GAP_CONFIG.clientId, scope: GAP_CONFIG.scope, callback: '' });
      gisInited = true;
    }
    if(typeof gapi !== 'undefined') initializeGapiClient();
    if(typeof google !== 'undefined') initializeGisClient();

    async function subirADrive() {
        if (!gapiInited || !gisInited) { await new Promise(r => setTimeout(r, 1000)); if (!gapiInited || !gisInited) return showToast('Librerías de Google no cargadas.', 'error'); }
        const fileInput = document.getElementById('drive-file-input');
        if (fileInput.files.length === 0) return showToast('Selecciona un archivo primero.', 'error');
        const file = fileInput.files[0];
        const statusDiv = document.getElementById('drive-status');
        const btnText = document.getElementById('drive-btn-text');
        tokenClient.callback = async (resp) => {
          if (resp.error) throw resp;
          try {
              btnText.textContent = 'Subiendo...';
              const metadata = { name: file.name }; 
              const accessToken = gapi.client.getToken().access_token;
              const form = new FormData();
              form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
              form.append('file', file);
              const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
              const uploadResp = await fetch(uploadUrl, { method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }), body: form });
              if (!uploadResp.ok) throw new Error('Fallo en la subida');
              const resData = await uploadResp.json();
              document.getElementById('delivery-link-input').value = resData.webViewLink || `https://drive.google.com/file/d/${resData.id}/view`;
              statusDiv.textContent = `✅ Subido`;
              btnText.textContent = '📤 Subir Otro';
              showToast('¡Archivo subido! Link guardado.', 'success');
              saveDeliveryLink();
          } catch (err) { statusDiv.textContent = `Error: ${err.message}`; btnText.textContent = '📤 Reintentar'; }
        };
        if (gapi.client.getToken() === null) { tokenClient.requestAccessToken({prompt: ''}); } else { tokenClient.requestAccessToken({prompt: ''}); }
    }
    
    function openDeliveryModal(projectId, artistName, projectName) {
        const modal = document.getElementById('delivery-modal');
        modal.querySelector('#delivery-project-id').value = projectId;
        modal.querySelector('#delivery-artist-name').value = artistName;
        modal.querySelector('#delivery-project-name').value = projectName;
        const project = localCache.proyectos.find(p => p._id === projectId);
        modal.querySelector('#delivery-link-input').value = project ? project.enlaceEntrega : '';
        document.getElementById('drive-status').textContent = '';
        document.getElementById('drive-file-input').value = '';
        modal.style.display = 'flex';
    }
    function closeDeliveryModal() { document.getElementById('delivery-modal').style.display = 'none'; }
    async function saveDeliveryLink() {
        const projectId = document.getElementById('delivery-project-id').value;
        const enlace = document.getElementById('delivery-link-input').value;
        try { await fetchAPI(`/api/proyectos/${projectId}/enlace-entrega`, { method: 'PUT', body: JSON.stringify({ enlace }) }); showToast('Enlace guardado.', 'success'); closeDeliveryModal(); } catch(e) { showToast(`Error`, 'error'); }
    }
    function sendDeliveryByWhatsapp() {
        const link = document.getElementById('delivery-link-input').value;
        if (!link) return showToast('Falta el enlace.', 'error');
        const artistName = document.getElementById('delivery-artist-name').value;
        const projectName = document.getElementById('delivery-project-name').value;
        const mensaje = `¡Hola ${artistName}! Archivos finales de "${projectName}":\n\n${link}\n\n¡Gracias por confiar en FiaRecords!`;
        window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
    }

    // --- PDF GENERATION ---
    function getFinalCoordinates(pos) { let baseX, baseY; switch(pos.vAlign) { case 'top': baseY = PDF_DIMENSIONS.MARGIN; break; case 'middle': baseY = (PDF_DIMENSIONS.HEIGHT / 2) - (pos.h / 2); break; default: baseY = PDF_DIMENSIONS.HEIGHT - pos.h - PDF_DIMENSIONS.MARGIN; } switch(pos.hAlign) { case 'left': baseX = PDF_DIMENSIONS.MARGIN; break; case 'center': baseX = (PDF_DIMENSIONS.WIDTH / 2) - (pos.w / 2); break; default: baseX = PDF_DIMENSIONS.WIDTH - pos.w - PDF_DIMENSIONS.MARGIN; } let finalX = baseX + pos.offsetX; let finalY = baseY + pos.offsetY; finalX = Math.max(PDF_DIMENSIONS.MARGIN, Math.min(finalX, PDF_DIMENSIONS.WIDTH - pos.w - PDF_DIMENSIONS.MARGIN)); finalY = Math.max(PDF_DIMENSIONS.MARGIN, Math.min(finalY, PDF_DIMENSIONS.HEIGHT - pos.h - PDF_DIMENSIONS.MARGIN)); return { x: finalX, y: finalY, w: pos.w, h: pos.h }; }
    async function addFirmaToPdf(pdf, docType, finalFileName, proyecto) { const firmaPath = (configCache && configCache.firmaPath) ? configCache.firmaPath : 'https://placehold.co/150x60?text=Firma'; try { const response = await fetch(firmaPath); if (!response.ok) throw new Error('.'); const firmaImg = await response.blob(); const reader = new FileReader(); reader.readAsDataURL(firmaImg); reader.onloadend = function() { try { const base64data = reader.result; const pos = configCache && configCache.firmaPos ? getFinalCoordinates(configCache.firmaPos[docType]) : {x: 10, y: 250, w: 50, h: 20}; pdf.addImage(base64data, 'PNG', pos.x, pos.y, pos.w, pos.h); } catch (e) { } finally { pdf.save(finalFileName); } } } catch(e) { pdf.save(finalFileName); } }
    
    async function generarCotizacionPDF(proyectoIdOrObject) { 
        try { 
            const proyecto = typeof proyectoIdOrObject === 'string' ? await fetchAPI(`/api/proyectos/${proyectoIdOrObject}`) : proyectoIdOrObject; 
            const { jsPDF } = window.jspdf; const pdf = new jsPDF(); 
            pdf.setFillColor(0, 0, 0); pdf.rect(14, 15, 40, 15, 'F');
            if (logoBase64) { pdf.addImage(logoBase64, 'PNG', 14, 15, 40, 15); } 
            pdf.setFontSize(9); pdf.text("FiaRecords Studio", 200, 20, { align: 'right' }); 
            pdf.setFontSize(11); pdf.text(`Cliente: ${proyecto.artista ? proyecto.artista.nombre : 'Público General'}`, 14, 50); 
            const body = proyecto.items.map(item => [`${item.unidades}x ${item.nombre}`, `$${(item.precioUnitario * item.unidades).toFixed(2)}`]); 
            if (proyecto.descuento && proyecto.descuento > 0) { body.push(['Descuento', `-$${proyecto.descuento.toFixed(2)}`]); }
            pdf.autoTable({ startY: 70, head: [['Servicio', 'Subtotal']], body: body }); 
            let finalY = pdf.lastAutoTable.finalY + 10; pdf.text(`Total: $${proyecto.total.toFixed(2)} MXN`, 200, finalY, { align: 'right' }); 
            const fileName = `Cotizacion.pdf`; await addFirmaToPdf(pdf, 'cotizacion', fileName, proyecto); 
        } catch (error) { showToast("Error PDF", 'error'); } 
    }
    
    async function generarReciboPDF(proyecto, pagoEspecifico) { 
      try { 
        const { jsPDF } = window.jspdf; const pdf = new jsPDF(); const pago = pagoEspecifico || (proyecto.pagos && proyecto.pagos.length > 0 ? proyecto.pagos[proyecto.pagos.length - 1] : null); 
        if (!pago) return showToast('Sin pagos registrados.', 'error');
        const saldoRestante = proyecto.total - proyecto.montoPagado; 
        pdf.setFillColor(0, 0, 0); pdf.rect(14, 15, 40, 15, 'F');
        if (logoBase64) { pdf.addImage(logoBase64, 'PNG', 14, 15, 40, 15); } 
        pdf.setFontSize(16); pdf.setFont(undefined, 'bold').text(`RECIBO DE PAGO`, 105, 45, { align: 'center' }); 
        pdf.setFontSize(11); pdf.setFont(undefined, 'normal'); pdf.text(`Cliente: ${proyecto.artista ? proyecto.artista.nombre : 'General'}`, 14, 60); 
        pdf.autoTable({ startY: 70, theme: 'plain', body: [['Total Proyecto:', `$${proyecto.total.toFixed(2)}`], ['Monto Recibo:', `$${pago.monto.toFixed(2)}`], ['Restante Total:', `$${saldoRestante.toFixed(2)}`]] }); 
        const fileName = `Recibo.pdf`; await addFirmaToPdf(pdf, 'recibo', fileName, proyecto); 
      } catch (error) { showToast('Error recibo.', 'error'); }
    }
    
    async function generarContratoPDF(proyectoIdOrObject) { 
      try { 
        const proyecto = typeof proyectoIdOrObject === 'string' ? await fetchAPI(`/api/proyectos/${proyectoIdOrObject}`) : proyectoIdOrObject; const { jsPDF } = window.jspdf; const pdf = new jsPDF(); const c = proyecto.detallesContrato || {}; 
        pdf.setFillColor(0, 0, 0); pdf.rect(14, 15, 40, 15, 'F');
        if (logoBase64) { pdf.addImage(logoBase64, 'PNG', 14, 15, 40, 15); } 
        pdf.setFontSize(18).setFont(undefined, 'bold').text('CONTRATO DE SERVICIOS', 105, 40, { align: 'center' }); 
        pdf.setFontSize(10).setFont(undefined, 'normal'); pdf.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 55); 
        pdf.text(`Cliente: ${proyecto.artista.nombre}`, 14, 65); 
        const terminos = `Servicios para el álbum "${c.nombreAlbum || 'Sencillo'}". Pago total: $${proyecto.total}. Anticipo: $${c.pagoInicial || 0}.`; 
        pdf.text(terminos, 14, 80, { maxWidth: 180 }); 
        const fileName = `Contrato.pdf`; await addFirmaToPdf(pdf, 'contrato', fileName, proyecto); 
      } catch (e) { showToast("Error PDF", 'error'); }
    }

    // --- VISTA ARTISTA ---
    async function irAVistaArtista(artistaId, artistaNombre, nombreArtistico) { if (!artistaId) { const artistas = await fetchAPI('/api/artistas'); const artista = artistas.find(a => a.nombre === artistaNombre); if (artista) artistaId = artista._id; else return; } mostrarVistaArtista(artistaId, artistaNombre, nombreArtistico); }
    async function mostrarVistaArtista(artistaId, nombre, nombreArtistico, isClientView = false) {
        document.getElementById('vista-artista-nombre').textContent = `${escapeHTML(nombre)}`; 
        const contenido = document.getElementById('vista-artista-contenido'); 
        contenido.innerHTML = '<p>Cargando...</p>'; 
        try { 
            const [proyectos, artistaInfo] = await Promise.all([
                fetchAPI(`/api/proyectos/por-artista/${artistaId}`),
                fetchAPI(`/api/artistas/${artistaId}`)
            ]);
            let html = `<div class="card" style="margin-bottom: 2rem;">
                            <p><strong>Nombre:</strong> ${escapeHTML(artistaInfo.nombre)}</p>
                            <p><strong>Artístico:</strong> ${escapeHTML(artistaInfo.nombreArtistico || 'N/A')}</p>
                            <p><strong>Tel:</strong> ${escapeHTML(artistaInfo.telefono || 'N/A')} | <strong>Email:</strong> ${escapeHTML(artistaInfo.correo || 'N/A')}</p>
                            ${!isClientView ? `<button class="btn-primary" onclick="app.nuevoProyectoParaArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}')">➕ Nuevo Proyecto</button>` : ''}
                        </div><h3>Proyectos</h3>`;
            if(proyectos.length) { 
                html += '<div class="table-responsive"><table style="width: 100%;"><thead><tr><th>Fecha</th><th>Proyecto</th><th>Total</th><th>Pagado</th><th>Acciones</th></tr></thead><tbody>'; 
                proyectos.forEach(p => { 
                    html += `<tr><td>${new Date(p.fecha).toLocaleDateString()}</td><td>${escapeHTML(p.nombreProyecto || 'Proyecto')}</td><td>$${p.total.toFixed(2)}</td><td>$${(p.montoPagado||0).toFixed(2)}</td><td class="table-actions">`;
                    if (!isClientView) { html += `<button class="btn-secondary" onclick="app.openDeliveryModal('${p._id}', '${escapeHTML(artistaInfo.nombre)}', '${escapeHTML(p.nombreProyecto)}')">☁️</button><button class="btn-secondary" onclick="app.editarInfoProyecto('${p._id}')">✏️</button>`; }
                    html += `<button class="btn-secondary" onclick="app.generarCotizacionPDF('${p._id}')">📄</button></td></tr>`; 
                }); 
                html += '</tbody></table></div>'; 
            } else { html += '<p>Sin proyectos registrados.</p>'; } 
            contenido.innerHTML = html; 
            mostrarSeccion('vista-artista'); 
        } catch(e) { contenido.innerHTML = '<p>Error cargando historial.</p>'; console.error(e); } 
    }
    function nuevoProyectoParaArtista(idArtista, nombreArtista) { preseleccionArtistaId = idArtista; mostrarSeccion('registrar-proyecto'); showToast(`Iniciando proyecto para: ${nombreArtista}`, 'info'); }

    // --- CARGAR CONF Y DATOS INICIALES ---
    async function loadInitialConfig() { try { const config = await fetchAPI('/api/configuracion'); configCache = config; } catch (e) { configCache = {}; } }
    async function cargarConfiguracion() {
        if (!configCache) await loadInitialConfig();
        const firmaPreview = document.getElementById('firma-preview-img');
        if(firmaPreview) {
             let firmaSrc = 'https://placehold.co/150x60?text=Subir+Firma';
             if (configCache && configCache.firmaPath) { firmaSrc = configCache.firmaPath + `?t=${new Date().getTime()}`; }
             firmaPreview.src = firmaSrc;
        }
        document.getElementById('firma-input').addEventListener('change', async (event) => {
             const file = event.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('firmaFile', file);
             try { const data = await fetchAPI('/api/configuracion/upload-firma', { method: 'POST', body: formData, isFormData: true }); showToast('¡Firma subida!', 'success'); document.getElementById('firma-preview-img').src = data.filePath + `?t=${new Date().getTime()}`; if(configCache) configCache.firmaPath = data.filePath; } catch (e) { showToast(`Error`, 'error'); }
        });
    }

    // --- SIDEBAR MENU ---
    function setupMobileMenu() {
        const hamburger = document.getElementById('hamburger-menu');
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const toggleMenu = () => { sidebar.classList.toggle('sidebar-visible'); overlay.classList.toggle('overlay-visible'); };
        if(hamburger) hamburger.addEventListener('click', toggleMenu);
        if(overlay) overlay.addEventListener('click', toggleMenu);
        document.querySelectorAll('.sidebar .nav-link').forEach(link => { link.addEventListener('click', () => { if (window.innerWidth <= 768 && sidebar.classList.contains('sidebar-visible')) toggleMenu(); }); });
    }

    function renderSidebar(user) {
        const navContainer = document.getElementById('sidebar-nav-container');
        if(!navContainer) return;
        const role = user.role ? user.role.toLowerCase() : '';
        const isAdmin = role === 'admin';
        
        let html = `
          <details class="nav-group" open>
            <summary>Proyectos</summary>
            <ul>
              <li><a class="nav-link" data-seccion="dashboard"><i class="bi bi-speedometer2"></i> Dashboard</a></li>
              <li><a class="nav-link" data-seccion="agenda"><i class="bi bi-calendar-week"></i> Agenda</a></li>
              <li><a class="nav-link" data-seccion="flujo-trabajo"><i class="bi bi-kanban"></i> Flujo Trabajo</a></li>
              <li><a class="nav-link" data-seccion="cotizaciones"><i class="bi bi-file-earmark-text"></i> Cotizaciones</a></li>
              <li><a class="nav-link" data-seccion="pagos"><i class="bi bi-cash-stack"></i> Pagos</a></li>
              <li><a class="nav-link" data-seccion="historial-proyectos"><i class="bi bi-clock-history"></i> Historial</a></li>
            </ul>
          </details>
          <details class="nav-group" open>
            <summary>Gestión</summary>
            <ul>
              <li><a class="nav-link" data-seccion="gestion-artistas"><i class="bi bi-people"></i> Artistas</a></li>
              <li><a class="nav-link" data-seccion="gestion-servicios"><i class="bi bi-mic"></i> Servicios</a></li>
              ${isAdmin ? `<li><a class="nav-link" data-seccion="gestion-usuarios"><i class="bi bi-person-gear"></i> Usuarios</a></li>` : ''}
            </ul>
          </details>
          <details class="nav-group">
             <summary>Sistema</summary>
             <ul>
               <li><a class="nav-link" data-seccion="configuracion"><i class="bi bi-gear"></i> Configuración</a></li>
               <li><a class="nav-link" data-seccion="papelera-reciclaje"><i class="bi bi-trash"></i> Papelera</a></li>
             </ul>
          </details>
        `;
        navContainer.innerHTML = html;
        document.querySelectorAll('.nav-link[data-seccion]').forEach(link => {
            link.addEventListener('click', (e) => mostrarSeccion(e.currentTarget.dataset.seccion));
        });
    }

    // --- INIT EVENT LISTENERS ---
    function initAppEventListeners(payload) {
        flatpickr("#fechaProyecto", { defaultDate: "today", locale: "es" });
        window.addEventListener('hashchange', () => { const section = location.hash.replace('#', ''); if (section) mostrarSeccion(section, false); });
        
        document.getElementById('theme-switch').addEventListener('change', (e) => { 
            const theme = e.target.checked ? 'dark' : 'light';
            document.body.classList.toggle('dark-mode', theme === 'dark'); 
            localStorage.setItem('theme', theme); 
        });
        
        // Form proyectos
        document.getElementById('btnAgregarAProyecto').addEventListener('click', agregarAProyecto); 
        document.getElementById('btnGenerarCotizacion').addEventListener('click', generarCotizacion); 
        document.getElementById('btnEnviarAFlujo').addEventListener('click', enviarAFlujoDirecto);
        document.getElementById('proyectoDescuento').addEventListener('input', mostrarProyectoActual);

        document.getElementById('toggle-password').addEventListener('click', (e) => { const passwordInput = document.getElementById('password'); const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'; passwordInput.setAttribute('type', type); e.target.textContent = type === 'password' ? '👁️' : '🙈'; });
        
        setupMobileMenu();
        
        // Carga inicial tema
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.classList.toggle('dark-mode', savedTheme === 'dark');
        document.getElementById('theme-switch').checked = (savedTheme === 'dark');
    }

    (async function init() { 
        await loadPublicLogo();
        setTimeout(preloadLogoForPDF, 2000); 
        const token = localStorage.getItem('token'); 
        if (token) { 
            try { 
                const payload = JSON.parse(atob(token.split('.')[1])); 
                if (navigator.onLine && payload.exp * 1000 < Date.now()) return showLogin(); 
                await showApp(payload); 
            } catch (e) { showLogin(); } 
        } else { showLogin(); } 
    })();

    // --- SERVICE WORKER ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('sw.js').then(function(registration) {
                console.log('SW OK:', registration.scope);
            }, function(err) { console.log('SW Fail:', err); });
        });
    }

    // --- EXPOSICIÓN A WINDOW (PARA HTML ONCLICK) ---
    window.app = { 
        eliminarItem, 
        guardarDesdeModal,
        abrirModalCrear,
        abrirModalEditar,
        syncNow: OfflineManager.syncNow, 
        mostrarSeccion, 
        mostrarSeccionPagos,
        toggleAuth, 
        generarCotizacionPDF, 
        subirADrive,
        agregarAProyecto,
        quitarDeProyecto,
        generarCotizacion,
        enviarAFlujoDirecto,
        guardarProyectoManual,
        filtrarTablas: (val) => { document.querySelectorAll('section.active tbody tr').forEach(row => { row.style.display = row.textContent.toLowerCase().includes(val.toLowerCase()) ? '' : 'none'; }); },
        cargarPagosPendientes,
        cargarHistorialPagos,
        cargarPagos,
        cargarCotizaciones,
        cargarFlujoDeTrabajo,
        filtrarFlujo,
        cambiarProceso,
        cancelarCita,
        editarInfoProyecto,
        cargarHistorial,
        registrarPago,
        eliminarProyecto,
        compartirPorWhatsApp,
        reimprimirRecibo,
        compartirPagoPorWhatsApp,
        eliminarPago,
        openDeliveryModal,
        closeDeliveryModal,
        saveDeliveryLink,
        sendDeliveryByWhatsapp,
        openEventModal,
        closeEventModal,
        actualizarHorarioProyecto,
        cargarAgenda,
        irAVistaArtista,
        nuevoProyectoParaArtista,
        generarReciboPDF,
        generarContratoPDF,
        restaurarItem,
        eliminarPermanente
    };
});