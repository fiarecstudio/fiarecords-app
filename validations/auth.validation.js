/**
 * Esquemas de Validación Joi para Autenticación
 * Paso 4: Validaciones de Entrada
 */
const Joi = require('joi');

/**
 * Esquema de Registro de Usuario
 * Valida los campos requeridos para crear una cuenta nueva
 */
const registerSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.alphanum': 'El nombre de usuario solo puede contener letras y números',
      'string.min': 'El nombre de usuario debe tener al menos {#limit} caracteres',
      'string.max': 'El nombre de usuario no puede tener más de {#limit} caracteres',
      'any.required': 'El nombre de usuario es obligatorio'
    }),

  email: Joi.string()
    .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net', 'org', 'edu', 'mx', 'es', 'ar', 'co', 'io', 'app'] } })
    .required()
    .messages({
      'string.email': 'Por favor ingresa un correo electrónico válido',
      'any.required': 'El correo electrónico es obligatorio'
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[A-Za-z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'La contraseña debe tener al menos {#limit} caracteres',
      'string.max': 'La contraseña no puede tener más de {#limit} caracteres',
      'string.pattern.base': 'La contraseña debe contener al menos una letra y un número',
      'any.required': 'La contraseña es obligatoria'
    }),

  nombre: Joi.string()
    .min(2)
    .max(100)
    .optional()
    .allow('', null)
    .messages({
      'string.min': 'El nombre debe tener al menos {#limit} caracteres',
      'string.max': 'El nombre no puede tener más de {#limit} caracteres'
    }),

  createArtist: Joi.boolean()
    .optional()
    .default(false),

  empresaId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .allow(null, '')
});

/**
 * Esquema de Inicio de Sesión
 * Valida credenciales para login
 * NOTA: Permite contraseñas antiguas (solo números) - solo valida longitud mínima
 */
const loginSchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.min': 'El usuario debe tener al menos {#limit} caracteres',
      'string.max': 'El usuario no puede tener más de {#limit} caracteres',
      'any.required': 'El usuario o correo es obligatorio'
    }),

  password: Joi.string()
    .min(4)
    .max(128)
    .required()
    .messages({
      'string.min': 'La contraseña debe tener al menos {#limit} caracteres',
      'string.max': 'La contraseña no puede tener más de {#limit} caracteres',
      'any.required': 'La contraseña es obligatoria'
    })
});

/**
 * Esquema de Recuperación de Contraseña
 * Valida email para forgot-password
 */
const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Por favor ingresa un correo electrónico válido',
      'any.required': 'El correo electrónico es obligatorio'
    })
});

/**
 * Esquema de Reset de Contraseña
 * Valida nueva contraseña
 */
const resetPasswordSchema = Joi.object({
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[A-Za-z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'La nueva contraseña debe tener al menos {#limit} caracteres',
      'string.pattern.base': 'La contraseña debe contener al menos una letra y un número',
      'any.required': 'La nueva contraseña es obligatoria'
    }),

  token: Joi.string()
    .optional()
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema
};
