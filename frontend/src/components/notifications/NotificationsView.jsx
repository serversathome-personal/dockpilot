import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import { notificationsAPI } from '../../api/notifications.api';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  BellIcon,
  PlusIcon,
  TrashIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export default function NotificationsView() {
  const { addNotification } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testingIndex, setTestingIndex] = useState(null);

  const [settings, setSettings] = useState({
    enabled: false,
    appriseUrls: [],
    triggers: {
      containerStopped: true,
      containerHealthUnhealthy: true,
      stackStarted: true,
      stackStopped: true,
      imageUpdateAvailable: false,
      imageUpdated: true,
      imageUpdateFailed: true,
      dockpilotUpdateAvailable: true,
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00',
    },
  });

  const [newUrl, setNewUrl] = useState('');
  const [history, setHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPerPage = 20;

  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState(null); // null, 'saving', 'saved', 'error'

  useEffect(() => {
    loadSettings();
    loadHistory();
  }, []);

  // Auto-save settings when they change (with debounce)
  useEffect(() => {
    // Skip auto-save on initial load
    if (isInitialLoad.current) {
      return;
    }

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Show saving indicator
    setSaveStatus('saving');

    // Debounce save by 500ms
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSaving(true);
        await notificationsAPI.saveSettings(settings);
        setSaveStatus('saved');
        // Clear "saved" status after 2 seconds
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (error) {
        console.error('Failed to auto-save settings:', error);
        setSaveStatus('error');
        addNotification({
          type: 'error',
          message: 'Failed to save notification settings',
        });
      } finally {
        setIsSaving(false);
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [settings]);

  const defaultSettings = {
    enabled: false,
    appriseUrls: [],
    triggers: {
      containerStopped: true,
      containerHealthUnhealthy: true,
      stackStarted: true,
      stackStopped: true,
      imageUpdateAvailable: false,
      imageUpdated: true,
      imageUpdateFailed: true,
      dockpilotUpdateAvailable: true,
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00',
    },
  };

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const data = await notificationsAPI.getSettings() || {};
      const mergedSettings = {
        ...defaultSettings,
        ...data,
        triggers: {
          ...defaultSettings.triggers,
          ...(data.triggers || {}),
        },
        quietHours: {
          ...defaultSettings.quietHours,
          ...(data.quietHours || {}),
        },
      };
      setSettings(mergedSettings);
      // Mark initial load as complete after a short delay to allow state to settle
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 100);
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load notification settings',
      });
      isInitialLoad.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await notificationsAPI.getHistory();
      setHistory(response.data || []);
    } catch (error) {
      console.error('Failed to load notification history:', error);
      setHistory([]);
    }
  };

  const handleAddUrl = async () => {
    if (!newUrl.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter an Apprise URL',
      });
      return;
    }

    const updatedSettings = {
      ...settings,
      appriseUrls: [...settings.appriseUrls, newUrl.trim()],
    };
    setSettings(updatedSettings);
    setNewUrl('');

    // Save immediately (don't wait for debounce)
    try {
      setSaveStatus('saving');
      await notificationsAPI.saveSettings(updatedSettings);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (error) {
      console.error('Failed to save after adding URL:', error);
      setSaveStatus('error');
    }
  };

  const handleRemoveUrl = async (index) => {
    const updatedSettings = {
      ...settings,
      appriseUrls: settings.appriseUrls.filter((_, i) => i !== index),
    };
    setSettings(updatedSettings);

    // Save immediately (don't wait for debounce)
    try {
      setSaveStatus('saving');
      await notificationsAPI.saveSettings(updatedSettings);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (error) {
      console.error('Failed to save after removing URL:', error);
      setSaveStatus('error');
    }
  };

  const handleTestUrl = async (url, index) => {
    try {
      setIsTesting(true);
      setTestingIndex(index);
      const response = await notificationsAPI.testUrl(url);

      if (response?.success) {
        addNotification({
          type: 'success',
          message: 'Test notification sent successfully!',
        });
      } else {
        addNotification({
          type: 'error',
          message: response?.message || 'Failed to send test notification',
        });
      }
    } catch (error) {
      console.error('Failed to test URL:', error);
      addNotification({
        type: 'error',
        message: error.response?.data?.message || error.message || 'Failed to send test notification',
      });
    } finally {
      setIsTesting(false);
      setTestingIndex(null);
    }
  };

  const handleToggleTrigger = (trigger) => {
    setSettings({
      ...settings,
      triggers: {
        ...settings.triggers,
        [trigger]: !settings.triggers[trigger],
      },
    });
  };

  const triggerLabels = {
    containerStopped: 'Container stopped unexpectedly',
    containerHealthUnhealthy: 'Container health check failed',
    stackStarted: 'Stack started',
    stackStopped: 'Stack stopped',
    imageUpdateAvailable: 'Image updates available',
    imageUpdated: 'Image updated',
    imageUpdateFailed: 'Image update failed',
    dockpilotUpdateAvailable: 'DockPilot update available',
  };

  const triggerDescriptions = {
    containerStopped: 'Notify when a container exits with a non-zero exit code',
    containerHealthUnhealthy: 'Notify when a container fails its health check',
    stackStarted: 'Notify when a stack is started',
    stackStopped: 'Notify when a stack is stopped',
    imageUpdateAvailable: 'Notify when new image versions are detected',
    imageUpdated: 'Notify when an image is successfully updated',
    imageUpdateFailed: 'Notify when an image update fails',
    dockpilotUpdateAvailable: 'Notify when a new version of DockPilot is available',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Notifications</h1>
          <p className="mt-2 text-slate-400">
            Configure push notifications via Apprise
          </p>
        </div>
        {saveStatus === 'saving' && (
          <div className="flex items-center text-slate-400 text-sm">
            <LoadingSpinner size="sm" />
            <span className="ml-2">Saving...</span>
          </div>
        )}
        {saveStatus === 'saved' && (
          <div className="flex items-center text-success text-sm">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="ml-2">Saved</span>
          </div>
        )}
        {saveStatus === 'error' && (
          <div className="flex items-center text-danger text-sm">
            <XCircleIcon className="w-5 h-5" />
            <span className="ml-2">Save failed</span>
          </div>
        )}
      </div>

      {/* Enable/Disable Toggle */}
      <Card title="General Settings">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">Enable Notifications</h3>
              <p className="text-sm text-slate-400">
                Turn on push notifications for important events
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-glass-dark peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </Card>

      {/* Apprise URLs */}
      <Card title="Notification Services">
        <div className="space-y-4">
          <div className="bg-glass-darker rounded-lg p-4 border border-glass-border">
            <div className="flex items-start space-x-3">
              <InformationCircleIcon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-slate-300">
                <p className="mb-2">
                  Add Apprise URLs for your notification services. Apprise supports 80+ services including:
                </p>
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  <li>Discord: <code className="text-xs bg-black/30 px-1 rounded">discord://webhook_id/webhook_token</code></li>
                  <li>Slack: <code className="text-xs bg-black/30 px-1 rounded">slack://token_a/token_b/token_c</code></li>
                  <li>Telegram: <code className="text-xs bg-black/30 px-1 rounded">tgram://bot_token/chat_id</code></li>
                  <li>Email: <code className="text-xs bg-black/30 px-1 rounded">mailto://user:pass@gmail.com</code></li>
                  <li>Pushover: <code className="text-xs bg-black/30 px-1 rounded">pover://user@token</code></li>
                </ul>
                <p className="mt-2">
                  <a
                    href="https://github.com/caronc/apprise/wiki"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary-light"
                  >
                    View full Apprise documentation
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* URL List */}
          <div className="space-y-2">
            {settings.appriseUrls.map((url, index) => (
              <div
                key={index}
                className="flex items-center space-x-2 bg-glass-darker rounded-lg p-3 border border-glass-border"
              >
                <BellIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <code className="flex-1 text-sm text-slate-300 truncate" title={url}>
                  {url.length > 60 ? url.substring(0, 60) + '...' : url}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleTestUrl(url, index)}
                  isLoading={isTesting && testingIndex === index}
                  disabled={isTesting}
                  title="Send test notification"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleRemoveUrl(index)}
                  title="Remove"
                >
                  <TrashIcon className="w-4 h-4" />
                </Button>
              </div>
            ))}

            {settings.appriseUrls.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                No notification services configured. Add one below.
              </div>
            )}
          </div>

          {/* Add URL */}
          <div className="flex space-x-2">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="Enter Apprise URL (e.g., discord://webhook_id/token)"
              className="flex-1 glass-input"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddUrl();
                }
              }}
            />
            <Button variant="primary" onClick={handleAddUrl}>
              <PlusIcon className="w-5 h-5 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </Card>

      {/* Notification Triggers */}
      <Card title="Notification Triggers">
        <div className="space-y-3">
          {Object.entries(settings.triggers).map(([key, enabled]) => (
            <div
              key={key}
              className="flex items-center justify-between p-3 bg-glass-darker rounded-lg border border-glass-border"
            >
              <div className="flex-1">
                <h4 className="text-white font-medium">{triggerLabels[key]}</h4>
                <p className="text-xs text-slate-400">{triggerDescriptions[key]}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-4">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => handleToggleTrigger(key)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-glass-dark peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          ))}
        </div>
      </Card>

      {/* Quiet Hours */}
      <Card title="Quiet Hours">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">Enable Quiet Hours</h3>
              <p className="text-sm text-slate-400">
                Suppress notifications during specified hours
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.quietHours?.enabled || false}
                onChange={(e) => setSettings({
                  ...settings,
                  quietHours: { ...settings.quietHours, enabled: e.target.checked },
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-glass-dark peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {settings.quietHours?.enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Start Time
                </label>
                <input
                  type="time"
                  value={settings.quietHours?.start || '22:00'}
                  onChange={(e) => setSettings({
                    ...settings,
                    quietHours: { ...settings.quietHours, start: e.target.value },
                  })}
                  className="glass-input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  End Time
                </label>
                <input
                  type="time"
                  value={settings.quietHours?.end || '08:00'}
                  onChange={(e) => setSettings({
                    ...settings,
                    quietHours: { ...settings.quietHours, end: e.target.value },
                  })}
                  className="glass-input w-full"
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Notification History */}
      <Card
        title="Notification History"
        headerAction={
          history.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                await notificationsAPI.clearHistory();
                setHistory([]);
                setHistoryPage(1);
                addNotification({
                  type: 'success',
                  message: 'Notification history cleared',
                });
              }}
            >
              Clear History
            </Button>
          )
        }
      >
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                setHistoryPage(1);
              }}
              placeholder="Search notifications..."
              className="glass-input w-full pl-10 pr-10"
            />
            {historySearch && (
              <button
                onClick={() => {
                  setHistorySearch('');
                  setHistoryPage(1);
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* History List */}
          {(() => {
            const filteredHistory = history.filter(item => {
              if (!historySearch) return true;
              const search = historySearch.toLowerCase();
              return (
                item.title?.toLowerCase().includes(search) ||
                item.body?.toLowerCase().includes(search) ||
                item.type?.toLowerCase().includes(search)
              );
            });

            const totalPages = Math.ceil(filteredHistory.length / historyPerPage);
            const startIndex = (historyPage - 1) * historyPerPage;
            const paginatedHistory = filteredHistory.slice(startIndex, startIndex + historyPerPage);

            if (filteredHistory.length === 0) {
              return (
                <div className="text-center py-8 text-slate-400">
                  {historySearch ? 'No notifications match your search' : 'No notification history yet'}
                </div>
              );
            }

            return (
              <>
                <div className="space-y-2">
                  {paginatedHistory.map((item, index) => (
                    <div
                      key={startIndex + index}
                      className="p-3 bg-glass-darker rounded-lg border border-glass-border"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          {item.results?.some(r => r.success) ? (
                            <CheckCircleIcon className="w-5 h-5 text-success flex-shrink-0" />
                          ) : (
                            <XCircleIcon className="w-5 h-5 text-danger flex-shrink-0" />
                          )}
                          <div>
                            <h4 className="text-white font-medium">{item.title}</h4>
                            <p className="text-xs text-slate-400">{item.body}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <Badge variant={item.type === 'error' ? 'danger' : item.type === 'warning' ? 'warning' : 'primary'}>
                            {item.type}
                          </Badge>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(item.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-glass-border">
                    <p className="text-sm text-slate-400">
                      Showing {startIndex + 1}-{Math.min(startIndex + historyPerPage, filteredHistory.length)} of {filteredHistory.length}
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                        disabled={historyPage === 1}
                      >
                        <ChevronLeftIcon className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-slate-300 px-2">
                        Page {historyPage} of {totalPages}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                        disabled={historyPage === totalPages}
                      >
                        <ChevronRightIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </Card>
    </div>
  );
}
