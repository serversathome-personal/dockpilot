import express from 'express';
import { asyncHandler, ApiError } from '../../middleware/error.middleware.js';
import { validate, schemas } from '../../middleware/validation.middleware.js';
import dockerService from '../../services/docker.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/containers
 * List all containers
 */
router.get('/', asyncHandler(async (req, res) => {
  const { all = 'true' } = req.query;
  logger.info('Fetching all containers');

  const containers = await dockerService.listContainers({ all: all === 'true' });

  res.json({
    success: true,
    data: containers,
  });
}));

/**
 * GET /api/containers/:id
 * Get container details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Fetching container: ${id}`);

  const container = await dockerService.getContainer(id);

  res.json({
    success: true,
    data: container,
  });
}));

/**
 * GET /api/containers/:id/stats
 * Get container statistics
 */
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Fetching stats for container: ${id}`);

  const stats = await dockerService.getContainerStats(id);

  res.json({
    success: true,
    data: stats,
  });
}));

/**
 * GET /api/containers/:id/logs
 * Get container logs
 */
router.get('/:id/logs', validate(schemas.logOptions, 'query'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tail, timestamps } = req.query;
  logger.info(`Fetching logs for container: ${id}`);

  const stream = await dockerService.streamLogs(id, {
    tail,
    timestamps,
    follow: false
  });

  // Collect logs from stream
  const logs = [];
  stream.on('data', (chunk) => {
    logs.push(chunk.toString('utf8'));
  });

  stream.on('end', () => {
    res.json({
      success: true,
      data: {
        logs: logs.join(''),
      },
    });
  });

  stream.on('error', (error) => {
    logger.error(`Error streaming logs for container ${id}:`, error);
    throw new ApiError(500, 'Failed to fetch logs');
  });
}));

/**
 * POST /api/containers/:id/start
 * Start a container
 */
router.post('/:id/start', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Starting container: ${id}`);

  await dockerService.startContainer(id);

  res.json({
    success: true,
    message: `Container ${id} started successfully`,
  });
}));

/**
 * POST /api/containers/:id/stop
 * Stop a container
 */
router.post('/:id/stop', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Stopping container: ${id}`);

  await dockerService.stopContainer(id);

  res.json({
    success: true,
    message: `Container ${id} stopped successfully`,
  });
}));

/**
 * POST /api/containers/:id/restart
 * Restart a container
 */
router.post('/:id/restart', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Restarting container: ${id}`);

  await dockerService.restartContainer(id);

  res.json({
    success: true,
    message: `Container ${id} restarted successfully`,
  });
}));

/**
 * POST /api/containers/:id/pause
 * Pause a container
 */
router.post('/:id/pause', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Pausing container: ${id}`);

  await dockerService.pauseContainer(id);

  res.json({
    success: true,
    message: `Container ${id} paused successfully`,
  });
}));

/**
 * POST /api/containers/:id/unpause
 * Unpause a container
 */
router.post('/:id/unpause', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Unpausing container: ${id}`);

  await dockerService.unpauseContainer(id);

  res.json({
    success: true,
    message: `Container ${id} unpaused successfully`,
  });
}));

/**
 * DELETE /api/containers/:id
 * Remove a container
 */
router.delete('/:id', validate(schemas.removeContainer, 'query'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { force, volumes } = req.query;
  logger.info(`Removing container: ${id}`);

  await dockerService.removeContainer(id, { force, volumes });

  res.json({
    success: true,
    message: `Container ${id} removed successfully`,
  });
}));

/**
 * POST /api/containers/:id/update
 * Update container image (pull latest and restart)
 */
router.post('/:id/update', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Updating container: ${id}`);

  // Get container details to find the image
  const container = await dockerService.getContainer(id);
  const imageName = container.image;

  // Pull the latest image
  const pullResult = await dockerService.pullImage(imageName);

  // Check if image was updated
  const wasUpdated = pullResult && pullResult.updated;

  if (wasUpdated) {
    // Restart the container to use the new image
    await dockerService.restartContainer(id);
  }

  res.json({
    success: true,
    message: wasUpdated
      ? `Container ${id} updated successfully`
      : `Container ${id} is already up to date`,
    updated: wasUpdated,
  });
}));

/**
 * GET /api/containers/:id/stream-update
 * Update container with real-time output streaming (SSE)
 */
router.get('/:id/stream-update', asyncHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`Streaming update for container: ${id}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Get container details to find the image
    const container = await dockerService.getContainer(id);
    const imageName = container.image;

    res.write(`data: ${JSON.stringify({ type: 'stdout', data: `Pulling latest image: ${imageName}\n` })}\n\n`);

    // Pull the latest image with streaming
    const pullResult = await dockerService.streamPullImage(imageName, (data, type) => {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    });

    const wasUpdated = pullResult && pullResult.updated;

    if (wasUpdated) {
      res.write(`data: ${JSON.stringify({ type: 'stdout', data: '\nNew image pulled. Restarting container...\n' })}\n\n`);
      await dockerService.restartContainer(id);
      res.write(`data: ${JSON.stringify({ type: 'done', data: 'Container updated and restarted successfully' })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'done', data: 'Container is already up to date. No restart needed.' })}\n\n`);
    }

    res.end();
  } catch (error) {
    logger.error(`Failed to update container ${id}:`, error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
    res.end();
  }
}));

export default router;
