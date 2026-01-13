import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';
import config from '../config/env.js';

// Ensure log directory exists
const logDir = path.dirname(config.logging.file);
fs.ensureDirSync(logDir);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'docker-manager' },
  transports: [
    // Write all logs to file
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write errors to separate file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Always add console transport for docker logs visibility
logger.add(
  new winston.transports.Console({
    format: consoleFormat,
  })
);

// Create a stream object for Morgan or other integrations
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

export default logger;
