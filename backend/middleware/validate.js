/**
 * @file validate.js
 * @description Generic Joi validation middleware factory
 * @dependencies joi
 * @exports validate
 */

/**
 * Creates an Express middleware that validates request data against a Joi schema.
 * @param {Object} schemas - Object with optional 'body', 'params', 'query' Joi schemas
 * @returns {Function} Express middleware
 *
 * Usage:
 *   const Joi = require('joi');
 *   router.post('/check', validate({
 *     body: Joi.object({ text: Joi.string().required() })
 *   }), handler);
 */
function validate(schemas) {
  return (req, res, next) => {
    const sources = ['body', 'params', 'query'];

    for (const source of sources) {
      if (schemas[source]) {
        const { error, value } = schemas[source].validate(req[source], {
          abortEarly: false,
          stripUnknown: true,
          allowUnknown: false
        });

        if (error) {
          const details = error.details.map(d => ({
            field: d.path.join('.'),
            message: d.message.replace(/"/g, '')
          }));

          return res.status(400).json({
            error: 'Validation failed',
            details
          });
        }

        // Replace with sanitized/coerced values
        req[source] = value;
      }
    }

    next();
  };
}

module.exports = { validate };
