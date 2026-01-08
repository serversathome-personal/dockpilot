import express from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import dockerService from '../../services/docker.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/networks
 * List all networks
 */
router.get('/', asyncHandler(async (req, res) => {
  logger.info('Fetching all networks');

  const networks = await dockerService.listNetworks();

  res.json({
    success: true,
    data: networks,
  });
}));

/**
 * GET /api/networks/:id
 * Get network details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Fetching network details: ${id}`);

  const network = await dockerService.getNetwork(id);

  res.json({
    success: true,
    data: network,
  });
}));

/**
 * POST /api/networks
 * Create a new network
 */
router.post('/', asyncHandler(async (req, res) => {
  const { name, driver, subnet, gateway } = req.body;
  logger.info(`Creating network: ${name}`);

  const network = await dockerService.createNetwork({ name, driver, subnet, gateway });

  res.status(201).json({
    success: true,
    message: `Network ${name} created successfully`,
    data: network,
  });
}));

/**
 * DELETE /api/networks/:id
 * Remove a network
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Removing network: ${id}`);

  await dockerService.removeNetwork(id);

  res.json({
    success: true,
    message: `Network ${id} removed successfully`,
  });
}));

/**
 * POST /api/networks/prune
 * Prune unused networks
 */
router.post('/prune', asyncHandler(async (req, res) => {
  logger.info('Pruning unused networks');

  const result = await dockerService.pruneNetworks();

  res.json({
    success: true,
    message: 'Unused networks pruned successfully',
    data: result,
  });
}));

export default router;
