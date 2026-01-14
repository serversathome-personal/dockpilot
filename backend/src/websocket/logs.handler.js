import { WebSocketServer } from 'ws';
import dockerService from '../services/docker.service.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';

class LogsWebSocketHandler {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Map of client connections to their subscriptions
    this.streams = new Map(); // Map of container/stack IDs to log streams
  }

  /**
   * Initialize WebSocket server
   * @param {Object} server - HTTP server instance
   */
  initialize(server) {
    // Use noServer mode for proper routing when multiple WebSocket handlers exist
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      logger.info(`WebSocket client connected: ${clientId}`);

      // Initialize client tracking
      this.clients.set(ws, {
        id: clientId,
        subscriptions: new Set(),
        alive: true,
      });

      // Set up ping/pong for connection health check
      ws.on('pong', () => {
        const client = this.clients.get(ws);
        if (client) {
          client.alive = true;
        }
      });

      // Handle incoming messages
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleMessage(ws, data);
        } catch (error) {
          logger.error('Failed to process WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info(`WebSocket client disconnected: ${clientId}`);
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
      });

      // Send welcome message
      this.send(ws, {
        type: 'connected',
        message: 'Connected to logs WebSocket',
        clientId,
      });
    });

    // Set up heartbeat interval
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const client = this.clients.get(ws);
        if (!client) return;

        if (!client.alive) {
          logger.warn(`Terminating inactive client: ${client.id}`);
          ws.terminate();
          return;
        }

        client.alive = false;
        ws.ping();
      });
    }, config.websocket.heartbeatInterval);

    logger.info('Logs WebSocket handler initialized');
  }

  /**
   * Handle WebSocket upgrade for this handler
   * @param {Object} request - HTTP request
   * @param {Object} socket - Network socket
   * @param {Buffer} head - First packet of upgraded stream
   */
  handleUpgrade(request, socket, head) {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} data - Message data
   */
  async handleMessage(ws, data) {
    const { type, payload } = data;

    switch (type) {
      case 'subscribe':
        await this.handleSubscribe(ws, payload);
        break;

      case 'unsubscribe':
        await this.handleUnsubscribe(ws, payload);
        break;

      case 'ping':
        this.send(ws, { type: 'pong' });
        break;

      default:
        this.sendError(ws, `Unknown message type: ${type}`);
    }
  }

  /**
   * Handle subscribe request
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} payload - Subscription payload
   */
  async handleSubscribe(ws, payload) {
    const { containerId, tail = 100 } = payload;

    if (!containerId) {
      this.sendError(ws, 'Container ID is required');
      return;
    }

    const client = this.clients.get(ws);
    if (!client) return;

    // Check if already subscribed
    if (client.subscriptions.has(containerId)) {
      this.send(ws, {
        type: 'info',
        message: `Already subscribed to container ${containerId}`,
      });
      return;
    }

    try {
      // Start streaming logs
      const stream = await dockerService.streamLogs(containerId, {
        follow: true,
        tail,
        timestamps: true,
      });

      // Store stream reference
      this.streams.set(containerId, stream);
      client.subscriptions.add(containerId);

      // Handle log data
      stream.on('data', (chunk) => {
        const { text, stream: streamType } = this.parseLogChunk(chunk);
        this.send(ws, {
          type: 'log',
          containerId,
          data: text,
          stream: streamType,
        });
      });

      // Handle stream end
      stream.on('end', () => {
        logger.info(`Log stream ended for container ${containerId}`);
        this.send(ws, {
          type: 'stream_end',
          containerId,
        });
        this.cleanupStream(containerId, ws);
      });

      // Handle stream error
      stream.on('error', (error) => {
        logger.error(`Log stream error for container ${containerId}:`, error);
        this.sendError(ws, `Stream error: ${error.message}`, containerId);
        this.cleanupStream(containerId, ws);
      });

      // Confirm subscription
      this.send(ws, {
        type: 'subscribed',
        containerId,
        message: `Subscribed to logs for container ${containerId}`,
      });

      logger.info(`Client ${client.id} subscribed to container ${containerId}`);
    } catch (error) {
      logger.error(`Failed to subscribe to container ${containerId}:`, error);
      this.sendError(ws, `Failed to subscribe: ${error.message}`, containerId);
    }
  }

  /**
   * Handle unsubscribe request
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} payload - Unsubscribe payload
   */
  async handleUnsubscribe(ws, payload) {
    const { containerId } = payload;

    if (!containerId) {
      this.sendError(ws, 'Container ID is required');
      return;
    }

    const client = this.clients.get(ws);
    if (!client) return;

    if (!client.subscriptions.has(containerId)) {
      this.send(ws, {
        type: 'info',
        message: `Not subscribed to container ${containerId}`,
      });
      return;
    }

    this.cleanupStream(containerId, ws);

    this.send(ws, {
      type: 'unsubscribed',
      containerId,
      message: `Unsubscribed from logs for container ${containerId}`,
    });

    logger.info(`Client ${client.id} unsubscribed from container ${containerId}`);
  }

  /**
   * Handle client disconnect
   * @param {WebSocket} ws - WebSocket connection
   */
  handleDisconnect(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    // Clean up all subscriptions
    client.subscriptions.forEach((containerId) => {
      this.cleanupStream(containerId, ws);
    });

    this.clients.delete(ws);
  }

  /**
   * Clean up stream for a container
   * @param {string} containerId - Container ID
   * @param {WebSocket} ws - WebSocket connection
   */
  cleanupStream(containerId, ws) {
    const client = this.clients.get(ws);
    if (client) {
      client.subscriptions.delete(containerId);
    }

    const stream = this.streams.get(containerId);
    if (stream) {
      try {
        stream.destroy();
      } catch (error) {
        logger.warn(`Error destroying stream for ${containerId}:`, error);
      }
      this.streams.delete(containerId);
    }
  }

  /**
   * Parse log chunk from Docker stream
   * @param {Buffer} chunk - Log chunk
   * @returns {Object} Parsed log with text and stream type
   */
  parseLogChunk(chunk) {
    // Docker multiplexes stdout and stderr into a single stream
    // Format: [8 bytes header][payload]
    // Header: [stream type (1 byte)][3 bytes padding][size (4 bytes)]

    if (chunk.length < 8) {
      return { text: chunk.toString('utf8'), stream: 'stdout' };
    }

    try {
      const header = chunk.slice(0, 8);
      const streamType = header[0]; // 0 = stdin, 1 = stdout, 2 = stderr
      const size = header.readUInt32BE(4);
      const payload = chunk.slice(8, 8 + size);

      const streamName = streamType === 2 ? 'stderr' : 'stdout';
      return { text: payload.toString('utf8'), stream: streamName };
    } catch (error) {
      // If parsing fails, return raw string
      return { text: chunk.toString('utf8'), stream: 'stdout' };
    }
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
   * @param {string} containerId - Optional container ID
   */
  sendError(ws, message, containerId = null) {
    this.send(ws, {
      type: 'error',
      message,
      ...(containerId && { containerId }),
    });
  }

  /**
   * Generate unique client ID
   * @returns {string} Client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Broadcast message to all clients
   * @param {Object} data - Data to broadcast
   */
  broadcast(data) {
    this.wss.clients.forEach((ws) => {
      this.send(ws, data);
    });
  }

  /**
   * Close WebSocket server
   */
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all streams
    this.streams.forEach((stream, containerId) => {
      try {
        stream.destroy();
      } catch (error) {
        logger.warn(`Error destroying stream for ${containerId}:`, error);
      }
    });
    this.streams.clear();

    // Close all client connections
    this.wss.clients.forEach((ws) => {
      ws.close();
    });

    this.wss.close(() => {
      logger.info('WebSocket server closed');
    });
  }
}

// Export singleton instance
const logsWebSocketHandler = new LogsWebSocketHandler();
export default logsWebSocketHandler;
