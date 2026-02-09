const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const auth = require('../middleware/auth');

// 1. Verificar Autenticación primero
router.use(auth);

// Middleware para verificar rol de admin
const adminOnly = (req, res, next) => {
  // Verificación de seguridad para evitar que el servidor se caiga si req.user no existe
  if (!req.user) {
      return res.status(401).json({ error: 'No hay información de usuario. Token inválido.' });
  }
  
  if (req.user.role !== 'admin') { 
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de Admin.' }); 
  }
  next();
};

// APLICAR ADMIN ONLY A TODAS LAS RUTAS DE ABAJO
router.use(adminOnly); 

// --- RUTAS ---

// GET: Obtener todos los usuarios activos
router.get('/', async (req, res) => { 
    try { 
        // Eliminamos isDeleted:false temporalmente para ver SI EXITE ALGO en la BD
        // Si quieres ver solo activos, descomenta la parte de isDeleted
        const d = await Usuario.find({ isDeleted: false }).select('-password'); 
        res.json(d); 
    } catch(e){
        console.error("Error en GET /usuarios:", e); // Esto lo verás en la consola negra del servidor
        res.status(500).json({ error: e.message }); 
    }
});

// GET: Obtener un usuario por ID
router.get('/:id', async (req, res) => { 
    try { 
        const d = await Usuario.findById(req.params.id).select('-password'); 
        if (!d) return res.status(404).json({ error: "Usuario no encontrado" });
        res.json(d); 
    } catch(e){
        console.error("Error en GET /:id:", e);
        res.status(500).json({ error: e.message });
    }
});

// POST: Crear usuario
router.post('/', async (req, res) => { 
    try { 
        // Verificar si ya existe el username antes de intentar guardar
        const existe = await Usuario.findOne({ username: req.body.username });
        if (existe) {
            return res.status(400).json({ error: "El nombre de usuario ya existe." });
        }

        const d = new Usuario(req.body); 
        await d.save(); 
        res.status(201).json(d); 
    } catch(e){
        console.error("Error en POST /usuarios:", e);
        res.status(500).json({ error: e.message }); // Te dirá por qué falló
    }
});

// PUT: Editar usuario
router.put('/:id', async (req, res) => { 
    try { 
        const { username, role, password } = req.body; 
        
        // Primero buscamos el usuario
        const user = await Usuario.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "Usuario no encontrado para editar" });

        // Actualizamos datos básicos
        user.username = username || user.username;
        user.role = role || user.role;

        // Si hay password, lo actualizamos (el hook pre-save del modelo lo encriptará)
        if (password && password.trim() !== "") { 
            user.password = password; 
        }

        await user.save(); // Guardamos para activar el hash del password
        
        // Devolvemos el usuario sin el password
        const userResponse = await Usuario.findById(req.params.id).select('-password');
        res.json(userResponse); 

    } catch(e){
        console.error("Error en PUT /usuarios:", e);
        res.status(500).json({ error: e.message });
    }
});

// DELETE: Eliminado lógico (Papelera)
router.delete('/:id', async (req, res) => { 
    try { 
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: true }); 
        res.status(204).send(); 
    } catch(e){
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// GET: Ver Papelera
router.get('/papelera/all', async (req, res) => { 
    try { 
        const d = await Usuario.find({ isDeleted: true }).select('-password'); 
        res.json(d); 
    } catch(e){
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// PUT: Restaurar de Papelera
router.put('/:id/restaurar', async (req, res) => { 
    try { 
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: false }); 
        res.status(204).send(); 
    } catch(e){
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// DELETE: Borrar permanentemente
router.delete('/:id/permanente', async (req, res) => { 
    try { 
        await Usuario.findByIdAndDelete(req.params.id); 
        res.status(204).send(); 
    } catch(e){
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// DELETE: Vaciar papelera
router.delete('/papelera/vaciar', async (req, res) => {
    try {
        await Usuario.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: e.message }); 
    }
});

module.exports = router;