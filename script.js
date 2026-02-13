document.addEventListener('DOMContentLoaded', () => {
    let isInitialized = false; 
    let proyectoActual = {}; 
    let logoBase64 = null;
    let preseleccionArtistaId = null;
    
    // Variable global para evitar errores al editar desde el Dashboard
    let historialCacheados = []; 

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

    // 1. INICIALIZAR CACHÉ
    let localCache = {
        artistas: (JSON.parse(localStorage.getItem('cache_artistas') || '[]') || []), 
        servicios: JSON.parse(localStorage.getItem('cache_servicios') || '[]'),
        proyectos: JSON.parse(localStorage.getItem('cache_proyectos') || '[]'),
        cotizaciones: [],
        historial: [],        
        pagos: JSON.parse(localStorage.getItem('cache_pagos') || '[]'),
        usuarios: []
    };
      
    let currentCalendar = null; let configCache = null; let chartInstance = null; const API_URL = '';
    const DOMElements = { loginContainer: document.getElementById('login-container'), appWrapper: document.getElementById('app-wrapper'), logoutButton: document.getElementById('logout-button'), welcomeUser: document.getElementById('welcome-user'), appLogo: document.getElementById('app-logo'), loginLogo: document.getElementById('login-logo'), customizationContainer: document.getElementById('customization-container'), logoInput: document.getElementById('logo-input'), connectionStatus: document.getElementById('connection-status'), connectionText: document.getElementById('connection-text') };
      
    const PDF_DIMENSIONS = { WIDTH: 210, HEIGHT: 297, MARGIN: 14 };

    function showToast(message, type = 'success') { 
        let bg = type === 'error' ? "linear-gradient(to right, #ff5f6d, #ffc371)" : "linear-gradient(to right, #00b09b, #96c93d)";
        if(type==='info') bg = "var(--secondary-button-bg)";
        Toastify({ text: message, duration: 3000, gravity: "top", position: "right", style: { background: bg, borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" } }).showToast(); 
    }
    function escapeHTML(str) { if (!str) return ''; return str.replace(/[&<>'"]/g, tag => ({'&': '&amp;','<': '&lt;','>': '&gt;',"'": '&#39;','"': '&quot;'}[tag])); }
    function showLoader() { document.getElementById('loader-overlay').style.display = 'flex'; }
    function hideLoader() { document.getElementById('loader-overlay').style.display = 'none'; }
    async function imageExists(url) { try { const response = await fetch(url, { method: 'HEAD' }); return response.ok; } catch (e) { return false; } }

    async function preloadLogoForPDF() {
        const imgUrl = DOMElements.appLogo.src;
        try {
            const response = await fetch(imgUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => { logoBase64 = reader.result; };
            reader.readAsDataURL(blob);
        } catch(e) { console.warn("No se pudo precargar logo para PDF offline"); }
    }

    // 2. OFFLINE MANAGER
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

    window.app = { syncNow: OfflineManager.syncNow };

    // 3. FETCH API MEJORADO
    async function fetchAPI(url, options = {}) { 
      if (!url.startsWith('/') && !url.startsWith('http')) {
          url = '/' + url;
      }

      const token = localStorage.getItem('token'); 
      if (!token && !url.includes('/auth/')) { showLogin(); throw new Error('No autenticado'); } 
      const headers = { 'Authorization': `Bearer ${token}` }; 
      if (!options.isFormData) { headers['Content-Type'] = 'application/json'; } 
      
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

      if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method)) {
          const body = options.body ? JSON.parse(options.body) : {};
          const tempId = body._id || `temp_${Date.now()}`;
           
          if (url.includes('/proyectos')) {
              if (options.method === 'POST') {
                  const nuevoProyecto = { ...body, _id: tempId, createdAt: new Date().toISOString(), montoPagado: 0, pagos: [], deleted: false };
                  if(nuevoProyecto.artista && typeof nuevoProyecto.artista === 'string') {
                      const art = localCache.artistas.find(a => a._id === nuevoProyecto.artista);
                      if(art) nuevoProyecto.artista = art;
                  }
                  localCache.proyectos.push(nuevoProyecto);
              } else if (options.method === 'PUT') {
                  let idTarget = url.split('/').pop(); 
                  if(['estatus', 'proceso', 'nombre', 'enlace-entrega', 'fecha', 'total'].includes(idTarget)) { const parts = url.split('/'); idTarget = parts[parts.length - 2]; }
                  const idx = localCache.proyectos.findIndex(p => p._id === idTarget);
                  if(idx !== -1) {
                      localCache.proyectos[idx] = { ...localCache.proyectos[idx], ...body };
                      if(url.includes('/restaurar')) localCache.proyectos[idx].deleted = false;
                      if(url.includes('/proceso')) localCache.proyectos[idx].proceso = body.proceso;
                      if(url.includes('/estatus')) localCache.proyectos[idx].estatus = body.estatus;
                      if(url.includes('/total')) localCache.proyectos[idx].total = body.total;
                      if(url.includes('enlace-entrega')) localCache.proyectos[idx].enlaceEntrega = body.enlace;
                  }
              } else if (options.method === 'DELETE') {
                  let idTarget = url.split('/').pop();
                  if(url.includes('/permanente')) {
                      idTarget = url.split('/')[3];
                      localCache.proyectos = localCache.proyectos.filter(p => p._id !== idTarget);
                  } else {
                      const idx = localCache.proyectos.findIndex(p => p._id === idTarget);
                      if(idx !== -1) localCache.proyectos[idx].deleted = true;
                  }
              }
              localStorage.setItem('cache_proyectos', JSON.stringify(localCache.proyectos));
          }
           
          if (url.includes('/pagos') && options.method === 'POST') {
             const idProy = url.split('/')[3]; 
             const proy = localCache.proyectos.find(p => p._id === idProy);
             if(proy) {
                 const nuevoPago = { _id: `temp_pago_${Date.now()}`, monto: body.monto, metodo: body.metodo, fecha: new Date().toISOString(), proyectoId: idProy, artista: proy.artista ? proy.artista.nombre : 'General' };
                 proy.pagos = proy.pagos || [];
                 proy.pagos.push(nuevoPago);
                 proy.montoPagado = (proy.montoPagado || 0) + body.monto;
                 localCache.pagos.push(nuevoPago);
                 localStorage.setItem('cache_pagos', JSON.stringify(localCache.pagos));
                 localStorage.setItem('cache_proyectos', JSON.stringify(localCache.proyectos));
             }
          }

          if (!navigator.onLine) {
              OfflineManager.addToQueue(`${API_URL}${url}`, { ...options, headers }, tempId);
              if (url.includes('/proyectos') && options.method === 'POST') { return { ...body, _id: tempId, offline: true }; }
              return { ok: true, offline: true };
          }
      }

      showLoader();
      try {
          const res = await fetch(`${API_URL}${url}`, { ...options, headers }); 
          
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") === -1) {
              const text = await res.text();
              console.error("Respuesta no JSON:", text);
              throw new Error("Error de conexión con el servidor (Ruta inválida o error 500).");
          }

          if (res.status === 401) { showLogin(); throw new Error('Sesión expirada.'); } 
          if (res.status === 204 || (options.method === 'DELETE' && res.ok)) return {ok: true}; 
          
          const data = await res.json(); 
          if (!res.ok) throw new Error(data.error || 'Error del servidor'); 
           
          if (!options.method || options.method === 'GET') {
              if(url.includes('/artistas')) { 
                  localCache.artistas = Array.isArray(data) ? data : []; 
                  localStorage.setItem('cache_artistas', JSON.stringify(localCache.artistas)); 
              }
              if(url.includes('/servicios')) { localCache.servicios = data; localStorage.setItem('cache_servicios', JSON.stringify(data)); }
              if(url.includes('/proyectos') && !url.includes('agenda')) { 
                  if(Array.isArray(data) && url === '/api/proyectos') { localCache.proyectos = data; localStorage.setItem('cache_proyectos', JSON.stringify(data)); }
              }
              if(url.includes('/usuarios')) { localCache.usuarios = data; }
              
              if(url.includes('/pagos/todos')) { localCache.pagos = data; localStorage.setItem('cache_pagos', JSON.stringify(data)); }
          }
          return data; 
      } catch(e) {
          if (!navigator.onLine || e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('404')) {
              OfflineManager.updateIndicator(); 
              if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method)) {
                    const tempId = `temp_${Date.now()}`;
                    OfflineManager.addToQueue(`${API_URL}${url}`, { ...options, headers }, tempId);
                    return { ok: true, offline: true, _id: tempId };
              }
              if(url.includes('/artistas')) return localCache.artistas;
              if(url.includes('/servicios')) return localCache.servicios;
              if(url.includes('/proyectos')) {
                  if(url.includes('papelera')) return localCache.proyectos.filter(p => p.deleted === true);
                  return localCache.proyectos;
              }
          }
          throw e;
      } finally { hideLoader(); }
    }

    function filtrarTablas(query) {
        query = query.toLowerCase();
        document.querySelectorAll('section.active tbody tr').forEach(row => { const text = row.innerText.toLowerCase(); row.style.display = text.includes(query) ? '' : 'none'; });
        document.querySelectorAll('section.active .project-card').forEach(card => { const text = card.innerText.toLowerCase(); card.style.display = text.includes(query) ? 'block' : 'none'; });
        document.querySelectorAll('section.active ul li').forEach(li => { const text = li.innerText.toLowerCase(); li.style.display = text.includes(query) ? 'flex' : 'none'; });
    }

    async function loadPublicLogo() {
        try {
            const res = await fetch(`${API_URL}/api/configuracion/public/logo`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.filePath) {
                const logoSrc = data.filePath + `?t=${new Date().getTime()}`;
                DOMElements.loginLogo.src = logoSrc;
                DOMElements.appLogo.src = logoSrc;
                
                const favicon = document.getElementById('dynamic-favicon');
                if(favicon) favicon.href = logoSrc;
            }
        } catch (e) { console.warn("Offline: Usando logo cacheado"); }
    }

    async function loadInitialConfig() { 
        try { 
            const config = await fetchAPI('/api/configuracion'); 
            configCache = config; 
            if (config.logoPath) { DOMElements.appLogo.src = config.logoPath + `?t=${new Date().getTime()}`; } 
        } catch (e) { configCache = { firmaPos: { cotizacion: {vAlign:'bottom',hAlign:'right',w:50,h:20,offsetX:0,offsetY:0} } }; } 
    }
    function applyTheme(theme) { document.body.classList.toggle('dark-mode', theme === 'dark'); document.getElementById('theme-switch').checked = (theme === 'dark'); localStorage.setItem('theme', theme); }
      
    // --- GOOGLE DRIVE LOGIC ---
    function initializeGapiClient() {
      gapi.load('client', async () => {
        await gapi.client.init({
          apiKey: GAP_CONFIG.apiKey,
          discoveryDocs: GAP_CONFIG.discoveryDocs,
        });
        gapiInited = true;
      });
    }

    function initializeGisClient() {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GAP_CONFIG.clientId,
        scope: GAP_CONFIG.scope,
        callback: '', 
      });
      gisInited = true;
    }
      
    if(typeof gapi !== 'undefined') initializeGapiClient();
    if(typeof google !== 'undefined') initializeGisClient();

    async function findOrCreateFolder(name, parentId = null) {
        let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
        if(parentId) query += ` and '${parentId}' in parents`;
          
        const res = await gapi.client.drive.files.list({ q: query, fields: 'files(id, name)' });
        if(res.result.files.length > 0) {
            return res.result.files[0].id;
        } else {
            const fileMetadata = {
                'name': name,
                'mimeType': 'application/vnd.google-apps.folder'
            };
            if(parentId) fileMetadata.parents = [parentId];
              
            const createRes = await gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
            return createRes.result.id;
        }
    }

    async function subirADrive() {
        if (!gapiInited || !gisInited) {
           await new Promise(r => setTimeout(r, 1000));
           if (!gapiInited || !gisInited) return showToast('Las librerías de Google no han cargado. Revisa tu conexión.', 'error');
        }

        const fileInput = document.getElementById('drive-file-input');
        if (fileInput.files.length === 0) return showToast('Selecciona un archivo primero.', 'error');
        const file = fileInput.files[0];
          
        const statusDiv = document.getElementById('drive-status');
        const btnText = document.getElementById('drive-btn-text');

        tokenClient.callback = async (resp) => {
          if (resp.error) throw resp;
          
          try {
              btnText.textContent = 'Creando Carpeta...';
              const artistName = document.getElementById('delivery-artist-name').value || 'SinArtista';
              const projName = document.getElementById('delivery-project-name').value || 'SinProyecto';
              
              statusDiv.textContent = `Buscando carpeta: ${artistName}...`;
              let artistFolderId = await findOrCreateFolder(artistName);
              
              statusDiv.textContent = `Buscando carpeta: ${projName}...`;
              let projectFolderId = await findOrCreateFolder(projName, artistFolderId);

              await gapi.client.drive.permissions.create({
                  fileId: projectFolderId,
                  resource: { role: 'reader', type: 'anyone' }
              });

              const folderLinkResp = await gapi.client.drive.files.get({
                  fileId: projectFolderId,
                  fields: 'webViewLink'
              });
              const folderLink = folderLinkResp.result.webViewLink;

              btnText.textContent = 'Subiendo... (Espere)';
              const metadata = {
                  name: file.name,
                  parents: [projectFolderId]
              };
              
              const accessToken = gapi.client.getToken().access_token;
              const form = new FormData();
              form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
              form.append('file', file);

              const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
              const uploadResp = await fetch(uploadUrl, {
                  method: 'POST',
                  headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                  body: form
              });
              
              if (!uploadResp.ok) throw new Error('Fallo en la subida');
              
              document.getElementById('delivery-link-input').value = folderLink;
              statusDiv.textContent = `✅ Subido en ${artistName}/${projName}`;
              statusDiv.style.color = 'var(--success-color)';
              btnText.textContent = '📤 Subir Otro';

              const projectId = document.getElementById('delivery-project-id').value;
              await fetchAPI(`/api/proyectos/${projectId}/enlace-entrega`, { 
                  method: 'PUT', 
                  body: JSON.stringify({ enlace: folderLink }) 
              });
              
              const cachedProj = localCache.proyectos.find(p => p._id === projectId);
              if(cachedProj) cachedProj.enlaceEntrega = folderLink;

              showToast('¡Archivo subido! Link guardado.', 'success');

          } catch (err) {
              console.error(err);
              statusDiv.textContent = `Error: ${err.message || 'Desconocido'}`;
              statusDiv.style.color = 'var(--danger-color)';
              btnText.textContent = '📤 Reintentar';
          }
        };

        if (gapi.client.getToken() === null) {
          tokenClient.requestAccessToken({prompt: ''}); 
        } else {
          tokenClient.requestAccessToken({prompt: ''});
        }
    }

    (async function init() { 
      await loadPublicLogo();
      setTimeout(preloadLogoForPDF, 2000); 
      applyTheme(localStorage.getItem('theme') || 'light'); 

      const path = window.location.pathname;
      if (path.startsWith('/reset-password/')) {
          const segments = path.split('/').filter(Boolean);
          const token = segments[segments.length - 1]; 
          
          if (token && token !== 'reset-password') {
              showResetPasswordView(token);
              document.body.style.opacity = '1';
              document.body.style.visibility = 'visible';
              return; 
          }
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

    async function showApp(payload) { 
      document.body.classList.remove('auth-visible');

      if (!configCache) await loadInitialConfig();
      DOMElements.welcomeUser.textContent = `Hola, ${escapeHTML(payload.username)}`; 

      const role = payload.role ? payload.role.toLowerCase() : '';

      // --- MODO CLIENTE ---
      if (role === 'cliente') {
          document.body.classList.add('client-mode');
          
          const headerActions = document.querySelector('.header-actions');
          const existingBtn = document.getElementById('btn-client-logout');
          if(existingBtn) existingBtn.remove();
          
          const logoutBtn = document.createElement('button');
          logoutBtn.id = 'btn-client-logout';
          logoutBtn.className = 'btn-eliminar';
          logoutBtn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"></path></svg> Salir';
          logoutBtn.style.display = 'flex';
          logoutBtn.style.alignItems = 'center';
          logoutBtn.style.gap = '0.5rem';
          logoutBtn.style.padding = '0.5rem 1rem';
          logoutBtn.onclick = () => { localStorage.removeItem('token'); location.reload(); };
          
          headerActions.appendChild(logoutBtn);
          
          const artistas = await fetchAPI('/api/artistas');
          const myArtist = artistas.find(a => 
              a.nombre.toLowerCase().trim() === payload.username.toLowerCase().trim() ||
              (a.nombreArtistico && a.nombreArtistico.toLowerCase().trim() === payload.username.toLowerCase().trim())
          );

          DOMElements.loginContainer.style.display = 'none'; 
          DOMElements.appWrapper.style.display = window.innerWidth <= 768 ? 'block' : 'flex'; 
          document.body.style.opacity = '1';
          document.body.style.visibility = 'visible';

          if (myArtist) {
              mostrarVistaArtista(myArtist._id, myArtist.nombre, myArtist.nombreArtistico, true);
          } else {
              document.querySelector('main').innerHTML = `
                  <div class="card" style="border-left: 4px solid var(--warning-color); text-align: center;">
                      <h2>⚠️ Atención</h2>
                      <p>No encontramos un perfil de Artista vinculado a tu usuario "<strong>${payload.username}</strong>".</p>
                      <p>Por favor, contacta al estudio para que corrijan el nombre de tu Artista.</p>
                      <button onclick="localStorage.removeItem('token'); location.reload();" class="btn-secondary" style="margin-top:1rem;">Salir</button>
                  </div>`;
          }
          return; 
      }
      
      // --- MODO STAFF NORMAL ---
      renderSidebar(payload);

      if (!isInitialized) { 
          initAppEventListeners(payload); 
          isInitialized = true; 
      } 

      DOMElements.loginContainer.style.display = 'none'; 
      DOMElements.appWrapper.style.display = window.innerWidth <= 768 ? 'block' : 'flex'; 
      
      const hashSection = location.hash.replace('#', '');
      mostrarSeccion(hashSection || 'dashboard', false);
      
      OfflineManager.updateIndicator();
      window.addEventListener('online', () => { OfflineManager.updateIndicator(); });
      window.addEventListener('offline', () => { OfflineManager.updateIndicator(); });

      document.body.style.opacity = '1';
      document.body.style.visibility = 'visible'; 
    }

    function showLogin() { 
        document.body.classList.add('auth-visible');
        
        localStorage.removeItem('token'); 
        DOMElements.loginContainer.style.display = 'block'; 
        DOMElements.appWrapper.style.display = 'none'; 
        document.body.style.opacity = '1'; 
        document.body.style.visibility = 'visible'; 
    }
    
    function toggleAuth(view) {
        const login = document.getElementById('login-view');
        const register = document.getElementById('register-view');
        const recover = document.getElementById('recover-view');
        const reset = document.getElementById('reset-password-view');
        
        login.style.display = 'none';
        register.style.display = 'none';
        recover.style.display = 'none';
        reset.style.display = 'none';
        
        if(view === 'register') register.style.display = 'block';
        else if(view === 'recover') recover.style.display = 'block';
        else if(view === 'reset') reset.style.display = 'block';
        else login.style.display = 'block';
        
        document.getElementById('login-error').textContent = '';
    }

    function showResetPasswordView(token) {
        document.body.classList.add('auth-visible');
        DOMElements.appWrapper.style.display = 'none';
        DOMElements.loginContainer.style.display = 'block';
        
        document.getElementById('reset-token').value = token;
        toggleAuth('reset');
    }

    async function resetPassword(e) {
        e.preventDefault();
        const token = document.getElementById('reset-token').value;
        const password = document.getElementById('new-password').value;

        if (!password) return showToast('Ingresa una contraseña', 'error');

        showLoader();
        try {
            const res = await fetch(`${API_URL}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword: password })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al restablecer');

            showToast('¡Contraseña actualizada!', 'success');
            window.history.replaceState({}, document.title, "/");
            toggleAuth('login');
        } catch(err) {
            document.getElementById('login-error').textContent = err.message;
        } finally { hideLoader(); }
    }

    async function registerUser(e) {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const nombreArtistico = document.getElementById('reg-artistname').value;
        
        showLoader();
        try {
            const res = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, role: 'Cliente', nombre: nombreArtistico, createArtist: true }) 
            });
            
            const data = await res.json();
            if(!res.ok) throw new Error(data.error || 'Error al registrarse');
            
            showToast('¡Cuenta creada! Inicia sesión.', 'success');
            toggleAuth('login');
            document.getElementById('username').value = username;
        } catch(err) {
            document.getElementById('login-error').textContent = err.message;
        } finally { hideLoader(); }
    }

    async function recoverPassword(e) {
        e.preventDefault();
        const email = document.getElementById('rec-email').value;
        
        showLoader();
        try {
            const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            
            const data = await res.json();
            if(!res.ok) throw new Error(data.error || 'Error al solicitar recuperación');
            
            showToast('Correo de recuperación enviado.', 'success');
            toggleAuth('login');
        } catch(err) {
            document.getElementById('login-error').textContent = err.message;
        } finally { hideLoader(); }
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => { 
      e.preventDefault(); 
      if (!navigator.onLine) { return showToast('Se requiere internet.', 'error'); }
      showLoader();
      try {
          const u = document.getElementById('username').value;
          const p = document.getElementById('password').value;
          
          const res = await fetch(`${API_URL}/api/auth/login`, { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ username: u, password: p }) 
          }); 
          
          const data = await res.json(); 
          if (!res.ok) throw new Error(data.error); 
          localStorage.setItem('token', data.token); 
          await showApp(JSON.parse(atob(data.token.split('.')[1]))); 
      } catch (error) { document.getElementById('login-error').textContent = error.message; } finally { hideLoader(); }
    });
      
    DOMElements.logoutButton.addEventListener('click', showLogin);
      
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

          const loadDataActions = { 'dashboard': cargarDashboard, 'agenda': cargarAgenda, 'cotizaciones': cargarCotizaciones, 'flujo-trabajo': cargarFlujoDeTrabajo, 'pagos': cargarPagos, 'registrar-proyecto': cargarOpcionesParaProyecto, 'registro-manual': cargarOpcionesParaProyectoManual, 'historial-proyectos': cargarHistorial, 'gestion-servicios': () => renderList('servicios'), 'gestion-artistas': () => renderList('artistas', true), 'gestion-usuarios': () => renderList('usuarios'), 'papelera-reciclaje': cargarPapelera, 'configuracion': cargarConfiguracion, }; 
          await loadDataActions[id]?.(); 
      } 
    }

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
                return `<li class="list-item" ${clickHandler} style="${makeClickable ? 'cursor:pointer;' : ''}"><span>${escapeHTML(displayName)}</span><div class="list-item-actions"><button class="btn-secondary" onclick="event.stopPropagation(); app.editarItem('${item._id}', '${endpoint}')">✏️</button><button class="btn-eliminar" onclick="event.stopPropagation(); app.eliminarItem('${item._id}', '${endpoint}')">🗑️</button></div></li>`; 
            }).join('') : `<li>No hay elementos.</li>`; 
        } catch (e) { document.getElementById(listId).innerHTML = `<li>Error al cargar.</li>`; } 
    }
      
    async function cargarPapelera() { 
      const endpoints = ['servicios', 'artistas', 'usuarios', 'proyectos']; 
      for (const endpoint of endpoints) { 
          const listId = `papelera${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`; 
          try { 
              const data = await fetchAPI(`/api/${endpoint}/papelera/all`); 
              
              document.getElementById(listId).innerHTML = data.length ? data.map(item => {
                  let displayName = item.nombre || item.username || item.nombreProyecto || 'Item';
                  return `<li class="list-item">
                    <span>${escapeHTML(displayName)}</span>
                    <div class="list-item-actions">
                        <button class="btn-restaurar" onclick="app.restaurarItem('${item._id}', '${endpoint}')">↩️</button>
                        <button class="btn-eliminar" onclick="app.eliminarPermanente('${item._id}', '${endpoint}')">❌</button>
                    </div>
                  </li>`;
              }).join('') : `<li>Vacía.</li>`; 
          } catch (e) { document.getElementById(listId).innerHTML = `<li>Error.</li>`; } 
      } 
    }
      
    function limpiarForm(formId) { const form = document.getElementById(formId); form.reset(); const idInput = form.querySelector('input[type="hidden"]'); if(idInput) idInput.value = ''; }
    
    // --- FUNCIÓN GUARDAR DESDE MODAL ---
    async function guardarDesdeModal(type) {
        let id = '';
        let body = {};

        if (type === 'servicios') {
            id = document.getElementById('modalIdServicio').value;
            body = {
                nombre: document.getElementById('modalNombreServicio').value,
                precio: parseFloat(document.getElementById('modalPrecioServicio').value)
            };
        } else if (type === 'artistas') {
            id = document.getElementById('modalIdArtista').value;
            body = {
                nombre: document.getElementById('modalNombreArtista').value,
                nombreArtistico: document.getElementById('modalNombreArtistico').value,
                telefono: document.getElementById('modalTelefonoArtista').value,
                correo: document.getElementById('modalCorreoArtista').value
            };
        } else if (type === 'usuarios') {
            id = document.getElementById('modalIdUsuario').value;
            const userVal = document.getElementById('modalUsername').value;
            const emailVal = document.getElementById('modalEmail').value;
            const roleVal = document.getElementById('modalRole').value;
            const passVal = document.getElementById('modalPassword').value;

            const checkboxes = document.querySelectorAll('input[name="user_permisos"]:checked');
            const permisos = Array.from(checkboxes).map(c => c.value);
            
            body = {
                username: userVal,
                email: emailVal,
                role: roleVal,
                permisos: permisos
            };
            
            if (!id && !passVal) { return showToast('Contraseña obligatoria para usuarios nuevos.', 'error'); }
            if (passVal) body.password = passVal;
        }

        const method = id ? 'PUT' : 'POST';
        const url = `/api/${type}/${id || ''}`;
        
        try {
            const res = await fetchAPI(url, { method, body: JSON.stringify(body) });
            showToast(res.offline ? 'Guardado local.' : 'Guardado con éxito.', res.offline ? 'warning' : 'success');
            
            const modalEl = document.getElementById(`modal${type.charAt(0).toUpperCase() + type.slice(1)}`);
            const modal = bootstrap.Modal.getInstance(modalEl);
            if(modal) modal.hide();
            
            mostrarSeccion(`gestion-${type}`);
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        }
    }
      
    async function eliminarItem(id, endpoint) { if (!confirm(`¿Mover a la papelera?`)) return; try { await fetchAPI(`/api/${endpoint}/${id}`, { method: 'DELETE' }); showToast('Movido a papelera.', 'info'); mostrarSeccion(`gestion-${endpoint}`); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
      
    async function editarItem(id, endpoint) { 
        try { 
            let item; 
            if (endpoint === 'artistas') item = localCache.artistas.find(i => i._id === id); 
            else if (endpoint === 'servicios') item = localCache.servicios.find(i => i._id === id); 
            else if (endpoint === 'usuarios') item = localCache.usuarios.find(i => i._id === id); 
            
            if(!item) item = await fetchAPI(`/api/${endpoint}/${id}`); 
            
            // Abrir modal con Bootstrap
            const modalId = `modal${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`;
            const modalEl = document.getElementById(modalId);
            const modal = new bootstrap.Modal(modalEl);
            
            if (endpoint === 'servicios') { 
                document.getElementById('modalIdServicio').value = item._id; 
                document.getElementById('modalNombreServicio').value = item.nombre; 
                document.getElementById('modalPrecioServicio').value = item.precio; 
            } 
            else if (endpoint === 'artistas') { 
                document.getElementById('modalIdArtista').value = item._id; 
                document.getElementById('modalNombreArtista').value = item.nombre; 
                document.getElementById('modalNombreArtistico').value = item.nombreArtistico || ''; 
                document.getElementById('modalTelefonoArtista').value = item.telefono || ''; 
                document.getElementById('modalCorreoArtista').value = item.correo || ''; 
            } 
            else if (endpoint === 'usuarios') { 
                document.getElementById('modalIdUsuario').value = item._id; 
                document.getElementById('modalUsername').value = item.username; 
                document.getElementById('modalEmail').value = item.email || ''; 
                document.getElementById('modalRole').value = item.role; 
                document.getElementById('modalPassword').value = ''; 
            } 
            
            modal.show();
        } catch (error) { showToast(`Error: ${error.message}`, 'error'); } 
    }

    window.app.abrirModalCrear = function(endpoint) {
        const modalId = `modal${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`;
        const modalEl = document.getElementById(modalId);
        const formId = `formModal${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`;
        
        limpiarForm(formId);
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    };

    // --- NUEVA FUNCIÓN PARA MOSTRAR DATOS BANCARIOS ---
    function mostrarDatosBancariosPublicos() {
        if(!configCache || !configCache.datosBancarios) {
            return showToast('No hay datos bancarios registrados aún.', 'info');
        }
        
        const db = configCache.datosBancarios;
        Swal.fire({
            title: 'Datos Bancarios',
            html: `
                <div style="text-align:left;">
                    <p><strong>Banco:</strong> ${escapeHTML(db.banco)}</p>
                    <p><strong>Titular:</strong> ${escapeHTML(db.titular)}</p>
                    <p><strong>Tarjeta:</strong> ${escapeHTML(db.tarjeta)}</p>
                    <p><strong>CLABE:</strong> ${escapeHTML(db.clabe)}</p>
                </div>
            `,
            confirmButtonText: 'Copiar',
            showCancelButton: true,
            cancelButtonText: 'Cerrar'
        }).then((result) => {
            if (result.isConfirmed) {
                const texto = `Banco: ${db.banco}\nTitular: ${db.titular}\nTarjeta: ${db.tarjeta}\nCLABE: ${db.clabe}`;
                navigator.clipboard.writeText(texto).then(() => {
                    showToast('Copiado al portapapeles', 'success');
                });
            }
        });
    }

    async function restaurarItem(id, endpoint) { try { await fetchAPI(`/api/${endpoint}/${id}/restaurar`, { method: 'PUT' }); showToast('Restaurado.', 'success'); cargarPapelera(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
    async function eliminarPermanente(id, endpoint) { if (!confirm('¡Irreversible!')) return; try { await fetchAPI(`/api/${endpoint}/${id}/permanente`, { method: 'DELETE' }); showToast('Eliminado.', 'success'); cargarPapelera(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
    async function vaciarPapelera(endpoint) { if (!confirm(`¿Vaciar ${endpoint}?`)) return; try { await fetchAPI(`/api/${endpoint}/papelera/vaciar`, { method: 'DELETE' }); showToast(`Vaciada.`, 'success'); cargarPapelera(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
      
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
          chartInstance = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Ingresos ($)', data: dataValues, borderColor: '#6366f1', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false } });
      } catch(e) { console.error("Error dashboard:", e); } 
    }

    async function cargarCotizaciones() { const tablaBody = document.getElementById('tablaCotizacionesBody'); tablaBody.innerHTML = `<tr><td colspan="4">Cargando...</td></tr>`; try { const cotizaciones = await fetchAPI('/api/proyectos/cotizaciones'); tablaBody.innerHTML = cotizaciones.length ? cotizaciones.map(c => { const esArtistaRegistrado = c.artista && c.artista._id; const nombreArtista = esArtistaRegistrado ? c.artista.nombre : 'Público General'; const claseTd = esArtistaRegistrado ? 'clickable-artist' : ''; const eventoDblClick = esArtistaRegistrado ? `ondblclick="app.irAVistaArtista('${c.artista._id}', '${escapeHTML(c.artista.nombre)}', '')"` : ''; return `<tr><td class="${claseTd}" ${eventoDblClick}>${escapeHTML(nombreArtista)}</td><td>$${c.total.toFixed(2)}</td><td>${new Date(c.createdAt).toLocaleDateString()}</td><td class="table-actions"><button class="btn-aprobar" onclick="app.aprobarCotizacion('${c._id}')">✓</button><button class="btn-secondary" title="PDF" onclick="app.generarCotizacionPDF('${c._id}')">📄</button><button class="btn-secondary" title="WhatsApp" onclick="app.compartirPorWhatsApp('${c._id}')">💬</button><button class="btn-eliminar" onclick="app.eliminarProyecto('${c._id}', true)">🗑️</button></td></tr>`; }).join('') : `<tr><td colspan="4">Sin cotizaciones.</td></tr>`; } catch(e) { tablaBody.innerHTML = `<tr><td colspan="4">Error offline.</td></tr>`; } }
      
    const procesos = ['Solicitud', 'Agendado', 'Grabacion', 'Edicion', 'Mezcla', 'Mastering', 'Completo'];
      
    async function cargarFlujoDeTrabajo(filtroActivo = 'Todos') { const board = document.getElementById('kanbanBoard'); const filtros = document.getElementById('filtrosFlujo'); if(!filtros.innerHTML) { filtros.innerHTML = `<button class="btn-secondary active" onclick="app.filtrarFlujo('Todos')">Todos</button>` + procesos.filter(p=>p!=='Completo').map(p => `<button class="btn-secondary" onclick="app.filtrarFlujo('${p}')">${p}</button>`).join(''); } board.innerHTML = procesos.filter(p => p !== 'Completo').map(p => `<div class="kanban-column" data-columna="${p}"><h3>${p}</h3><div id="columna-${p}"></div></div>`).join(''); try { localCache.proyectos = await fetchAPI('/api/proyectos'); filtrarFlujo(filtroActivo); } catch(e) { console.error("Error flujo:", e); } }
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
    async function cargarHistorial() { const tablaBody = document.getElementById('tablaHistorialBody'); tablaBody.innerHTML = `<tr><td colspan="5">Cargando...</td></tr>`; try { historialCacheados = await fetchAPI('/api/proyectos/completos'); tablaBody.innerHTML = historialCacheados.length ? historialCacheados.map(p => { const artistaNombre = p.artista ? p.artista.nombre : 'Público General'; return `<tr><td class="${p.artista?'clickable-artist':''}" ${p.artista?`ondblclick="app.irAVistaArtista('${p.artista._id}', '${escapeHTML(artistaNombre)}', '${escapeHTML(p.nombreProyecto || 'Proyecto')}')">☁️</button><button class="btn-secondary" onclick="app.openDocumentsModal('${p._id}')">Docs</button><button class="btn-secondary" onclick="app.registrarPago('${p._id}', true)">$</button><button class="btn-eliminar" onclick="app.eliminarProyecto('${p._id}')">🗑️</button></td></tr>`; }).join('') : `<tr><td colspan="5">Sin historial.</td></tr>`; } catch(error) { tablaBody.innerHTML = `<tr><td colspan="5">Error.</td></tr>`; } }
      
    async function eliminarProyecto(id, desdeCotizaciones = false) { 
        if (!confirm('¿Mover a papelera? Desaparecerá del flujo.')) return; 
        try { 
            await fetchAPI(`/api/proyectos/${id}`, { method: 'DELETE' }); 
            showToast('Movido a papelera.', 'info'); 
            if (desdeCotizaciones) { 
                cargarCotizaciones(); 
            } else if (document.getElementById('historial-proyectos').classList.contains('active')) {
                cargarHistorial();
            } else if (document.getElementById('vista-artista').classList.contains('active')) {
                  const nombreActual = document.getElementById('vista-artista-nombre').textContent;
                  if (!Array.isArray(localCache.artistas)) {
                      localCache.artistas = await fetchAPI('/api/artistas');
                  }
                  const art = localCache.artistas.find(a => a.nombre === nombreActual);
                  if(art) {
                      mostrarVistaArtista(art._id, nombreActual, '');
                  } else {
                      mostrarSeccion('gestion-artistas');
                  }
            } else {
                const filtroActual = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos';
                filtrarFlujo(filtroActual);
            }
        } catch (error) { showToast(`Error: ${error.message}`, 'error'); } 
    }
      
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
    const cargarOpcionesParaProyecto = () => { cargarOpcionesParaSelect('/api/artistas', 'proyectoArtista', '_id', item => item.nombreArtistico || item.nombre, true); cargarOpcionesParaSelect('/api/servicios', 'proyectoServicio', '_id', item => `${item.nombre} - $${item.precio.toFixed(2)}`); }
    const cargarOpcionesParaProyectoManual = () => { cargarOpcionesParaSelect('/api/artistas', 'manualProyectoArtista', '_id', item => item.nombreArtistico || item.nombre, false); flatpickr("#manualFechaProyecto", { defaultDate: "today", locale: "es" }); };
    function agregarAProyecto() { const select = document.getElementById('proyectoServicio'); if (!select.value) return; const id = `item-${select.value}-${Date.now()}`; proyectoActual[id] = { id, servicioId: select.value, nombre: select.options[select.selectedIndex].text.split(' - ')[0], unidades: parseInt(document.getElementById('proyectoUnidades').value) || 1, precioUnitario: parseFloat(select.options[select.selectedIndex].dataset.precio) }; mostrarProyectoActual(); }
    function quitarDeProyecto(id) { delete proyectoActual[id]; mostrarProyectoActual(); }
    function mostrarProyectoActual() { const lista = document.getElementById('listaProyectoActual'); let total = 0; lista.innerHTML = Object.values(proyectoActual).map(item => { const subtotal = item.precioUnitario * item.unidades; total += subtotal; return `<li class="list-item"><span>${item.unidades}x ${escapeHTML(item.nombre)}</span><span>$${subtotal.toFixed(2)} <button class="btn-eliminar" style="padding:0.2rem 0.5rem;height:auto;" onclick="app.quitarDeProyecto('${item.id}')">X</button></span></li>`; }).join(''); document.getElementById('totalAPagar').textContent = `$${total.toFixed(2)}`; }
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
    async function guardarProyectoManual() {
      const artistaId = document.getElementById('manualProyectoArtista').value; const nombreProyecto = document.getElementById('manualNombreProyecto').value; const fecha = document.getElementById('manualFechaProyecto')._flatpickr.selectedDates[0]; const descripcion = document.getElementById('manualDescripcion').value;
      if (!artistaId || !nombreProyecto || !fecha) { return showToast('Datos incompletos.', 'error'); }
      const body = { artista: artistaId, nombreProyecto: nombreProyecto, items: [{ nombre: descripcion, unidades: 1, precioUnitario: 0 }], total: 0, estatus: 'Pagado', proceso: 'Agendado', fecha: fecha.toISOString(), };
      try { await fetchAPI('/api/proyectos', { method: 'POST', body: JSON.stringify(body) }); showToast('Guardado.', 'success'); document.getElementById('formProyectoManual').reset(); mostrarSeccion('flujo-trabajo'); } catch(e) { showToast(`Error: ${e.message}`, 'error'); }
    }
    async function generarCotizacion() { const nuevoProyecto = await guardarProyecto('Cotizacion'); if (nuevoProyecto) { showToast(nuevoProyecto.offline?'Guardado offline.':'Cotización guardada.', nuevoProyecto.offline?'warning':'success'); await generarCotizacionPDF(nuevoProyecto._id || nuevoProyecto); proyectoActual = {}; document.getElementById('proyectoDescuento').value = ''; document.getElementById('horaProyecto').value = ''; mostrarProyectoActual(); document.getElementById('formProyecto').reset(); mostrarSeccion('cotizaciones'); } }
    async function enviarAFlujoDirecto() { const nuevoProyecto = await guardarProyecto('Agendado'); if (nuevoProyecto) { showToast('Agendado.', 'success'); proyectoActual = {}; document.getElementById('proyectoDescuento').value = ''; document.getElementById('horaProyecto').value = ''; mostrarProyectoActual(); document.getElementById('formProyecto').reset(); mostrarSeccion('flujo-trabajo'); } }
    async function registrarNuevoArtistaDesdeFormulario(formPrefix) {
        const inputId = formPrefix ? `${formPrefix}NombreNuevoArtista` : 'nombreNuevoArtista';
        const containerId = formPrefix ? `${formPrefix}NuevoArtistaContainer` : 'nuevoArtistaContainer';
        const nombreInput = document.getElementById(inputId); const nombre = nombreInput.value.trim();
        if (!nombre) { showToast('Introduce un nombre.', 'error'); return; }
        try { await fetchAPI('/api/artistas', { method: 'POST', body: JSON.stringify({ nombre }) }); const selectId = formPrefix === 'manual' ? 'manualProyectoArtista' : 'proyectoArtista'; await cargarOpcionesParaSelect('/api/artistas', selectId, '_id', item => item.nombreArtistico || item.nombre, formPrefix !== 'manual'); const select = document.getElementById(selectId); select.selectedIndex = select.options.length - 1; document.getElementById(containerId).style.display = 'none'; nombreInput.value = ''; } catch (error) { showToast(`Error: ${error.message}`, 'error'); }
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
      document.getElementById('btn-go-to-workflow').onclick = () => app.goToProjectInWorkflow(info.event.id); 
      const btnArtist = document.getElementById('btn-go-to-artist'); 
      if (props.artistaId || props.artista) { btnArtist.style.display = 'block'; btnArtist.onclick = () => app.goToArtistFromModal(props.artistaId || props.artista._id, props.artistaNombre || (props.artista ? props.artista.nombre : '')); } else { btnArtist.style.display = 'none'; } 
      const oldCancelBtn = document.getElementById('btn-cancelar-evento-modal'); if(oldCancelBtn) oldCancelBtn.remove();
      if (props.estatus !== 'Cancelado') { const btnCancelar = document.createElement('button'); btnCancelar.id = 'btn-cancelar-evento-modal'; btnCancelar.textContent = '❌ Cancelar Cita'; btnCancelar.className = 'btn-eliminar'; btnCancelar.style.marginTop = '1rem'; btnCancelar.style.width = '100%'; btnCancelar.onclick = () => app.cancelarCita(info.event.id); document.querySelector('#event-modal .modal-content').appendChild(btnCancelar); }
      document.getElementById('event-modal').style.display = 'flex'; 
    }
      
    async function cancelarCita(id) {
        if (!confirm('¿Cancelar cita? Se liberará la fecha.')) return;
        try { await fetchAPI(`/api/proyectos/${id}/estatus`, { method: 'PUT', body: JSON.stringify({ estatus: 'Cancelado' }) }); showToast('Cancelada.', 'info'); closeEventModal(); app.cargarAgenda(); if (document.getElementById('flujo-trabajo').classList.contains('active')) app.filtrarFlujo('Todos'); } catch(e) { showToast(`Error: ${e.message}`, 'error'); }
    }

    async function actualizarHorarioProyecto() {
        const id = document.getElementById('modal-event-id').value;
        const newDateInput = document.getElementById('edit-event-date')._flatpickr.selectedDates[0];
        const newTimeInput = document.getElementById('edit-event-time').value;
        if (!newDateInput) return showToast("Selecciona fecha", "error");
        let finalDate = new Date(newDateInput);
        if (newTimeInput) { const [h, m] = newTimeInput.split(':'); finalDate.setHours(h); finalDate.setMinutes(m); }
        try { await app.cambiarAtributo(id, 'fecha', finalDate.toISOString()); showToast("Actualizado", "success"); closeEventModal(); app.cargarAgenda(); } catch(e) { showToast("Error", "error"); }
    }

    function closeEventModal() { document.getElementById('event-modal').style.display = 'none'; }
    function goToProjectInWorkflow(projectId) { closeEventModal(); mostrarSeccion('flujo-trabajo'); setTimeout(() => { const card = document.querySelector(`.project-card[data-id="${projectId}"]`); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200); }
    function goToArtistFromModal(artistId, artistName) { closeEventModal(); irAVistaArtista(artistId, artistName, ''); }
      
    async function cargarAgenda() {
      const calendarEl = document.getElementById('calendario');
      if (currentCalendar) { currentCalendar.destroy(); }
      try {
          const eventos = await fetchAPI('/api/proyectos/agenda');
          const isMobile = window.innerWidth < 768;
          currentCalendar = new FullCalendar.Calendar(calendarEl, {
              locale: 'es', initialView: 'dayGridMonth',
              headerToolbar: { left: 'prev,next today', center: 'title', right: isMobile ? 'dayGridMonth,listMonth' : 'dayGridMonth,timeGridWeek,listWeek' },
              height: 'auto', dayMaxEvents: isMobile ? false : true,
              buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Lista' },
              navLinks: true, editable: true, events: eventos,
              dateClick: (info) => { if (info.view.type.includes('Grid')) { mostrarSeccion('registrar-proyecto'); document.getElementById('fechaProyecto')._flatpickr.setDate(info.date); showToast(`Fecha seleccionada: ${info.date.toLocaleDateString()}`, 'info'); } },
              eventClick: openEventModal,
              eventDrop: async (info) => { if (!confirm(`¿Mover proyecto?`)) { info.revert(); return; } try { await app.cambiarAtributo(info.event.id, 'fecha', info.event.start.toISOString()); showToast('Actualizado.', 'success'); cargarFlujoDeTrabajo('Todos'); } catch (error) { info.revert(); } },
              eventContent: (arg) => { if(isMobile && !arg.view.type.includes('list')) { return { html: '' }; } else { return { html: `<div class="fc-event-main-frame"><div class="fc-event-title">${escapeHTML(arg.event.title)}</div></div>` }; } },
              eventDidMount: function(info) { if(isMobile && !info.view.type.includes('list')) { let colorVar = `var(--proceso-${info.event.extendedProps.proceso}, var(--primary-color))`; info.el.style.backgroundColor = colorVar; } }
          });
          currentCalendar.render();
      } catch (error) { calendarEl.innerHTML = '<p>Error agenda.</p>'; }
    }

    async function cambiarAtributo(id, campo, valor) { try { await fetchAPI(`/api/proyectos/${id}/${campo}`, { method: 'PUT', body: JSON.stringify({ [campo]: valor }) }); const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto) proyecto[campo] = valor; if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtroActual = document.querySelector('#filtrosFlujo button.active').textContent.trim(); filtrarFlujo(filtroActual); } } catch (e) { showToast(`Error: ${e.message}`, 'error'); } }
    async function aprobarCotizacion(id) { if (!confirm('¿Aprobar cotización?')) return; try { await fetchAPI(`/api/proyectos/${id}/proceso`, { method: 'PUT', body: JSON.stringify({ proceso: 'Agendado' }) }); showToast('¡Aprobada!', 'success'); mostrarSeccion('flujo-trabajo'); } catch(error) { showToast(`Error`, 'error'); } }
    async function compartirPorWhatsApp(proyectoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const nombreCliente = proyecto.artista ? proyecto.artista.nombre : 'cliente'; const mensaje = `¡Hola ${nombreCliente}! Resumen FiaRecords:\n\nServicios:\n${proyecto.items.map(i => `- ${i.unidades}x ${i.nombre}`).join('\n')}\n\n*Total: $${proyecto.total.toFixed(2)} MXN*\n\nContáctanos para confirmar.`; window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank'); } catch (error) { showToast('Error.', 'error'); } }
      
    async function registrarPago(proyectoId, desdeHistorial = false) { 
        const cache = desdeHistorial ? historialCacheados : localCache.proyectos; 
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

    /* LOGICA DE PESTAÑAS Y PAGOS PENDIENTES */
    async function cargarPagos() { 
      mostrarSeccionPagos('pendientes', document.querySelector('.filter-buttons button.active'));
    }
      
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

        if(pendientes.length === 0) {
            tabla.innerHTML = '<tr><td colspan="5">¡Todo al día! No hay pagos pendientes.</td></tr>';
            return;
        }

        tabla.innerHTML = pendientes.map(p => {
            const deuda = p.total - (p.montoPagado || 0);
            const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Cliente General';
            const proyectoNombre = p.nombreProyecto || 'Proyecto';
            return `<tr>
                <td>
                    <div style="font-weight:bold;">${escapeHTML(proyectoNombre)}</div>
                    <div style="font-size:0.85em; color:var(--text-color-light);">${escapeHTML(artistaNombre)}</div>
                </td>
                <td>$${p.total.toFixed(2)}</td>
                <td>$${(p.montoPagado||0).toFixed(2)}</td>
                <td style="color:var(--danger-color); font-weight:700;">$${deuda.toFixed(2)}</td>
                <td class="table-actions">
                    <button class="btn-secondary" onclick="app.registrarPago('${p._id}')">Cobrar 💵</button>
                    <button class="btn-secondary" onclick="app.compartirPorWhatsApp('${p._id}')">Recordar 💬</button>
                </td>
            </tr>`;
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
    async function openDocumentsModal(proyectoId) { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); if (!proyecto) return showToast('No encontrado.', 'error'); document.getElementById('modal-project-id').value = proyectoId; document.getElementById('modal-project-id').dataset.total = proyecto.total; showDocumentSection('contrato'); const contrato = proyecto.detallesContrato || {}; document.getElementById('contrato-nombre-album').value = contrato.nombreAlbum || ''; document.getElementById('contrato-canciones').value = contrato.cantidadCanciones || ''; document.getElementById('contrato-duracion').value = contrato.duracion || ''; document.getElementById('contrato-pago-inicial').value = contrato.pagoInicial || ''; document.getElementById('contrato-pago-final').value = contrato.pagoFinal || ''; calcularSaldoContrato(); const dist = proyecto.detallesDistribucion || {}; document.getElementById('dist-titulo').value = dist.tituloLanzamiento || ''; document.getElementById('dist-fecha').value = dist.fechaLanzamiento ? new Date(dist.fechaLanzamiento).toISOString().split('T')[0] : ''; document.getElementById('dist-upc').value = dist.upc || ''; const tracksContainer = document.getElementById('dist-tracks-container'); tracksContainer.innerHTML = ''; (dist.tracks && dist.tracks.length > 0 ? dist.tracks : [{titulo: '', isrc: ''}]).forEach(track => addTrackField(track.titulo, track.isrc)); document.getElementById('document-modal').style.display = 'flex'; }
    function closeDocumentsModal() { document.getElementById('document-modal').style.display = 'none'; }
    function showDocumentSection(sectionName) { document.querySelectorAll('.document-section').forEach(s => s.style.display='none'); document.querySelectorAll('#document-modal .filter-buttons button').forEach(b => b.classList.remove('active')); document.getElementById(`section-${sectionName}`).style.display='block'; document.getElementById(`btn-show-${sectionName}`).classList.add('active'); }
    function addTrackField(titulo = '', isrc = '') { const container = document.getElementById('dist-tracks-container'); const trackDiv = document.createElement('div'); trackDiv.className = 'form-row'; trackDiv.innerHTML = `<div class="form-group"><input type="text" class="dist-track-titulo" placeholder="Título" value="${escapeHTML(titulo)}"></div><div class="form-group"><input type="text" class="dist-track-isrc" placeholder="ISRC" value="${escapeHTML(isrc)}"></div>`; container.appendChild(trackDiv); }
    function calcularSaldoContrato() { const total = parseFloat(document.getElementById('modal-project-id').dataset.total) || 0; const inicial = parseFloat(document.getElementById('contrato-pago-inicial').value) || 0; const final = total - inicial; document.getElementById('contrato-pago-final').value = final > 0 ? final.toFixed(2) : '0.00'; }
    async function saveAndGenerateContract() { const proyectoId = document.getElementById('modal-project-id').value; const data = { nombreAlbum: document.getElementById('contrato-nombre-album').value, cantidadCanciones: parseInt(document.getElementById('contrato-canciones').value), duracion: document.getElementById('contrato-duracion').value, pagoInicial: parseFloat(document.getElementById('contrato-pago-inicial').value), pagoFinal: parseFloat(document.getElementById('contrato-pago-final').value) }; await fetchAPI(`/api/proyectos/${proyectoId}/documentos`, { method: 'PUT', body: JSON.stringify({ tipo: 'contrato', data }) }); const proyectoCompleto = await fetchAPI(`/api/proyectos/${proyectoId}`); await generarContratoPDF(proyectoCompleto); closeDocumentsModal(); }
    async function saveAndGenerateDistribution() { const proyectoId = document.getElementById('modal-project-id').value; const tracks = []; document.querySelectorAll('#dist-tracks-container .form-row').forEach(row => { const titulo = row.querySelector('.dist-track-titulo').value; const isrc = row.querySelector('.dist-track-isrc').value; if (titulo) tracks.push({ titulo, isrc }); }); const data = { tituloLanzamiento: document.getElementById('dist-titulo').value, fechaLanzamiento: document.getElementById('dist-fecha').value, upc: document.getElementById('dist-upc').value, tracks }; await fetchAPI(`/api/proyectos/${proyectoId}/documentos`, { method: 'PUT', body: JSON.stringify({ tipo: 'distribucion', data }) }); const proyectoCompleto = await fetchAPI(`/api/proyectos/${proyectoId}`); await generarDistribucionPDF(proyectoCompleto); closeDocumentsModal(); }
      
    function getFinalCoordinates(pos) { let baseX, baseY; switch(pos.vAlign) { case 'top': baseY = PDF_DIMENSIONS.MARGIN; break; case 'middle': baseY = (PDF_DIMENSIONS.HEIGHT / 2) - (pos.h / 2); break; default: baseY = PDF_DIMENSIONS.HEIGHT - pos.h - PDF_DIMENSIONS.MARGIN; } switch(pos.hAlign) { case 'left': baseX = PDF_DIMENSIONS.MARGIN; break; case 'center': baseX = (PDF_DIMENSIONS.WIDTH / 2) - (pos.w / 2); break; default: baseX = PDF_DIMENSIONS.WIDTH - pos.w - PDF_DIMENSIONS.MARGIN; } let finalX = baseX + pos.offsetX; let finalY = baseY + pos.offsetY; finalX = Math.max(PDF_DIMENSIONS.MARGIN, Math.min(finalX, PDF_DIMENSIONS.WIDTH - pos.w - PDF_DIMENSIONS.MARGIN)); finalY = Math.max(PDF_DIMENSIONS.MARGIN, Math.min(finalY, PDF_DIMENSIONS.HEIGHT - pos.h - PDF_DIMENSIONS.MARGIN)); return { x: finalX, y: finalY, w: pos.w, h: pos.h }; }
    async function addFirmaToPdf(pdf, docType, finalFileName, proyecto) { const firmaPath = (configCache && configCache.firmaPath) ? configCache.firmaPath : 'https://placehold.co/150x60?text=Firma'; try { const response = await fetch(firmaPath); if (!response.ok) throw new Error('.'); const firmaImg = await response.blob(); const reader = new FileReader(); reader.readAsDataURL(firmaImg); reader.onloadend = function() { try { const base64data = reader.result; const pos = getFinalCoordinates(configCache.firmaPos[docType]); if (docType === 'contrato') { pdf.line(PDF_DIMENSIONS.MARGIN, pos.y + pos.h + 2, PDF_DIMENSIONS.MARGIN + 70, pos.y + pos.h + 2); pdf.text(proyecto.artista.nombre, PDF_DIMENSIONS.MARGIN, pos.y + pos.h + 7); pdf.text('Firma del Cliente', PDF_DIMENSIONS.MARGIN, pos.y + pos.h + 12); } pdf.addImage(base64data, 'PNG', pos.x, pos.y, pos.w, pos.h); pdf.line(pos.x, pos.y + pos.h + 2, pos.x + pos.w, pos.y + pos.h + 2); pdf.text("Erick Resendiz", pos.x, pos.y + pos.h + 7); pdf.text("Representante FIA Records", pos.x, pos.y + pos.h + 12); } catch (e) { } finally { pdf.save(finalFileName); } } } catch(e) { pdf.save(finalFileName); } }
      
    async function generarCotizacionPDF(proyectoIdOrObject) { 
        try { 
            const proyecto = typeof proyectoIdOrObject === 'string' ? await fetchAPI(`/api/proyectos/${proyectoIdOrObject}`) : proyectoIdOrObject; 
            const { jsPDF } = window.jspdf; const pdf = new jsPDF(); 
              
            pdf.setFillColor(0, 0, 0);
            pdf.rect(14, 15, 40, 15, 'F');
            if (logoBase64) { pdf.addImage(logoBase64, 'PNG', 14, 15, 40, 15); } 

            pdf.setFontSize(9); pdf.text("FiaRecords Studio", 200, 20, { align: 'right' }); pdf.text("Juárez N.L.", 200, 25, { align: 'right' }); 
            pdf.setFontSize(11); pdf.text(`Cliente: ${proyecto.artista ? proyecto.artista.nombre : 'Público General'}`, 14, 50); pdf.text(`Fecha: ${new Date().toLocaleDateString()}`, 200, 50, { align: 'right' }); 
            const body = proyecto.items.map(item => [`${item.unidades}x ${item.nombre}`, `$${(item.precioUnitario * item.unidades).toFixed(2)}`]); 
            if (proyecto.descuento && proyecto.descuento > 0) { body.push(['Descuento', `-$${proyecto.descuento.toFixed(2)}`]); }
            pdf.autoTable({ startY: 70, head: [['Servicio', 'Subtotal']], body: body, theme: 'grid', styles: { fontSize: 10 }, headStyles: { fillColor: [0, 0, 0] } }); let finalY = pdf.lastAutoTable.finalY + 10; pdf.setFontSize(12); pdf.setFont(undefined, 'bold'); pdf.text(`Total: $${proyecto.total.toFixed(2)} MXN`, 200, finalY, { align: 'right' }); 
            const fileName = `Cotizacion-${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`; await addFirmaToPdf(pdf, 'cotizacion', fileName, proyecto); 
        } catch (error) { showToast("Error PDF", 'error'); } 
    }
    async function generarReciboPDF(proyecto, pagoEspecifico) { 
      try { 
        const { jsPDF } = window.jspdf; const pdf = new jsPDF(); const pago = pagoEspecifico || (proyecto.pagos && proyecto.pagos.length > 0 ? proyecto.pagos[proyecto.pagos.length - 1] : null); 
        
        if (!pago) {
             if (proyecto.montoPagado > 0) {
                 const dummyPago = { monto: proyecto.montoPagado };
                 return generarReciboPDF(proyecto, dummyPago);
             }
             return showToast('Sin pagos registrados.', 'error');
        }

        const saldoRestante = proyecto.total - proyecto.montoPagado; 
          
        pdf.setFillColor(0, 0, 0);
        pdf.rect(14, 15, 40, 15, 'F');
        if (logoBase64) { pdf.addImage(logoBase64, 'PNG', 14, 15, 40, 15); } 

        pdf.setFontSize(16); pdf.setFont(undefined, 'bold').text(`RECIBO DE PAGO`, 105, 45, { align: 'center' }); pdf.setFontSize(11); pdf.setFont(undefined, 'normal'); pdf.text(`Cliente: ${proyecto.artista ? proyecto.artista.nombre : 'General'}`, 14, 60); pdf.autoTable({ startY: 70, theme: 'plain', body: [['Total Proyecto:', `$${proyecto.total.toFixed(2)}`], ['Monto Recibo:', `$${pago.monto.toFixed(2)}`], ['Restante Total:', `$${saldoRestante.toFixed(2)}`]] }); const fileName = `Recibo.pdf`; await addFirmaToPdf(pdf, 'recibo', fileName, proyecto); 
      } catch (error) { showToast('Error recibo.', 'error'); }}

    async function generarContratoPDF(proyectoIdOrObject) { 
      try { 
        const proyecto = typeof proyectoIdOrObject === 'string' ? await fetchAPI(`/api/proyectos/${proyectoIdOrObject}`) : proyectoIdOrObject; const { jsPDF } = window.jspdf; const pdf = new jsPDF(); const c = proyecto.detallesContrato; 
          
        pdf.setFillColor(0, 0, 0);
        pdf.rect(14, 15, 40, 15, 'F');
        if (logoBase64) { pdf.addImage(logoBase64, 'PNG', 14, 15, 40, 15); } 

        pdf.setFontSize(18).setFont(undefined, 'bold').text('CONTRATO DE SERVICIOS', 105, 40, { align: 'center' }); pdf.setFontSize(10).setFont(undefined, 'normal'); pdf.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 55); pdf.text(`Cliente: ${proyecto.artista.nombre}`, 14, 65); const terminos = `Servicios para el álbum "${c.nombreAlbum}". Pago total: $${proyecto.total}. Anticipo: $${c.pagoInicial}.`; pdf.text(terminos, 14, 80, { maxWidth: 180 }); const fileName = `Contrato.pdf`; await addFirmaToPdf(pdf, 'contrato', fileName, proyecto); 
      } catch (e) { showToast("Error PDF", 'error'); }}
      
    async function generarDistribucionPDF(proyecto) { try { const { jsPDF } = window.jspdf; const pdf = new jsPDF(); const d = proyecto.detallesDistribucion; pdf.setFontSize(16).text('DISTRIBUCIÓN DIGITAL', 105, 20, { align: 'center' }); pdf.autoTable({ startY: 40, body: [ ['Lanzamiento:', d.tituloLanzamiento], ['UPC:', d.upc] ] }); const fileName = `Distribucion.pdf`; await addFirmaToPdf(pdf, 'distribucion', fileName, proyecto); } catch (e) { showToast("Error PDF", 'error'); }}

    async function mostrarVistaArtista(artistaId, nombre, nombreArtistico, isClientView = false) {
        document.getElementById('vista-artista-nombre').textContent = `${escapeHTML(nombre)}`; 
        const contenido = document.getElementById('vista-artista-contenido'); 
        contenido.innerHTML = '<p>Cargando...</p>'; 
        try { 
            const [proyectos, todosPagos, artistaInfo] = await Promise.all([
                fetchAPI(`/api/proyectos/por-artista/${artistaId}`),
                fetchAPI('/api/proyectos/pagos/todos'),
                fetchAPI(`/api/artistas/${artistaId}`)
            ]);
            
            let html = `<div class="card" style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <p style="font-size: 1.1em;"><strong>Nombre:</strong> ${escapeHTML(artistaInfo.nombre)}</p>
                    <p style="color:var(--text-color-light);"><strong>Artístico:</strong> ${escapeHTML(artistaInfo.nombreArtistico || 'N/A')}</p>
                    <p><strong>Tel:</strong> ${escapeHTML(artistaInfo.telefono || 'N/A')} | <strong>Email:</strong> ${escapeHTML(artistaInfo.correo || 'N/A')}</p>
                </div>`;

            if(!isClientView) {
                html += `<div style="display:flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn-secondary" onclick="app.abrirModalEditarArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}', '${escapeHTML(artistaInfo.nombreArtistico||'')}', '${escapeHTML(artistaInfo.telefono||'')}', '${escapeHTML(artistaInfo.correo||'')}')">✏️ Editar Datos</button>
                    <button class="btn-primary" onclick="app.nuevoProyectoParaArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}')">➕ Nuevo Proyecto</button>
                </div>`;
            } else {
                html += `<div style="display:flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn-primary" onclick="app.abrirModalSolicitud('${artistaInfo._id}')">📅 Solicitar Cita / Proyecto</button>
                </div>`;
            }
            html += `</div>`;
            
            html += '<h3>Proyectos</h3>'; 
            if(proyectos.length) { 
                html += '<div class="table-responsive"><table style="margin-bottom: 2rem; width: 100%;"><thead><tr><th>Fecha</th><th>Proyecto</th><th>Total</th><th>Pagado</th><th>Acciones</th></tr></thead><tbody>'; 
                proyectos.forEach(p => { 
                    html += `<tr>
                      <td>${new Date(p.fecha).toLocaleDateString()}</td>
                      <td>${escapeHTML(p.nombreProyecto || 'Proyecto')}</td>
                      <td>$${p.total.toFixed(2)}</td>
                      <td>$${(p.montoPagado||0).toFixed(2)}</td>
                      <td class="table-actions">`;
                    
                    if (!isClientView) {
                        html += `<button class="btn-secondary" title="Entrega / Drive" onclick="app.openDeliveryModal('${p._id}', '${escapeHTML(artistaInfo.nombre)}', '${escapeHTML(p.nombreProyecto || 'Proyecto')}')">☁️</button>`;
                    } else {
                        if(p.enlaceEntrega) {
                           html += `<a href="${p.enlaceEntrega}" target="_blank" class="btn-primary" style="text-decoration:none; padding: 0.5rem; display:inline-flex; align-items:center; width:auto; height:auto; font-size: 0.8em; margin-right:4px;">📂 Descargar</a>`;
                        }
                        if(p.montoPagado > 0) {
                            html += `<button class="btn-secondary" title="Descargar Recibo" onclick="app.generarReciboPDF('${p._id}')">📄 Recibo</button>`;
                        }
                    }

                    html += `<button class="btn-secondary" title="PDF" onclick="app.generarCotizacionPDF('${p._id}')">📄</button>`;
                    
                    if(!isClientView) {
                        html += `<button class="btn-secondary" title="Editar" onclick="app.editarInfoProyecto('${p._id}')">✏️</button>
                                  <button class="btn-eliminar" title="Eliminar" onclick="app.eliminarProyecto('${p._id}')">🗑️</button>`;
                    }
                    html += `</td></tr>`; 
                }); 
                html += '</tbody></table></div>'; 
            } else { html += '<p>Sin proyectos registrados.</p>'; } 
            
            contenido.innerHTML = html; 
            mostrarSeccion('vista-artista'); 
        } catch(e) { contenido.innerHTML = '<p>Error cargando historial.</p>'; console.error(e); } 
    }

    // --- FUNCIONES NUEVAS PARA SOLICITUD DE CLIENTE ---
    let solicitudArtistaId = null;

    async function abrirModalSolicitud(artistaId) {
        solicitudArtistaId = artistaId;
        const modal = document.getElementById('request-appointment-modal');
        const select = document.getElementById('req-service');
        
        try {
            if (localCache.servicios.length === 0) {
                const servicios = await fetchAPI('/api/servicios');
                localCache.servicios = servicios;
            }
            select.innerHTML = localCache.servicios.map(s => `<option value="${s._id}" data-precio="${s.precio}" data-nombre="${s.nombre}">${s.nombre} (Aprox $${s.precio})</option>`).join('');
        } catch(e) { console.error(e); }

        flatpickr("#req-date", { minDate: "today", locale: "es" });
        modal.style.display = 'flex';
    }

    function cerrarModalSolicitud() {
        document.getElementById('request-appointment-modal').style.display = 'none';
    }

    async function enviarSolicitud(e) {
        e.preventDefault();
        const select = document.getElementById('req-service');
        const option = select.options[select.selectedIndex];
        const serviceId = select.value;
        const serviceName = option.dataset.nombre;
        const price = parseFloat(option.dataset.precio);
        
        const dateStr = document.getElementById('req-date')._flatpickr.selectedDates[0];
        const timeStr = document.getElementById('req-time').value;
        const comments = document.getElementById('req-comments').value;

        if(!dateStr) return showToast('Selecciona una fecha', 'error');

        let finalDate = new Date(dateStr);
        if (timeStr) {
            const [h, m] = timeStr.split(':');
            finalDate.setHours(h);
            finalDate.setMinutes(m);
        }

        const nuevoProyecto = {
            artista: solicitudArtistaId,
            nombreProyecto: `Solicitud: ${serviceName}`,
            items: [{ servicio: serviceId, nombre: serviceName + (comments ? ` (${comments})` : ''), unidades: 1, precioUnitario: price }],
            total: price,
            descuento: 0,
            estatus: 'Solicitud', 
            metodoPago: 'Pendiente',
            fecha: finalDate.toISOString(),
            prioridad: 'Normal',
            proceso: 'Solicitud', 
            esAlbum: false
        };

        try {
            await fetchAPI('/api/proyectos', { method: 'POST', body: JSON.stringify(nuevoProyecto) });
            showToast('¡Solicitud enviada! Te contactaremos pronto.', 'success');
            cerrarModalSolicitud();
            const nombreHeader = document.getElementById('vista-artista-nombre').textContent;
            mostrarVistaArtista(solicitudArtistaId, nombreHeader, '', true);
        } catch(err) {
            showToast('Error al enviar solicitud.', 'error');
        }
    }

    async function irAVistaArtista(artistaId, artistaNombre, nombreArtistico) { if (!artistaId) { const artistas = await fetchAPI('/api/artistas'); const artista = artistas.find(a => a.nombre === artistaNombre); if (artista) artistaId = artista._id; else return; } mostrarVistaArtista(artistaId, artistaNombre, nombreArtistico); }
      
    function nuevoProyectoParaArtista(idArtista, nombreArtista) {
        preseleccionArtistaId = idArtista; 
        mostrarSeccion('registrar-proyecto');
        showToast(`Iniciando proyecto para: ${nombreArtista}`, 'info');
    }

    function abrirModalEditarArtista(id, nombre, artistico, tel, mail) {
        const m = document.getElementById('edit-artist-modal');
        document.getElementById('editArtistId').value = id;
        document.getElementById('editArtistNombre').value = nombre;
        document.getElementById('editArtistNombreArtístico').value = artistico;
        document.getElementById('editArtistTelefono').value = tel;
        document.getElementById('editArtistCorreo').value = mail;
        m.style.display = 'flex';
    }

    async function guardarEdicionArtista(e) {
        e.preventDefault();
        const id = document.getElementById('editArtistId').value;
        const body = {
            nombre: document.getElementById('editArtistNombre').value,
            nombreArtistico: document.getElementById('editArtistNombreArtístico').value,
            telefono: document.getElementById('editArtistTelefono').value,
            correo: document.getElementById('editArtistCorreo').value
        };
        
        try {
            await fetchAPI(`/api/artistas/${id}`, { method: 'PUT', body: JSON.stringify(body) });
            showToast('Datos actualizados.', 'success');
            document.getElementById('edit-artist-modal').style.display = 'none';
            mostrarVistaArtista(id, body.nombre, body.nombreArtistico);
            const idx = localCache.artistas.findIndex(a => a._id === id);
            if(idx !== -1) localCache.artistas[idx] = { ...localCache.artistas[idx], ...body };
        } catch(err) {
            showToast('Error al guardar.', 'error');
        }
    }

    function setupCustomization(payload) { if (payload.role === 'admin') { DOMElements.appLogo.addEventListener('click', () => DOMElements.logoInput.click()); DOMElements.logoInput.addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('logoFile', file); try { await fetchAPI('/api/configuracion/upload-logo', { method: 'POST', body: formData, isFormData: true }); showToast('Logo guardado!', 'success'); await loadPublicLogo(); } catch (e) { showToast(`Error`, 'error'); } }); } }
      
    async function cargarConfiguracion() { try { if (!configCache) await loadInitialConfig(); const firmaPreview = document.getElementById('firma-preview-img'); const draggablePreview = document.getElementById('firma-draggable-preview'); let firmaSrc = 'https://placehold.co/150x60?text=Subir+Firma'; if (configCache && configCache.firmaPath) { firmaSrc = configCache.firmaPath + `?t=${new Date().getTime()}`; } firmaPreview.src = draggablePreview.src = firmaSrc; 
    const db = configCache.datosBancarios || {};
    document.getElementById('banco').value = db.banco || ''; document.getElementById('titular').value = db.titular || ''; document.getElementById('tarjeta').value = db.tarjeta || ''; document.getElementById('clabe').value = db.clabe || '';
    document.getElementById('doc-type-selector').value = 'cotizacion'; cargarAjustesParaDocumento('cotizacion'); } catch (e) { showToast('Error config.', 'error'); } }
    function cargarAjustesParaDocumento(docType) { 
        if (!configCache || !configCache.firmaPos || !configCache.firmaPos[docType]) return; 
        const pos = configCache.firmaPos[docType]; 
        document.querySelector(`input[name="vAlign"][value="${pos.vAlign}"]`).checked = true;
        document.querySelector(`input[name="hAlign"][value="${pos.hAlign}"]`).checked = true;
        document.getElementById('slider-firma-w').value = pos.w; 
        document.getElementById('slider-firma-offsetX').value = pos.offsetX; 
        document.getElementById('slider-firma-offsetY').value = pos.offsetY; 
        actualizarPosicionFirma(); 
    }
    function actualizarPosicionFirma() {
        const docType = document.getElementById('doc-type-selector').value;
        const pos = configCache.firmaPos[docType];
        pos.vAlign = document.querySelector('input[name="vAlign"]:checked').value;
        pos.hAlign = document.querySelector('input[name="hAlign"]:checked').value;
        pos.w = parseInt(document.getElementById('slider-firma-w').value);
        pos.offsetX = parseInt(document.getElementById('slider-firma-offsetX').value);
        pos.offsetY = parseInt(document.getElementById('slider-firma-offsetY').value);
    }
    async function revertirADefecto() {
        const docType = document.getElementById('doc-type-selector').value;
        if (!confirm(`¿Resetear ajustes?`)) return;
        try {
            const defaultSettings = await fetchAPI('/api/configuracion/defaults');
            configCache.firmaPos[docType] = defaultSettings[docType];
            cargarAjustesParaDocumento(docType);
            showToast('Revertido.', 'info');
        } catch (e) { showToast('Error.', 'error'); }
    }
    async function guardarAjustesFirma() { if (!configCache) return; try { await fetchAPI('/api/configuracion/firma-pos', { method: 'PUT', body: JSON.stringify({ firmaPos: configCache.firmaPos }) }); showToast('¡Ajustes PDF guardados!', 'success'); } catch (e) { showToast(`Error`, 'error'); } }
    async function subirFirma(event) { const file = event.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('firmaFile', file); try { const data = await fetchAPI('/api/configuracion/upload-firma', { method: 'POST', body: formData, isFormData: true }); showToast('¡Firma subida!', 'success'); const newSrc = data.filePath + `?t=${new Date().getTime()}`; document.getElementById('firma-preview-img').src = newSrc; if(configCache) configCache.firmaPath = data.filePath; } catch (e) { showToast(`Error`, 'error'); } }
    async function guardarDatosBancarios() {
      const datosBancarios = { banco: document.getElementById('banco').value, titular: document.getElementById('titular').value, tarjeta: document.getElementById('tarjeta').value, clabe: document.getElementById('clabe').value };
      try { await fetchAPI('/api/configuracion/datos-bancarios', { method: 'PUT', body: JSON.stringify({ datosBancarios }) }); showToast('Guardado.', 'success'); configCache.datosBancarios = datosBancarios; } catch (e) { showToast(`Error`, 'error'); }
    }
    function openDeliveryModal(projectId, artistName, projectName) {
        const modal = document.getElementById('delivery-modal');
        modal.querySelector('#delivery-project-id').value = projectId;
        modal.querySelector('#delivery-artist-name').value = artistName;
        modal.querySelector('#delivery-project-name').value = projectName;
        const project = localCache.proyectos.find(p => p._id === projectId) || historialCacheados.find(p => p._id === projectId);
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
      
    async function editarInfoProyecto(id) {
        const proyecto = localCache.proyectos.find(p => p._id === id) || historialCacheados.find(p => p._id === id);
        if (!proyecto) return;
        
        const nuevoNombre = prompt('Editar Nombre del Proyecto/Canción:', proyecto.nombreProyecto || '');
        if (nuevoNombre === null) return;
        
        const nuevoTotalStr = prompt('Editar Precio Total ($):', proyecto.total || 0);
        if (nuevoTotalStr === null) return;
        const nuevoTotal = parseFloat(nuevoTotalStr);

        try { 
            if (nuevoNombre.trim() !== proyecto.nombreProyecto) {
               await fetchAPI(`/api/proyectos/${id}/nombre`, { method: 'PUT', body: JSON.stringify({ nombreProyecto: nuevoNombre.trim() }) }); 
               proyecto.nombreProyecto = nuevoNombre.trim(); 
            }
            if (!isNaN(nuevoTotal) && nuevoTotal !== proyecto.total) {
                await fetchAPI(`/api/proyectos/${id}`, { method: 'PUT', body: JSON.stringify({ total: nuevoTotal }) });
                proyecto.total = nuevoTotal;
            }
            
            showToast('Proyecto actualizado.', 'success'); 
            
            if(document.getElementById('flujo-trabajo').classList.contains('active')) {
                  const filtro = document.querySelector('#filtrosFlujo button.active').textContent.trim();
                  filtrarFlujo(filtro); 
            } else if (document.getElementById('vista-artista').classList.contains('active')) {
                  const nombreActual = document.getElementById('vista-artista-nombre').textContent;
                  
                  if (!Array.isArray(localCache.artistas)) {
                      localCache.artistas = await fetchAPI('/api/artistas');
                  }
                  
                  const art = localCache.artistas.find(a => a.nombre === nombreActual);
                  if(art) {
                      mostrarVistaArtista(art._id, nombreActual, '');
                  }
            }
        } catch (e) { showToast(`Error al editar`, 'error'); }
    }

    function setupMobileMenu() {
      const hamburger = document.getElementById('hamburger-menu');
      const sidebar = document.querySelector('.sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      const toggleMenu = () => { sidebar.classList.toggle('sidebar-visible'); overlay.classList.toggle('overlay-visible'); };
      hamburger.addEventListener('click', toggleMenu);
      overlay.addEventListener('click', toggleMenu);
      document.querySelectorAll('.sidebar .nav-link').forEach(link => { link.addEventListener('click', () => { if (window.innerWidth <= 768 && sidebar.classList.contains('sidebar-visible')) toggleMenu(); }); });
    }

    function initAppEventListeners(payload) {
      // --- PROTECCIÓN: Verificar existencia de elementos antes de asignar eventos ---
      
      const fechaInput = document.getElementById("fechaProyecto");
      if (fechaInput) {
          flatpickr("#fechaProyecto", { defaultDate: "today", locale: "es" });
      }

      window.addEventListener('hashchange', () => { 
          const section = location.hash.replace('#', ''); 
          if (section) mostrarSeccion(section, false); 
      });
      
      const sidebarNav = document.getElementById('sidebar-nav-container');
      if(sidebarNav) {
          sidebarNav.addEventListener('click', (e) => {
              const link = e.target.closest('.nav-link');
              if (link && link.dataset.seccion) {
                  mostrarSeccion(link.dataset.seccion);
              }
          });
      }
      
      const btnNuevo = document.getElementById('btn-nuevo-proyecto-sidebar');
      if (btnNuevo) {
          btnNuevo.addEventListener('click', (e) => {
              e.preventDefault();
              mostrarSeccion('registrar-proyecto');
          });
      }

      // --- ASIGNAR EVENTO AL BOTÓN DE DATOS BANCARIOS ---
      const btnBanco = document.getElementById('btn-enviar-datos-bancarios');
      if(btnBanco) {
          btnBanco.addEventListener('click', mostrarDatosBancariosPublicos);
      }

      const themeSwitch = document.getElementById('theme-switch');
      if (themeSwitch) {
          themeSwitch.addEventListener('change', (e) => applyTheme(e.target.checked ? 'dark' : 'light'));
      }

      // Botones que pueden no existir dependiendo de la vista
      const btnAgregar = document.getElementById('btnAgregarAProyecto');
      if(btnAgregar) btnAgregar.addEventListener('click', agregarAProyecto);
      
      const btnCotizar = document.getElementById('btnGenerarCotizacion');
      if(btnCotizar) btnCotizar.addEventListener('click', generarCotizacion);
      
      const btnFlujo = document.getElementById('btnEnviarAFlujo');
      if(btnFlujo) btnFlujo.addEventListener('click', enviarAFlujoDirecto);

      const btnNuevoArt = document.getElementById('btnNuevoArtista');
      if(btnNuevoArt) btnNuevoArt.addEventListener('click', () => { 
          const container = document.getElementById('nuevoArtistaContainer');
          if(container) container.style.display = 'block'; 
      });

      const btnGuardarArt = document.getElementById('btnGuardarNuevoArtista');
      if(btnGuardarArt) btnGuardarArt.addEventListener('click', () => registrarNuevoArtistaDesdeFormulario(''));

      const btnManualArt = document.getElementById('manualBtnNuevoArtista');
      if(btnManualArt) btnManualArt.addEventListener('click', () => { 
          app.abrirModalCrear('artistas');
      });
      
      const btnGuardarManualArt = document.getElementById('btnGuardarManualNuevoArtista');
      if(btnGuardarManualArt) btnGuardarManualArt.addEventListener('click', () => registrarNuevoArtistaDesdeFormulario('manual'));

      const firmaInput = document.getElementById('firma-input');
      if(firmaInput) firmaInput.addEventListener('change', subirFirma);
      
      const descInput = document.getElementById('proyectoDescuento');
      if(descInput) descInput.addEventListener('input', mostrarProyectoActual);
      
      const togglePass = document.getElementById('toggle-password');
      if(togglePass) {
          togglePass.addEventListener('click', (e) => { 
              const passwordInput = document.getElementById('password'); 
              const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'; 
              passwordInput.setAttribute('type', type); 
              e.currentTarget.innerHTML = type === 'password' ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>'; 
          });
      }

      const toggleReg = document.getElementById('toggle-password-reg');
      if(toggleReg) {
          toggleReg.addEventListener('click', (e) => { 
              const passwordInput = document.getElementById('reg-password'); 
              const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'; 
              passwordInput.setAttribute('type', type); 
              e.currentTarget.innerHTML = type === 'password' ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>'; 
          });
      }

      setupCustomization(payload);
      setupMobileMenu();

      const roleInput = document.getElementById('roleUsuario');
      if(roleInput) {
          roleInput.addEventListener('input', (e) => {
              const val = e.target.value.toLowerCase();
              const perms = document.querySelectorAll('input[name="user_permisos"]');
              
              let toCheck = [];
              if(val.includes('admin')) {
                  toCheck = ['dashboard', 'agenda', 'flujo-trabajo', 'finanzas', 'historial-proyectos', 'gestion-artistas', 'gestion-servicios', 'gestion-usuarios', 'configuracion'];
              } else if (val.includes('ingeniero')) {
                  toCheck = ['dashboard', 'agenda', 'flujo-trabajo', 'historial-proyectos', 'gestion-artistas', 'gestion-servicios'];
              } else if (val.includes('diseñador')) {
                  toCheck = ['dashboard', 'agenda', 'flujo-trabajo', 'gestion-artistas'];
              } else if (val.includes('cliente')) {
                  toCheck = ['dashboard', 'cotizaciones', 'pagos', 'historial-proyectos'];
              }

              if(toCheck.length > 0) {
                    perms.forEach(p => p.checked = false);
                    perms.forEach(p => {
                        if(toCheck.includes(p.value)) p.checked = true;
                    });
              }
          });
      }
    }

    function renderSidebar(user) {
        const navContainer = document.getElementById('sidebar-nav-container');
        
        let p = user.permisos || []; 
        const role = user.role ? user.role.toLowerCase() : '';

        if (role !== 'admin' && p.length === 0) {
            if (role.includes('ingeniero') || role.includes('productor')) {
                p = ['dashboard', 'agenda', 'flujo-trabajo', 'historial-proyectos', 'gestion-artistas', 'gestion-servicios'];
            } else if (role.includes('diseñador') || role.includes('visual')) {
                p = ['dashboard', 'agenda', 'flujo-trabajo', 'gestion-artistas'];
            } else if (role.includes('finanzas') || role.includes('contador')) {
                p = ['dashboard', 'finanzas', 'cotizaciones', 'pagos', 'historial-proyectos'];
            } else {
                p = ['dashboard'];
            }
        }
        
        const isSuperAdmin = role === 'admin';

        const canAccess = (permKey) => {
            if (isSuperAdmin) return true;
            return p.includes(permKey);
        };
        
        let html = `
          <details class="nav-group" open>
            <summary>Proyectos</summary>
            <ul>
              ${canAccess('dashboard') ? '<li><a class="nav-link" data-seccion="dashboard"><span>Dashboard</span></a></li>' : ''}
              ${canAccess('agenda') ? '<li><a class="nav-link" data-seccion="agenda"><span>Agenda</span></a></li>' : ''}
              ${canAccess('flujo-trabajo') ? '<li><a class="nav-link" data-seccion="flujo-trabajo"><span>Flujo de Trabajo</span></a></li>' : ''}
              ${canAccess('finanzas') || canAccess('cotizaciones') ? '<li><a class="nav-link" data-seccion="cotizaciones"><span>Cotizaciones</span></a></li>' : ''}
              ${canAccess('historial-proyectos') ? '<li><a class="nav-link" data-seccion="historial-proyectos"><span>Historial</span></a></li>' : ''}
              ${canAccess('finanzas') || canAccess('pagos') ? '<li><a class="nav-link" data-seccion="pagos"><span>Pagos</span></a></li>' : ''}
              ${canAccess('agenda') ? '<li><a class="nav-link" data-seccion="registro-manual"><span>Registro Manual</span></a></li>' : ''}
            </ul>
          </details>
          
          <details class="nav-group" open>
            <summary>Gestión</summary>
            <ul>
              ${canAccess('gestion-artistas') ? '<li><a class="nav-link" data-seccion="gestion-artistas"><span>Artistas</span></a></li>' : ''}
              ${canAccess('gestion-servicios') ? '<li><a class="nav-link" data-seccion="gestion-servicios"><span>Servicios</span></a></li>' : ''}
              ${canAccess('gestion-usuarios') ? '<li><a class="nav-link" data-seccion="gestion-usuarios"><span>Usuarios</span></a></li>' : ''}
            </ul>
          </details>
          
          ${canAccess('configuracion') ? `
          <details class="nav-group">
            <summary>Sistema</summary>
            <ul>
              <li><a class="nav-link" data-seccion="configuracion"><span>Configuración</span></a></li>
              <li><a class="nav-link" data-seccion="papelera-reciclaje"><span>Papelera</span></a></li>
            </ul>
          </details>` : ''}
        `;
        navContainer.innerHTML = html;
        document.querySelectorAll('.nav-link[data-seccion]').forEach(link => {
            link.addEventListener('click', (e) => mostrarSeccion(e.currentTarget.dataset.seccion));
        });
    }

    window.app = { eliminarItem, editarItem, restaurarItem, vaciarPapelera, cambiarProceso, filtrarFlujo, eliminarProyecto, quitarDeProyecto, cambiarAtributo, aprobarCotizacion, generarCotizacionPDF, compartirPorWhatsApp, registrarPago, reimprimirRecibo, compartirPagoPorWhatsApp, eliminarPago, openDocumentsModal, closeDocumentsModal, showDocumentSection, saveAndGenerateContract, saveAndGenerateDistribution, addTrackField, mostrarVistaArtista, irAVistaArtista, calcularSaldoContrato, cargarAjustesParaDocumento, actualizarPosicionFirma, guardarAjustesFirma, revertirADefecto, guardarDatosBancarios, generarContratoPDF, openEventModal, closeEventModal, goToProjectInWorkflow, goToArtistFromModal, openDeliveryModal, closeDeliveryModal, saveDeliveryLink, sendDeliveryByWhatsapp, guardarProyectoManual, editarInfoProyecto, filtrarTablas, actualizarHorarioProyecto, cargarAgenda, cancelarCita, subirADrive, syncNow: OfflineManager.syncNow, mostrarSeccion, mostrarSeccionPagos, cargarPagosPendientes, cargarHistorialPagos, cargarPagos, nuevoProyectoParaArtista, abrirModalEditarArtista, guardarEdicionArtista, loadFlujo: () => cargarFlujoDeTrabajo(), abrirModalSolicitud, cerrarModalSolicitud, enviarSolicitud, toggleAuth, registerUser, recoverPassword, generarReciboPDF, showResetPasswordView, resetPassword, guardarDesdeModal, abrirModalCrear, mostrarDatosBancariosPublicos };
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('sw.js').then(function(registration) {
        console.log('SW OK:', registration.scope);
      }, function(err) { console.log('SW Fail:', err); });
    });
  }