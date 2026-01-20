import express from 'express';
import path from 'path';
import { asyncHandler, ApiError } from '../../middleware/error.middleware.js';
import { validate, schemas } from '../../middleware/validation.middleware.js';
import stackService from '../../services/stack.service.js';
import dockerService from '../../services/docker.service.js';
import notificationService from '../../services/notification.service.js';
import config from '../../config/env.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/stacks
 * List all stacks
 */
router.get('/', asyncHandler(async (req, res) => {
  logger.info('Fetching all stacks');

  const stacks = await stackService.listStacks();

  res.json({
    success: true,
    data: stacks,
  });
}));

/**
 * GET /api/stacks/:name
 * Get stack details
 */
router.get('/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Fetching stack: ${name}`);

  const stack = await stackService.getStack(name);

  res.json({
    success: true,
    data: stack,
  });
}));

/**
 * POST /api/stacks
 * Create a new stack
 */
router.post('/', validate(schemas.createStack), asyncHandler(async (req, res) => {
  const { name, composeContent, envVars } = req.body;
  logger.info(`Creating stack: ${name}`);

  await stackService.createStack(name, composeContent, envVars);

  res.status(201).json({
    success: true,
    message: `Stack ${name} created successfully`,
  });
}));

/**
 * POST /api/stacks/clone-git
 * Clone a stack from a Git repository
 */
router.post('/clone-git', validate(schemas.cloneFromGit), asyncHandler(async (req, res) => {
  const { repoUrl } = req.body;
  logger.info(`Cloning stack from Git: ${repoUrl}`);

  const stackName = await stackService.cloneFromGit(repoUrl);

  res.status(201).json({
    success: true,
    message: `Stack cloned successfully`,
    data: { stackName },
  });
}));

/**
 * PUT /api/stacks/:name/compose
 * Update docker-compose.yml content
 */
router.put('/:name/compose', validate(schemas.updateComposeFile), asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { content } = req.body;
  logger.info(`Updating compose file for stack: ${name}`);

  await stackService.updateComposeFile(name, content);

  res.json({
    success: true,
    message: `Compose file updated successfully`,
  });
}));

/**
 * GET /api/stacks/:name/compose
 * Get docker-compose.yml content
 */
router.get('/:name/compose', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Fetching compose file for stack: ${name}`);

  const compose = await stackService.getComposeFile(name);

  res.json({
    success: true,
    data: compose,
  });
}));

/**
 * PUT /api/stacks/:name/env
 * Update environment variables
 */
router.put('/:name/env', validate(schemas.updateEnvVars), asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { envVars } = req.body;
  logger.info(`Updating env vars for stack: ${name}`);

  await stackService.updateEnvVars(name, envVars);

  res.json({
    success: true,
    message: `Environment variables updated successfully`,
  });
}));

/**
 * GET /api/stacks/:name/env
 * Get environment variables
 */
router.get('/:name/env', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Fetching env vars for stack: ${name}`);

  const envVars = await stackService.getEnvVars(name);

  res.json({
    success: true,
    data: envVars,
  });
}));

/**
 * POST /api/stacks/:name/start
 * Start a stack
 */
router.post('/:name/start', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Starting stack: ${name}`);

  const result = await stackService.startStack(name);

  // Send notification (don't await to avoid blocking response)
  notificationService.notifyStackStarted(name).catch(err => {
    logger.error(`Failed to send stack started notification: ${err.message}`);
  });

  res.json({
    success: true,
    message: `Stack ${name} started successfully`,
    output: result.stdout,
  });
}));

/**
 * POST /api/stacks/:name/stop
 * Stop a stack
 */
router.post('/:name/stop', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Stopping stack: ${name}`);

  const result = await stackService.stopStack(name);

  // Send notification (don't await to avoid blocking response)
  notificationService.notifyStackStopped(name).catch(err => {
    logger.error(`Failed to send stack stopped notification: ${err.message}`);
  });

  res.json({
    success: true,
    message: `Stack ${name} stopped successfully`,
    output: result.stdout,
  });
}));

/**
 * POST /api/stacks/:name/down
 * Down a stack (stop and remove containers)
 */
router.post('/:name/down', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Downing stack: ${name}`);

  const result = await stackService.downStack(name);

  // Send notification (don't await to avoid blocking response)
  notificationService.notifyStackStopped(name).catch(err => {
    logger.error(`Failed to send stack stopped notification: ${err.message}`);
  });

  res.json({
    success: true,
    message: `Stack ${name} downed successfully`,
    output: result.stdout,
  });
}));

/**
 * POST /api/stacks/:name/restart
 * Restart a stack
 */
router.post('/:name/restart', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Restarting stack: ${name}`);

  const result = await stackService.restartStack(name);

  res.json({
    success: true,
    message: `Stack ${name} restarted successfully`,
    output: result.stdout,
  });
}));

/**
 * POST /api/stacks/:name/pull
 * Pull images for a stack
 */
router.post('/:name/pull', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Pulling images for stack: ${name}`);

  const result = await stackService.pullStack(name);

  res.json({
    success: true,
    message: `Images pulled successfully for stack ${name}`,
    output: result.stdout,
  });
}));

/**
 * DELETE /api/stacks/:name
 * Delete a stack
 */
router.delete('/:name', validate(schemas.deleteStack, 'query'), asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { removeVolumes } = req.query;
  logger.info(`Deleting stack: ${name}`);

  await stackService.deleteStack(name, removeVolumes);

  res.json({
    success: true,
    message: `Stack ${name} deleted successfully`,
  });
}));

/**
 * GET /api/stacks/:name/validate
 * Validate stack configuration
 */
router.get('/:name/validate', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Validating stack: ${name}`);

  const result = await stackService.validateStack(name);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/stacks/:name/logs
 * Get stack logs
 */
router.get('/:name/logs', validate(schemas.logOptions, 'query'), asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { tail, timestamps } = req.query;
  logger.info(`Fetching logs for stack: ${name}`);

  const logs = await stackService.getStackLogs(name, { tail, timestamps, follow: false });

  res.json({
    success: true,
    data: {
      logs,
    },
  });
}));

/**
 * POST /api/stacks/:name/update
 * Update stack images (pull latest and restart)
 */
router.post('/:name/update', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Updating stack: ${name}`);

  // Pull latest images
  const pullResult = await stackService.pullStack(name);

  // Restart the stack to use new images
  const restartResult = await stackService.restartStack(name);

  // Combine outputs
  const output = `=== Pulling Latest Images ===\n${pullResult.stdout}\n\n=== Restarting Stack ===\n${restartResult.stdout}`;

  res.json({
    success: true,
    message: `Stack ${name} updated successfully`,
    output,
  });
}));

/**
 * GET /api/stacks/:name/stream-start
 * Start a stack with real-time output streaming (SSE)
 */
router.get('/:name/stream-start', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Streaming start for stack: ${name}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stackDir = path.join(config.stacks.directory, name);

  try {
    await stackService.streamComposeCommand(
      stackDir,
      'up',
      ['-d', '--pull', 'missing', '--build'],
      (data, type) => {
        // Send data as SSE
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    );

    // Send notification (don't await to avoid blocking response)
    notificationService.notifyStackStarted(name).catch(err => {
      logger.error(`Failed to send stack started notification: ${err.message}`);
    });

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'done', data: 'Stack started successfully' })}\n\n`);
    res.end();
  } catch (error) {
    logger.error(`Failed to start stack ${name}:`, error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
    res.end();
  }
}));

/**
 * GET /api/stacks/:name/stream-restart
 * Restart a stack with real-time output streaming (SSE)
 */
router.get('/:name/stream-restart', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Streaming restart for stack: ${name}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stackDir = path.join(config.stacks.directory, name);

  try {
    await stackService.streamComposeCommand(
      stackDir,
      'restart',
      [],
      (data, type) => {
        // Send data as SSE
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    );

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'done', data: 'Stack restarted successfully' })}\n\n`);
    res.end();
  } catch (error) {
    logger.error(`Failed to restart stack ${name}:`, error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
    res.end();
  }
}));

/**
 * GET /api/stacks/:name/stream-down
 * Down a stack with real-time output streaming (SSE)
 */
router.get('/:name/stream-down', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Streaming down for stack: ${name}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stackDir = path.join(config.stacks.directory, name);

  try {
    await stackService.streamComposeCommand(
      stackDir,
      'down',
      [],
      (data, type) => {
        // Send data as SSE
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    );

    // Send notification (don't await to avoid blocking response)
    notificationService.notifyStackStopped(name).catch(err => {
      logger.error(`Failed to send stack stopped notification: ${err.message}`);
    });

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'done', data: 'Stack downed successfully' })}\n\n`);
    res.end();
  } catch (error) {
    logger.error(`Failed to down stack ${name}:`, error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
    res.end();
  }
}));

/**
 * GET /api/stacks/:name/stream-update
 * Update a stack with real-time output streaming (SSE)
 */
router.get('/:name/stream-update', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Streaming update for stack: ${name}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stackDir = path.join(config.stacks.directory, name);

  try {
    // Pull images
    res.write(`data: ${JSON.stringify({ type: 'stdout', data: '=== Pulling Latest Images ===\n' })}\n\n`);
    await stackService.streamComposeCommand(
      stackDir,
      'pull',
      [],
      (data, type) => {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    );

    // Recreate stack with new images (down then up)
    res.write(`data: ${JSON.stringify({ type: 'stdout', data: '\n=== Recreating Stack ===\n' })}\n\n`);
    await stackService.streamComposeCommand(
      stackDir,
      'down',
      [],
      (data, type) => {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    );
    await stackService.streamComposeCommand(
      stackDir,
      'up',
      ['-d'],
      (data, type) => {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    );

    // Prune dangling images (old images that are no longer tagged after pull)
    res.write(`data: ${JSON.stringify({ type: 'stdout', data: '\n=== Cleaning Up Old Images ===\n' })}\n\n`);
    try {
      // Prune only dangling images (all: false means only dangling)
      const pruneResult = await dockerService.pruneImages({ all: false });
      const deletedCount = pruneResult.ImagesDeleted?.length || 0;
      const spaceReclaimed = pruneResult.SpaceReclaimed || 0;

      if (deletedCount > 0) {
        const spaceMB = (spaceReclaimed / 1024 / 1024).toFixed(2);
        res.write(`data: ${JSON.stringify({ type: 'stdout', data: `Removed ${deletedCount} old image(s), reclaimed ${spaceMB} MB\n` })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'stdout', data: 'No old images to clean up.\n' })}\n\n`);
      }
    } catch (pruneError) {
      logger.debug(`Could not prune images: ${pruneError.message}`);
      res.write(`data: ${JSON.stringify({ type: 'stdout', data: 'Could not clean up old images (they may still be in use).\n' })}\n\n`);
    }

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'done', data: 'Stack updated successfully' })}\n\n`);
    res.end();
  } catch (error) {
    logger.error(`Failed to update stack ${name}:`, error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
    res.end();
  }
}));

/**
 * GET /api/stacks/:name/stream-deploy
 * Deploy a stack with real-time output streaming (SSE)
 * Streams compose pull/up output, then transitions to container logs
 */
router.get('/:name/stream-deploy', asyncHandler(async (req, res) => {
  const { name } = req.params;
  logger.info(`Streaming deploy for stack: ${name}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stackDir = path.join(config.stacks.directory, name);
  let currentPhase = 'pulling';
  const logStreams = [];

  // Helper to detect phase from compose output
  const detectPhase = (data) => {
    const lowerData = data.toLowerCase();
    if (lowerData.includes('pulling') || lowerData.includes('pull complete') || lowerData.includes('downloading')) {
      return 'pulling';
    } else if (lowerData.includes('creating') || lowerData.includes('created')) {
      return 'creating';
    } else if (lowerData.includes('starting') || lowerData.includes('started')) {
      return 'starting';
    } else if (lowerData.includes('running')) {
      return 'running';
    }
    return null;
  };

  // Helper to send phase event
  const sendPhaseEvent = (phase, message) => {
    if (phase !== currentPhase) {
      currentPhase = phase;
      res.write(`data: ${JSON.stringify({ type: 'phase', phase, message })}\n\n`);
    }
  };

  // Handle client disconnect
  const cleanup = () => {
    logger.info(`Client disconnected from stream-deploy for stack: ${name}`);
    // Close all log streams
    logStreams.forEach(stream => {
      if (stream && typeof stream.destroy === 'function') {
        stream.destroy();
      }
    });
  };

  req.on('close', cleanup);
  req.on('error', cleanup);

  try {
    // Send initial phase
    sendPhaseEvent('pulling', 'Pulling images...');

    // Pull images first
    await stackService.streamComposeCommand(
      stackDir,
      'pull',
      [],
      (data, type) => {
        // Detect and send phase changes
        const detectedPhase = detectPhase(data);
        if (detectedPhase) {
          sendPhaseEvent(detectedPhase, `Phase: ${detectedPhase}`);
        }
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    );

    // Start stack (compose up)
    sendPhaseEvent('creating', 'Creating containers...');
    await stackService.streamComposeCommand(
      stackDir,
      'up',
      ['-d'],
      (data, type) => {
        // Detect and send phase changes
        const detectedPhase = detectPhase(data);
        if (detectedPhase) {
          sendPhaseEvent(detectedPhase, `Phase: ${detectedPhase}`);
        }
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    );

    // Send notification (don't await to avoid blocking response)
    notificationService.notifyStackStarted(name).catch(err => {
      logger.error(`Failed to send stack started notification: ${err.message}`);
    });

    // Send done event for compose phase
    res.write(`data: ${JSON.stringify({ type: 'done', data: 'Stack deployed successfully' })}\n\n`);

    // Transition to logs phase
    sendPhaseEvent('logs', 'Streaming container logs...');

    // Wait briefly for containers to initialize before streaming logs
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get stack containers with retry logic
    let containers = await dockerService.getStackContainers(name);

    // Retry once if no containers found (timing issue)
    if (containers.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      containers = await dockerService.getStackContainers(name);
    }

    if (containers.length === 0) {
      logger.info(`No containers found for stack ${name}, ending stream`);
      res.write(`data: ${JSON.stringify({ type: 'info', data: 'No containers found for log streaming' })}\n\n`);
      res.end();
      return;
    }

    // Stream logs from all containers
    // Note: getStackContainers returns transformed objects with lowercase properties
    for (const container of containers) {
      const containerId = container.id;
      const containerName = container.name || containerId?.substring(0, 12) || 'unknown';

      try {
        const logStream = await dockerService.streamLogs(containerId, {
          follow: true,
          stdout: true,
          stderr: true,
          tail: 50, // Start with last 50 lines
          timestamps: true,
        });

        logStreams.push(logStream);

        logStream.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim());
          for (const line of lines) {
            // Docker log stream has 8-byte header for multiplexed streams
            // First byte indicates stream: 1 = stdout, 2 = stderr
            let streamType = 'stdout';
            let logData = line;

            // Check if this looks like a multiplexed stream (binary header)
            if (line.length > 8) {
              const firstByte = line.charCodeAt(0);
              if (firstByte === 1 || firstByte === 2) {
                streamType = firstByte === 2 ? 'stderr' : 'stdout';
                // Skip the 8-byte header
                logData = line.substring(8);
              }
            }

            res.write(`data: ${JSON.stringify({
              type: 'log',
              containerId,
              containerName,
              data: logData,
              stream: streamType,
            })}\n\n`);
          }
        });

        logStream.on('error', (err) => {
          logger.error(`Log stream error for container ${containerName}: ${err.message}`);
        });

        logStream.on('end', () => {
          logger.debug(`Log stream ended for container ${containerName}`);
        });
      } catch (streamError) {
        logger.error(`Failed to start log stream for container ${containerName}: ${streamError.message}`);
      }
    }

    // Keep the connection open for log streaming
    // The connection will be closed when the client disconnects
  } catch (error) {
    logger.error(`Failed to deploy stack ${name}:`, error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
    res.end();
  }
}));

export default router;
