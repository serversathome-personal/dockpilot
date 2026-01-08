# DockPilot

<p align="center">
  <img src="dockpilot.png" alt="DockPilot Logo" width="200"/>
</p>

> ⚠️ **DISCLAIMER:** This project is 100% vibe-coded. I only partially know what I'm doing, and that's okay! Built with enthusiasm, AI assistance, and a lot of trial and error. Use at your own risk (but also, have fun with it). 🚀

**DockPilot** is a modern Docker management UI that combines Dockge's file-based architecture with Portainer's comprehensive feature set. Built with React and Node.js, it provides an intuitive web interface for managing Docker containers, stacks, images, networks, and volumes.

## ✨ Features

### 📊 Dashboard
- Real-time host system metrics (CPU, memory, disk usage)
- Docker resource overview (containers, stacks, images, networks, volumes)
- 30-minute usage history charts
- Quick navigation to all resources

### 📦 Stack Management
- File-based stack storage (Dockge architecture)
- Docker Compose support with inline editing
- Real-time streaming output for all operations
- Environment variable management
- Clone from Git repositories
- Convert Docker run commands to compose files
- Aggregate logs from all stack containers

### 🐳 Container Management
- View all containers (running and stopped)
- Start, stop, restart, pause/unpause, remove
- Update container images with streaming output
- Real-time logs with auto-refresh
- Resource usage statistics
- Port mapping with clickable links

### 🖼️ Image Management
- List all Docker images
- Pull latest images
- Remove unused images
- Prune dangling images
- Size and tag information

### 🔌 Network Management
- View all Docker networks
- Create and remove networks
- See connected containers
- IPv4 and IPv6 support

### 💾 Volume Management
- List all volumes
- Remove unused volumes
- Mount point information

### 🔄 Update Management
- Check for image updates
- Schedule automatic updates
- Update history tracking
- Selective image updates

### 🎨 Modern UI
- Dark theme with smoked glass effects
- Responsive design
- Real-time streaming for long operations
- Auto-scrolling logs
- Sortable tables

## 🚀 Quick Start

### Using Docker Compose (Recommended)

1. Create a `docker-compose.yml` file:

```yaml
services:
  dockpilot:
    image: serversathome/dockpilot:latest
    container_name: dockpilot
    restart: unless-stopped
    ports:
      - "5000:5000"    # Web UI and API (frontend served by backend)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro  # Docker socket (read-only)
      - ./stacks:/stacks                              # Stack storage
      - ./data:/app/backend/config/data               # Application data
    environment:
      - NODE_ENV=production
      - PORT=5000
      - STACKS_DIR=/stacks
```

2. Start DockPilot:

```bash
docker-compose up -d
```

3. Access the UI at `http://localhost:5000`

### Docker Run

```bash
docker run -d \
  --name dockpilot \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v $(pwd)/stacks:/stacks \
  -v $(pwd)/data:/app/backend/config/data \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e STACKS_DIR=/stacks \
  serversathome/dockpilot:latest
```

## 📁 Directory Structure

```
/stacks/          # Docker Compose stacks (one folder per stack)
  /stack-name/
    docker-compose.yml
    .env
/data/            # Application configuration and data
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `5000` | Server port (serves both API and frontend in production) |
| `STACKS_DIR` | `/stacks` | Stack storage directory |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket path |

## 🏗️ Architecture

### File-Based Stacks (Dockge-style)
- Each stack is a folder in `/stacks/`
- Folder name = stack name
- Contains `docker-compose.yml` and optional `.env`
- All stacks are readable/manageable regardless of creation method
- Supports external interoperability

### Backend
- Node.js + Express
- Docker API integration
- Server-Sent Events for streaming
- File-based configuration storage

### Frontend
- React + Vite
- Tailwind CSS with custom glass theme
- Zustand for state management
- Real-time updates via SSE

## 🔐 Security Notes

- Docker socket is mounted read-only by default
- No built-in authentication (use reverse proxy for production)
- Consider using Docker socket proxy for enhanced security
- Runs as root inside container (required for Docker access)

## 🛠️ Development

### Prerequisites
- Node.js 18+
- Docker
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone https://github.com/serversathome/dockpilot.git
cd dockpilot
```

2. Install dependencies:
```bash
npm install
```

3. Start development servers:
```bash
npm run dev
```

This starts:
- Backend API on `http://localhost:5000`
- Frontend UI on `http://localhost:3000`

### Project Structure

```
dockpilot/
├── backend/           # Node.js API server
│   ├── src/
│   │   ├── api/      # REST API routes
│   │   ├── services/ # Business logic
│   │   ├── middleware/
│   │   └── websocket/
│   └── package.json
├── frontend/          # React UI
│   ├── src/
│   │   ├── components/
│   │   ├── api/      # API client
│   │   ├── store/    # Zustand stores
│   │   └── utils/
│   └── package.json
├── docker/           # Docker build files
│   ├── Dockerfile
│   └── entrypoint.sh
└── stacks/           # Stack storage
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Inspired by [Dockge](https://github.com/louislam/dockge) for file-based architecture
- UI design inspired by [Portainer](https://github.com/portainer/portainer)

## 👥 Contributors

- **[serversathome](https://github.com/serversathome)** - Project creator and vibe engineer
- **Claude (Anthropic)** - AI pair programmer and code companion via [Claude Code](https://claude.com/claude-code)

## 📸 Screenshots

### Dashboard
![Dashboard](screenshots/dashboard.png)

### Stack Management
![Stacks](screenshots/stacks.png)

### Container Management
![Containers](screenshots/containers.png)

## 🐛 Known Issues

- None currently

## 🗺️ Roadmap

- [ ] Multi-host support
- [ ] User authentication
- [ ] RBAC support
- [ ] Backup/restore functionality
- [ ] Template marketplace
- [ ] Webhook notifications

## 📞 Support

- GitHub Issues: [Report a bug](https://github.com/serversathome/dockpilot/issues)
- Discussions: [Ask a question](https://github.com/serversathome/dockpilot/discussions)

---

Made with ❤️ by [serversathome](https://github.com/serversathome)
