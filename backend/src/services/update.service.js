import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import dockerService from './docker.service.js';
import stackService from './stack.service.js';
import notificationService from './notification.service.js';
import configStore from '../storage/config.store.js';
import logger from '../utils/logger.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Get Docker Hub credentials from docker config
 * @returns {Object|null} Base64 encoded auth or null
 */
function getDockerHubAuth() {
  try {
    // Check common docker config locations
    const configPaths = [
      '/root/.docker/config.json',
      path.join(process.env.HOME || '/root', '.docker/config.json'),
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // Check for Docker Hub auth
        const hubAuth = config.auths?.['https://index.docker.io/v1/']?.auth ||
                        config.auths?.['registry-1.docker.io']?.auth ||
                        config.auths?.['docker.io']?.auth;
        if (hubAuth) {
          return hubAuth;
        }
      }
    }
  } catch (e) {
    // No credentials available
  }
  return null;
}

class UpdateService {
  constructor() {
    this.scheduledTasks = new Map();
    this.updateHistory = [];
    this.initializeSchedules();
  }

  /**
   * Initialize scheduled update tasks from config
   */
  async initializeSchedules() {
    try {
      const schedules = await configStore.get('updateSchedules') || [];
      for (const schedule of schedules) {
        if (schedule.enabled) {
          this.scheduleUpdate(schedule);
        }
      }
      logger.info('Update schedules initialized');
    } catch (error) {
      logger.error('Failed to initialize update schedules:', error);
    }
  }

  /**
   * Check for available updates for all images
   * @returns {Promise<Array>} Array of images with available updates
   */
  async checkForUpdates() {
    try {
      const images = await dockerService.listImages();
      const updates = [];

      // Filter valid images first
      const validImages = images.filter(image =>
        image.tags && image.tags.length > 0 && image.tags[0] !== '<none>:<none>'
      );

      logger.info(`Checking updates for ${validImages.length} images (parallel, concurrency: 10)`);

      // Process images in parallel with concurrency limit
      const concurrencyLimit = 10;
      const results = await this.processInParallel(validImages, async (image) => {
        const tag = image.tags[0];
        const [repository, currentTag] = tag.split(':');

        try {
          // Check if newer version exists and get additional info
          const remoteInfo = await this.getRemoteImageInfo(repository, currentTag || 'latest');

          // Extract just the sha256:xxx part from RepoDigests (format: repo@sha256:xxx)
          let currentDigest = image.id;
          if (image.digests && image.digests.length > 0) {
            const digestPart = image.digests[0].split('@')[1];
            if (digestPart) {
              currentDigest = digestPart;
            }
          }

          // Debug logging for digest comparison
          if (!remoteInfo || !remoteInfo.digest) {
            logger.debug(`${repository}:${currentTag} - No remote digest found`);
          } else if (remoteInfo.digest === currentDigest) {
            logger.debug(`${repository}:${currentTag} - Up to date (digest: ${currentDigest?.substring(0, 19)})`);
          } else {
            logger.debug(`${repository}:${currentTag} - Update available (local: ${currentDigest?.substring(0, 19)}, remote: ${remoteInfo.digest?.substring(0, 19)})`);
          }

          if (remoteInfo && remoteInfo.digest && remoteInfo.digest !== currentDigest) {
            // Get local image details for version/created info
            const localInfo = await this.getLocalImageInfo(`${repository}:${currentTag || 'latest'}`);

            return {
              repository,
              currentTag: currentTag || 'latest',
              currentDigest: currentDigest.substring(0, 12),
              latestDigest: remoteInfo.digest.substring(0, 12),
              hasUpdate: true,
              size: image.size,
              // Version info
              currentVersion: localInfo?.version || null,
              newVersion: remoteInfo?.version || null,
              // Creation dates
              currentCreated: localInfo?.created || image.created,
              newCreated: remoteInfo?.created || null,
            };
          }
        } catch (error) {
          logger.warn(`Failed to check update for ${tag}:`, error.message);
        }
        return null;
      }, concurrencyLimit);

      // Filter out null results
      const filteredUpdates = results.filter(result => result !== null);

      logger.info(`Found ${filteredUpdates.length} available updates`);
      return filteredUpdates;
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      throw new Error('Failed to check for updates');
    }
  }

  /**
   * Get local image info including version labels
   * @param {string} imageTag - Full image tag
   * @returns {Promise<Object>} Image info
   */
  async getLocalImageInfo(imageTag) {
    try {
      const { stdout } = await execAsync(
        `docker inspect ${imageTag} --format '{{json .}}'`,
        { timeout: 5000 }
      );

      if (!stdout.trim()) return null;

      const info = JSON.parse(stdout);
      const labels = info.Config?.Labels || {};

      return {
        created: info.Created,
        version: labels['org.opencontainers.image.version'] ||
                 labels['version'] ||
                 labels['VERSION'] ||
                 null,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get remote image info from registry using registry API
   * @param {string} repository - Image repository
   * @param {string} tag - Image tag
   * @returns {Promise<Object>} Remote image info
   */
  async getRemoteImageInfo(repository, tag) {
    try {
      // Determine registry and image path
      let registryUrl = 'https://registry-1.docker.io';
      let authUrl = 'https://auth.docker.io/token';
      let imagePath = repository;
      let authService = 'registry.docker.io';

      // Handle different registries
      if (repository.includes('/') && repository.split('/')[0].includes('.')) {
        // Custom registry (e.g., ghcr.io/user/image, lscr.io/linuxserver/image)
        const parts = repository.split('/');
        const registry = parts[0];
        imagePath = parts.slice(1).join('/');

        if (registry === 'ghcr.io') {
          registryUrl = 'https://ghcr.io';
          authUrl = 'https://ghcr.io/token';
          authService = 'ghcr.io';
        } else if (registry === 'lscr.io') {
          // lscr.io is a frontend for ghcr.io/linuxserver
          registryUrl = 'https://ghcr.io';
          authUrl = 'https://ghcr.io/token';
          authService = 'ghcr.io';
        } else if (registry === 'gcr.io') {
          registryUrl = 'https://gcr.io';
          authUrl = null; // GCR uses different auth
        } else {
          // Generic registry
          registryUrl = `https://${registry}`;
          authUrl = `https://${registry}/token`;
          authService = registry;
        }
      } else if (!repository.includes('/')) {
        // Official Docker Hub image (e.g., nginx, ubuntu)
        imagePath = `library/${repository}`;
      }

      // Get auth token (for Docker Hub and compatible registries)
      let authToken = '';
      if (authUrl) {
        try {
          // Check if we have Docker Hub credentials for authenticated requests
          let authCurlHeader = '';
          if (authService === 'registry.docker.io') {
            const hubAuth = getDockerHubAuth();
            if (hubAuth) {
              authCurlHeader = `-H "Authorization: Basic ${hubAuth}"`;
              logger.debug('Using Docker Hub credentials for authenticated pull');
            }
          }

          const { stdout: tokenStdout } = await execAsync(
            `curl -s ${authCurlHeader} "${authUrl}?service=${authService}&scope=repository:${imagePath}:pull" 2>/dev/null`,
            { timeout: 10000 }
          );
          const tokenData = JSON.parse(tokenStdout);
          if (tokenData.token) {
            authToken = tokenData.token;
          }
          // Check for rate limit error
          if (tokenData.errors?.some(e => e.code === 'TOOMANYREQUESTS')) {
            logger.warn(`Docker Hub rate limit reached for ${repository}. Consider running 'docker login' to authenticate.`);
          }
        } catch (e) {
          // Auth failed, try without token
        }
      }

      const authHeader = authToken ? `-H "Authorization: Bearer ${authToken}"` : '';

      // Get manifest digest using HEAD request with Docker-Content-Digest header
      const acceptHeader = 'application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json';
      const { stdout: digestStdout } = await execAsync(
        `curl -sI ${authHeader} -H "Accept: ${acceptHeader}" "${registryUrl}/v2/${imagePath}/manifests/${tag}" 2>/dev/null | grep -i docker-content-digest | awk '{print $2}' | tr -d '\\r\\n'`,
        { timeout: 15000 }
      );

      const digest = digestStdout.trim() || null;
      if (!digest) {
        // Fallback to docker manifest inspect if registry API failed
        logger.debug(`No digest from registry for ${repository}:${tag}, using fallback`);
        return await this.getRemoteImageInfoFallback(repository, tag);
      }
      logger.debug(`Registry digest for ${repository}:${tag}: ${digest.substring(0, 19)}`);


      // Try to get version info from remote image config
      let version = null;
      let created = null;

      try {
        // First fetch manifest list/index to handle multi-arch images
        const indexAccept = 'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json';
        const { stdout: indexStdout } = await execAsync(
          `curl -s ${authHeader} -H "Accept: ${indexAccept}" "${registryUrl}/v2/${imagePath}/manifests/${tag}" 2>/dev/null`,
          { timeout: 10000 }
        );

        let configDigest = null;

        if (indexStdout.trim()) {
          const indexData = JSON.parse(indexStdout);

          // Check if this is a manifest list/index (multi-arch)
          if (indexData.manifests && Array.isArray(indexData.manifests)) {
            // Find amd64 manifest, skip attestation manifests
            const amd64Manifest = indexData.manifests.find(m =>
              m.platform?.architecture === 'amd64' &&
              m.platform?.os === 'linux' &&
              !m.annotations?.['vnd.docker.reference.type']
            ) || indexData.manifests.find(m =>
              m.platform?.architecture !== 'unknown' && !m.annotations?.['vnd.docker.reference.type']
            );

            if (amd64Manifest?.digest) {
              // Fetch the platform-specific manifest
              const manifestAccept = 'application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json';
              const { stdout: platformStdout } = await execAsync(
                `curl -s ${authHeader} -H "Accept: ${manifestAccept}" "${registryUrl}/v2/${imagePath}/manifests/${amd64Manifest.digest}" 2>/dev/null`,
                { timeout: 10000 }
              );
              if (platformStdout.trim()) {
                const platformManifest = JSON.parse(platformStdout);
                configDigest = platformManifest.config?.digest;
              }
            }
          } else if (indexData.config?.digest) {
            // Single-arch image, config digest is directly available
            configDigest = indexData.config.digest;
          }
        }

        // Fetch the config blob which contains labels
        if (configDigest) {
          const { stdout: configStdout } = await execAsync(
            `curl -sL ${authHeader} "${registryUrl}/v2/${imagePath}/blobs/${configDigest}" 2>/dev/null`,
            { timeout: 10000 }
          );

          if (configStdout.trim()) {
            // Check for rate limit error
            if (configStdout.includes('TOOMANYREQUESTS') || configStdout.includes('rate limit')) {
              logger.warn(`Rate limit reached for ${repository}. Mount ~/.docker/config.json for authenticated pulls.`);
            } else {
              try {
                const config = JSON.parse(configStdout);
                created = config.created || null;

                // Extract version from labels
                const labels = config.config?.Labels || {};
                version = labels['org.opencontainers.image.version'] ||
                          labels['version'] ||
                          labels['VERSION'] ||
                          null;

                // If no version label, try to get from GitHub releases
                if (!version) {
                  const sourceUrl = labels['org.opencontainers.image.source'];
                  if (sourceUrl && sourceUrl.includes('github.com')) {
                    version = await this.getGitHubLatestRelease(sourceUrl);
                  }
                }

                if (!version) {
                  logger.debug(`No version label found for ${repository}:${tag}`);
                }
              } catch (parseErr) {
                logger.debug(`Failed to parse config for ${repository}:${tag}`);
              }
            }
          }
        }
      } catch (e) {
        // Config fetch failed, continue without version info
        logger.debug(`Failed to get remote config for ${repository}:${tag}:`, e.message);
      }

      return { digest, version, created };
    } catch (error) {
      logger.warn(`Failed to get remote info for ${repository}:${tag}:`, error.message);
      return null;
    }
  }

  /**
   * Fallback method using docker manifest inspect
   */
  async getRemoteImageInfoFallback(repository, tag) {
    try {
      const { stdout: manifestStdout } = await execAsync(
        `docker manifest inspect ${repository}:${tag} --insecure 2>/dev/null || echo ""`,
        { timeout: 15000 }
      );

      if (!manifestStdout.trim()) return null;

      // Compute digest of the manifest JSON (this is what Docker uses for RepoDigest)
      const { stdout: digestStdout } = await execAsync(
        `echo '${manifestStdout.replace(/'/g, "\\'")}' | sha256sum | awk '{print "sha256:" $1}'`,
        { timeout: 5000 }
      );

      return {
        digest: digestStdout.trim() || null,
        version: null,
        created: null,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get latest release version from GitHub
   * @param {string} sourceUrl - GitHub repository URL
   * @returns {Promise<string|null>} Version string or null
   */
  async getGitHubLatestRelease(sourceUrl) {
    try {
      // Parse GitHub URL to get owner/repo
      // Formats: https://github.com/owner/repo or github.com/owner/repo
      const match = sourceUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) return null;

      const [, owner, repo] = match;
      const repoName = repo.replace(/\.git$/, ''); // Remove .git suffix if present

      const { stdout } = await execAsync(
        `curl -s "https://api.github.com/repos/${owner}/${repoName}/releases/latest" 2>/dev/null`,
        { timeout: 5000 }
      );

      if (stdout.trim()) {
        const release = JSON.parse(stdout);
        if (release.tag_name) {
          logger.debug(`Found GitHub release ${release.tag_name} for ${owner}/${repoName}`);
          return release.tag_name;
        }
      }
    } catch (e) {
      // GitHub API failed, continue without version
      logger.debug(`Failed to get GitHub release: ${e.message}`);
    }
    return null;
  }

  /**
   * Process items in parallel with concurrency limit
   * @param {Array} items - Items to process
   * @param {Function} fn - Async function to run on each item
   * @param {number} concurrency - Max concurrent operations
   * @returns {Promise<Array>} Results array
   */
  async processInParallel(items, fn, concurrency) {
    const results = [];
    const executing = new Set();

    for (const item of items) {
      const promise = fn(item).then(result => {
        executing.delete(promise);
        return result;
      });

      results.push(promise);
      executing.add(promise);

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
  }

  /**
   * Get latest image digest from registry
   * @param {string} repository - Image repository
   * @param {string} tag - Image tag
   * @returns {Promise<string>} Latest digest
   */
  async getLatestImageDigest(repository, tag) {
    try {
      // Use Docker CLI to inspect the remote image with timeout
      const { stdout } = await execAsync(
        `docker manifest inspect ${repository}:${tag} --insecure 2>/dev/null || echo ""`,
        { timeout: 15000 } // 15 second timeout per image
      );

      if (!stdout.trim()) {
        return null;
      }

      const manifest = JSON.parse(stdout);
      return manifest.config?.digest || null;
    } catch (error) {
      // Image might not be available in registry, requires auth, or timed out
      return null;
    }
  }

  /**
   * Execute update for a specific image
   * @param {string} repository - Image repository
   * @param {string} tag - Image tag
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Update result
   */
  async executeUpdate(repository, tag, options = {}) {
    const imageTag = `${repository}:${tag}`;
    const updateRecord = {
      image: imageTag,
      timestamp: new Date().toISOString(),
      status: 'pending',
      restartedContainers: [],
    };

    try {
      logger.info(`Starting update for ${imageTag}`);

      // Get containers using this image
      const containers = await dockerService.listContainers({ all: true });
      const affectedContainers = containers.filter(c =>
        c.image === imageTag || c.image === repository
      );

      // Pull latest image
      logger.info(`Pulling latest ${imageTag}`);
      await execAsync(`docker pull ${imageTag}`);

      updateRecord.status = 'pulled';

      // Restart affected containers if requested
      if (options.restartContainers && affectedContainers.length > 0) {
        logger.info(`Restarting ${affectedContainers.length} containers`);

        for (const container of affectedContainers) {
          try {
            // Check if container is part of a stack
            const stackName = container.labels['com.docker.compose.project'];

            if (stackName) {
              // Restart the entire stack
              await stackService.restartStack(stackName);
              updateRecord.restartedContainers.push({
                id: container.id,
                name: container.name,
                stack: stackName,
                type: 'stack',
              });
            } else {
              // Restart individual container
              await dockerService.restartContainer(container.id);
              updateRecord.restartedContainers.push({
                id: container.id,
                name: container.name,
                type: 'container',
              });
            }
          } catch (error) {
            logger.error(`Failed to restart container ${container.name}:`, error);
            updateRecord.restartedContainers.push({
              id: container.id,
              name: container.name,
              error: error.message,
            });
          }
        }
      }

      updateRecord.status = 'completed';
      updateRecord.affectedContainers = affectedContainers.length;

      // Add to history
      this.updateHistory.unshift(updateRecord);
      if (this.updateHistory.length > 100) {
        this.updateHistory = this.updateHistory.slice(0, 100);
      }

      // Send notification
      const containerNames = affectedContainers.map(c => c.name);
      await notificationService.notifyImageUpdated(imageTag, containerNames);

      logger.info(`Update completed for ${imageTag}`);
      return updateRecord;
    } catch (error) {
      logger.error(`Failed to update ${imageTag}:`, error);
      updateRecord.status = 'failed';
      updateRecord.error = error.message;
      this.updateHistory.unshift(updateRecord);

      // Send failure notification
      await notificationService.notifyImageUpdateFailed(imageTag, error.message);

      throw error;
    }
  }

  /**
   * Execute update with streaming progress
   * @param {string} repository - Image repository
   * @param {string} tag - Image tag
   * @param {Object} options - Update options
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Update result
   */
  async executeUpdateWithProgress(repository, tag, options = {}, onProgress = () => {}) {
    const imageTag = `${repository}:${tag}`;
    const updateRecord = {
      image: imageTag,
      timestamp: new Date().toISOString(),
      status: 'pending',
      restartedContainers: [],
    };

    try {
      logger.info(`Starting update with progress for ${imageTag}`);

      // Get containers using this image
      const containers = await dockerService.listContainers({ all: true });
      const affectedContainers = containers.filter(c =>
        c.image === imageTag || c.image === repository
      );

      // Pull with progress streaming
      await this.pullImageWithProgress(imageTag, onProgress);

      updateRecord.status = 'pulled';

      // Restart affected containers if requested
      if (options.restartContainers && affectedContainers.length > 0) {
        onProgress({ status: 'restarting', message: `Restarting ${affectedContainers.length} container(s)...` });

        for (const container of affectedContainers) {
          try {
            const stackName = container.labels['com.docker.compose.project'];

            if (stackName) {
              await stackService.restartStack(stackName);
              updateRecord.restartedContainers.push({
                id: container.id,
                name: container.name,
                stack: stackName,
                type: 'stack',
              });
            } else {
              await dockerService.restartContainer(container.id);
              updateRecord.restartedContainers.push({
                id: container.id,
                name: container.name,
                type: 'container',
              });
            }
          } catch (error) {
            logger.error(`Failed to restart container ${container.name}:`, error);
            updateRecord.restartedContainers.push({
              id: container.id,
              name: container.name,
              error: error.message,
            });
          }
        }
      }

      updateRecord.status = 'completed';
      updateRecord.affectedContainers = affectedContainers.length;

      this.updateHistory.unshift(updateRecord);
      if (this.updateHistory.length > 100) {
        this.updateHistory = this.updateHistory.slice(0, 100);
      }

      // Send notification
      const containerNames = affectedContainers.map(c => c.name);
      await notificationService.notifyImageUpdated(imageTag, containerNames);

      return updateRecord;
    } catch (error) {
      logger.error(`Failed to update ${imageTag}:`, error);
      updateRecord.status = 'failed';
      updateRecord.error = error.message;
      this.updateHistory.unshift(updateRecord);

      // Send failure notification
      await notificationService.notifyImageUpdateFailed(imageTag, error.message);

      throw error;
    }
  }

  /**
   * Pull image with progress streaming
   * @param {string} imageTag - Full image tag
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<void>}
   */
  pullImageWithProgress(imageTag, onProgress) {
    return new Promise((resolve, reject) => {
      const pull = spawn('docker', ['pull', imageTag]);

      let layerProgress = {};
      let lastUpdate = 0;

      const parseProgress = (line) => {
        // Parse docker pull output
        // Format: "abc123: Downloading [===>    ] 10MB/50MB"
        // Or: "abc123: Pull complete"
        // Or: "Status: Downloaded newer image"

        const downloadMatch = line.match(/^([a-f0-9]+): Downloading\s+\[([=>\s]+)\]\s+([\d.]+\s*[kMG]?B)\/([\d.]+\s*[kMG]?B)/i);
        const extractMatch = line.match(/^([a-f0-9]+): Extracting\s+\[([=>\s]+)\]\s+([\d.]+\s*[kMG]?B)\/([\d.]+\s*[kMG]?B)/i);
        const completeMatch = line.match(/^([a-f0-9]+): (Pull complete|Already exists|Download complete)/i);
        const statusMatch = line.match(/^Status: (.+)/i);
        const digestMatch = line.match(/^Digest: (sha256:[a-f0-9]+)/i);

        if (downloadMatch) {
          const [, layerId, , current, total] = downloadMatch;
          layerProgress[layerId] = { status: 'downloading', current, total };
        } else if (extractMatch) {
          const [, layerId, , current, total] = extractMatch;
          layerProgress[layerId] = { status: 'extracting', current, total };
        } else if (completeMatch) {
          const [, layerId, status] = completeMatch;
          layerProgress[layerId] = { status: status.toLowerCase().replace(' ', '_'), complete: true };
        } else if (statusMatch) {
          onProgress({ status: 'status', message: statusMatch[1] });
          return;
        } else if (digestMatch) {
          onProgress({ status: 'digest', digest: digestMatch[1] });
          return;
        }

        // Throttle progress updates to every 200ms
        const now = Date.now();
        if (now - lastUpdate < 200) return;
        lastUpdate = now;

        // Calculate overall progress
        const layers = Object.entries(layerProgress);
        const completedLayers = layers.filter(([, l]) => l.complete).length;
        const totalLayers = layers.length;

        // Calculate download progress
        let downloadedBytes = 0;
        let totalBytes = 0;
        layers.forEach(([, layer]) => {
          if (layer.current && layer.total) {
            downloadedBytes += parseSize(layer.current);
            totalBytes += parseSize(layer.total);
          }
        });

        onProgress({
          status: 'downloading',
          layers: { completed: completedLayers, total: totalLayers },
          bytes: { downloaded: formatBytes(downloadedBytes), total: formatBytes(totalBytes) },
          percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
        });
      };

      const parseSize = (sizeStr) => {
        const match = sizeStr.match(/([\d.]+)\s*([kMG]?B)/i);
        if (!match) return 0;
        const [, num, unit] = match;
        const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024 * 1024, 'GB': 1024 * 1024 * 1024 };
        return parseFloat(num) * (multipliers[unit.toUpperCase()] || 1);
      };

      const formatBytes = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      };

      let buffer = '';
      pull.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(line => line.trim() && parseProgress(line.trim()));
      });

      pull.stderr.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(line => line.trim() && parseProgress(line.trim()));
      });

      pull.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Docker pull failed with code ${code}`));
        }
      });

      pull.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Execute updates for multiple images
   * @param {Array} images - Array of images to update
   * @param {Object} options - Update options
   * @returns {Promise<Array>} Array of update results
   */
  async executeMultipleUpdates(images, options = {}) {
    const results = [];

    for (const image of images) {
      try {
        const result = await this.executeUpdate(image.repository, image.currentTag, options);
        results.push(result);
      } catch (error) {
        results.push({
          image: `${image.repository}:${image.currentTag}`,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Schedule automatic updates
   * @param {Object} schedule - Schedule configuration
   * @returns {void}
   */
  scheduleUpdate(schedule) {
    // Validate cron expression
    if (!cron.validate(schedule.cronExpression)) {
      throw new Error('Invalid cron expression');
    }

    // Stop existing task if any
    if (this.scheduledTasks.has(schedule.id)) {
      this.scheduledTasks.get(schedule.id).stop();
    }

    // Create new scheduled task
    const task = cron.schedule(schedule.cronExpression, async () => {
      logger.info(`Running scheduled update: ${schedule.name}`);

      try {
        const updates = await this.checkForUpdates();

        // Filter based on exclusions
        const filteredUpdates = updates.filter(update => {
          const imageTag = `${update.repository}:${update.currentTag}`;
          return !schedule.excludedImages?.includes(imageTag);
        });

        // Filter based on update type (major/minor)
        let updatesToApply = filteredUpdates;
        if (schedule.updateType === 'minor') {
          updatesToApply = filteredUpdates.filter(update => {
            // Simple heuristic: check if tag is semantic version
            const currentVersion = update.currentTag.match(/^v?(\d+)\.(\d+)\.(\d+)/);
            if (!currentVersion) return true; // Include if not semver

            // For minor updates only, we'd need to compare with latest
            // For now, include all (can be enhanced)
            return true;
          });
        }

        if (updatesToApply.length > 0) {
          if (schedule.updateType === 'checkOnly') {
            // Check only mode - notify but don't apply updates
            await notificationService.notifyUpdatesAvailable(updatesToApply);
            logger.info(`Scheduled check completed: ${updatesToApply.length} updates available (check only mode)`);
          } else {
            // Apply updates
            await this.executeMultipleUpdates(updatesToApply, {
              restartContainers: schedule.restartContainers,
            });
            logger.info(`Scheduled update completed: ${updatesToApply.length} images updated`);
          }
        }
      } catch (error) {
        logger.error(`Scheduled update failed:`, error);
      }
    });

    this.scheduledTasks.set(schedule.id, task);
    logger.info(`Scheduled update task created: ${schedule.name}`);
  }

  /**
   * Get all update schedules
   * @returns {Promise<Array>} Array of schedules
   */
  async getSchedules() {
    const schedules = await configStore.get('updateSchedules') || [];
    return schedules;
  }

  /**
   * Save update schedule
   * @param {Object} schedule - Schedule configuration
   * @returns {Promise<Object>} Saved schedule
   */
  async saveSchedule(schedule) {
    const schedules = await this.getSchedules();

    if (!schedule.id) {
      schedule.id = `schedule_${Date.now()}`;
      schedules.push(schedule);
    } else {
      const index = schedules.findIndex(s => s.id === schedule.id);
      if (index >= 0) {
        schedules[index] = schedule;
      } else {
        schedules.push(schedule);
      }
    }

    await configStore.set('updateSchedules', schedules);

    // Update scheduled task
    if (schedule.enabled) {
      this.scheduleUpdate(schedule);
    } else if (this.scheduledTasks.has(schedule.id)) {
      this.scheduledTasks.get(schedule.id).stop();
      this.scheduledTasks.delete(schedule.id);
    }

    return schedule;
  }

  /**
   * Delete update schedule
   * @param {string} scheduleId - Schedule ID
   * @returns {Promise<void>}
   */
  async deleteSchedule(scheduleId) {
    const schedules = await this.getSchedules();
    const filtered = schedules.filter(s => s.id !== scheduleId);
    await configStore.set('updateSchedules', filtered);

    // Stop scheduled task
    if (this.scheduledTasks.has(scheduleId)) {
      this.scheduledTasks.get(scheduleId).stop();
      this.scheduledTasks.delete(scheduleId);
    }
  }

  /**
   * Get update history
   * @param {number} limit - Maximum number of records
   * @returns {Array} Update history
   */
  getHistory(limit = 50) {
    return this.updateHistory.slice(0, limit);
  }

  /**
   * Clear update history
   * @returns {void}
   */
  clearHistory() {
    this.updateHistory = [];
  }
}

// Export singleton instance
const updateService = new UpdateService();
export default updateService;
