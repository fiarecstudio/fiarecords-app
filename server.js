// ==================================================================
//               SERVER.JS - VERSIÓN FINAL Y VERIFICADA
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
// El servidor intentará hacer match con estas rutas primero.
app.use('/auth', require('./routes/auth'));
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- 2. Servir Archivos Estáticos ---
// Si una petición no coincide con la API, Express buscará si es un archivo.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// --- 3. Ruta Catch-All (Manejador Final - MÉTODO INFALIBLE CORREGIDO) ---
// Este método no causa el error 'PathError' y ahora distingue las peticiones de API.
app.use((req, res, next) => {
    // Si la petición NO es para la API, envía el index.html
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/auth')) {
        return res.sendFile(path.resolve(__dirname, 'index.html'));
    }
    // Si es una petición a la API que no encontró ruta, pasa al siguiente manejador de errores.
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