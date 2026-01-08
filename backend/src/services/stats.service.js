import { execSync } from 'child_process';
import logger from '../utils/logger.js';

class StatsService {
  constructor() {
    // Store stats history (last 30 data points = 30 minutes at 1 minute intervals)
    this.cpuHistory = [];
    this.memoryHistory = [];
    this.networkHistory = [];
    this.maxHistoryLength = 30;
    this.lastCpuStats = null;
    this.lastNetworkStats = null;

    // Start collecting stats every minute
    this.startCollection();
  }

  startCollection() {
    // Collect initial data point
    this.collectCpuUsage();
    this.collectMemoryUsage();
    this.collectNetworkUsage();

    // Collect every minute
    setInterval(() => {
      this.collectCpuUsage();
      this.collectMemoryUsage();
      this.collectNetworkUsage();
    }, 60000); // 60 seconds
  }

  /**
   * Get CPU usage percentage
   */
  async getCpuUsage() {
    try {
      // Read /proc/stat to get CPU times
      const statData = execSync('cat /proc/stat', { encoding: 'utf8' });
      const cpuLine = statData.split('\n')[0]; // First line is overall CPU
      const times = cpuLine.split(/\s+/).slice(1).map(Number);

      // times = [user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice]
      const [user, nice, system, idle, iowait, irq, softirq, steal] = times;

      const totalIdle = idle + iowait;
      const totalActive = user + nice + system + irq + softirq + steal;
      const total = totalIdle + totalActive;

      return { totalActive, totalIdle, total, timestamp: Date.now() };
    } catch (error) {
      logger.error('Failed to get CPU usage:', error);
      return null;
    }
  }

  /**
   * Calculate CPU usage percentage between two measurements
   */
  calculateCpuPercent(prev, current) {
    if (!prev || !current) return 0;

    const totalDelta = current.total - prev.total;
    const activeDelta = current.totalActive - prev.totalActive;

    if (totalDelta === 0) return 0;

    return Math.round((activeDelta / totalDelta) * 100 * 10) / 10; // Round to 1 decimal
  }

  /**
   * Collect CPU usage and store in history
   */
  async collectCpuUsage() {
    const currentStats = await this.getCpuUsage();

    if (!currentStats) return;

    if (this.lastCpuStats) {
      const cpuPercent = this.calculateCpuPercent(this.lastCpuStats, currentStats);

      this.cpuHistory.push({
        timestamp: new Date().toISOString(),
        usage: cpuPercent,
      });

      // Keep only last N data points
      if (this.cpuHistory.length > this.maxHistoryLength) {
        this.cpuHistory.shift();
      }

      logger.debug(`CPU usage: ${cpuPercent}%`);
    }

    this.lastCpuStats = currentStats;
  }

  /**
   * Get current CPU usage
   */
  async getCurrentCpuUsage() {
    const currentStats = await this.getCpuUsage();

    if (!currentStats || !this.lastCpuStats) {
      return 0;
    }

    return this.calculateCpuPercent(this.lastCpuStats, currentStats);
  }

  /**
   * Get CPU usage history
   */
  getCpuHistory() {
    return this.cpuHistory;
  }

  /**
   * Get memory usage from /proc/meminfo
   */
  getMemoryUsage() {
    try {
      const meminfo = execSync('cat /proc/meminfo', { encoding: 'utf8' });
      const lines = meminfo.split('\n');

      let memTotal = 0;
      let memAvailable = 0;

      for (const line of lines) {
        if (line.startsWith('MemTotal:')) {
          memTotal = parseInt(line.split(/\s+/)[1]) * 1024; // Convert KB to bytes
        } else if (line.startsWith('MemAvailable:')) {
          memAvailable = parseInt(line.split(/\s+/)[1]) * 1024; // Convert KB to bytes
        }
      }

      if (memTotal === 0) return 0;

      const memUsed = memTotal - memAvailable;
      const memoryPercent = Math.round((memUsed / memTotal) * 100 * 10) / 10; // Round to 1 decimal

      return memoryPercent;
    } catch (error) {
      logger.error('Failed to get memory usage:', error);
      return 0;
    }
  }

  /**
   * Collect memory usage and store in history
   */
  collectMemoryUsage() {
    const memoryPercent = this.getMemoryUsage();

    this.memoryHistory.push({
      timestamp: new Date().toISOString(),
      usage: memoryPercent,
    });

    // Keep only last N data points
    if (this.memoryHistory.length > this.maxHistoryLength) {
      this.memoryHistory.shift();
    }

    logger.debug(`Memory usage: ${memoryPercent}%`);
  }

  /**
   * Get memory usage history
   */
  getMemoryHistory() {
    return this.memoryHistory;
  }

  /**
   * Get network traffic stats from /proc/net/dev
   */
  getNetworkStats() {
    try {
      const netData = execSync('cat /proc/net/dev', { encoding: 'utf8' });
      const lines = netData.split('\n');

      let totalRx = 0;
      let totalTx = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip header lines and loopback
        if (!trimmed || trimmed.startsWith('Inter') || trimmed.startsWith('face') || trimmed.startsWith('lo:')) {
          continue;
        }

        // Skip Docker bridge networks
        if (trimmed.startsWith('br-') || trimmed.startsWith('docker') || trimmed.startsWith('veth')) {
          continue;
        }

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 10) {
          const interfaceName = parts[0].replace(':', '');
          const rxBytes = parseInt(parts[1]) || 0;
          const txBytes = parseInt(parts[9]) || 0;

          totalRx += rxBytes;
          totalTx += txBytes;
        }
      }

      return { rx: totalRx, tx: totalTx, timestamp: Date.now() };
    } catch (error) {
      logger.error('Failed to get network stats:', error);
      return null;
    }
  }

  /**
   * Collect network usage and store in history
   */
  collectNetworkUsage() {
    const currentStats = this.getNetworkStats();

    if (!currentStats) return;

    if (this.lastNetworkStats) {
      const timeDelta = (currentStats.timestamp - this.lastNetworkStats.timestamp) / 1000; // seconds

      if (timeDelta > 0) {
        const rxDelta = currentStats.rx - this.lastNetworkStats.rx;
        const txDelta = currentStats.tx - this.lastNetworkStats.tx;

        // Convert to bytes per second
        const rxRate = Math.round(rxDelta / timeDelta);
        const txRate = Math.round(txDelta / timeDelta);

        this.networkHistory.push({
          timestamp: new Date().toISOString(),
          rx: rxRate,
          tx: txRate,
        });

        // Keep only last N data points
        if (this.networkHistory.length > this.maxHistoryLength) {
          this.networkHistory.shift();
        }

        logger.debug(`Network traffic: RX ${rxRate} B/s, TX ${txRate} B/s`);
      }
    }

    this.lastNetworkStats = currentStats;
  }

  /**
   * Get network usage history
   */
  getNetworkHistory() {
    return this.networkHistory;
  }
}

// Create singleton instance
const statsService = new StatsService();

export default statsService;
