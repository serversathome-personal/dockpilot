import fs from 'fs-extra';
import path from 'path';
import config from '../config/env.js';
import logger from '../utils/logger.js';

class ConfigStore {
  constructor() {
    this.dataDir = config.storage.dataDir;
    this.configFile = path.join(this.dataDir, 'config.json');
    this.initPromise = this.initialize();
    logger.info('ConfigStore initializing', { dataDir: this.dataDir, configFile: this.configFile });
  }

  /**
   * Wait for initialization to complete
   */
  async ensureInitialized() {
    await this.initPromise;
  }

  /**
   * Initialize the config store
   */
  async initialize() {
    try {
      // Ensure data directory exists
      await fs.ensureDir(this.dataDir);
      logger.info('Config data directory ensured', { dataDir: this.dataDir });

      // Create default config if it doesn't exist
      if (!(await fs.pathExists(this.configFile))) {
        await this.save({
          version: '1.0.0',
          created: new Date().toISOString(),
          settings: {
            refreshInterval: 5000,
            defaultView: 'dashboard',
            theme: 'dark',
          },
          favorites: {
            stacks: [],
            containers: [],
          },
        }, true); // Skip ensureInitialized for bootstrap
        logger.info('Created default configuration file');
      } else {
        logger.info('Config file already exists', { configFile: this.configFile });
      }
    } catch (error) {
      logger.error('Failed to initialize config store:', error);
      throw error;
    }
  }

  /**
   * Load configuration from file
   * @returns {Promise<Object>} Configuration object
   */
  async load() {
    await this.ensureInitialized();
    try {
      const data = await fs.readJson(this.configFile);
      return data;
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      throw new Error('Failed to load configuration');
    }
  }

  /**
   * Save configuration to file
   * @param {Object} config - Configuration object
   * @param {boolean} skipInit - Skip initialization check (for bootstrap)
   * @returns {Promise<void>}
   */
  async save(config, skipInit = false) {
    if (!skipInit) {
      await this.ensureInitialized();
    }
    try {
      await fs.writeJson(this.configFile, config, { spaces: 2 });
      logger.info('Configuration saved successfully', { file: this.configFile });
    } catch (error) {
      logger.error('Failed to save configuration:', error);
      throw new Error('Failed to save configuration');
    }
  }

  /**
   * Get a specific configuration value
   * @param {string} key - Configuration key (supports dot notation)
   * @returns {Promise<*>} Configuration value
   */
  async get(key) {
    await this.ensureInitialized();
    try {
      const config = await this.load();
      const keys = key.split('.');
      let value = config;

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          logger.debug(`Config key "${key}" not found`);
          return undefined;
        }
      }

      return value;
    } catch (error) {
      logger.error(`Failed to get configuration key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Set a specific configuration value
   * @param {string} key - Configuration key (supports dot notation)
   * @param {*} value - Value to set
   * @returns {Promise<void>}
   */
  async set(key, value) {
    await this.ensureInitialized();
    try {
      const config = await this.load();
      const keys = key.split('.');
      const lastKey = keys.pop();
      let target = config;

      for (const k of keys) {
        if (!(k in target) || typeof target[k] !== 'object') {
          target[k] = {};
        }
        target = target[k];
      }

      target[lastKey] = value;
      await this.save(config);
      logger.info(`Configuration key "${key}" set successfully`);
    } catch (error) {
      logger.error(`Failed to set configuration key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Add item to favorites
   * @param {string} type - Type of favorite (stacks, containers)
   * @param {string} id - Item ID
   * @returns {Promise<void>}
   */
  async addFavorite(type, id) {
    try {
      const config = await this.load();
      if (!config.favorites[type]) {
        config.favorites[type] = [];
      }
      if (!config.favorites[type].includes(id)) {
        config.favorites[type].push(id);
        await this.save(config);
      }
    } catch (error) {
      logger.error(`Failed to add favorite ${type}/${id}:`, error);
      throw error;
    }
  }

  /**
   * Remove item from favorites
   * @param {string} type - Type of favorite (stacks, containers)
   * @param {string} id - Item ID
   * @returns {Promise<void>}
   */
  async removeFavorite(type, id) {
    try {
      const config = await this.load();
      if (config.favorites[type]) {
        config.favorites[type] = config.favorites[type].filter((item) => item !== id);
        await this.save(config);
      }
    } catch (error) {
      logger.error(`Failed to remove favorite ${type}/${id}:`, error);
      throw error;
    }
  }

  /**
   * Get all favorites of a specific type
   * @param {string} type - Type of favorite (stacks, containers)
   * @returns {Promise<Array>} Array of favorite IDs
   */
  async getFavorites(type) {
    try {
      const config = await this.load();
      return config.favorites[type] || [];
    } catch (error) {
      logger.error(`Failed to get favorites of type "${type}":`, error);
      throw error;
    }
  }
}

// Export singleton instance
const configStore = new ConfigStore();
export default configStore;
