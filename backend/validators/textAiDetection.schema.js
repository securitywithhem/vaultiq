/**
 * @file textAiDetection.schema.js
 * @description Joi validation schemas for text-based AI detection routes
 */

const Joi = require('joi');

const checkSchema = {
  body: Joi.object({
    text: Joi.string().trim().min(1).max(100000).required().messages({
      'any.required': 'Text content is required',
      'string.empty': 'Text content cannot be empty'
    })
  })
};

const addSchema = {
  body: Joi.object({
    doc_id: Joi.string().trim().min(1).required().messages({
      'any.required': 'doc_id is required'
    }),
    text: Joi.string().trim().min(1).max(100000).required().messages({
      'any.required': 'Text content is required'
    })
  })
};

module.exports = { checkSchema, addSchema };
