// ==================================================================
//               SERVER.JS - CORREGIDO PARA PWA
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
app.use('/auth', require('./routes/auth'));
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- 2. Servir Archivos Estáticos ---
// Mueve tus archivos sw.js, manifest.json, iconos e index.html a una carpeta llamada "public" si es posible.
// Si los tienes en la raíz junto a server.js, esto funciona pero es menos seguro.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname))); 

// --- 2.5 RUTAS EXPLÍCITAS PARA PWA (LA SOLUCIÓN) ---
// Esto fuerza al servidor a enviar el archivo correcto en lugar del HTML
app.get('/sw.js', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'sw.js'));
});

app.get('/manifest.json', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'manifest.json'));
});

// --- 3. Ruta Catch-All (Manejador Final) ---
app.use((req, res, next) => {
    // Si la petición NO es para la API y NO es el service worker, envía el index.html
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/auth')) {
        return res.sendFile(path.resolve(__dirname, 'index.html'));
    }
    next();
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