// ==================================================================
//      SERVER.JS - VERSIÓN FINAL CORREGIDA PARA DEPLOY
// ==================================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// --- 1. Middlewares Principales ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- 2. Definición de Rutas de la API ---
// CUALQUIER PETICIÓN QUE EMPIECE CON /api SERÁ MANEJADA AQUÍ PRIMERO
app.use('/api/auth', require('./routes/auth')); 
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- 3. Servir Archivos Estáticos ---
// Express buscará archivos como index.html, style.css, etc., aquí.
app.use(express.static(path.join(__dirname))); 

// --- 4. Ruta Catch-All (Manejador Final para SPA) ---
// ESTA RUTA SOLO SE EJECUTARÁ SI LA PETICIÓN NO FUE CAPTURADA ANTES
// (es decir, no es una ruta de API y no es un archivo estático existente).
// Envía el archivo principal de la aplicación para que el enrutador del frontend se encargue.
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

// --- 5. Conexión a Base de Datos y Arranque del Servidor ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    const PORT = process.env.PORT || 10000; // Render a veces prefiere el puerto 10000
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error fatal de conexión a MongoDB:', err.message);
    process.exit(1);
  });