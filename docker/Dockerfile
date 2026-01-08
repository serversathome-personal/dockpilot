# Multi-stage build for Docker Management GUI

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci --workspace=frontend

# Copy frontend source
COPY frontend ./frontend

# Build frontend
RUN npm run build:frontend

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm ci --workspace=backend

# Copy backend source
COPY backend ./backend

# Build backend
RUN npm run build:backend

# Stage 3: Production Image
FROM node:20-alpine

# Install Docker CLI, Docker Compose, and su-exec for user switching
RUN apk add --no-cache \
    docker-cli \
    docker-compose \
    curl \
    ca-certificates \
    su-exec \
    shadow

# Create app directory
WORKDIR /app

# Copy root package.json
COPY package*.json ./

# Copy backend package.json
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN npm ci --workspace=backend --omit=dev

# Copy built frontend from frontend-builder
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy built backend from backend-builder
COPY --from=backend-builder /app/backend/dist ./backend/dist

# Create directories for stacks and data
RUN mkdir -p /stacks /data

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    STACKS_DIR=/stacks \
    PUID=0 \
    PGID=0

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]

# Start application
CMD ["node", "backend/src/server.js"]
