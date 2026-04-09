// ==========================================
// MIDDLEWARE: RATE LIMITING (PERMISIVO)
// ==========================================
const rateLimit = require('express-rate-limit');

// Configuración general para todas las rutas (aumentado para mayor fluidez)
const generalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300, // límite de 300 peticiones (aumentado de 100)
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

// Rate limiting más estricto para autenticación (aumentado para evitar bloqueos accidentales)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // máximo 10 intentos de login/registro (aumentado de 5)
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
    max: 20, // máximo 20 proyectos por hora (aumentado de 10)
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
