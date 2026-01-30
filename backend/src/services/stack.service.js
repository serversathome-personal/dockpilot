import fs from 'fs-extra';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import yaml from 'js-yaml';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import dockerService from './docker.service.js';

const execAsync = promisify(exec);

class StackService {
  constructor() {
    this.stacksDir = config.stacks.directory;
    // Supported compose file names in priority order
    this.composeFileNames = [
      'docker-compose.yml',
      'docker-compose.yaml',
      'compose.yml',
      'compose.yaml'
    ];
  }

  /**
   * Find the compose file in a stack directory
   * @param {string} stackDir - Stack directory
   * @returns {Promise<string|null>} Path to compose file or null if not found
   */
  async findComposeFile(stackDir) {
    for (const fileName of this.composeFileNames) {
      const filePath = path.join(stackDir, fileName);
      if (await fs.pathExists(filePath)) {
        return filePath;
      }
    }
    return null;
  }

  /**
   * Execute docker-compose command
   * @param {string} stackDir - Stack directory
   * @param {string} command - Docker Compose command
   * @param {Array} args - Command arguments
   * @returns {Promise<Object>} Command result
   */
  async executeComposeCommand(stackDir, command, args = []) {
    try {
      const composeFile = await this.findComposeFile(stackDir);
      const envFile = path.join(stackDir, '.env');

      // Check if compose file exists
      if (!composeFile) {
        throw new Error('No compose file found (docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml)');
      }

      // Build command
      let cmd = `docker compose -f "${composeFile}"`;

      // Add env file if it exists
      if (await fs.pathExists(envFile)) {
        cmd += ` --env-file "${envFile}"`;
      }

      // Add command and args
      cmd += ` ${command} ${args.join(' ')}`;

      logger.info(`Executing command: ${cmd}`);

      // Create clean environment for docker-compose to prevent conflicts
      // Remove variables that might interfere with compose files
      const cleanEnv = { ...process.env };
      delete cleanEnv.PORT; // Prevent PORT conflicts with compose files

      const { stdout, stderr } = await execAsync(cmd, {
        cwd: stackDir,
        env: cleanEnv
      });

      if (stderr && !stderr.includes('WARNING')) {
        logger.warn(`Command stderr: ${stderr}`);
      }

      return { stdout, stderr };
    } catch (error) {
      logger.error(`Failed to execute compose command in ${stackDir}:`, error);
      throw new Error(`Failed to execute compose command: ${error.message}`);
    }
  }

  /**
   * Stream docker-compose command output
   * @param {string} stackDir - Stack directory
   * @param {string} command - Docker Compose command
   * @param {Array} args - Command arguments
   * @param {Function} onData - Callback for each line of output
   * @returns {Promise<Object>} Command result
   */
  async streamComposeCommand(stackDir, command, args = [], onData) {
    return new Promise(async (resolve, reject) => {
      try {
        const composeFile = await this.findComposeFile(stackDir);
        const envFile = path.join(stackDir, '.env');

        // Check if compose file exists
        if (!composeFile) {
          throw new Error('No compose file found (docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml)');
        }

        // Build command args array
        const cmdArgs = [
          'compose',
          '-f',
          composeFile
        ];

        // Add env file if it exists
        if (await fs.pathExists(envFile)) {
          cmdArgs.push('--env-file', envFile);
        }

        // Add command and args
        cmdArgs.push(command, ...args);

        logger.info(`Streaming command: docker ${cmdArgs.join(' ')}`);

        // Create clean environment
        const cleanEnv = { ...process.env };
        delete cleanEnv.PORT;

        // Spawn the process
        const proc = spawn('docker', cmdArgs, {
          cwd: stackDir,
          env: cleanEnv
        });

        let stdout = '';
        let stderr = '';

        // Handle stdout
        proc.stdout.on('data', (data) => {
          const text = data.toString();
          stdout += text;
          if (onData) onData(text, 'stdout');
        });

        // Handle stderr (docker compose writes progress to stderr)
        proc.stderr.on('data', (data) => {
          const text = data.toString();
          stderr += text;
          if (onData) onData(text, 'stderr');
        });

        // Handle process exit
        proc.on('close', (code) => {
          if (code !== 0) {
            logger.error(`Command exited with code ${code}`);
            reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
          } else {
            resolve({ stdout, stderr });
          }
        });

        // Handle errors
        proc.on('error', (error) => {
          logger.error('Failed to spawn process:', error);
          reject(error);
        });
      } catch (error) {
        logger.error(`Failed to stream compose command in ${stackDir}:`, error);
        reject(error);
      }
    });
  }

  /**
   * List all stacks
   * @returns {Promise<Array>} Array of stacks
   */
  async listStacks() {
    try {
      // Ensure stacks directory exists
      await fs.ensureDir(this.stacksDir);

      const entries = await fs.readdir(this.stacksDir, { withFileTypes: true });
      const stacks = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const stackDir = path.join(this.stacksDir, entry.name);
          const composeFile = await this.findComposeFile(stackDir);

          // Check if any compose file exists
          if (composeFile) {
            try {
              const compose = await this.getComposeFile(entry.name);
              const containers = await dockerService.getStackContainers(entry.name);
              const runningCount = containers.filter((c) => c.state === 'running').length;

              stacks.push({
                name: entry.name,
                path: stackDir,
                serviceCount: Object.keys(compose.services || {}).length,
                containerCount: containers.length,
                runningCount,
                status: runningCount > 0 ? 'running' : 'stopped',
                created: (await fs.stat(stackDir)).birthtime,
                modified: (await fs.stat(composeFile)).mtime,
              });
            } catch (error) {
              logger.warn(`Failed to process stack ${entry.name}:`, error.message);
            }
          }
        }
      }

      return stacks.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.error('Failed to list stacks:', error);
      throw new Error('Failed to list stacks');
    }
  }

  /**
   * Get stack details
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Stack details
   */
  async getStack(stackName) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      const compose = await this.getComposeFile(stackName);
      const containers = await dockerService.getStackContainers(stackName);
      const envVars = await this.getEnvVars(stackName);
      const metrics = await dockerService.getStackMetrics(stackName);

      return {
        name: stackName,
        path: stackDir,
        compose,
        containers,
        envVars,
        metrics,
        status: metrics.runningCount > 0 ? 'running' : 'stopped',
      };
    } catch (error) {
      logger.error(`Failed to get stack ${stackName}:`, error);
      throw new Error(`Failed to get stack ${stackName}`);
    }
  }

  /**
   * Get docker-compose.yml content
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Parsed compose file
   */
  async getComposeFile(stackName) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);
      const composeFile = await this.findComposeFile(stackDir);

      if (!composeFile) {
        throw new Error('No compose file found (docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml)');
      }

      const content = await fs.readFile(composeFile, 'utf8');
      return yaml.load(content);
    } catch (error) {
      logger.error(`Failed to get compose file for ${stackName}:`, error);
      throw new Error(`Failed to get compose file for ${stackName}`);
    }
  }

  /**
   * Update docker-compose.yml content
   * @param {string} stackName - Stack name
   * @param {string} content - New compose file content
   * @returns {Promise<void>}
   */
  async updateComposeFile(stackName, content) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);
      const composeFile = await this.findComposeFile(stackDir);

      if (!composeFile) {
        throw new Error('No compose file found (docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml)');
      }

      // Write new content (preserve original filename)
      await fs.writeFile(composeFile, content, 'utf8');
      logger.info(`Updated compose file for stack ${stackName}`);
    } catch (error) {
      logger.error(`Failed to update compose file for ${stackName}:`, error);
      throw new Error(`Failed to update compose file: ${error.message}`);
    }
  }

  /**
   * Get environment variables
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Environment variables
   */
  async getEnvVars(stackName) {
    try {
      const envFile = path.join(this.stacksDir, stackName, '.env');

      if (!(await fs.pathExists(envFile))) {
        return {};
      }

      const content = await fs.readFile(envFile, 'utf8');
      const envVars = {};

      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key) {
            envVars[key.trim()] = valueParts.join('=').trim();
          }
        }
      });

      return envVars;
    } catch (error) {
      logger.error(`Failed to get env vars for ${stackName}:`, error);
      throw new Error(`Failed to get env vars for ${stackName}`);
    }
  }

  /**
   * Update environment variables
   * @param {string} stackName - Stack name
   * @param {Object} envVars - Environment variables object
   * @returns {Promise<void>}
   */
  async updateEnvVars(stackName, envVars) {
    try {
      const envFile = path.join(this.stacksDir, stackName, '.env');

      // Convert object to .env format
      const lines = Object.entries(envVars).map(([key, value]) => `${key}=${value}`);
      const content = lines.join('\n') + '\n';

      await fs.writeFile(envFile, content, 'utf8');
      logger.info(`Updated env vars for stack ${stackName}`);
    } catch (error) {
      logger.error(`Failed to update env vars for ${stackName}:`, error);
      throw new Error(`Failed to update env vars for ${stackName}`);
    }
  }

  /**
   * Start a stack
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Command result
   */
  async startStack(stackName) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      const result = await this.executeComposeCommand(stackDir, 'up', ['-d', '--pull', 'missing', '--build']);
      logger.info(`Started stack ${stackName}`);
      return result;
    } catch (error) {
      logger.error(`Failed to start stack ${stackName}:`, error);

      // Extract meaningful error message
      let errorMessage = error.message;

      // If it's a port binding error, extract just the relevant part
      if (errorMessage.includes('address already in use')) {
        const portMatch = errorMessage.match(/0\.0\.0\.0:(\d+)/);
        if (portMatch) {
          errorMessage = `Port ${portMatch[1]} is already in use. Stop the service using this port or change the port mapping.`;
        } else {
          errorMessage = 'A required port is already in use. Check your port mappings.';
        }
      } else if (errorMessage.includes('Command failed')) {
        // Extract the actual docker error from the verbose output
        const dockerErrorMatch = errorMessage.match(/Error response from daemon: (.+?)(\n|$)/);
        if (dockerErrorMatch) {
          errorMessage = dockerErrorMatch[1];
        }
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Stop a stack
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Command result
   */
  async stopStack(stackName) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      const result = await this.executeComposeCommand(stackDir, 'stop');
      logger.info(`Stopped stack ${stackName}`);
      return result;
    } catch (error) {
      logger.error(`Failed to stop stack ${stackName}:`, error);
      throw new Error(`Failed to stop stack ${stackName}: ${error.message}`);
    }
  }

  /**
   * Down a stack (stop and remove containers)
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Command result
   */
  async downStack(stackName) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      const result = await this.executeComposeCommand(stackDir, 'down');
      logger.info(`Downed stack ${stackName}`);
      return result;
    } catch (error) {
      logger.error(`Failed to down stack ${stackName}:`, error);
      throw new Error(`Failed to down stack ${stackName}: ${error.message}`);
    }
  }

  /**
   * Restart a stack
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Command result
   */
  async restartStack(stackName) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      const result = await this.executeComposeCommand(stackDir, 'restart');
      logger.info(`Restarted stack ${stackName}`);
      return result;
    } catch (error) {
      logger.error(`Failed to restart stack ${stackName}:`, error);
      throw new Error(`Failed to restart stack ${stackName}: ${error.message}`);
    }
  }

  /**
   * Pull images for a stack
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Command result
   */
  async pullStack(stackName) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      const result = await this.executeComposeCommand(stackDir, 'pull');
      logger.info(`Pulled images for stack ${stackName}`);
      return result;
    } catch (error) {
      logger.error(`Failed to pull images for stack ${stackName}:`, error);
      throw new Error(`Failed to pull images for stack ${stackName}: ${error.message}`);
    }
  }

  /**
   * Recreate containers in a stack (uses docker compose down then up to properly handle network dependencies)
   * @param {string} stackName - Stack name
   * @param {string} serviceName - Optional specific service to recreate
   * @returns {Promise<Object>} Command result
   */
  async recreateStack(stackName, serviceName = null) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      // Do a full down then up to properly handle network namespace dependencies
      // This ensures containers with network_mode: container:X get new references
      if (serviceName) {
        // For single service, stop and remove just that service, then recreate
        await this.executeComposeCommand(stackDir, 'rm', ['-f', '-s', serviceName]);
        const result = await this.executeComposeCommand(stackDir, 'up', ['-d', serviceName]);
        logger.info(`Recreated service ${serviceName} in stack ${stackName}`);
        return result;
      } else {
        // For full stack, do down then up to ensure clean recreation
        await this.executeComposeCommand(stackDir, 'down');
        const result = await this.executeComposeCommand(stackDir, 'up', ['-d']);
        logger.info(`Recreated stack ${stackName}`);
        return result;
      }
    } catch (error) {
      logger.error(`Failed to recreate stack ${stackName}:`, error);
      throw new Error(`Failed to recreate stack ${stackName}: ${error.message}`);
    }
  }

  /**
   * Create a new stack
   * @param {string} stackName - Stack name
   * @param {string} composeContent - Docker Compose content
   * @param {Object} envVars - Environment variables
   * @returns {Promise<void>}
   */
  async createStack(stackName, composeContent, envVars = {}) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      // Check if stack already exists
      if (await fs.pathExists(stackDir)) {
        throw new Error('Stack already exists');
      }

      // Create stack directory
      await fs.ensureDir(stackDir);

      // Write compose file (using modern naming convention)
      const composeFile = path.join(stackDir, 'compose.yaml');
      await fs.writeFile(composeFile, composeContent, 'utf8');

      // Write env file if variables provided
      if (Object.keys(envVars).length > 0) {
        await this.updateEnvVars(stackName, envVars);
      }

      logger.info(`Created stack ${stackName}`);
    } catch (error) {
      logger.error(`Failed to create stack ${stackName}:`, error);
      // Clean up on failure
      const stackDir = path.join(this.stacksDir, stackName);
      if (await fs.pathExists(stackDir)) {
        await fs.remove(stackDir);
      }
      throw new Error(`Failed to create stack: ${error.message}`);
    }
  }

  /**
   * Delete a stack
   * @param {string} stackName - Stack name
   * @param {boolean} removeVolumes - Whether to remove volumes
   * @returns {Promise<void>}
   */
  async deleteStack(stackName, removeVolumes = false) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      // Stop stack first
      try {
        const args = removeVolumes ? ['-v'] : [];
        await this.executeComposeCommand(stackDir, 'down', args);
      } catch (error) {
        logger.warn(`Failed to stop stack before deletion: ${error.message}`);
      }

      // Remove stack directory
      await fs.remove(stackDir);
      logger.info(`Deleted stack ${stackName}`);
    } catch (error) {
      logger.error(`Failed to delete stack ${stackName}:`, error);
      throw new Error(`Failed to delete stack ${stackName}: ${error.message}`);
    }
  }

  /**
   * Get stack logs
   * @param {string} stackName - Stack name
   * @param {Object} options - Log options
   * @returns {Promise<string>} Stack logs
   */
  async getStackLogs(stackName, options = {}) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      const args = [];
      if (options.tail) args.push('--tail', options.tail);
      if (options.follow) args.push('-f');
      if (options.timestamps) args.push('-t');

      const result = await this.executeComposeCommand(stackDir, 'logs', args);
      return result.stdout;
    } catch (error) {
      logger.error(`Failed to get logs for stack ${stackName}:`, error);
      throw new Error(`Failed to get logs for stack ${stackName}: ${error.message}`);
    }
  }

  /**
   * Validate stack configuration
   * @param {string} stackName - Stack name
   * @returns {Promise<Object>} Validation result
   */
  async validateStack(stackName) {
    try {
      const stackDir = path.join(this.stacksDir, stackName);

      if (!(await fs.pathExists(stackDir))) {
        throw new Error('Stack not found');
      }

      const result = await this.executeComposeCommand(stackDir, 'config', ['--quiet']);
      return { valid: true, message: 'Stack configuration is valid' };
    } catch (error) {
      return { valid: false, message: error.message };
    }
  }

  /**
   * Clone a stack from a Git repository
   * @param {string} repoUrl - Git repository URL
   * @returns {Promise<string>} Stack name
   */
  async cloneFromGit(repoUrl) {
    try {
      // Extract repository name from URL
      const repoName = repoUrl
        .split('/')
        .pop()
        .replace(/\.git$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-');

      // Check if stack already exists
      let stackName = repoName;
      let counter = 1;
      while (await fs.pathExists(path.join(this.stacksDir, stackName))) {
        stackName = `${repoName}-${counter}`;
        counter++;
      }

      const stackDir = path.join(this.stacksDir, stackName);

      // Ensure stacks directory exists
      await fs.ensureDir(this.stacksDir);

      logger.info(`Cloning repository ${repoUrl} to ${stackDir}`);

      // Clone the repository
      const { stdout, stderr } = await execAsync(`git clone "${repoUrl}" "${stackDir}"`, {
        cwd: this.stacksDir,
      });

      if (stderr && !stderr.includes('Cloning')) {
        logger.warn(`Git clone stderr: ${stderr}`);
      }

      // Check if any compose file exists
      const composeFile = await this.findComposeFile(stackDir);

      if (!composeFile) {
        // Clean up - remove the cloned directory
        await fs.remove(stackDir);
        throw new Error('No compose file found in the repository (docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml)');
      }

      logger.info(`Successfully cloned stack ${stackName} from ${repoUrl}`);
      return stackName;
    } catch (error) {
      logger.error(`Failed to clone repository ${repoUrl}:`, error);
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }
}

// Export singleton instance
const stackService = new StackService();
export default stackService;
