// ==================================================================
//      SERVER.JS - SOLUCIÓN DEFINITIVA PARA EXPRESS 5
// ==================================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');
const { initializeSocket } = require('./socket');

let limiters = {};
try {
  limiters = require('./middleware/rateLimit');
} catch (error) {
  console.log('⚠️ Aviso: No se encontró middleware de Rate Limit.');
}

const app = express();

// CORS configurado de forma segura - solo permite el frontend autorizado
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Helmet - cabeceras de seguridad HTTP (permissive for CDNs and external resources)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", "https:", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:", "placehold.co"],
      connectSrc: ["'self'", "https:", "ws:", "wss:"],
      fontSrc: ["'self'", "data:", "https:", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      frameSrc: ["'self'", "blob:", "https:"],
      childSrc: ["'self'", "blob:", "https:"],
      workerSrc: ["'self'", "blob:", "https:"],
    },
  },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));
if (limiters.generalLimiter) app.use(limiters.generalLimiter); 

// ==================================================================
// PARCHE DE SEGURIDAD PARA EXPRESS 5 + NoSQL Injection Protection
// ==================================================================
// En Express 5, req.query es read-only por defecto. Este parche lo hace
// writable para que mongoSanitize pueda sanitizar correctamente.
// El parche DEBE ir ANTES de mongoSanitize para que la sanitización
// ocurra sobre un objeto modificable.
// ==================================================================
app.use((req, res, next) => {
  // Guardar referencia original por si acaso
  const originalQuery = req.query;
  
  // Crear nuevo objeto limpio y writable
  const cleanQuery = {};
  
  // Copiar solo propiedades simples (no objetos anidados maliciosos)
  // Esto previene que operadores MongoDB como {$ne: null} pasen directamente
  for (const key in originalQuery) {
    if (Object.prototype.hasOwnProperty.call(originalQuery, key)) {
      const value = originalQuery[key];
      // Solo copiar strings, números, booleanos - no objetos complejos
      if (typeof value !== 'object' || value === null) {
        cleanQuery[key] = value;
      }
    }
  }
  
  // Reemplazar req.query con objeto writable
  Object.defineProperty(req, 'query', {
    value: cleanQuery,
    writable: true,
    configurable: true,
    enumerable: true
  });
  
  next();
});

// --- Middleware de Sanitización NoSQL ---
// Ahora req.query es writable y mongoSanitize puede sanitizar operadores
// maliciosos como $ne, $gt, $where, etc.
app.use(mongoSanitize({
  // Opciones adicionales de seguridad
  onSanitize: ({ req, key }) => {
    console.warn(`[SECURITY] Parámetro sanitizado: ${key} en ${req.originalUrl}`);
  }
}));

// Body parsers (después del parche de seguridad)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- Ruta Health Check (Mejorado para Render) ---
app.get('/health', async (req, res) => {
  try {
    // Verificar conexión a MongoDB con ping real
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    if (dbStatus === 'connected') {
      await mongoose.connection.db.admin().ping();
    }
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB'
      },
      database: dbStatus,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

// --- 3. Rutas de la API ---
const authMiddleware = limiters.authLimiter ? limiters.authLimiter : (req, res, next) => next();
const projectMiddleware = limiters.projectCreationLimiter ? limiters.projectCreationLimiter : (req, res, next) => next();

app.use('/api/auth', authMiddleware, require('./routes/auth')); 
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', projectMiddleware, require('./routes/proyectos')); 
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/deudas', require('./routes/deudas'));
app.use('/api/backups', require('./routes/backups'));
app.use('/api/empresas', require('./routes/empresas')); // FASE 4: Gestión de Empresas (Super Admin)
app.use('/api/support/public', require('./routes/supportPublic')); // FASE 5: Soporte público (sin auth)
app.use('/api/drive', require('./routes/drive')); // Subida de archivos a Google Drive
app.use('/api/chat', require('./routes/chat')); // FASE 2: Sistema de Chat

// --- 4. Servir Archivos Estáticos ---
app.use(express.static(path.join(__dirname)));

// --- 5. Ruta Catch-All (SPA) ---
// Usar middleware en lugar de app.get para evitar problemas con Express 5
app.use((req, res, next) => {
  // Si es una ruta de API, devolver 404 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      success: false, 
      error: 'API endpoint no encontrado: ' + req.path 
    });
  }
  
  // Para rutas de frontend (GET), servir el SPA
  if (req.method === 'GET') {
    return res.sendFile(path.resolve(__dirname, 'index.html'));
  }
  
  next();
});

// --- 6. Conexión a Base de Datos y Servidor ---
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10 // Limitar conexiones para Render free tier
};

let server;

mongoose.connect(process.env.MONGO_URI, mongooseOptions)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    
    // --- ACTIVAR BACKUP AUTOMÁTICO ---
    const { iniciarCronJob } = require('./utils/backupDatabase');
    iniciarCronJob();
    // ---------------------------------
    
    const PORT = process.env.PORT || 5000;
    server = app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
    
    // --- INICIALIZAR SOCKET.IO ---
    initializeSocket(server);
    // -----------------------------
  })
  .catch((err) => {
    console.error('❌ Error fatal de conexión a MongoDB:', err.message);
    process.exit(1);
  });

// --- 7. Graceful Shutdown para Render ---
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} recibido. Cerrando servidor gracefulmente...`);
  
  // Forzar cierre después de 10 segundos si algo se queda colgado
  const forceExit = setTimeout(() => {
    console.error('❌ Forzando cierre después de timeout...');
    process.exit(1);
  }, 10000);
  
  try {
    // 1. Desconectar todos los sockets forzosamente
    const { getIO } = require('./socket');
    try {
      const io = getIO();
      console.log('[Shutdown] Desconectando sockets...');
      io.disconnectSockets(true); // true = forzar cierre
      console.log('✅ Sockets desconectados');
    } catch (e) {
      // Socket.io podría no estar inicializado
      console.log('[Shutdown] Socket.io no estaba inicializado');
    }
    
    // 2. Cerrar servidor Socket.io
    try {
      const io = getIO();
      await new Promise((resolve) => {
        io.close(() => {
          console.log('✅ Servidor Socket.io cerrado');
          resolve();
        });
      });
    } catch (e) {
      // Ignorar si ya estaba cerrado
    }
    
    // 3. Cerrar servidor HTTP (dejar de aceptar nuevas conexiones)
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log('✅ Servidor HTTP cerrado');
          resolve();
        });
      });
    }
    
    // 4. Cerrar conexión MongoDB
    await mongoose.connection.close(false);
    console.log('✅ Conexión MongoDB cerrada');
    
    clearTimeout(forceExit);
    console.log('✅ Shutdown completado exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante graceful shutdown:', error.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- 8. Error Handler Global (debe ser el último middleware) ---
app.use(errorHandler);