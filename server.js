require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// --- Middlewares ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- 1. Definición de Rutas de la API ---
// Asegúrate de que las carpetas routes existan. Si alguna no existe, comenta la línea.
app.use('/api/auth', require('./routes/auth')); 
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/artistas', require('./routes/artistas'));
app.use('/api/proyectos', require('./routes/proyectos'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/dashboard', require('./routes/dashboard'));

// --- 2. Archivos Estáticos ---
// Esto sirve tu index.html, script.js y style.css al navegador
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname))); 

// --- 3. Rutas PWA ---
app.get('/sw.js', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'sw.js'));
});
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'manifest.json'));
});

// --- 4. Manejo de Errores API ---
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

// --- 5. Catch-All (Para que cargue la web) ---
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

// --- Conexión y Arranque ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error conexión MongoDB:', err.message);
  });