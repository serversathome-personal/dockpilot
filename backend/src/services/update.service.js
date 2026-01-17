import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import dockerService from './docker.service.js';
import stackService from './stack.service.js';
import notificationService from './notification.service.js';
import configStore from '../storage/config.store.js';
import logger from '../utils/logger.js';
import { exec } from 'child_process';
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

          // Use RepoDigests for comparison (same as Watchtower)
          const localDigests = image.digests || [];

          // Check if digests match
          if (!remoteInfo || !remoteInfo.digest) {
            logger.debug(`${repository}:${currentTag} - No remote digest found`);
          }

          // Check if digests match - if not, update is available
          if (remoteInfo && remoteInfo.digest && !this.digestsMatch(localDigests, remoteInfo.digest)) {
            // Get local image details for version/created info
            const localInfo = await this.getLocalImageInfo(`${repository}:${currentTag || 'latest'}`);
            const localDigest = localDigests[0]?.split('@')[1] || image.id;

            return {
              repository,
              currentTag: currentTag || 'latest',
              currentDigest: this.normalizeDigest(localDigest).substring(0, 12),
              latestDigest: this.normalizeDigest(remoteInfo.digest).substring(0, 12),
              hasUpdate: true,
              updateType: 'registry', // New image available in registry
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

      // Filter out null results (registry updates)
      const registryUpdates = results.filter(result => result !== null);

      // Also check for containers running outdated local images
      const outdatedContainers = await this.checkOutdatedContainers();

      // Combine both types of updates
      const allUpdates = [...registryUpdates, ...outdatedContainers];

      // Deduplicate by repository:tag (prefer registry updates over container updates)
      const seen = new Set();
      const dedupedUpdates = allUpdates.filter(update => {
        const key = `${update.repository}:${update.currentTag}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const registryCount = dedupedUpdates.filter(u => u.updateType === 'registry').length;
      const containerCount = dedupedUpdates.filter(u => u.updateType === 'container').length;
      logger.info(`Found ${dedupedUpdates.length} updates (${registryCount} registry, ${containerCount} outdated containers)`);

      return dedupedUpdates;
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
   * Check for containers running outdated local images
   * This catches cases where the image was pulled but container not recreated
   * @returns {Promise<Array>} Array of containers needing recreation
   */
  async checkOutdatedContainers() {
    try {
      const containers = await dockerService.listContainers({ all: true });
      const outdated = [];

      logger.info(`Checking ${containers.length} containers for outdated images`);

      for (const container of containers) {
        // Skip containers without proper image info
        if (!container.imageId) {
          continue;
        }

        try {
          // Get the image reference - might be a tag or just an ID
          let imageTag = container.image;

          // If image is a sha256: reference, ID-only, or missing tag, look up the original image
          const needsConfigLookup = !imageTag ||
            imageTag.startsWith('sha256:') ||
            !imageTag.includes(':') ||
            imageTag.match(/^[a-f0-9]{12,64}$/i);

          if (needsConfigLookup) {
            // Try to get original image from container's Config.Image
            const { stdout: configImage } = await execAsync(
              `docker inspect ${container.id} --format '{{.Config.Image}}' 2>/dev/null`,
              { timeout: 5000 }
            );
            const originalImage = configImage.trim();

            if (originalImage && !originalImage.startsWith('sha256:')) {
              // Add :latest if no tag specified
              imageTag = originalImage.includes(':') ? originalImage : `${originalImage}:latest`;
            } else {
              // Can't determine original image reference, skip
              continue;
            }
          }

          // Skip sha256: references (shouldn't happen after above, but safety check)
          if (imageTag.startsWith('sha256:')) {
            continue;
          }

          // Get current image ID for this tag
          const { stdout } = await execAsync(
            `docker images "${imageTag}" --format '{{.ID}}' 2>/dev/null | head -1`,
            { timeout: 5000 }
          );

          const currentImageId = stdout.trim();
          if (!currentImageId) {
            continue;
          }

          // Container's image ID (short form for comparison)
          const containerImageId = container.imageId.replace('sha256:', '').substring(0, 12);
          const currentImageIdShort = currentImageId.substring(0, 12);

          // If they differ, the container needs to be recreated
          if (containerImageId !== currentImageIdShort) {
            // Get image details for version info
            const localInfo = await this.getLocalImageInfo(imageTag);
            const [repository, tag] = imageTag.split(':');

            // Get version from container's old image if possible
            let oldVersion = null;
            try {
              const { stdout: oldInfo } = await execAsync(
                `docker inspect ${container.imageId} --format '{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null`,
                { timeout: 3000 }
              );
              oldVersion = oldInfo.trim() || null;
            } catch (e) {
              // Old image might be deleted
            }

            outdated.push({
              repository,
              currentTag: tag || 'latest',
              currentDigest: containerImageId,
              latestDigest: currentImageIdShort,
              hasUpdate: true,
              updateType: 'container', // Distinguishes from 'registry' updates
              containerId: container.id,
              containerName: container.name,
              currentVersion: oldVersion,
              newVersion: localInfo?.version || null,
              currentCreated: null,
              newCreated: localInfo?.created || null,
            });

            logger.debug(`Container ${container.name} running outdated image: ${containerImageId} vs ${currentImageIdShort}`);
          }
        } catch (error) {
          // Skip containers we can't check
          logger.debug(`Could not check container ${container.name}: ${error.message}`);
        }
      }

      return outdated;
    } catch (error) {
      logger.error('Failed to check outdated containers:', error);
      return [];
    }
  }

  /**
   * Normalize digest by stripping sha256: prefix for comparison
   * @param {string} digest - Digest string
   * @returns {string} Normalized digest (hash only)
   */
  normalizeDigest(digest) {
    if (!digest) return '';
    return digest.replace(/^sha256:/i, '').trim();
  }

  /**
   * Check if local digests match remote digest
   * @param {Array} localDigests - Array of local RepoDigests (format: repo@sha256:xxx)
   * @param {string} remoteDigest - Remote digest (format: sha256:xxx)
   * @returns {boolean} True if any local digest matches
   */
  digestsMatch(localDigests, remoteDigest) {
    if (!localDigests || !remoteDigest) return false;

    // Clean and normalize remote digest (remove any whitespace/newlines)
    const cleanedRemote = remoteDigest.replace(/[\r\n\s]/g, '');
    const normalizedRemote = this.normalizeDigest(cleanedRemote);

    for (const localDigest of localDigests) {
      // Split digest into repo and hash parts (e.g., "repo@sha256:abc")
      const parts = localDigest.split('@');
      if (parts.length < 2) continue;

      const normalizedLocal = this.normalizeDigest(parts[1]);
      if (normalizedLocal === normalizedRemote) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get registry info for a repository
   * @param {string} repository - Image repository
   * @returns {Object} Registry configuration
   */
  getRegistryInfo(repository) {
    let registryUrl = 'https://registry-1.docker.io';
    let authUrl = 'https://auth.docker.io/token';
    let imagePath = repository;
    let authService = 'registry.docker.io';
    let originalRegistry = null;

    // Handle different registries
    if (repository.includes('/') && repository.split('/')[0].includes('.')) {
      const parts = repository.split('/');
      const registry = parts[0];
      imagePath = parts.slice(1).join('/');
      originalRegistry = registry;

      if (registry === 'ghcr.io') {
        registryUrl = 'https://ghcr.io';
        authUrl = 'https://ghcr.io/token';
        authService = 'ghcr.io';
      } else if (registry === 'lscr.io') {
        // lscr.io redirects to ghcr.io - images are at ghcr.io/linuxserver/...
        registryUrl = 'https://ghcr.io';
        authUrl = 'https://ghcr.io/token';
        authService = 'ghcr.io';
        // Keep original imagePath (linuxserver/emby) as that's where it's hosted on ghcr
      } else if (registry === 'gcr.io') {
        registryUrl = 'https://gcr.io';
        authUrl = null;
      } else if (registry === 'quay.io') {
        registryUrl = 'https://quay.io';
        authUrl = 'https://quay.io/v2/auth';
        authService = 'quay.io';
      } else {
        registryUrl = `https://${registry}`;
        authUrl = `https://${registry}/token`;
        authService = registry;
      }
    } else if (!repository.includes('/')) {
      // Official Docker Hub image (e.g., nginx, ubuntu)
      imagePath = `library/${repository}`;
    }

    return { registryUrl, authUrl, imagePath, authService, originalRegistry };
  }

  /**
   * Get auth token for registry
   * @param {Object} registryInfo - Registry configuration
   * @returns {Promise<string>} Auth token or empty string
   */
  async getAuthToken(registryInfo) {
    const { authUrl, imagePath, authService } = registryInfo;

    if (!authUrl) return '';

    try {
      let authCurlHeader = '';
      if (authService === 'registry.docker.io') {
        const hubAuth = getDockerHubAuth();
        if (hubAuth) {
          authCurlHeader = `-H "Authorization: Basic ${hubAuth}"`;
        }
      }

      const { stdout } = await execAsync(
        `curl -s ${authCurlHeader} "${authUrl}?service=${authService}&scope=repository:${imagePath}:pull" 2>/dev/null`,
        { timeout: 10000 }
      );

      const data = JSON.parse(stdout);
      return data.token || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Get remote image info from registry using registry API
   * Uses same approach as Watchtower: HEAD request for Docker-Content-Digest
   * @param {string} repository - Image repository
   * @param {string} tag - Image tag
   * @returns {Promise<Object>} Remote image info
   */
  async getRemoteImageInfo(repository, tag) {
    try {
      const registryInfo = this.getRegistryInfo(repository);
      const { registryUrl, imagePath } = registryInfo;

      // Get auth token
      const authToken = await this.getAuthToken(registryInfo);
      const authHeader = authToken ? `-H "Authorization: Bearer ${authToken}"` : '';

      // Accept headers matching Watchtower's approach
      const acceptHeader = 'application/vnd.docker.distribution.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json';

      // HEAD request to get Docker-Content-Digest header
      const manifestUrl = `${registryUrl}/v2/${imagePath}/manifests/${tag}`;
      const { stdout: headResponse } = await execAsync(
        `curl -sI ${authHeader} -H "Accept: ${acceptHeader}" "${manifestUrl}" 2>/dev/null`,
        { timeout: 15000 }
      );

      // Extract Docker-Content-Digest header
      let digest = null;
      const lines = headResponse.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().startsWith('docker-content-digest:')) {
          digest = line.split(':').slice(1).join(':').trim();
          break;
        }
      }

      if (!digest) {
        // Try GET request as fallback (some registries don't return digest in HEAD)
        logger.debug(`No digest from HEAD for ${repository}:${tag}, trying GET`);
        const { stdout: getResponse } = await execAsync(
          `curl -s -D - ${authHeader} -H "Accept: ${acceptHeader}" "${manifestUrl}" 2>/dev/null | head -50`,
          { timeout: 15000 }
        );

        for (const line of getResponse.split('\n')) {
          if (line.toLowerCase().startsWith('docker-content-digest:')) {
            digest = line.split(':').slice(1).join(':').trim();
            break;
          }
        }
      }

      if (!digest) {
        logger.debug(`No digest from registry for ${repository}:${tag}`);
        return null;
      }

      logger.debug(`Initial remote digest for ${repository}:${tag}: ${digest.substring(0, 19)}`);

      // Try to get version info from remote image config
      // Also get platform-specific digest for multi-arch images
      let version = null;
      let created = null;
      let platformDigest = null;

      try {
        // First fetch manifest to check if it's a manifest list/index (multi-arch)
        const indexAccept = 'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json';
        const { stdout: indexStdout } = await execAsync(
          `curl -s ${authHeader} -H "Accept: ${indexAccept}" "${registryUrl}/v2/${imagePath}/manifests/${tag}" 2>/dev/null`,
          { timeout: 10000 }
        );

        let configDigest = null;

        if (indexStdout.trim()) {
          const indexData = JSON.parse(indexStdout);

          // Check if this is a manifest list/index (multi-arch)
          if (indexData.manifests && Array.isArray(indexData.manifests)) {
            // This is a multi-arch image - need to get platform-specific digest
            // Find amd64 manifest, skip attestation manifests
            const amd64Manifest = indexData.manifests.find(m =>
              m.platform?.architecture === 'amd64' &&
              m.platform?.os === 'linux' &&
              !m.annotations?.['vnd.docker.reference.type']
            ) || indexData.manifests.find(m =>
              m.platform?.architecture !== 'unknown' && !m.annotations?.['vnd.docker.reference.type']
            );

            if (amd64Manifest?.digest) {
              // Use the platform-specific manifest digest for comparison
              // This is what Docker stores locally in RepoDigests
              platformDigest = amd64Manifest.digest;
              logger.debug(`Multi-arch image ${repository}:${tag}, using platform digest: ${platformDigest.substring(0, 19)}`);

              // Fetch the platform-specific manifest to get config digest
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

      // Use the original digest from HEAD request (manifest list digest for multi-arch)
      // Docker stores manifest list digest in RepoDigests, not platform-specific
      logger.debug(`Final digest for ${repository}:${tag}: ${digest.substring(0, 19)}${platformDigest ? ' (multi-arch, platform: ' + platformDigest.substring(0, 19) + ')' : ''}`);

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
   * Execute update for a specific image (non-streaming version)
   * @param {Object} update - Update object with repository, tag, updateType, containerId, containerName
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Update result
   */
  async executeUpdate(update, options = {}) {
    const { repository, currentTag: tag, updateType, containerId, containerName } = update;
    const imageTag = `${repository}:${tag}`;
    const updateRecord = {
      image: imageTag,
      timestamp: new Date().toISOString(),
      status: 'pending',
      restartedContainers: [],
      updateType,
    };

    try {
      logger.info(`Starting update for ${imageTag} (type: ${updateType || 'registry'})`);

      // For registry updates, pull the new image first
      if (updateType !== 'container') {
        logger.info(`Pulling latest ${imageTag}`);
        await execAsync(`docker pull ${imageTag}`, { timeout: 300000 }); // 5 min timeout for pull
        updateRecord.status = 'pulled';
      }

      // Find ALL containers using this image (regardless of update type)
      // This ensures all containers are updated together, not one at a time
      const containers = await dockerService.listContainers({ all: true });
      let containersToRecreate = containers.filter(c => {
        // Match by exact image tag
        if (c.image === imageTag || c.image === repository) return true;
        return false;
      });

      // Also find containers with sha256: references by checking their Config.Image
      for (const container of containers) {
        if (container.image?.startsWith('sha256:') && !containersToRecreate.includes(container)) {
          try {
            const { stdout } = await execAsync(
              `docker inspect ${container.id} --format '{{.Config.Image}}' 2>/dev/null`,
              { timeout: 5000 }
            );
            const configImage = stdout.trim();
            const normalizedConfigImage = configImage.includes(':') ? configImage : `${configImage}:latest`;
            if (normalizedConfigImage === imageTag) {
              containersToRecreate.push(container);
            }
          } catch (e) {
            // Skip containers we can't inspect
          }
        }
      }

      logger.info(`Found ${containersToRecreate.length} container(s) using ${imageTag}`);

      // Recreate affected containers
      if (containersToRecreate.length > 0) {
        logger.info(`Recreating ${containersToRecreate.length} containers`);

        // Group containers by stack
        const stacksToRecreate = new Map();
        const standaloneContainers = [];

        for (const container of containersToRecreate) {
          const stackName = container.labels?.['com.docker.compose.project'];
          const serviceName = container.labels?.['com.docker.compose.service'];

          if (stackName) {
            if (!stacksToRecreate.has(stackName)) {
              stacksToRecreate.set(stackName, []);
            }
            stacksToRecreate.get(stackName).push({ container, serviceName });
          } else {
            standaloneContainers.push(container);
          }
        }

        // Recreate stack containers
        for (const [stackName, services] of stacksToRecreate) {
          try {
            if (services.length === 1) {
              await stackService.recreateStack(stackName, services[0].serviceName);
            } else {
              await stackService.recreateStack(stackName);
            }

            for (const { container } of services) {
              updateRecord.restartedContainers.push({
                id: container.id,
                name: container.name,
                stack: stackName,
                type: 'stack',
              });
            }
          } catch (error) {
            logger.error(`Failed to recreate stack ${stackName}:`, error);
            for (const { container } of services) {
              updateRecord.restartedContainers.push({
                id: container.id,
                name: container.name,
                stack: stackName,
                error: error.message,
              });
            }
          }
        }

        // Handle standalone containers
        for (const container of standaloneContainers) {
          try {
            logger.warn(`Container ${container.name} is not part of a compose stack. Restarting instead of recreating.`);
            await dockerService.restartContainer(container.id);
            updateRecord.restartedContainers.push({
              id: container.id,
              name: container.name,
              type: 'container',
            });
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
      updateRecord.affectedContainers = containersToRecreate.length;

      // Add to history
      this.updateHistory.unshift(updateRecord);
      if (this.updateHistory.length > 100) {
        this.updateHistory = this.updateHistory.slice(0, 100);
      }

      // Note: Notifications are sent in batch by the caller, not per-update
      logger.info(`Update completed for ${imageTag}`);
      return updateRecord;
    } catch (error) {
      logger.error(`Failed to update ${imageTag}:`, error);
      updateRecord.status = 'failed';
      updateRecord.error = error.message;
      this.updateHistory.unshift(updateRecord);

      // Note: Failure notifications are sent in batch by the caller
      throw error;
    }
  }

  /**
   * Execute update with streaming progress
   * @param {Object} update - Update object with repository, tag, updateType, containerId, containerName
   * @param {Object} options - Update options
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Update result
   */
  async executeUpdateWithProgress(update, options = {}, onProgress = () => {}) {
    const { repository, currentTag: tag, updateType, containerId, containerName } = update;
    const imageTag = `${repository}:${tag}`;
    const updateRecord = {
      image: imageTag,
      timestamp: new Date().toISOString(),
      status: 'pending',
      restartedContainers: [],
      updateType,
    };

    try {
      logger.info(`Starting update for ${imageTag} (type: ${updateType || 'registry'})`);

      // For registry updates, pull the new image first
      if (updateType !== 'container') {
        logger.info(`Pulling latest ${imageTag}`);
        await this.pullImageWithProgress(imageTag, onProgress);
        updateRecord.status = 'pulled';
      } else {
        // Container update - image already pulled, just need to recreate
        onProgress({ status: 'ready', message: 'Image already up to date, recreating container...' });
      }

      // Find containers to recreate
      // Find ALL containers using this image (regardless of update type)
      // This ensures all containers are updated together, not one at a time
      const containers = await dockerService.listContainers({ all: true });
      let containersToRecreate = containers.filter(c => {
        // Match by exact image tag
        if (c.image === imageTag || c.image === repository) return true;
        return false;
      });

      // Also find containers with sha256: references by checking their Config.Image
      for (const container of containers) {
        if (container.image?.startsWith('sha256:') && !containersToRecreate.includes(container)) {
          try {
            const { stdout } = await execAsync(
              `docker inspect ${container.id} --format '{{.Config.Image}}' 2>/dev/null`,
              { timeout: 5000 }
            );
            const configImage = stdout.trim();
            const normalizedConfigImage = configImage.includes(':') ? configImage : `${configImage}:latest`;
            if (normalizedConfigImage === imageTag) {
              containersToRecreate.push(container);
            }
          } catch (e) {
            // Skip containers we can't inspect
          }
        }
      }

      logger.info(`Found ${containersToRecreate.length} container(s) using ${imageTag}`);

      // Recreate affected containers
      if (containersToRecreate.length > 0) {
        onProgress({ status: 'recreating', message: `Recreating ${containersToRecreate.length} container(s)...` });

        // Group containers by stack to avoid recreating the same stack multiple times
        const stacksToRecreate = new Map();
        const standaloneContainers = [];

        for (const container of containersToRecreate) {
          const stackName = container.labels?.['com.docker.compose.project'];
          const serviceName = container.labels?.['com.docker.compose.service'];

          if (stackName) {
            if (!stacksToRecreate.has(stackName)) {
              stacksToRecreate.set(stackName, []);
            }
            stacksToRecreate.get(stackName).push({ container, serviceName });
          } else {
            standaloneContainers.push(container);
          }
        }

        // Recreate stack containers
        for (const [stackName, services] of stacksToRecreate) {
          try {
            // If only one service in the stack needs updating, recreate just that service
            // Otherwise recreate the whole stack
            if (services.length === 1) {
              await stackService.recreateStack(stackName, services[0].serviceName);
            } else {
              await stackService.recreateStack(stackName);
            }

            for (const { container } of services) {
              updateRecord.restartedContainers.push({
                id: container.id,
                name: container.name,
                stack: stackName,
                type: 'stack',
              });
            }
            logger.info(`Recreated stack ${stackName}`);
          } catch (error) {
            logger.error(`Failed to recreate stack ${stackName}:`, error);
            for (const { container } of services) {
              updateRecord.restartedContainers.push({
                id: container.id,
                name: container.name,
                stack: stackName,
                error: error.message,
              });
            }
          }
        }

        // Handle standalone containers (not in a compose stack)
        for (const container of standaloneContainers) {
          try {
            // For standalone containers, we need to stop, remove, and recreate
            // This is complex - for now, just restart and warn
            logger.warn(`Container ${container.name} is not part of a compose stack. Restarting instead of recreating.`);
            await dockerService.restartContainer(container.id);
            updateRecord.restartedContainers.push({
              id: container.id,
              name: container.name,
              type: 'container',
              warning: 'Restarted only - manual recreation may be needed for non-compose containers',
            });
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
      updateRecord.affectedContainers = containersToRecreate.length;

      this.updateHistory.unshift(updateRecord);
      if (this.updateHistory.length > 100) {
        this.updateHistory = this.updateHistory.slice(0, 100);
      }

      // Note: Notifications are sent in batch by the caller, not per-update
      return updateRecord;
    } catch (error) {
      logger.error(`Failed to update ${imageTag}:`, error);
      updateRecord.status = 'failed';
      updateRecord.error = error.message;
      this.updateHistory.unshift(updateRecord);

      // Note: Failure notifications are sent in batch by the caller
      throw error;
    }
  }

  /**
   * Pull image with progress streaming using Docker API
   * @param {string} imageTag - Full image tag
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Pull result
   */
  async pullImageWithProgress(imageTag, onProgress) {
    // Use Docker API for reliable progress tracking
    const result = await dockerService.pullImageWithProgress(imageTag, (progress) => {
      const { layers, summary } = progress;

      // Format bytes for display
      const formatBytes = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      };

      // Send structured progress to frontend
      onProgress({
        status: summary.status.toLowerCase(),
        layers: {
          completed: summary.completed,
          total: summary.total,
          downloading: summary.downloading,
          extracting: summary.extracting,
        },
        bytes: {
          downloaded: formatBytes(summary.downloadedBytes),
          total: formatBytes(summary.totalBytes),
        },
        percent: summary.percent,
        // Include per-layer details for enhanced UI
        layerDetails: Object.values(layers).map((layer) => ({
          id: layer.id,
          status: layer.status,
          current: layer.current,
          total: layer.total,
          percent: layer.total > 0 ? Math.round((layer.current / layer.total) * 100) : 0,
        })),
      });
    });

    return result;
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
        // Pass full image object to handle both registry and container updates
        const result = await this.executeUpdate(image, options);
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
        // Always exclude DockPilot itself - it should only be updated via manual self-update
        const filteredUpdates = updates.filter(update => {
          const imageTag = `${update.repository}:${update.currentTag}`;
          const isDockPilot = update.repository.toLowerCase().includes('dockpilot');
          if (isDockPilot) {
            logger.debug('Excluding DockPilot from scheduled update (use self-update instead)');
            return false;
          }
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
            const results = await this.executeMultipleUpdates(updatesToApply, {
              restartContainers: schedule.restartContainers,
            });
            // Send batch notification for scheduled updates
            await notificationService.notifyBatchUpdateCompleted(results);
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
