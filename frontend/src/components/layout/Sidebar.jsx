import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChartBarIcon,
  CubeIcon,
  ServerIcon,
  Square3Stack3DIcon,
  GlobeAltIcon,
  CircleStackIcon,
  ArrowPathIcon,
  ClipboardDocumentListIcon,
  BellIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { dashboardAPI } from '../../api/dashboard.api';
import { useStore } from '../../store';

const navigation = [
  { name: 'Dashboard', to: '/', icon: ChartBarIcon },
  { name: 'Stacks', to: '/stacks', icon: CubeIcon },
  { name: 'Containers', to: '/containers', icon: ServerIcon },
  { name: 'Images', to: '/images', icon: Square3Stack3DIcon },
  { name: 'Networks', to: '/networks', icon: GlobeAltIcon },
  { name: 'Volumes', to: '/volumes', icon: CircleStackIcon },
  { name: 'Updates', to: '/updates', icon: ArrowPathIcon },
  { name: 'Notifications', to: '/notifications', icon: BellIcon },
  { name: 'Event Log', to: '/events', icon: ClipboardDocumentListIcon },
];

export default function Sidebar() {
  const [version, setVersion] = useState('...');
  const { sidebarOpen, setSidebarOpen } = useStore();
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, setSidebarOpen]);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await dashboardAPI.getVersion();
        setVersion(response?.data?.version || '?.?.?');
      } catch (error) {
        console.error('Failed to fetch version:', error);
        setVersion('?.?.?');
      }
    };
    fetchVersion();
  }, []);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 flex-shrink-0
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="h-full bg-glass-darker backdrop-blur-xl border-r border-glass-border">
          {/* Logo/Title */}
          <div className="h-16 lg:h-24 flex items-center justify-between px-4 border-b border-glass-border">
            <div className="flex items-center">
              <img src="/dockpilot.png" alt="DockPilot" className="h-10 w-10 lg:h-16 lg:w-16 mr-3 lg:mr-4" />
              <div>
                <h1 className="text-xl lg:text-3xl font-bold text-gradient">
                  DockPilot
                </h1>
                <p className="text-xs lg:text-sm text-slate-400">Docker Manager</p>
              </div>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 text-slate-400 hover:text-white"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="mt-4 lg:mt-6 px-3 space-y-1 pb-20">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center px-3 py-3 lg:py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-primary text-white shadow-glass-sm'
                      : 'text-slate-300 hover:bg-glass-light hover:text-white'
                  }`
                }
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* Footer info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-glass-border bg-glass-darker">
            <div className="flex items-center justify-center text-xs text-slate-400">
              <span>v{version}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
