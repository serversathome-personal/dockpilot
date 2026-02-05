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
   * Find containers that depend on a specific container's network
   * These are containers with network_mode: container:<name>
   * @param {string} containerName - Name of the container to check dependencies for
   * @returns {Promise<Array>} Array of dependent containers
   */
  async getNetworkDependentContainers(containerName) {
    try {
      const allContainers = await this.docker.listContainers({ all: true });
      const dependentContainers = [];

      for (const containerInfo of allContainers) {
        try {
          const container = this.docker.getContainer(containerInfo.Id);
          const info = await container.inspect();
          const networkMode = info.HostConfig?.NetworkMode || '';

          // Check if this container uses the target container's network
          // NetworkMode can be "container:<name>" or "container:<id>"
          if (networkMode.startsWith('container:')) {
            const dependsOn = networkMode.replace('container:', '');
            // Check if dependsOn matches the target container name
            if (dependsOn === containerName) {
              dependentContainers.push({
                id: containerInfo.Id,
                name: containerInfo.Names?.[0]?.replace(/^\//, '') || containerInfo.Id.substring(0, 12),
                networkMode,
                state: containerInfo.State,
              });
            }
          }
        } catch (e) {
          // Skip containers we can't inspect
        }
      }

      return dependentContainers;
    } catch (error) {
      logger.error(`Failed to get network-dependent containers for ${containerName}: ${error.message}`);
      return [];
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
          logger.warn(`Failed to get stats for container ${container.id}: ${error.message}`);
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
   * Recreate a standalone container with a new image
   * Preserves container configuration (name, ports, volumes, env, etc.)
   * @param {string} id - Container ID or name
   * @param {string} newImage - New image to use
   * @returns {Promise<Object>} New container info
   */
  async recreateContainer(id, newImage) {
    try {
      const container = this.docker.getContainer(id);
      const info = await container.inspect();

      const oldName = info.Name.replace(/^\//, '');
      const wasRunning = info.State.Running;

      logger.info(`Recreating container ${oldName} with image ${newImage}`);

      // Stop container if running
      if (wasRunning) {
        await container.stop();
      }

      // Remove old container
      await container.remove();

      // Create new container with same config but new image
      const createOptions = {
        name: oldName,
        Image: newImage,
        Cmd: info.Config.Cmd,
        Entrypoint: info.Config.Entrypoint,
        Env: info.Config.Env,
        Labels: info.Config.Labels,
        ExposedPorts: info.Config.ExposedPorts,
        WorkingDir: info.Config.WorkingDir,
        User: info.Config.User,
        Hostname: info.Config.Hostname,
        Domainname: info.Config.Domainname,
        Tty: info.Config.Tty,
        OpenStdin: info.Config.OpenStdin,
        StdinOnce: info.Config.StdinOnce,
        HostConfig: {
          Binds: info.HostConfig.Binds,
          PortBindings: info.HostConfig.PortBindings,
          RestartPolicy: info.HostConfig.RestartPolicy,
          NetworkMode: info.HostConfig.NetworkMode,
          Privileged: info.HostConfig.Privileged,
          CapAdd: info.HostConfig.CapAdd,
          CapDrop: info.HostConfig.CapDrop,
          Dns: info.HostConfig.Dns,
          DnsSearch: info.HostConfig.DnsSearch,
          ExtraHosts: info.HostConfig.ExtraHosts,
          VolumesFrom: info.HostConfig.VolumesFrom,
          Devices: info.HostConfig.Devices,
          Memory: info.HostConfig.Memory,
          MemorySwap: info.HostConfig.MemorySwap,
          CpuShares: info.HostConfig.CpuShares,
          CpuPeriod: info.HostConfig.CpuPeriod,
          CpuQuota: info.HostConfig.CpuQuota,
          LogConfig: info.HostConfig.LogConfig,
          SecurityOpt: info.HostConfig.SecurityOpt,
          Tmpfs: info.HostConfig.Tmpfs,
          ShmSize: info.HostConfig.ShmSize,
        },
        NetworkingConfig: {
          EndpointsConfig: info.NetworkSettings.Networks,
        },
      };

      const newContainer = await this.docker.createContainer(createOptions);

      // Start if it was running before
      if (wasRunning) {
        await newContainer.start();
      }

      logger.info(`Container ${oldName} recreated successfully`);

      return {
        id: newContainer.id,
        name: oldName,
      };
    } catch (error) {
      logger.error(`Failed to recreate container ${id}:`, error);
      throw new Error(`Failed to recreate container ${id}: ${error.message}`);
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
   * Prune unused images and build cache
   * @param {Object} options - Prune options
   * @param {boolean} options.all - Remove all unused images, not just dangling
   * @returns {Promise<Object>} Prune result
   */
  async pruneImages(options = {}) {
    try {
      const { execSync } = await import('child_process');

      // By default, prune all unused images (not just dangling)
      // This is equivalent to `docker image prune -a`
      const filters = options.all !== false ? { dangling: ['false'] } : {};

      const result = await this.docker.pruneImages({ filters });

      // Also prune build cache
      let buildCacheReclaimed = 0;
      try {
        const buildPruneOutput = execSync('docker builder prune -a -f 2>/dev/null', { encoding: 'utf8' });
        // Parse output to get reclaimed space (format: "Total reclaimed space: 1.234GB")
        const match = buildPruneOutput.match(/Total reclaimed space:\s*([\d.]+)\s*([KMGT]?B)/i);
        if (match) {
          const value = parseFloat(match[1]);
          const unit = match[2].toUpperCase();
          const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024**2, 'GB': 1024**3, 'TB': 1024**4 };
          buildCacheReclaimed = value * (multipliers[unit] || 1);
        }
        logger.info(`Build cache pruned, reclaimed ${(buildCacheReclaimed / 1024 / 1024).toFixed(2)} MB`);
      } catch (buildError) {
        // Build cache prune may fail if docker builder is not available
        logger.debug(`Could not prune build cache: ${buildError.message}`);
      }

      const totalReclaimed = (result.SpaceReclaimed || 0) + buildCacheReclaimed;

      logger.info('Unused images pruned', {
        imagesDeleted: result.ImagesDeleted?.length || 0,
        spaceReclaimed: totalReclaimed,
      });
      return {
        ImagesDeleted: result.ImagesDeleted || [],
        SpaceReclaimed: totalReclaimed,
        BuildCacheReclaimed: buildCacheReclaimed,
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

      // Get disk usage - try Docker root dir first, then fall back to root filesystem
      let storageInfo = {};
      try {
        // Try Docker root directory first
        let dfOutput;
        try {
          dfOutput = execSync(`df -B1 ${info.DockerRootDir || '/var/lib/docker'} 2>/dev/null`, { encoding: 'utf8' });
        } catch (e) {
          // Fall back to root filesystem (works inside containers)
          dfOutput = execSync('df -B1 /', { encoding: 'utf8' });
        }

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
        logger.warn(`Failed to get disk usage: ${dfError.message}`);
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

  /**
   * Get Docker events
   * @param {Object} options - Filter options (since, until, filters)
   * @returns {Promise<Array>} Array of events
   */
  async getEvents(options = {}) {
    try {
      const { since, until, limit = 100 } = options;

      // Calculate default 'since' to last 24 hours if not provided
      const sinceTime = since || Math.floor(Date.now() / 1000) - 86400;
      const untilTime = until || Math.floor(Date.now() / 1000);

      return new Promise((resolve, reject) => {
        const events = [];

        this.docker.getEvents({
          since: sinceTime,
          until: untilTime,
        }, (err, stream) => {
          if (err) {
            logger.error('Failed to get Docker events:', err);
            reject(new Error('Failed to get Docker events'));
            return;
          }

          stream.on('data', (chunk) => {
            try {
              const event = JSON.parse(chunk.toString());
              events.push({
                id: event.id || '',
                type: event.Type,
                action: event.Action,
                actor: {
                  id: event.Actor?.ID || '',
                  name: event.Actor?.Attributes?.name || event.Actor?.Attributes?.image || '',
                  attributes: event.Actor?.Attributes || {},
                },
                time: event.time,
                timeNano: event.timeNano,
              });

              // Limit the number of events to prevent memory issues
              if (events.length >= limit) {
                stream.destroy();
                resolve(events.slice(0, limit));
              }
            } catch (parseError) {
              // Ignore parse errors for partial data
            }
          });

          stream.on('end', () => {
            resolve(events);
          });

          stream.on('error', (streamError) => {
            logger.error('Docker events stream error:', streamError);
            resolve(events); // Return what we have so far
          });

          // Set a timeout to ensure we don't hang forever
          setTimeout(() => {
            stream.destroy();
            resolve(events);
          }, 5000);
        });
      });
    } catch (error) {
      logger.error('Failed to get Docker events:', error);
      throw new Error('Failed to get Docker events');
    }
  }

  /**
   * Pull image with detailed progress streaming
   * Uses Docker API's followProgress for per-layer tracking
   * @param {string} imageTag - Full image tag (e.g., "nginx:latest")
   * @param {Function} onProgress - Progress callback with layer and summary data
   * @returns {Promise<Object>} Pull result with digest info
   */
  async pullImageWithProgress(imageTag, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageTag, (err, stream) => {
        if (err) {
          logger.error(`Failed to pull image ${imageTag}:`, err);
          return reject(err);
        }

        const layerProgress = {};
        let lastUpdate = 0;
        let finalDigest = null;

        this.docker.modem.followProgress(
          stream,
          // onFinished callback
          (err, output) => {
            if (err) {
              logger.error(`Pull failed for ${imageTag}:`, err);
              return reject(err);
            }

            logger.info(`Image ${imageTag} pulled successfully`);
            resolve({
              success: true,
              digest: finalDigest,
              output,
            });
          },
          // onProgress callback - called for each progress event
          (event) => {
            // Track layer progress
            if (event.id) {
              layerProgress[event.id] = {
                id: event.id,
                status: event.status,
                current: event.progressDetail?.current || 0,
                total: event.progressDetail?.total || 0,
              };
            }

            // Capture final digest
            if (event.status?.includes('Digest:')) {
              finalDigest = event.status.split('Digest:')[1]?.trim();
            }

            // Throttle progress updates to every 100ms
            const now = Date.now();
            if (now - lastUpdate < 100) return;
            lastUpdate = now;

            // Calculate summary statistics
            const layers = Object.values(layerProgress);
            const completedLayers = layers.filter(
              (l) => l.status === 'Pull complete' || l.status === 'Already exists'
            ).length;
            const downloadingLayers = layers.filter(
              (l) => l.status === 'Downloading'
            ).length;
            const extractingLayers = layers.filter(
              (l) => l.status === 'Extracting'
            ).length;

            // Calculate byte progress
            let downloadedBytes = 0;
            let totalBytes = 0;
            layers.forEach((layer) => {
              if (layer.total > 0) {
                downloadedBytes += layer.current;
                totalBytes += layer.total;
              }
            });

            const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

            // Format status message
            let statusMessage = '';
            if (extractingLayers > 0) {
              statusMessage = 'Extracting';
            } else if (downloadingLayers > 0) {
              statusMessage = 'Downloading';
            } else if (completedLayers === layers.length && layers.length > 0) {
              statusMessage = 'Complete';
            } else {
              statusMessage = 'Waiting';
            }

            onProgress({
              event,
              layers: layerProgress,
              summary: {
                completed: completedLayers,
                total: layers.length,
                downloading: downloadingLayers,
                extracting: extractingLayers,
                downloadedBytes,
                totalBytes,
                percent,
                status: statusMessage,
              },
            });
          }
        );
      });
    });
  }

  /**
   * Stream Docker events via SSE
   * @param {Object} res - Express response object for SSE
   * @param {Object} options - Filter options
   */
  streamEvents(res, options = {}) {
    try {
      this.docker.getEvents({
        since: Math.floor(Date.now() / 1000) - 3600, // Last hour
      }, (err, stream) => {
        if (err) {
          logger.error('Failed to stream Docker events:', err);
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to connect to Docker events' })}\n\n`);
          res.end();
          return;
        }

        stream.on('data', (chunk) => {
          try {
            const event = JSON.parse(chunk.toString());
            const formattedEvent = {
              type: 'event',
              data: {
                id: event.id || '',
                type: event.Type,
                action: event.Action,
                actor: {
                  id: event.Actor?.ID || '',
                  name: event.Actor?.Attributes?.name || event.Actor?.Attributes?.image || '',
                  attributes: event.Actor?.Attributes || {},
                },
                time: event.time,
                timeNano: event.timeNano,
              },
            };
            res.write(`data: ${JSON.stringify(formattedEvent)}\n\n`);
          } catch (parseError) {
            // Ignore parse errors
          }
        });

        stream.on('error', (streamError) => {
          logger.error('Docker events stream error:', streamError);
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`);
        });

        // Handle client disconnect
        res.on('close', () => {
          stream.destroy();
        });
      });
    } catch (error) {
      logger.error('Failed to stream Docker events:', error);
      throw new Error('Failed to stream Docker events');
    }
  }

  /**
   * Stream logs from multiple containers simultaneously
   * @param {Array<string>} containerIds - Array of container IDs
   * @param {Function} onLog - Callback for each log line (containerId, containerName, data, stream)
   * @param {Object} options - Log options
   * @returns {Promise<Array>} Array of stream references for cleanup
   */
  async streamMultiContainerLogs(containerIds, onLog, options = {}) {
    const streams = [];

    for (const containerId of containerIds) {
      try {
        const container = this.docker.getContainer(containerId);
        const info = await container.inspect();
        const containerName = info.Name.replace(/^\//, '');

        const stream = await container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          tail: options.tail || 100,
          timestamps: options.timestamps || false,
        });

        // Demux stdout and stderr from Docker stream
        stream.on('data', (chunk) => {
          // Docker multiplexes stdout/stderr with an 8-byte header
          // Header: [STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4]
          // STREAM_TYPE: 0=stdin, 1=stdout, 2=stderr
          let offset = 0;
          while (offset < chunk.length) {
            if (offset + 8 > chunk.length) break;

            const streamType = chunk[offset];
            const size = chunk.readUInt32BE(offset + 4);

            if (offset + 8 + size > chunk.length) break;

            const data = chunk.slice(offset + 8, offset + 8 + size).toString('utf8');
            const streamName = streamType === 2 ? 'stderr' : 'stdout';

            onLog(containerId, containerName, data, streamName);
            offset += 8 + size;
          }
        });

        stream.on('error', (err) => {
          logger.warn(`Log stream error for container ${containerId}: ${err.message}`);
        });

        streams.push({ containerId, containerName, stream });
      } catch (error) {
        logger.warn(`Failed to stream logs for container ${containerId}: ${error.message}`);
      }
    }

    return streams;
  }

  /**
   * List directory contents inside a container
   * @param {string} containerId - Container ID or name
   * @param {string} path - Directory path to list
   * @returns {Promise<Array>} Array of file/directory entries
   */
  async listContainerFiles(containerId, path = '/') {
    try {
      const container = this.docker.getContainer(containerId);

      // Create exec instance to run ls command
      const exec = await container.exec({
        Cmd: ['ls', '-la', '--time-style=long-iso', path],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        stream.on('data', (chunk) => {
          // Docker multiplexes stdout/stderr
          let offset = 0;
          while (offset < chunk.length) {
            if (offset + 8 > chunk.length) break;

            const streamType = chunk[offset];
            const size = chunk.readUInt32BE(offset + 4);

            if (offset + 8 + size > chunk.length) break;

            const data = chunk.slice(offset + 8, offset + 8 + size).toString('utf8');
            if (streamType === 2) {
              stderr += data;
            } else {
              stdout += data;
            }
            offset += 8 + size;
          }
        });

        stream.on('end', () => {
          if (stderr && stderr.includes('No such file or directory')) {
            resolve([]);
            return;
          }

          const lines = stdout.trim().split('\n');
          const files = [];

          for (const line of lines) {
            // Skip total line and empty lines
            if (line.startsWith('total ') || !line.trim()) continue;

            // Parse ls -la output
            // Format: permissions links owner group size date time name
            const parts = line.split(/\s+/);
            if (parts.length < 8) continue;

            const permissions = parts[0];
            const size = parseInt(parts[4], 10) || 0;
            const dateStr = parts[5];
            const timeStr = parts[6];
            const name = parts.slice(7).join(' ');

            // Skip . and .. entries
            if (name === '.' || name === '..') continue;

            // Determine file type from permissions
            let type = 'file';
            if (permissions.startsWith('d')) {
              type = 'directory';
            } else if (permissions.startsWith('l')) {
              type = 'link';
            }

            files.push({
              name: name.split(' -> ')[0], // Handle symlinks showing target
              type,
              size,
              modified: `${dateStr} ${timeStr}`,
              permissions,
            });
          }

          resolve(files);
        });

        stream.on('error', (err) => {
          logger.error(`Failed to list files in container ${containerId}:`, err);
          reject(new Error(`Failed to list files: ${err.message}`));
        });
      });
    } catch (error) {
      logger.error(`Failed to list files in container ${containerId}:`, error);
      if (error.statusCode === 404) {
        throw new Error('Container not found');
      }
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Read file content from inside a container
   * @param {string} containerId - Container ID or name
   * @param {string} path - File path to read
   * @param {number} maxSize - Maximum bytes to read (default 100000)
   * @returns {Promise<Object>} Object with content and truncated flag
   */
  async readContainerFile(containerId, path, maxSize = 100000) {
    try {
      const container = this.docker.getContainer(containerId);

      // Create exec instance to run head command
      const exec = await container.exec({
        Cmd: ['head', '-c', String(maxSize), path],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        stream.on('data', (chunk) => {
          // Docker multiplexes stdout/stderr
          let offset = 0;
          while (offset < chunk.length) {
            if (offset + 8 > chunk.length) break;

            const streamType = chunk[offset];
            const size = chunk.readUInt32BE(offset + 4);

            if (offset + 8 + size > chunk.length) break;

            const data = chunk.slice(offset + 8, offset + 8 + size).toString('utf8');
            if (streamType === 2) {
              stderr += data;
            } else {
              stdout += data;
            }
            offset += 8 + size;
          }
        });

        stream.on('end', async () => {
          if (stderr && (stderr.includes('No such file') || stderr.includes('Is a directory'))) {
            reject(new Error(stderr.trim()));
            return;
          }

          // Check if file was truncated by getting file size
          let truncated = false;
          try {
            const statExec = await container.exec({
              Cmd: ['stat', '-c', '%s', path],
              AttachStdout: true,
              AttachStderr: true,
            });
            const statStream = await statExec.start({ hijack: true, stdin: false });

            const fileSize = await new Promise((res) => {
              let output = '';
              statStream.on('data', (chunk) => {
                let offset = 0;
                while (offset < chunk.length) {
                  if (offset + 8 > chunk.length) break;
                  const size = chunk.readUInt32BE(offset + 4);
                  if (offset + 8 + size > chunk.length) break;
                  if (chunk[offset] !== 2) {
                    output += chunk.slice(offset + 8, offset + 8 + size).toString('utf8');
                  }
                  offset += 8 + size;
                }
              });
              statStream.on('end', () => res(parseInt(output.trim(), 10) || 0));
              statStream.on('error', () => res(0));
            });

            truncated = fileSize > maxSize;
          } catch (e) {
            // Ignore stat errors
          }

          resolve({
            content: stdout,
            truncated,
          });
        });

        stream.on('error', (err) => {
          logger.error(`Failed to read file in container ${containerId}:`, err);
          reject(new Error(`Failed to read file: ${err.message}`));
        });
      });
    } catch (error) {
      logger.error(`Failed to read file in container ${containerId}:`, error);
      if (error.statusCode === 404) {
        throw new Error('Container not found');
      }
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Get file or directory as tar archive from container
   * @param {string} containerId - Container ID or name
   * @param {string} path - File or directory path
   * @returns {Promise<Stream>} Tar archive stream for downloading
   */
  async getContainerFileArchive(containerId, path) {
    try {
      const container = this.docker.getContainer(containerId);
      const archive = await container.getArchive({ path });

      return archive;
    } catch (error) {
      logger.error(`Failed to get archive from container ${containerId}:`, error);
      if (error.statusCode === 404) {
        throw new Error('Container or path not found');
      }
      throw new Error(`Failed to get archive: ${error.message}`);
    }
  }
}

// Export singleton instance
const dockerService = new DockerService();
export default dockerService;
