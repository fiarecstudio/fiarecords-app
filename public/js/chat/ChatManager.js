/**
 * ChatManager.js
 * FASE 3: Clase principal de gestión del chat
 * 
 * Coordina la conexión Socket.io, el estado de conversaciones,
 * y la interacción con el backend.
 */

(function() {
    'use strict';

    class ChatManager {
        constructor() {
            // Instancia del cliente Socket.io
            this.socketClient = null;
            
            // Estado del chat
            this.state = {
                isInitialized: false,
                currentConversationId: null,
                conversations: [],
                messages: {},  // Mapa: conversationId -> array de mensajes
                unreadCount: 0,
                onlineUsers: new Set()
            };
            
            // Callbacks para la UI (registrados externamente)
            this.uiCallbacks = {
                onMessageReceived: null,
                onConversationUpdated: null,
                onUserOnline: null,
                onUserOffline: null,
                onTyping: null,
                onConnected: null,
                onDisconnected: null,
                onError: null
            };
        }

        /**
         * Inicializa el sistema de chat
         * @returns {Promise<boolean>}
         */
        async initialize() {
            try {
                console.log('[ChatManager] Inicializando sistema de chat...');

                // Verificar que SocketClient esté disponible
                if (typeof SocketClient === 'undefined') {
                    throw new Error('SocketClient no está cargado. Cargar SocketClient.js primero.');
                }

                // Crear instancia del cliente
                this.socketClient = new SocketClient();

                // Registrar listeners de eventos
                this._registerEventListeners();

                // Conectar al servidor
                await this.socketClient.connect();

                // Cargar conversaciones del usuario
                await this.loadConversations();

                this.state.isInitialized = true;
                console.log('[ChatManager] ✅ Sistema de chat inicializado');

                return true;

            } catch (error) {
                console.error('[ChatManager] Error inicializando:', error);
                this._triggerCallback('onError', { 
                    type: 'init_error', 
                    message: error.message 
                });
                throw error;
            }
        }

        /**
         * Registra listeners para eventos del SocketClient
         */
        _registerEventListeners() {
            // Conexión establecida
            this.socketClient.on('connected', (data) => {
                console.log('[ChatManager] Conectado al chat');
                this._triggerCallback('onConnected', data);
            });

            // Desconexión
            this.socketClient.on('disconnected', (data) => {
                console.log('[ChatManager] Desconectado:', data.reason);
                this._triggerCallback('onDisconnected', data);
            });

            // Mensaje recibido
            this.socketClient.on('message_received', (data) => {
                console.log('[ChatManager] Mensaje recibido:', data);
                
                const { message } = data;
                const convId = message.conversationId.toString();
                
                // Verificar si el mensaje ya existe (evitar duplicados)
                if (!this.state.messages[convId]) {
                    this.state.messages[convId] = [];
                }
                
                const existingMsg = this.state.messages[convId].find(m => 
                    m._id.toString() === message._id.toString()
                );
                
                if (existingMsg) {
                    console.log('[ChatManager] Mensaje duplicado ignorado:', message._id);
                    return;
                }
                
                this.state.messages[convId].push(message);
                
                // Actualizar conversación
                this._updateConversationLastMessage(convId, message);
                
                // Notificar a la UI
                this._triggerCallback('onMessageReceived', data);
            });

            // Confirmación de lectura
            this.socketClient.on('message_read', (data) => {
                console.log('[ChatManager] Mensajes leídos:', data);
                
                const { messageIds, readBy } = data;
                const convId = data.conversationId?.toString();
                
                // Actualizar estado local de mensajes
                if (convId && this.state.messages[convId]) {
                    messageIds.forEach(msgId => {
                        const msg = this.state.messages[convId].find(
                            m => m._id.toString() === msgId.toString()
                        );
                        if (msg) {
                            if (!msg.readBy) msg.readBy = [];
                            msg.readBy.push(readBy);
                        }
                    });
                }
            });

            // Conversación actualizada
            this.socketClient.on('conversation_updated', (data) => {
                console.log('[ChatManager] Conversación actualizada:', data);
                
                const convId = data.conversationId.toString();
                const conversation = this.state.conversations.find(
                    c => c._id.toString() === convId
                );
                
                if (conversation) {
                    conversation.lastMessage = data.lastMessage;
                    conversation.updatedAt = new Date();
                    
                    if (data.unreadIncrement) {
                        conversation.unreadCount = (conversation.unreadCount || 0) + data.unreadIncrement;
                    }
                } else {
                    // Conversación no existe (ticket nuevo), agregar a la lista
                    console.log('[ChatManager] Nueva conversación recibida, agregando a la lista:', convId);
                    this.state.conversations.unshift({
                        _id: convId,
                        type: data.type || 'support',
                        title: data.title || 'Nuevo ticket',
                        lastMessage: data.lastMessage,
                        updatedAt: new Date(),
                        unreadCount: data.unreadIncrement || 1,
                        participants: []
                    });
                    
                    // Incrementar contador total
                    this.state.unreadCount += data.unreadIncrement || 1;
                }
                
                this._triggerCallback('onConversationUpdated', data);
            });

            // Usuario online
            this.socketClient.on('user_online', (data) => {
                console.log('[ChatManager] Usuario online:', data.username);
                this.state.onlineUsers.add(data.userId);
                this._triggerCallback('onUserOnline', data);
            });

            // Usuario offline
            this.socketClient.on('user_offline', (data) => {
                console.log('[ChatManager] Usuario offline:', data.username);
                this.state.onlineUsers.delete(data.userId);
                this._triggerCallback('onUserOffline', data);
            });

            // Typing indicator
            this.socketClient.on('presence:typing', (data) => {
                console.log('[ChatManager] Typing:', data.username, data.isTyping);
                this._triggerCallback('onTyping', data);
            });

            // Error de autenticación
            this.socketClient.on('auth_error', (error) => {
                console.error('[ChatManager] Error de autenticación:', error);
                this._triggerCallback('onError', { 
                    type: 'auth_error', 
                    message: 'Sesión expirada. Requiere login.' 
                });
            });

            // Reconexión fallida
            this.socketClient.on('reconnect_failed', () => {
                console.error('[ChatManager] Reconexión fallida');
                this._triggerCallback('onError', { 
                    type: 'reconnect_failed', 
                    message: 'No se pudo reconectar al servidor de chat' 
                });
            });
        }

        /**
         * Carga las conversaciones del usuario desde el servidor
         */
        async loadConversations() {
            try {
                console.log('[ChatManager] Cargando conversaciones via socket...');
                
                const response = await this.socketClient.emit('user:getConversations', {});
                
                if (response.success) {
                    this.state.conversations = response.conversations || [];
                    console.log(`[ChatManager] ${this.state.conversations.length} conversaciones cargadas via socket`);
                    
                    // Calcular total de no leídos
                    this.state.unreadCount = this.state.conversations.reduce(
                        (sum, c) => sum + (c.unreadCount || 0), 0
                    );
                    
                    return this.state.conversations;
                }
                
            } catch (error) {
                console.warn('[ChatManager] Socket falló, intentando REST...', error.message);
                // Fallback: intentar cargar vía REST API
                try {
                    return await this._loadConversationsREST();
                } catch (restError) {
                    console.error('[ChatManager] REST también falló:', restError.message);
                    // Si ambos fallan, usar array vacío
                    this.state.conversations = [];
                    return [];
                }
            }
        }

        /**
         * Fallback: Carga conversaciones vía REST API
         */
        async _loadConversationsREST() {
            try {
                if (typeof fetchAPI === 'undefined') {
                    throw new Error('fetchAPI no disponible');
                }
                
                const response = await fetchAPI('/api/chat/conversations');
                
                if (response.success) {
                    this.state.conversations = response.conversations || [];
                    return this.state.conversations;
                }
                
            } catch (error) {
                console.error('[ChatManager] Error cargando vía REST:', error);
                return [];
            }
        }

        /**
         * Únete a una conversación específica
         * @param {string} conversationId 
         */
        async joinConversation(conversationId) {
            try {
                console.log('[ChatManager] Uniendo a conversación:', conversationId);
                
                const response = await this.socketClient.emit('room:join', {
                    conversationId
                });
                
                if (response.success) {
                    this.state.currentConversationId = conversationId;
                    
                    // Cargar historial de mensajes
                    await this.loadMessageHistory(conversationId);
                    
                    return response.conversation;
                } else {
                    throw new Error(response.error || 'Error al unirse a la conversación');
                }
                
            } catch (error) {
                console.error('[ChatManager] Error uniendo a conversación:', error);
                throw error;
            }
        }

        /**
         * Sale de la conversación actual
         */
        leaveConversation() {
            if (this.state.currentConversationId && this.socketClient.isConnected) {
                this.socketClient.emit('room:leave', {
                    conversationId: this.state.currentConversationId
                }).catch(err => console.error('[ChatManager] Error saliendo:', err));
                
                this.state.currentConversationId = null;
            }
        }

        /**
         * Carga el historial de mensajes de una conversación
         * @param {string} conversationId 
         * @param {Object} options - { before, limit }
         */
        async loadMessageHistory(conversationId, options = {}) {
            try {
                console.log('[ChatManager] Cargando historial:', conversationId);
                
                const response = await this.socketClient.emit('message:getHistory', {
                    conversationId,
                    before: options.before,
                    limit: options.limit || 50
                });
                
                if (response.success) {
                    // Guardar en estado
                    this.state.messages[conversationId] = response.messages || [];
                    return response.messages;
                }
                
            } catch (error) {
                console.error('[ChatManager] Error cargando historial:', error);
                
                // Fallback: REST API
                return this._loadMessageHistoryREST(conversationId, options);
            }
        }

        /**
         * Fallback: Carga historial vía REST API
         */
        async _loadMessageHistoryREST(conversationId, options = {}) {
            try {
                
            } catch (error) {
                console.error('[ChatManager] Error cargando historial REST:', error);
                return [];
            }
        }

        /**
         * Envía un mensaje a la conversación actual
         * @param {string} content - Contenido del mensaje
         * @param {Object} options - { type, replyTo, fileData }
         */
        async sendMessage(content, options = {}) {
            if (!this.state.currentConversationId) {
                throw new Error('No hay conversación activa seleccionada');
            }
            
            if (!content || content.trim() === '') {
                throw new Error('El mensaje no puede estar vacío');
            }

            try {
                console.log('[ChatManager] Enviando mensaje...');
                
                const messageData = {
                    conversationId: this.state.currentConversationId,
                    content: content.trim(),
                    type: options.type || 'text',
                    replyTo: options.replyTo || null,
                    fileData: options.fileData || null
                };
                
                const response = await this.socketClient.emit('message:send', messageData);
                
                if (response.success) {
                    // Agregar a la lista local inmediatamente (optimistic UI)
                    const convId = this.state.currentConversationId;
                    if (!this.state.messages[convId]) {
                        this.state.messages[convId] = [];
                    }
                    this.state.messages[convId].push(response.message);
                    
                    return response.message;
                } else {
                    throw new Error(response.error || 'Error al enviar mensaje');
                }
                
            } catch (error) {
                console.error('[ChatManager] Error enviando mensaje:', error);
                throw error;
            }
        }

        /**
         * Marca mensajes como leídos
         * @param {string} conversationId 
         * @param {Array<string>} messageIds 
         */
        async markAsRead(conversationId, messageIds) {
            if (!messageIds || messageIds.length === 0) return;
            
            try {
                const response = await this.socketClient.emit('message:read', {
                    conversationId,
                    messageIds
                });
                
                if (response.success) {
                    // Actualizar contador local
                    const conversation = this.state.conversations.find(
                        c => c._id.toString() === conversationId.toString()
                    );
                    if (conversation) {
                        conversation.unreadCount = Math.max(
                            0, 
                            (conversation.unreadCount || 0) - response.modifiedCount
                        );
                    }
                    
                    this.state.unreadCount = this.state.conversations.reduce(
                        (sum, c) => sum + (c.unreadCount || 0), 0
                    );
                }
                
            } catch (error) {
                console.error('[ChatManager] Error marcando como leído:', error);
            }
        }

        /**
         * Crea una nueva conversación directa con otro usuario
         * @param {string} targetUserId 
         */
        async createDirectConversation(targetUserId) {
            try {
                const response = await this.socketClient.emit('room:createDirect', {
                    targetUserId
                });
                
                if (response.success) {
                    // Recargar conversaciones
                    await this.loadConversations();
                    
                    return {
                        conversationId: response.conversationId,
                        existed: response.existed
                    };
                } else {
                    throw new Error(response.error || 'Error al crear conversación');
                }
                
            } catch (error) {
                console.error('[ChatManager] Error creando conversación:', error);
                throw error;
            }
        }

        /**
         * Elimina una conversación
         * @param {string} conversationId 
         * @param {boolean} permanent - Si true, elimina permanentemente (solo admins)
         */
        async deleteConversation(conversationId, permanent = false) {
            try {
                console.log('[ChatManager] Eliminando conversación:', conversationId);
                
                const url = `/api/chat/conversations/${conversationId}${permanent ? '?permanent=true' : ''}`;
                
                const response = await fetch(url, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Eliminar del estado local
                    this.state.conversations = this.state.conversations.filter(
                        c => c._id.toString() !== conversationId.toString()
                    );
                    
                    // Si era la conversación actual, limpiar
                    if (this.state.currentConversationId?.toString() === conversationId.toString()) {
                        this.state.currentConversationId = null;
                        delete this.state.messages[conversationId];
                    }
                    
                    console.log('[ChatManager] Conversación eliminada:', conversationId);
                    this._triggerCallback('onConversationUpdated', { conversationId, deleted: true });
                    
                    return { success: true };
                } else {
                    throw new Error(data.error || 'Error al eliminar conversación');
                }
                
            } catch (error) {
                console.error('[ChatManager] Error eliminando conversación:', error);
                throw error;
            }
        }

        /**
         * Actualiza el último mensaje de una conversación en el estado local
         */
        _updateConversationLastMessage(conversationId, message) {
            const conversation = this.state.conversations.find(
                c => c._id.toString() === conversationId.toString()
            );
            
            if (conversation) {
                conversation.lastMessage = {
                    content: message.content,
                    senderName: message.senderName,
                    type: message.type,
                    sentAt: message.createdAt
                };
                conversation.updatedAt = new Date();
            }
        }

        /**
         * Registra un callback para eventos de UI
         * @param {string} event - Nombre del evento
         * @param {Function} callback 
         */
        on(event, callback) {
            if (this.uiCallbacks.hasOwnProperty(event)) {
                this.uiCallbacks[event] = callback;
            } else {
                console.warn('[ChatManager] Evento desconocido:', event);
            }
        }

        /**
         * Ejecuta un callback de UI
         */
        _triggerCallback(event, data) {
            const callback = this.uiCallbacks[event];
            if (typeof callback === 'function') {
                try {
                    callback(data);
                } catch (error) {
                    console.error('[ChatManager] Error en callback de UI:', error);
                }
            }
        }

        /**
         * Obtiene el estado actual del chat
         */
        getState() {
            return {
                ...this.state,
                isConnected: this.socketClient?.isConnected || false,
                connectionStatus: this.socketClient?.getConnectionStatus() || null
            };
        }

        /**
         * Obtiene mensajes de la conversación actual
         */
        getCurrentMessages() {
            if (!this.state.currentConversationId) return [];
            return this.state.messages[this.state.currentConversationId] || [];
        }

        /**
         * Destruye la instancia y limpia recursos
         */
        destroy() {
            this.leaveConversation();
            
            if (this.socketClient) {
                this.socketClient.disconnect();
            }
            
            this.state = {
                isInitialized: false,
                currentConversationId: null,
                conversations: [],
                messages: {},
                unreadCount: 0,
                onlineUsers: new Set()
            };
            
            console.log('[ChatManager] Destruido');
        }
    }

    // Exportar al espacio global
    window.ChatManager = ChatManager;
    console.log('[ChatManager] Clase cargada correctamente');

})();
