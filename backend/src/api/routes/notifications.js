/**
 * Notification API Routes
 */

import express from 'express';
import notificationService from '../../services/notification.service.js';
import { asyncHandler } from '../../middleware/error.middleware.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/notifications/settings
 * Get notification settings
 */
router.get('/settings', asyncHandler(async (req, res) => {
  const settings = await notificationService.getSettings();
  res.json({ success: true, data: settings });
}));

/**
 * POST /api/notifications/settings
 * Save notification settings
 */
router.post('/settings', asyncHandler(async (req, res) => {
  const settings = req.body;

  // Validate required fields
  if (typeof settings.enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'enabled field is required and must be a boolean',
    });
  }

  // Validate Apprise URLs format if provided
  if (settings.appriseUrls && !Array.isArray(settings.appriseUrls)) {
    return res.status(400).json({
      success: false,
      error: 'appriseUrls must be an array',
    });
  }

  const savedSettings = await notificationService.saveSettings(settings);
  res.json({ success: true, data: savedSettings });
}));

/**
 * POST /api/notifications/test
 * Test a notification URL
 */
router.post('/test', asyncHandler(async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'url is required',
    });
  }

  logger.info('Testing notification URL');
  const result = await notificationService.testNotification(url);

  res.json({
    success: result.success,
    message: result.message,
  });
}));

/**
 * POST /api/notifications/send
 * Manually send a notification (for testing)
 */
router.post('/send', asyncHandler(async (req, res) => {
  const { title, body, type = 'info' } = req.body;

  if (!title || !body) {
    return res.status(400).json({
      success: false,
      error: 'title and body are required',
    });
  }

  const result = await notificationService.send(title, body, type, 'manual');
  res.json({ success: true, data: result });
}));

/**
 * GET /api/notifications/history
 * Get notification history
 */
router.get('/history', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const history = notificationService.getHistory(limit);
  res.json({ success: true, data: history });
}));

/**
 * DELETE /api/notifications/history
 * Clear notification history
 */
router.delete('/history', asyncHandler(async (req, res) => {
  notificationService.clearHistory();
  res.json({ success: true, message: 'History cleared' });
}));

export default router;
