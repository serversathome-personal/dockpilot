import express from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { validate, schemas } from '../../middleware/validation.middleware.js';
import dockerService from '../../services/docker.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/images
 * List all images
 */
router.get('/', asyncHandler(async (req, res) => {
  logger.info('Fetching all images');

  const images = await dockerService.listImages();

  res.json({
    success: true,
    data: images,
  });
}));

/**
 * DELETE /api/images/:id
 * Remove an image
 */
router.delete('/:id', validate(schemas.removeImage, 'query'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { force, noprune } = req.query;
  logger.info(`Removing image: ${id}`);

  await dockerService.removeImage(id, { force, noprune });

  res.json({
    success: true,
    message: `Image ${id} removed successfully`,
  });
}));

/**
 * POST /api/images/prune
 * Prune unused images
 */
router.post('/prune', asyncHandler(async (req, res) => {
  logger.info('Pruning unused images');

  const result = await dockerService.pruneImages();

  res.json({
    success: true,
    message: 'Unused images pruned successfully',
    data: result,
  });
}));

/**
 * POST /api/images/pull
 * Pull a new image
 */
router.post('/pull', validate(schemas.pullImage), asyncHandler(async (req, res) => {
  const { image } = req.body;
  logger.info(`Pulling image: ${image}`);

  await dockerService.pullImage(image);

  res.json({
    success: true,
    message: `Image ${image} pulled successfully`,
  });
}));

export default router;
