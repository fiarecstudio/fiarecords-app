const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Usuario = require('../../models/Usuario');

/**
 * Middleware de Autenticación para Socket.io
 * FASE 1: Validación JWT en WebSockets
 * 
 * Extrae el token del handshake, valida JWT, y adjunta 
 * datos de usuario (incluyendo empresaId) al socket.
 * 
 * REGLA DE ORO: Sin empresaId válido, no hay acceso al chat.
 */

module.exports = async (socket, next) => {
    try {
        // El token puede venir en auth o en query string
        const token = socket.handshake.auth?.token || 
                       socket.handshake.query?.token;
        
        if (!token) {
            console.error('[Socket Auth] Token no proporcionado');
            return next(new Error('Authentication error: Token requerido'));
        }

        // Verificar JWT con el mismo SECRET que Express
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            console.error('[Socket Auth] JWT inválido:', jwtError.message);
            return next(new Error('Authentication error: Token inválido'));
        }
        
        // Validar que tenga empresaId (requisito crítico multi-tenant)
        // SuperAdmin también debe tener empresaId para el contexto de chat
        if (!decoded.empresaId && !decoded.isSuperAdmin) {
            console.error('[Socket Auth] Sin empresaId en token');
            return next(new Error('Authentication error: Sin contexto de empresa'));
        }
        
        // Si es SuperAdmin pero no tiene empresaId, usamos null
        // (se manejará en los handlers según lógica de negocio)
        const empresaId = decoded.empresaId 
            ? new mongoose.Types.ObjectId(decoded.empresaId) 
            : null;
        
        // Adjuntar datos de usuario al socket
        // Estos datos estarán disponibles en todos los handlers
        socket.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            permisos: decoded.permisos || [],
            empresaId: empresaId,
            isSuperAdmin: decoded.isSuperAdmin || false,
            artistaId: decoded.artistaId || null
        };
        
        // Verificación adicional: el usuario existe y está activo
        // Esto previene el uso de tokens válidos de usuarios eliminados
        const userExists = await Usuario.exists({
            _id: decoded.id,
            isDeleted: { $ne: true }
        });
        
        if (!userExists) {
            console.error('[Socket Auth] Usuario no encontrado o eliminado:', decoded.id);
            return next(new Error('Authentication error: Usuario no válido'));
        }
        
        // Log de conexión exitosa
        console.log(`[Socket Auth] ✅ Usuario autenticado: ${socket.user.username} (${socket.user.id}) - Empresa: ${socket.user.empresaId}`);
        
        next();
        
    } catch (error) {
        console.error('[Socket Auth] Error inesperado:', error.message);
        next(new Error('Authentication error: Error de servidor'));
    }
};
