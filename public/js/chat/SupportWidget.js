/**
 * SupportWidget.js
 * FASE 5: Widget de Soporte al Cliente (Visitantes)
 * 
 * Widget de chat para clientes/visitantes sin necesidad de login completo.
 * Permite crear tickets de soporte que llegan a los empleados/admin de la empresa.
 * 
 * REGLA DE ORO: Aislamiento multi-tenant estricto por empresaId
 */

(function() {
    'use strict';

    class SupportWidget {
        constructor(options = {}) {
            // Configuración
            this.empresaId = options.empresaId || this._detectEmpresaId();
            this.apiUrl = options.apiUrl || window.API_URL || 'http://localhost:5000';
            this.socket = null;
            this.isOpen = false;
            this.isConnected = false;
            
            // Estado del chat
            this.ticketId = localStorage.getItem('support_ticket_id') || null;
            this.visitorId = localStorage.getItem('support_visitor_id') || null;
            this.visitorName = localStorage.getItem('support_visitor_name') || '';
            this.visitorEmail = localStorage.getItem('support_visitor_email') || '';
            this.messages = [];
            
            // Typing
            this.typingTimeout = null;
            this.isTyping = false;
            
            // Callbacks
            this.onMessageReceived = options.onMessageReceived || (() => {});
            this.onTicketCreated = options.onTicketCreated || (() => {});
            
            console.log('[SupportWidget] Inicializado para empresa:', this.empresaId);
        }

        /**
         * Detecta empresaId desde múltiples fuentes
         * IMPORTANTE: Para visitantes sin token, solo usar support_empresa_id
         * para evitar confusión con sesiones previas de empleados/clientes
         */
        _detectEmpresaId() {
            const token = localStorage.getItem('token');
            
            // Si hay token (usuario autenticado), buscar en todas las fuentes
            if (token) {
                // 1. Intentar desde token JWT
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    const empresaId = payload.empresaId || payload.empresa_id || payload.tenantId || payload.empresa;
                    if (empresaId) return empresaId;
                } catch (e) {}
                
                // 2. Intentar desde localStorage de la app
                const storedEmpresaId = localStorage.getItem('empresaId') || localStorage.getItem('currentEmpresaId');
                if (storedEmpresaId) return storedEmpresaId;
            }
            
            // Para visitantes SIN token: SOLO usar support_empresa_id específico
            // No usar empresaId de sesiones previas de otros usuarios
            const supportEmpresaId = localStorage.getItem('support_empresa_id');
            if (supportEmpresaId) return supportEmpresaId;
            
            // 3. Intentar desde meta tag (solo si no hay token)
            if (!token) {
                const metaEmpresa = document.querySelector('meta[name="empresa-id"]');
                if (metaEmpresa) return metaEmpresa.content;
                
                // 4. Intentar desde variable global
                if (window.FIA_CONFIG?.empresaId) return window.FIA_CONFIG.empresaId;
                if (window.EMPRESA_ID) return window.EMPRESA_ID;
                if (window.currentEmpresa?._id) return window.currentEmpresa._id;
                
                // 5. Intentar desde URL
                const match = window.location.pathname.match(/\/e\/([a-f0-9]+)/i);
                if (match) return match[1];
                
                // 6. Intentar desde query parameter
                const urlParams = new URLSearchParams(window.location.search);
                const empresaIdParam = urlParams.get('empresaId') || urlParams.get('empresa') || urlParams.get('e');
                if (empresaIdParam) return empresaIdParam;
            }
            
            return null;
        }

        /**
         * Inicializa el widget de soporte
         */
        async init() {
            this.createDOM();
            this.attachEventListeners();
            
            console.log('[SupportWidget] DOM creado, ticketId:', this.ticketId, 'empresaId:', this.empresaId, 'visitorName:', this.visitorName);
            
            // Si ya hay ticket Y tenemos empresaId, reconectar
            if (this.ticketId && this.visitorName && this.empresaId) {
                console.log('[SupportWidget] Reconectando a ticket existente:', this.ticketId);
                await this.connect();
                this.loadMessageHistory();
            } else if (this.ticketId && !this.empresaId) {
                // Hay ticket guardado pero falta empresaId, mostrar selector de empresas
                console.log('[SupportWidget] Hay ticket pero falta empresaId, mostrando selector');
                await this.showEmpresaSelector();
            } else if (!this.ticketId && !this.empresaId) {
                // No hay ticket ni empresaId, mostrar selector de empresas primero
                console.log('[SupportWidget] Sin ticket ni empresaId, mostrando selector de empresas');
                await this.showEmpresaSelector();
            } else if (!this.ticketId && this.empresaId) {
                // Tenemos empresaId pero no ticket, mostrar formulario directamente
                console.log('[SupportWidget] Tenemos empresaId, mostrando formulario');
                this.showTicketForm();
            }
            
            console.log('[SupportWidget] Widget listo');
            return true;
        }

        /**
         * Carga la lista de empresas disponibles
         */
        async loadEmpresas() {
            try {
                console.log('[SupportWidget] Cargando empresas...');
                const response = await fetch(`${this.apiUrl}/api/support/public/empresas`);
                const data = await response.json();
                
                if (data.success) {
                    console.log('[SupportWidget] Empresas cargadas:', data.empresas.length);
                    return data.empresas;
                } else {
                    console.error('[SupportWidget] Error cargando empresas:', data.error);
                    return [];
                }
            } catch (error) {
                console.error('[SupportWidget] Error cargando empresas:', error);
                return [];
            }
        }

        /**
         * Muestra selector de empresas
         */
        async showEmpresaSelector() {
            const content = this.elements.content;
            const inputArea = this.elements.inputArea;
            
            // Ocultar área de input
            if (inputArea) {
                inputArea.style.display = 'none';
            }
            
            // Mostrar cargando
            content.innerHTML = `
                <div class="support-form">
                    <h4>🏢 Selecciona una empresa</h4>
                    <p>Cargando empresas disponibles...</p>
                    <div style="text-align: center; padding: 20px;">
                        <span style="font-size: 24px;">⏳</span>
                    </div>
                </div>
            `;
            
            // Cargar empresas
            const empresas = await this.loadEmpresas();
            
            if (empresas.length === 0) {
                console.log('[SupportWidget] No hay empresas disponibles, mostrando error');
                content.innerHTML = `
                    <div class="support-form" style="padding: 20px;">
                        <h4 style="color: #f59e0b; margin-bottom: 15px;">⚠️ No hay empresas disponibles</h4>
                        <p style="color: #9ca3af; margin-bottom: 20px;">No se encontraron empresas activas en el sistema.</p>
                        <button id="support-retry-empresas" style="
                            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                            color: white;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: 600;
                            width: 100%;
                            font-size: 14px;
                        ">
                            🔄 Reintentar cargar empresas
                        </button>
                    </div>
                `;
                const retryBtn = document.getElementById('support-retry-empresas');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        console.log('[SupportWidget] Reintentando cargar empresas...');
                        this.showEmpresaSelector();
                    });
                }
                return;
            }
            
            // Mostrar selector
            content.innerHTML = `
                <div class="support-form">
                    <h4>🏢 ¿Con qué empresa quieres contactar?</h4>
                    <p>Selecciona la empresa a la que perteneces:</p>
                    <div class="support-empresas-list" style="margin-top: 15px; max-height: 300px; overflow-y: auto;">
                        ${empresas.map(emp => `
                            <div class="support-empresa-item" data-empresa-id="${emp._id}" style="
                                padding: 12px 15px;
                                margin-bottom: 8px;
                                background: rgba(255,255,255,0.1);
                                border-radius: 8px;
                                cursor: pointer;
                                transition: all 0.2s;
                                border: 1px solid transparent;
                            " onmouseover="this.style.background='rgba(255,255,255,0.2)'; this.style.borderColor='var(--support-primary, #f59e0b)'" 
                            onmouseout="this.style.background='rgba(255,255,255,0.1)'; this.style.borderColor='transparent'">
                                <div style="font-weight: 600; color: var(--support-text, #fff);">${emp.nombre}</div>
                                <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">Click para seleccionar</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            
            // Event listeners para selección
            content.querySelectorAll('.support-empresa-item').forEach(item => {
                item.addEventListener('click', () => {
                    const empresaId = item.dataset.empresaId;
                    // Obtener solo el nombre del primer div (no el "Click para seleccionar")
                    const empresaNombre = item.querySelector('div:first-child').textContent;
                    console.log('[SupportWidget] Empresa seleccionada:', empresaId, empresaNombre);
                    
                    // Guardar empresa seleccionada
                    this.empresaId = empresaId;
                    localStorage.setItem('support_empresa_id', empresaId);
                    localStorage.setItem('support_empresa_nombre', empresaNombre);
                    
                    // Mostrar formulario de ticket
                    this.showTicketForm();
                });
            });
        }

        /**
         * Crea el DOM del widget
         */
        createDOM() {
            // Contenedor principal
            const container = document.createElement('div');
            container.className = 'support-widget';
            container.id = 'support-widget';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            
            // Botón flotante
            const button = document.createElement('button');
            button.className = 'support-widget-button';
            button.style.cssText = `
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                border: none;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
                position: relative;
                z-index: 1001;
            `;
            button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:28px;height:28px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span class="support-badge" id="support-badge" style="display:none">!</span>
            `;
            
            // Contenedor del chat
            const chatContainer = document.createElement('div');
            chatContainer.className = 'support-container';
            chatContainer.id = 'support-container';
            
            // Header
            const header = this.createHeader();
            
            // Área de contenido
            const content = document.createElement('div');
            content.className = 'support-content';
            content.id = 'support-content';
            
            // Input
            const inputArea = this.createInputArea();
            
            chatContainer.appendChild(header);
            chatContainer.appendChild(content);
            chatContainer.appendChild(inputArea);
            
            container.appendChild(button);
            container.appendChild(chatContainer);
            
            document.body.appendChild(container);
            
            this.elements = {
                container,
                button,
                badge: button.querySelector('#support-badge'),
                chatContainer,
                content,
                inputArea
            };
        }

        /**
         * Crea el header
         */
        createHeader() {
            const header = document.createElement('div');
            header.className = 'support-header';
            header.innerHTML = `
                <div class="support-header-info">
                    <div class="support-header-avatar">🎧</div>
                    <div>
                        <h3 class="support-header-title">Soporte</h3>
                        <div class="support-header-status">
                            <span class="status-dot"></span>
                            <span id="support-status-text">En línea</span>
                        </div>
                    </div>
                </div>
                <div class="support-header-actions">
                    <button class="support-header-btn" id="support-close-btn" title="Cerrar">
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
            area.className = 'support-input-container';
            area.id = 'support-input-container';
            area.innerHTML = `
                <div class="support-typing" id="support-typing" style="display:none">
                    <span>Agente escribiendo</span>
                    <div class="support-typing-dots">
                        <span class="support-typing-dot"></span>
                        <span class="support-typing-dot"></span>
                        <span class="support-typing-dot"></span>
                    </div>
                </div>
                <div class="support-input-wrapper">
                    <textarea 
                        class="support-input" 
                        id="support-input" 
                        placeholder="Escribe tu mensaje..."
                        rows="1"
                        ${!this.ticketId ? 'disabled' : ''}
                    ></textarea>
                    <button class="support-send-btn" id="support-send-btn" ${!this.ticketId ? 'disabled' : ''}>
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                        </svg>
                    </button>
                </div>
            `;
            return area;
        }

        /**
         * Muestra el formulario para crear ticket (primer contacto)
         */
        showTicketForm() {
            const content = this.elements.content;
            const inputArea = this.elements.inputArea;
            
            // Ocultar área de input mientras se muestra el formulario
            if (inputArea) {
                inputArea.style.display = 'none';
            }
            
            // Mostrar empresa seleccionada
            const empresaNombre = localStorage.getItem('support_empresa_nombre') || 'No seleccionada';
            const empresaId = localStorage.getItem('support_empresa_id');
            console.log('[SupportWidget] Mostrando formulario. Empresa:', empresaNombre, 'ID:', empresaId);
            
            const empresaInfo = `
                <div style="background: rgba(245, 158, 11, 0.2); padding: 10px; border-radius: 8px; margin-bottom: 15px; border: 1px solid rgba(245, 158, 11, 0.3);">
                    <div style="font-size: 12px; color: #9ca3af;">Empresa seleccionada:</div>
                    <div style="font-weight: 600; color: #f59e0b;">🏢 ${empresaNombre}</div>
                    <button id="support-change-empresa" style="background: none; border: none; color: #9ca3af; font-size: 11px; cursor: pointer; text-decoration: underline; margin-top: 5px;">
                        Cambiar empresa
                    </button>
                </div>
            `;
            
            content.innerHTML = `
                <div class="support-form">
                    <h4>¿Necesitas ayuda?</h4>
                    <p>Déjanos tu mensaje y te responderemos pronto.</p>
                    
                    ${empresaInfo}
                    
                    <div class="support-form-group">
                        <label>Nombre</label>
                        <input type="text" id="support-form-name" placeholder="Tu nombre" value="${this.visitorName}">
                    </div>
                    
                    <div class="support-form-group">
                        <label>Email</label>
                        <input type="email" id="support-form-email" placeholder="tu@email.com" value="${this.visitorEmail}">
                    </div>
                    
                    <div class="support-form-group">
                        <label>¿En qué podemos ayudarte?</label>
                        <textarea id="support-form-message" rows="4" placeholder="Describe tu consulta..."></textarea>
                    </div>
                    
                    <button class="support-form-submit" id="support-form-submit">
                        Enviar mensaje
                    </button>
                </div>
            `;
            
            // Event listeners del formulario
            document.getElementById('support-form-submit').addEventListener('click', () => {
                this.createTicket();
            });
            
            // Event listener para cambiar empresa
            const changeEmpresaBtn = document.getElementById('support-change-empresa');
            if (changeEmpresaBtn) {
                console.log('[SupportWidget] Botón Cambiar empresa encontrado, agregando listener');
                changeEmpresaBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('[SupportWidget] Click en Cambiar empresa');
                    this.empresaId = null;
                    localStorage.removeItem('support_empresa_id');
                    localStorage.removeItem('support_empresa_nombre');
                    this.showEmpresaSelector();
                });
            } else {
                console.warn('[SupportWidget] Botón Cambiar empresa NO encontrado');
            }
        }

        /**
         * Crea un ticket de soporte
         */
        async createTicket() {
            const name = document.getElementById('support-form-name').value.trim();
            const email = document.getElementById('support-form-email').value.trim();
            const message = document.getElementById('support-form-message').value.trim();
            
            // Usar empresaId de la propiedad o localStorage
            let empresaId = this.empresaId || localStorage.getItem('support_empresa_id');
            
            if (!name || !email || !message || !empresaId) {
                alert('Por favor completa todos los campos y selecciona una empresa');
                return;
            }
            
            // Actualizar empresaId para este ticket
            this.empresaId = empresaId;
            
            // Guardar datos del visitante
            this.visitorName = name;
            this.visitorEmail = email;
            localStorage.setItem('support_visitor_name', name);
            localStorage.setItem('support_visitor_email', email);
            
            try {
                // Preparar headers
                const headers = { 'Content-Type': 'application/json' };
                const token = localStorage.getItem('token');
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                    console.log('[SupportWidget] Enviando con autenticación (cliente)');
                } else {
                    console.log('[SupportWidget] Enviando sin autenticación (visitante)');
                }
                
                // Crear ticket vía REST API
                const response = await fetch(`${this.apiUrl}/api/support/public/ticket`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        empresaId: this.empresaId,
                        visitorName: name,
                        visitorEmail: email,
                        subject: 'Consulta de ' + name,
                        message: message,
                        priority: 'medium'
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.ticketId = data.conversationId;
                    localStorage.setItem('support_ticket_id', this.ticketId);
                    
                    // Guardar visitorId si existe (para tickets de visitantes)
                    if (data.visitorId) {
                        this.visitorId = data.visitorId;
                        localStorage.setItem('support_visitor_id', this.visitorId);
                    }
                    
                    // Guardar si es chat directo o ticket
                    const isChat = data.type === 'direct';
                    
                    // Agregar mensaje local
                    this.messages.push({
                        _id: data.messageId,
                        content: message,
                        senderName: name,
                        senderRole: isChat ? 'member' : 'customer',
                        createdAt: new Date(),
                        isOwn: true
                    });
                    
                    // Conectar y mostrar chat
                    await this.connect();
                    this.showChat();
                    this.onTicketCreated(data);
                    
                    if (isChat) {
                        console.log('[SupportWidget] Chat directo creado:', this.ticketId);
                    } else {
                        console.log('[SupportWidget] Ticket de soporte creado:', this.ticketId);
                    }
                } else {
                    alert('Error al crear ticket: ' + data.error);
                }
            } catch (error) {
                console.error('[SupportWidget] Error creando ticket:', error);
                alert('Error de conexión. Intenta de nuevo.');
            }
        }

        /**
         * Conecta al servidor de soporte
         */
        async connect() {
            if (typeof io === 'undefined') {
                console.error('[SupportWidget] Socket.io no disponible');
                return false;
            }
            
            try {
                this.socket = io(`${this.apiUrl}/support`, {
                    auth: {
                        ticketId: this.ticketId,
                        empresaId: this.empresaId,
                        visitorName: this.visitorName,
                        visitorEmail: this.visitorEmail
                    },
                    transports: ['websocket', 'polling'],
                    reconnectionAttempts: 5,
                    reconnectionDelay: 2000
                });
                
                this.socket.on('connect', () => {
                    console.log('[SupportWidget] Conectado al soporte');
                    this.isConnected = true;
                    this.updateStatus('Conectado', true);
                    
                    // Unirse a la sala del ticket si existe
                    if (this.ticketId) {
                        console.log('[SupportWidget] Uniendo a sala del ticket:', this.ticketId);
                        this.socket.emit('ticket:join', { ticketId: this.ticketId });
                    }
                });
                
                this.socket.on('disconnect', () => {
                    this.isConnected = false;
                    this.updateStatus('Desconectado', false);
                });
                
                this.socket.on('message:received', (data) => {
                    this.handleIncomingMessage(data);
                });
                
                this.socket.on('presence:typing', (data) => {
                    this.showTypingIndicator(data.isTyping);
                });
                
                return true;
            } catch (error) {
                console.error('[SupportWidget] Error conectando:', error);
                return false;
            }
        }

        /**
         * Muestra el área de chat
         */
        showChat() {
            const content = this.elements.content;
            const inputArea = this.elements.inputArea;
            
            // Mostrar área de input cuando se muestra el chat
            if (inputArea) {
                inputArea.style.display = 'block';
            }
            
            content.innerHTML = `
                <div class="support-messages" id="support-messages"></div>
            `;
            
            // Renderizar mensajes existentes
            this.renderMessages();
            
            // Habilitar input
            const input = document.getElementById('support-input');
            const sendBtn = document.getElementById('support-send-btn');
            if (input) input.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
        }

        /**
         * Renderiza los mensajes
         */
        renderMessages() {
            const container = document.getElementById('support-messages');
            if (!container) return;
            
            container.innerHTML = '';
            
            this.messages.forEach(msg => {
                const el = this.createMessageElement(msg);
                container.appendChild(el);
            });
            
            this.scrollToBottom();
        }

        /**
         * Crea elemento de mensaje
         */
        createMessageElement(message) {
            const div = document.createElement('div');
            const isOwn = message.isOwn || message.senderRole === 'customer';
            div.className = `support-message ${isOwn ? 'own' : 'other'}`;
            
            const time = this.formatTime(message.createdAt);
            
            div.innerHTML = `
                <div class="support-message-bubble">
                    ${!isOwn ? `<div class="support-message-sender">${this.escapeHtml(message.senderName)}</div>` : ''}
                    ${this.escapeHtml(message.content)}
                </div>
                <div class="support-message-meta">${time}</div>
            `;
            
            return div;
        }

        /**
         * Maneja mensaje entrante
         */
        handleIncomingMessage(data) {
            const incomingMsg = data.message;
            
            // Verificar si es mensaje propio del visitante (evitar duplicado)
            // Comparar: mismo contenido, mismo remitente, y enviado hace menos de 5 segundos
            const isDuplicate = this.messages.some(m => 
                m.content === incomingMsg.content &&
                m.senderName === incomingMsg.senderName &&
                m.isOwn === true &&
                (new Date() - new Date(m.createdAt)) < 5000
            );
            
            if (isDuplicate) {
                console.log('[SupportWidget] Mensaje duplicado ignorado:', incomingMsg.content);
                return;
            }
            
            const message = {
                ...incomingMsg,
                isOwn: false
            };
            
            this.messages.push(message);
            
            const container = document.getElementById('support-messages');
            if (container) {
                const el = this.createMessageElement(message);
                container.appendChild(el);
                this.scrollToBottom();
            }
            
            // Notificación si está cerrado
            if (!this.isOpen) {
                this.elements.badge.style.display = 'flex';
            }
            
            this.onMessageReceived(message);
        }

        /**
         * Envía mensaje
         */
        async sendMessage() {
            const input = document.getElementById('support-input');
            const content = input.value.trim();
            
            if (!content || !this.socket) return;
            
            try {
                // Emitir mensaje
                this.socket.emit('message:send', {
                    ticketId: this.ticketId,
                    content: content
                });
                
                // Agregar a mensajes locales
                const msg = {
                    _id: Date.now().toString(),
                    content: content,
                    senderName: this.visitorName,
                    senderRole: 'customer',
                    createdAt: new Date(),
                    isOwn: true
                };
                
                this.messages.push(msg);
                
                const container = document.getElementById('support-messages');
                if (container) {
                    const el = this.createMessageElement(msg);
                    container.appendChild(el);
                    this.scrollToBottom();
                }
                
                input.value = '';
                input.style.height = 'auto';
                this.stopTyping();
            } catch (error) {
                console.error('[SupportWidget] Error enviando:', error);
            }
        }

        /**
         * Maneja typing
         */
        handleTyping() {
            if (this.isTyping || !this.socket) return;
            
            this.isTyping = true;
            this.socket.emit('presence:typing', {
                ticketId: this.ticketId,
                isTyping: true
            });
            
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                this.stopTyping();
            }, 3000);
        }

        stopTyping() {
            if (!this.isTyping || !this.socket) return;
            
            this.isTyping = false;
            this.socket.emit('presence:typing', {
                ticketId: this.ticketId,
                isTyping: false
            });
        }

        showTypingIndicator(show) {
            const el = document.getElementById('support-typing');
            if (el) el.style.display = show ? 'flex' : 'none';
        }

        /**
         * Event listeners
         */
        attachEventListeners() {
            // Toggle
            this.elements.button.addEventListener('click', () => {
                this.toggle();
            });
            
            // Cerrar
            document.getElementById('support-close-btn').addEventListener('click', () => {
                this.close();
            });
            
            // Enviar mensaje
            const sendBtn = document.getElementById('support-send-btn');
            const input = document.getElementById('support-input');
            
            if (sendBtn) {
                sendBtn.addEventListener('click', () => this.sendMessage());
            }
            
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.sendMessage();
                    }
                });
                
                input.addEventListener('input', () => {
                    this.handleTyping();
                    input.style.height = 'auto';
                    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
                });
            }
        }

        toggle() {
            if (this.isOpen) {
                this.close();
            } else {
                this.open();
            }
        }

        open() {
            this.isOpen = true;
            this.elements.chatContainer.classList.add('active');
            this.elements.badge.style.display = 'none';
            
            // Si no hay ticket, mostrar formulario
            if (!this.ticketId) {
                this.showTicketForm();
            } else {
                this.showChat();
                if (!this.isConnected) {
                    this.connect();
                }
            }
        }

        close() {
            this.isOpen = false;
            this.elements.chatContainer.classList.remove('active');
        }

        updateStatus(text, isOnline) {
            const statusText = document.getElementById('support-status-text');
            const dot = document.querySelector('.status-dot');
            
            if (statusText) statusText.textContent = text;
            if (dot) {
                dot.className = 'status-dot ' + (isOnline ? 'online' : 'offline');
            }
        }

        scrollToBottom() {
            const container = document.getElementById('support-messages');
            if (container) {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }

        formatTime(date) {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
        }

        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        async loadMessageHistory() {
            try {
                // Construir URL con visitorId para validación
                let url = `${this.apiUrl}/api/support/public/ticket/${this.ticketId}/messages`;
                if (this.visitorId) {
                    url += `?visitorId=${this.visitorId}`;
                }
                
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.success) {
                    this.messages = data.messages.map(m => ({
                        ...m,
                        isOwn: m.senderRole === 'customer' || m.senderName === this.visitorName
                    }));
                    this.renderMessages();
                }
            } catch (error) {
                console.error('[SupportWidget] Error cargando historial:', error);
            }
        }

        destroy() {
            if (this.socket) {
                this.socket.disconnect();
            }
            if (this.elements.container) {
                this.elements.container.remove();
            }
        }
    }

    // Exportar
    window.SupportWidget = SupportWidget;
    console.log('[SupportWidget] Clase cargada correctamente');

})();
