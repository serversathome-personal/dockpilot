import { useEffect } from 'react';
import { useStore } from '../../store';
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export default function Toast() {
  const { notifications, dismissToast } = useStore();

  // Auto-dismiss toast popups after 5 seconds
  // But keep notifications in history (bell icon) until manually cleared
  useEffect(() => {
    const timers = notifications
      .filter((n) => n.showToast)
      .map((notification) => {
        return setTimeout(() => {
          dismissToast(notification.id);
        }, 5000);
      });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [notifications, dismissToast]);

  // Only show notifications that should display as toast
  const toastNotifications = notifications.filter((n) => n.showToast);

  if (toastNotifications.length === 0) return null;

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className="h-6 w-6 text-success" />;
      case 'error':
        return <ExclamationCircleIcon className="h-6 w-6 text-danger" />;
      case 'warning':
        return <ExclamationCircleIcon className="h-6 w-6 text-warning" />;
      default:
        return <InformationCircleIcon className="h-6 w-6 text-primary" />;
    }
  };

  const getBorderColor = (type) => {
    switch (type) {
      case 'success':
        return 'border-success/50';
      case 'error':
        return 'border-danger/50';
      case 'warning':
        return 'border-warning/50';
      default:
        return 'border-primary/50';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2" style={{ maxWidth: '400px' }}>
      {toastNotifications.map((notification) => (
        <div
          key={notification.id}
          className={`bg-glass-darker backdrop-blur-xl rounded-lg border ${getBorderColor(
            notification.type
          )} shadow-glass-lg p-4 flex items-start space-x-3 animate-slide-in`}
        >
          <div className="flex-shrink-0">
            {getIcon(notification.type)}
          </div>
          <div className="flex-1 min-w-0">
            {notification.title && (
              <p className="text-sm font-medium text-white">
                {notification.title}
              </p>
            )}
            <p className="text-sm text-slate-300">
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => dismissToast(notification.id)}
            className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      ))}
    </div>
  );
}
