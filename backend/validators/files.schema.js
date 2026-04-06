/**
 * @file files.schema.js
 * @description Joi validation schemas for file routes
 */

const Joi = require('joi');

const fileIdParams = {
  params: Joi.object({
    id: Joi.string().uuid().required().messages({
      'string.guid': 'Invalid file ID format',
      'any.required': 'File ID is required'
    })
  })
};

module.exports = { fileIdParams };
