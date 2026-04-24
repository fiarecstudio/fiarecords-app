/**
 * AppError - Clase base para errores operacionales
 * Extiende Error nativo de Node.js
 * 
 * Uso: throw new AppError('Mensaje', 404)
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
