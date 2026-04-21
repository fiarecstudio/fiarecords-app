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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- 🛠️ PARCHE PARA EXPRESS 5 ---
// Le damos permiso al guardia para modificar y limpiar las peticiones
app.use((req, res, next) => {
  Object.defineProperty(req, 'query', {
    value: { ...req.query },
    writable: true,
    configurable: true,
    enumerable: true
  });
  next();
});

// --- 2. Middlewares de Seguridad ---
// Ahora sí, el guardia puede trabajar sin que Express lo bloquee
app.use(mongoSanitize()); 

// --- Ruta Health Check ---
app.get('/health', (req, res) => {
  res.status(200).send('OK');
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

// --- 4. Servir Archivos Estáticos ---
app.use(express.static(path.join(__dirname)));

// --- 5. Ruta Catch-All ---
app.get(/.*/, (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

// --- 6. Conexión a Base de Datos y Servidor ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    
    // --- ACTIVAR BACKUP AUTOMÁTICO ---
    const { iniciarCronJob } = require('./utils/backupDatabase');
    iniciarCronJob();
    // ---------------------------------
    
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error fatal de conexión a MongoDB:', err.message);
    process.exit(1);
  });

/* Global Error Handler */
function globalErrorHandlerFIA(err, req, res, next){
    console.error("GLOBAL ERROR:", err.stack || err);
    res.status(500).json({error:"Internal server error"});
}
app.use(globalErrorHandlerFIA);