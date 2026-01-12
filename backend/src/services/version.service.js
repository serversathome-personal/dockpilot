/**
 * Version Service
 * Checks GHCR for DockPilot updates
 */

import { DOCKPILOT_VERSION } from '../config/version.js';
import configStore from '../storage/config.store.js';
import logger from '../utils/logger.js';

class VersionService {
  constructor() {
    this.ghcrUrl = 'https://ghcr.io/v2/serversathome/dockpilot/tags/list';
    this.currentVersion = DOCKPILOT_VERSION;
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
   * Fetch available tags from GHCR
   * @returns {Promise<string[]>} Array of available tags
   */
  async fetchTags() {
    try {
      const response = await fetch(this.ghcrUrl, {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`GHCR API returned ${response.status}`);
      }

      const data = await response.json();
      return data.tags || [];
    } catch (error) {
      logger.error('Failed to fetch tags from GHCR:', error.message);
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
      logger.error('Version check failed:', error.message);
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
      logger.error('Failed to send update notification:', error.message);
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
}

// Export singleton instance
const versionService = new VersionService();
export default versionService;
