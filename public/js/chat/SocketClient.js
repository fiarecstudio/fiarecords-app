/**
 * SocketClient.js
 * FASE 3: Cliente Socket.io para el chat
 * 
 * Maneja la conexión WebSocket, autenticación JWT,
 * y eventos básicos de conexión/desconexión.
 */

(function() {
    'use strict';

    class SocketClient {
        constructor() {
            this.socket = null;
            this.isConnected = false;
            this.reconnectAttempts = 0;
            this.maxReconnectAttempts = 5;
            this.reconnectDelay = 3000; // 3 segundos
            this.eventHandlers = {};
            
            // URL del servidor Socket.io
            this.serverUrl = window.location.hostname === 'localhost' || 
                             window.location.hostname === '127.0.0.1'
                ? 'http://localhost:5000'
                : 'https://fiarecords-app.onrender.com';
        }

        /**
         * Inicializa la conexión Socket.io
         * @returns {Promise<boolean>} - true si conectó exitosamente
         */
        async connect() {
            return new Promise((resolve, reject) => {
                try {
                    // Obtener token JWT del localStorage
                    const token = localStorage.getItem('token');
                    
                    if (!token) {
                        console.error('[SocketClient] No hay token JWT disponible');
                        reject(new Error('No autenticado'));
                        return;
                    }

                    // Verificar que Socket.io esté disponible
                    if (typeof io === 'undefined') {
                        console.error('[SocketClient] Socket.io no está cargado');
                        reject(new Error('Socket.io no disponible'));
                        return;
                    }

                    console.log('[SocketClient] Conectando a', this.serverUrl, '/chat');

                    // Crear conexión al namespace /chat
                    this.socket = io(`${this.serverUrl}/chat`, {
                        auth: {
                            token: token  // JWT enviado en handshake
                        },
                        transports: ['websocket', 'polling'],
                        timeout: 20000,
                        forceNew: true,
                        // Configuración de reconexión limitada
                        reconnection: true,
                        reconnectionAttempts: 5,
                        reconnectionDelay: 2000,
                        reconnectionDelayMax: 10000
                    });

                    // Evento: Conexión exitosa
                    this.socket.on('connect', () => {
                        console.log('[SocketClient] ✅ Conectado al servidor de chat');
                        this.isConnected = true;
                        this.reconnectAttempts = 0;
                        
                        // Emitir evento interno
                        this._triggerEvent('connected', {
                            socketId: this.socket.id,
                            timestamp: new Date()
                        });
                        
                        resolve(true);
                    });

                    // Evento: Error de conexión
                    this.socket.on('connect_error', (error) => {
                        console.error('[SocketClient] ❌ Error de conexión:', error.message);
                        
                        // Si es error de autenticación, no reintentar
                        if (error.message.includes('Authentication error')) {
                            console.error('[SocketClient] Error de autenticación, requiere login');
                            this._triggerEvent('auth_error', error);
                            reject(error);
                            return;
                        }
                        
                        this._triggerEvent('connect_error', error);
                    });

                    // Evento: Desconexión
                    this.socket.on('disconnect', (reason) => {
                        console.log('[SocketClient] 🔌 Desconectado:', reason);
                        this.isConnected = false;
                        this._triggerEvent('disconnected', { reason });
                        
                        // Reconexión automática si no fue desconexión manual
                        if (reason !== 'io client disconnect' && 
                            reason !== 'io server disconnect') {
                            this._scheduleReconnect();
                        }
                    });

                    // Evento: Reconexión exitosa
                    this.socket.io.on('reconnect', (attempt) => {
                        console.log('[SocketClient] ✅ Reconectado después de', attempt, 'intentos');
                        this.isConnected = true;
                        this.reconnectAttempts = 0;
                        this._triggerEvent('reconnected', { attempt });
                    });

                    // Evento: Intento de reconexión
                    this.socket.io.on('reconnect_attempt', (attempt) => {
                        console.log('[SocketClient] 🔄 Intentando reconexión...', attempt);
                        this.reconnectAttempts = attempt;
                        this._triggerEvent('reconnecting', { attempt });
                    });

                    // Evento: Reconexión fallida (agotados todos los intentos)
                    this.socket.io.on('reconnect_failed', () => {
                        console.log('[SocketClient] ⚠️ Servidor no disponible por el momento');
                        this.isConnected = false;
                        this._triggerEvent('reconnect_failed', {});
                    });

                    // Configurar listeners de eventos de chat
                    this._setupChatListeners();

                } catch (error) {
                    console.error('[SocketClient] Error inicializando:', error);
                    reject(error);
                }
            });
        }

        /**
         * Configura listeners para eventos de chat del servidor
         */
        _setupChatListeners() {
            // Mensaje recibido
            this.socket.on('message:received', (data) => {
                console.log('[SocketClient] 📨 Mensaje recibido:', data);
                this._triggerEvent('message_received', data);
            });

            // Confirmación de lectura
            this.socket.on('message:readReceipt', (data) => {
                console.log('[SocketClient] 👁️ Mensaje leído:', data);
                this._triggerEvent('message_read', data);
            });

            // Usuario online
            this.socket.on('user:online', (data) => {
                console.log('[SocketClient] 🟢 Usuario online:', data);
                this._triggerEvent('user_online', data);
            });

            // Usuario offline
            this.socket.on('user:offline', (data) => {
                console.log('[SocketClient] 🔴 Usuario offline:', data);
                this._triggerEvent('user_offline', data);
            });

            // Alguien se unió a la conversación
            this.socket.on('user:joined', (data) => {
                console.log('[SocketClient] 👋 Usuario entró:', data);
                this._triggerEvent('user_joined', data);
            });

            // Alguien salió de la conversación
            this.socket.on('user:left', (data) => {
                console.log('[SocketClient] 🚪 Usuario salió:', data);
                this._triggerEvent('user_left', data);
            });

            // Conversación actualizada (nuevo mensaje)
            this.socket.on('conversation:updated', (data) => {
                console.log('[SocketClient] 📝 Conversación actualizada:', data);
                this._triggerEvent('conversation_updated', data);
            });
        }

        /**
         * Programa reconexión automática con backoff
         */
        _scheduleReconnect() {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.log('[SocketClient] ⚠️ Servidor no disponible por el momento');
                this._triggerEvent('reconnect_failed', {});
                return;
            }

            const delay = this.reconnectDelay * (this.reconnectAttempts + 1);
            console.log(`[SocketClient] Reconectando en ${delay}ms...`);

            setTimeout(() => {
                if (!this.isConnected) {
                    this.connect().catch(err => {
                        console.error('[SocketClient] Reconexión fallida:', err);
                    });
                }
            }, delay);
        }

        /**
         * Registra un handler para un evento
         * @param {string} event - Nombre del evento
         * @param {Function} handler - Función callback
         */
        on(event, handler) {
            if (!this.eventHandlers[event]) {
                this.eventHandlers[event] = [];
            }
            this.eventHandlers[event].push(handler);
        }

        /**
         * Elimina un handler de evento
         * @param {string} event - Nombre del evento
         * @param {Function} handler - Función a remover (opcional, si no se pasa remueve todos)
         */
        off(event, handler) {
            if (!this.eventHandlers[event]) return;
            
            if (handler) {
                this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
            } else {
                delete this.eventHandlers[event];
            }
        }

        /**
         * Ejecuta todos los handlers para un evento
         */
        _triggerEvent(event, data) {
            if (this.eventHandlers[event]) {
                this.eventHandlers[event].forEach(handler => {
                    try {
                        handler(data);
                    } catch (error) {
                        console.error('[SocketClient] Error en handler de', event, error);
                    }
                });
            }
        }

        /**
         * Emite un evento al servidor
         * @param {string} event - Nombre del evento
         * @param {*} data - Datos a enviar
         * @returns {Promise} - Resuelve con la respuesta del servidor (si usa callback)
         */
        emit(event, data) {
            return new Promise((resolve, reject) => {
                if (!this.isConnected || !this.socket) {
                    reject(new Error('No conectado al servidor'));
                    return;
                }

                // Timeout para la respuesta
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout esperando respuesta del servidor'));
                }, 10000);

                // Emitir con callback
                this.socket.emit(event, data, (response) => {
                    clearTimeout(timeout);
                    
                    if (response && response.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response?.error || 'Error del servidor'));
                    }
                });
            });
        }

        /**
         * Desconecta el socket
         */
        disconnect() {
            if (this.socket) {
                this.socket.disconnect();
                this.isConnected = false;
                console.log('[SocketClient] Desconectado manualmente');
            }
        }

        /**
         * Verifica si está conectado
         */
        getConnectionStatus() {
            return {
                isConnected: this.isConnected,
                socketId: this.socket?.id || null,
                reconnectAttempts: this.reconnectAttempts
            };
        }
    }

    // Exportar al espacio global
    window.SocketClient = SocketClient;
    console.log('[SocketClient] Clase cargada correctamente');

})();
