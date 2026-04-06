/**
 * @file aiDetector.schema.js
 * @description Joi validation schemas for AI detector routes
 */

const Joi = require('joi');

const checkTextSchema = {
  body: Joi.object({
    text: Joi.string().trim().min(1).max(100000).required().messages({
      'any.required': 'Text content is required',
      'string.empty': 'Text content cannot be empty'
    })
  })
};

module.exports = { checkTextSchema };
