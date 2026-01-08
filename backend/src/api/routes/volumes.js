import express from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { validate, schemas } from '../../middleware/validation.middleware.js';
import dockerService from '../../services/docker.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/volumes
 * List all volumes
 */
router.get('/', asyncHandler(async (req, res) => {
  logger.info('Fetching all volumes');

  const volumes = await dockerService.listVolumes();

  res.json({
    success: true,
    data: volumes,
  });
}));

/**
 * POST /api/volumes
 * Create a new volume
 */
router.post('/', asyncHandler(async (req, res) => {
  const { name, driver } = req.body;
  logger.info(`Creating volume: ${name}`);

  const volume = await dockerService.createVolume({ name, driver });

  res.status(201).json({
    success: true,
    message: `Volume ${name} created successfully`,
    data: volume,
  });
}));

/**
 * DELETE /api/volumes/:name
 * Remove a volume
 */
router.delete('/:name', validate(schemas.removeVolume, 'query'), asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { force } = req.query;
  logger.info(`Removing volume: ${name}`);

  await dockerService.removeVolume(name, { force });

  res.json({
    success: true,
    message: `Volume ${name} removed successfully`,
  });
}));

/**
 * POST /api/volumes/prune
 * Prune unused volumes
 */
router.post('/prune', asyncHandler(async (req, res) => {
  logger.info('Pruning unused volumes');

  const result = await dockerService.pruneVolumes();

  res.json({
    success: true,
    message: 'Unused volumes pruned successfully',
    data: result,
  });
}));

export default router;
