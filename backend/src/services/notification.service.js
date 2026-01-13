/**
 * Notification Service using Apprise
 * Handles sending notifications via various services (Discord, Slack, email, etc.)
 */

import { spawn } from 'child_process';
import configStore from '../storage/config.store.js';
import versionService from './version.service.js';
import logger from '../utils/logger.js';

class NotificationService {
  constructor() {
    this.isInitialized = false;
    this.notificationHistory = [];
    this.maxHistorySize = 100;
    this.containerStates = new Map(); // Track container states for unexpected stop detection
    this.versionCheckInterval = null; // Daily version check interval
  }

  async initialize() {
    try {
      // Load settings from config store
      const settings = await this.getSettings();
      logger.info('Notification service initialized', { enabled: settings.enabled });
      this.isInitialized = true;

      // Start daily version check (delayed by 1 minute after startup)
      this.startVersionCheckScheduler();
    } catch (error) {
      logger.error('Failed to initialize notification service:', error);
    }
  }

  /**
   * Start the daily DockPilot version check scheduler
   */
  startVersionCheckScheduler() {
    // Check after 1 minute delay on startup
    const initialDelay = 60 * 1000; // 1 minute
    const dailyInterval = 24 * 60 * 60 * 1000; // 24 hours

    logger.info('Starting DockPilot version check scheduler', {
      initialDelayMinutes: 1,
      intervalHours: 24,
    });

    // Initial check after delay
    setTimeout(async () => {
      await this.checkDockpilotVersion();

      // Set up daily interval
      this.versionCheckInterval = setInterval(async () => {
        await this.checkDockpilotVersion();
      }, dailyInterval);
    }, initialDelay);
  }

  /**
   * Check for DockPilot updates and notify if available
   */
  async checkDockpilotVersion() {
    logger.info('Checking for DockPilot updates...');

    const result = await versionService.checkAndNotify(
      async (currentVersion, newVersion) => {
        await this.notifyDockpilotUpdate(currentVersion, newVersion);
      }
    );

    if (result.error) {
      logger.warn('DockPilot version check failed', { error: result.error });
    } else if (result.hasUpdate) {
      if (result.alreadyNotified) {
        logger.info('DockPilot update available (already notified)', {
          current: result.currentVersion,
          latest: result.latestVersion,
        });
      } else if (result.notified) {
        logger.info('DockPilot update notification sent', {
          current: result.currentVersion,
          latest: result.latestVersion,
        });
      }
    } else {
      logger.info('DockPilot is up to date', { version: result.currentVersion });
    }

    return result;
  }

  /**
   * Get notification settings
   */
  async getSettings() {
    const defaults = {
      enabled: false,
      appriseUrls: [], // Array of Apprise URLs
      triggers: {
        containerStopped: true,
        containerHealthUnhealthy: true,
        stackStarted: true,
        stackStopped: true,
        imageUpdateAvailable: false,
        imageUpdated: true,
        imageUpdateFailed: true,
        dockpilotUpdateAvailable: true,
      },
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
      },
    };

    const settings = await configStore.get('notifications') || defaults;
    const merged = { ...defaults, ...settings };
    logger.info('Loading notification settings', {
      hasStoredSettings: !!settings,
      appriseUrlCount: merged.appriseUrls?.length || 0
    });
    return merged;
  }

  /**
   * Save notification settings
   */
  async saveSettings(settings) {
    logger.info('Saving notification settings', {
      appriseUrlCount: settings.appriseUrls?.length || 0,
      urls: settings.appriseUrls?.map(u => u.substring(0, 30) + '...')
    });
    await configStore.set('notifications', settings);

    // Verify the save worked
    const verified = await configStore.get('notifications');
    logger.info('Verified notification settings saved', {
      appriseUrlCount: verified?.appriseUrls?.length || 0
    });

    return settings;
  }

  /**
   * Test Apprise URL by sending a test notification
   */
  async testNotification(url) {
    const title = 'DockPilot Test Notification';
    const body = 'If you received this message, your notification configuration is working correctly!';

    try {
      await this.sendViaApprise(url, title, body);
      return { success: true, message: 'Test notification sent successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Send notification via Apprise CLI
   */
  async sendViaApprise(url, title, body, notificationType = 'info') {
    return new Promise((resolve, reject) => {
      // Map notification type to Apprise type
      const typeMap = {
        info: 'info',
        success: 'success',
        warning: 'warning',
        error: 'failure',
      };
      const appriseType = typeMap[notificationType] || 'info';

      const args = [
        '-t', title,
        '-b', body,
        '--notification-type', appriseType,
        url,
      ];

      logger.debug('Sending notification via Apprise', { title, type: appriseType });

      const process = spawn('apprise', args, {
        timeout: 30000,
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          logger.info('Notification sent successfully', { title });
          resolve({ success: true });
        } else {
          const errorMsg = stderr || stdout || `Apprise exited with code ${code}`;
          logger.error('Failed to send notification', { title, error: errorMsg });
          reject(new Error(errorMsg));
        }
      });

      process.on('error', (error) => {
        logger.error('Failed to spawn Apprise process', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Send notification to all configured URLs
   */
  async send(title, body, type = 'info', trigger = 'manual') {
    const settings = await this.getSettings();

    if (!settings.enabled) {
      logger.debug('Notifications disabled, skipping', { title });
      return { sent: false, reason: 'disabled' };
    }

    if (!settings.appriseUrls || settings.appriseUrls.length === 0) {
      logger.debug('No Apprise URLs configured, skipping', { title });
      return { sent: false, reason: 'no_urls' };
    }

    // Check quiet hours
    if (settings.quietHours?.enabled && this.isInQuietHours(settings.quietHours)) {
      logger.debug('In quiet hours, skipping notification', { title });
      return { sent: false, reason: 'quiet_hours' };
    }

    // Check if this trigger type is enabled
    if (trigger !== 'manual' && trigger !== 'test' && settings.triggers && !settings.triggers[trigger]) {
      logger.debug('Trigger type disabled, skipping', { title, trigger });
      return { sent: false, reason: 'trigger_disabled' };
    }

    const results = [];
    for (const url of settings.appriseUrls) {
      try {
        await this.sendViaApprise(url, title, body, type);
        results.push({ url: this.maskUrl(url), success: true });
      } catch (error) {
        results.push({ url: this.maskUrl(url), success: false, error: error.message });
      }
    }

    // Add to history
    this.addToHistory({
      timestamp: new Date().toISOString(),
      title,
      body,
      type,
      trigger,
      results,
    });

    const successCount = results.filter(r => r.success).length;
    return {
      sent: true,
      successCount,
      totalUrls: settings.appriseUrls.length,
      results,
    };
  }

  /**
   * Check if current time is within quiet hours
   */
  isInQuietHours(quietHours) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = quietHours.start.split(':').map(Number);
    const [endHour, endMin] = quietHours.end.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Mask URL for logging (hide sensitive tokens)
   */
  maskUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        parsed.password = '***';
      }
      // Mask tokens in path
      const maskedPath = parsed.pathname.replace(/[a-zA-Z0-9]{20,}/g, '***');
      return `${parsed.protocol}//${parsed.host}${maskedPath}`;
    } catch {
      return url.substring(0, 30) + '...';
    }
  }

  /**
   * Add notification to history
   */
  addToHistory(notification) {
    this.notificationHistory.unshift(notification);
    if (this.notificationHistory.length > this.maxHistorySize) {
      this.notificationHistory = this.notificationHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get notification history
   */
  getHistory(limit = 50) {
    return this.notificationHistory.slice(0, limit);
  }

  /**
   * Clear notification history
   */
  clearHistory() {
    this.notificationHistory = [];
  }

  // ========== Event-based Notifications ==========

  /**
   * Handle Docker event and send notification if applicable
   */
  async handleDockerEvent(event) {
    const settings = await this.getSettings();
    if (!settings.enabled) return;

    const { type, action, actor } = event;
    const name = actor?.name || actor?.id?.substring(0, 12) || 'Unknown';

    // Container events
    if (type === 'container') {
      if (action === 'die' || action === 'stop') {
        // Check if this was expected (user-initiated) or unexpected
        const exitCode = actor?.attributes?.exitCode;
        const wasRunning = this.containerStates.get(actor?.id);

        // Update state
        this.containerStates.delete(actor?.id);

        // Only notify for unexpected stops (non-zero exit codes or if we were tracking it)
        if (exitCode && exitCode !== '0') {
          const body = `The container "${name}" stopped unexpectedly.\n\n` +
            `Exit code: ${exitCode}\n\n` +
            `This may indicate an error. Check the container logs for details.`;

          await this.send(
            `DockPilot: Container Stopped`,
            body,
            'error',
            'containerStopped'
          );
        }
      } else if (action === 'start') {
        // Track that this container is now running
        this.containerStates.set(actor?.id, { name, startTime: Date.now() });
      } else if (action === 'health_status' && actor?.attributes?.health_status === 'unhealthy') {
        const body = `The container "${name}" is reporting unhealthy status.\n\n` +
          `The health check is failing. Check the container logs and configuration.`;

        await this.send(
          `DockPilot: Container Unhealthy`,
          body,
          'warning',
          'containerHealthUnhealthy'
        );
      }
    }
  }

  /**
   * Helper to format image name for display (extract readable name)
   */
  formatImageName(fullName) {
    // lscr.io/linuxserver/emby -> emby
    // ghcr.io/user/app -> app
    // nginx:latest -> nginx
    const parts = fullName.split('/');
    const name = parts[parts.length - 1].split(':')[0];
    return name;
  }

  /**
   * Notify that a stack has been started
   */
  async notifyStackStarted(stackName) {
    await this.send(
      `DockPilot: Stack Started`,
      `The stack "${stackName}" is now running.`,
      'success',
      'stackStarted'
    );
  }

  /**
   * Notify that a stack has been stopped
   */
  async notifyStackStopped(stackName) {
    await this.send(
      `DockPilot: Stack Stopped`,
      `The stack "${stackName}" has been stopped.`,
      'info',
      'stackStopped'
    );
  }

  /**
   * Notify that an image has been updated
   */
  async notifyImageUpdated(imageName, containerNames = []) {
    const friendlyName = this.formatImageName(imageName);
    let body = `Successfully updated "${friendlyName}"\n\nFull image: ${imageName}`;

    if (containerNames.length > 0) {
      body += `\n\nAffected containers:\n${containerNames.map(c => `  - ${c}`).join('\n')}`;
    }

    await this.send(
      `DockPilot: Image Updated`,
      body,
      'success',
      'imageUpdated'
    );
  }

  /**
   * Notify that an image update failed
   */
  async notifyImageUpdateFailed(imageName, error = '') {
    const friendlyName = this.formatImageName(imageName);
    let body = `Failed to update "${friendlyName}"\n\nFull image: ${imageName}`;

    if (error) {
      body += `\n\nError:\n${error}`;
    }

    await this.send(
      `DockPilot: Image Update Failed`,
      body,
      'error',
      'imageUpdateFailed'
    );
  }

  /**
   * Notify that updates are available
   */
  async notifyUpdatesAvailable(updates) {
    const count = updates.length;
    const displayUpdates = updates.slice(0, 10);
    const remaining = count > 10 ? count - 10 : 0;

    let body = `Found ${count} image${count === 1 ? '' : 's'} with available updates:\n\n`;

    body += displayUpdates.map(u => {
      const name = this.formatImageName(u.repository);
      const versionInfo = u.currentVersion && u.newVersion
        ? ` (${u.currentVersion} -> ${u.newVersion})`
        : '';
      return `  - ${name}${versionInfo}`;
    }).join('\n');

    if (remaining > 0) {
      body += `\n  ... and ${remaining} more`;
    }

    await this.send(
      `DockPilot: Updates Available`,
      body,
      'info',
      'imageUpdateAvailable'
    );
  }

  /**
   * Notify that a DockPilot update is available
   */
  async notifyDockpilotUpdate(currentVersion, newVersion) {
    const body = `A new version of DockPilot is available!\n\n` +
      `Current version: ${currentVersion}\n` +
      `New version: ${newVersion}\n\n` +
      `Visit the DockPilot UI to update.`;

    await this.send(
      `DockPilot: Update Available`,
      body,
      'info',
      'dockpilotUpdateAvailable'
    );
  }

  /**
   * Start listening to Docker events
   */
  async startEventListener() {
    try {
      // Dynamic import to avoid circular dependency
      const { default: dockerService } = await import('./docker.service.js');

      logger.info('Starting Docker event listener for notifications');

      // Use Docker's event stream
      const docker = dockerService.docker;
      const stream = await docker.getEvents({
        filters: {
          type: ['container'],
          event: ['die', 'stop', 'start', 'health_status'],
        },
      });

      stream.on('data', async (chunk) => {
        try {
          const event = JSON.parse(chunk.toString());
          const formattedEvent = {
            type: event.Type,
            action: event.Action,
            actor: {
              id: event.Actor?.ID,
              name: event.Actor?.Attributes?.name,
              attributes: event.Actor?.Attributes,
            },
            time: event.time,
          };

          await this.handleDockerEvent(formattedEvent);
        } catch (error) {
          // Ignore parse errors (incomplete JSON chunks)
        }
      });

      stream.on('error', (error) => {
        logger.error('Docker event stream error:', error);
        // Attempt to reconnect after delay
        setTimeout(() => this.startEventListener(), 5000);
      });

      stream.on('end', () => {
        logger.warn('Docker event stream ended, reconnecting...');
        setTimeout(() => this.startEventListener(), 5000);
      });
    } catch (error) {
      logger.error('Failed to start Docker event listener:', error);
      // Retry after delay
      setTimeout(() => this.startEventListener(), 10000);
    }
  }
}

// Export singleton instance
const notificationService = new NotificationService();
export default notificationService;
