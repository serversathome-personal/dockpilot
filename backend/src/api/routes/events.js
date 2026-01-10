import express from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import dockerService from '../../services/docker.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/events
 * Get Docker events history
 */
router.get('/', asyncHandler(async (req, res) => {
  const { since, until, limit = 100 } = req.query;
  logger.info('Fetching Docker events');

  const events = await dockerService.getEvents({
    since: since ? parseInt(since) : undefined,
    until: until ? parseInt(until) : undefined,
    limit: parseInt(limit),
  });

  // Sort events by time descending (most recent first)
  events.sort((a, b) => b.time - a.time);

  res.json({
    success: true,
    data: events,
  });
}));

/**
 * GET /api/events/stream
 * Stream Docker events via SSE
 */
router.get('/stream', (req, res) => {
  logger.info('Starting Docker events stream');

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to Docker events stream' })}\n\n`);

  // Start streaming events
  dockerService.streamEvents(res);
});

export default router;
