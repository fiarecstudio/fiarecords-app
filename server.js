// ==================================================================
//             SERVER.JS - CORREGIDO
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
// Asegúrate de que tu archivo ./routes/auth.js tenga: router.post('/login', ...)
app.use('/api/auth', require('./routes/auth')); 
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- 2. Servir Archivos Estáticos ---
// Sirve archivos de carpeta public y raíz (como script.js, style.css)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname))); 

// --- 2.5 Rutas explícitas para PWA ---
app.get('/sw.js', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'sw.js'));
});
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'manifest.json'));
});

// --- 3. Manejo de Errores de API (CORRECCIÓN CRÍTICA) ---
// Si una ruta empieza con /api/ y no fue capturada arriba, devolvemos 404 JSON.
// Esto evita que el frontend intente leer HTML como JSON.
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada o método incorrecto.' });
});

// --- 4. Ruta Catch-All (Manejador Final para SPA) ---
// Cualquier otra ruta que NO sea API, devuelve el index.html para que el frontend maneje la navegación.
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
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