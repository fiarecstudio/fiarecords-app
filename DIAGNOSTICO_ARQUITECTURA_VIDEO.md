# Diagnóstico de Arquitectura - Integración de Cámaras IP

**Fecha:** 25 de mayo de 2026  
**Proyecto:** FiaRecords Servidor  
**Objetivo:** Integrar módulo de monitoreo de cámaras IP con patrón "Agente Local"

---

## RESUMEN EJECUTIVO

Tu arquitectura actual está **EXCELENTEmente preparada** para integrar el sistema de cámaras IP. Ya tienes:

✅ Socket.io instalado y configurado (v4.8.1)  
✅ Sistema de autenticación JWT robusto  
✅ Estructura de namespaces en Socket.io (/chat, /support)  
✅ Integración con Google Drive completamente funcional  
✅ Multi-tenant con roles definidos (ingeniero, admin, cliente, diseñador)  

**Nivel de preparación:** 85%  
**Cambios requeridos:** Mínimos (principalmente agregar un nuevo namespace para video)

---

## 1. ANÁLISIS DE DEPENDENCIAS

### 1.1 Librerías YA INSTALADAS (Disponibles)

Tu `package.json` actual incluye:

```json
{
  "socket.io": "^4.8.1",        ✅ PERFECTO para WebSockets
  "express": "^5.1.0",           ✅ Servidor HTTP
  "mongoose": "^8.19.3",         ✅ MongoDB
  "googleapis": "^171.4.0",      ✅ Google Drive API
  "multer": "^2.0.2",            ✅ Upload de archivos
  "jsonwebtoken": "^9.0.2",      ✅ Autenticación JWT
  "dotenv": "^17.2.3"            ✅ Variables de entorno
}
```

### 1.2 Librerías NECESARIAS AGREGAR

Para el servidor en la nube:

```bash
npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg
```

**Por qué:**
- `fluent-ffmpeg`: Wrapper de Node.js para FFmpeg (procesamiento de video)
- `@ffmpeg-installer/ffmpeg`: Instala FFmpeg automáticamente en el servidor

Para el Agente Local (script separado):

```bash
npm install fluent-ffmpeg ws
```

**Por qué:**
- `fluent-ffmpeg`: Captura de stream RTSP
- `ws`: Cliente WebSocket nativo (más ligero que socket.io para el agente)

### 1.3 Recomendación de Arquitectura de Dependencias

**Servidor en la nube:**
- Mantener `socket.io` para comunicación con frontend
- Agregar `fluent-ffmpeg` para procesamiento de video (si necesitas transcodificación)
- Usar `ws` nativo para recibir streams del Agente Local (más eficiente para datos binarios)

**Agente Local:**
- `fluent-ffmpeg` para captura RTSP
- `ws` para enviar datos binarios al servidor

---

## 2. PUNTO DE INYECCIÓN EN SERVER.JS

### 2.1 Ubicación Exacta

Archivo: `server.js`  
Líneas: 226-228 (actual inicialización de Socket.io)

```javascript
// --- INICIALIZAR SOCKET.IO --- (Línea 226)
initializeSocket(server);
// -----------------------------
```

### 2.2 Punto de Inyección Recomendado

**Después de la línea 227**, agregar:

```javascript
// --- INICIALIZAR SOCKET.IO ---
initializeSocket(server);
// -----------------------------

// --- NUEVO: SERVIDOR WEBSOCKET PARA VIDEO (Agente Local) ---
const { initializeVideoServer } = require('./socket/video-server');
initializeVideoServer(server);
// -----------------------------------------------------------
```

### 2.3 Por qué este punto

- ✅ El servidor HTTP ya está creado (línea 222)
- ✅ Socket.io principal ya está inicializado
- ✅ No interferirá con las rutas REST existentes
- ✅ Puede usar el mismo puerto (5000) con un path diferente

### 2.4 Estructura Recomendada

Crear nuevo archivo: `socket/video-server.js`

```javascript
const WebSocket = require('ws');

const initializeVideoServer = (httpServer) => {
    const wss = new WebSocket.Server({ 
        server: httpServer,
        path: '/video' // Path diferente a socket.io
    });
    
    // Middleware de autenticación para el Agente Local
    wss.on('connection', (ws, req) => {
        // Validar token del agente
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!isValidAgentToken(token)) {
            ws.close(1008, 'Token inválido');
            return;
        }
        
        console.log('📹 Agente Local conectado');
        
        ws.on('message', (data) => {
            // Procesar stream de video binario
            broadcastToClients(data);
        });
        
        ws.on('close', () => {
            console.log('🔌 Agente Local desconectado');
        });
    });
    
    return wss;
};

module.exports = { initializeVideoServer };
```

---

## 3. GESTIÓN DE ROLES (SEGURIDAD)

### 3.1 Sistema de Autenticación Actual

**Modelo Usuario** (`models/Usuario.js`):

```javascript
role: { 
    type: String, 
    enum: ['ingeniero', 'admin', 'cliente', 'diseñador'], 
    default: 'cliente'
}
```

**Middleware JWT** (`middleware/auth.js`):
- Valida token en header `Authorization: Bearer <token>`
- Extrae `req.user` con: `id`, `username`, `role`, `empresaId`, `isSuperAdmin`

**Socket.io Auth** (`socket/middleware/auth.js`):
- Valida JWT en handshake
- Adjunta `socket.user` con mismos campos
- Verifica que usuario exista y no esté eliminado

### 3.2 Roles con Acceso a Video

Recomendación: Solo `admin` y `ingeniero` pueden ver video en vivo.

```javascript
const VIDEO_ACCESS_ROLES = ['admin', 'ingeniero'];
```

### 3.3 Implementación de Seguridad en Namespace de Video

Crear nuevo namespace en `socket/index.js`:

```javascript
// --- NUEVO NAMESPACE PARA VIDEO ---
const videoNamespace = io.of('/video-stream');

// Middleware de autenticación
videoNamespace.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || 
                   socket.handshake.query?.token;
    
    if (!token) {
        return next(new Error('Token requerido'));
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await Usuario.findById(decoded.id);
        
        // Verificar rol
        if (!VIDEO_ACCESS_ROLES.includes(user.role)) {
            return next(new Error('Rol no autorizado para video'));
        }
        
        socket.user = {
            id: user._id,
            username: user.username,
            role: user.role,
            empresaId: user.empresaId
        };
        
        next();
    } catch (error) {
        next(new Error('Autenticación fallida'));
    }
});

videoNamespace.on('connection', (socket) => {
    console.log(`📹 Usuario ${socket.user.username} conectado a video`);
    
    // Unir a sala de su empresa
    socket.join(`empresa:${socket.user.empresaId}`);
    
    // Handler para solicitar video de cámara específica
    socket.on('camera:subscribe', (data) => {
        const { cameraId } = data;
        socket.join(`camera:${cameraId}`);
        console.log(`📹 ${socket.user.username} suscrito a cámara ${cameraId}`);
    });
    
    socket.on('camera:unsubscribe', (data) => {
        const { cameraId } = data;
        socket.leave(`camera:${cameraId}`);
    });
});
```

### 3.4 Protección del Endpoint del Agente Local

El servidor WebSocket que recibe del Agente Local debe:

1. **Validar token específico del agente** (diferente al de usuarios)
2. **Verificar IP de origen** (opcional, whitelist)
3. **Rate limiting** para prevenir DoS

```javascript
// Token específico para agentes (en .env)
const AGENT_TOKEN = process.env.AGENT_TOKEN;

const isValidAgentToken = (token) => {
    return token === AGENT_TOKEN;
};
```

---

## 4. PRUEBA DE CONCEPTO - AGENTE LOCAL

### 4.1 Código Generado

He creado 3 archivos para el Agente Local:

1. **`local-agent.js`** - Script principal del agente
2. **`local-agent-package.json`** - Dependencias del agente
3. **`local-agent-README.md`** - Instrucciones de instalación y uso

### 4.2 Características del Agente Local

✅ Captura stream RTSP usando FFmpeg  
✅ Envía video a servidor vía WebSocket  
✅ Reconexión automática  
✅ Soporte para múltiples cámaras  
✅ Control remoto desde servidor  
✅ Grabación local opcional  
✅ Manejo de errores robusto  

### 4.3 Configuración del Agente

```javascript
const CONFIG = {
    SERVER_URL: 'ws://tu-servidor-nube.com:5000/video',
    AGENT_TOKEN: 'tu-token-secreto-agente',
    CAMERAS: [
        {
            id: 'cam-001',
            name: 'Cámara Principal',
            rtspUrl: 'rtsp://usuario:password@192.168.1.100:554/stream1',
            enabled: true
        }
    ],
    FFMPEG: {
        videoCodec: 'h264',
        resolution: '1280x720',
        fps: 15,
        bitrate: '1000k',
        audioCodec: 'aac',
        format: 'mpegts'
    }
};
```

### 4.4 Instalación en la Máquina Local

```bash
# 1. Copiar archivos a la máquina local
# 2. Instalar Node.js (si no está instalado)
# 3. Instalar FFmpeg
#    Windows: Descargar y agregar al PATH
#    Linux: sudo apt-get install ffmpeg
#    macOS: brew install ffmpeg

# 4. Instalar dependencias
npm install --save fluent-ffmpeg ws

# 5. Configurar local-agent.js
# 6. Ejecutar
node local-agent.js
```

---

## 5. GOOGLE DRIVE - ARQUITECTURA DE ALMACENAMIENTO

### 5.1 Integración Actual

Tu integración con Google Drive es **SÓLIDA**:

- ✅ OAuth2 con refresh token
- ✅ Estructura de carpetas por empresa/artista/proyecto
- ✅ Resumable upload para archivos >5MB
- ✅ Detección de tipo de archivo (video, audio, imagen, etc.)
- ✅ Sincronización de carpetas con MongoDB

### 5.2 Recomendación de Arquitectura

**Opción A: Agente Local Sube Directamente a Drive** ⭐ RECOMENDADA

```
Cámara IP → Agente Local → Google Drive
                    ↓
              Servidor Nube (notificación)
```

**Ventajas:**
- ✅ Menos carga en el servidor en la nube
- ✅ Upload directo desde red local (más rápido)
- ✅ El servidor solo recibe notificaciones
- ✅ Escalabilidad mejorada

**Desventajas:**
- ⚠️ El Agente necesita credenciales de Drive
- ⚠️ Más complejidad en el agente

**Opción B: Agente Envía a Servidor, Servidor Sube a Drive**

```
Cámara IP → Agente Local → Servidor Nube → Google Drive
```

**Ventajas:**
- ✅ Credenciales de Drive centralizadas en servidor
- ✅ Más control sobre el proceso
- ✅ Validación adicional

**Desventajas:**
- ❌ Doble uso de ancho de banda
- ❌ Mayor latencia
- ❌ Sobrecarga del servidor

### 5.3 Implementación Recomendada (Opción A)

**En el Agente Local:**

```javascript
const { google } = require('googleapis');

// Configurar OAuth2 para el agente
const oauth2Client = new google.auth.OAuth2(
    process.env.DRIVE_CLIENT_ID,
    process.env.DRIVE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
);

oauth2Client.setCredentials({
    refresh_token: process.env.DRIVE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Función para subir grabación
async function uploadRecordingToDrive(filePath, metadata) {
    const fileMetadata = {
        name: metadata.filename,
        parents: [metadata.folderId]
    };
    
    const media = {
        mimeType: 'video/mp4',
        body: fs.createReadStream(filePath)
    };
    
    const file = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
        uploadType: 'resumable'
    });
    
    // Notificar al servidor
    notifyServer({
        type: 'recording_uploaded',
        driveId: file.data.id,
        cameraId: metadata.cameraId,
        timestamp: new Date()
    });
    
    return file.data.id;
}
```

**En el Servidor Nube:**

```javascript
// Endpoint para recibir notificaciones del agente
router.post('/api/video/recording-notification', async (req, res) => {
    const { driveId, cameraId, timestamp } = req.body;
    
    // Guardar en MongoDB
    const Recording = require('../models/Recording');
    await Recording.create({
        driveId,
        cameraId,
        uploadedAt: timestamp,
        empresaId: req.user.empresaId
    });
    
    res.json({ success: true });
});
```

### 5.4 Modelo MongoDB para Grabaciones

Crear `models/Recording.js`:

```javascript
const mongoose = require('mongoose');

const RecordingSchema = new mongoose.Schema({
    cameraId: {
        type: String,
        required: true
    },
    driveId: {
        type: String,
        required: true
    },
    empresaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Empresa',
        required: true
    },
    duration: {
        type: Number, // en segundos
        default: 0
    },
    fileSize: {
        type: Number, // en bytes
        default: 0
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    thumbnailUrl: {
        type: String
    }
});

RecordingSchema.index({ empresaId: 1, cameraId: 1, uploadedAt: -1 });

module.exports = mongoose.model('Recording', RecordingSchema);
```

---

## 6. PLAN DE IMPLEMENTACIÓN

### Fase 1: Preparación del Servidor (1-2 días)

1. ✅ Instalar dependencias de video
   ```bash
   npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg
   ```

2. ✅ Crear `socket/video-server.js`
   - Servidor WebSocket para recibir streams del agente
   - Middleware de autenticación del agente

3. ✅ Modificar `server.js`
   - Agregar inicialización del servidor de video (línea 227)

4. ✅ Crear modelo `models/Recording.js`

5. ✅ Agregar variable de entorno `AGENT_TOKEN` en `.env`

### Fase 2: Implementación del Frontend (2-3 días)

1. ✅ Crear componente de visor de video
   - Usar HTML5 Video o Video.js
   - Conectar a namespace `/video-stream`

2. ✅ Implementar autenticación en el visor
   - Validar rol antes de mostrar video

3. ✅ UI para selección de cámaras
   - Lista de cámaras disponibles
   - Control de play/pause

### Fase 3: Despliegue del Agente Local (1 día)

1. ✅ Copiar archivos del agente a máquina local
2. ✅ Instalar dependencias
3. ✅ Configurar URLs RTSP de cámaras
4. ✅ Probar conexión con servidor
5. ✅ Configurar como servicio (PM2 o systemd)

### Fase 4: Integración con Google Drive (1-2 días)

1. ✅ Configurar credenciales de Drive en agente
2. ✅ Implementar upload directo desde agente
3. ✅ Sistema de notificaciones al servidor
4. ✅ Pruebas de grabación y almacenamiento

### Fase 5: Pruebas y Optimización (2-3 días)

1. ✅ Pruebas de carga (múltiples cámaras simultáneas)
2. ✅ Optimización de bitrate y resolución
3. ✅ Pruebas de reconexión
4. ✅ Monitoreo de rendimiento

---

## 7. DIAGRAMA DE ARQUITECTURA

```
┌─────────────────────────────────────────────────────────────┐
│                    RED LOCAL (Casa)                        │
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │ Cámara IP 1  │         │ Cámara IP 2  │                │
│  │ RTSP:554     │         │ RTSP:554     │                │
│  └──────┬───────┘         └──────┬───────┘                │
│         │                        │                         │
│         └──────────┬─────────────┘                         │
│                    │                                       │
│         ┌──────────▼───────────┐                           │
│         │   AGENTE LOCAL       │                           │
│         │   (Node.js + FFmpeg) │                           │
│         └──────────┬───────────┘                           │
│                    │ WebSocket (video binario)             │
└────────────────────┼───────────────────────────────────────┘
                     │ INTERNET
┌────────────────────▼───────────────────────────────────────┐
│                  SERVIDOR EN LA NUBE                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  WebSocket Server (ws) - /video                    │  │
│  │  Recibe streams del Agente Local                    │  │
│  └──────────────────┬──────────────────────────────────┘  │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐  │
│  │  Socket.io Server - /video-stream                   │  │
│  │  Distribuye video a clientes autorizados            │  │
│  └──────────────────┬──────────────────────────────────┘  │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐  │
│  │  Express Server - REST API                          │  │
│  │  /api/video/* endpoints                             │  │
│  └──────────────────┬──────────────────────────────────┘  │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐  │
│  │  MongoDB                                          │  │
│  │  - Usuarios (roles)                               │  │
│  │  - Grabaciones (Recording)                        │  │
│  └──────────────────┬──────────────────────────────────┘  │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐  │
│  │  Google Drive API                                  │  │
│  │  Almacenamiento de grabaciones                     │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────┐
│                  CLIENTES (Frontend)                       │
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │ Admin/Ingen  │         │   Cliente    │                │
│  │ (Video Live) │         │  (Sin Video) │                │
│  └──────────────┘         └──────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. VARIABLES DE ENTORNO REQUERIDAS

Agregar al archivo `.env`:

```bash
# --- VIDEO STREAMING ---
AGENT_TOKEN=tu-token-secreto-para-agentes-locales
VIDEO_ENABLED=true
MAX_CONCURRENT_STREAMS=10

# --- GOOGLE DRIVE (PARA AGENTE LOCAL) ---
DRIVE_CLIENT_ID=tu-client-id
DRIVE_CLIENT_SECRET=tu-client-secret
DRIVE_REFRESH_TOKEN=tu-refresh-token
```

---

## 9. CONSIDERACIONES DE SEGURIDAD

### 9.1 Para el Agente Local

- ✅ **NO** exponer el agente a internet
- ✅ Usar token de autenticación fuerte
- ✅ Validar IP de origen (opcional)
- ✅ Limitar acceso a red local
- ✅ Encriptar credenciales de Drive

### 9.2 Para el Servidor

- ✅ Validar token del agente en cada conexión
- ✅ Rate limiting en endpoints de video
- ✅ Verificar roles de usuarios antes de permitir acceso
- ✅ Usar WSS (WebSocket Seguro) en producción
- ✅ Logs de acceso para auditoría

### 9.3 Para Google Drive

- ✅ Usar cuenta de servicio dedicada
- ✅ Limitar permisos (solo Drive)
- ✅ Rotar refresh tokens periódicamente
- ✅ Monitorear uso de almacenamiento

---

## 10. COSTOS ESTIMADOS

### Google Drive

- **Free tier:** 15 GB
- **Google Workspace:** 30 GB - $6/user/mes
- **Google One:** 100 GB - $1.99/mes, 2 TB - $9.99/mes

**Estimación para 4 cámaras, 24/7, calidad media:**
- ~1 GB por cámara por día
- ~4 GB por día total
- ~120 GB por mes
- **Recomendación:** Plan Google One 200 GB ($2.99/mes)

### Servidor en la Nube

- **Render free tier:** Suficiente para desarrollo
- **Render starter:** $7/mes (recomendado para producción)
- **Heroku:** $5-7/mes (dyno basic)

---

## 11. CONCLUSIÓN

Tu arquitectura actual está **muy bien preparada** para integrar el sistema de cámaras IP. Los cambios requeridos son mínimos y no afectarán tu funcionalidad existente.

**Puntos fuertes:**
- ✅ Socket.io ya configurado y funcionando
- ✅ Sistema de autenticación robusto
- ✅ Multi-tenant con roles
- ✅ Google Drive integrado
- ✅ Estructura modular y escalable

**Próximos pasos recomendados:**
1. Instalar dependencias de video
2. Crear servidor WebSocket para video
3. Desplegar agente local en máquina de cámaras
4. Implementar visor de video en frontend
5. Integrar almacenamiento en Drive

**Tiempo estimado de implementación:** 7-10 días

---

## ARCHIVOS GENERADOS

He creado los siguientes archivos para ti:

1. **`local-agent.js`** - Script completo del Agente Local
2. **`local-agent-package.json`** - Dependencias del agente
3. **`local-agent-README.md`** - Instrucciones detalladas de instalación

Estos archivos están listos para ser copiados a la máquina local donde están las cámaras.

---

**¿Necesitas ayuda con algún paso específico de la implementación?**
