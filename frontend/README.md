# Docker Management GUI - Frontend

A modern React-based frontend for managing Docker environments with a beautiful smoked glass UI theme.

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **React Router v6** - Client-side routing
- **Zustand** - State management
- **Axios** - HTTP client
- **Tailwind CSS** - Utility-first CSS framework
- **Headless UI** - Unstyled accessible components
- **Heroicons** - Beautiful hand-crafted SVG icons
- **date-fns** - Date utility library

## Project Structure

```
frontend/
├── src/
│   ├── api/                    # API client and endpoints
│   │   ├── client.js           # Axios instance with interceptors
│   │   ├── dashboard.api.js    # Dashboard API calls
│   │   ├── stacks.api.js       # Stacks API calls
│   │   ├── containers.api.js   # Containers API calls
│   │   ├── images.api.js       # Images API calls
│   │   ├── networks.api.js     # Networks API calls
│   │   └── volumes.api.js      # Volumes API calls
│   │
│   ├── components/
│   │   ├── common/             # Reusable components
│   │   │   ├── Badge.jsx       # Status badges
│   │   │   ├── Button.jsx      # Button component with variants
│   │   │   ├── Card.jsx        # Glass card container
│   │   │   ├── LoadingSpinner.jsx
│   │   │   ├── Modal.jsx       # Modal dialog
│   │   │   └── Table.jsx       # Sortable data table
│   │   │
│   │   ├── layout/             # Layout components
│   │   │   ├── Header.jsx      # Top navigation bar
│   │   │   ├── Layout.jsx      # Main layout wrapper
│   │   │   └── Sidebar.jsx     # Vertical navigation
│   │   │
│   │   ├── dashboard/          # Dashboard view
│   │   ├── stacks/             # Stacks management
│   │   ├── containers/         # Container management
│   │   ├── images/             # Image management
│   │   ├── networks/           # Network management
│   │   ├── volumes/            # Volume management
│   │   └── updates/            # Update checking
│   │
│   ├── hooks/                  # Custom React hooks
│   │   ├── useWebSocket.js     # WebSocket connection
│   │   ├── useLiveLogs.js      # Live log streaming
│   │   └── useTableSort.js     # Table sorting logic
│   │
│   ├── store/                  # Zustand state management
│   │   ├── index.js            # Combined store
│   │   ├── dockerSlice.js      # Docker entities state
│   │   ├── uiSlice.js          # UI state (modals, loading)
│   │   └── websocketSlice.js   # WebSocket state
│   │
│   ├── styles/                 # Global styles
│   │   └── index.css           # Tailwind imports and utilities
│   │
│   ├── utils/                  # Utility functions
│   │   ├── constants.js        # App constants
│   │   └── formatters.js       # Data formatting utilities
│   │
│   ├── App.jsx                 # Root component
│   ├── main.jsx                # Entry point
│   └── router.jsx              # Route configuration
│
├── index.html                  # HTML template
├── vite.config.js              # Vite configuration
├── tailwind.config.js          # Tailwind configuration
├── postcss.config.js           # PostCSS configuration
├── package.json                # Dependencies
└── .env.example                # Environment variables template

```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend server running on `http://localhost:5000`

### Installation

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Start development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## Design System

### Smoked Glass Theme

The UI uses a dark theme with glass morphism effects:

- **Background**: Deep slate (slate-950)
- **Glass surfaces**: Semi-transparent dark panels with backdrop blur
- **Borders**: Subtle transparent borders
- **Shadows**: Layered shadows for depth
- **Accent colors**: Blue (primary), Green (success), Orange (warning), Red (danger)

### Color Palette

```javascript
glass-dark:    rgba(15, 23, 42, 0.8)   // Main glass surface
glass-darker:  rgba(15, 23, 42, 0.95)  // Elevated glass surface
glass-light:   rgba(30, 41, 59, 0.8)   // Lighter glass surface
glass-lighter: rgba(51, 65, 85, 0.6)   // Lightest glass surface
glass-border:  rgba(148, 163, 184, 0.1)// Border color

primary:  #3b82f6  // Blue
success:  #10b981  // Green
warning:  #f59e0b  // Orange
danger:   #ef4444  // Red
```

### Component Variants

**Buttons:**
- `primary` - Blue background, white text
- `secondary` - Glass background with border
- `success` - Green background
- `danger` - Red background
- `ghost` - Transparent, hover effect

**Badges:**
- `running` - Green (container running)
- `stopped` - Gray (container stopped)
- `healthy` - Green (health check passed)
- `unhealthy` - Red (health check failed)
- `starting` - Orange (container starting)

## State Management

### Zustand Store Structure

The app uses Zustand with three main slices:

**dockerSlice:**
- Stores Docker entities (containers, stacks, images, networks, volumes)
- Dashboard statistics
- CRUD operations for each entity type

**uiSlice:**
- Loading states
- Modal management
- Notifications/toasts

**websocketSlice:**
- WebSocket connection state
- Live log streams
- Live container stats

### Usage Example

```javascript
import { useStore } from './store';

function MyComponent() {
  const { containers, setContainers } = useStore();

  // Access state and actions
  return <div>{containers.length} containers</div>;
}
```

## API Integration

All API calls go through the centralized axios client in `/src/api/client.js`:

- Base URL: `http://localhost:5000/api`
- Automatic error handling
- Response data extraction
- Request/response interceptors

### API Modules

Each resource has its own API module:

```javascript
import { containersAPI } from './api/containers.api';

// List containers
const containers = await containersAPI.list();

// Start a container
await containersAPI.start(containerId);
```

## WebSocket Integration

Real-time updates via WebSocket:

```javascript
import { useWebSocket } from './hooks/useWebSocket';

function MyComponent() {
  const { sendMessage } = useWebSocket();

  // Subscribe to container logs
  sendMessage({
    type: 'subscribe_logs',
    containerId: 'abc123'
  });
}
```

## Routing

React Router v6 with nested routes:

- `/` - Dashboard
- `/stacks` - Stacks management
- `/containers` - Container management
- `/images` - Image management
- `/networks` - Network management
- `/volumes` - Volume management
- `/updates` - Update checker

## Phase 1 Status

This is the **Phase 1 frontend foundation**. Currently implemented:

- Complete project structure
- Zustand store with all slices
- Layout components (Sidebar, Header, Layout)
- Common reusable components
- API client and all endpoint modules
- Custom hooks (WebSocket, live logs, table sorting)
- Routing configuration
- Placeholder views for all 7 tabs
- Smoked glass theme with Tailwind
- Utility functions and constants

**Phase 2** will implement:
- Full feature implementation for each view
- Data tables with real data
- Modals for CRUD operations
- Live log streaming
- Container stats visualization
- Stack management UI
- Image pull/push interfaces
- And more...

## Development Notes

- The app uses Vite's proxy for API calls in development
- WebSocket URL is configurable via environment variables
- All components use the glass morphism design system
- State management is centralized in Zustand store
- Error handling is built into the API client

## Browser Support

- Modern browsers with ES2020+ support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
