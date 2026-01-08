import Joi from 'joi';
import { ApiError } from './error.middleware.js';

/**
 * Validate request against schema
 * @param {Object} schema - Joi validation schema
 * @param {string} property - Property to validate (body, query, params)
 * @returns {Function} Express middleware
 */
export const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return next(new ApiError(400, 'Validation failed', details));
    }

    // Replace request property with validated value
    req[property] = value;
    next();
  };
};

/**
 * Common validation schemas
 */
export const schemas = {
  // Stack schemas
  stackName: Joi.object({
    name: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required().messages({
      'string.pattern.base': 'Stack name must contain only alphanumeric characters, hyphens, and underscores',
    }),
  }),

  createStack: Joi.object({
    name: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required(),
    composeContent: Joi.string().required(),
    envVars: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
  }),

  updateComposeFile: Joi.object({
    content: Joi.string().required(),
  }),

  updateEnvVars: Joi.object({
    envVars: Joi.object().pattern(Joi.string(), Joi.string()).required(),
  }),

  deleteStack: Joi.object({
    removeVolumes: Joi.boolean().optional().default(false),
  }),

  cloneFromGit: Joi.object({
    repoUrl: Joi.string().uri().required().messages({
      'string.uri': 'Repository URL must be a valid URL',
    }),
  }),

  // Container schemas
  containerId: Joi.object({
    id: Joi.string().required(),
  }),

  containerAction: Joi.object({
    action: Joi.string().valid('start', 'stop', 'restart', 'remove').required(),
  }),

  removeContainer: Joi.object({
    force: Joi.boolean().optional().default(false),
    volumes: Joi.boolean().optional().default(false),
  }),

  // Image schemas
  imageId: Joi.object({
    id: Joi.string().required(),
  }),

  removeImage: Joi.object({
    force: Joi.boolean().optional().default(false),
    noprune: Joi.boolean().optional().default(false),
  }),

  // Network schemas
  networkId: Joi.object({
    id: Joi.string().required(),
  }),

  // Volume schemas
  volumeName: Joi.object({
    name: Joi.string().required(),
  }),

  removeVolume: Joi.object({
    force: Joi.boolean().optional().default(false),
  }),

  // Log schemas
  logOptions: Joi.object({
    tail: Joi.number().integer().min(1).max(10000).optional().default(100),
    follow: Joi.boolean().optional().default(false),
    timestamps: Joi.boolean().optional().default(false),
  }),

  // Pagination schemas
  pagination: Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
  }),
};

export default {
  validate,
  schemas,
};
