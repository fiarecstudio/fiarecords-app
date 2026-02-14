// ==================================================================
//             SERVER.JS - CORREGIDO (RUTA CATCH-ALL MEJORADA)
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
// Todas las rutas de la API deben comenzar con /api/
app.use('/api/auth', require('./routes/auth')); 
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- 2. Servir Archivos Estáticos ---
// Sirve archivos de una carpeta 'public' si la tienes, o de la raíz.
// Es una buena práctica tener una carpeta 'public'.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname))); 

// --- 2.5 RUTAS EXPLÍCITAS PARA PWA ---
// Esto asegura que el service worker y el manifest se sirvan correctamente.
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.resolve(__dirname, 'sw.js'));
});

app.get('/manifest.json', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'manifest.json'));
});

// --- 3. Ruta Catch-All (Manejador Final para SPA) ---
// ESTA ES LA CORRECCIÓN CLAVE PARA LAS RECARGAS DE PÁGINA.
// Debe ir al final, después de todas las rutas de API y estáticas.
app.get('*', (req, res) => {
  // Si la petición no empieza con /api/, entonces sirve el index.html
  // Esto permite que el enrutador del frontend (en script.js) maneje la ruta.
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.resolve(__dirname, 'index.html'));
  } else {
    // Si es una llamada a una ruta API que no existe, envía un 404.
    res.status(404).send('Ruta de API no encontrada');
  }
});

// --- Conexión a Base de Datos y Arranque del Servidor ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error fatal de conexión a MongoDB:', err.message);
    process.exit(1);
  });