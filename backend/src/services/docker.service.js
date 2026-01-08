import Docker from 'dockerode';
import config from '../config/env.js';
import logger from '../utils/logger.js';

class DockerService {
  constructor() {
    this.docker = new Docker({
      socketPath: config.docker.socketPath,
    });
  }

  /**
   * List all containers
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Array of containers
   */
  async listContainers(options = {}) {
    try {
      const all = options.all !== false;
      const containers = await this.docker.listContainers({ all });

      return containers.map((container) => ({
        id: container.Id,
        name: container.Names[0]?.replace(/^\//, '') || '',
        image: container.Image,
        imageId: container.ImageID,
        state: container.State,
        status: container.Status,
        created: container.Created,
        ports: container.Ports.map((port) => ({
          ip: port.IP || '0.0.0.0',
          privatePort: port.PrivatePort,
          publicPort: port.PublicPort,
          type: port.Type,
        })),
        labels: container.Labels || {},
        mounts: container.Mounts || [],
        networks: Object.keys(container.NetworkSettings?.Networks || {}),
      }));
    } catch (error) {
      logger.error('Failed to list containers:', error);
      throw new Error('Failed to list containers');
    }
  }

  /**
   * Get container by ID or name
   * @param {string} id - Container ID or name
   * @returns {Promise<Object>} Container details
   */
  async getContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      const info = await container.inspect();

      return {
        id: info.Id,
        name: info.Name.replace(/^\//, ''),
        image: info.Config.Image,
        imageId: info.Image,
        state: info.State,
        created: info.Created,
        ports: info.NetworkSettings.Ports,
        labels: info.Config.Labels || {},
        env: info.Config.Env || [],
        mounts: info.Mounts || [],
        networks: info.NetworkSettings.Networks || {},
        restartPolicy: info.HostConfig.RestartPolicy,
        platform: info.Platform,
      };
    } catch (error) {
      logger.error(`Failed to get container ${id}:`, error);
      throw new Error(`Failed to get container ${id}`);
    }
  }

  /**
   * Get container stats
   * @param {string} id - Container ID or name
   * @returns {Promise<Object>} Container statistics
   */
  async getContainerStats(id) {
    try {
      const container = this.docker.getContainer(id);
      const stats = await container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

      // Calculate memory usage
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;
      const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

      // Calculate network I/O
      let networkRx = 0;
      let networkTx = 0;
      if (stats.networks) {
        Object.values(stats.networks).forEach((network) => {
          networkRx += network.rx_bytes || 0;
          networkTx += network.tx_bytes || 0;
        });
      }

      // Calculate block I/O
      let blockRead = 0;
      let blockWrite = 0;
      if (stats.blkio_stats?.io_service_bytes_recursive) {
        stats.blkio_stats.io_service_bytes_recursive.forEach((item) => {
          if (item.op === 'Read') blockRead += item.value;
          if (item.op === 'Write') blockWrite += item.value;
        });
      }

      return {
        cpu: {
          percent: cpuPercent.toFixed(2),
          usage: stats.cpu_stats.cpu_usage.total_usage,
        },
        memory: {
          usage: memoryUsage,
          limit: memoryLimit,
          percent: memoryPercent.toFixed(2),
        },
        network: {
          rx: networkRx,
          tx: networkTx,
        },
        blockIO: {
          read: blockRead,
          write: blockWrite,
        },
        pids: stats.pids_stats?.current || 0,
      };
    } catch (error) {
      logger.error(`Failed to get stats for container ${id}:`, error);
      throw new Error(`Failed to get stats for container ${id}`);
    }
  }

  /**
   * Get containers belonging to a stack
   * @param {string} stackName - Stack name
   * @returns {Promise<Array>} Array of containers
   */
  async getStackContainers(stackName) {
    try {
      const containers = await this.listContainers({ all: true });
      return containers.filter((container) => {
        const projectLabel = container.labels['com.docker.compose.project'];
        return projectLabel === stackName;
      });
    } catch (error) {
      logger.error(`Failed to get containers for stack ${stackName}:`, error);
      throw new Error(`Failed to get containers for stack ${stackName}`);
    }
  }

  /**
   * Get aggregated metrics for a stack
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Stack metrics
   */
  async getStackMetrics(stackName) {
    try {
      const containers = await this.getStackContainers(stackName);
      const runningContainers = containers.filter((c) => c.state === 'running');

      let totalCpu = 0;
      let totalMemoryUsage = 0;
      let totalMemoryLimit = 0;

      for (const container of runningContainers) {
        try {
          const stats = await this.getContainerStats(container.id);
          totalCpu += parseFloat(stats.cpu.percent);
          totalMemoryUsage += stats.memory.usage;
          totalMemoryLimit += stats.memory.limit;
        } catch (error) {
          logger.warn(`Failed to get stats for container ${container.id}:`, error.message);
        }
      }

      const memoryPercent = totalMemoryLimit > 0 ? (totalMemoryUsage / totalMemoryLimit) * 100 : 0;

      return {
        containerCount: containers.length,
        runningCount: runningContainers.length,
        cpu: {
          percent: totalCpu.toFixed(2),
        },
        memory: {
          usage: totalMemoryUsage,
          limit: totalMemoryLimit,
          percent: memoryPercent.toFixed(2),
        },
      };
    } catch (error) {
      logger.error(`Failed to get metrics for stack ${stackName}:`, error);
      throw new Error(`Failed to get metrics for stack ${stackName}`);
    }
  }

  /**
   * Stream container logs
   * @param {string} id - Container ID or name
   * @param {Object} options - Log options
   * @returns {Promise<Stream>} Log stream
   */
  async streamLogs(id, options = {}) {
    try {
      const container = this.docker.getContainer(id);
      const stream = await container.logs({
        follow: options.follow !== false,
        stdout: true,
        stderr: true,
        tail: options.tail || 100,
        timestamps: options.timestamps || false,
      });

      return stream;
    } catch (error) {
      logger.error(`Failed to stream logs for container ${id}:`, error);
      throw new Error(`Failed to stream logs for container ${id}`);
    }
  }

  /**
   * Start a container
   * @param {string} id - Container ID or name
   * @returns {Promise<void>}
   */
  async startContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      await container.start();
      logger.info(`Container ${id} started`);
    } catch (error) {
      logger.error(`Failed to start container ${id}:`, error);
      throw new Error(`Failed to start container ${id}`);
    }
  }

  /**
   * Stop a container
   * @param {string} id - Container ID or name
   * @returns {Promise<void>}
   */
  async stopContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      await container.stop();
      logger.info(`Container ${id} stopped`);
    } catch (error) {
      logger.error(`Failed to stop container ${id}:`, error);
      throw new Error(`Failed to stop container ${id}`);
    }
  }

  /**
   * Restart a container
   * @param {string} id - Container ID or name
   * @returns {Promise<void>}
   */
  async restartContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      await container.restart();
      logger.info(`Container ${id} restarted`);
    } catch (error) {
      logger.error(`Failed to restart container ${id}:`, error);
      throw new Error(`Failed to restart container ${id}`);
    }
  }

  /**
   * Pause a container
   * @param {string} id - Container ID or name
   * @returns {Promise<void>}
   */
  async pauseContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      await container.pause();
      logger.info(`Container ${id} paused`);
    } catch (error) {
      logger.error(`Failed to pause container ${id}:`, error);
      throw new Error(`Failed to pause container ${id}`);
    }
  }

  /**
   * Unpause a container
   * @param {string} id - Container ID or name
   * @returns {Promise<void>}
   */
  async unpauseContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      await container.unpause();
      logger.info(`Container ${id} unpaused`);
    } catch (error) {
      logger.error(`Failed to unpause container ${id}:`, error);
      throw new Error(`Failed to unpause container ${id}`);
    }
  }

  /**
   * Remove a container
   * @param {string} id - Container ID or name
   * @param {Object} options - Remove options
   * @returns {Promise<void>}
   */
  async removeContainer(id, options = {}) {
    try {
      const container = this.docker.getContainer(id);
      await container.remove({
        force: options.force || false,
        v: options.volumes || false,
      });
      logger.info(`Container ${id} removed`);
    } catch (error) {
      logger.error(`Failed to remove container ${id}:`, error);
      throw new Error(`Failed to remove container ${id}`);
    }
  }

  /**
   * List all images
   * @returns {Promise<Array>} Array of images
   */
  async listImages() {
    try {
      const images = await this.docker.listImages({ all: false });

      return images.map((image) => ({
        id: image.Id,
        tags: image.RepoTags || [],
        digests: image.RepoDigests || [],
        created: image.Created,
        size: image.Size,
        virtualSize: image.VirtualSize,
        sharedSize: image.SharedSize,
        containers: image.Containers,
        labels: image.Labels || {},
      }));
    } catch (error) {
      logger.error('Failed to list images:', error);
      throw new Error('Failed to list images');
    }
  }

  /**
   * Remove an image
   * @param {string} id - Image ID or name
   * @param {Object} options - Remove options
   * @returns {Promise<void>}
   */
  async removeImage(id, options = {}) {
    try {
      const image = this.docker.getImage(id);
      await image.remove({
        force: options.force || false,
        noprune: options.noprune || false,
      });
      logger.info(`Image ${id} removed`);
    } catch (error) {
      logger.error(`Failed to remove image ${id}:`, error);
      throw new Error(`Failed to remove image ${id}`);
    }
  }

  /**
   * Prune unused images
   * @returns {Promise<Object>} Prune result
   */
  async pruneImages() {
    try {
      const result = await this.docker.pruneImages();
      logger.info('Unused images pruned', {
        imagesDeleted: result.ImagesDeleted?.length || 0,
        spaceReclaimed: result.SpaceReclaimed || 0,
      });
      return {
        imagesDeleted: result.ImagesDeleted || [],
        spaceReclaimed: result.SpaceReclaimed || 0,
      };
    } catch (error) {
      logger.error('Failed to prune images:', error);
      throw new Error('Failed to prune images');
    }
  }

  /**
   * Pull an image
   * @param {string} imageName - Image name with optional tag
   * @returns {Promise<Object>} Result with updated flag
   */
  async pullImage(imageName) {
    try {
      const stream = await this.docker.pull(imageName);

      return new Promise((resolve, reject) => {
        let wasUpdated = false;

        // Listen for pull events to detect if image was updated
        stream.on('data', (chunk) => {
          try {
            const data = JSON.parse(chunk.toString());
            // Check for status messages that indicate a download
            if (data.status && (data.status.includes('Downloading') || data.status.includes('Download complete') || data.status.includes('Pull complete'))) {
              wasUpdated = true;
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        });

        stream.on('end', () => {
          logger.info(`Image ${imageName} pull completed. Updated: ${wasUpdated}`);
          resolve({ updated: wasUpdated });
        });

        stream.on('error', (error) => {
          logger.error(`Failed to pull image ${imageName}:`, error);
          reject(new Error(`Failed to pull image ${imageName}`));
        });
      });
    } catch (error) {
      logger.error(`Failed to pull image ${imageName}:`, error);
      throw new Error(`Failed to pull image ${imageName}`);
    }
  }

  /**
   * Pull an image with streaming output
   * @param {string} imageName - Image name with optional tag
   * @param {Function} onData - Callback for each line of output
   * @returns {Promise<Object>} Result with updated flag
   */
  async streamPullImage(imageName, onData) {
    try {
      const stream = await this.docker.pull(imageName);

      return new Promise((resolve, reject) => {
        let wasUpdated = false;

        stream.on('data', (chunk) => {
          try {
            const data = JSON.parse(chunk.toString());

            // Check for status messages that indicate a download
            if (data.status && (data.status.includes('Downloading') || data.status.includes('Download complete') || data.status.includes('Pull complete'))) {
              wasUpdated = true;
            }

            // Format output for streaming
            let output = '';
            if (data.status) {
              output = data.status;
              if (data.id) {
                output = `${data.id}: ${output}`;
              }
              if (data.progress) {
                output += ` ${data.progress}`;
              }
              output += '\n';
            }

            if (output && onData) {
              onData(output, 'stdout');
            }
          } catch (e) {
            // If not JSON, just pass through
            if (onData) {
              onData(chunk.toString(), 'stdout');
            }
          }
        });

        stream.on('end', () => {
          logger.info(`Image ${imageName} pull completed. Updated: ${wasUpdated}`);
          resolve({ updated: wasUpdated });
        });

        stream.on('error', (error) => {
          logger.error(`Failed to pull image ${imageName}:`, error);
          reject(new Error(`Failed to pull image ${imageName}`));
        });
      });
    } catch (error) {
      logger.error(`Failed to pull image ${imageName}:`, error);
      throw new Error(`Failed to pull image ${imageName}`);
    }
  }

  /**
   * List all networks
   * @returns {Promise<Array>} Array of networks
   */
  async listNetworks() {
    try {
      const networks = await this.docker.listNetworks();

      return networks.map((network) => ({
        id: network.Id,
        name: network.Name,
        driver: network.Driver,
        scope: network.Scope,
        internal: network.Internal,
        attachable: network.Attachable,
        ipam: network.IPAM,
        containers: network.Containers || {},
        options: network.Options || {},
        labels: network.Labels || {},
        created: network.Created,
      }));
    } catch (error) {
      logger.error('Failed to list networks:', error);
      throw new Error('Failed to list networks');
    }
  }

  /**
   * Get network details
   * @param {string} id - Network ID or name
   * @returns {Promise<Object>} Network details
   */
  async getNetwork(id) {
    try {
      const network = this.docker.getNetwork(id);
      const info = await network.inspect();

      // Get list of containers and their details in this network
      const containersInNetwork = [];
      if (info.Containers) {
        for (const [containerId, containerInfo] of Object.entries(info.Containers)) {
          containersInNetwork.push({
            id: containerId,
            name: containerInfo.Name,
            ipv4Address: containerInfo.IPv4Address,
            ipv6Address: containerInfo.IPv6Address,
            macAddress: containerInfo.MacAddress,
          });
        }
      }

      return {
        id: info.Id,
        name: info.Name,
        driver: info.Driver,
        scope: info.Scope,
        internal: info.Internal,
        attachable: info.Attachable,
        ipam: info.IPAM,
        options: info.Options || {},
        labels: info.Labels || {},
        created: info.Created,
        containers: containersInNetwork,
      };
    } catch (error) {
      logger.error(`Failed to get network ${id}:`, error);
      throw new Error(`Failed to get network ${id}`);
    }
  }

  /**
   * Create a network
   * @param {Object} options - Network options
   * @returns {Promise<Object>} Network info
   */
  async createNetwork(options) {
    try {
      const config = {
        Name: options.name,
        Driver: options.driver || 'bridge',
      };

      // Add IPAM config if subnet/gateway provided
      if (options.subnet || options.gateway) {
        config.IPAM = {
          Config: [{
            Subnet: options.subnet,
            Gateway: options.gateway,
          }],
        };
      }

      const network = await this.docker.createNetwork(config);
      const networkInfo = await network.inspect();
      logger.info(`Network ${options.name} created`);

      return {
        id: networkInfo.Id,
        name: networkInfo.Name,
      };
    } catch (error) {
      logger.error(`Failed to create network ${options.name}:`, error);
      throw new Error(`Failed to create network: ${error.message}`);
    }
  }

  /**
   * Remove a network
   * @param {string} id - Network ID or name
   * @returns {Promise<void>}
   */
  async removeNetwork(id) {
    try {
      const network = this.docker.getNetwork(id);
      await network.remove();
      logger.info(`Network ${id} removed`);
    } catch (error) {
      logger.error(`Failed to remove network ${id}:`, error);
      throw new Error(`Failed to remove network ${id}`);
    }
  }

  /**
   * Prune unused networks
   * @returns {Promise<Object>} Prune result
   */
  async pruneNetworks() {
    try {
      const result = await this.docker.pruneNetworks();
      logger.info('Unused networks pruned', {
        networksDeleted: result.NetworksDeleted?.length || 0,
      });
      return {
        networksDeleted: result.NetworksDeleted || [],
      };
    } catch (error) {
      logger.error('Failed to prune networks:', error);
      throw new Error('Failed to prune networks');
    }
  }

  /**
   * List all volumes
   * @returns {Promise<Array>} Array of volumes
   */
  async listVolumes() {
    try {
      const data = await this.docker.listVolumes();
      const volumes = data.Volumes || [];

      return volumes.map((volume) => ({
        name: volume.Name,
        driver: volume.Driver,
        mountpoint: volume.Mountpoint,
        scope: volume.Scope,
        labels: volume.Labels || {},
        options: volume.Options || {},
        created: volume.CreatedAt,
      }));
    } catch (error) {
      logger.error('Failed to list volumes:', error);
      throw new Error('Failed to list volumes');
    }
  }

  /**
   * Create a volume
   * @param {Object} options - Volume options
   * @returns {Promise<Object>} Volume info
   */
  async createVolume(options) {
    try {
      const config = {
        Name: options.name,
        Driver: options.driver || 'local',
      };

      const volume = await this.docker.createVolume(config);
      logger.info(`Volume ${options.name} created`);

      return {
        name: volume.name,
        driver: volume.driver,
        mountpoint: volume.mountpoint,
      };
    } catch (error) {
      logger.error(`Failed to create volume ${options.name}:`, error);
      throw new Error(`Failed to create volume: ${error.message}`);
    }
  }

  /**
   * Remove a volume
   * @param {string} name - Volume name
   * @param {Object} options - Remove options
   * @returns {Promise<void>}
   */
  async removeVolume(name, options = {}) {
    try {
      const volume = this.docker.getVolume(name);
      await volume.remove({ force: options.force || false });
      logger.info(`Volume ${name} removed`);
    } catch (error) {
      logger.error(`Failed to remove volume ${name}:`, error);
      throw new Error(`Failed to remove volume ${name}`);
    }
  }

  /**
   * Prune unused volumes
   * @returns {Promise<Object>} Prune result
   */
  async pruneVolumes() {
    try {
      const result = await this.docker.pruneVolumes();
      logger.info('Unused volumes pruned', {
        volumesDeleted: result.VolumesDeleted?.length || 0,
        spaceReclaimed: result.SpaceReclaimed || 0,
      });
      return {
        volumesDeleted: result.VolumesDeleted || [],
        spaceReclaimed: result.SpaceReclaimed || 0,
      };
    } catch (error) {
      logger.error('Failed to prune volumes:', error);
      throw new Error('Failed to prune volumes');
    }
  }

  /**
   * Get Docker system info
   * @returns {Promise<Object>} System information
   */
  async getSystemInfo() {
    try {
      const info = await this.docker.info();
      const os = await import('os');
      const { execSync } = await import('child_process');

      // Calculate memory usage
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryUsage = Math.round((usedMem / totalMem) * 100);

      // Get disk usage for Docker root directory
      let storageInfo = {};
      try {
        const dfOutput = execSync(`df -B1 ${info.DockerRootDir || '/var/lib/docker'}`, { encoding: 'utf8' });
        const lines = dfOutput.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          const totalStorage = parseInt(parts[1], 10);
          const usedStorage = parseInt(parts[2], 10);
          const freeStorage = parseInt(parts[3], 10);
          const storageUsagePercent = Math.round((usedStorage / totalStorage) * 100);

          storageInfo = {
            storageTotal: totalStorage,
            storageFree: freeStorage,
            storageUsed: usedStorage,
            storageUsagePercent,
          };
        }
      } catch (dfError) {
        logger.warn('Failed to get disk usage:', dfError.message);
      }

      // Get IP addresses - only host IP, not Docker networks
      const ipAddresses = [];
      const networkInterfaces = os.networkInterfaces();
      for (const [name, interfaces] of Object.entries(networkInterfaces)) {
        // Skip Docker bridge networks (br-, docker, veth)
        if (name.startsWith('br-') || name.startsWith('docker') || name.startsWith('veth')) {
          continue;
        }

        if (interfaces) {
          for (const iface of interfaces) {
            // Skip internal, non-IPv4, and Docker network ranges (172.x.x.x)
            if (!iface.internal && iface.family === 'IPv4') {
              const ip = iface.address;
              // Skip Docker default bridge network range (172.17-32.x.x)
              if (!ip.startsWith('172.')) {
                ipAddresses.push(ip);
              }
            }
          }
        }
      }

      // Get network traffic statistics
      let networkStats = { rx: 0, tx: 0 };
      try {
        const { execSync } = await import('child_process');
        // Get network stats from /proc/net/dev (Linux)
        const netDevOutput = execSync('cat /proc/net/dev', { encoding: 'utf8' });
        const lines = netDevOutput.trim().split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          // Skip header lines and Docker interfaces
          if (trimmed.startsWith('Inter-') || trimmed.startsWith('face') ||
              trimmed.startsWith('lo:') || trimmed.startsWith('docker') ||
              trimmed.startsWith('br-') || trimmed.startsWith('veth')) {
            continue;
          }

          const parts = trimmed.split(/\s+/);
          if (parts.length >= 10) {
            const iface = parts[0].replace(':', '');
            // Only count physical/main network interfaces
            if (!iface.startsWith('docker') && !iface.startsWith('br-') &&
                !iface.startsWith('veth') && iface !== 'lo') {
              const rxBytes = parseInt(parts[1], 10) || 0;
              const txBytes = parseInt(parts[9], 10) || 0;
              networkStats.rx += rxBytes;
              networkStats.tx += txBytes;
            }
          }
        }
      } catch (netError) {
        logger.warn('Failed to get network stats:', netError.message);
      }

      return {
        containers: info.Containers,
        containersRunning: info.ContainersRunning,
        containersPaused: info.ContainersPaused,
        containersStopped: info.ContainersStopped,
        images: info.Images,
        driver: info.Driver,
        memoryLimit: info.MemoryLimit,
        swapLimit: info.SwapLimit,
        kernelVersion: info.KernelVersion,
        operatingSystem: info.OperatingSystem,
        osType: info.OSType,
        architecture: info.Architecture,
        ncpu: info.NCPU,
        memTotal: totalMem,
        memFree: freeMem,
        memUsed: usedMem,
        memoryUsage,
        ...storageInfo,
        dockerRootDir: info.DockerRootDir,
        serverVersion: info.ServerVersion,
        name: info.Name,
        ipAddresses,
        networkRx: networkStats.rx,
        networkTx: networkStats.tx,
      };
    } catch (error) {
      logger.error('Failed to get system info:', error);
      throw new Error('Failed to get system info');
    }
  }

  /**
   * Get Docker version
   * @returns {Promise<Object>} Version information
   */
  async getVersion() {
    try {
      const version = await this.docker.version();
      return {
        version: version.Version,
        apiVersion: version.ApiVersion,
        minApiVersion: version.MinAPIVersion,
        gitCommit: version.GitCommit,
        goVersion: version.GoVersion,
        os: version.Os,
        arch: version.Arch,
        kernelVersion: version.KernelVersion,
        buildTime: version.BuildTime,
      };
    } catch (error) {
      logger.error('Failed to get Docker version:', error);
      throw new Error('Failed to get Docker version');
    }
  }
}

// Export singleton instance
const dockerService = new DockerService();
export default dockerService;
