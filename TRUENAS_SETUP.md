# DockPilot on TrueNAS Setup Guide

This guide will help you deploy DockPilot on TrueNAS SCALE with proper permissions.

## Prerequisites

- TrueNAS SCALE with Docker/Apps support
- SSH access to your TrueNAS system
- A dataset for storing Docker compose stacks

## Step 1: Create a Dataset for Stacks

1. In TrueNAS web UI, go to **Storage** → **Pools**
2. Create a new dataset (e.g., `docker/dockpilot-stacks`)
3. Note the full path (e.g., `/mnt/tank/docker/dockpilot-stacks`)

## Step 2: Find Your Dataset's UID and GID

SSH into your TrueNAS system and run:

```bash
ls -ln /mnt/tank/docker/dockpilot-stacks
```

You'll see output like:
```
drwxrwxr-x 2 568 568 4 Jan 4 15:30 /mnt/tank/docker/dockpilot-stacks
```

In this example:
- **PUID** = `568`
- **PGID** = `568`

Note these numbers - you'll need them for the Docker configuration.

## Step 3: Create docker-compose.yml

Create a `docker-compose.yml` file with the following content:

```yaml
version: '3.8'

services:
  dockpilot:
    image: dockpilot:latest
    container_name: dockpilot
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /mnt/tank/docker/dockpilot-stacks:/stacks
      - dockpilot-data:/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - STACKS_DIR=/stacks
      # IMPORTANT: Replace with your actual UID/GID from Step 2
      - PUID=568
      - PGID=568
    networks:
      - dockpilot-network

networks:
  dockpilot-network:
    driver: bridge

volumes:
  dockpilot-data:
    driver: local
```

## Step 4: Deploy DockPilot

### Option A: Using TrueNAS Apps (Recommended)

1. Go to **Apps** in TrueNAS web UI
2. Click **Launch Docker Image**
3. Configure:
   - **Image Repository**: `dockpilot`
   - **Image Tag**: `latest`
   - **Container Name**: `dockpilot`
   - **Port Forwarding**: `3000:3000`

4. Add **Host Path Volumes**:
   - Host Path: `/var/run/docker.sock` → Container Path: `/var/run/docker.sock` (Read Only)
   - Host Path: `/mnt/tank/docker/dockpilot-stacks` → Container Path: `/stacks`

5. Add **Environment Variables**:
   - `PUID` = Your UID from Step 2
   - `PGID` = Your GID from Step 2
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
   - `STACKS_DIR` = `/stacks`

### Option B: Using Docker CLI

```bash
docker run -d \
  --name dockpilot \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /mnt/tank/docker/dockpilot-stacks:/stacks \
  -e PUID=568 \
  -e PGID=568 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e STACKS_DIR=/stacks \
  dockpilot:latest
```

### Option C: Using Docker Compose

```bash
cd /path/to/docker-compose.yml
docker-compose up -d
```

## Step 5: Access DockPilot

Open your browser and navigate to:
```
http://YOUR_TRUENAS_IP:3000
```

## Troubleshooting

### Permission Denied Errors

If you see permission errors when accessing stacks:

1. **Check container logs**:
   ```bash
   docker logs dockpilot
   ```
   Look for the line showing UID/GID it's using.

2. **Verify dataset permissions**:
   ```bash
   ls -ln /mnt/tank/docker/dockpilot-stacks
   ```
   The UID/GID should match what you set in PUID/PGID.

3. **Manually fix permissions** (if needed):
   ```bash
   chown -R 568:568 /mnt/tank/docker/dockpilot-stacks
   chmod -R 775 /mnt/tank/docker/dockpilot-stacks
   ```

### Cannot Connect to Docker Socket

If DockPilot can't connect to Docker:

1. Verify Docker socket exists:
   ```bash
   ls -la /var/run/docker.sock
   ```

2. Check socket permissions:
   ```bash
   # The socket should be in the 'docker' group
   ls -la /var/run/docker.sock
   # Output: srw-rw---- 1 root docker ... /var/run/docker.sock
   ```

3. Add your user to docker group (if running as non-root):
   ```bash
   # On TrueNAS, this is usually not needed as we mount the socket as read-only
   ```

### Stack Operations Fail

If creating/modifying stacks fails:

1. **Check write permissions**:
   ```bash
   # SSH into TrueNAS
   touch /mnt/tank/docker/dockpilot-stacks/test.txt
   ```
   If this fails, your dataset permissions are incorrect.

2. **Verify PUID/PGID are correct**:
   ```bash
   docker exec dockpilot id
   # Should show: uid=568(dockpilot) gid=568(dockpilot)
   ```

3. **Check container logs**:
   ```bash
   docker logs dockpilot --tail 50
   ```

## Advanced Configuration

### Using a Custom Dataset User

If you want to use a specific TrueNAS user:

1. Create a user in TrueNAS (e.g., `dockpilot-user`)
2. Find the UID/GID:
   ```bash
   id dockpilot-user
   ```
3. Set dataset permissions:
   ```bash
   chown -R dockpilot-user:dockpilot-user /mnt/tank/docker/dockpilot-stacks
   ```
4. Use that UID/GID in your Docker configuration

### Using Multiple Datasets

You can mount additional datasets:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
  - /mnt/tank/docker/dockpilot-stacks:/stacks
  - /mnt/tank/appdata/dockpilot:/data
  - /mnt/tank/docker/configs:/configs  # Optional: shared configs
```

## Best Practices

1. **Use a dedicated dataset** for DockPilot stacks
2. **Set appropriate permissions** (775 or 755) on the stacks directory
3. **Regular backups** of your stacks dataset
4. **Monitor disk usage** - Docker images can grow large
5. **Use bind mounts** for production data in your stacks

## Example TrueNAS Dataset Structure

```
/mnt/tank/docker/
├── dockpilot-stacks/          # PUID/PGID owned
│   ├── nextcloud/
│   │   ├── docker-compose.yml
│   │   └── .env
│   ├── plex/
│   │   └── docker-compose.yml
│   └── nginx/
│       └── docker-compose.yml
└── appdata/                    # Optional: Application data
    └── dockpilot/
        ├── config/
        └── logs/
```

## Support

For issues specific to TrueNAS, check:
- TrueNAS Forums: https://forums.truenas.com
- DockPilot GitHub Issues: (your repo)

For general Docker permission issues:
- Ensure PUID/PGID match your dataset owner
- Verify Docker socket is accessible
- Check TrueNAS system logs for permission denials
