/**
 * Settings API Routes
 */

import express from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import logger from '../../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const router = express.Router();

/**
 * GET /api/settings/registries
 * Get configured Docker registries (without passwords)
 */
router.get('/registries', asyncHandler(async (req, res) => {
  const registries = [];

  try {
    const configPaths = [
      '/root/.docker/config.json',
      path.join(process.env.HOME || '/root', '.docker/config.json'),
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.auths) {
          for (const [registry, auth] of Object.entries(config.auths)) {
            // Don't expose credentials, just show which registries are configured
            let username = null;
            if (auth.auth) {
              try {
                const decoded = Buffer.from(auth.auth, 'base64').toString('utf8');
                username = decoded.split(':')[0];
              } catch (e) {
                // Can't decode
              }
            }
            registries.push({
              registry: registry.replace('https://', '').replace('http://', ''),
              username,
              configured: true,
            });
          }
        }
        break;
      }
    }
  } catch (error) {
    logger.warn('Failed to read Docker config:', error.message);
  }

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

  // Default to Docker Hub if no registry specified
  const registryArg = registry && registry !== 'docker.io' && registry !== 'index.docker.io'
    ? registry
    : '';

  try {
    // Use docker login command with password via stdin for security
    const cmd = registryArg
      ? `echo "${password.replace(/"/g, '\\"')}" | docker login -u "${username}" --password-stdin ${registryArg}`
      : `echo "${password.replace(/"/g, '\\"')}" | docker login -u "${username}" --password-stdin`;

    const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });

    logger.info(`Docker login successful for user ${username}${registryArg ? ` to ${registryArg}` : ' to Docker Hub'}`);

    res.json({
      success: true,
      message: `Successfully logged in${registryArg ? ` to ${registryArg}` : ' to Docker Hub'}`,
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

  const registryArg = registry && registry !== 'docker.io' && registry !== 'index.docker.io'
    ? registry
    : '';

  try {
    const cmd = registryArg ? `docker logout ${registryArg}` : 'docker logout';
    await execAsync(cmd, { timeout: 10000 });

    logger.info(`Docker logout successful${registryArg ? ` from ${registryArg}` : ' from Docker Hub'}`);

    res.json({
      success: true,
      message: `Successfully logged out${registryArg ? ` from ${registryArg}` : ' from Docker Hub'}`,
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
