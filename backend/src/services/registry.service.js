/**
 * Registry Service
 * Manages Docker registry authentication with persistence
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import configStore from '../storage/config.store.js';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

class RegistryService {
  constructor() {
    this.dockerConfigPath = '/root/.docker/config.json';
  }

  /**
   * Initialize registry service - restore saved credentials on startup
   */
  async initialize() {
    try {
      await this.restoreCredentials();
      logger.info('Registry service initialized');
    } catch (error) {
      logger.error('Failed to initialize registry service:', error.message);
    }
  }

  /**
   * Get saved registry credentials from persistent storage
   */
  async getSavedCredentials() {
    const credentials = await configStore.get('registryCredentials') || [];
    return credentials;
  }

  /**
   * Save registry credentials to persistent storage
   */
  async saveCredentials(credentials) {
    await configStore.set('registryCredentials', credentials);
  }

  /**
   * Restore credentials from persistent storage to Docker config
   */
  async restoreCredentials() {
    const credentials = await this.getSavedCredentials();

    if (credentials.length === 0) {
      logger.debug('No saved registry credentials to restore');
      return;
    }

    logger.info(`Restoring ${credentials.length} saved registry credential(s)`);

    for (const cred of credentials) {
      try {
        await this.dockerLogin(cred.registry, cred.username, cred.password);
        logger.info(`Restored credentials for ${cred.registry || 'Docker Hub'}`);
      } catch (error) {
        logger.warn(`Failed to restore credentials for ${cred.registry || 'Docker Hub'}:`, error.message);
      }
    }
  }

  /**
   * Login to a Docker registry
   */
  async dockerLogin(registry, username, password) {
    const registryArg = registry && registry !== 'docker.io' && registry !== 'index.docker.io'
      ? registry
      : '';

    const cmd = registryArg
      ? `echo "${password.replace(/"/g, '\\"')}" | docker login -u "${username}" --password-stdin ${registryArg}`
      : `echo "${password.replace(/"/g, '\\"')}" | docker login -u "${username}" --password-stdin`;

    await execAsync(cmd, { timeout: 30000 });
  }

  /**
   * Login and save credentials for persistence
   */
  async login(registry, username, password) {
    // First try to login
    await this.dockerLogin(registry, username, password);

    // If successful, save credentials for persistence
    const credentials = await this.getSavedCredentials();
    const registryKey = registry || 'docker.io';

    // Update or add credentials
    const existingIndex = credentials.findIndex(c =>
      (c.registry || 'docker.io') === registryKey
    );

    const credEntry = { registry: registryKey, username, password };

    if (existingIndex >= 0) {
      credentials[existingIndex] = credEntry;
    } else {
      credentials.push(credEntry);
    }

    await this.saveCredentials(credentials);
    logger.info(`Saved credentials for ${registryKey}`);
  }

  /**
   * Logout and remove saved credentials
   */
  async logout(registry) {
    const registryArg = registry && registry !== 'docker.io' && registry !== 'index.docker.io'
      ? registry
      : '';

    const cmd = registryArg ? `docker logout ${registryArg}` : 'docker logout';
    await execAsync(cmd, { timeout: 10000 });

    // Remove from saved credentials
    const credentials = await this.getSavedCredentials();
    const registryKey = registry || 'docker.io';

    const filtered = credentials.filter(c =>
      (c.registry || 'docker.io') !== registryKey &&
      c.registry !== 'https://index.docker.io/v1/' // Also match Docker Hub variants
    );

    await this.saveCredentials(filtered);
    logger.info(`Removed saved credentials for ${registryKey}`);
  }

  /**
   * Get list of configured registries (without passwords)
   */
  async getConfiguredRegistries() {
    const registries = [];

    try {
      if (fs.existsSync(this.dockerConfigPath)) {
        const config = JSON.parse(fs.readFileSync(this.dockerConfigPath, 'utf8'));
        if (config.auths) {
          for (const [registry, auth] of Object.entries(config.auths)) {
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
      }
    } catch (error) {
      logger.warn('Failed to read Docker config:', error.message);
    }

    return registries;
  }
}

// Export singleton instance
const registryService = new RegistryService();
export default registryService;
