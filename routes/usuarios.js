const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const auth = require('../middleware/auth');

router.use(auth);

// Middleware Admin (Ahora es más flexible)
const adminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Token inválido.' });
  
  // Como ahora guardamos todo en minúscula en el modelo, comparamos directo
  if (req.user.role !== 'admin') { 
      return res.status(403).json({ error: 'Acceso denegado.' }); 
  }
  next();
};

router.use(adminOnly); 

// GET: Usuarios
router.get('/', async (req, res) => { 
    try { 
        const d = await Usuario.find({ isDeleted: false }).select('-password'); 
        res.json(d); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => { 
    try { 
        const d = await Usuario.findById(req.params.id).select('-password'); 
        res.json(d); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

// POST: Crear Usuario
router.post('/', async (req, res) => { 
    try { 
        const existe = await Usuario.findOne({ username: req.body.username });
        if (existe) return res.status(400).json({ error: "El usuario ya existe." });

        // Mongoose se encargará de pasar el rol a minúscula gracias al cambio en el Modelo
        const d = new Usuario(req.body); 
        await d.save(); 
        res.status(201).json(d); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

// PUT: Editar Usuario (CORREGIDO PARA GUARDAR PERMISOS)
router.put('/:id', async (req, res) => { 
    try { 
        // 1. Extraemos "permisos" también
        const { username, role, password, permisos } = req.body; 
        
        const user = await Usuario.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

        // 2. Actualizamos los campos
        if (username) user.username = username;
        if (role) user.role = role.toLowerCase(); // Aseguramos minúscula
        if (password && password.trim() !== "") user.password = password;
        
        // 3. AQUÍ ESTA LA MAGIA: Guardamos los checkboxes
        if (permisos) user.permisos = permisos;

        await user.save(); 
        
        const userActualizado = await Usuario.findById(req.params.id).select('-password');
        res.json(userActualizado); 

    } catch(e){
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// ... (El resto de las rutas DELETE, Papelera, etc. déjalas igual o pégalas de tu código anterior si no han cambiado) ...
router.delete('/:id', async (req, res) => { 
    try { await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: true }); res.status(204).send(); } catch(e){ res.status(500).json({ error: e.message }); }
});
router.get('/papelera/all', async (req, res) => { 
    try { const d = await Usuario.find({ isDeleted: true }).select('-password'); res.json(d); } catch(e){ res.status(500).json({ error: e.message }); }
});
router.put('/:id/restaurar', async (req, res) => { 
    try { await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: false }); res.status(204).send(); } catch(e){ res.status(500).json({ error: e.message }); }
});
router.delete('/:id/permanente', async (req, res) => { 
    try { await Usuario.findByIdAndDelete(req.params.id); res.status(204).send(); } catch(e){ res.status(500).json({ error: e.message }); }
});
router.delete('/papelera/vaciar', async (req, res) => {
    try { await Usuario.deleteMany({ isDeleted: true }); res.status(204).send(); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;