/**
 * Middleware de Validación Genérico con Joi
 * Paso 4: Validaciones de Entrada
 * 
 * Uso: validate(schema) -> middleware que valida req.body
 */
const AppError = require('../errors/AppError');

/**
 * Construye un mensaje de error claro a partir de los errores de Joi
 * @param {Array} details - Detalles de error de Joi
 * @returns {String} Mensaje formateado
 */
const buildErrorMessage = (details) => {
  if (!details || details.length === 0) {
    return 'Error de validación en los datos enviados';
  }

  // Si hay un solo error, retornar ese mensaje
  if (details.length === 1) {
    return details[0].message;
  }

  // Si hay múltiples errores, listarlos
  const messages = details.map((err, index) => `${index + 1}. ${err.message}`);
  return `Errores de validación:\n${messages.join('\n')}`;
};

/**
 * Middleware factory que recibe un esquema Joi y retorna el middleware
 * @param {Joi.Schema} schema - Esquema de validación Joi
 * @returns {Function} Middleware de Express
 */
const validate = (schema) => {
  return (req, res, next) => {
    // Validar req.body contra el esquema
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Capturar todos los errores, no solo el primero
      stripUnknown: true, // Eliminar campos no definidos en el esquema (prevenir injection)
      allowUnknown: false // No permitir campos desconocidos
    });

    // Si hay errores de validación
    if (error) {
      const message = buildErrorMessage(error.details);
      // Usar AppError para mantener consistencia con el sistema de errores
      return next(new AppError(message, 400));
    }

    // Reemplazar req.body con los valores validados y saneados
    // Esto elimina campos extras que podrían ser usados para injection
    req.body = value;

    next();
  };
};

/**
 * Middleware específico para validar params (si se necesita en el futuro)
 * @param {Joi.Schema} schema - Esquema de validación Joi
 * @returns {Function} Middleware de Express
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const message = buildErrorMessage(error.details);
      return next(new AppError(message, 400));
    }

    req.params = value;
    next();
  };
};

/**
 * Middleware específico para validar query (si se necesita en el futuro)
 * @param {Joi.Schema} schema - Esquema de validación Joi
 * @returns {Function} Middleware de Express
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const message = buildErrorMessage(error.details);
      return next(new AppError(message, 400));
    }

    req.query = value;
    next();
  };
};

module.exports = {
  validate,
  validateParams,
  validateQuery
};
