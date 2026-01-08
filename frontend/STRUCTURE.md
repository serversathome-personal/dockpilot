# Frontend Project Structure

```
frontend/
├── public/                         # Static assets (will be created)
│
├── src/
│   ├── api/                        # API Client & Endpoints
│   │   ├── client.js               # Axios instance with interceptors
│   │   ├── containers.api.js       # Container operations
│   │   ├── dashboard.api.js        # Dashboard stats
│   │   ├── images.api.js           # Image operations
│   │   ├── networks.api.js         # Network operations
│   │   ├── stacks.api.js           # Stack operations
│   │   └── volumes.api.js          # Volume operations
│   │
│   ├── components/
│   │   ├── common/                 # Reusable Components
│   │   │   ├── Badge.jsx           # Status badges (running, stopped, etc.)
│   │   │   ├── Button.jsx          # Button with variants (primary, secondary, etc.)
│   │   │   ├── Card.jsx            # Glass card container
│   │   │   ├── LoadingSpinner.jsx  # Loading indicator
│   │   │   ├── Modal.jsx           # Modal dialog (Headless UI)
│   │   │   └── Table.jsx           # Sortable data table
│   │   │
│   │   ├── layout/                 # Layout Components
│   │   │   ├── Header.jsx          # Top navigation bar
│   │   │   ├── Layout.jsx          # Main layout wrapper
│   │   │   └── Sidebar.jsx         # Vertical navigation menu
│   │   │
│   │   ├── containers/             # Container Management
│   │   │   └── ContainersView.jsx  # Container list view (placeholder)
│   │   │
│   │   ├── dashboard/              # Dashboard
│   │   │   └── DashboardView.jsx   # Dashboard with stats cards
│   │   │
│   │   ├── images/                 # Image Management
│   │   │   └── ImagesView.jsx      # Image list view (placeholder)
│   │   │
│   │   ├── networks/               # Network Management
│   │   │   └── NetworksView.jsx    # Network list view (placeholder)
│   │   │
│   │   ├── stacks/                 # Stack Management
│   │   │   └── StacksView.jsx      # Stack list view (placeholder)
│   │   │
│   │   ├── updates/                # Update Checker
│   │   │   └── UpdatesView.jsx     # Updates view (placeholder)
│   │   │
│   │   └── volumes/                # Volume Management
│   │       └── VolumesView.jsx     # Volume list view (placeholder)
│   │
│   ├── hooks/                      # Custom React Hooks
│   │   ├── useLiveLogs.js          # Live container log streaming
│   │   ├── useTableSort.js         # Table sorting logic
│   │   └── useWebSocket.js         # WebSocket connection management
│   │
│   ├── store/                      # Zustand State Management
│   │   ├── dockerSlice.js          # Docker entities (containers, stacks, etc.)
│   │   ├── index.js                # Combined store
│   │   ├── uiSlice.js              # UI state (modals, loading)
│   │   └── websocketSlice.js       # WebSocket connection state
│   │
│   ├── styles/                     # Global Styles
│   │   └── index.css               # Tailwind imports + custom utilities
│   │
│   ├── utils/                      # Utility Functions
│   │   ├── constants.js            # App constants (states, types, etc.)
│   │   └── formatters.js           # Data formatting utilities
│   │
│   ├── App.jsx                     # Root component
│   ├── main.jsx                    # Application entry point
│   └── router.jsx                  # React Router configuration
│
├── .env.example                    # Environment variables template
├── .eslintrc.cjs                   # ESLint configuration
├── .gitignore                      # Git ignore rules
├── index.html                      # HTML template
├── package.json                    # Dependencies & scripts
├── postcss.config.js               # PostCSS configuration
├── README.md                       # Project documentation
├── STRUCTURE.md                    # This file
├── tailwind.config.js              # Tailwind CSS configuration
└── vite.config.js                  # Vite build configuration
```

## File Count Summary

- **Configuration files**: 7
- **API modules**: 7
- **Common components**: 6
- **Layout components**: 3
- **View components**: 7 (one per tab)
- **Custom hooks**: 3
- **Store slices**: 4
- **Utility modules**: 2
- **Total files**: 42

## Key Technologies

- **React 18.3** - UI library
- **Vite 5.1** - Build tool
- **React Router 6.22** - Routing
- **Zustand 4.5** - State management
- **Axios 1.6** - HTTP client
- **Tailwind CSS 3.4** - Styling
- **Headless UI 1.7** - Accessible components
- **Heroicons 2.1** - Icon library
- **date-fns 3.3** - Date utilities

## Next Steps (Phase 2)

1. Implement full Stacks management UI
2. Implement full Containers management UI
3. Implement Images, Networks, Volumes UI
4. Add real-time log streaming
5. Add container stats visualization
6. Implement all CRUD modals
7. Add error handling and notifications
8. Implement Updates checker
9. Add search and filtering
10. Polish UI/UX details
