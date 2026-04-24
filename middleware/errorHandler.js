/**
 * Error Handler Middleware
 * Captura y formatea errores según el entorno (dev/prod)
 * Maneja errores específicos de Mongoose
 */
const AppError = require('../errors/AppError');

// ============================================================================
// Manejadores de errores específicos de Mongoose
// ============================================================================

/**
 * Error de casting (ID inválido en MongoDB)
 * Ej: Proyecto.findById('invalid-id')
 */
const handleCastErrorDB = (err) => {
  const message = `Campo inválido: ${err.path} con valor ${err.value}.`;
  return new AppError(message, 400);
};

/**
 * Error de campo duplicado (código 11000)
 * Ej: Email único duplicado
 */
const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `El campo '${field}' con valor '${value}' ya existe. Por favor usa otro valor.`;
  return new AppError(message, 400);
};

/**
 * Error de validación del esquema Mongoose
 * Ej: campo requerido faltante, formato inválido
 */
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Datos inválidos: ${errors.join('. ')}`;
  return new AppError(message, 400);
};

/**
 * Error de JWT inválido
 */
const handleJWTError = () =>
  new AppError('Token inválido. Por favor inicia sesión nuevamente.', 401);

/**
 * Error de JWT expirado
 */
const handleJWTExpiredError = () =>
  new AppError('Tu sesión ha expirado. Por favor inicia sesión nuevamente.', 401);

// ============================================================================
// Formateadores de respuesta según entorno
// ============================================================================

/**
 * Modo Desarrollo: Devuelve todo el error para debugging
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack
  });
};

/**
 * Modo Producción: Oculta detalles de programación
 * Solo muestra errores operacionales amigables
 */
const sendErrorProd = (err, res) => {
  // Error operacional (esperado): enviar mensaje al cliente
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  } else {
    // Error de programación (inesperado): no filtrar detalles
    console.error('ERROR 💥', err);
    res.status(500).json({
      status: 'error',
      message: 'Algo salió mal. Por favor intenta más tarde.'
    });
  }
};

// ============================================================================
// Middleware Global de Manejo de Errores
// ============================================================================

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    // Producción: transformar errores específicos de Mongoose/MongoDB
    let error = { ...err, message: err.message };

    if (err.name === 'CastError') error = handleCastErrorDB(err);
    if (err.code === 11000) error = handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

module.exports = errorHandler;
