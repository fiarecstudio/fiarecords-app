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
        const storedEmpresaId = localStorage.getItem('empresaId') || localStorage.getItem('currentEmpresaId');
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
     * Obtiene el rol del usuario desde el token JWT
     */
    function getUserRole() {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.role || null;
        } catch (e) {
            return null;
        }
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
     * Inicializa el chat de soporte para visitantes (no autenticados) o clientes
     */
    window.initSupportWidget = async function() {
        console.log('[ChatInit] Inicializando SupportWidget...');
        
        // Limpiar widget anterior si existe
        if (window.supportWidget?.elements?.container) {
            window.supportWidget.elements.container.remove();
            window.supportWidget = null;
        }
        
        // Para visitantes sin autenticación: limpiar datos de sesiones previas
        // para evitar que interfieran con la detección de empresa
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('[ChatInit] Visitante detectado, limpiando datos de sesiones previas');
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
            empresaId = localStorage.getItem('currentEmpresaId') || localStorage.getItem('empresaId');
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
            console.log('[ChatInit] Sin empresaId, SupportWidget mostrará selector de empresas');
        }
        
        try {
            console.log('[ChatInit] Inicializando SupportWidget para empresa:', empresaId);
            
            supportWidget = new SupportWidget({
                empresaId: empresaId,
                apiUrl: window.location.hostname === 'localhost' ? 'http://localhost:5000' : ''
            });
            
            await supportWidget.init();
            window.supportWidget = supportWidget;
            
            console.log('[ChatInit] ✅ SupportWidget inicializado');
            return true;
            
        } catch (error) {
            console.error('[ChatInit] Error inicializando SupportWidget:', error);
            return false;
        }
    };

    /**
     * Inicializa el chat cuando el usuario está autenticado
     */
    window.initChat = async function() {
        // Verificar que el usuario esté autenticado
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('[ChatInit] Usuario no autenticado, inicializando SupportWidget...');
            // Inicializar widget de soporte para visitantes
            await window.initSupportWidget();
            return false;
        }

        // Verificar que las clases estén cargadas
        if (typeof ChatManager === 'undefined' || typeof SocketClient === 'undefined') {
            console.error('[ChatInit] ChatManager o SocketClient no están cargados');
            return false;
        }

        // Si ya está inicializado, no hacer nada
        // NOTA: Usar window.chatManager para detectar reinicios correctamente
        console.log('[ChatInit] Verificando estado:', {
            windowChatManager: !!window.chatManager,
            windowChatManagerState: window.chatManager?.state,
            windowChatManagerInitialized: window.chatManager?.state?.isInitialized,
            localChatManager: !!chatManager
        });
        if (window.chatManager && window.chatManager.state?.isInitialized) {
            console.log('[ChatInit] Chat ya inicializado (window.chatManager)');
            return true;
        }

        try {
            console.log('[ChatInit] Inicializando chat...');

            // Crear instancia del ChatManager
            chatManager = new ChatManager();

            // Registrar callbacks de UI (ejemplos)
            chatManager.on('onConnected', (data) => {
                console.log('[ChatInit] ✅ Chat conectado:', data);
            });

            chatManager.on('onDisconnected', (data) => {
                console.log('[ChatInit] 🔌 Chat desconectado:', data);
            });

            chatManager.on('onMessageReceived', (data) => {
                console.log('[ChatInit] 📨 Nuevo mensaje:', data.message);
                
                // Ejemplo: Mostrar notificación simple
                const message = data.message;
                console.log(`[ChatInit] De: ${message.senderName}: ${message.content}`);
            });

            chatManager.on('onConversationUpdated', (data) => {
                console.log('[ChatInit] 📝 Conversación actualizada:', data);
            });

            chatManager.on('onUserOnline', (data) => {
                console.log('[ChatInit] 🟢 Usuario online:', data.username);
            });

            chatManager.on('onUserOffline', (data) => {
                console.log('[ChatInit] 🔴 Usuario offline:', data.username);
            });

            chatManager.on('onError', (error) => {
                console.error('[ChatInit] ❌ Error:', error);
            });

            // Inicializar
            await chatManager.initialize();

            console.log('[ChatInit] ✅ Chat inicializado correctamente');
            console.log('[ChatInit] Estado:', chatManager.getState());

            // FASE 4: Inicializar widget de UI si existe
            if (typeof ChatWidget !== 'undefined') {
                chatWidget = new ChatWidget(chatManager);
                chatWidget.init();
                window.chatWidget = chatWidget;
                console.log('[ChatInit] ✅ ChatWidget inicializado');
            }

            // Guardar en variable global para acceso desde consola
            window.chatManager = chatManager;

            return true;

        } catch (error) {
            console.error('[ChatInit] Error inicializando chat:', error);
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

    /**
     * Auto-inicializar cuando el DOM esté listo
     * Las inicializaciones son independientes - si una falla, la otra puede continuar
     */
    async function autoInit() {
        try {
            const token = localStorage.getItem('token');
            const role = getUserRole();
            
            console.log('[ChatInit] Auto-inicializando... Token:', !!token, 'Rol:', role);
            
            if (token && role && ['admin', 'empleado', 'soporte', 'ingeniero', 'diseñador'].includes(role.toLowerCase())) {
                // Es empleado/admin - usar ChatWidget interno
                console.log('[ChatInit] Detectado empleado/admin, inicializando Chat...');
                try {
                    await window.initChat();
                } catch (chatError) {
                    console.error('[ChatInit] Chat falló:', chatError.message);
                }
            } else if (token) {
                // Es cliente autenticado - usar ChatWidget para ver conversaciones directas
                console.log('[ChatInit] Detectado cliente autenticado, inicializando Chat...');
                
                // Limpiar datos antiguos del SupportWidget para evitar confusiones
                localStorage.removeItem('support_ticket_id');
                localStorage.removeItem('support_visitor_name');
                localStorage.removeItem('support_visitor_email');
                console.log('[ChatInit] Datos antiguos de SupportWidget limpiados');
                
                try {
                    await window.initChat();
                } catch (error) {
                    console.error('[ChatInit] Chat falló:', error.message);
                    // Solo si falla completamente, intentar SupportWidget como fallback
                    console.log('[ChatInit] Intentando SupportWidget como fallback...');
                    await window.initSupportWidget();
                }
            } else {
                // Visitante no autenticado - solo SupportWidget
                console.log('[ChatInit] Detectado visitante, inicializando SupportWidget...');
                try {
                    await window.initSupportWidget();
                } catch (error) {
                    console.error('[ChatInit] SupportWidget falló:', error.message);
                }
            }
        } catch (error) {
            console.error('[ChatInit] Error en auto-inicialización:', error);
        }
    }
    
    // Ejecutar auto-inicialización
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[ChatInit] DOM listo, esperando antes de inicializar...');
            setTimeout(autoInit, 2000);
        });
    } else {
        console.log('[ChatInit] DOM ya listo, esperando antes de inicializar...');
        setTimeout(autoInit, 2000);
    }

    /**
     * Limpia y reinicia el chat (útil al cambiar de usuario)
     */
    let isRestarting = false;
    window.restartChat = async function() {
        // Evitar reinicios múltiples simultáneos
        if (isRestarting) {
            console.log('[ChatInit] Reinicio ya en progreso, ignorando...');
            return;
        }
        
        isRestarting = true;
        console.log('[ChatInit] 🔄 Reiniciando chat...');
        
        try {
            // Limpiar todo inmediatamente para evitar widgets parpadeando
            if (window.chatWidget?.elements?.container) {
                window.chatWidget.elements.container.remove();
                console.log('[ChatInit] ChatWidget eliminado');
            }
            if (window.supportWidget?.elements?.container) {
                window.supportWidget.elements.container.remove();
                console.log('[ChatInit] SupportWidget eliminado');
            }
            if (window.chatManager?.socketClient) {
                window.chatManager.socketClient.disconnect();
                console.log('[ChatInit] Socket desconectado');
            }
            
            // Reiniciar variables
            window.chatManager = null;
            window.chatWidget = null;
            window.supportWidget = null;
            
            // Pequeño delay para permitir que el token se estabilice
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // Re-inicializar
            await autoInit();
            console.log('[ChatInit] ✅ Chat reiniciado');
        } finally {
            isRestarting = false;
        }
    };
    
    // Escuchar cambios de token para reiniciar automáticamente (con debounce)
    let lastToken = localStorage.getItem('token');
    let restartTimeout = null;
    setInterval(() => {
        const currentToken = localStorage.getItem('token');
        if (currentToken !== lastToken) {
            console.log('[ChatInit] 🔄 Token cambiado detectado');
            lastToken = currentToken;
            
            // Cancelar reinicio anterior si existe
            if (restartTimeout) {
                clearTimeout(restartTimeout);
            }
            
            // Esperar 1 segundo antes de reiniciar (debounce)
            restartTimeout = setTimeout(() => {
                console.log('[ChatInit] Ejecutando reinicio después de debounce...');
                window.restartChat();
            }, 1000);
        }
    }, 2000); // Verificar cada 2 segundos
    
    console.log('[ChatInit] ✅ FASE 5: Script cargado. Funciones disponibles:');
    console.log('- initChat() - Inicializar chat manualmente');
    console.log('- initSupportWidget() - Inicializar widget de soporte (visitantes)');
    console.log('- restartChat() - 🆕 Reiniciar chat (al cambiar usuario)');
    console.log('- testChatConnection() - Probar conexión');
    console.log('- testSendMessage(convId, text) - Enviar mensaje de prueba');
    console.log('- createDirectChat(userId) - Crear chat 1:1');
    console.log('- createTestConversation() - 🆕 Crear conversación de prueba AUTO');
    console.log('- showChatStatus() - Ver estado');
    console.log('- listConversations() - Listar conversaciones');
    console.log('- chatWidget.toggle() - Abrir/cerrar widget UI');
    console.log('%c👉 Para probar: ejecuta createTestConversation() en consola', 'color: #6366f1; font-weight: bold;');
    console.log('FASES: 1✅ 2✅ 3✅ 4✅ 5✅ - Sistema de chat completo + Soporte');

})();
