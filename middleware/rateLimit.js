// ==========================================
// MIDDLEWARE: RATE LIMITING (PERMISIVO)
// ==========================================
const rateLimit = require('express-rate-limit');

// Configuración general - MUY PERMISIVA para desarrollo
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto (ventana corta)
    max: 1000, // 1000 peticiones por minuto (muy permisivo)
    message: {
        error: 'Demasiadas peticiones desde esta IP. Por favor, intenta más tarde.',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS', // Skip preflight requests
    handler: (req, res) => {
        res.status(429).json({
            error: 'Demasiadas peticiones desde esta IP. Por favor, intenta más tarde.',
            retryAfter: 60
        });
    }
});

// Rate limiting para autenticación - más permisivo
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 50, // 50 intentos (muy permisivo para evitar bloqueos)
    message: {
        error: 'Demasiados intentos de autenticación. Por favor, espera 15 minutos.',
        retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Demasiados intentos de autenticación. Por favor, espera 15 minutos.',
            retryAfter: 900
        });
    }
});

// Rate limiting para creación de proyectos - más permisivo
const projectCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 100, // 100 proyectos por hora (muy permisivo)
    message: {
        error: 'Límite de creación de proyectos alcanzado. Por favor, espera 1 hora.',
        retryAfter: 3600
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Límite de creación de proyectos alcanzado. Por favor, espera 1 hora.',
            retryAfter: 3600
        });
    }
});

module.exports = {
    generalLimiter,
    authLimiter,
    projectCreationLimiter
};
