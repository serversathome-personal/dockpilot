import express from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import dockerService from '../../services/docker.service.js';
import stackService from '../../services/stack.service.js';
import statsService from '../../services/stats.service.js';
import versionService from '../../services/version.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/dashboard/overview
 * Get dashboard overview data
 */
router.get('/overview', asyncHandler(async (req, res) => {
  logger.info('Fetching dashboard overview');

  const [systemInfo, containers, stacks, images, networks, volumes, cpuUsage] = await Promise.all([
    dockerService.getSystemInfo(),
    dockerService.listContainers({ all: true }),
    stackService.listStacks(),
    dockerService.listImages(),
    dockerService.listNetworks(),
    dockerService.listVolumes(),
    statsService.getCurrentCpuUsage(),
  ]);

  const runningContainers = containers.filter((c) => c.state === 'running');
  const runningStacks = stacks.filter((s) => s.status === 'running');

  // Calculate total image size
  const totalImageSize = images.reduce((acc, img) => acc + (img.size || 0), 0);

  res.json({
    success: true,
    data: {
      system: {
        dockerVersion: systemInfo.serverVersion,
        os: systemInfo.operatingSystem,
        architecture: systemInfo.architecture,
        cpus: systemInfo.ncpu,
        cpuUsage: cpuUsage,
        memory: systemInfo.memTotal,
        memoryUsage: systemInfo.memoryUsage,
        storageFree: systemInfo.storageFree,
        storageTotal: systemInfo.storageTotal,
        storageUsagePercent: systemInfo.storageUsagePercent,
        ipAddresses: systemInfo.ipAddresses,
        networkRx: systemInfo.networkRx,
        networkTx: systemInfo.networkTx,
      },
      stats: {
        containers: {
          total: containers.length,
          running: runningContainers.length,
          stopped: containers.length - runningContainers.length,
        },
        stacks: {
          total: stacks.length,
          running: runningStacks.length,
        },
        images: {
          total: images.length,
          size: totalImageSize,
        },
        networks: networks.length,
        volumes: volumes.length,
      },
      recentContainers: containers
        .sort((a, b) => b.created - a.created)
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          name: c.name,
          image: c.image,
          state: c.state,
          status: c.status,
        })),
      recentStacks: stacks
        .sort((a, b) => new Date(b.modified) - new Date(a.modified))
        .slice(0, 5)
        .map((s) => ({
          name: s.name,
          status: s.status,
          containerCount: s.containerCount,
          serviceCount: s.serviceCount,
        })),
    },
  });
}));

/**
 * GET /api/dashboard/stats
 * Get real-time system statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  logger.info('Fetching dashboard statistics');

  const containers = await dockerService.listContainers({ all: false });
  const stats = [];

  // Get stats for all running containers
  for (const container of containers.slice(0, 10)) {
    try {
      const containerStats = await dockerService.getContainerStats(container.id);
      stats.push({
        id: container.id,
        name: container.name,
        ...containerStats,
      });
    } catch (error) {
      logger.warn(`Failed to get stats for container ${container.id}:`, error.message);
    }
  }

  res.json({
    success: true,
    data: {
      timestamp: new Date().toISOString(),
      containers: stats,
    },
  });
}));

/**
 * GET /api/dashboard/cpu-history
 * Get CPU usage history
 */
router.get('/cpu-history', asyncHandler(async (req, res) => {
  logger.info('Fetching CPU usage history');

  const history = statsService.getCpuHistory();

  res.json({
    success: true,
    data: history,
  });
}));

/**
 * GET /api/dashboard/memory-history
 * Get memory usage history
 */
router.get('/memory-history', asyncHandler(async (req, res) => {
  logger.info('Fetching memory usage history');

  const history = statsService.getMemoryHistory();

  res.json({
    success: true,
    data: history,
  });
}));

/**
 * GET /api/dashboard/network-history
 * Get network traffic history
 */
router.get('/network-history', asyncHandler(async (req, res) => {
  logger.info('Fetching network traffic history');

  const history = statsService.getNetworkHistory();

  res.json({
    success: true,
    data: history,
  });
}));

/**
 * GET /api/dashboard/version
 * Get DockPilot version info
 */
router.get('/version', asyncHandler(async (req, res) => {
  const version = versionService.getCurrentVersion();

  res.json({
    success: true,
    data: {
      version,
    },
  });
}));

export default router;
