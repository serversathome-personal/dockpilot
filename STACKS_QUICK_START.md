# Stacks Management - Quick Start Guide

## What's Been Implemented

Complete Docker Compose Stacks management functionality with:
- Create, view, edit, and delete stacks
- Start, stop, and restart stacks
- Edit docker-compose.yml files
- Manage environment variables
- View aggregated logs from all stack containers
- Beautiful glass morphism UI

## Getting Started

### 1. Start the Backend
```bash
cd /project/backend
npm run dev
```
Backend will start on http://localhost:5000

### 2. Start the Frontend (in a new terminal)
```bash
cd /project/frontend
npm run dev
```
Frontend will start on http://localhost:5173

### 3. Access the Stacks Page
Navigate to: http://localhost:5173/stacks

## Quick Test

A test stack has been pre-created at `/stacks/test-stack/`:

1. Open http://localhost:5173/stacks
2. You should see "test-stack" in the table
3. Click on the row to view details
4. Try the following:
   - View the Compose File tab
   - Edit the compose file (click Edit, make changes, Save)
   - View Environment Variables tab
   - Add/edit/remove variables
   - View Logs tab
   - Use Start/Stop/Restart buttons

## Creating Your First Stack

1. Click "Create Stack" button
2. Enter a stack name (e.g., "my-app")
3. Paste your docker-compose.yml content:
```yaml
version: '3.8'
services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```
4. (Optional) Add environment variables:
   - Click "Add Variable"
   - Enter KEY and value
5. Click "Create Stack"
6. Your stack will appear in the list

## Features Available

### Main View
- ✓ List all stacks
- ✓ View status (running/stopped)
- ✓ See container counts
- ✓ Quick actions (start/stop/restart/delete)
- ✓ Auto-refresh every 5 seconds

### Stack Details
- ✓ View/Edit docker-compose.yml
- ✓ Manage environment variables
- ✓ View aggregated logs
- ✓ Control stack lifecycle

### Stack Operations
- ✓ Create new stacks
- ✓ Start/stop/restart stacks
- ✓ Delete stacks (with or without volumes)
- ✓ Update configurations
- ✓ Pull images

## File Locations

### Implementation Files
- **Frontend Component:** `/project/frontend/src/components/stacks/StacksView.jsx`
- **API Client:** `/project/frontend/src/api/stacks.api.js`
- **Backend Routes:** `/project/backend/src/api/routes/stacks.js`
- **Backend Service:** `/project/backend/src/services/stack.service.js`
- **Stacks Directory:** `/stacks/`

### Configuration Files
- **Backend Config:** `/project/backend/.env`
- **Frontend Config:** `/project/frontend/.env`

## Documentation

For detailed documentation, see:
- `/project/STACKS_IMPLEMENTATION.md` - Complete implementation details
- `/project/verify-stacks-setup.sh` - Verification script

## Troubleshooting

### Stack not appearing?
- Ensure the stack has a `docker-compose.yml` file
- Check `/stacks/<stack-name>/` directory exists
- Verify file permissions

### Cannot create stack?
- Check `/stacks` directory is writable
- Verify YAML syntax
- Check backend console for errors

### Logs not showing?
- Ensure containers are running
- Wait a moment for logs to generate
- Click refresh button

### API errors?
- Verify backend is running on port 5000
- Check frontend .env has correct API URL
- Check browser console for errors

## Next Steps

1. **Start the application** (see above)
2. **Test with the pre-created stack**
3. **Create your own stacks**
4. **Explore all features** (compose editor, env vars, logs)

## Support

If you encounter issues:
1. Run the verification script: `./verify-stacks-setup.sh`
2. Check backend logs
3. Check browser console
4. Verify all files exist and permissions are correct

---

**Ready to use!** All backend and frontend code is complete and tested.
