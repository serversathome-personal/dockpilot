# Containers Management Implementation

## Overview
Complete implementation of the Containers management functionality for the Docker Management GUI, including both backend and frontend components.

## Backend Implementation

### Routes (`/project/backend/src/api/routes/containers.js`)
All container routes are now fully implemented:

- **GET `/api/containers`** - List all containers (with `?all=true/false` query param)
- **GET `/api/containers/:id`** - Get container details (inspect)
- **GET `/api/containers/:id/stats`** - Get container resource statistics
- **GET `/api/containers/:id/logs`** - Get container logs (with tail and timestamps options)
- **POST `/api/containers/:id/start`** - Start a container
- **POST `/api/containers/:id/stop`** - Stop a container
- **POST `/api/containers/:id/restart`** - Restart a container
- **POST `/api/containers/:id/pause`** - Pause a container (NEWLY ADDED)
- **POST `/api/containers/:id/unpause`** - Unpause a container (NEWLY ADDED)
- **DELETE `/api/containers/:id`** - Remove a container (with force and volumes options)

### Docker Service (`/project/backend/src/services/docker.service.js`)
Added missing methods:
- `pauseContainer(id)` - Pause a running container
- `unpauseContainer(id)` - Unpause a paused container

All methods include proper error handling and logging.

### WebSocket Handler (`/project/backend/src/websocket/logs.handler.js`)
Already fully implemented with:
- Live log streaming at `/ws/logs`
- Subscribe/unsubscribe mechanism
- Proper cleanup on disconnect
- Heartbeat monitoring

## Frontend Implementation

### Main Components

#### 1. ContainersView (`/project/frontend/src/components/containers/ContainersView.jsx`)
**Features:**
- **Container List Table:**
  - Columns: Name, Image, Status (Badge), Details, Ports, Created, Actions
  - Sortable columns
  - Click on row to open detail modal
  - Toggle to show/hide stopped containers
  - Refresh button
  - Auto-refresh every 5 seconds

- **Action Buttons (in table):**
  - Start (for exited containers)
  - Stop (for running containers)
  - Restart (for running containers)
  - Pause (for running containers)
  - Unpause (for paused containers)
  - Remove (for all containers)

- **Container Detail Modal (4 tabs):**

  **Overview Tab:**
  - Container metadata (ID, Name, Image, Status, Created, Restart Policy)
  - Action buttons (Start/Stop/Restart/Pause/Unpause/Remove)
  - Ports mapping display
  - Networks with IP addresses
  - Volume mounts

  **Logs Tab:**
  - Live log streaming via WebSocket
  - Auto-scroll toggle
  - Clear logs button
  - Line count display

  **Stats Tab:**
  - Real-time resource usage (auto-refresh every 2 seconds)
  - CPU usage percentage
  - Memory usage (used/limit with percentage)
  - Network I/O (RX/TX in bytes)
  - Block I/O (Read/Write in bytes)
  - Process count

  **Inspect Tab:**
  - Raw JSON view of container inspect data
  - Formatted and scrollable

- **Delete Confirmation Modal:**
  - Confirmation dialog
  - Options for normal delete or force delete
  - Warning about running containers

#### 2. ContainerLogs (`/project/frontend/src/components/containers/ContainerLogs.jsx`)
**Features:**
- WebSocket connection to `/ws/logs`
- Real-time log streaming
- Auto-scroll functionality with toggle
- Manual scroll detection
- Clear logs button
- Line count display
- Proper cleanup on unmount
- Monospace font with dark background
- Subscribe/unsubscribe messages

### API Integration (`/project/frontend/src/api/containers.api.js`)
All API methods implemented:
- `list(params)` - List containers with optional filters
- `get(id)` - Get container details
- `start(id)` - Start container
- `stop(id)` - Stop container
- `restart(id)` - Restart container
- `pause(id)` - Pause container
- `unpause(id)` - Unpause container
- `remove(id, params)` - Remove container with force/volumes options
- `logs(id, params)` - Get container logs
- `stats(id)` - Get container statistics
- `inspect(id)` - Inspect container

### UI Components Updated

#### Button Component (`/project/frontend/src/components/common/Button.jsx`)
Added `warning` variant for stop actions.

### State Management
Uses existing Zustand store:
- `containers` - Container list
- `setContainers` - Update container list
- `isLoading` - Loading state
- `setLoading` - Update loading state
- `addNotification` - Show success/error notifications

## Features Implemented

### Core Features
- [x] List all containers (running and stopped)
- [x] Toggle to show/hide stopped containers
- [x] Container details (inspect)
- [x] Container actions: start, stop, restart, pause, unpause, remove
- [x] Live log streaming via WebSocket
- [x] Resource usage statistics (CPU, memory, network, block I/O)
- [x] Real-time updates (auto-refresh)
- [x] Proper error handling and notifications

### UI/UX Features
- [x] Color-coded status badges
- [x] Responsive table layout
- [x] Modal-based detail view with tabs
- [x] Click-to-expand container details
- [x] Contextual action buttons based on container state
- [x] Loading states
- [x] Confirmation dialogs for destructive actions
- [x] Auto-scroll for logs
- [x] Formatted data display (bytes, timestamps, ports)

### Technical Features
- [x] WebSocket connection management
- [x] Proper cleanup on component unmount
- [x] Interval-based auto-refresh
- [x] Error boundary handling
- [x] Consistent with existing codebase patterns
- [x] Uses existing utility functions (formatters)
- [x] Uses existing UI components (Table, Card, Modal, Badge, Button)

## File Structure

```
/project
├── backend
│   └── src
│       ├── api
│       │   └── routes
│       │       └── containers.js (UPDATED - added pause/unpause)
│       ├── services
│       │   └── docker.service.js (UPDATED - added pause/unpause methods)
│       └── websocket
│           └── logs.handler.js (EXISTING - fully functional)
└── frontend
    └── src
        ├── api
        │   └── containers.api.js (UPDATED - fixed remove params)
        ├── components
        │   ├── common
        │   │   └── Button.jsx (UPDATED - added warning variant)
        │   └── containers
        │       ├── ContainersView.jsx (COMPLETELY REWRITTEN)
        │       └── ContainerLogs.jsx (NEW FILE)
        └── utils
            └── formatters.js (EXISTING - has all needed formatters)
```

## Testing

The implementation has been verified:
- Backend Docker connection: ✓ Working (3 containers found)
- WebSocket handler: ✓ Initialized at `/ws/logs`
- All routes properly defined: ✓
- All service methods implemented: ✓
- Frontend components properly exported: ✓
- All dependencies available: ✓

## Usage

### Starting the Application

1. **Backend:**
   ```bash
   cd /project/backend
   npm start
   ```

2. **Frontend:**
   ```bash
   cd /project/frontend
   npm run dev
   ```

3. **Access the Application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000/api
   - WebSocket: ws://localhost:5000/ws/logs

### Using the Containers View

1. Navigate to the "Containers" section
2. View all containers in the table
3. Toggle "Show stopped containers" to filter
4. Click on any row to see details
5. Use action buttons to manage containers
6. Switch between tabs to view logs, stats, or inspect data
7. WebSocket logs will stream in real-time

## Notes

- Auto-refresh: Container list refreshes every 5 seconds
- Stats refresh: Stats update every 2 seconds when viewing the Stats tab
- WebSocket: Logs stream in real-time with proper cleanup
- Error handling: All API calls have error handling with user notifications
- Responsive: UI adapts to different screen sizes
- Consistent: Follows the same patterns as Images, Networks, and Volumes views

## Future Enhancements (Optional)

- [ ] Exec into container (terminal access)
- [ ] Container creation form
- [ ] Batch operations (start/stop multiple containers)
- [ ] Advanced filtering and search
- [ ] Export logs to file
- [ ] Container health check display
- [ ] Resource usage graphs/charts
- [ ] Container performance history
