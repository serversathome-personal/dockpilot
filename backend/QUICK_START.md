# Quick Start Guide

## Installation

```bash
cd /project/backend
npm install
```

## Configuration

```bash
cp .env.example .env
```

Edit `.env` as needed (defaults should work for most cases):

```env
PORT=3001
STACKS_DIR=/stacks
CORS_ORIGIN=http://localhost:3000
```

## Running the Server

### Development (with auto-reload)

```bash
npm run dev
```

### Production

```bash
npm start
```

## Testing the API

### Health Check

```bash
curl http://localhost:3001/api/health
```

### List Containers

```bash
curl http://localhost:3001/api/containers
```

### List Stacks

```bash
curl http://localhost:3001/api/stacks
```

### Dashboard Overview

```bash
curl http://localhost:3001/api/dashboard/overview
```

## Testing WebSocket

Use a WebSocket client or this simple test:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws/logs');

ws.onopen = () => {
  // Subscribe to container logs
  ws.send(JSON.stringify({
    type: 'subscribe',
    payload: {
      containerId: 'container_name',
      tail: 100
    }
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

## Common Operations

### Create a Stack

```bash
curl -X POST http://localhost:3001/api/stacks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mystack",
    "composeContent": "version: \"3.8\"\nservices:\n  web:\n    image: nginx:latest",
    "envVars": {}
  }'
```

### Start a Stack

```bash
curl -X POST http://localhost:3001/api/stacks/mystack/start
```

### Stop a Stack

```bash
curl -X POST http://localhost:3001/api/stacks/mystack/stop
```

### Get Stack Details

```bash
curl http://localhost:3001/api/stacks/mystack
```

## Directory Structure

- `src/` - Source code
- `config/data/` - JSON configuration storage
- `logs/` - Application logs (created on first run)

## Troubleshooting

### Docker Connection Issues

Make sure Docker socket is accessible:

```bash
ls -l /var/run/docker.sock
```

### Permission Issues

The user running the backend must have Docker permissions:

```bash
sudo usermod -aG docker $USER
```

### Port Already in Use

Change the PORT in `.env` file:

```env
PORT=3002
```

### Logs Not Working

Check file permissions for logs directory:

```bash
mkdir -p logs
chmod 755 logs
```

## Development Tips

1. **Watch Logs**: `tail -f logs/app.log`
2. **Test Docker Connection**: Check startup logs for Docker version
3. **API Documentation**: Visit `http://localhost:3001/` for endpoint list
4. **WebSocket Testing**: Use browser console or wscat tool

## Next Steps

1. Set up the frontend application
2. Create some test stacks in `/stacks` directory
3. Configure CORS for your frontend URL
4. Set up monitoring and alerting (production)
