# Multi-stage build for DockPilot

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy root package.json and workspace files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm install --workspace=frontend --prefer-offline --no-audit

# Copy frontend source
COPY frontend ./frontend

# Build frontend
RUN npm run build --workspace=frontend

# Stage 2: Production Image
FROM node:20-alpine

# Install Docker CLI, Docker Compose, and utilities
RUN apk add --no-cache \
    docker-cli \
    docker-cli-compose \
    curl \
    ca-certificates \
    procps \
    su-exec

# Create app directory
WORKDIR /app

# Copy root package.json
COPY package*.json ./

# Copy backend package.json
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN npm install --workspace=backend --omit=dev --prefer-offline --no-audit

# Copy built frontend from frontend-builder
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy backend source
COPY backend/src ./backend/src

# Create directories for stacks and data
RUN mkdir -p /stacks /data

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set environment variables
ENV NODE_ENV=production \
    PORT=5000 \
    STACKS_DIR=/stacks

# Expose port (frontend served by backend in production)
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]

# Start application
CMD ["node", "backend/src/server.js"]
