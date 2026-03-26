// ==========================================
// MIDDLEWARE: RATE LIMITING
// ==========================================
const rateLimit = require('express-rate-limit');

// Configuración general para todas las rutas
const generalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // límite de 100 peticiones
    message: {
        error: 'Demasiadas peticiones desde esta IP. Por favor, intenta más tarde.',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
    },
    standardHeaders: true, // Envía headers de rate limit en la respuesta
    legacyHeaders: false, // Deshabilita headers legacy
    handler: (req, res) => {
        res.status(429).json({
            error: 'Demasiadas peticiones desde esta IP. Por favor, intenta más tarde.',
            retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
        });
    }
});

// Rate limiting más estricto para autenticación
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 intentos de login/registro
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

// Rate limiting para creación de proyectos (evitar spam)
const projectCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 10, // máximo 10 proyectos por hora
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
