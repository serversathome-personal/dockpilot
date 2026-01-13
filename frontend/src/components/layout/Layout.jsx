import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Background gradient effect */}
      <div className="fixed inset-0 bg-gradient-radial from-slate-900 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden w-full">
          {/* Header */}
          <Header />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="w-full max-w-full px-3 sm:px-4 lg:px-6 py-4 lg:py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
