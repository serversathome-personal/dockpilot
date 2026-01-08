# Docker Manager Backend

Backend API server for the Docker Management GUI application.

## Features

- RESTful API for Docker operations
- WebSocket support for live log streaming
- Docker Compose stack management
- Real-time container statistics
- Configuration storage
- Comprehensive error handling and validation

## Prerequisites

- Node.js 18+ (with ES modules support)
- Docker Engine
- Docker Compose V2

## Installation

```bash
npm install
```

## Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` and configure as needed:

```env
PORT=3001
NODE_ENV=development
DOCKER_SOCKET=/var/run/docker.sock
STACKS_DIR=/stacks
CORS_ORIGIN=http://localhost:3000
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

## API Endpoints

### Health Check

- `GET /api/health` - API health check

### Dashboard

- `GET /api/dashboard/overview` - Dashboard overview data
- `GET /api/dashboard/stats` - Real-time system statistics

### Stacks

- `GET /api/stacks` - List all stacks
- `GET /api/stacks/:name` - Get stack details
- `POST /api/stacks` - Create new stack
- `DELETE /api/stacks/:name` - Delete stack
- `GET /api/stacks/:name/compose` - Get docker-compose.yml
- `PUT /api/stacks/:name/compose` - Update docker-compose.yml
- `GET /api/stacks/:name/env` - Get environment variables
- `PUT /api/stacks/:name/env` - Update environment variables
- `POST /api/stacks/:name/start` - Start stack
- `POST /api/stacks/:name/stop` - Stop stack
- `POST /api/stacks/:name/restart` - Restart stack
- `POST /api/stacks/:name/pull` - Pull stack images
- `GET /api/stacks/:name/logs` - Get stack logs
- `GET /api/stacks/:name/validate` - Validate stack configuration

### Containers

- `GET /api/containers` - List all containers
- `GET /api/containers/:id` - Get container details
- `GET /api/containers/:id/stats` - Get container statistics
- `GET /api/containers/:id/logs` - Get container logs
- `POST /api/containers/:id/start` - Start container
- `POST /api/containers/:id/stop` - Stop container
- `POST /api/containers/:id/restart` - Restart container
- `DELETE /api/containers/:id` - Remove container

### Images

- `GET /api/images` - List all images
- `DELETE /api/images/:id` - Remove image

### Networks

- `GET /api/networks` - List all networks
- `DELETE /api/networks/:id` - Remove network

### Volumes

- `GET /api/volumes` - List all volumes
- `DELETE /api/volumes/:name` - Remove volume

## WebSocket

### Log Streaming

Connect to `ws://localhost:3001/ws/logs` for live log streaming.

#### Message Format

**Subscribe to container logs:**

```json
{
  "type": "subscribe",
  "payload": {
    "containerId": "container_name_or_id",
    "tail": 100
  }
}
```

**Unsubscribe from container logs:**

```json
{
  "type": "unsubscribe",
  "payload": {
    "containerId": "container_name_or_id"
  }
}
```

**Receive log data:**

```json
{
  "type": "log",
  "containerId": "container_name_or_id",
  "data": "log line content"
}
```

## Project Structure

```
backend/
├── src/
│   ├── api/
│   │   ├── routes/           # API route handlers
│   │   └── index.js          # Route aggregator
│   ├── config/
│   │   └── env.js            # Environment configuration
│   ├── middleware/
│   │   ├── error.middleware.js      # Error handling
│   │   └── validation.middleware.js # Request validation
│   ├── services/
│   │   ├── docker.service.js        # Docker operations
│   │   └── stack.service.js         # Stack management
│   ├── storage/
│   │   └── config.store.js          # Configuration storage
│   ├── utils/
│   │   └── logger.js                # Winston logger
│   ├── websocket/
│   │   └── logs.handler.js          # WebSocket log streaming
│   └── server.js                    # Express server
├── config/
│   └── data/                         # JSON storage
├── logs/                             # Application logs
├── .env.example                      # Example environment variables
├── .gitignore
├── package.json
└── README.md
```

## Error Handling

All API responses follow a consistent format:

**Success:**

```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "message": "Error message",
    "details": { ... }
  }
}
```

## Logging

Logs are written to:

- `logs/app.log` - All logs
- `logs/error.log` - Error logs only
- Console (development only)

## License

MIT
