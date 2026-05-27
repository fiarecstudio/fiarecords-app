const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');

/**
 * Socket.io Initialization Module
 * FASE 1: Configuración base del servidor WebSocket
 * 
 * Inicializa Socket.io con CORS, autenticación, y manejo de namespaces.
 * Preparado para escalar con Redis Adapter en fases posteriores.
 */

let io = null;
let chatNamespace = null;

/**
 * Inicializa Socket.io con el servidor HTTP
 * @param {http.Server} httpServer - Servidor HTTP de Express
 * @returns {Server} Instancia de Socket.io
 */
const initializeSocket = (httpServer) => {
    try {
        // Configuración de Socket.io
        io = new Server(httpServer, {
            cors: {
                origin: process.env.FRONTEND_URL || "*",
                methods: ["GET", "POST"],
                credentials: true
            },
            // Configuración para reconexión automática
            pingTimeout: 60000,      // 60 segundos sin respuesta = desconectado
            pingInterval: 25000,     // Ping cada 25 segundos
            // Permitir transportes websocket y polling (fallback)
            transports: ['websocket', 'polling']
        });

        console.log('✅ Socket.io inicializado');

        // FASE 2: Aquí se agregará Redis Adapter para escalabilidad
        // if (process.env.REDIS_URL) {
        //     const { createAdapter } = require('@socket.io/redis-adapter');
        //     const { createClient } = require('redis');
        //     const pubClient = createClient({ url: process.env.REDIS_URL });
        //     const subClient = pubClient.duplicate();
        //     io.adapter(createAdapter(pubClient, subClient));
        // }

        // Namespace específico para chat
        // Permite separar lógica y escalar independientemente
        chatNamespace = io.of('/chat');
        
        // Middleware de autenticación JWT
        // Se ejecuta para CADA conexión al namespace /chat
        chatNamespace.use(require('./middleware/auth'));
        
        // Handler principal de conexiones
        chatNamespace.on('connection', (socket) => {
            console.log(`🔌 Nueva conexión Socket: ${socket.user.username} (${socket.id})`);
            
            // FASE 2: Handlers base
            require('./handlers/connection')(socket, chatNamespace);
            require('./handlers/rooms')(socket, chatNamespace);
            require('./handlers/messages')(socket, chatNamespace);
            
            // FASE 4: Handlers avanzados
            require('./handlers/presence')(socket, chatNamespace);
            require('./handlers/support')(socket, chatNamespace);
        });

        // Manejo de errores a nivel de namespace
        chatNamespace.on('error', (error) => {
            console.error('[Socket.io Namespace Error]', error);
        });

        console.log('✅ Namespace /chat configurado con autenticación JWT');
        
        // Namespace público para soporte (visitantes sin auth)
        const supportNamespace = io.of('/support');
        
        supportNamespace.on('connection', async (socket) => {
            console.log(`🔌 Visitante conectado a soporte: ${socket.id}`);

            const { ticketId, empresaId, visitorName, visitorEmail, token } = socket.handshake.auth;
            let authenticatedUser = null;
            let resolvedEmpresaId = empresaId;

            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    const user = await Usuario.findOne({
                        _id: decoded.id || decoded._id,
                        isDeleted: { $ne: true }
                    }).select('_id nombre username role empresaId email');

                    if (user) {
                        authenticatedUser = user;
                        resolvedEmpresaId = resolvedEmpresaId || user.empresaId;
                        socket.user = {
                            id: user._id.toString(),
                            username: user.username || user.nombre || null,
                            role: decoded.role || decoded.rol || decoded.userRole || user.role,
                            empresaId: user.empresaId,
                            email: user.email || null
                        };
                        console.log(`[Support] Usuario autenticado en /support: ${socket.user.username} (${socket.user.id})`);
                    } else {
                        console.warn('[Support] Token válido pero usuario no encontrado:', decoded.id || decoded._id);
                    }
                } catch (error) {
                    console.warn('[Support] Token inválido en /support:', error.message);
                }
            }

            if (authenticatedUser) {
                // Usuario autenticado conectado al nodo de soporte
                socket.ticketId = ticketId;
                socket.empresaId = resolvedEmpresaId;
                socket.visitorName = authenticatedUser.username || authenticatedUser.nombre || visitorName || 'Cliente';
                socket.visitorEmail = authenticatedUser.email || visitorEmail || '';
                socket.visitorId = authenticatedUser._id;
                console.log(`[Support] Sesión autenticada asignada a socket: ${socket.visitorId}`);
            } else {
                // Visitante anónimo
                const visitorId = new mongoose.Types.ObjectId();
                socket.visitorId = visitorId;
                socket.ticketId = ticketId;
                socket.empresaId = resolvedEmpresaId;
                socket.visitorName = visitorName;
                socket.visitorEmail = visitorEmail;
                console.log(`[Support] Visitante asignado ID: ${visitorId}`);
            }

            // Unir a la sala de la conversación si tiene ticketId
            if (socket.ticketId) {
                const roomName = `conversation:${socket.ticketId}`;
                socket.join(roomName);
                console.log(`[Support] ${authenticatedUser ? 'Usuario' : 'Visitante'} unido a sala: ${roomName}`);

                supportNamespace.to(roomName).emit('visitor:online', {
                    ticketId: socket.ticketId,
                    visitorName: socket.visitorName,
                    timestamp: new Date()
                });
            }
            
            // Unir a la sala de la conversación si tiene ticketId
            if (ticketId) {
                const roomName = `conversation:${ticketId}`;
                socket.join(roomName);
                console.log(`[Support] Visitante unido a sala: ${roomName}`);
                
                // Notificar a la sala que el visitante está online
                supportNamespace.to(roomName).emit('visitor:online', {
                    ticketId,
                    visitorName,
                    timestamp: new Date()
                });
            }
            
            // Handler para enviar mensaje
            socket.on('message:send', async (data) => {
                try {
                    const { ticketId, content } = data;
                    const Message = require('../models/Message');
                    const Conversation = require('../models/Conversation');
                    const Usuario = require('../models/Usuario');

                    // Verificar si el usuario está autenticado
                    const isAuthenticated = socket.user && socket.user.id;

                    // Buscar conversación existente
                    let conversation = await Conversation.findOne({
                        _id: ticketId,
                        empresaId: socket.empresaId
                    });

                    // Si no existe conversación y el usuario está autenticado, crear conversación directa
                    if (!conversation && isAuthenticated) {
                        console.log(`[Support] Usuario autenticado ${socket.user.username} enviando mensaje sin conversación, creando conversación directa...`);

                        // Buscar agentes disponibles para la conversación
                        const agents = await Usuario.find({
                            empresaId: socket.empresaId,
                            role: { $in: ['admin', 'ingeniero', 'diseñador', 'soporte'] },
                            isDeleted: { $ne: true }
                        }).select('_id username').limit(5);

                        // Crear conversación directa
                        conversation = new Conversation({
                            empresaId: socket.empresaId,
                            type: 'direct',
                            title: socket.user.username || socket.user.nombre || 'Cliente',
                            participants: [
                                {
                                    userId: socket.user.id,
                                    role: 'member',
                                    unreadCount: 0,
                                    joinedAt: new Date()
                                },
                                ...agents.map(agent => ({
                                    userId: agent._id,
                                    role: 'support',
                                    unreadCount: 1,
                                    joinedAt: new Date()
                                }))
                            ],
                            isSupportTicket: false, // No es ticket de soporte, es conversación directa
                            lastMessage: {
                                content,
                                senderId: socket.user.id,
                                senderName: socket.user.username,
                                sentAt: new Date()
                            }
                        });

                        await conversation.save();
                        socket.ticketId = conversation._id;

                        // Hacer populate de los participantes para tener los datos completos
                        await conversation.populate('participants.userId', 'username nombre email role');

                        // Unir al socket a la sala
                        const roomName = `conversation:${conversation._id}`;
                        socket.join(roomName);

                        console.log(`[Support] Conversación directa creada: ${conversation._id} para usuario ${socket.user.username}`);
                    } else if (!conversation) {
                        // Visitante anónimo sin ticket
                        socket.emit('error', { message: 'Ticket no encontrado' });
                        return;
                    }

                    // Crear mensaje
                    const message = new Message({
                        empresaId: socket.empresaId,
                        conversationId: conversation._id,
                        senderId: isAuthenticated ? socket.user.id : socket.visitorId,
                        senderName: isAuthenticated ? socket.user.username : socket.visitorName,
                        senderRole: isAuthenticated ? socket.user.role : 'member',
                        content,
                        type: 'text',
                        isSystemMessage: false
                    });

                    await message.save();

                    // Actualizar último mensaje
                    await Conversation.updateOne(
                        { _id: conversation._id },
                        {
                            lastMessage: {
                                content,
                                senderId: isAuthenticated ? socket.user.id : socket.visitorId,
                                senderName: isAuthenticated ? socket.user.username : socket.visitorName,
                                sentAt: new Date()
                            },
                            updatedAt: new Date()
                        }
                    );

                    // Emitir a la sala
                    const roomName = `conversation:${conversation._id}`;
                    const messageData = {
                        _id: message._id,
                        conversationId: conversation._id,
                        senderId: isAuthenticated ? socket.user.id : socket.visitorId,
                        senderName: isAuthenticated ? socket.user.username : socket.visitorName,
                        senderRole: isAuthenticated ? socket.user.role : 'member',
                        content,
                        type: 'text',
                        createdAt: message.createdAt
                    };

                    // Emitir a todos en la sala (incluyendo admins en /chat)
                    io.of('/chat').to(roomName).emit('message:received', { message: messageData });
                    io.of('/support').to(roomName).emit('message:received', { message: messageData });

                    // También emitir a la sala de empresa
                    const empresaRoom = `empresa:${socket.empresaId}`;
                    io.of('/chat').to(empresaRoom).emit('conversation:updated', {
                        conversationId: conversation._id,
                        title: conversation.title,
                        participants: conversation.participants,
                        lastMessage: {
                            content,
                            senderName: isAuthenticated ? socket.user.username : socket.visitorName,
                            sentAt: new Date()
                        },
                        type: conversation.isSupportTicket ? 'support' : 'direct',
                        unreadIncrement: 1
                    });

                    console.log(`[Support] Mensaje enviado por ${isAuthenticated ? socket.user.username : socket.visitorName} a conversación ${conversation._id}`);

                } catch (error) {
                    console.error('[Support] Error enviando mensaje:', error);
                    socket.emit('error', { message: 'Error enviando mensaje' });
                }
            });
            
            // Handler para unirse a una sala de ticket
            socket.on('ticket:join', async (data) => {
                const { ticketId } = data;
                if (ticketId) {
                    const roomName = `conversation:${ticketId}`;
                    socket.join(roomName);
                    socket.ticketId = ticketId;
                    console.log(`[Support] Visitante unido manualmente a: ${roomName}`);
                    socket.emit('ticket:joined', { ticketId, success: true });
                }
            });
            
            socket.on('disconnect', () => {
                console.log(`🔌 Visitante desconectado de soporte: ${socket.id}`);
                if (socket.ticketId) {
                    supportNamespace.to(`conversation:${socket.ticketId}`).emit('visitor:offline', {
                        ticketId: socket.ticketId,
                        visitorName: socket.visitorName,
                        timestamp: new Date()
                    });
                }
            });
        });
        
        console.log('✅ Namespace /support configurado (público para visitantes)');
        
        return io;
        
    } catch (error) {
        console.error('❌ Error inicializando Socket.io:', error);
        throw error;
    }
};

/**
 * Obtiene la instancia de Socket.io
 * @returns {Server} Instancia de Socket.io
 * @throws {Error} Si Socket.io no ha sido inicializado
 */
const getIO = () => {
    if (!io) {
        throw new Error('Socket.io no ha sido inicializado. Llama initializeSocket primero.');
    }
    return io;
};

/**
 * Obtiene el namespace de chat
 * @returns {Namespace} Namespace /chat
 * @throws {Error} Si no ha sido inicializado
 */
const getChatNamespace = () => {
    if (!chatNamespace) {
        throw new Error('Chat namespace no ha sido inicializado.');
    }
    return chatNamespace;
};

module.exports = {
    initializeSocket,
    getIO,
    getChatNamespace
};
