import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ChartBarIcon,
  CubeIcon,
  ServerIcon,
  PhotoIcon,
  GlobeAltIcon,
  CircleStackIcon,
  ArrowPathIcon,
  ClipboardDocumentListIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { dashboardAPI } from '../../api/dashboard.api';

const navigation = [
  { name: 'Dashboard', to: '/', icon: ChartBarIcon },
  { name: 'Stacks', to: '/stacks', icon: CubeIcon },
  { name: 'Containers', to: '/containers', icon: ServerIcon },
  { name: 'Images', to: '/images', icon: PhotoIcon },
  { name: 'Networks', to: '/networks', icon: GlobeAltIcon },
  { name: 'Volumes', to: '/volumes', icon: CircleStackIcon },
  { name: 'Updates', to: '/updates', icon: ArrowPathIcon },
  { name: 'Event Log', to: '/events', icon: ClipboardDocumentListIcon },
  { name: 'Notifications', to: '/notifications', icon: BellIcon },
];

export default function Sidebar() {
  const [version, setVersion] = useState('...');

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
    <div className="w-64 flex-shrink-0">
      <div className="h-full bg-glass-darker backdrop-blur-xl border-r border-glass-border">
        {/* Logo/Title */}
        <div className="h-24 flex items-center px-4 border-b border-glass-border">
          <img src="/dockpilot.png" alt="DockPilot" className="h-16 w-16 mr-4" />
          <div>
            <h1 className="text-3xl font-bold text-gradient">
              DockPilot
            </h1>
            <p className="text-sm text-slate-400">Docker Manager</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
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
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-glass-border">
          <div className="flex items-center justify-center text-xs text-slate-400">
            <span>v{version}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
