#!/bin/sh
set -e

# Default to root if not specified
PUID=${PUID:-0}
PGID=${PGID:-0}

echo "Starting DockPilot with UID: $PUID, GID: $PGID"

# If PUID is 0, always run as root (can't create a user with UID 0)
if [ "$PUID" -eq 0 ]; then
    echo "Running as root user (PUID=0)"
    exec "$@"
fi

# Create group if it doesn't exist
if ! getent group dockpilot >/dev/null 2>&1; then
    echo "Creating group 'dockpilot' with GID: $PGID"
    addgroup -g "$PGID" dockpilot
fi

# Create user if it doesn't exist
if ! getent passwd dockpilot >/dev/null 2>&1; then
    echo "Creating user 'dockpilot' with UID: $PUID"
    adduser -D -u "$PUID" -G dockpilot dockpilot
fi

# Change ownership of application directories to the specified user
echo "Setting ownership of /stacks to $PUID:$PGID"
chown -R "$PUID:$PGID" /stacks || echo "Warning: Could not change ownership of /stacks"

echo "Setting ownership of /data to $PUID:$PGID"
chown -R "$PUID:$PGID" /data || echo "Warning: Could not change ownership of /data"

echo "Setting ownership of /app to $PUID:$PGID"
chown -R "$PUID:$PGID" /app || echo "Warning: Could not change ownership of /app"

# Switch to the specified user and run the command
echo "Switching to user dockpilot (UID: $PUID, GID: $PGID)"
exec su-exec "$PUID:$PGID" "$@"
