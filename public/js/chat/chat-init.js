/**
 * chat-init.js
 * FASE 3: Script de inicialización del chat
 * 
 * Ejemplo de uso básico para probar la conexión.
 * Este archivo demuestra cómo usar ChatManager y SocketClient.
 */

(function() {
    'use strict';

    // Instancia global del ChatManager y ChatWidget
    let chatManager = null;
    let chatWidget = null;
    let supportWidget = null;

    /**
     * Detecta el empresaId desde localStorage o configuración global
     */
    function detectEmpresaId() {
        // 1. Intentar desde el token JWT decodificado
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                // Soportar múltiples formatos: empresaId, empresa_id, tenantId
                const empresaId = payload.empresaId || payload.empresa_id || payload.tenantId || payload.empresa;
                if (empresaId) return empresaId;
            } catch (e) {
                console.log('[ChatInit] Error decodificando token:', e.message);
            }
        }
        
        // 2. Intentar desde localStorage
        const storedEmpresaId = localStorage.getItem('empresaId') || localStorage.getItem('currentEmpresaId') || localStorage.getItem('empresaActiva');
        if (storedEmpresaId) return storedEmpresaId;
        
        // 3. Intentar desde variable global
        if (window.FIA_CONFIG?.empresaId) return window.FIA_CONFIG.empresaId;
        if (window.EMPRESA_ID) return window.EMPRESA_ID;
        if (window.currentEmpresa?._id) return window.currentEmpresa._id;
        
        // 4. Intentar desde meta tag
        const meta = document.querySelector('meta[name="empresa-id"]');
        if (meta) return meta.content;
        
        // 5. Intentar desde URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlEmpresaId = urlParams.get('empresa') || urlParams.get('empresaId') || urlParams.get('e');
        if (urlEmpresaId) return urlEmpresaId;
        
        return null;
    }

    /**
     * Normaliza el rol extraído del token
     */
    function normalizeRole(rawRole) {
        if (!rawRole) return null;
        return rawRole.toString().trim().toLowerCase();
    }

    /**
     * Obtiene el rol del usuario desde el token JWT
     */
    function getUserRole() {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.role || payload.rol || payload.userRole || payload.roleName || null;
        } catch (e) {
            return null;
        }
    }

    function getUserInfo() {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return {
                id: payload.id || payload._id || payload.userId || null,
                role: payload.role || payload.rol || payload.userRole || payload.roleName || null,
                empresaId: payload.empresaId || payload.empresa_id || payload.tenantId || payload.empresa || null,
                username: payload.username || payload.name || payload.nombre || null,
                email: payload.email || payload.correo || null,
                raw: payload
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Persiste user en localStorage para lectura síncrona en SupportWidget (la app solo guarda JWT).
     */
    function syncUserToLocalStorage() {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const existing = JSON.parse(localStorage.getItem('user') || '{}');
            if (existing.role) return;
            const info = getUserInfo();
            if (!info?.id) return;
            localStorage.setItem('user', JSON.stringify({
                id: info.id,
                role: normalizeRole(info.role),
                email: info.email,
                username: info.username,
                empresaId: info.empresaId
            }));
        } catch (e) {
            Logger.debug('ChatInit', 'No se pudo sincronizar user en localStorage:', e.message);
        }
    }

    /**
     * Determina si el rol corresponde a un empleado/admin
     */
    function isStaffRole(role) {
        const normalizedRole = normalizeRole(role);
        if (!normalizedRole) return false;
        const staffRoles = [
            'admin',
            'administrador',
            'empleado',
            'employee',
            'soporte',
            'support',
            'superadmin',
            'super-admin',
            'ingeniero',
            'diseñador'
        ];
        return staffRoles.includes(normalizedRole);
    }

    /**
     * Sesión activa: token presente y no expirado.
     */
    function hasActiveSession() {
        const token = localStorage.getItem('token');
        if (!token) return false;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.exp && payload.exp * 1000 < Date.now()) {
                return false;
            }
            return !!(payload.id || payload._id || payload.userId);
        } catch (e) {
            return false;
        }
    }

    /**
     * Destruye por completo el widget de soporte (visitantes).
     */
    function destroySupportWidget() {
        if (window.supportWidgetInstance) {
            window.supportWidgetInstance.destroy();
        }
        const orphan = document.getElementById('support-widget');
        if (orphan) orphan.remove();
        window.supportWidgetInstance = null;
        window.supportWidget = null;
        supportWidget = null;
    }

    /**
     * Destruye el chat interno (usuarios autenticados).
     */
    function destroyInternalChat() {
        if (window.chatWidget?.elements?.container) {
            window.chatWidget.elements.container.remove();
        }
        if (window.chatManager?.socketClient) {
            window.chatManager.socketClient.disconnect();
        }
        window.chatWidget = null;
        window.chatManager = null;
        chatWidget = null;
        chatManager = null;
    }

    /**
     * Obtiene el ID del usuario desde el token JWT
     */
    window.getCurrentUserId = function() {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.id || payload._id || payload.userId || null;
        } catch (e) {
            return null;
        }
    };

    /**
     * Inicializa el widget de soporte (solo visitantes anónimos en login).
     */
    window.initSupportWidget = async function() {
        if (hasActiveSession()) {
            Logger.debug('ChatInit', 'Sesión activa: SupportWidget no permitido');
            destroySupportWidget();
            return false;
        }

        Logger.debug('ChatInit', 'Inicializando SupportWidget (visitante)...');

        syncUserToLocalStorage();
        
        // Para visitantes sin autenticación: limpiar datos de sesiones previas
        // para evitar que interfieran con la detección de empresa
        const token = localStorage.getItem('token');
        if (!token) {
            Logger.debug('ChatInit', 'Visitante detectado, limpiando datos de sesiones previas');
            localStorage.removeItem('empresaId');
            localStorage.removeItem('currentEmpresaId');
            // NOTA: No limpiamos support_empresa_id para permitir recordar selección previa
        }
        
        // Detectar empresaId desde múltiples fuentes
        let empresaId = null;
        
        // 1. Intentar desde localStorage específico de soporte
        empresaId = localStorage.getItem('support_empresa_id');
        
        // 2. Si hay token, intentar desde localStorage general
        if (!empresaId && token) {
            empresaId = localStorage.getItem('currentEmpresaId') || localStorage.getItem('empresaId') || localStorage.getItem('empresaActiva');
        }
        
        // 3. Intentar desde variable global (solo si hay token)
        if (!empresaId && token && window.currentEmpresa) {
            empresaId = window.currentEmpresa._id;
        }
        
        // 4. Intentar extraer de query params
        if (!empresaId) {
            const urlParams = new URLSearchParams(window.location.search);
            empresaId = urlParams.get('empresa') || urlParams.get('empresaId');
        }
        
        // Si aún no hay empresaId, mostrará selector de empresas
        if (!empresaId) {
            Logger.debug('ChatInit', 'Sin empresaId, SupportWidget mostrará selector de empresas');
        }
        
        try {
            Logger.debug('ChatInit', 'Inicializando SupportWidget para empresa:', empresaId);

            const apiUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

            if (!window.supportWidgetInstance) {
                window.supportWidgetInstance = new SupportWidget({ apiUrl });
            }

            await window.supportWidgetInstance.init({ empresaId });
            supportWidget = window.supportWidgetInstance;
            window.supportWidget = supportWidget;
            
            Logger.info('ChatInit', '✅ SupportWidget inicializado (singleton)');
            return true;
            
        } catch (error) {
            Logger.error('ChatInit', 'Error inicializando SupportWidget:', error);
            return false;
        }
    };

    /**
     * Inicializa el chat cuando el usuario está autenticado
     */
    window.initChat = async function() {
        if (!hasActiveSession()) {
            Logger.debug('ChatInit', 'Sin sesión activa, inicializando SupportWidget para visitantes...');
            destroyInternalChat();
            await window.initSupportWidget();
            return false;
        }

        // Usuario logueado: nunca mostrar burbuja naranja
        destroySupportWidget();

        // Verificar que las clases estén cargadas
        if (typeof ChatManager === 'undefined' || typeof SocketClient === 'undefined') {
            Logger.error('ChatInit', 'ChatManager o SocketClient no están cargados');
            return false;
        }

        // Si ya está inicializado, no hacer nada
        // NOTA: Usar window.chatManager para detectar reinicios correctamente
        Logger.debug('ChatInit', 'Verificando estado', {
            windowChatManager: !!window.chatManager,
            windowChatManagerState: window.chatManager?.state,
            windowChatManagerInitialized: window.chatManager?.state?.isInitialized,
            localChatManager: !!chatManager
        });
        if (window.chatManager && window.chatManager.state?.isInitialized) {
            Logger.debug('ChatInit', 'Chat ya inicializado');
            return true;
        }

        try {
            Logger.debug('ChatInit', 'Inicializando chat...');

            // Crear instancia del ChatManager
            chatManager = new ChatManager();

            // Registrar callbacks de UI (ejemplos)
            chatManager.on('onConnected', (data) => {
                Logger.info('ChatInit', '✅ Chat conectado:', data);
            });

            chatManager.on('onDisconnected', (data) => {
                Logger.info('ChatInit', '🔌 Chat desconectado:', data);
            });

            chatManager.on('onMessageReceived', (data) => {
                Logger.info('ChatInit', '📨 Nuevo mensaje de', data.message.senderName);
                
                // Ejemplo: Mostrar notificación simple
                const message = data.message;
            });

            chatManager.on('onConversationUpdated', (data) => {
                Logger.debug('ChatInit', '📝 Conversación actualizada:', data);
            });

            chatManager.on('onUserOnline', (data) => {
                Logger.debug('ChatInit', '🟢 Usuario online:', data.username);
            });

            chatManager.on('onUserOffline', (data) => {
                Logger.debug('ChatInit', '🔴 Usuario offline:', data.username);
            });

            chatManager.on('onError', (error) => {
                Logger.error('ChatInit', '❌ Error:', error);
            });

            // Inicializar
            await chatManager.initialize();

            Logger.info('ChatInit', '✅ Chat inicializado correctamente');
            Logger.debug('ChatInit', 'Estado:', chatManager.getState());

            // FASE 4: Inicializar widget de UI si existe
            if (typeof ChatWidget !== 'undefined') {
                chatWidget = new ChatWidget(chatManager);
                chatWidget.init();
                window.chatWidget = chatWidget;
                Logger.info('ChatInit', '✅ ChatWidget inicializado');
            }

            // Guardar en variable global para acceso desde consola
            window.chatManager = chatManager;

            return true;

        } catch (error) {
            Logger.error('ChatInit', 'Error inicializando chat:', error);
            return false;
        }
    };

    /**
     * Envía un mensaje de prueba
     * Uso: testSendMessage('conversationId', 'Hola mundo')
     */
    window.testSendMessage = async function(conversationId, content) {
        if (!chatManager) {
            console.error('[ChatInit] ChatManager no inicializado');
            return;
        }

        try {
            // Unirse a la conversación primero
            if (chatManager.state.currentConversationId !== conversationId) {
                await chatManager.joinConversation(conversationId);
            }

            // Enviar mensaje
            const message = await chatManager.sendMessage(content);
            console.log('[ChatInit] Mensaje enviado:', message);

        } catch (error) {
            console.error('[ChatInit] Error enviando mensaje:', error);
        }
    };

    /**
     * Prueba de conexión básica
     * Envía un ping al servidor y muestra la respuesta
     */
    window.testChatConnection = async function() {
        if (!chatManager || !chatManager.socketClient) {
            console.error('[ChatInit] SocketClient no disponible');
            return;
        }

        try {
            console.log('[ChatInit] Enviando ping de prueba...');
            
            const response = await chatManager.socketClient.emit('ping', {});
            console.log('[ChatInit] ✅ Pong recibido:', response);

        } catch (error) {
            console.error('[ChatInit] ❌ Error en ping:', error);
        }
    };

    /**
     * Crea una conversación directa con un usuario
     * Uso: createDirectChat('userIdDelOtroUsuario')
     */
    window.createDirectChat = async function(targetUserId) {
        if (!chatManager) {
            console.error('[ChatInit] ChatManager no inicializado');
            return;
        }

        try {
            const result = await chatManager.createDirectConversation(targetUserId);
            console.log('[ChatInit] Conversación creada:', result);
            
            if (result.conversationId) {
                // Unirse a la nueva conversación
                await chatManager.joinConversation(result.conversationId);
                console.log('[ChatInit] Unido a conversación:', result.conversationId);
                
                // Actualizar UI si existe widget
                if (chatWidget) {
                    chatWidget.showChatView();
                }
            }

        } catch (error) {
            console.error('[ChatInit] Error creando conversación:', error);
        }
    };

    /**
     * Crea una conversación de prueba automáticamente
     * Busca usuarios disponibles y crea chat con el primero
     * Uso: createTestConversation()
     */
    window.createTestConversation = async function() {
        if (!chatManager) {
            console.error('[ChatInit] ChatManager no inicializado. Ejecuta initChat() primero.');
            return;
        }

        try {
            console.log('[ChatInit] 🔍 Buscando usuarios disponibles...');
            
            // Obtener usuarios disponibles via REST
            let users = [];
            if (typeof fetchAPI !== 'undefined') {
                const response = await fetchAPI('/api/chat/users');
                if (response.success) {
                    users = response.users || [];
                }
            }
            
            if (users.length === 0) {
                console.error('[ChatInit] ❌ No hay otros usuarios en tu empresa para chatear');
                console.log('[ChatInit] ℹ️ Crea otro usuario de prueba primero');
                return;
            }
            
            console.log('[ChatInit] ✅ Usuarios encontrados:', users.length);
            console.table(users.map(u => ({ id: u.id, username: u.username, role: u.role })));
            
            // Usar el primer usuario
            const targetUser = users[0];
            console.log('[ChatInit] 👤 Creando conversación con:', targetUser.username);
            
            // Crear la conversación
            const result = await chatManager.createDirectConversation(targetUser.id);
            console.log('[ChatInit] ✅ Conversación creada:', result);
            
            if (result.conversationId) {
                // Unirse y mostrar
                await chatManager.joinConversation(result.conversationId);
                
                // Recargar conversaciones
                await chatManager.loadConversations();
                
                // Abrir widget si existe
                if (chatWidget) {
                    chatWidget.open();
                    chatWidget.showChatView();
                }
                
                console.log('[ChatInit] 🎉 ¡Listo! Abre el widget de chat para ver la conversación');
                console.log('[ChatInit] 💡 Puedes enviar mensajes con: testSendMessage("' + result.conversationId + '", "Hola!")');
                
                return result.conversationId;
            }
            
        } catch (error) {
            console.error('[ChatInit] ❌ Error creando conversación de prueba:', error);
        }
    };

    /**
     * Muestra el estado actual del chat en consola
     */
    window.showChatStatus = function() {
        if (!chatManager) {
            console.log('[ChatInit] ChatManager no inicializado');
            return;
        }

        const state = chatManager.getState();
        console.log('=== ESTADO DEL CHAT ===');
        console.log('Conectado:', state.isConnected);
        console.log('Inicializado:', state.isInitialized);
        console.log('Conversación actual:', state.currentConversationId);
        console.log('Conversaciones:', state.conversations.length);
        console.log('Mensajes no leídos:', state.unreadCount);
        console.log('Usuarios online:', Array.from(state.onlineUsers));
        console.log('=======================');
    };

    /**
     * Lista todas las conversaciones disponibles
     */
    window.listConversations = function() {
        if (!chatManager) {
            console.error('[ChatInit] ChatManager no inicializado');
            return;
        }

        const conversations = chatManager.state.conversations;
        console.log('=== CONVERSACIONES ===');
        conversations.forEach((conv, index) => {
            console.log(`${index + 1}. [${conv.type}] ${conv.title || 'Sin título'}`);
            console.log('   ID:', conv.id);
            console.log('   No leídos:', conv.unreadCount || 0);
            console.log('   Último mensaje:', conv.lastMessage?.content || 'Ninguno');
            console.log('---');
        });
        console.log('======================');
        console.log('Total:', conversations.length);
    };

    // Variable para tracking del tipo de sesión actual
    let currentSessionType = null; // 'authenticated' | 'visitor' | null

    /**
     * Auto-inicializar cuando el DOM esté listo
     * Las inicializaciones son independientes - si una falla, la otra puede continuar
     */
    async function autoInit() {
        try {
            const role = getUserRole();
            
            // Determinar el tipo de sesión necesaria (token válido, no expirado)
            const requiredSessionType = hasActiveSession() ? 'authenticated' : 'visitor';
            
            // Si cambió el tipo de sesión, limpiar el widget que ya no corresponde
            if (currentSessionType && currentSessionType !== requiredSessionType) {
                Logger.info('ChatInit', `Cambio de sesión: ${currentSessionType} → ${requiredSessionType}, limpiando...`);
                if (requiredSessionType === 'authenticated') {
                    destroySupportWidget();
                } else {
                    destroyInternalChat();
                }
            }
            
            // Actualizar tipo de sesión actual
            currentSessionType = requiredSessionType;
            
            if (hasActiveSession()) {
                // Todos los roles autenticados (admin, ingeniero, diseñador, cliente) → chat morado
                Logger.debug('ChatInit', 'Sesión activa, inicializando chat interno (rol:', normalizeRole(role), ')...');
                destroySupportWidget();
                try {
                    await window.initChat();
                } catch (chatError) {
                    Logger.error('ChatInit', 'Chat interno falló:', chatError.message);
                }
            } else {
                // Visitante en pantalla de login → burbuja naranja exclusiva
                Logger.debug('ChatInit', 'Sin sesión, inicializando SupportWidget para visitantes...');
                destroyInternalChat();
                try {
                    await window.initSupportWidget();
                } catch (error) {
                    Logger.error('ChatInit', 'SupportWidget falló:', error.message);
                }
            }
        } catch (error) {
            Logger.error('ChatInit', 'Error en auto-inicialización:', error);
        }
    }
    
    // Ejecutar auto-inicialización inmediatamente (sin delay)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            Logger.debug('ChatInit', 'DOM listo, ejecutando autoInit...');
            autoInit();
        });
    } else {
        Logger.debug('ChatInit', 'DOM ya listo, ejecutando autoInit...');
        autoInit();
    }

    /**
     * Limpia y reinicia el chat (útil al cambiar de usuario)
     */
    let isRestarting = false;
    window.restartChat = async function() {
        // Evitar reinicios múltiples simultáneos
        if (isRestarting) {
            Logger.debug('ChatInit', 'Reinicio ya en progreso, ignorando...');
            return;
        }
        
        isRestarting = true;
        Logger.info('ChatInit', '🔄 Reiniciando chat...');
        
        try {
            destroyInternalChat();
            destroySupportWidget();
            currentSessionType = null; // Reset para forzar re-inicialización
            
            // Pequeño delay para permitir que el token se estabilice
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // Re-inicializar
            await autoInit();
            Logger.info('ChatInit', '✅ Chat reiniciado');
        } finally {
            isRestarting = false;
        }
    };
    
    // Escuchar cambios de token usando storage event (más eficiente que polling)
    let restartTimeout = null;
    window.addEventListener('storage', (e) => {
        if (e.key === 'token') {
            Logger.info('ChatInit', '🔄 Token cambiado detectado (storage event)');
            
            // Cancelar reinicio anterior si existe
            if (restartTimeout) {
                clearTimeout(restartTimeout);
            }
            
            // Esperar 1 segundo antes de reiniciar (debounce)
            restartTimeout = setTimeout(() => {
                Logger.debug('ChatInit', 'Ejecutando reinicio después de debounce...');
                window.restartChat();
            }, 1000);
        }
    });
    
    // Audio global de notificaciones de chat (fallback si script.js aún no cargó)
    if (!window.reproducirSonidoChat) {
        window.audioNotificacion = window.audioNotificacion || new Audio('/public/sounds/notificacion.mp3');
        window.reproducirSonidoChat = function() {
            if (window.audioNotificacion) {
                window.audioNotificacion.currentTime = 0;
                window.audioNotificacion.play().catch(e => console.warn('Audio bloqueado por navegador', e));
            }
        };
        window.reproducirSonido = window.reproducirSonidoChat;
    }

    // FASE 5: Sistema de chat completo cargado
    Logger.debug('ChatInit', '✅ FASE 5: Script cargado');
    
    // Exportar API pública
    window.chatInit = {
        autoInit: autoInit,
        restartChat: window.restartChat,
        destroySupportWidget,
        destroyInternalChat,
        hasActiveSession
    };

})();
