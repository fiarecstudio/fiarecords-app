// ==================================================================
//      SERVER.JS - SOLUCIÓN DEFINITIVA CON EXPRESIÓN REGULAR
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

// --- Ruta Health Check (Para evitar Cold Starts en Render) ---
// Esta ruta ligera responde "OK" rápidamente. Úsala en cron-job.org
// para hacer ping cada 14 minutos y evitar que el servidor se duerma.
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// --- 2. Definición de Rutas de la API ---
// Todas las peticiones que empiecen con /api serán manejadas aquí.
app.use('/api/auth', require('./routes/auth')); 
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- NUEVA RUTA INTEGRADA PARA EL MÓDULO DE DEUDAS ---
app.use('/api/deudas', require('./routes/deudas'));

// --- 3. Servir Archivos Estáticos ---
// Sirve archivos como index.html, style.css, script.js, etc.
app.use(express.static(path.join(__dirname))); 

// --- 4. Ruta Catch-All con EXPRESIÓN REGULAR ---
// Esta ruta usa una expresión regular (/.*/) para capturar CUALQUIER
// petición GET que no haya sido manejada por las rutas de API o de archivos estáticos.
app.get(/.*/, (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

// --- 5. Conexión a Base de Datos y Arranque del Servidor ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    const PORT = process.env.PORT || 10000;
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
