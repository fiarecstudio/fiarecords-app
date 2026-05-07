# 📋 AUDITORÍA TÉCNICA: SISTEMA DE CHAT AVANZADO
## Fia Records - Arquitectura de Software para Chat en Tiempo Real

**Fecha:** Mayo 2026  
**Arquitecto:** Asistente de IA Especializado  
**Proyecto:** FiaRecords Servidor (Node.js + MongoDB + JavaScript Frontend)

---

# 1. RESUMEN EJECUTIVO

Tu aplicación actual cuenta con una **base sólida** para implementar un sistema de chat avanzado:

| Aspecto | Estado Actual | Preparación Chat |
|---------|---------------|------------------|
| **Autenticación JWT** | ✅ Tokens de 15 min + Refresh de 7 días | ✅ Reutilizable |
| **Multi-Tenant** | ✅ Aislamiento por empresa implementado | ✅ Crítico para seguridad |
| **Seguridad** | ✅ Helmet, mongo-sanitize, rate limiting | ✅ Base sólida |
| **WebSockets** | ❌ No implementado | ⚠️ Necesario agregar |
| **Redis** | ❌ No utilizado | ⚠️ Recomendado para escalabilidad |

---

# 2. INFRAESTRUCTURA Y ESTADO ACTUAL

## 2.1 Componentes Reutilizables ✅

### Autenticación JWT (`middleware/auth.js`)
```javascript
// TU CÓDIGO ACTUAL:
const decoded = jwt.verify(token, process.env.JWT_SECRET);
req.user = decoded;
// Contiene: id, role, empresaId, isSuperAdmin
```
**Veredicto:** El sistema actual ya incluye `empresaId` y `isSuperAdmin` en el token. Esto es **perfecto** para aislar chats por empresa.

### Middleware Multi-Tenant (`middleware/tenantFilter.js`)
```javascript
// TU CÓDIGO ACTUAL:
req.tenantFilter = { empresaId: new mongoose.Types.ObjectId(req.user.empresaId) };
```
**Veredicto:** La lógica de aislamiento ya existe. Debe aplicarse **estrictamente** a las colecciones de chat.

### Rate Limiting (`middleware/rateLimit.js`)
**Veredicto:** Debes crear un rate limiter específico para endpoints de chat (más permisivo que auth, más restrictivo que lectura).

## 2.2 Refactorización Necesaria ⚠️

### Session Store para WebSockets
```javascript
// PROBLEMA ACTUAL:
// Los tokens JWT se validan en HTTP headers, pero WebSockets usan 'query' o 'auth'
// Socket.io no tiene acceso directo a req.headers de Express

// SOLUCIÓN:
// Crear adaptador de autenticación de socket que valide el token 
// y extraiga empresaId antes de permitir conexión
```

### Centralización de Estado de Usuario
```javascript
// PROBLEMA POTENCIAL:
// El estado 'online/offline' y 'escribiendo' debe manejarse 
// fuera de la base de datos principal (demasiadas escrituras)

// SOLUCIÓN:
// Redis para estado efímero, MongoDB para persistencia de mensajes
```

---

# 3. ARQUITECTURA DE BASE DE DATOS (MongoDB)

## 3.1 Esquema de Colecciones Propuesto

### A. Colección: `Conversations` (Conversaciones)
```javascript
const ConversationSchema = new mongoose.Schema({
    // --- ISOLAMIENTO MULTI-TENANT (CRÍTICO) ---
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true,
        index: true  // Índice obligatorio para aislamiento
    },
    
    // --- TIPO DE CHAT ---
    type: {
        type: String,
        enum: ['direct', 'group', 'support'],  // direct: empleado-empleado, support: cliente-empleado
        required: true,
        index: true
    },
    
    // --- PARTICIPANTES ---
    participants: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
        role: { type: String, enum: ['member', 'admin', 'support'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
        // Última vez que leyó esta conversación
        lastReadAt: { type: Date, default: Date.now },
        // Contador de mensajes no leídos (denormalizado para performance)
        unreadCount: { type: Number, default: 0 }
    }],
    
    // --- METADATOS ---
    title: { type: String, trim: true },  // Para grupos
    avatar: { type: String },  // URL de imagen
    
    // --- ESTADO ---
    isActive: { type: Boolean, default: true },
    isSupportTicket: { type: Boolean, default: false },  // Para tickets de soporte
    supportStatus: { 
        type: String, 
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open'
    },
    
    // --- ÚLTIMO MENSAJE (Denormalizado para listados rápidos) ---
    lastMessage: {
        messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
        content: { type: String },
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
        senderName: { type: String },
        type: { type: String, enum: ['text', 'image', 'file', 'audio'] },
        sentAt: { type: Date }
    },
    
    // --- CONTADORES ---
    messageCount: { type: Number, default: 0 },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ÍNDICES CRÍTICOS PARA PERFORMANCE
ConversationSchema.index({ empresaId: 1, type: 1, updatedAt: -1 });  // Listar conversaciones
ConversationSchema.index({ empresaId: 1, 'participants.userId': 1, updatedAt: -1 });  // Mis chats
ConversationSchema.index({ empresaId: 1, isSupportTicket: 1, supportStatus: 1 });  // Tickets abiertos
```

### B. Colección: `Messages` (Mensajes)
```javascript
const MessageSchema = new mongoose.Schema({
    // --- ISOLAMIENTO MULTI-TENANT (CRÍTICO) ---
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true,
        index: true
    },
    
    // --- REFERENCIAS ---
    conversationId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Conversation', 
        required: true,
        index: true 
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    senderName: { type: String, required: true },  // Denormalizado para mostrar sin populate
    senderRole: { type: String },  // 'cliente', 'ingeniero', 'admin', etc.
    
    // --- CONTENIDO ---
    type: { 
        type: String, 
        enum: ['text', 'image', 'file', 'audio', 'system'], 
        default: 'text' 
    },
    content: { type: String, required: true },  // Texto o URL del archivo
    
    // --- METADATOS DE ARCHIVO (si aplica) ---
    fileData: {
        originalName: { type: String },
        mimeType: { type: String },
        size: { type: Number },
        driveId: { type: String },  // Si se sube a Google Drive
        url: { type: String }
    },
    
    // --- ESTADO ---
    isDeleted: { type: Boolean, default: false },  // Borrado lógico
    deletedAt: { type: Date },
    
    // --- LECTURAS (Confirmación de lectura tipo WhatsApp) ---
    readBy: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
        readAt: { type: Date, default: Date.now }
    }],
    
    // --- REPLY ---
    replyTo: {
        messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
        content: { type: String },  // Preview del mensaje original
        senderName: { type: String }
    },
    
    // --- REACCIONES (opcional) ---
    reactions: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
        emoji: { type: String },  // Unicode emoji
        createdAt: { type: Date, default: Date.now }
    }],
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ÍNDICES CRÍTICOS
MessageSchema.index({ empresaId: 1, conversationId: 1, createdAt: -1 });  // Historial paginado
MessageSchema.index({ empresaId: 1, senderId: 1, createdAt: -1 });  // Mensajes enviados por usuario
MessageSchema.index({ empresaId: 1, conversationId: 1, 'readBy.userId': 1 });  // No leídos
```

### C. Colección: `ChatPresence` (Estado de Usuarios - Opcional con Redis)
```javascript
// Si usas Redis, esto NO va en MongoDB
// Si NO usas Redis, esta colección es necesaria pero con TTL corto

const ChatPresenceSchema = new mongoose.Schema({
    empresaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true },
    
    status: { type: String, enum: ['online', 'away', 'offline', 'busy'], default: 'offline' },
    lastSeenAt: { type: Date, default: Date.now },
    
    // Socket ID actual (para emitir directamente)
    socketId: { type: String },
    
    // En qué conversación está activo (para "escribiendo...")
    activeConversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    isTyping: { type: Boolean, default: false },
    typingStartedAt: { type: Date }
});

// TTL: Eliminar registro si no se actualiza en 5 minutos
ChatPresenceSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 300 });
```

## 3.2 Estrategia de Aislamiento Multi-Tenant

```javascript
// REGLA DE ORO: TODAS las consultas a chat DEBEN incluir empresaId

// Ejemplo de middleware de seguridad para rutas de chat:
const enforceChatTenantIsolation = (req, res, next) => {
    const userEmpresaId = req.user.empresaId?.toString();
    
    if (!userEmpresaId) {
        return res.status(403).json({ error: 'No se pudo determinar la empresa' });
    }
    
    // Guardar en req para usar en todas las consultas
    req.chatFilter = { empresaId: new mongoose.Types.ObjectId(userEmpresaId) };
    
    // Super Admin puede ver todo, pero en chat interno sigue viendo solo su empresa
    // (para soporte entre empresas se maneja diferente)
    next();
};

// En WebSockets, aplicar MISMO filtro:
const validateSocketTenantAccess = async (socket, conversationId) => {
    const conversation = await Conversation.findOne({
        _id: conversationId,
        empresaId: socket.user.empresaId,  // 🔒 Aislamiento crítico
        'participants.userId': socket.user.id  // Verificar que participa
    });
    return !!conversation;
};
```

---

# 4. MOTOR DE TIEMPO REAL (WebSockets)

## 4.1 Tecnología Recomendada: Socket.io

```bash
# Instalación
npm install socket.io @socket.io/redis-adapter redis
```

## 4.2 Arquitectura del Socket Server

```javascript
// Estructura de archivos recomendada:
/*
socket/
├── index.js              # Inicialización y namespace
├── middleware/
│   └── auth.js           # Validación JWT en conexión
├── handlers/
│   ├── connection.js     # Manejo de conexión/desconexión
│   ├── messages.js       # Enviar/recibir mensajes
│   ├── presence.js       # Escribiendo..., Online/Offline
│   └── rooms.js          # Unirse/salir de conversaciones
└── utils/
    └── broadcast.js      # Helpers de emisión
*/
```

### 4.2.1 Configuración Principal (`socket/index.js`)

```javascript
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

let io;

const initializeSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || "*",
            methods: ["GET", "POST"],
            credentials: true
        },
        // Configuración para reconexión
        pingTimeout: 60000,
        pingInterval: 25000,
        // Namespace para chat (opcional, permite escalabilidad)
        transports: ['websocket', 'polling']
    });

    // Redis Adapter para escalabilidad horizontal (múltiples servidores)
    if (process.env.REDIS_URL) {
        const pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = pubClient.duplicate();
        
        Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
            io.adapter(createAdapter(pubClient, subClient));
            console.log('✅ Socket.io Redis Adapter activado');
        });
    }

    // Namespace específico para chat
    const chatNamespace = io.of('/chat');
    
    // Middleware de autenticación
    chatNamespace.use(require('./middleware/auth'));
    
    // Manejadores de eventos
    chatNamespace.on('connection', (socket) => {
        console.log(`✅ Usuario conectado: ${socket.user.username} (${socket.id})`);
        
        // Cargar handlers
        require('./handlers/connection')(socket, chatNamespace);
        require('./handlers/messages')(socket, chatNamespace);
        require('./handlers/presence')(socket, chatNamespace);
        require('./handlers/rooms')(socket, chatNamespace);
    });

    return io;
};

const getIO = () => {
    if (!io) throw new Error('Socket.io no inicializado');
    return io;
};

module.exports = { initializeSocket, getIO };
```

### 4.2.2 Autenticación en WebSockets (`socket/middleware/auth.js`)

```javascript
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

module.exports = async (socket, next) => {
    try {
        // El token puede venir en query string o en auth header
        const token = socket.handshake.auth.token || 
                       socket.handshake.query.token;
        
        if (!token) {
            return next(new Error('Authentication error: Token requerido'));
        }

        // Verificar JWT (misma lógica que Express)
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Validar que tenga empresaId (requisito para chat multi-tenant)
        if (!decoded.empresaId && !decoded.isSuperAdmin) {
            return next(new Error('Authentication error: Sin contexto de empresa'));
        }
        
        // Adjuntar datos de usuario al socket (disponible en todos los handlers)
        socket.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            empresaId: decoded.empresaId ? new mongoose.Types.ObjectId(decoded.empresaId) : null,
            isSuperAdmin: decoded.isSuperAdmin || false,
            artistaId: decoded.artistaId
        };
        
        // Verificar que el usuario exista y esté activo (opcional pero recomendado)
        const Usuario = require('../../models/Usuario');
        const user = await Usuario.findById(decoded.id).select('isDeleted');
        
        if (!user || user.isDeleted) {
            return next(new Error('Authentication error: Usuario no válido'));
        }
        
        next();
    } catch (error) {
        console.error('[Socket Auth] Error:', error.message);
        next(new Error('Authentication error: Token inválido'));
    }
};
```

### 4.2.3 Manejador de Mensajes (`socket/handlers/messages.js`)

```javascript
const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
const mongoose = require('mongoose');

module.exports = (socket, io) => {
    
    // Enviar mensaje
    socket.on('message:send', async (data, callback) => {
        try {
            const { conversationId, content, type = 'text', replyTo = null } = data;
            
            // 1. VALIDAR PARTICIPACIÓN (seguridad crítica)
            const conversation = await Conversation.findOne({
                _id: conversationId,
                empresaId: socket.user.empresaId,  // 🔒 Aislamiento
                'participants.userId': socket.user.id,
                isActive: true
            });
            
            if (!conversation) {
                return callback?.({ success: false, error: 'Acceso denegado a conversación' });
            }
            
            // 2. CREAR MENSAJE
            const message = new Message({
                empresaId: socket.user.empresaId,
                conversationId,
                senderId: socket.user.id,
                senderName: socket.user.username,
                senderRole: socket.user.role,
                type,
                content,
                replyTo: replyTo ? {
                    messageId: replyTo.messageId,
                    content: replyTo.content,
                    senderName: replyTo.senderName
                } : null
            });
            
            await message.save();
            
            // 3. ACTUALIZAR CONVERSACIÓN (último mensaje + contador)
            await Conversation.updateOne(
                { _id: conversationId },
                {
                    $set: {
                        lastMessage: {
                            messageId: message._id,
                            content: message.content,
                            senderId: message.senderId,
                            senderName: message.senderName,
                            type: message.type,
                            sentAt: message.createdAt
                        },
                        updatedAt: new Date()
                    },
                    $inc: { messageCount: 1, 'participants.$[p].unreadCount': 1 }
                },
                {
                    arrayFilters: [{ 'p.userId': { $ne: socket.user.id } }]
                }
            );
            
            // 4. EMITIR A PARTICIPANTES
            // Obtener socket IDs de participantes conectados
            const participants = conversation.participants.map(p => p.userId.toString());
            
            // Emitir a la sala de la conversación
            io.to(`conversation:${conversationId}`).emit('message:received', {
                message: {
                    _id: message._id,
                    conversationId: message.conversationId,
                    senderId: message.senderId,
                    senderName: message.senderName,
                    content: message.content,
                    type: message.type,
                    createdAt: message.createdAt,
                    replyTo: message.replyTo
                }
            });
            
            // Notificar a cada participante para actualizar lista de conversaciones
            participants.forEach(userId => {
                if (userId !== socket.user.id.toString()) {
                    io.to(`user:${userId}`).emit('conversation:updated', {
                        conversationId,
                        lastMessage: message.content,
                        timestamp: message.createdAt
                    });
                }
            });
            
            callback?.({ success: true, messageId: message._id });
            
        } catch (error) {
            console.error('[Socket:sendMessage] Error:', error);
            callback?.({ success: false, error: 'Error al enviar mensaje' });
        }
    });
    
    // Marcar como leído
    socket.on('message:read', async (data) => {
        const { conversationId, messageIds } = data;
        
        // Validar acceso
        const hasAccess = await Conversation.exists({
            _id: conversationId,
            empresaId: socket.user.empresaId,
            'participants.userId': socket.user.id
        });
        
        if (!hasAccess) return;
        
        // Actualizar mensajes
        await Message.updateMany(
            {
                _id: { $in: messageIds },
                conversationId,
                empresaId: socket.user.empresaId,
                'readBy.userId': { $ne: socket.user.id }
            },
            {
                $push: {
                    readBy: { userId: socket.user.id, readAt: new Date() }
                }
            }
        );
        
        // Resetear contador de no leídos del usuario
        await Conversation.updateOne(
            { _id: conversationId, 'participants.userId': socket.user.id },
            { $set: { 'participants.$.unreadCount': 0, 'participants.$.lastReadAt': new Date() } }
        );
        
        // Notificar a otros participantes (para actualizar check de leído)
        socket.to(`conversation:${conversationId}`).emit('message:readReceipt', {
            conversationId,
            messageIds,
            readBy: socket.user.id
        });
    });
};
```

### 4.2.4 Manejador de Presencia (`socket/handlers/presence.js`)

```javascript
module.exports = (socket, io) => {
    
    // Usuario conectado - unirse a sala personal
    socket.join(`user:${socket.user.id}`);
    
    // Notificar a contactos que está online
    socket.broadcast.emit('user:online', {
        userId: socket.user.id,
        timestamp: new Date()
    });
    
    // Escribiendo...
    let typingTimeout;
    
    socket.on('typing:start', (data) => {
        const { conversationId } = data;
        
        // Notificar a otros en la conversación
        socket.to(`conversation:${conversationId}`).emit('typing:update', {
            conversationId,
            userId: socket.user.id,
            username: socket.user.username,
            isTyping: true
        });
        
        // Auto-detener después de 5 segundos si no hay actividad
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.to(`conversation:${conversationId}`).emit('typing:update', {
                conversationId,
                userId: socket.user.id,
                isTyping: false
            });
        }, 5000);
    });
    
    socket.on('typing:stop', (data) => {
        const { conversationId } = data;
        clearTimeout(typingTimeout);
        
        socket.to(`conversation:${conversationId}`).emit('typing:update', {
            conversationId,
            userId: socket.user.id,
            isTyping: false
        });
    });
    
    // Desconexión
    socket.on('disconnect', (reason) => {
        console.log(`❌ Usuario desconectado: ${socket.user.username} (${reason})`);
        
        socket.broadcast.emit('user:offline', {
            userId: socket.user.id,
            timestamp: new Date()
        });
    });
};
```

### 4.2.5 Manejador de Rooms (`socket/handlers/rooms.js`)

```javascript
const Conversation = require('../../models/Conversation');

module.exports = (socket, io) => {
    
    // Unirse a una conversación (cuando usuario abre el chat)
    socket.on('room:join', async (data, callback) => {
        const { conversationId } = data;
        
        // Verificar acceso
        const hasAccess = await Conversation.exists({
            _id: conversationId,
            empresaId: socket.user.empresaId,
            'participants.userId': socket.user.id
        });
        
        if (!hasAccess) {
            return callback?.({ success: false, error: 'Acceso denegado' });
        }
        
        // Unirse a la sala
        socket.join(`conversation:${conversationId}`);
        
        // Notificar a otros que entró
        socket.to(`conversation:${conversationId}`).emit('user:joined', {
            userId: socket.user.id,
            username: socket.user.username
        });
        
        callback?.({ success: true });
    });
    
    // Salir de una conversación (cuando cierra/minimiza)
    socket.on('room:leave', (data) => {
        const { conversationId } = data;
        
        socket.leave(`conversation:${conversationId}`);
        
        socket.to(`conversation:${conversationId}`).emit('user:left', {
            userId: socket.user.id,
            username: socket.user.username
        });
    });
};
```

## 4.3 Integración con server.js

```javascript
// En server.js, modificar la inicialización del servidor:

const { initializeSocket } = require('./socket');

// ... después de mongoose.connect ...

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});

// Inicializar Socket.io
initializeSocket(server);

// El graceful shutdown existente manejará el cierre correctamente
```

---

# 5. SEGURIDAD Y PERMISOS

## 5.1 Validación de Tokens en WebSockets

```javascript
// El middleware de auth.js ya implementa esto, pero resumen:

// 1. Token viene en handshake.auth.token (recomendado) o query.token
// 2. jwt.verify() con mismo SECRET que Express
// 3. Verificar que el usuario exista y no esté eliminado
// 4. Adjuntar datos al socket para uso en handlers
// 5. Rechazar conexión si falla cualquier paso
```

## 5.2 Permisos por Rol

```javascript
// Middleware de permisos para eventos de socket

const checkChatPermission = (requiredRole) => {
    return (socket, next) => {
        const userRole = socket.user.role;
        
        // Roles: 'cliente', 'ingeniero', 'admin', 'diseñador'
        // Chat interno: solo empleados (ingeniero, admin, diseñador)
        // Soporte: cliente puede iniciar, empleados responden
        
        const roleHierarchy = {
            'cliente': 1,
            'diseñador': 2,
            'ingeniero': 3,
            'admin': 4,
            'superadmin': 5
        };
        
        if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
            return next(new Error(`Permiso denegado: se requiere rol ${requiredRole}`));
        }
        
        next();
    };
};

// Uso en handlers específicos:
socket.on('support:createTicket', checkChatPermission('cliente'), async (data) => {
    // Crear ticket de soporte
});
```

## 5.3 Aislamiento Estricto de Datos

```javascript
// CAPA 1: Middleware de conexión (socket/middleware/auth.js)
// - Valida JWT y extrae empresaId

// CAPA 2: Validación en cada operación
// - Siempre filtrar por socket.user.empresaId

// CAPA 3: Verificar participación en conversación
// - Nunca permitir enviar mensaje a conversación donde no participa

// EJEMPLO DE QUERY SEGURA:
const messages = await Message.find({
    conversationId: convId,
    empresaId: socket.user.empresaId,  // 🔒 SIEMPRE incluir
    isDeleted: false
}).sort({ createdAt: -1 }).limit(50);
```

---

# 6. CUELLOS DE BOTELLA Y SOLUCIONES

## 6.1 Identificación de Problemas

| Problema | Impacto | Solución |
|----------|---------|----------|
| **Sin Redis** | Mensajes se pierden si servidor reinicia; sin escalabilidad horizontal | Agregar Redis como message broker y adapter |
| **maxPoolSize: 10** | Limitado para render free tier, puede saturarse con muchos sockets | Monitorear, aumentar si es posible o implementar colas |
| **Sin TTL en presencia** | Documentos de "online" se acumulan en MongoDB | Implementar TTL de 5 minutos o usar Redis |
| **index.html grande (78KB)** | SPA monolítica, carga todo de golpe | Code splitting o lazy loading del módulo chat |
| **Poll de proyectos** | Cada usuario consulta MongoDB frecuentemente | Cachear en Redis, usar sockets para actualizaciones |

## 6.2 Soluciones Implementables

### A. Persistencia de Mensajes ante Reinicio
```javascript
// OPCIÓN 1: Redis como cola temporal
// Los mensajes se encolan en Redis antes de guardar en MongoDB
// Si el servidor cae, otro worker puede procesar la cola

// OPCIÓN 2: Acknowledgment del cliente
// Cliente reintenta enviar mensaje si no recibe confirmación en 5s
// MongoDB deduplica por _id (idempotente)
```

### B. Escalabilidad Horizontal
```javascript
// Con Redis Adapter, múltiples servidores Node.js pueden:
// 1. Recibir conexiones WebSocket
// 2. Sincronizar mensajes entre servidores
// 3. Mantener estado global de usuarios

// Sin Redis, estás limitado a un solo servidor
```

### C. Rate Limiting en WebSockets
```javascript
// Implementar limitación por usuario:
const userMessageCounts = new Map();  // En Redis en producción

socket.on('message:send', async (data, callback) => {
    const userId = socket.user.id;
    const now = Date.now();
    
    // Limpiar contadores antiguos (> 1 minuto)
    if (!userMessageCounts.has(userId)) {
        userMessageCounts.set(userId, []);
    }
    
    const timestamps = userMessageCounts.get(userId).filter(t => now - t < 60000);
    
    if (timestamps.length > 30) {  // Max 30 mensajes por minuto
        return callback?.({ success: false, error: 'Rate limit excedido' });
    }
    
    timestamps.push(now);
    userMessageCounts.set(userId, timestamps);
    
    // ... continuar con envío
});
```

---

# 7. ESTRUCTURA DE CARPETAS RECOMENDADA

```
FiaRecords_Servidor_Final/
├── server.js                          # Modificado para incluir Socket.io
├── socket/                            # NUEVO: Módulo de tiempo real
│   ├── index.js                       # Inicialización
│   ├── middleware/
│   │   └── auth.js                    # Validación JWT sockets
│   ├── handlers/
│   │   ├── connection.js              # Connect/disconnect
│   │   ├── messages.js                # Enviar/recibir mensajes
│   │   ├── presence.js                # Escribiendo..., online/offline
│   │   ├── rooms.js                   # Unirse/salir conversaciones
│   │   └── support.js                 # Lógica específica de soporte
│   └── utils/
│       └── broadcast.js               # Helpers de emisión
├── models/                            # NUEVOS MODELOS
│   ├── Conversation.js                # Conversaciones
│   ├── Message.js                     # Mensajes
│   └── ChatPresence.js                # Estado online (si no usas Redis)
├── routes/                            # NUEVAS RUTAS HTTP (para REST API)
│   ├── chat.js                        # GET /api/chat/conversations, /messages
│   └── support.js                     # GET /api/support/tickets
├── controllers/                       # NUEVOS CONTROLLERS
│   ├── chatController.js              # Lógica de consulta de historial
│   └── supportController.js           # Gestión de tickets
├── public/js/                         # NUEVOS ARCHIVOS FRONTEND
│   ├── chat/
│   │   ├── ChatManager.js             # Clase principal del chat
│   │   ├── SocketClient.js            # Cliente Socket.io
│   │   ├── MessageRenderer.js         # Renderizar mensajes en UI
│   │   ├── ConversationList.js        # Lista de conversaciones
│   │   └── SupportWidget.js           # Widget de soporte para clientes
│   └── components/
│       └── ChatModal.js               # Componente UI (si usas modales)
├── services/                          # NUEVOS SERVICIOS
│   ├── chatService.js                   # Lógica de negocio chat
│   └── notificationService.js           # Notificaciones push/email
├── validations/
│   └── chat.validation.js               # Esquemas Joi para chat
└── middleware/
    └── chatAuth.js                      # Middleware HTTP para rutas chat
```

---

# 8. DEPENDENCIAS RECOMENDADAS

## 8.1 Instalación

```bash
# Core de WebSockets
npm install socket.io

# Redis (para escalabilidad y estado efímero)
npm install redis @socket.io/redis-adapter

# Opcional: manejo de archivos en chat
npm install sharp  # Procesar imágenes
npm install multer  # Ya instalado, para uploads

# Opcional: notificaciones push
npm install web-push

# Monitoreo (opcional pero recomendado)
npm install pm2  # Gestión de procesos
```

## 8.2 Variables de Entorno (.env)

```bash
# === EXISTENTES ===
PORT=5000
MONGO_URI=mongodb+srv://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
FRONTEND_URL=https://...

# === NUEVAS PARA CHAT ===
# Redis (opcional pero recomendado)
REDIS_URL=redis://localhost:6379

# Socket.io
SOCKET_CORS_ORIGIN=https://fiarecords-app.onrender.com
SOCKET_PING_TIMEOUT=60000
SOCKET_PING_INTERVAL=25000

# Rate limiting chat (más permisivo que auth)
CHAT_RATE_LIMIT_WINDOW=60000
CHAT_RATE_LIMIT_MAX_REQUESTS=30

# Límites de mensajes
MAX_MESSAGE_LENGTH=2000
MAX_FILE_SIZE_MB=10
```

---

# 9. FLUJO DE DATOS: CHAT INTERNO

```
1. EMPLEADO A abre chat
   ↓
2. Frontend: Socket.io connect con JWT
   ↓
3. Backend: Middleware valida token, extrae empresaId
   ↓
4. Backend: socket.join(`user:${userId}`)
   ↓
5. EMPLEADO A selecciona conversación con EMPLEADO B
   ↓
6. Frontend: socket.emit('room:join', { conversationId })
   ↓
7. Backend: Verifica que A participa en conversación + empresaId
   ↓
8. Backend: socket.join(`conversation:${conversationId}`)
   ↓
9. EMPLEADO A escribe mensaje
   ↓
10. Frontend: socket.emit('message:send', { conversationId, content })
   ↓
11. Backend: Valida acceso (empresaId + participación)
   ↓
12. Backend: Guarda mensaje en MongoDB con empresaId
   ↓
13. Backend: Actualiza Conversation.lastMessage
   ↓
14. Backend: io.to(`conversation:${id}`).emit('message:received', {...})
   ↓
15. Frontend EMPLEADO B: Recibe evento y renderiza mensaje
   ↓
16. EMPLEADO B: socket.emit('message:read', { messageIds })
   ↓
17. Backend: Actualiza Message.readBy + notifica a A
```

---

# 10. FLUJO DE DATOS: CHAT DE SOPORTE (CLIENTE → EMPLEADO)

```
1. CLIENTE abre widget de soporte
   ↓
2. Backend: Si no tiene conversación de soporte activa, crear una:
   Conversation.type = 'support', isSupportTicket = true
   ↓
3. CLIENTE envía mensaje (mismo flujo que chat interno)
   ↓
4. Backend: Adicionalmente notificar a EMPLEADOS de soporte
   io.to(`empresa:${empresaId}:support`).emit('support:newMessage', {...})
   ↓
5. Sistema de notificación push/email (opcional)
   ↓
6. EMPLEADO responde (mismo flujo)
   ↓
7. CLIENTE recibe mensaje
   ↓
8. EMPLEADO puede "resolver" ticket:
   socket.emit('support:resolve', { conversationId })
   ↓
9. Backend: Conversation.supportStatus = 'resolved'
```

---

# 11. RECOMENDACIONES FINALES

## Prioridad Alta (Implementar Primero)

1. **Crear modelos MongoDB** (`Conversation`, `Message`)
2. **Implementar autenticación Socket.io** (middleware)
3. **Flujo básico: enviar/recibir mensajes**
4. **Aislamiento por empresa en TODAS las consultas**

## Prioridad Media (Segunda Fase)

5. **Indicador "escribiendo..."**
6. **Confirmación de lectura (check doble)**
7. **Lista de conversaciones con último mensaje**
8. **Notificaciones de nuevos mensajes**

## Prioridad Baja (Tercera Fase)

9. **Redis para escalabilidad**
10. **Envío de archivos/imágenes**
11. **Búsqueda en historial**
12. **Reacciones a mensajes**

---

## ⚠️ Advertencias Críticas

1. **NUNCA** omitir `empresaId` en queries de chat
2. **SIEMPRE** verificar que el usuario participa en la conversación antes de emitir mensajes
3. **NUNCA** confiar en `conversationId` enviado por cliente sin validación
4. **SIEMPRE** usar `socket.to()` (excluir emisor) para "escribiendo..." y lecturas
5. **NUNCA** exponer lista de todos los usuarios online (solo contactos relevantes)

---

**Fin del Reporte Técnico**

*Documento generado para FiaRecords - Arquitectura de Chat Multi-Tenant*
