// ==================================================================
// js/auth.js - Módulo de Autenticación y Gestión de Sesión
// FASE 8 PASO 8: Modularización - Login, logout y gestión de tokens
// ==================================================================

(function() {
    'use strict';

    // Referencia a API_URL del módulo api.js
    const API_URL = window.API_URL || (
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000'
            : 'https://fiarecords-app.onrender.com'
    );

    // Referencias a funciones globales que se inicializan en script.js
    function getDOMElements() {
        return window.DOMElements || {
            loginContainer: document.getElementById('login-container'),
            appWrapper: document.getElementById('app-wrapper')
        };
    }

    function getShowLoader() {
        return window.showLoader || (() => {});
    }

    function getHideLoader() {
        return window.hideLoader || (() => {});
    }

    function getShowToast() {
        return window.showToast || ((message, type = 'success') => {
            console.log(`[Toast ${type}]`, message);
        });
    }

    function getShowApp() {
        return window.showApp || (() => {});
    }

    function getToggleAuth() {
        return window.toggleAuth || (() => {});
    }

    function getAplicarIdentidadVisual() {
        return window.aplicarIdentidadVisual || (() => Promise.resolve());
    }
    
    // Flag global para prevenir doble ejecución
    let _aplicandoIdentidad = false;

    function getMostrarSeccion() {
        return window.mostrarSeccion || (() => {});
    }

    // ==================================================================
    // GESTIÓN DE TOKENS
    // ==================================================================

    /**
     * Guarda los tokens de autenticación en localStorage
     * @param {string} accessToken - Token de acceso JWT
     * @param {string} refreshToken - Token de refresco
     */
    function guardarTokens(accessToken, refreshToken, user) {
        if (!accessToken) {
            console.error('[Auth] No se proporcionó accessToken');
            return false;
        }

        // Guardar accessToken como 'token' para compatibilidad
        localStorage.setItem('token', accessToken);
        if (window.Logger) Logger.debug('Auth', 'Access Token guardado');

        if (user) {
            localStorage.setItem('user', JSON.stringify(user));
            if (window.Logger) Logger.debug('Auth', 'Usuario guardado en localStorage');
        }

        // Guardar refreshToken si existe
        if (refreshToken) {
            localStorage.setItem('refreshToken', refreshToken);
            if (window.Logger) Logger.debug('Auth', 'Refresh Token guardado');
        }

        // Extraer y guardar empresaId del payload
        try {
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            if (payload.empresaId) {
                localStorage.setItem('empresaActiva', payload.empresaId);
                if (window.Logger) Logger.debug('Auth', 'empresaActiva guardada:', payload.empresaId);
            }
            return payload;
        } catch (e) {
            console.warn('[Auth] Error decodificando token:', e);
            return null;
        }
    }

    /**
     * Obtiene el token de acceso actual
     * @returns {string|null}
     */
    function obtenerToken() {
        return localStorage.getItem('token');
    }

    /**
     * Obtiene el refresh token
     * @returns {string|null}
     */
    function obtenerRefreshToken() {
        return localStorage.getItem('refreshToken');
    }

    /**
     * Obtiene el payload decodificado del token
     * @returns {object|null}
     */
    function obtenerPayloadToken() {
        const token = obtenerToken();
        if (!token) return null;
        try {
            return JSON.parse(atob(token.split('.')[1]));
        } catch (e) {
            console.warn('[Auth] Error decodificando token:', e);
            return null;
        }
    }

    /**
     * Limpia todos los datos de sesión
     */
    function limpiarSesion() {
        // FASE 5 + PASO 7: LIMPIEZA COMPLETA al cerrar sesión
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('empresaActiva');
        localStorage.removeItem('selected_empresa_id');
        localStorage.removeItem('fia_identity_cache');
        localStorage.removeItem('fia_identity_timestamp');
        localStorage.removeItem('fia_logo_cache');

        if (window.localCache) {
            window.localCache.artistas = [];
            window.localCache.servicios = [];
            window.localCache.proyectos = [];
            window.localCache.pagos = [];
            window.localCache.usuarios = [];
            window.localCache.cotizaciones = [];
            window.localCache.historial = [];
            window.localCache.trash = {
                proyectos: [],
                artistas: [],
                servicios: [],
                usuarios: []
            };
        }

        ['historialCacheados', 'cotizacionesCacheadas', 'pagosPendientesCacheados', 'pagosHistorialCacheados'].forEach((key) => {
            if (window[key]) {
                window[key] = [];
            }
        });

        if (window.localforage && typeof window.localforage.removeItem === 'function') {
            ['cache_artistas', 'cache_servicios', 'cache_proyectos', 'cache_pagos', 'cache_deudas'].forEach((key) => {
                window.localforage.removeItem(key).catch(() => { });
            });
        }

        if (window.Logger) Logger.debug('Auth', 'Sesión limpiada');
    }

    /**
     * Verifica si el usuario está autenticado
     * @returns {boolean}
     */
    function estaAutenticado() {
        const token = obtenerToken();
        if (!token) return false;

        // Verificar si el token está expirado
        const payload = obtenerPayloadToken();
        if (!payload || !payload.exp) return false;

        // exp está en segundos, Date.now() en milisegundos
        return payload.exp * 1000 > Date.now();
    }

    /**
     * Obtiene el rol del usuario desde el token
     * @returns {string|null}
     */
    function obtenerRol() {
        const payload = obtenerPayloadToken();
        return payload ? payload.role : null;
    }

    /**
     * Obtiene el ID del usuario desde el token
     * @returns {string|null}
     */
    function obtenerUserId() {
        const payload = obtenerPayloadToken();
        return payload ? payload.id : null;
    }

    // ==================================================================
    // FUNCIONES DE UI DE AUTENTICACIÓN
    // ==================================================================

    /**
     * Muestra la pantalla de login
     */
    function showLogin() {
        document.body.classList.add('auth-visible');

        // Limpiar sesión
        limpiarSesion();

        // No resetear el logo aquí: el login debe mostrar la identidad visual de la empresa principal
        // si está disponible, no un placeholder en blanco.

        // Limpiar URL
        history.pushState("", document.title, window.location.pathname);

        // Mostrar login, ocultar app
        const DOMElements = getDOMElements();
        if (DOMElements.loginContainer) {
            DOMElements.loginContainer.style.display = 'flex';
        }
        if (DOMElements.appWrapper) {
            DOMElements.appWrapper.style.display = 'none';
        }

        // Cambiar a vista de login
        getToggleAuth()('login');

        // Mostrar body
        document.body.style.opacity = '1';
        document.body.style.visibility = 'visible';

        const loginLogo = document.getElementById('login-logo');
        const logoData = window.AppState?.logoBase64 || window.FIA_LOGO_DEFAULT || 'https://placehold.co/180x80?text=FiaRecords';
        if (loginLogo) {
            loginLogo.src = logoData;
        }

        // Recargar identidad visual en el login para obtener el logo de la empresa principal.
        if (!_aplicandoIdentidad) {
            _aplicandoIdentidad = true;
            getAplicarIdentidadVisual()(true).catch(() => {})
                .finally(() => { _aplicandoIdentidad = false; });
        }

        if (window.Logger) Logger.debug('Auth', 'Mostrando pantalla de login');
    }

    /**
     * Realiza el proceso de login
     * @param {string} username - Nombre de usuario
     * @param {string} password - Contraseña
     * @returns {Promise<object>} - Payload del token
     */
    async function doLogin(username, password) {
        if (!navigator.onLine) {
            throw new Error('Se requiere conexión a internet para iniciar sesión.');
        }

        getShowLoader()();

        try {
            const res = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error al iniciar sesión');
            }

            // PASO 7: Manejar nuevos tokens (accessToken + refreshToken)
            const accessToken = data.accessToken || data.token;
            const refreshToken = data.refreshToken;

            if (!accessToken) {
                throw new Error('No se recibió token de acceso del servidor');
            }

            // Guardar tokens
            const payload = guardarTokens(accessToken, refreshToken, data.user);

            if (!payload) {
                throw new Error('Error al procesar el token de acceso');
            }

            if (window.Logger) Logger.info('Auth', 'Login exitoso:', data.user?.username || payload.username);

            // Resetear el estado visual y forzar recarga del logo de la empresa actual
            if (window.AppState && typeof window.AppState.resetLogo === 'function') {
                window.AppState.resetLogo();
            }

            // Aplicar identidad visual inmediatamente (con protección)
            if (!_aplicandoIdentidad) {
                _aplicandoIdentidad = true;
                await getAplicarIdentidadVisual()(true).finally(() => {
                    _aplicandoIdentidad = false;
                });
            }
            
            // Inicializar chat después del login
            if (window.chatInit && typeof window.chatInit.autoInit === 'function') {
                setTimeout(() => window.chatInit.autoInit(), 500);
            }

            return payload;

        } finally {
            getHideLoader()();
        }
    }

    /**
     * Realiza el proceso de registro
     * @param {object} userData - Datos del usuario a registrar
     * @returns {Promise<object>} - Payload del token
     */
    async function doRegister(userData) {
        if (!navigator.onLine) {
            throw new Error('Se requiere conexión a internet para registrarse.');
        }

        getShowLoader()();

        try {
            const res = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error al registrar usuario');
            }

            // PASO 7: Guardar tokens igual que en login
            const accessToken = data.accessToken || data.token;
            const refreshToken = data.refreshToken;

            if (!accessToken) {
                throw new Error('No se recibió token de acceso del servidor');
            }

            const payload = guardarTokens(accessToken, refreshToken, data.user);

            if (window.Logger) Logger.info('Auth', 'Registro exitoso:', data.user?.username || payload?.username || userData.username);

            return payload;

        } finally {
            getHideLoader()();
        }
    }

    /**
     * Cierra la sesión del usuario
     * @param {boolean} apiLogout - Si es true, notifica al servidor
     */
    async function logout(apiLogout = true) {
        if (apiLogout && navigator.onLine) {
            try {
                const token = obtenerToken();
                if (token) {
                    await fetch(`${API_URL}/api/auth/logout`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (window.Logger) Logger.debug('Auth', 'Logout notificado al servidor');
                }
            } catch (e) {
                console.warn('[Auth] Error notificando logout al servidor:', e);
                // Continuar con logout local incluso si falla el servidor
            }
        }

        limpiarSesion();

        // Mostrar login sin resetear el logo, para que el login pueda reutilizar la identidad principal.
        showLogin();

        // Reiniciar chat como visitante
        if (window.chatInit && typeof window.chatInit.autoInit === 'function') {
            setTimeout(() => window.chatInit.autoInit(), 500);
        }

        getShowToast()('Sesión cerrada correctamente', 'info');
        if (window.Logger) Logger.debug('Auth', 'Logout completado');
    }

    // ==================================================================
    // LISTENERS DE AUTENTICACIÓN
    // ==================================================================

    /**
     * Configura los listeners del formulario de login
     * Esta función se llama desde script.js después de inicializar el DOM
     */
    function setupAuthListeners() {
        const loginForm = document.getElementById('login-form');
        if (!loginForm) {
            console.warn('[Auth] No se encontró el formulario de login');
            return;
        }

        // Evitar múltiples listeners
        if (loginForm.dataset.authListenersAttached === 'true') {
            return;
        }

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const userVal = document.getElementById('username')?.value?.trim();
            const passVal = document.getElementById('password')?.value;
            const errorEl = document.getElementById('login-error');

            if (!userVal || !passVal) {
                if (errorEl) errorEl.textContent = 'Por favor ingresa usuario y contraseña';
                return;
            }

            try {
                const payload = await doLogin(userVal, passVal);

                // Mostrar la aplicación
                if (window.showApp) {
                    await window.showApp(payload);
                } else {
                    console.warn('[Auth] showApp no está disponible aún');
                }

            } catch (error) {
                console.error('[Auth] Error de login:', error);
                if (errorEl) errorEl.textContent = error.message;

                // También mostrar toast si está disponible
                getShowToast()(error.message, 'error');
            }
        });

        // Toggle password visibility
        const togglePassword = document.getElementById('toggle-password');
        if (togglePassword) {
            togglePassword.addEventListener('click', () => {
                const passwordInput = document.getElementById('password');
                if (passwordInput) {
                    const currentType = passwordInput.getAttribute('type');
                    passwordInput.setAttribute('type', currentType === 'password' ? 'text' : 'password');
                }
            });
        }

        // Toggle reg password visibility
        const togglePasswordReg = document.getElementById('toggle-password-reg');
        if (togglePasswordReg) {
            togglePasswordReg.addEventListener('click', () => {
                const passwordInput = document.getElementById('reg-password');
                if (passwordInput) {
                    const currentType = passwordInput.getAttribute('type');
                    passwordInput.setAttribute('type', currentType === 'password' ? 'text' : 'password');
                }
            });
        }

        loginForm.dataset.authListenersAttached = 'true';
        if (window.Logger) Logger.debug('Auth', 'Listeners configurados');
    }

    // ==================================================================
    // EXPORTAR AL ESPACIO GLOBAL
    // ==================================================================
    window.Auth = {
        // Funciones de UI
        showLogin,
        doLogin,
        doRegister,
        logout,
        setupAuthListeners,

        // Gestión de tokens
        guardarTokens,
        obtenerToken,
        obtenerRefreshToken,
        obtenerPayloadToken,
        limpiarSesion,
        estaAutenticado,
        obtenerRol,
        obtenerUserId
    };

    // Compatibilidad hacia atrás - exponer funciones directamente
    window.showLogin = showLogin;
    window.doLogin = doLogin;
    window.logout = logout;
    window.setupAuthListeners = setupAuthListeners;

    if (window.Logger) Logger.debug('auth.js', 'Módulo cargado');
})();
