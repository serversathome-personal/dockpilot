import express from 'express';
import { asyncHandler, ApiError } from '../../middleware/error.middleware.js';
import dockerService from '../../services/docker.service.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/containers/:id/files
 * List directory contents inside a container
 */
router.get('/:id/files', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { path = '/' } = req.query;
  logger.info(`Listing files in container ${id} at path: ${path}`);

  const files = await dockerService.listContainerFiles(id, path);

  res.json({
    success: true,
    data: files,
  });
}));

/**
 * GET /api/containers/:id/files/content
 * Get file content for preview (text files only)
 */
router.get('/:id/files/content', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { path } = req.query;

  if (!path) {
    throw new ApiError(400, 'Path parameter is required');
  }

  logger.info(`Reading file content from container ${id}: ${path}`);

  const result = await dockerService.readContainerFile(id, path);

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/containers/:id/files/download
 * Download file or directory as tar archive
 */
router.get('/:id/files/download', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { path } = req.query;

  if (!path) {
    throw new ApiError(400, 'Path parameter is required');
  }

  logger.info(`Downloading from container ${id}: ${path}`);

  // Get filename from path
  const filename = path.split('/').pop() || 'download';

  res.setHeader('Content-Type', 'application/x-tar');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.tar"`);

  const stream = await dockerService.getContainerFileArchive(id, path);
  stream.pipe(res);
}));

export default router;
