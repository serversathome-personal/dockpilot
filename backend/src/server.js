import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
import logger from './utils/logger.js';
import apiRoutes from './api/index.js';
import logsWebSocketHandler from './websocket/logs.handler.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Middleware
app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (skip static files)
app.use((req, res, next) => {
  if (!req.path.startsWith('/assets') && !req.path.startsWith('/favicon')) {
    logger.info(`${req.method} ${req.path}`, {
      query: req.query,
      ip: req.ip,
    });
  }
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Serve frontend static files in production
if (config.nodeEnv === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  logger.info(`Serving frontend from: ${frontendPath}`);

  app.use(express.static(frontendPath));

  // Serve index.html for all non-API routes (SPA support)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
} else {
  // Development mode - show API endpoints
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'DockPilot API',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        dashboard: '/api/dashboard',
        stacks: '/api/stacks',
        containers: '/api/containers',
        images: '/api/images',
        networks: '/api/networks',
        volumes: '/api/volumes',
        updates: '/api/updates',
        websocket: 'ws://localhost:' + config.port + '/ws/logs',
      },
    });
  });
}

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize WebSocket server
logsWebSocketHandler.initialize(server);

// Start server
const startServer = async () => {
  try {
    // Test Docker connection
    logger.info('Testing Docker connection...');
    const { default: dockerService } = await import('./services/docker.service.js');

    try {
      const version = await dockerService.getVersion();
      logger.info('Docker connection successful', {
        version: version.version,
        apiVersion: version.apiVersion,
      });

      // Initialize notification service and start event listener
      const { default: notificationService } = await import('./services/notification.service.js');
      await notificationService.initialize();
      await notificationService.startEventListener();
      logger.info('Notification service initialized');

      // Initialize registry service to restore saved credentials
      const { default: registryService } = await import('./services/registry.service.js');
      await registryService.initialize();
      logger.info('Registry service initialized');
    } catch (error) {
      logger.error('Failed to connect to Docker:', error);
      logger.warn('Docker is not available. Some features may not work.');
    }

    // Set timeout for long-running operations (e.g., docker builds)
    server.timeout = 600000; // 10 minutes
    server.keepAliveTimeout = 620000; // Slightly longer than timeout
    server.headersTimeout = 630000; // Slightly longer than keepAliveTimeout

    // Start HTTP server
    server.listen(config.port, '0.0.0.0', () => {
      logger.info(`Server running on port ${config.port}`, {
        environment: config.nodeEnv,
        port: config.port,
      });
      logger.info(`API available at http://0.0.0.0:${config.port}/api`);
      logger.info(`WebSocket available at ws://0.0.0.0:${config.port}/ws/logs`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Close WebSocket server
  logsWebSocketHandler.close();

  // Close HTTP server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the server
startServer();

export default app;
