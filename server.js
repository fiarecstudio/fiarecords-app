// ==================================================================
//             SERVER.JS - VERSIÓN FINAL CORREGIDA
// ==================================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// --- 0. Crear carpeta de uploads si no existe (Para logos/firmas) ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
    console.log('📁 Carpeta "uploads" creada automáticamente.');
}

// --- Middlewares ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- 1. Servir Archivos Estáticos ---
// A) Carpeta de subidas (Logos, Firmas)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// B) Archivos del Frontend (CSS, JS, HTML, Iconos)
// Esto permite que el servidor entregue tu página web
app.use(express.static(__dirname));

// --- 2. Rutas de la API ---
// Asegúrate de que tienes estas carpetas y archivos creados en tu proyecto backend
app.use('/api/auth', require('./routes/auth')); 
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- 3. Rutas para PWA (Service Worker) ---
app.get('/sw.js', (req, res) => res.sendFile(path.resolve(__dirname, 'sw.js')));
app.get('/manifest.json', (req, res) => res.sendFile(path.resolve(__dirname, 'manifest.json')));

// --- 4. Ruta Catch-All (Para que siempre cargue tu app) ---
app.get('*', (req, res, next) => {
    // Si es una llamada a la API o uploads, pasa al siguiente manejador
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        return next();
    }
    // Si no, envía el index.html (Tu app)
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

// --- Conexión y Arranque ---
// IMPORTANTE: Puerto 3000 para coincidir con script.js
const PORT = process.env.PORT || 3000; 

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error fatal de conexión a MongoDB:', err.message);
  });