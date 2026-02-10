const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const auth = require('../middleware/auth');

// 1. Verificar Autenticación (Token)
router.use(auth);

// 2. Middleware para verificar rol de admin (FLEXIBLE)
const adminOnly = (req, res, next) => {
  if (!req.user) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
  }

  // TRUCO: Convertimos el rol a minúsculas para comparar
  // Así acepta "Admin", "admin", "ADMIN", etc.
  const rolUsuario = req.user.role ? req.user.role.toLowerCase() : '';

  if (rolUsuario !== 'admin') { 
      console.log(`Acceso denegado. Usuario: ${req.user.username}, Rol intentado: ${req.user.role}`);
      return res.status(403).json({ error: 'Acceso denegado. Se requiere ser Admin.' }); 
  }
  next();
};

// APLICAR ADMIN ONLY A TODAS LAS RUTAS
router.use(adminOnly); 

// --- RUTAS ---

router.get('/', async (req, res) => { 
    try { 
        const d = await Usuario.find({ isDeleted: false }).select('-password'); 
        res.json(d); 
    } catch(e){
        console.error(e);
        res.status(500).json({ error: e.message }); 
    }
});

router.get('/:id', async (req, res) => { 
    try { 
        const d = await Usuario.findById(req.params.id).select('-password'); 
        res.json(d); 
    } catch(e){
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => { 
    try { 
        // Validación extra para evitar duplicados y que no explote
        const existe = await Usuario.findOne({ username: req.body.username });
        if (existe) return res.status(400).json({ error: "El usuario ya existe." });

        const d = new Usuario(req.body); 
        await d.save(); 
        res.status(201).json(d); 
    } catch(e){
        console.error(e); // Ver error en consola servidor
        res.status(500).json({ error: e.message }); 
    }
});

router.put('/:id', async (req, res) => { 
    try { 
        const { username, role, password } = req.body; 
        const user = await Usuario.findById(req.params.id);
        
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

        if (username) user.username = username;
        if (role) user.role = role;
        if (password && password.trim() !== "") user.password = password;

        await user.save(); 
        
        // Devolvemos el usuario actualizado
        const userActualizado = await Usuario.findById(req.params.id).select('-password');
        res.json(userActualizado); 

    } catch(e){
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => { 
    try { 
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: true }); 
        res.status(204).send(); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/papelera/all', async (req, res) => { 
    try { 
        const d = await Usuario.find({ isDeleted: true }).select('-password'); 
        res.json(d); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

router.put('/:id/restaurar', async (req, res) => { 
    try { 
        await Usuario.findByIdAndUpdate(req.params.id, { isDeleted: false }); 
        res.status(204).send(); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

router.delete('/:id/permanente', async (req, res) => { 
    try { 
        await Usuario.findByIdAndDelete(req.params.id); 
        res.status(204).send(); 
    } catch(e){ res.status(500).json({ error: e.message }); }
});

router.delete('/papelera/vaciar', async (req, res) => {
    try {
        await Usuario.deleteMany({ isDeleted: true });
        res.status(204).send();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;