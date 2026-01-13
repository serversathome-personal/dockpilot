import { WebSocketServer } from 'ws';
import Docker from 'dockerode';
import logger from '../utils/logger.js';
import config from '../config/env.js';

class ShellWebSocketHandler {
  constructor() {
    this.wss = null;
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.sessions = new Map(); // Map of ws to exec sessions
  }

  /**
   * Initialize WebSocket server for shell
   * @param {Object} server - HTTP server instance
   */
  initialize(server) {
    this.wss = new WebSocketServer({ server, path: '/ws/shell' });

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      logger.info(`Shell WebSocket client connected: ${clientId}`);

      // Store session info
      this.sessions.set(ws, {
        id: clientId,
        exec: null,
        stream: null,
        alive: true,
      });

      // Set up ping/pong for connection health check
      ws.on('pong', () => {
        const session = this.sessions.get(ws);
        if (session) {
          session.alive = true;
        }
      });

      // Handle incoming messages
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleMessage(ws, data);
        } catch (error) {
          // If not JSON, treat as raw input for the shell
          const session = this.sessions.get(ws);
          if (session && session.stream) {
            session.stream.write(message);
          }
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info(`Shell WebSocket client disconnected: ${clientId}`);
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error(`Shell WebSocket error for client ${clientId}:`, error);
      });

      // Send welcome message
      this.send(ws, {
        type: 'connected',
        message: 'Connected to shell WebSocket',
        clientId,
      });
    });

    // Set up heartbeat interval
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const session = this.sessions.get(ws);
        if (!session) return;

        if (!session.alive) {
          logger.warn(`Terminating inactive shell client: ${session.id}`);
          ws.terminate();
          return;
        }

        session.alive = false;
        ws.ping();
      });
    }, config.websocket.heartbeatInterval);

    logger.info('Shell WebSocket server initialized on /ws/shell');
  }

  /**
   * Handle incoming WebSocket messages
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} data - Message data
   */
  async handleMessage(ws, data) {
    const { type, payload } = data;

    switch (type) {
      case 'start':
        await this.handleStart(ws, payload);
        break;

      case 'input':
        await this.handleInput(ws, payload);
        break;

      case 'resize':
        await this.handleResize(ws, payload);
        break;

      case 'ping':
        this.send(ws, { type: 'pong' });
        break;

      default:
        // Treat unknown messages as shell input
        if (data.data) {
          await this.handleInput(ws, { data: data.data });
        }
    }
  }

  /**
   * Start a shell session in a container
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} payload - Start payload
   */
  async handleStart(ws, payload) {
    const { containerId, cols = 80, rows = 24 } = payload;

    if (!containerId) {
      this.sendError(ws, 'Container ID is required');
      return;
    }

    const session = this.sessions.get(ws);
    if (!session) return;

    // Clean up any existing session
    if (session.stream) {
      session.stream.end();
    }

    try {
      const container = this.docker.getContainer(containerId);

      // Check if container is running
      const info = await container.inspect();
      if (!info.State.Running) {
        this.sendError(ws, 'Container is not running');
        return;
      }

      // Determine which shell to use
      const shell = await this.detectShell(container);

      // Create exec instance
      const exec = await container.exec({
        Cmd: [shell],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: [
          'TERM=xterm-256color',
          'COLORTERM=truecolor',
          `COLUMNS=${cols}`,
          `LINES=${rows}`,
        ],
      });

      // Start exec and get stream
      const stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true,
      });

      // Store session info
      session.exec = exec;
      session.stream = stream;
      session.containerId = containerId;

      // Handle output from container
      stream.on('data', (chunk) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(chunk);
        }
      });

      // Handle stream end
      stream.on('end', () => {
        logger.info(`Shell stream ended for container ${containerId}`);
        this.send(ws, { type: 'exit', message: 'Shell session ended' });
        this.cleanupSession(ws);
      });

      // Handle stream error
      stream.on('error', (error) => {
        logger.error(`Shell stream error for container ${containerId}:`, error);
        this.sendError(ws, `Stream error: ${error.message}`);
        this.cleanupSession(ws);
      });

      // Set initial terminal size
      await this.resizeExec(exec, cols, rows);

      // Confirm session started
      this.send(ws, {
        type: 'started',
        containerId,
        shell,
        message: `Shell session started with ${shell}`,
      });

      logger.info(`Shell session started for container ${containerId} using ${shell}`);
    } catch (error) {
      logger.error(`Failed to start shell for container ${containerId}:`, error);
      this.sendError(ws, `Failed to start shell: ${error.message}`);
    }
  }

  /**
   * Detect available shell in container
   * @param {Object} container - Docker container
   * @returns {string} Shell command
   */
  async detectShell(container) {
    // Try common shells in order of preference
    const shells = ['/bin/bash', '/bin/sh', '/bin/ash', 'sh'];

    for (const shell of shells) {
      try {
        const exec = await container.exec({
          Cmd: ['which', shell.replace('/bin/', '')],
          AttachStdout: true,
          AttachStderr: true,
        });

        const stream = await exec.start({ hijack: true });

        // Wait for the command to complete
        await new Promise((resolve) => {
          stream.on('end', resolve);
          stream.on('error', resolve);
          setTimeout(resolve, 1000);
        });

        const info = await exec.inspect();
        if (info.ExitCode === 0) {
          return shell;
        }
      } catch (e) {
        // Shell not found, try next
      }
    }

    // Default to sh
    return 'sh';
  }

  /**
   * Handle input from client
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} payload - Input payload
   */
  async handleInput(ws, payload) {
    const session = this.sessions.get(ws);
    if (!session || !session.stream) {
      return;
    }

    const { data } = payload;
    if (data) {
      session.stream.write(data);
    }
  }

  /**
   * Handle terminal resize
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} payload - Resize payload
   */
  async handleResize(ws, payload) {
    const session = this.sessions.get(ws);
    if (!session || !session.exec) {
      return;
    }

    const { cols, rows } = payload;
    await this.resizeExec(session.exec, cols, rows);
  }

  /**
   * Resize exec TTY
   * @param {Object} exec - Docker exec instance
   * @param {number} cols - Number of columns
   * @param {number} rows - Number of rows
   */
  async resizeExec(exec, cols, rows) {
    try {
      await exec.resize({ h: rows, w: cols });
    } catch (error) {
      // Resize might fail if exec already ended
      logger.debug(`Failed to resize exec: ${error.message}`);
    }
  }

  /**
   * Handle client disconnect
   * @param {WebSocket} ws - WebSocket connection
   */
  handleDisconnect(ws) {
    this.cleanupSession(ws);
    this.sessions.delete(ws);
  }

  /**
   * Clean up session resources
   * @param {WebSocket} ws - WebSocket connection
   */
  cleanupSession(ws) {
    const session = this.sessions.get(ws);
    if (!session) return;

    if (session.stream) {
      try {
        session.stream.end();
      } catch (error) {
        logger.debug(`Error ending stream: ${error.message}`);
      }
    }

    session.exec = null;
    session.stream = null;
  }

  /**
   * Send message to client
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} data - Data to send
   */
  send(ws, data) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Send error message to client
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} message - Error message
   */
  sendError(ws, message) {
    this.send(ws, {
      type: 'error',
      message,
    });
  }

  /**
   * Generate unique client ID
   * @returns {string} Client ID
   */
  generateClientId() {
    return `shell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close WebSocket server
   */
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Clean up all sessions
    this.sessions.forEach((session, ws) => {
      this.cleanupSession(ws);
    });
    this.sessions.clear();

    // Close all client connections
    this.wss.clients.forEach((ws) => {
      ws.close();
    });

    this.wss.close(() => {
      logger.info('Shell WebSocket server closed');
    });
  }
}

// Export singleton instance
const shellWebSocketHandler = new ShellWebSocketHandler();
export default shellWebSocketHandler;
