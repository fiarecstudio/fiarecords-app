/**
 * ChatWidget.js
 * FASE 4: Widget de Chat UI (Vanilla JS)
 * 
 * Interfaz visual completa del sistema de chat.
 * Se integra con ChatManager existente.
 */

(function() {
    'use strict';

    class ChatWidget {
        constructor(chatManager) {
            this.chatManager = chatManager;
            this.isOpen = false;
            this.currentView = 'conversations'; // 'conversations' | 'chat'
            this.unreadBadge = 0;
            
            // Elementos DOM
            this.elements = {};
            
            // Typing timeout
            this.typingTimeout = null;
            this.isTyping = false;
        }

        _getCurrentUserRole() {
            try {
                const stored = JSON.parse(localStorage.getItem('user') || '{}');
                if (stored.role) return String(stored.role).toLowerCase();
            } catch (e) { /* ignore */ }

            const token = localStorage.getItem('token');
            if (!token) return null;
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return (payload.role || payload.rol || '').toLowerCase();
            } catch (e) {
                return null;
            }
        }

        _isClienteUser() {
            const role = this._getCurrentUserRole();
            return role === 'cliente' || role === 'customer' || role === 'user';
        }

        _filterConversationsForCliente(conversations) {
            if (!this._isClienteUser()) return conversations;
            return (conversations || []).filter((conv) => {
                if (conv.type === 'group') return false;
                return conv.type === 'direct' || conv.type === 'support';
            });
        }

        /**
         * Inicializa el widget y crea el DOM
         */
        init() {
            if (!this.chatManager) {
                console.error('[ChatWidget] ChatManager requerido');
                return;
            }

            this.createDOM();
            this.attachEventListeners();
            this.setupChatManagerCallbacks();
            
            console.log('[ChatWidget] Widget inicializado');
        }

        /**
         * Crea la estructura DOM del widget
         */
        createDOM() {
            // Contenedor principal
            const container = document.createElement('div');
            container.className = 'chat-widget';
            container.id = 'chat-widget';
            
            // Botón flotante
            const button = document.createElement('button');
            button.className = 'chat-widget-button';
            button.id = 'chat-toggle-btn';
            button.type = 'button';
            button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            `;
            
            // Badge numérico de no leídos
            const badge = document.createElement('span');
            badge.className = 'chat-widget-badge';
            badge.style.display = 'none';
            badge.textContent = '0';
            button.appendChild(badge);

            // Puntito rojo cuando el chat está cerrado y llega un mensaje ajeno
            const unreadDot = document.createElement('span');
            unreadDot.id = 'global-unread-badge';
            unreadDot.className = 'badge bg-danger rounded-pill chat-unread-badge d-none';
            unreadDot.style.position = 'absolute';
            unreadDot.style.top = '-5px';
            unreadDot.style.right = '-5px';
            unreadDot.style.padding = '5px 8px';
            unreadDot.style.fontSize = '10px';
            unreadDot.textContent = '!';
            unreadDot.setAttribute('aria-label', 'Mensajes nuevos');
            button.appendChild(unreadDot);
            
            // Contenedor del chat
            const chatContainer = document.createElement('div');
            chatContainer.className = 'chat-container';
            chatContainer.id = 'chat-container';
            
            // Header
            const header = this.createHeader();
            
            // Área de contenido (conversaciones o mensajes)
            const content = document.createElement('div');
            content.className = 'chat-content';
            content.id = 'chat-content';
            content.style.flex = '1';
            content.style.display = 'flex';
            content.style.flexDirection = 'column';
            content.style.overflow = 'hidden';
            
            // Input (solo visible en vista de chat)
            const inputArea = this.createInputArea();
            inputArea.id = 'chat-input-area';
            inputArea.style.display = 'none';
            
            chatContainer.appendChild(header);
            chatContainer.appendChild(content);
            chatContainer.appendChild(inputArea);
            
            container.appendChild(button);
            container.appendChild(chatContainer);
            
            document.body.appendChild(container);
            
            // Guardar referencias
            this.elements = {
                container,
                button,
                badge,
                unreadDot,
                chatContainer,
                header,
                content,
                inputArea
            };
        }

        _getCurrentUserId() {
            if (typeof window.getCurrentUserId === 'function') {
                return window.getCurrentUserId();
            }
            try {
                const stored = JSON.parse(localStorage.getItem('user') || '{}');
                if (stored.id) return stored.id;
            } catch (e) { /* ignore */ }
            const token = localStorage.getItem('token');
            if (!token) return null;
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.id || payload._id || payload.userId || null;
            } catch (e) {
                return null;
            }
        }

        _isMessageFromCurrentUser(message) {
            if (!message) return true;
            const currentUserId = this._getCurrentUserId();
            if (!currentUserId) return false;
            const senderId = message.senderId || message.sender?._id || message.sender;
            if (!senderId) return false;
            return senderId.toString() === currentUserId.toString();
        }

        _isPageHidden() {
            if (typeof document === 'undefined') {
                return false;
            }
            return document.hidden || document.visibilityState === 'hidden';
        }

        showUnreadDot() {
            if (this.elements.unreadDot) {
                this.elements.unreadDot.classList.remove('d-none');
            }
            const globalBadge = document.getElementById('global-unread-badge');
            if (globalBadge) {
                globalBadge.classList.remove('d-none');
            }
        }

        hideUnreadDot() {
            if (this.elements.unreadDot) {
                this.elements.unreadDot.classList.add('d-none');
            }
            const globalBadge = document.getElementById('global-unread-badge');
            if (globalBadge) {
                globalBadge.classList.add('d-none');
            }
        }

        _notifyIncomingMessage(message) {
            try {
                console.log('[DEBUG NOTIFICACION] Evaluando mensaje:', message);
                console.log('[DEBUG NOTIFICACION] Estado: isOpen =', this.isOpen, '| hidden =', typeof document !== 'undefined' ? document.hidden : 'no-document');

                const currentUserId = this._getCurrentUserId();
                const senderId = message?.senderId || message?.sender?._id || message?.sender;
                const isOwnMessage = currentUserId && senderId && currentUserId.toString() === senderId.toString();
                const isChatClosed = !this.isOpen;
                const isPageHidden = typeof document !== 'undefined' ? document.hidden : false;
                const shouldNotify = !isOwnMessage && (isChatClosed || isPageHidden);

                console.log('[DEBUG NOTIFICACION] isOwnMessage =', isOwnMessage, '| isChatClosed =', isChatClosed, '| isPageHidden =', isPageHidden, '| shouldNotify =', shouldNotify);

                if (shouldNotify) {
                    console.log('[DEBUG NOTIFICACION] Activando punto rojo y sonido...');

                    const badge = document?.getElementById?.('global-unread-badge');
                    if (badge) {
                        badge.classList.remove('d-none');
                    } else {
                        console.error('[DEBUG NOTIFICACION] No se encontró el elemento #global-unread-badge en el DOM.');
                    }

                    if (typeof window?.reproducirSonidoChat === 'function') {
                        window.reproducirSonidoChat();
                    } else {
                        console.error('[DEBUG NOTIFICACION] Fallo crítico: window.reproducirSonidoChat no está definida.');
                    }
                }

            } catch (error) {
                console.error('[DEBUG NOTIFICACION] Error de ejecución en notificaciones:', error);
            }
        }

        /**
         * Crea el header del chat
         */
        createHeader() {
            const header = document.createElement('div');
            header.className = 'chat-header';
            header.innerHTML = `
                <div class="chat-header-info">
                    <div class="chat-header-avatar">💬</div>
                    <div>
                        <h3 class="chat-header-title" id="chat-header-title">Chat</h3>
                        <div class="chat-header-status">En línea</div>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <button class="chat-header-btn" id="chat-back-btn" style="display:none" title="Volver">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <button class="chat-header-btn" id="chat-close-btn" title="Cerrar">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            `;
            return header;
        }

        /**
         * Crea el área de input
         */
        createInputArea() {
            const area = document.createElement('div');
            area.className = 'chat-input-container';
            area.innerHTML = `
                <div class="chat-typing" id="chat-typing" style="display:none">
                    <span>alguien está escribiendo</span>
                    <div class="chat-typing-dots">
                        <span class="chat-typing-dot"></span>
                        <span class="chat-typing-dot"></span>
                        <span class="chat-typing-dot"></span>
                    </div>
                </div>
                <div class="chat-input-wrapper">
                    <textarea 
                        class="chat-input" 
                        id="chat-input" 
                        placeholder="Escribe un mensaje..."
                        rows="1"
                    ></textarea>
                    <button class="chat-send-btn" id="chat-send-btn">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                        </svg>
                    </button>
                </div>
            `;
            return area;
        }

        /**
         * Adjunta event listeners
         */
        attachEventListeners() {
            // Botón flotante - toggle
            this.elements.button.addEventListener('click', () => {
                this.toggle();
            });

            // Botón cerrar
            const closeBtn = document.getElementById('chat-close-btn');
            closeBtn.addEventListener('click', () => {
                this.close();
            });

            // Botón volver
            const backBtn = document.getElementById('chat-back-btn');
            backBtn.addEventListener('click', () => {
                this.showConversationsList();
            });

            // Input de mensaje
            const input = document.getElementById('chat-input');
            const sendBtn = document.getElementById('chat-send-btn');

            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            input.addEventListener('input', () => {
                this.handleTyping();
                // Auto-resize
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
            });

            sendBtn.addEventListener('click', () => {
                this.sendMessage();
            });

            // Cerrar al hacer click fuera (opcional)
            document.addEventListener('click', (e) => {
                if (this.isOpen && 
                    !this.elements.container.contains(e.target) &&
                    !e.target.closest('.chat-notification')) {
                    // this.close(); // Descomentar si quieres cerrar al click fuera
                }
            });
        }

        /**
         * Configura callbacks del ChatManager
         */
        setupChatManagerCallbacks() {
            this.chatManager.on('onConnected', () => {
                this.renderConversationsList();
                // Actualizar badge al conectar
                this.updateBadge();
                // Solicitar permiso para notificaciones
                this.requestNotificationPermission();
            });

            this.chatManager.on('onMessageReceived', (data) => {
                const { message } = data;
                const currentConvId = this.chatManager.state.currentConversationId;

                this._notifyIncomingMessage(message);
                
                // Si estamos en la conversación, renderizar el mensaje
                if (currentConvId && message.conversationId.toString() === currentConvId.toString()) {
                    this.renderMessage(message);
                    // El auto-scroll ya se maneja dentro de renderMessage
                    
                    // Marcar como leído
                    this.chatManager.markAsRead(currentConvId, [message._id]);
                } else {
                    // Mostrar notificación flotante
                    this.showNotification(message);
                    // Mostrar notificación del navegador
                    this.showBrowserNotification(message);
                    // Actualizar badge
                    this.updateBadge();
                }
                
                // Actualizar preview en lista
                this.updateConversationPreview(message.conversationId, message);
            });

            this.chatManager.on('onConversationUpdated', () => {
                // Solo renderizar lista si NO estamos en una conversación activa
                if (this.currentView !== 'chat') {
                    this.renderConversationsList();
                } else {
                    // Si estamos en chat, solo actualizar el preview de la conversación activa
                    const currentConv = this.chatManager.state.conversations.find(
                        c => c._id.toString() === this.chatManager.state.currentConversationId?.toString()
                    );
                    if (currentConv && currentConv.lastMessage) {
                        this.updateConversationPreview(currentConv._id, currentConv.lastMessage);
                    }
                }
                // Actualizar badge de notificaciones
                this.updateBadge();
            });

            this.chatManager.on('onUserOnline', (data) => {
                // Actualizar indicador de estado si estamos en la conversación
                if (this.currentView === 'chat') {
                    const conversation = this.chatManager.state.conversations.find(
                        c => c._id.toString() === this.chatManager.state.currentConversationId?.toString()
                    );
                    if (conversation) {
                        this._updateParticipantStatus(conversation);
                    }
                }
            });

            this.chatManager.on('onUserOffline', (data) => {
                // Actualizar indicador de estado si estamos en la conversación
                if (this.currentView === 'chat') {
                    const conversation = this.chatManager.state.conversations.find(
                        c => c._id.toString() === this.chatManager.state.currentConversationId?.toString()
                    );
                    if (conversation) {
                        this._updateParticipantStatus(conversation);
                    }
                }
            });

            // Typing indicator
            this.chatManager.on('onTyping', (data) => {
                if (this.currentView === 'chat' && 
                    data.conversationId.toString() === this.chatManager.state.currentConversationId?.toString()) {
                    if (data.isTyping) {
                        this.updateTypingIndicator(data.username + ' está escribiendo...', true);
                        // Auto-ocultar después de 5 segundos si no llega stop
                        clearTimeout(this.typingIndicatorTimeout);
                        this.typingIndicatorTimeout = setTimeout(() => {
                            this.updateTypingIndicator('', false);
                        }, 5000);
                    } else {
                        this.updateTypingIndicator('', false);
                        clearTimeout(this.typingIndicatorTimeout);
                    }
                }
            });

            this.chatManager.on('onError', (error) => {
                console.error('[ChatWidget] Error:', error);
                this.showError(error.message);
            });
        }

        /**
         * Abre/cierra el widget
         */
        toggle() {
            if (this.isOpen) {
                this.close();
            } else {
                this.open();
            }
        }

        /**
         * Abre el widget
         */
        open() {
            this.isOpen = true;
            this.elements.chatContainer.classList.add('active');
            this.hideUnreadDot();
            
            // Si no hay conversación seleccionada, mostrar lista
            if (!this.chatManager.state.currentConversationId) {
                this.showConversationsList();
            } else {
                this.showChatView();
            }
            
            // Actualizar lista
            this.renderConversationsList();
            
            // Actualizar badge (se oculta automáticamente si no hay mensajes)
            this.updateBadge();
        }

        /**
         * Cierra el widget
         */
        close() {
            this.isOpen = false;
            this.elements.chatContainer.classList.remove('active');
            
            // Dejar conversación pero mantener conexión
            this.chatManager.leaveConversation();
            
            // Actualizar badge para mostrar mensajes nuevos
            this.updateBadge();
        }

        /**
         * Muestra la lista de conversaciones
         */
        showConversationsList() {
            this.currentView = 'conversations';
            this.chatManager.leaveConversation();
            
            document.getElementById('chat-header-title').textContent = 'Conversaciones';
            document.getElementById('chat-back-btn').style.display = 'none';
            document.getElementById('chat-input-area').style.display = 'none';
            document.querySelector('.chat-header-status').style.display = 'flex';
            
            this.renderConversationsList();
        }

        /**
         * Muestra la vista de chat individual
         */
        showChatView() {
            this.currentView = 'chat';
            
            const conversation = this.chatManager.state.conversations.find(
                c => c._id.toString() === this.chatManager.state.currentConversationId?.toString()
            );
            
            if (conversation) {
                const currentUserId = this.chatManager._getCurrentUserId?.() || this.chatManager.socketClient?.socket?.user?.id;
                const contact = conversation.participants?.find(participant => {
                    const participantId = participant.userId?.toString?.() || participant._id?.toString?.() || participant.id?.toString?.();
                    return participantId && participantId !== currentUserId?.toString();
                }) || conversation.participants?.[0] || null;

                const contactName = contact?.nombre || contact?.username || contact?.name || conversation.title || 'Chat';
                document.getElementById('chat-header-title').textContent = contactName;
                
                // Actualizar estado del otro participante
                this._updateParticipantStatus(conversation);
            }
            
            document.getElementById('chat-back-btn').style.display = 'flex';
            document.getElementById('chat-input-area').style.display = 'block';
            document.querySelector('.chat-header-status').style.display = 'flex';
            
            this.renderMessages();
        }

        /**
         * Actualiza el indicador de estado del participante
         */
        _updateParticipantStatus(conversation) {
            const statusEl = document.querySelector('.chat-header-status');
            if (!statusEl) return;
            
            // Encontrar el otro participante (no el usuario actual)
            const currentUserId = this.chatManager.socketClient?.socket?.user?.id;
            const otherParticipant = conversation.participants?.find(
                p => p.userId?.toString() !== currentUserId?.toString()
            );
            
            if (otherParticipant) {
                const isOnline = this.chatManager.state.onlineUsers.has(otherParticipant.userId?.toString());
                statusEl.textContent = isOnline ? 'En línea' : 'Desconectado';
                statusEl.className = `chat-header-status ${isOnline ? 'online' : 'offline'}`;
            } else {
                statusEl.textContent = 'Chat';
                statusEl.className = 'chat-header-status';
            }
        }

        /**
         * Renderiza la lista de conversaciones
         */
        renderConversationsList() {
            const content = this.elements.content;
            const isCliente = this._isClienteUser();
            const conversations = this._filterConversationsForCliente(this.chatManager.state.conversations);
            
            // Contenedor principal con botón de nueva conversación
            const container = document.createElement('div');
            container.className = 'chat-conversations-container';
            
            // Botón nueva conversación
            const newConvBtn = document.createElement('button');
            newConvBtn.className = 'chat-new-conversation-btn';
            newConvBtn.innerHTML = `
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                <span>${isCliente ? 'Contactar al equipo' : 'Nueva conversación'}</span>
            `;
            newConvBtn.addEventListener('click', () => this.showNewConversationModal());
            container.appendChild(newConvBtn);
            
            if (conversations.length === 0) {
                const emptyState = document.createElement('div');
                emptyState.className = 'chat-empty';
                emptyState.innerHTML = `
                    <div class="chat-empty-icon">💬</div>
                    <h4 class="chat-empty-title">No hay conversaciones</h4>
                    <p class="chat-empty-text">${isCliente ? 'Contacta al equipo de tu empresa para recibir ayuda' : 'Haz clic en "Nueva conversación" para empezar'}</p>
                `;
                container.appendChild(emptyState);
                content.innerHTML = '';
                content.appendChild(container);
                return;
            }
            
            const list = document.createElement('div');
            list.className = 'chat-conversations';
            
            conversations.forEach(conv => {
                const item = document.createElement('div');
                item.className = 'chat-conversation-item';
                item.dataset.id = conv._id;
                
                const isActive = this.chatManager.state.currentConversationId?.toString() === conv._id.toString();
                if (isActive) item.classList.add('active');
                
                const typeIcon = conv.type === 'support' ? '🎫' : conv.type === 'group' ? '👥' : '👤';
                const typeLabel = conv.type === 'support' ? 'Ticket' : conv.type === 'group' ? 'Grupo' : 'Chat';
                const time = conv.lastMessage?.sentAt ? this.formatTime(conv.lastMessage.sentAt) : '';
                const preview = conv.lastMessage?.content || 'Sin mensajes';
                const unread = conv.unreadCount > 0 ? `<span class="chat-conversation-badge">${conv.unreadCount}</span>` : '';
                const deleteBtnHtml = isCliente
                    ? ''
                    : '<button class="chat-conversation-delete" title="Eliminar conversación">🗑️</button>';
                
                item.innerHTML = `
                    <div class="chat-conversation-avatar ${conv.type}" title="${typeLabel}">${typeIcon}</div>
                    <div class="chat-conversation-info">
                        <h4 class="chat-conversation-name">${conv.title || 'Sin título'} <small style="font-weight:normal;color:#9ca3af;font-size:11px;">${typeLabel}</small></h4>
                        <p class="chat-conversation-preview">${this.escapeHtml(preview)}</p>
                    </div>
                    <div class="chat-conversation-meta">
                        <div class="chat-conversation-time">${time}</div>
                        ${unread}
                    </div>
                    ${deleteBtnHtml}
                `;
                
                // Click en la conversación para seleccionarla
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.chat-conversation-delete')) return;
                    this.selectConversation(conv._id);
                });
                
                // Click en botón de eliminar (solo staff)
                const deleteBtn = item.querySelector('.chat-conversation-delete');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.confirmDeleteConversation(conv._id, conv.title);
                    });
                }
                
                list.appendChild(item);
            });
            
            container.appendChild(list);
            content.innerHTML = '';
            content.appendChild(container);
        }

        /**
         * Muestra modal para crear nueva conversación
         */
        async showNewConversationModal() {
            console.log('[ChatWidget] 📋 Abriendo modal de nueva conversación...');
            try {
                const isClient = this._isClienteUser();
                const users = await this.loadUsersForChat();
                console.log('[ChatWidget] Usuarios cargados:', users.length, users.map(u => u.nombre || u.username));

                if (isClient && users.length === 0) {
                    this.showError('No hay personal de soporte disponible en tu empresa');
                    return;
                }
                
                // Crear modal
                const modal = document.createElement('div');
                modal.className = 'chat-modal-overlay';
                modal.innerHTML = `
                    <div class="chat-modal">
                        <div class="chat-modal-header">
                            <h3>${isClient ? 'Contactar al equipo' : 'Nueva conversación'}</h3>
                            <button class="chat-modal-close" id="chat-modal-close">&times;</button>
                        </div>
                        <div class="chat-modal-body">
                            <p class="chat-modal-subtitle">${isClient ? 'Selecciona con quién de tu empresa quieres hablar:' : 'Selecciona un usuario para iniciar chat:'}</p>
                            <div class="chat-users-list">
                                ${users.map(user => `
                                    <div class="chat-user-item" data-user-id="${user._id}" data-user-name="${this.escapeHtml(user.nombre)}">
                                        <div class="chat-user-avatar">${(user.nombre || user.username || 'U').charAt(0).toUpperCase()}</div>
                                        <div class="chat-user-info">
                                            <h4>${this.escapeHtml(user.nombre || user.username || 'Usuario')}</h4>
                                            <span class="chat-user-role">${user.role || 'Equipo'}</span>
                                        </div>
                                        <div class="chat-user-status ${user.isOnline ? 'online' : ''}">
                                            <span class="status-dot"></span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                // Event listeners
                document.getElementById('chat-modal-close').addEventListener('click', () => {
                    modal.remove();
                });
                
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) modal.remove();
                });
                
                // Seleccionar usuario
                console.log('[ChatWidget] Agregando listeners a', modal.querySelectorAll('.chat-user-item').length, 'usuarios');
                modal.querySelectorAll('.chat-user-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        const userId = item.dataset.userId;
                        const userName = item.dataset.userName;
                        console.log('[ChatWidget] Usuario seleccionado:', userId, userName);
                        modal.remove();
                        await this.createConversation(userId, userName);
                    });
                });
                
            } catch (error) {
                console.error('[ChatWidget] Error mostrando modal:', error);
                this.showError('Error al cargar usuarios');
            }
        }

        /**
         * Muestra modal para cliente contactar a soporte
         */
        async showSupportContactModal() {
            console.log('[ChatWidget] 📞 Mostrando modal de contacto a soporte...');
            
            const modal = document.createElement('div');
            modal.className = 'chat-modal-overlay';
            modal.innerHTML = `
                <div class="chat-modal">
                    <div class="chat-modal-header">
                        <h3>🎫 Contactar a Soporte</h3>
                        <button class="chat-modal-close" id="chat-modal-close">&times;</button>
                    </div>
                    <div class="chat-modal-body">
                        <p class="chat-modal-subtitle">¿En qué podemos ayudarte?</p>
                        <div class="chat-support-form">
                            <div class="chat-form-group">
                                <label>Asunto</label>
                                <input type="text" id="support-subject" placeholder="Ej: Consulta sobre mi proyecto" class="chat-input">
                            </div>
                            <div class="chat-form-group">
                                <label>Mensaje</label>
                                <textarea id="support-message" placeholder="Describe tu consulta..." rows="4" class="chat-input"></textarea>
                            </div>
                            <button id="btn-send-support" class="chat-btn-primary" style="width:100%;margin-top:10px;">
                                Enviar a Soporte
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Event listeners
            document.getElementById('chat-modal-close').addEventListener('click', () => {
                modal.remove();
            });
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
            
            // Enviar mensaje a soporte
            document.getElementById('btn-send-support').addEventListener('click', async () => {
                const subject = document.getElementById('support-subject').value.trim();
                const message = document.getElementById('support-message').value.trim();
                
                if (!subject || !message) {
                    alert('Por favor completa el asunto y el mensaje');
                    return;
                }
                
                modal.remove();
                await this.createSupportConversation(subject, message);
            });
        }

        /**
         * Crea una conversación de soporte (cliente → admin/empleado)
         */
        async createSupportConversation(subject, message) {
            console.log('[ChatWidget] 🎫 Creando conversación de soporte:', subject);
            try {
                const token = localStorage.getItem('token');
                let currentUserName = 'Yo';
                if (token) {
                    try {
                        const payload = JSON.parse(atob(token.split('.')[1]));
                        currentUserName = payload.nombre || payload.username || payload.name || 'Yo';
                    } catch (e) {}
                }
                
                // Crear conversación tipo support (ticket)
                const response = await fetch('/api/chat/conversations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        type: 'support',
                        title: subject,
                        message: message,
                        isSupportTicket: true
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    console.log('[ChatWidget] Ticket de soporte creado:', data.conversation._id);
                    
                    // Unirse a la conversación y mostrarla
                    await this.chatManager.joinConversation(data.conversation._id);
                    this.showChatView();
                    
                    // Recargar lista
                    await this.chatManager.loadConversations();
                    this.renderConversationsList();
                    
                    // Mostrar mensaje de confirmación
                    this.showNotification('Mensaje enviado a soporte. Te responderemos pronto.');
                } else {
                    this.showError(data.error || 'Error al crear ticket');
                }
            } catch (error) {
                console.error('[ChatWidget] Error creando ticket:', error);
                this.showError('Error al contactar soporte');
            }
        }

        /**
         * Carga usuarios disponibles para chat
         */
        async loadUsersForChat() {
            try {
                const response = await fetch('/api/chat/users', {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Filtrar usuario actual usando JWT
                    const currentUserId = window.getCurrentUserId?.();
                    console.log('[ChatWidget] Filtrando usuario actual:', currentUserId);
                    const filtered = data.users.filter(u => u._id.toString() !== currentUserId?.toString());
                    console.log('[ChatWidget] Usuarios filtrados:', filtered.length);
                    return filtered;
                }
                
                return [];
            } catch (error) {
                console.error('[ChatWidget] Error cargando usuarios:', error);
                return [];
            }
        }

        /**
         * Crea una nueva conversación directa
         */
        async createConversation(userId, userName) {
            console.log('[ChatWidget] ➕ Creando conversación con usuario:', userId, userName);
            try {
                // Obtener nombre del usuario actual desde JWT
                const token = localStorage.getItem('token');
                let currentUserName = 'Yo';
                if (token) {
                    try {
                        const payload = JSON.parse(atob(token.split('.')[1]));
                        currentUserName = payload.nombre || payload.username || payload.name || 'Yo';
                    } catch (e) {}
                }
                console.log('[ChatWidget] Usuario actual:', currentUserName);
                
                const response = await fetch('/api/chat/conversations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        type: 'direct',
                        participantIds: [userId],
                        title: userName
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    console.log('[ChatWidget] Conversación creada:', data.conversation._id);
                    
                    // Unirse a la conversación y mostrarla
                    await this.chatManager.joinConversation(data.conversation._id);
                    this.showChatView();
                    
                    // Recargar lista
                    await this.chatManager.loadConversations();
                    this.renderConversationsList();
                } else {
                    this.showError(data.error || 'Error al crear conversación');
                }
            } catch (error) {
                console.error('[ChatWidget] Error creando conversación:', error);
                this.showError('Error al crear conversación');
            }
        }

        /**
         * Selecciona una conversación
         */
        async selectConversation(conversationId) {
            try {
                await this.chatManager.joinConversation(conversationId);
                this.showChatView();
            } catch (error) {
                this.showError('Error al abrir conversación');
            }
        }

        /**
         * Renderiza los mensajes de la conversación actual
         */
        renderMessages() {
            const content = this.elements.content;
            const messages = this.chatManager.getCurrentMessages();
            const currentUserId = window.getCurrentUserId?.() || this.chatManager.socketClient?.socket?.user?.id;
            
            const container = document.createElement('div');
            container.className = 'chat-messages';
            container.id = 'chat-messages';
            
            if (messages.length === 0) {
                container.innerHTML = `
                    <div class="chat-empty" style="height:100%;justify-content:center;">
                        <div class="chat-empty-icon">💬</div>
                        <p class="chat-empty-text">Envía el primer mensaje</p>
                    </div>
                `;
            } else {
                messages.forEach(msg => {
                    const isOwn = msg.senderId?.toString() === currentUserId?.toString();
                    const isSystem = msg.type === 'system' || msg.isSystemMessage;
                    const msgEl = this.createMessageElement(msg, isOwn, isSystem);
                    container.appendChild(msgEl);
                });
            }
            
            content.innerHTML = '';
            content.appendChild(container);
            
            this.scrollToBottom();
        }

        /**
         * Crea un elemento de mensaje
         */
        createMessageElement(message, isOwn, isSystem) {
            const div = document.createElement('div');
            div.className = `chat-message ${isOwn ? 'own' : 'other'} ${isSystem ? 'system' : ''}`;
            
            const time = this.formatTime(message.createdAt || message.sentAt);
            const readStatus = isOwn ? this.getReadStatus(message) : '';
            
            div.innerHTML = `
                <div class="chat-message-bubble">
                    ${!isOwn && !isSystem ? `<div class="chat-message-sender">${this.escapeHtml(message.senderName)}</div>` : ''}
                    ${this.escapeHtml(message.content)}
                </div>
                <div class="chat-message-meta">
                    <span>${time}</span>
                    ${readStatus}
                </div>
            `;
            
            return div;
        }

        /**
         * Renderiza un mensaje nuevo con auto-scroll inteligente
         */
        renderMessage(message) {
            const container = document.getElementById('chat-messages');
            if (!container) return;
            
            const currentUserId = window.getCurrentUserId?.() || this.chatManager.socketClient?.socket?.user?.id;
            const isOwn = message.senderId?.toString() === currentUserId?.toString();
            const isSystem = message.type === 'system' || message.isSystemMessage;
            
            // Verificar si estaba cerca del final antes de agregar el mensaje
            const shouldScroll = this.isNearBottom(150) || isOwn;
            
            const msgEl = this.createMessageElement(message, isOwn, isSystem);
            container.appendChild(msgEl);
            
            // Auto-scroll solo si el usuario estaba cerca del final o es mensaje propio
            if (shouldScroll) {
                this.scrollToBottom(true);
            }
        }

        /**
         * Envía un mensaje
         */
        async sendMessage() {
            const input = document.getElementById('chat-input');
            const content = input.value.trim();
            
            if (!content) return;
            
            try {
                input.value = '';
                input.style.height = 'auto';
                
                await this.chatManager.sendMessage(content);
                
                // Dejar de mostrar "escribiendo"
                this.stopTyping();
                
            } catch (error) {
                this.showError('Error al enviar mensaje');
            }
        }

        /**
         * Maneja el evento de typing
         */
        handleTyping() {
            if (this.isTyping) return;
            
            this.isTyping = true;
            
            // Emitir typing al servidor
            if (this.chatManager.state.currentConversationId) {
                this.chatManager.socketClient.emit('presence:typing', {
                    conversationId: this.chatManager.state.currentConversationId,
                    isTyping: true
                }).catch(() => {}); // Ignorar errores
            }
            
            // Dejar de escribir después de 3 segundos
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                this.stopTyping();
            }, 3000);
        }

        /**
         * Deja de mostrar typing
         */
        stopTyping() {
            if (!this.isTyping) return;
            
            this.isTyping = false;
            
            if (this.chatManager.state.currentConversationId) {
                this.chatManager.socketClient.emit('presence:typing', {
                    conversationId: this.chatManager.state.currentConversationId,
                    isTyping: false
                }).catch(() => {});
            }
        }

        /**
         * Confirma y elimina una conversación
         */
        async confirmDeleteConversation(conversationId, title) {
            const convTitle = title || 'Sin título';

            const runDelete = async () => {
                try {
                    await this.chatManager.deleteConversation(conversationId);
                    this.renderConversationsList();

                    if (this.chatManager.state.currentConversationId?.toString() === conversationId.toString()) {
                        this.showConversationsList();
                    }

                    console.log('[ChatWidget] Conversación eliminada:', conversationId);
                } catch (error) {
                    console.error('[ChatWidget] Error eliminando conversación:', error);
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            title: 'Error',
                            text: error.message || 'No se pudo eliminar la conversación',
                            icon: 'error',
                            background: '#111',
                            color: '#fff'
                        });
                    } else {
                        alert('Error al eliminar conversación: ' + error.message);
                    }
                }
            };

            if (typeof Swal === 'undefined') {
                const confirmed = confirm(`¿Eliminar conversación "${convTitle}"?`);
                if (confirmed) await runDelete();
                return;
            }

            Swal.fire({
                title: '¿Eliminar conversación?',
                text: `"${convTitle}" desaparecerá de tu lista. Esta acción no se puede deshacer.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#deff9a',
                cancelButtonColor: '#333',
                confirmButtonText: '<span style="color: black;">Sí, eliminar</span>',
                cancelButtonText: 'Cancelar',
                background: '#111',
                color: '#fff'
            }).then((result) => {
                if (result.isConfirmed) {
                    runDelete();
                }
            });
        }

        /**
         * Actualiza el indicador de typing
         */
        updateTypingIndicator(text, show) {
            const typingEl = document.getElementById('chat-typing');
            if (!typingEl) return;
            
            if (show) {
                typingEl.querySelector('span').textContent = text;
                typingEl.style.display = 'flex';
            } else {
                typingEl.style.display = 'none';
            }
        }

        /**
         * Actualiza el badge de notificaciones
         */
        updateBadge() {
            const totalUnread = this.chatManager.state.unreadCount || 0;
            this.elements.badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
            this.elements.badge.style.display = totalUnread > 0 && !this.isOpen ? 'flex' : 'none';

            if (this.isOpen) {
                this.hideUnreadDot();
            } else if (totalUnread > 0) {
                this.showUnreadDot();
            }
            
            // Animación de pulso cuando hay mensajes nuevos
            if (totalUnread > 0 && !this.isOpen) {
                this.elements.badge.classList.add('chat-badge-pulse');
                setTimeout(() => {
                    this.elements.badge?.classList.remove('chat-badge-pulse');
                }, 2000);
            }
            
            console.log('[ChatWidget] Badge actualizado:', totalUnread);
        }
        
        /**
         * Muestra notificación del navegador
         */
        showBrowserNotification(message) {
            // Solo si el usuario dio permiso y el chat no está abierto
            if (!this.isOpen && 'Notification' in window && Notification.permission === 'granted') {
                const notification = new Notification('💬 Nuevo mensaje', {
                    body: `${message.senderName}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
                    icon: '/img/fialogo.png',
                    badge: '/img/fialogo.png',
                    tag: message.conversationId,
                    requireInteraction: false
                });
                
                notification.onclick = () => {
                    window.focus();
                    this.open();
                    this.openConversation(message.conversationId);
                    notification.close();
                };
                
                // Cerrar automáticamente después de 5 segundos
                setTimeout(() => notification.close(), 5000);
            }
        }
        
        /**
         * Solicita permiso para notificaciones del navegador
         */
        requestNotificationPermission() {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(permission => {
                    console.log('[ChatWidget] Permiso de notificación:', permission);
                });
            }
        }

        /**
         * Muestra una notificación flotante
         * Puede recibir un objeto mensaje o un string
         */
        showNotification(message) {
            // Crear notificación
            const notif = document.createElement('div');
            notif.className = 'chat-notification';
            
            // Si es string, mostrar como mensaje de confirmación
            if (typeof message === 'string') {
                notif.innerHTML = `
                    <div class="chat-notification-avatar">✅</div>
                    <div class="chat-notification-content">
                        <p class="chat-notification-text">${this.escapeHtml(message)}</p>
                    </div>
                `;
            } else {
                // Es un objeto mensaje
                notif.innerHTML = `
                    <div class="chat-notification-avatar">💬</div>
                    <div class="chat-notification-content">
                        <h4 class="chat-notification-title">${this.escapeHtml(message.senderName)}</h4>
                        <p class="chat-notification-text">${this.escapeHtml(message.content.substring(0, 50))}${message.content.length > 50 ? '...' : ''}</p>
                    </div>
                `;
                
                notif.addEventListener('click', () => {
                    this.selectConversation(message.conversationId);
                    notif.remove();
                });
            }
            
            document.body.appendChild(notif);
            
            // Auto-remove después de 5 segundos
            setTimeout(() => {
                notif.remove();
            }, 5000);
        }

        /**
         * Actualiza el preview de una conversación
         */
        updateConversationPreview(conversationId, message) {
            const item = this.elements.content.querySelector(`[data-id="${conversationId}"]`);
            if (item) {
                const preview = item.querySelector('.chat-conversation-preview');
                const time = item.querySelector('.chat-conversation-time');
                
                if (preview) preview.textContent = message.content.substring(0, 50);
                if (time) time.textContent = this.formatTime(message.createdAt);
                
                // Mover al principio de la lista
                item.parentElement.prepend(item);
            }
        }

        /**
         * Scroll al final de mensajes con animación suave
         */
        scrollToBottom(smooth = true) {
            const container = document.getElementById('chat-messages');
            if (container) {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: smooth ? 'smooth' : 'auto'
                });
            }
        }

        /**
         * Verifica si el usuario está cerca del final (para auto-scroll inteligente)
         */
        isNearBottom(threshold = 100) {
            const container = document.getElementById('chat-messages');
            if (!container) return true;
            
            const scrollPosition = container.scrollTop + container.clientHeight;
            const scrollHeight = container.scrollHeight;
            return scrollHeight - scrollPosition < threshold;
        }

        /**
         * Muestra error
         */
        showError(message) {
            console.error('[ChatWidget]', message);
            // Podría integrarse con SweetAlert2 si está disponible
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: message,
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000
                });
            }
        }

        /**
         * Formatea hora
         */
        formatTime(date) {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
        }

        /**
         * Escapa HTML
         */
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        /**
         * Obtiene estado de lectura
         */
        getReadStatus(message) {
            if (!message.readBy || message.readBy.length === 0) {
                return '<span>✓</span>';
            }
            return '<span style="color:#22c55e">✓✓</span>';
        }
    }

    // Exportar
    window.ChatWidget = ChatWidget;
    if (window.Logger) Logger.debug('ChatWidget', 'Clase cargada');

})();
