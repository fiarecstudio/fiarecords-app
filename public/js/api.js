// ==================================================================
// js/api.js - Módulo de Comunicación y API
// FASE 8 PASO 8: Modularización - Interceptor fetch con refresh token
// ==================================================================

(function() {
    'use strict';

    // Configuración de API URL (mismo que en script.js)
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'
        : 'https://fiarecords-app.onrender.com';

    // PASO 7: Flags para evitar bucle infinito de refresh
    let isRefreshing = false;
    let refreshPromise = null;

    // Referencias a funciones globales que se inicializan en script.js
    function getShowLogin() {
        return window.showLogin || (() => {
            // Fallback básico si showLogin no está disponible aún
            console.warn('[api.js] showLogin no disponible, redirigiendo manualmente');
            window.location.href = '/login';
        });
    }

    function getLocalCache() {
        return window.localCache || {
            artistas: [],
            servicios: [],
            usuarios: [],
            proyectos: [],
            pagos: [],
            deudas: []
        };
    }

    function getOfflineManager() {
        return window.OfflineManager;
    }

    function getOfflineIdentity(empresaOverride = null) {
        try {
            const token = localStorage.getItem('token');
            if (!token) return null;
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userId = payload.id || payload.userId || payload.sub;
            if (!userId) return null;
            const empresaId = empresaOverride
                || localStorage.getItem('selected_empresa_id')
                || localStorage.getItem('empresaActiva')
                || payload.empresaId
                || 'all';
            return { empresaId: String(empresaId), userId: String(userId), scope: `${empresaId}:${userId}` };
        } catch (error) {
            return null;
        }
    }

    function readScopedBackup(key, variante = 'default', identity = getOfflineIdentity()) {
        if (!identity) return null;
        try {
            const stored = JSON.parse(localStorage.getItem(key) || '{}');
            return stored[identity.scope]?.[variante]?.datos ?? null;
        } catch (error) {
            return null;
        }
    }

    function readOfflineApiFallback(url, localCache, empresaOverride = null) {
        const identity = getOfflineIdentity(empresaOverride);
        if (!identity) return { found: false, data: null };

        const path = url.split('?')[0];
        const query = new URLSearchParams(url.split('?')[1] || '');
        let data = null;

        if (path === '/api/clientes') {
            try {
                const stored = JSON.parse(localStorage.getItem(`backup_clientes_${identity.empresaId}`) || '{}');
                data = stored[identity.userId]?.data || null;
            } catch (error) { /* Ignore malformed cache and try the scoped backup. */ }
            if (!data) {
                const clientes = readScopedBackup('backup_clientes', 'default', identity);
                if (Array.isArray(clientes)) data = { success: true, clientes };
            }
        } else if (path === '/api/polizas') {
            const asesorId = query.get('asesorId') || 'todos';
            data = readScopedBackup('backup_polizas', asesorId, identity)
                || readScopedBackup('backup_pagos', 'seguros', identity);
            if (!data && asesorId === 'todos') {
                try {
                    const stored = JSON.parse(localStorage.getItem(`backup_cobros_${identity.empresaId}`) || '{}');
                    data = stored[identity.userId] || null;
                } catch (error) { /* Ignore malformed cache. */ }
            }
        } else if (path === '/api/polizas/cobranza-diaria') {
            data = readScopedBackup('backup_cobranza_diaria', 'default', identity);
        } else if (path === '/api/polizas/metricas-seguros') {
            data = readScopedBackup('backup_dashboard_seguros', query.get('filtroTiempo') || 'mensual', identity);
        } else if (path === '/api/dashboard/stats') {
            data = readScopedBackup('backup_dashboard', 'default', identity);
        } else if (path === '/api/usuarios/asesores') {
            try {
                const stored = JSON.parse(localStorage.getItem(`backup_asesores_${identity.empresaId}`) || '{}');
                const asesores = stored[identity.userId]?.asesores;
                if (Array.isArray(asesores)) data = { asesores };
            } catch (error) { /* Ignore malformed cache. */ }
        } else if (path === '/api/usuarios') {
            try {
                const stored = JSON.parse(localStorage.getItem(`backup_asesores_${identity.empresaId}`) || '{}');
                data = stored[identity.userId]?.usuarios || null;
            } catch (error) { /* Ignore malformed cache. */ }
            if (!data && Array.isArray(localCache.usuarios) && localCache.usuarios.length) data = localCache.usuarios;
        } else if (path === '/api/proyectos/pagos/todos') {
            data = readScopedBackup('backup_pagos', 'historial', identity);
        } else if (path.startsWith('/api/proyectos')) {
            if (path.includes('pagos/todos')) {
                data = readScopedBackup('backup_pagos', 'historial', identity) || localCache.pagos;
            } else if (Array.isArray(localCache.proyectos) && localCache.proyectos.length) {
                if (path.includes('cotizaciones')) data = localCache.proyectos.filter(p => p.estatus === 'Cotizacion' && !p.deleted);
                else if (path.includes('completos')) data = localCache.proyectos.filter(p => (p.proceso === 'Completo' || p.estatus === 'Cancelado') && !p.deleted);
                else if (path.includes('papelera')) data = localCache.proyectos.filter(p => p.deleted === true);
                else data = localCache.proyectos.filter(p => !p.deleted);
            }
        } else if (path === '/api/artistas') data = localCache.artistas;
        else if (path === '/api/servicios') data = localCache.servicios;
        else if (path === '/api/deudas') data = localCache.deudas;
        else if (path === '/api/pagos/todos') data = localCache.pagos;

        return data === null || data === undefined
            ? { found: false, data: null }
            : { found: true, data };
    }

    function createEmptyOfflineResponse(url) {
        const path = url.split('?')[0];
        const emptyList = () => Object.assign([], { offline: true });

        if (path === '/api/clientes') return { found: true, data: { success: false, offline: true, clientes: [] } };
        if (path === '/api/usuarios/asesores') return { found: true, data: { success: false, offline: true, asesores: [] } };
        if (path === '/api/polizas/cobranza-diaria') {
            return { found: true, data: { success: false, offline: true, vencidas: [], cobrosHoy: [], porVencer: [], totales: { vencidas: 0, cobrosHoy: 0, porVencer: 0 } } };
        }
        if (path === '/api/polizas/metricas-seguros') {
            return { found: true, data: { offline: true, metricas: {}, graficas: {}, detalles: {} } };
        }
        if (path === '/api/dashboard/stats') {
            return { found: true, data: { offline: true, showFinancials: false, ingresosMes: 0, proyectosActivos: 0, proyectosPorCobrar: 0, monthlyIncome: [] } };
        }
        if (path === '/api/polizas' || path === '/api/clientes/papelera'
            || path === '/api/polizas/papelera/recuperar' || path === '/api/proyectos'
            || path === '/api/proyectos/cotizaciones' || path === '/api/proyectos/completos'
            || path === '/api/proyectos/agenda' || path === '/api/proyectos/pagos/todos'
            || path === '/api/artistas' || path === '/api/servicios' || path === '/api/usuarios'
            || path === '/api/deudas' || path === '/api/pagos/todos'
            || path === '/api/empresas' || path === '/api/backups' || path === '/api/backups/drive'
            || /\/(papelera|papelera\/all|papelera\/recuperar|notificaciones|agenda\/eventos|pagos\/todos)$/.test(path)) {
            return { found: true, data: emptyList() };
        }
        return { found: false, data: null };
    }

    function getShowLoader() {
        return window.showLoader || (() => {});
    }

    function getHideLoader() {
        return window.hideLoader || (() => {});
    }

    // ==================================================================
    // FUNCIÓN PRINCIPAL: fetchAPI con interceptor de refresh token
    // ==================================================================
    async function fetchAPI(url, options = {}) {
        if (!url.startsWith('/') && !url.startsWith('http')) { url = '/' + url; }
        let token = localStorage.getItem('token');
        const isPublic = url.includes('/auth/') || url.includes('/configuracion/public');

        // PASO 7: Si estamos haciendo refresh, no redirigir inmediatamente
        if (!token && !isPublic && !isRefreshing) {
            getShowLogin()();
            throw new Error('No autenticado');
        }

        const headers = { 'Authorization': `Bearer ${token}` };
        if (!options.isFormData) { headers['Content-Type'] = 'application/json'; }

        // FASE 4: Incluir empresa seleccionada en headers
        // PRIORIDAD 1: Si el llamador pasó X-Empresa-Id en options.headers (ej: loadInitialConfig)
        if (options.headers && options.headers['X-Empresa-Id']) {
            headers['X-Empresa-Id'] = options.headers['X-Empresa-Id'];
        }
        // PRIORIDAD 2: Si es Super Admin y tiene empresa seleccionada
        else if (token && window.EmpresaContext && window.EmpresaContext.isSuperAdmin()) {
            const selectedEmpresa = window.EmpresaContext.getSelected();
            if (selectedEmpresa) {
                headers['X-Empresa-Id'] = selectedEmpresa;
            }
        }

        const localCache = getLocalCache();

        // --- MODO OFFLINE (LECTURA DE CACHÉ) ---
        if ((!options.method || options.method === 'GET')) {
            if (!navigator.onLine) {
                const fallback = readOfflineApiFallback(url, localCache, options.headers?.['X-Empresa-Id']);
                if (fallback.found) return fallback.data;
                const neutral = createEmptyOfflineResponse(url);
                if (neutral.found) return neutral.data;
                const offlineError = new Error('Sin datos locales disponibles para esta solicitud.');
                offlineError.offline = true;
                throw offlineError;
            }
        }

        // --- MODO OFFLINE (ESCRITURA A COLA) ---
        if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method)) {
            if (!navigator.onLine) {
                if (options.skipOfflineQueue) {
                    throw new Error('La conexión se perdió durante la sincronización.');
                }
                const requiereConexion = options.isFormData
                    || /\/(auth\/|enviar-recordatorio|notificar-manual|importar-|extraer-datos|backups?\/|drive\/|configuracion\/notificaciones-email)/i.test(url);
                if (requiereConexion) {
                    throw new Error('Esta operación requiere conexión a internet.');
                }
                const tempId = `temp_${Date.now()}`;
                const OfflineManager = getOfflineManager();
                if (!OfflineManager) throw new Error('No se pudo iniciar la cola offline.');
                await OfflineManager.addToQueue(url, { ...options, headers }, tempId);
                window.notificarGuardadoOffline?.();
                return { ok: true, success: true, offline: true, _id: tempId };
            }
        }

        const silent = options.silent === true;
        if (!silent && !url.includes('/configuracion')) getShowLoader()();

        // FASE 4: Si Super Admin tiene empresa seleccionada, evitar caché del navegador
        const requestOptions = { ...options };
        delete requestOptions.skipOfflineQueue;
        delete requestOptions.silent;
        const fetchOptions = { ...requestOptions, headers };

        // DEBUG FASE 5: Verificar headers antes de enviar
        if (url === '/api/proyectos') {
            console.log('[DEBUG fetchAPI] Headers a enviar:', fetchOptions.headers);
            console.log('[DEBUG fetchAPI] X-Empresa-Id en headers:', fetchOptions.headers['X-Empresa-Id']);
        }

        if (token && window.EmpresaContext && window.EmpresaContext.isSuperAdmin() && window.EmpresaContext.getSelected()) {
            fetchOptions.cache = 'no-store';
            // También agregar timestamp para bypassar Service Worker
            if (!url.includes('?')) {
                url = url + '?_=' + Date.now();
            } else {
                url = url + '&_=' + Date.now();
            }
        }

        try {
            let res = await fetch(`${API_URL}${url}`, fetchOptions);

            // PASO 7: Manejar 401 con intento de refresh token
            if (res.status === 401 && !isPublic) {
                console.log('[Auth] Token expirado, intentando refresh...');

                const refreshToken = localStorage.getItem('refreshToken');

                if (!refreshToken) {
                    console.log('[Auth] No hay refresh token, redirigiendo a login');
                    getShowLogin()();
                    throw new Error('Sesión expirada.');
                }

                // Evitar múltiples llamadas simultáneas de refresh
                if (!isRefreshing) {
                    isRefreshing = true;
                    refreshPromise = fetch(`${API_URL}/api/auth/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken })
                    });
                }

                try {
                    const refreshRes = await refreshPromise;
                    const refreshData = await refreshRes.json();

                    if (!refreshRes.ok) {
                        console.log('[Auth] Refresh token inválido o expirado');
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        localStorage.removeItem('refreshToken');
                        isRefreshing = false;
                        refreshPromise = null;
                        getShowLogin()();
                        throw new Error('Sesión expirada. Por favor inicia sesión nuevamente.');
                    }

                    // Refresh exitoso, guardar nuevo token y usuario
                    console.log('[Auth] Token refrescado exitosamente');
                    localStorage.setItem('token', refreshData.accessToken);
                    if (refreshData.user) {
                        localStorage.setItem('user', JSON.stringify(refreshData.user));
                    }

                    // Reintentar petición original con nuevo token
                    token = refreshData.accessToken;
                    fetchOptions.headers['Authorization'] = `Bearer ${token}`;

                    isRefreshing = false;
                    refreshPromise = null;

                    console.log('[Auth] Reintentando petición original:', url);
                    res = await fetch(`${API_URL}${url}`, fetchOptions);

                } catch (refreshError) {
                    isRefreshing = false;
                    refreshPromise = null;
                    console.error('[Auth] Error al refrescar token:', refreshError);
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('refreshToken');
                    getShowLogin()();
                    throw new Error('Error al renovar sesión. Por favor inicia sesión nuevamente.');
                }
            }

            if (res.status === 401 && url.includes('/configuracion')) { return null; }
            if (res.status === 204) return { ok: true };

            const data = await res.json();
            if (!res.ok && data?.offline === true) {
                const fallback = readOfflineApiFallback(url, localCache, options.headers?.['X-Empresa-Id']);
                if (fallback.found) return fallback.data;
                const neutral = createEmptyOfflineResponse(url);
                if (neutral.found) return neutral.data;
                const offlineError = new Error(data.message || 'Sin datos locales disponibles para esta solicitud.');
                offlineError.offline = true;
                throw offlineError;
            }
            if (!res.ok) throw new Error(data.error || 'Error del servidor');

            // --- ACTUALIZAR CACHÉ INDEXED-DB SI HAY INTERNET ---
            if (!options.method || options.method === 'GET') {
                if (url === '/api/artistas') {
                    localCache.artistas = Array.isArray(data) ? data : [];
                    window.FiaOfflineCache?.set('cache_artistas', localCache.artistas).catch(() => { });
                }
                if (url === '/api/servicios') {
                    localCache.servicios = data;
                    window.FiaOfflineCache?.set('cache_servicios', data).catch(() => { });
                }
                if (url === '/api/usuarios') { localCache.usuarios = data; }
                if (url === '/api/proyectos') {
                    localCache.proyectos = data;
                    window.FiaOfflineCache?.set('cache_proyectos', data).catch(() => { });
                }
                if (url === '/api/pagos/todos') {
                    localCache.pagos = data;
                    window.FiaOfflineCache?.set('cache_pagos', data).catch(() => { });
                }
                if (url === '/api/deudas') {
                    localCache.deudas = data;
                    window.FiaOfflineCache?.set('cache_deudas', data).catch(() => { });
                }
            }
            return data;
        } catch (e) {
            const esFalloRed = e instanceof TypeError
                || /failed to fetch|networkerror|load failed|fetch failed/i.test(e.message || '');
            if ((!options.method || options.method === 'GET') && (e.offline || esFalloRed || !navigator.onLine)) {
                const fallback = readOfflineApiFallback(url, localCache, options.headers?.['X-Empresa-Id']);
                if (fallback.found) return fallback.data;
                const neutral = createEmptyOfflineResponse(url);
                if (neutral.found) return neutral.data;
                const offlineError = new Error('Sin datos locales disponibles para esta solicitud.');
                offlineError.offline = true;
                throw offlineError;
            }
            throw e;
        } finally {
            if (!silent) getHideLoader()();
        }
    }

    // Helper para peticiones públicas sin autenticación
    async function fetchPublic(url, options = {}) {
        if (!url.startsWith('/')) { url = '/' + url; }
        const fetchOptions = { ...options };
        if (!options.isFormData && !options.headers?.['Content-Type']) {
            fetchOptions.headers = { ...options.headers, 'Content-Type': 'application/json' };
        }
        const res = await fetch(`${API_URL}${url}`, fetchOptions);
        if (res.status === 204) return { ok: true };
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error del servidor');
        return data;
    }

    // ==================================================================
    // EXPORTAR AL ESPACIO GLOBAL
    // ==================================================================
    window.API_URL = API_URL;
    window.fetchAPI = fetchAPI;
    window.fetchPublic = fetchPublic;

    // Logs de inicialización (solo en desarrollo)
    if (window.Logger) Logger.debug('api.js', 'Módulo de API cargado');
})();
