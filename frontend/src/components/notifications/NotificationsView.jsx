import { useState, useEffect } from 'react';
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
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

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
      const response = await notificationsAPI.getSettings();
      // Merge response with defaults to ensure all properties exist
      const data = response.data || {};
      setSettings({
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
      });
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load notification settings',
      });
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

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      await notificationsAPI.saveSettings(settings);
      addNotification({
        type: 'success',
        message: 'Notification settings saved successfully',
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to save notification settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddUrl = () => {
    if (!newUrl.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter an Apprise URL',
      });
      return;
    }

    setSettings({
      ...settings,
      appriseUrls: [...settings.appriseUrls, newUrl.trim()],
    });
    setNewUrl('');
  };

  const handleRemoveUrl = (index) => {
    setSettings({
      ...settings,
      appriseUrls: settings.appriseUrls.filter((_, i) => i !== index),
    });
  };

  const handleTestUrl = async (url, index) => {
    try {
      setIsTesting(true);
      setTestingIndex(index);
      const response = await notificationsAPI.testUrl(url);

      if (response.success) {
        addNotification({
          type: 'success',
          message: 'Test notification sent successfully!',
        });
      } else {
        addNotification({
          type: 'error',
          message: response.message || 'Failed to send test notification',
        });
      }
    } catch (error) {
      console.error('Failed to test URL:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to send test notification',
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
    dockpilotUpdateAvailable: 'DockPilot update available',
  };

  const triggerDescriptions = {
    containerStopped: 'Notify when a container exits with a non-zero exit code',
    containerHealthUnhealthy: 'Notify when a container fails its health check',
    stackStarted: 'Notify when a stack is started',
    stackStopped: 'Notify when a stack is stopped',
    imageUpdateAvailable: 'Notify when new image versions are detected',
    imageUpdated: 'Notify when an image is successfully updated',
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
        <Button
          variant="primary"
          onClick={handleSaveSettings}
          isLoading={isSaving}
        >
          Save Settings
        </Button>
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
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleRemoveUrl(index)}
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
          <div className="flex space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!showHistory) {
                  loadHistory();
                }
                setShowHistory(!showHistory);
              }}
            >
              {showHistory ? 'Hide History' : 'Show History'}
            </Button>
            {showHistory && history.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  await notificationsAPI.clearHistory();
                  setHistory([]);
                  addNotification({
                    type: 'success',
                    message: 'Notification history cleared',
                  });
                }}
              >
                Clear
              </Button>
            )}
          </div>
        }
      >
        {showHistory ? (
          history.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {history.map((item, index) => (
                <div
                  key={index}
                  className="p-3 bg-glass-darker rounded-lg border border-glass-border"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      {item.results?.some(r => r.success) ? (
                        <CheckCircleIcon className="w-5 h-5 text-success" />
                      ) : (
                        <XCircleIcon className="w-5 h-5 text-danger" />
                      )}
                      <div>
                        <h4 className="text-white font-medium">{item.title}</h4>
                        <p className="text-xs text-slate-400">{item.body}</p>
                      </div>
                    </div>
                    <div className="text-right">
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
          ) : (
            <div className="text-center py-8 text-slate-400">
              No notification history yet
            </div>
          )
        ) : (
          <div className="text-center py-4 text-slate-400">
            Click "Show History" to view recent notifications
          </div>
        )}
      </Card>
    </div>
  );
}
