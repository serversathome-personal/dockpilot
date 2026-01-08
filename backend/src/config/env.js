import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  // Server Configuration
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Docker Configuration
  docker: {
    socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    host: process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',
  },

  // Stacks Configuration
  stacks: {
    directory: process.env.STACKS_DIR || '/stacks',
  },

  // Storage Configuration
  storage: {
    dataDir: process.env.DATA_DIR || path.join(__dirname, '../../config/data'),
  },

  // CORS Configuration
  cors: {
    origin: process.env.NODE_ENV === 'development'
      ? true  // Allow all origins in development
      : (process.env.CORS_ORIGIN || 'http://localhost:3000'),
    credentials: true,
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || path.join(__dirname, '../../logs/app.log'),
  },

  // WebSocket Configuration
  websocket: {
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
  },
};

export default config;
