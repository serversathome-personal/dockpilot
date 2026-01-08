# Docker Management GUI

A modern, web-based graphical user interface for managing Docker containers and stacks. Built with React, TypeScript, and Node.js, this application provides an intuitive alternative to Portainer for Docker management.

## Features

- **Container Management**
  - View, start, stop, restart, and remove containers
  - Real-time container logs with search and filtering
  - Container statistics and resource usage monitoring
  - Execute commands in running containers

- **Stack Management**
  - Deploy and manage Docker Compose stacks
  - Upload, edit, and validate docker-compose.yml files
  - Start, stop, and remove entire stacks
  - Environment variable management

- **Image Management**
  - List and remove Docker images
  - Pull images from registries
  - View image details and layers

- **System Information**
  - Docker system information and version
  - Resource usage overview
  - Disk space monitoring

- **Modern UI**
  - Clean, responsive interface built with React and Tailwind CSS
  - Real-time updates using Server-Sent Events
  - Dark mode support

## Quick Start

### Using Docker Compose (Recommended)

1. Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  docker-management-gui:
    image: yourusername/docker-management-gui:latest
    container_name: docker-management-gui
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./stacks:/stacks
      - docker-gui-data:/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - STACKS_DIR=/stacks

volumes:
  docker-gui-data:
```

2. Start the application:

```bash
docker-compose up -d
```

3. Access the GUI at `http://localhost:3000`

### Using Docker Run

```bash
docker run -d \
  --name docker-management-gui \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v $(pwd)/stacks:/stacks \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e STACKS_DIR=/stacks \
  yourusername/docker-management-gui:latest
```

## Development Setup

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher
- Docker and Docker Compose

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/docker-management-gui.git
cd docker-management-gui
```

2. Install dependencies:

```bash
npm install
```

3. Start development servers:

```bash
npm run dev
```

This will start both the backend (port 3000) and frontend (port 5173) in development mode with hot reload.

### Alternative: Development with Docker

```bash
npm run docker:dev
```

This uses Docker Compose to run the development environment in containers.

### Building

Build both frontend and backend:

```bash
npm run build
```

Build Docker image:

```bash
npm run docker:build
```

## Environment Variables

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | Server port | `3000` |
| `STACKS_DIR` | Directory for storing stacks | `/stacks` |
| `DOCKER_HOST` | Docker daemon socket | `unix:///var/run/docker.sock` |
| `AUTH_ENABLED` | Enable authentication | `false` |
| `JWT_SECRET` | Secret key for JWT tokens | - |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3000` |

## Project Structure

```
docker-management-gui/
├── backend/                 # Backend Node.js application
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Express middleware
│   │   └── index.ts        # Entry point
│   └── package.json
├── frontend/               # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API services
│   │   └── App.tsx         # Root component
│   └── package.json
├── docker/                 # Docker configuration
│   ├── Dockerfile          # Production Dockerfile
│   └── docker-compose.dev.yml  # Development compose
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
├── docker-compose.yml      # Production deployment
└── package.json            # Root workspace config
```

## Security Considerations

- The application requires access to the Docker socket (`/var/run/docker.sock`), which grants full control over Docker
- It's recommended to run this application in a trusted environment only
- Consider enabling authentication for production deployments
- Use read-only mount for Docker socket when possible (`:ro`)
- Regularly update dependencies to patch security vulnerabilities

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by Portainer and other Docker management tools
- Built with modern web technologies and best practices
- Community feedback and contributions

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/yourusername/docker-management-gui).
