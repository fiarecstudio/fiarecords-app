// ==================================================================
//      SERVER.JS - CORREGIDO FINAL (AJUSTE PARA DEPLOY EN RENDER)
// ==================================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// --- Middlewares Principales ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- 1. Definición de Rutas de la API ---
app.use('/api/auth', require('./routes/auth')); 
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- 2. Servir Archivos Estáticos ---
// Sirve el contenido del directorio actual (donde está tu index.html, etc.)
app.use(express.static(path.join(__dirname))); 

// --- 2.5 RUTAS EXPLÍCITAS PARA PWA ---
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.resolve(__dirname, 'sw.js'));
});

app.get('/manifest.json', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'manifest.json'));
});

// --- 3. Ruta Catch-All (Manejador Final para SPA) ---
// CORRECCIÓN PARA RENDER: Se usa '/*' en lugar de solo '*'
app.get('/*', (req, res) => {
  // Si la petición no es para la API, sirve el index.html
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.resolve(__dirname, 'index.html'));
  } else {
    // Si es una llamada a una ruta API que no existe, envía un 404.
    res.status(404).json({ error: 'Ruta de API no encontrada' });
  }
});

// --- Conexión a Base de Datos y Arranque del Servidor ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error fatal de conexión a MongoDB:', err.message);
    process.exit(1);
  });