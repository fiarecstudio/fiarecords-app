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
                const OfflineManager = getOfflineManager();
                if (OfflineManager) {
                    OfflineManager.addToQueue(`${API_URL}${url}`, { ...options, headers }, tempId);
                }
                return { ok: true, offline: true, _id: tempId };
            }
        }

        if (!url.includes('/configuracion')) getShowLoader()();

        // FASE 4: Si Super Admin tiene empresa seleccionada, evitar caché del navegador
        const fetchOptions = { ...options, headers };

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
                        localStorage.removeItem('refreshToken');
                        isRefreshing = false;
                        refreshPromise = null;
                        getShowLogin()();
                        throw new Error('Sesión expirada. Por favor inicia sesión nuevamente.');
                    }

                    // Refresh exitoso, guardar nuevo token
                    console.log('[Auth] Token refrescado exitosamente');
                    localStorage.setItem('token', refreshData.accessToken);

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
                    localStorage.removeItem('refreshToken');
                    getShowLogin()();
                    throw new Error('Error al renovar sesión. Por favor inicia sesión nuevamente.');
                }
            }

            if (res.status === 401 && url.includes('/configuracion')) { return null; }
            if (res.status === 204) return { ok: true };

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error del servidor');

            // --- ACTUALIZAR CACHÉ INDEXED-DB SI HAY INTERNET ---
            if (!options.method || options.method === 'GET') {
                if (url === '/api/artistas') {
                    localCache.artistas = Array.isArray(data) ? data : [];
                    if (window.localforage) window.localforage.setItem('cache_artistas', localCache.artistas);
                }
                if (url === '/api/servicios') {
                    localCache.servicios = data;
                    if (window.localforage) window.localforage.setItem('cache_servicios', data);
                }
                if (url === '/api/usuarios') { localCache.usuarios = data; }
                if (url === '/api/proyectos') {
                    localCache.proyectos = data;
                    if (window.localforage) window.localforage.setItem('cache_proyectos', data);
                }
                if (url === '/api/pagos/todos') {
                    localCache.pagos = data;
                    if (window.localforage) window.localforage.setItem('cache_pagos', data);
                }
                if (url === '/api/deudas') {
                    localCache.deudas = data;
                    if (window.localforage) window.localforage.setItem('cache_deudas', data);
                }
            }
            return data;
        } catch (e) { throw e; } finally { getHideLoader()(); }
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
