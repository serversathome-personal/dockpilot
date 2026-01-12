import cron from 'node-cron';
import dockerService from './docker.service.js';
import stackService from './stack.service.js';
import notificationService from './notification.service.js';
import configStore from '../storage/config.store.js';
import logger from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

      for (const image of images) {
        if (!image.tags || image.tags.length === 0 || image.tags[0] === '<none>:<none>') {
          continue;
        }

        const tag = image.tags[0];
        const [repository, currentTag] = tag.split(':');

        try {
          // Check if newer version exists
          const latestDigest = await this.getLatestImageDigest(repository, currentTag || 'latest');
          const currentDigest = image.digests?.[0] || image.id;

          if (latestDigest && latestDigest !== currentDigest) {
            updates.push({
              repository,
              currentTag: currentTag || 'latest',
              currentDigest: currentDigest.substring(0, 12),
              latestDigest: latestDigest.substring(0, 12),
              hasUpdate: true,
              size: image.size,
            });
          }
        } catch (error) {
          logger.warn(`Failed to check update for ${tag}:`, error.message);
        }
      }

      logger.info(`Found ${updates.length} available updates`);
      return updates;
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      throw new Error('Failed to check for updates');
    }
  }

  /**
   * Get latest image digest from registry
   * @param {string} repository - Image repository
   * @param {string} tag - Image tag
   * @returns {Promise<string>} Latest digest
   */
  async getLatestImageDigest(repository, tag) {
    try {
      // Use Docker CLI to inspect the remote image
      const { stdout } = await execAsync(
        `docker manifest inspect ${repository}:${tag} --insecure 2>/dev/null || echo ""`
      );

      if (!stdout.trim()) {
        return null;
      }

      const manifest = JSON.parse(stdout);
      return manifest.config?.digest || null;
    } catch (error) {
      // Image might not be available in registry or requires authentication
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

      logger.info(`Update completed for ${imageTag}`);
      return updateRecord;
    } catch (error) {
      logger.error(`Failed to update ${imageTag}:`, error);
      updateRecord.status = 'failed';
      updateRecord.error = error.message;
      this.updateHistory.unshift(updateRecord);
      throw error;
    }
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
