# Stacks Management Implementation

## Overview
Complete implementation of Docker Compose Stacks management functionality for the Docker Management GUI.

## Components Implemented

### Backend (Already Complete)

#### 1. Stack Service (`/project/backend/src/services/stack.service.js`)
**Features:**
- Read docker-compose.yml files from `/stacks` directory
- Parse compose files using `js-yaml` library
- Execute docker-compose commands (up, down, restart, logs)
- Environment variable management (.env files)
- Aggregated logs from all stack containers
- Stack validation
- Backup functionality for compose and env files

**Key Methods:**
- `listStacks()` - List all stacks with metadata
- `getStack(name)` - Get detailed stack information
- `createStack(name, composeContent, envVars)` - Create new stack
- `deleteStack(name, removeVolumes)` - Delete stack
- `startStack(name)` - Start all stack services
- `stopStack(name)` - Stop all stack services
- `restartStack(name)` - Restart all stack services
- `getComposeFile(name)` - Get parsed compose file
- `updateComposeFile(name, content)` - Update compose file
- `getEnvVars(name)` - Get environment variables
- `updateEnvVars(name, envVars)` - Update environment variables
- `getStackLogs(name, options)` - Get aggregated logs
- `validateStack(name)` - Validate stack configuration

#### 2. Stack Routes (`/project/backend/src/api/routes/stacks.js`)
**Endpoints:**
- `GET /api/stacks` - List all stacks
- `GET /api/stacks/:name` - Get stack details
- `POST /api/stacks` - Create new stack
- `DELETE /api/stacks/:name` - Delete stack
- `POST /api/stacks/:name/start` - Start stack
- `POST /api/stacks/:name/stop` - Stop stack
- `POST /api/stacks/:name/restart` - Restart stack
- `POST /api/stacks/:name/pull` - Pull stack images
- `GET /api/stacks/:name/compose` - Get compose file
- `PUT /api/stacks/:name/compose` - Update compose file
- `GET /api/stacks/:name/env` - Get environment variables
- `PUT /api/stacks/:name/env` - Update environment variables
- `GET /api/stacks/:name/logs` - Get stack logs
- `GET /api/stacks/:name/validate` - Validate stack

### Frontend (Newly Implemented)

#### 1. Stacks API Client (`/project/frontend/src/api/stacks.api.js`)
**Updated with all endpoints:**
- `list()` - Fetch all stacks
- `get(name)` - Fetch stack details
- `create(data)` - Create new stack
- `delete(name, params)` - Delete stack
- `start(name)` - Start stack
- `stop(name)` - Stop stack
- `restart(name)` - Restart stack
- `pull(name)` - Pull stack images
- `getCompose(name)` - Get compose file
- `updateCompose(name, content)` - Update compose file
- `getEnv(name)` - Get environment variables
- `updateEnv(name, envVars)` - Update environment variables
- `getLogs(name, params)` - Get logs
- `validate(name)` - Validate stack

#### 2. StacksView Component (`/project/frontend/src/components/stacks/StacksView.jsx`)
**Complete implementation with the following features:**

##### Main View
- Table listing all stacks with columns:
  - Name
  - Status (running/stopped with badge)
  - Containers (running/total count)
  - Services count
  - Created date (relative time)
  - Actions (start/stop, restart, delete)
- Click on any row to open detail view
- "Create Stack" button
- "Refresh" button
- Auto-refresh every 5 seconds

##### Create Stack Modal
- Stack name input with validation
- Docker compose YAML editor (monospace textarea)
- Environment variables editor (dynamic key-value pairs)
- Add/Remove environment variable buttons
- Create button with loading state
- Validation for required fields

##### Stack Detail Modal
Three-tab interface:

**Compose File Tab:**
- View/Edit docker-compose.yml
- YAML syntax in monospace font
- Edit mode with Save/Cancel buttons
- Real-time editing

**Environment Variables Tab:**
- View/Edit environment variables
- Key-value pair editor
- Add/Remove variable buttons
- Edit mode with Save/Cancel buttons

**Logs Tab:**
- Aggregated logs from all stack containers
- Scrollable log viewer with monospace font
- Refresh button
- Supports up to 500 tail lines with timestamps

**Stack Info & Actions:**
- Status badge
- Container count (running/total)
- Service count
- Start/Stop button (contextual)
- Restart button
- Delete button

##### Delete Confirmation Modal
- Confirmation dialog
- Two delete options:
  - Delete Stack (preserves volumes)
  - Delete + Volumes (removes volumes)

## Features

### Stack Management
- Create stacks from docker-compose.yml content
- Edit existing stack configurations
- Start/Stop/Restart stacks
- Delete stacks with optional volume removal
- View stack status and metadata

### Compose File Management
- View compose file content
- Edit compose file with validation
- Automatic YAML parsing and formatting
- Backup before updates

### Environment Variables
- View all environment variables
- Add new variables
- Edit existing variables
- Remove variables
- Save changes with validation

### Logs
- View aggregated logs from all stack containers
- Timestamp support
- Configurable tail lines
- Manual refresh

### UI/UX Features
- Glass morphism design
- Loading states
- Success/Error notifications
- Responsive layout
- Clickable table rows
- Modal-based workflows
- Real-time auto-refresh
- Sorting support in table

## Dependencies

### Backend
- `js-yaml@^4.1.0` - YAML parsing ✓ (already installed)
- `fs-extra@^11.2.0` - File system operations ✓ (already installed)
- `joi@^17.12.1` - Validation ✓ (already installed)

### Frontend
- `js-yaml@^4.1.0` - YAML parsing ✓ (added to package.json)
- `@heroicons/react@^2.1.1` - Icons ✓ (already installed)
- `zustand@^4.5.0` - State management ✓ (already installed)
- `axios@^1.6.7` - HTTP client ✓ (already installed)

## Configuration

### Backend Configuration
**File:** `/project/backend/.env`
```env
PORT=5000
STACKS_DIR=/stacks
NODE_ENV=development
```

### Frontend Configuration
**File:** `/project/frontend/.env`
```env
VITE_API_BASE_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000
```

### Directory Structure
```
/stacks/
├── stack-name-1/
│   ├── docker-compose.yml
│   └── .env (optional)
├── stack-name-2/
│   ├── docker-compose.yml
│   └── .env (optional)
└── ...
```

## Installation & Setup

### 1. Install Dependencies
```bash
# Frontend
cd /project/frontend
npm install

# Backend (dependencies already installed)
cd /project/backend
npm install
```

### 2. Create Environment Files
```bash
# Backend
cp /project/backend/.env.example /project/backend/.env

# Frontend
cp /project/frontend/.env.example /project/frontend/.env
```

### 3. Create Stacks Directory
```bash
mkdir -p /stacks
chmod 777 /stacks
```

### 4. Start Services

**Development Mode:**
```bash
# Terminal 1 - Backend
cd /project/backend
npm run dev

# Terminal 2 - Frontend
cd /project/frontend
npm run dev
```

**Production Mode:**
```bash
docker-compose up -d
```

## Usage Examples

### Creating a Stack via UI

1. Click "Create Stack" button
2. Enter stack name (e.g., "my-web-app")
3. Paste docker-compose.yml content:
```yaml
version: '3.8'
services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
```
4. (Optional) Add environment variables
5. Click "Create Stack"

### Viewing Stack Details

1. Click on any stack row in the table
2. View compose file, environment variables, or logs
3. Make edits as needed
4. Save changes

### Managing Stacks

- **Start:** Click the play icon or Start button
- **Stop:** Click the stop icon or Stop button
- **Restart:** Click the restart icon or Restart button
- **Delete:** Click the trash icon, confirm deletion

## API Response Examples

### List Stacks
```json
{
  "success": true,
  "data": [
    {
      "name": "test-stack",
      "path": "/stacks/test-stack",
      "serviceCount": 1,
      "containerCount": 1,
      "runningCount": 1,
      "status": "running",
      "created": "2024-01-04T15:20:00.000Z",
      "modified": "2024-01-04T15:20:00.000Z"
    }
  ]
}
```

### Get Stack Details
```json
{
  "success": true,
  "data": {
    "name": "test-stack",
    "path": "/stacks/test-stack",
    "compose": {
      "version": "3.8",
      "services": {
        "nginx": {
          "image": "nginx:latest",
          "ports": ["8080:80"]
        }
      }
    },
    "containers": [...],
    "envVars": {
      "APP_NAME": "test-app",
      "APP_VERSION": "1.0.0"
    },
    "metrics": {
      "containerCount": 1,
      "runningCount": 1
    },
    "status": "running"
  }
}
```

## Testing

A test stack has been created at `/stacks/test-stack/` with:
- `docker-compose.yml` - nginx service
- `.env` - sample environment variables

You can test the implementation by:
1. Starting the backend and frontend
2. Navigating to the Stacks page
3. Viewing the test-stack
4. Editing compose file or environment variables
5. Viewing logs

## File Locations

### Backend
- Routes: `/project/backend/src/api/routes/stacks.js`
- Service: `/project/backend/src/services/stack.service.js`
- Validation: `/project/backend/src/middleware/validation.middleware.js`

### Frontend
- Component: `/project/frontend/src/components/stacks/StacksView.jsx`
- API Client: `/project/frontend/src/api/stacks.api.js`
- Router: `/project/frontend/src/router.jsx` (already integrated)

### Configuration
- Backend env: `/project/backend/.env`
- Frontend env: `/project/frontend/.env`
- Stacks directory: `/stacks/`

## Features Checklist

### Backend
- [x] Read docker-compose.yml files
- [x] Parse compose files using js-yaml
- [x] Execute docker-compose commands (up, down, restart)
- [x] Environment variable management
- [x] Aggregated logs from stack containers
- [x] Stack creation
- [x] Stack updates (compose + env)
- [x] Stack deletion
- [x] Stack validation
- [x] All REST API endpoints

### Frontend
- [x] Main view with stack table
- [x] Create stack modal
- [x] Stack detail modal
- [x] Compose file editor tab
- [x] Environment variables editor tab
- [x] Logs viewer tab
- [x] Start/Stop/Restart actions
- [x] Delete confirmation
- [x] API integration
- [x] Auto-refresh
- [x] Loading states
- [x] Error handling
- [x] Glass morphism styling
- [x] Responsive design

## Next Steps

1. **Start the application:**
   ```bash
   # Backend
   cd /project/backend && npm run dev

   # Frontend (in another terminal)
   cd /project/frontend && npm run dev
   ```

2. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000/api

3. **Test the implementation:**
   - Navigate to Stacks page
   - View the test-stack
   - Create a new stack
   - Edit compose file and environment variables
   - View logs
   - Test start/stop/restart actions

## Notes

- The compose editor uses dynamic YAML import to keep bundle size small
- Logs are limited to 500 lines by default for performance
- Stack names must contain only alphanumeric characters, hyphens, and underscores
- Compose files are automatically backed up before updates
- The stacks directory must exist and be writable
- Auto-refresh occurs every 5 seconds for the stack list
- WebSocket support for live logs can be added in future iterations

## Troubleshooting

### Stack not appearing
- Ensure `/stacks/<stack-name>/docker-compose.yml` exists
- Check file permissions
- Verify STACKS_DIR environment variable

### Cannot create stack
- Check STACKS_DIR permissions (should be writable)
- Verify YAML syntax
- Check backend logs for errors

### Logs not showing
- Ensure stack containers are running
- Check docker-compose logs command works manually
- Verify stack has containers with the correct labels

### API connection issues
- Verify backend is running on port 5000
- Check VITE_API_BASE_URL in frontend .env
- Ensure CORS is properly configured
