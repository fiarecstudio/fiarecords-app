// Contenido para: middleware/auth.js
const jwt = require('jsonwebtoken');

// ============================================================
// FASE 2: MULTI-TENANT - AUTENTICACIÓN CON CONTEXTO DE EMPRESA
// ============================================================
module.exports = function (req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Acceso denegado. No hay token.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Agrega los datos del usuario al objeto de la petición
    req.user = decoded;
    
    // --- FASE 2: EXTRAER CONTEXTO MULTI-TENANT ---
    // Estos campos están disponibles en todas las rutas protegidas:
    // - req.user.empresaId: ID de la empresa asignada al usuario
    // - req.user.isSuperAdmin: true si es Super Admin (acceso global)
    // ---------------------------------------------
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token no válido.' });
  }
};