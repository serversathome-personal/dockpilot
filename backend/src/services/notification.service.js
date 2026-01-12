/**
 * Notification Service using Apprise
 * Handles sending notifications via various services (Discord, Slack, email, etc.)
 */

import { spawn } from 'child_process';
import configStore from '../storage/config.store.js';
import logger from '../utils/logger.js';

class NotificationService {
  constructor() {
    this.isInitialized = false;
    this.notificationHistory = [];
    this.maxHistorySize = 100;
    this.containerStates = new Map(); // Track container states for unexpected stop detection
  }

  async initialize() {
    try {
      // Load settings from config store
      const settings = await this.getSettings();
      logger.info('Notification service initialized', { enabled: settings.enabled });
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize notification service:', error);
    }
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
        dockpilotUpdateAvailable: true,
      },
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
      },
    };

    const settings = await configStore.get('notifications') || defaults;
    return { ...defaults, ...settings };
  }

  /**
   * Save notification settings
   */
  async saveSettings(settings) {
    await configStore.set('notifications', settings);
    logger.info('Notification settings saved');
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
          await this.send(
            `Container Stopped Unexpectedly`,
            `Container "${name}" has stopped with exit code ${exitCode}`,
            'error',
            'containerStopped'
          );
        }
      } else if (action === 'start') {
        // Track that this container is now running
        this.containerStates.set(actor?.id, { name, startTime: Date.now() });
      } else if (action === 'health_status' && actor?.attributes?.health_status === 'unhealthy') {
        await this.send(
          `Container Health Check Failed`,
          `Container "${name}" is now unhealthy`,
          'warning',
          'containerHealthUnhealthy'
        );
      }
    }
  }

  /**
   * Notify that a stack has been started
   */
  async notifyStackStarted(stackName) {
    await this.send(
      `Stack Started`,
      `Stack "${stackName}" has been started successfully`,
      'success',
      'stackStarted'
    );
  }

  /**
   * Notify that a stack has been stopped
   */
  async notifyStackStopped(stackName) {
    await this.send(
      `Stack Stopped`,
      `Stack "${stackName}" has been stopped`,
      'info',
      'stackStopped'
    );
  }

  /**
   * Notify that an image has been updated
   */
  async notifyImageUpdated(imageName, containerNames = []) {
    const containers = containerNames.length > 0
      ? `\nAffected containers: ${containerNames.join(', ')}`
      : '';

    await this.send(
      `Image Updated`,
      `Image "${imageName}" has been updated${containers}`,
      'success',
      'imageUpdated'
    );
  }

  /**
   * Notify that updates are available
   */
  async notifyUpdatesAvailable(updates) {
    const count = updates.length;
    const imageList = updates.slice(0, 5).map(u => u.repository).join(', ');
    const moreText = count > 5 ? ` and ${count - 5} more` : '';

    await this.send(
      `Updates Available`,
      `${count} image update(s) available: ${imageList}${moreText}`,
      'info',
      'imageUpdateAvailable'
    );
  }

  /**
   * Notify that a DockPilot update is available
   */
  async notifyDockpilotUpdate(currentVersion, newVersion) {
    await this.send(
      `DockPilot Update Available`,
      `A new version of DockPilot is available!\nCurrent: ${currentVersion}\nNew: ${newVersion}`,
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
