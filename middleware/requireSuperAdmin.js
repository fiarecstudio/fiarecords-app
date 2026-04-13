/**
 * FASE 4: Middleware de Seguridad para Super Admin
 * Verifica que el usuario tenga isSuperAdmin === true
 */

const requireSuperAdmin = (req, res, next) => {
    // Verificar que existe el usuario en el request (debe venir del middleware auth)
    if (!req.user) {
        return res.status(401).json({ error: 'No autorizado. Token requerido.' });
    }

    // Verificar que es Super Admin
    if (req.user.isSuperAdmin !== true) {
        return res.status(403).json({ 
            error: 'Acceso denegado. Solo Super Admin puede realizar esta acción.' 
        });
    }

    // Es Super Admin, continuar
    next();
};

module.exports = requireSuperAdmin;
