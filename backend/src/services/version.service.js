/**
 * Version Service
 * Checks GHCR for DockPilot updates
 */

import Docker from 'dockerode';
import { DOCKPILOT_VERSION } from '../config/version.js';
import configStore from '../storage/config.store.js';
import logger from '../utils/logger.js';

class VersionService {
  constructor() {
    // Request more tags to handle pagination (default is very limited)
    this.ghcrUrl = 'https://ghcr.io/v2/serversathome-personal/dockpilot/tags/list?n=100';
    this.currentVersion = DOCKPILOT_VERSION;
    this.docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
  }

  /**
   * Parse a version string into comparable parts
   * @param {string} version - Version string (e.g., "1.0.33" or "v1.0.33")
   * @returns {object|null} Parsed version or null if invalid
   */
  parseVersion(version) {
    // Remove 'v' prefix if present
    const cleaned = version.replace(/^v/, '');
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)$/);

    if (!match) {
      return null;
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      raw: cleaned,
    };
  }

  /**
   * Compare two parsed versions
   * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
   */
  compareVersions(a, b) {
    if (a.major !== b.major) return a.major > b.major ? 1 : -1;
    if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
    if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
    return 0;
  }

  /**
   * Get anonymous token from GHCR for public repository access
   * @returns {Promise<string>} Bearer token
   */
  async getGhcrToken() {
    const tokenUrl = 'https://ghcr.io/token?service=ghcr.io&scope=repository:serversathome-personal/dockpilot:pull';

    const response = await fetch(tokenUrl, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Failed to get GHCR token: ${response.status}`);
    }

    const data = await response.json();
    return data.token;
  }

  /**
   * Parse Link header for pagination
   * @param {string} linkHeader - Link header value
   * @returns {string|null} Next page URL or null
   */
  parseNextLink(linkHeader) {
    if (!linkHeader) return null;

    // Format: </v2/repo/tags/list?n=100&last=tag>; rel="next"
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      // Return full URL
      return `https://ghcr.io${match[1]}`;
    }
    return null;
  }

  /**
   * Fetch available tags from GHCR with pagination support
   * @returns {Promise<string[]>} Array of available tags
   */
  async fetchTags() {
    try {
      // Get anonymous token first (required for GHCR API)
      const token = await this.getGhcrToken();
      const allTags = [];
      let url = this.ghcrUrl;
      let pageCount = 0;
      const maxPages = 10; // Safety limit to prevent infinite loops

      while (url && pageCount < maxPages) {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/vnd.docker.distribution.manifest.v2+json',
            'Authorization': `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          throw new Error(`GHCR API returned ${response.status}`);
        }

        const data = await response.json();
        const tags = data.tags || [];
        allTags.push(...tags);

        // Check for pagination
        const linkHeader = response.headers.get('Link');
        url = this.parseNextLink(linkHeader);
        pageCount++;
      }

      logger.debug(`Fetched ${allTags.length} tags from GHCR (${pageCount} page(s)): ${allTags.slice(-10).join(', ')}`);
      return allTags;
    } catch (error) {
      logger.error(`Failed to fetch tags from GHCR: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find the latest version from available tags
   * @param {string[]} tags - Array of available tags
   * @returns {object|null} Latest version info or null
   */
  findLatestVersion(tags) {
    let latest = null;

    for (const tag of tags) {
      // Skip non-version tags like 'latest', 'main', 'dev'
      const parsed = this.parseVersion(tag);
      if (!parsed) continue;

      if (!latest || this.compareVersions(parsed, latest) > 0) {
        latest = parsed;
      }
    }

    return latest;
  }

  /**
   * Check for updates and return result
   * @returns {Promise<object>} Update check result
   */
  async checkForUpdate() {
    try {
      const tags = await this.fetchTags();
      const latestVersion = this.findLatestVersion(tags);
      const currentParsed = this.parseVersion(this.currentVersion);

      if (!latestVersion || !currentParsed) {
        return {
          hasUpdate: false,
          error: 'Could not parse versions',
        };
      }

      const hasUpdate = this.compareVersions(latestVersion, currentParsed) > 0;

      logger.info('Version check completed', {
        current: this.currentVersion,
        latest: latestVersion.raw,
        hasUpdate,
      });

      return {
        hasUpdate,
        currentVersion: this.currentVersion,
        latestVersion: latestVersion.raw,
      };
    } catch (error) {
      logger.error(`Version check failed: ${error.message}`);
      return {
        hasUpdate: false,
        error: error.message,
      };
    }
  }

  /**
   * Check for updates and notify if new version available
   * Respects last notified version to avoid duplicate notifications
   * @param {function} notifyCallback - Callback to send notification
   * @returns {Promise<object>} Check result
   */
  async checkAndNotify(notifyCallback) {
    const result = await this.checkForUpdate();

    if (!result.hasUpdate) {
      return result;
    }

    // Check if we already notified for this version
    const lastNotifiedVersion = await configStore.get('versionCheck.lastNotifiedVersion');

    if (lastNotifiedVersion === result.latestVersion) {
      logger.debug('Already notified for version', { version: result.latestVersion });
      return { ...result, alreadyNotified: true };
    }

    // Send notification
    try {
      await notifyCallback(result.currentVersion, result.latestVersion);

      // Store the notified version
      await configStore.set('versionCheck.lastNotifiedVersion', result.latestVersion);
      await configStore.set('versionCheck.lastCheckTime', new Date().toISOString());

      logger.info('DockPilot update notification sent', {
        from: result.currentVersion,
        to: result.latestVersion,
      });

      return { ...result, notified: true };
    } catch (error) {
      logger.error(`Failed to send update notification: ${error.message}`);
      return { ...result, notifyError: error.message };
    }
  }

  /**
   * Get the current DockPilot version
   * @returns {string} Current version
   */
  getCurrentVersion() {
    return this.currentVersion;
  }

  /**
   * Find DockPilot's own container and extract compose info from labels
   * Docker Compose adds labels like com.docker.compose.project.working_dir
   * @returns {Promise<object|null>} Compose info or null if not found
   */
  async getComposeInfo() {
    try {
      // Find containers that might be DockPilot
      const containers = await this.docker.listContainers({ all: true });

      // Look for container with dockpilot in the image name or container name
      const dockpilotContainer = containers.find(c => {
        const image = c.Image.toLowerCase();
        const name = (c.Names[0] || '').toLowerCase();
        return image.includes('dockpilot') || name.includes('dockpilot');
      });

      if (!dockpilotContainer) {
        logger.debug('Could not find DockPilot container');
        return null;
      }

      const labels = dockpilotContainer.Labels || {};
      const workingDir = labels['com.docker.compose.project.working_dir'];
      const projectName = labels['com.docker.compose.project'];
      const configFiles = labels['com.docker.compose.project.config_files'];

      if (!workingDir) {
        logger.debug('DockPilot container found but no compose working_dir label');
        return null;
      }

      return {
        workingDir,
        projectName,
        configFiles,
        containerId: dockpilotContainer.Id,
        containerName: dockpilotContainer.Names[0]?.replace(/^\//, ''),
      };
    } catch (error) {
      logger.error(`Failed to get compose info: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if self-update is available
   * Self-update works automatically if DockPilot was started via docker-compose
   * @returns {Promise<object>} Configuration status
   */
  async getSelfUpdateStatus() {
    const composeInfo = await this.getComposeInfo();

    return {
      configured: !!composeInfo,
      composeDir: composeInfo?.workingDir || null,
      projectName: composeInfo?.projectName || null,
    };
  }

  /**
   * Execute self-update by spawning an updater container
   * The updater container will pull the new image and restart DockPilot
   * @returns {Promise<object>} Result of the update initiation
   */
  async executeSelfUpdate() {
    const composeInfo = await this.getComposeInfo();

    if (!composeInfo) {
      throw new Error(
        'Self-update not available. DockPilot must be started via docker-compose for self-update to work.'
      );
    }

    const { workingDir, projectName } = composeInfo;
    logger.info('Initiating DockPilot self-update', { workingDir, projectName });

    try {
      // Use docker image with compose plugin installed
      const updateImage = 'docker:latest';
      logger.debug(`Pulling ${updateImage} image for updater container`);
      await new Promise((resolve, reject) => {
        this.docker.pull(updateImage, (err, stream) => {
          if (err) return reject(err);
          this.docker.modem.followProgress(stream, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });

      // Build the update script
      // Find the compose file and use docker compose v2
      // Use --project-directory to resolve relative paths from the HOST path, not container path
      const composeArgs = projectName ? `-p ${projectName}` : '';
      const hostDir = workingDir; // This is the actual host path
      const updateScript = `
        set -e
        sleep 3
        cd /compose

        # Find compose file
        if [ -f "compose.yaml" ]; then
          COMPOSE_FILE="compose.yaml"
        elif [ -f "compose.yml" ]; then
          COMPOSE_FILE="compose.yml"
        elif [ -f "docker-compose.yaml" ]; then
          COMPOSE_FILE="docker-compose.yaml"
        elif [ -f "docker-compose.yml" ]; then
          COMPOSE_FILE="docker-compose.yml"
        else
          echo "ERROR: No compose file found in /compose"
          ls -la /compose
          exit 1
        fi

        echo "Using compose file: $COMPOSE_FILE"
        echo "Project directory: ${hostDir}"
        echo "Pulling new image..."
        docker compose --project-directory "${hostDir}" -f "/compose/$COMPOSE_FILE" ${composeArgs} pull 2>&1 || { echo "Pull failed"; exit 1; }
        echo "Recreating container..."
        docker compose --project-directory "${hostDir}" -f "/compose/$COMPOSE_FILE" ${composeArgs} up -d --force-recreate 2>&1 || { echo "Recreate failed"; exit 1; }
        echo "Update complete"
      `.trim();

      // Create and start the updater container
      // The sleep gives time for the API response to be sent before DockPilot restarts
      // Don't auto-remove so we can check logs on failure
      const containerName = `dockpilot-updater-${Date.now()}`;
      logger.info(`Creating updater container: ${containerName}`);

      const container = await this.docker.createContainer({
        Image: updateImage,
        Cmd: ['sh', '-c', updateScript],
        HostConfig: {
          Binds: [
            '/var/run/docker.sock:/var/run/docker.sock',
            `${workingDir}:/compose`
          ],
          AutoRemove: false,
        },
        name: containerName,
      });

      await container.start();

      logger.info('Self-update initiated, DockPilot will restart shortly');

      return {
        success: true,
        message: 'Self-update initiated. DockPilot will restart in a few seconds.',
      };
    } catch (error) {
      logger.error('Failed to initiate self-update:', error);
      throw new Error(`Failed to initiate self-update: ${error.message}`);
    }
  }
}

// Export singleton instance
const versionService = new VersionService();
export default versionService;
