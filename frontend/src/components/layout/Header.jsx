import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { dashboardAPI } from '../../api/dashboard.api';
import { BellIcon, XMarkIcon, Bars3Icon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

export default function Header() {
  const { wsConnected, notifications, removeNotification, clearNotifications, toggleSidebar, addNotification } = useStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [versionInfo, setVersionInfo] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const notificationRef = useRef(null);

  // Fetch version info on mount
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await dashboardAPI.getVersion();
        setVersionInfo(response.data);
      } catch (error) {
        console.error('Failed to fetch version info:', error);
      }
    };

    fetchVersion();
    // Check for updates every 30 minutes
    const interval = setInterval(fetchVersion, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle self-update
  const handleSelfUpdate = async () => {
    setShowUpdateConfirm(false);
    setIsUpdating(true);

    try {
      await dashboardAPI.triggerSelfUpdate();
      addNotification({
        type: 'info',
        message: 'DockPilot is updating. The page will reload when complete...',
      });

      // Poll for reconnection
      const checkConnection = setInterval(async () => {
        try {
          await dashboardAPI.getVersion();
          clearInterval(checkConnection);
          window.location.reload();
        } catch {
          // Still updating, keep waiting
        }
      }, 3000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(checkConnection);
        setIsUpdating(false);
      }, 120000);
    } catch (error) {
      setIsUpdating(false);
      addNotification({
        type: 'error',
        message: `Failed to update: ${error.message}`,
      });
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotifications]);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'success':
        return 'text-success';
      case 'error':
        return 'text-danger';
      case 'warning':
        return 'text-warning';
      default:
        return 'text-primary';
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <header className="h-14 lg:h-16 bg-glass-dark backdrop-blur-xl border-b border-glass-border flex-shrink-0 relative z-30">
      <div className="h-full px-3 lg:px-6 flex items-center justify-between">
        {/* Left side - hamburger menu for mobile */}
        <div className="flex items-center">
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Open menu"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          <h2 className="text-lg font-semibold text-white hidden lg:block">
            {/* Page title will be set by individual views */}
          </h2>
        </div>

        {/* Right side - status and notifications */}
        <div className="flex items-center space-x-2 lg:space-x-4">
          {/* Version Badge and Update Button */}
          {versionInfo && (
            <div className="flex items-center space-x-2">
              <span className="hidden sm:inline text-xs text-slate-400">
                v{versionInfo.version}
              </span>
              {versionInfo.hasUpdate && (
                <>
                  {versionInfo.selfUpdate?.configured ? (
                    <button
                      onClick={() => setShowUpdateConfirm(true)}
                      disabled={isUpdating}
                      className="flex items-center space-x-1 px-2 py-1 text-xs bg-primary/20 text-primary hover:bg-primary/30 rounded transition-colors disabled:opacity-50"
                      title={`Update to v${versionInfo.latestVersion}`}
                    >
                      <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">
                        {isUpdating ? 'Updating...' : 'Update'}
                      </span>
                    </button>
                  ) : (
                    <span
                      className="px-2 py-1 text-xs bg-warning/20 text-warning rounded cursor-help"
                      title={`v${versionInfo.latestVersion} available. Self-update requires DockPilot to be started via docker compose.`}
                    >
                      Update Available
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Update Confirmation Modal */}
          {showUpdateConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-glass-dark border border-glass-border rounded-lg p-6 max-w-md mx-4 shadow-glass-lg">
                <h3 className="text-lg font-semibold text-white mb-2">Update DockPilot?</h3>
                <p className="text-sm text-slate-300 mb-4">
                  This will update DockPilot from v{versionInfo.version} to v{versionInfo.latestVersion}.
                  There will be brief downtime while the container restarts.
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowUpdateConfirm(false)}
                    className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSelfUpdate}
                    className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded transition-colors"
                  >
                    Update Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* GitHub Link */}
          <a
            href="https://github.com/serversathome-personal/dockpilot"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="GitHub Repository"
          >
            <svg className="h-5 w-5 lg:h-6 lg:w-6" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>

          {/* Buy Me a Coffee Link */}
          <a
            href="https://buymeacoffee.com/serversathome"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-slate-400 hover:text-warning transition-colors"
            title="Buy Me a Coffee"
          >
            <svg className="h-5 w-5 lg:h-6 lg:w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 01-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 01-4.743.295 37.059 37.059 0 01-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0011.343.376.483.483 0 01.535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 01.39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 01-.169.364zm-6.159 3.9c-.862.37-1.84.788-3.109.788a5.884 5.884 0 01-1.569-.217l.877 9.004c.065.78.717 1.38 1.5 1.38 0 0 1.243.065 1.658.065.447 0 1.786-.065 1.786-.065.783 0 1.434-.6 1.499-1.38l.94-9.95a3.996 3.996 0 00-1.043-.028c-.802.196-1.583.38-2.539.403z"/>
            </svg>
          </a>

          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-slate-400 hover:text-white transition-colors"
            >
              <BellIcon className="h-5 w-5 lg:h-6 lg:w-6" />
              {notifications.filter(n => n.type === 'error').length > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-danger rounded-full">
                  {notifications.filter(n => n.type === 'error').length}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] sm:w-80 lg:w-96 bg-glass-dark/95 backdrop-blur-xl border border-glass-border rounded-lg shadow-glass-lg z-[100] max-h-[70vh] lg:max-h-[500px] overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-glass-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Notifications</h3>
                  <div className="flex items-center space-x-3">
                    {notifications.length > 0 && (
                      <>
                        <span className="text-xs text-slate-400">{notifications.length}</span>
                        <button
                          onClick={() => {
                            clearNotifications();
                            setShowNotifications(false);
                          }}
                          className="text-xs text-primary hover:text-primary-light transition-colors"
                        >
                          Clear All
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="overflow-y-auto max-h-[60vh] lg:max-h-[400px]">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-400 text-sm">
                      No notifications
                    </div>
                  ) : (
                    <div className="divide-y divide-glass-border">
                      {notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className="px-4 py-3 hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3 flex-1">
                              <span className={`text-lg ${getNotificationColor(notification.type)}`}>
                                {getNotificationIcon(notification.type)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white break-words">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                  {formatTime(notification.timestamp)}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeNotification(notification.id)}
                              className="ml-2 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
