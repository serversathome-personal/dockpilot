/**
 * Settings API Routes
 */

import express from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import registryService from '../../services/registry.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/settings/registries
 * Get configured Docker registries (without passwords)
 */
router.get('/registries', asyncHandler(async (req, res) => {
  const registries = await registryService.getConfiguredRegistries();

  res.json({
    success: true,
    data: registries,
  });
}));

/**
 * POST /api/settings/registries/login
 * Login to a Docker registry
 */
router.post('/registries/login', asyncHandler(async (req, res) => {
  const { registry, username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required',
    });
  }

  try {
    await registryService.login(registry, username, password);

    const registryName = registry && registry !== 'docker.io' ? registry : 'Docker Hub';
    logger.info(`Docker login successful for user ${username} to ${registryName}`);

    res.json({
      success: true,
      message: `Successfully logged in to ${registryName}`,
    });
  } catch (error) {
    logger.error('Docker login failed:', error.message);

    // Parse common error messages
    let errorMessage = 'Login failed';
    if (error.message.includes('unauthorized') || error.message.includes('401')) {
      errorMessage = 'Invalid username or password';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Connection timeout - check registry URL';
    } else if (error.stderr) {
      errorMessage = error.stderr.trim();
    }

    res.status(401).json({
      success: false,
      error: errorMessage,
    });
  }
}));

/**
 * POST /api/settings/registries/logout
 * Logout from a Docker registry
 */
router.post('/registries/logout', asyncHandler(async (req, res) => {
  const { registry } = req.body;

  try {
    await registryService.logout(registry);

    const registryName = registry && registry !== 'docker.io' ? registry : 'Docker Hub';
    logger.info(`Docker logout successful from ${registryName}`);

    res.json({
      success: true,
      message: `Successfully logged out from ${registryName}`,
    });
  } catch (error) {
    logger.error('Docker logout failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
    });
  }
}));

export default router;
