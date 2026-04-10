/**
 * @file auth.schema.js
 * @description Joi validation schemas for auth routes
 */

const Joi = require('joi');

const registerSchema = {
  body: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Valid email is required',
      'any.required': 'Email is required'
    }),
    // Fix 12: require complexity — uppercase, lowercase, digit, special char
    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.pattern.base': 'Password must contain uppercase, lowercase, a number, and a special character',
        'any.required': 'Password is required'
      }),
    fullName: Joi.string().trim().min(1).max(100).required().messages({
      'any.required': 'Full name is required'
    })
  })
};

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  })
};

module.exports = { registerSchema, loginSchema };
