import express from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import updateService from '../../services/update.service.js';
import notificationService from '../../services/notification.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/updates/check
 * Check for available updates
 */
router.get('/check', asyncHandler(async (req, res) => {
  logger.info('Checking for available updates');

  const updates = await updateService.checkForUpdates();

  // Send notification if updates are available (trigger must be enabled in settings)
  if (updates.length > 0) {
    notificationService.notifyUpdatesAvailable(updates).catch(err => {
      logger.warn('Failed to send updates available notification:', err.message);
    });
  }

  res.json({
    success: true,
    data: updates,
  });
}));

/**
 * POST /api/updates/execute
 * Execute update for specific images (non-streaming)
 */
router.post('/execute', asyncHandler(async (req, res) => {
  const { images, restartContainers = false } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Images array is required',
    });
  }

  logger.info(`Executing updates for ${images.length} images`);

  const results = await updateService.executeMultipleUpdates(images, {
    restartContainers,
  });

  res.json({
    success: true,
    data: results,
  });
}));

/**
 * POST /api/updates/execute/stream
 * Execute updates with SSE progress streaming including download progress
 */
router.post('/execute/stream', async (req, res) => {
  const { images, restartContainers = false } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Images array is required',
    });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  logger.info(`Executing streaming updates for ${images.length} images`);

  const total = images.length;
  let completed = 0;
  const results = [];

  sendEvent('start', { total, message: `Starting update of ${total} image(s)` });

  for (const image of images) {
    const imageTag = `${image.repository}:${image.currentTag}`;

    sendEvent('progress', {
      current: completed + 1,
      total,
      image: imageTag,
      status: 'pulling',
      message: `Pulling ${imageTag}...`,
    });

    try {
      // Use streaming pull with progress callback
      const result = await updateService.executeUpdateWithProgress(
        image.repository,
        image.currentTag,
        { restartContainers },
        (progressData) => {
          sendEvent('pull-progress', {
            current: completed + 1,
            total,
            image: imageTag,
            ...progressData,
          });
        }
      );
      results.push(result);

      sendEvent('progress', {
        current: completed + 1,
        total,
        image: imageTag,
        status: 'completed',
        message: `Updated ${imageTag}`,
      });
    } catch (error) {
      results.push({
        image: imageTag,
        status: 'failed',
        error: error.message,
      });

      sendEvent('progress', {
        current: completed + 1,
        total,
        image: imageTag,
        status: 'failed',
        message: `Failed to update ${imageTag}: ${error.message}`,
      });
    }

    completed++;
  }

  sendEvent('complete', {
    total,
    successful: results.filter(r => r.status === 'completed').length,
    failed: results.filter(r => r.status === 'failed').length,
    results,
  });

  res.end();
});

/**
 * GET /api/updates/schedules
 * Get all update schedules
 */
router.get('/schedules', asyncHandler(async (req, res) => {
  logger.info('Fetching update schedules');

  const schedules = await updateService.getSchedules();

  res.json({
    success: true,
    data: schedules,
  });
}));

/**
 * POST /api/updates/schedules
 * Create or update a schedule
 */
router.post('/schedules', asyncHandler(async (req, res) => {
  const schedule = req.body;

  if (!schedule.name || !schedule.cronExpression) {
    return res.status(400).json({
      success: false,
      error: 'Name and cron expression are required',
    });
  }

  logger.info(`Saving update schedule: ${schedule.name}`);

  const saved = await updateService.saveSchedule(schedule);

  res.json({
    success: true,
    data: saved,
  });
}));

/**
 * DELETE /api/updates/schedules/:id
 * Delete a schedule
 */
router.delete('/schedules/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info(`Deleting update schedule: ${id}`);

  await updateService.deleteSchedule(id);

  res.json({
    success: true,
    message: 'Schedule deleted successfully',
  });
}));

/**
 * GET /api/updates/history
 * Get update history
 */
router.get('/history', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  logger.info('Fetching update history');

  const history = updateService.getHistory(limit);

  res.json({
    success: true,
    data: history,
  });
}));

/**
 * DELETE /api/updates/history
 * Clear update history
 */
router.delete('/history', asyncHandler(async (req, res) => {
  logger.info('Clearing update history');

  updateService.clearHistory();

  res.json({
    success: true,
    message: 'History cleared successfully',
  });
}));

export default router;
