import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store';
import { updatesAPI } from '../../api/updates.api';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import Table from '../common/Table';
import { formatBytes, formatRelativeTime } from '../../utils/formatters';
import { ArrowPathIcon, ClockIcon, CheckCircleIcon, XCircleIcon, PlusIcon } from '@heroicons/react/24/outline';

export default function UpdatesView() {
  const { isLoading, setLoading, addNotification } = useStore();
  const [activeTab, setActiveTab] = useState('available');
  const [availableUpdates, setAvailableUpdates] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedUpdates, setSelectedUpdates] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  // Progress modal state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({
    current: 0,
    total: 0,
    currentImage: '',
    status: '',
    logs: [],
  });

  const [newSchedule, setNewSchedule] = useState({
    name: '',
    cronExpression: '0 2 * * *',
    enabled: true,
    updateType: 'all',
    restartContainers: true,
    excludedImages: [],
  });

  useEffect(() => {
    loadSchedules();
    loadHistory();
  }, []);

  const checkForUpdates = async () => {
    try {
      setIsChecking(true);
      const data = await updatesAPI.checkForUpdates();
      setAvailableUpdates(data.data || []);
      setHasChecked(true);

      const updateCount = data.data?.length || 0;
      addNotification({
        type: updateCount > 0 ? 'success' : 'info',
        message: updateCount > 0
          ? `Found ${updateCount} available update${updateCount === 1 ? '' : 's'}`
          : 'No updates available. All images are up to date.',
      });
    } catch (error) {
      console.error('Failed to check for updates:', error);
      addNotification({
        type: 'error',
        message: 'Failed to check for updates',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const executeUpdates = async () => {
    if (selectedUpdates.length === 0) {
      addNotification({
        type: 'error',
        message: 'Please select at least one update',
      });
      return;
    }

    if (!window.confirm(`Update ${selectedUpdates.length} image(s)? This will pull the latest versions.`)) {
      return;
    }

    setIsUpdating(true);
    setShowProgressModal(true);
    setUpdateProgress({
      current: 0,
      total: selectedUpdates.length,
      currentImage: '',
      status: 'starting',
      logs: [],
    });

    try {
      // Use fetch with streaming for SSE-like POST request
      const response = await fetch(updatesAPI.getExecuteStreamUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: selectedUpdates,
          restartContainers: true,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'progress') {
                setUpdateProgress((prev) => ({
                  ...prev,
                  current: data.current,
                  total: data.total,
                  currentImage: data.image,
                  status: data.status,
                  logs: [...prev.logs, { message: data.message, status: data.status }],
                }));
              } else if (data.type === 'complete') {
                setUpdateProgress((prev) => ({
                  ...prev,
                  status: 'complete',
                  logs: [...prev.logs, {
                    message: `Completed: ${data.successful} succeeded, ${data.failed} failed`,
                    status: 'complete',
                  }],
                }));

                addNotification({
                  type: data.failed > 0 ? 'warning' : 'success',
                  message: `Updated ${data.successful} image(s)${data.failed > 0 ? `, ${data.failed} failed` : ''}`,
                });
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      setSelectedUpdates([]);
      // Refresh the updates list after completion
      await checkForUpdates();
      await loadHistory();
    } catch (error) {
      console.error('Failed to execute updates:', error);
      addNotification({
        type: 'error',
        message: 'Failed to execute updates',
      });
      setUpdateProgress((prev) => ({
        ...prev,
        status: 'error',
        logs: [...prev.logs, { message: `Error: ${error.message}`, status: 'failed' }],
      }));
    } finally {
      setIsUpdating(false);
    }
  };

  const loadSchedules = async () => {
    try {
      const data = await updatesAPI.getSchedules();
      setSchedules(data.data || []);
    } catch (error) {
      console.error('Failed to load schedules:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await updatesAPI.getHistory({ limit: 50 });
      setHistory(data.data || []);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const saveSchedule = async () => {
    if (!newSchedule.name || !newSchedule.cronExpression) {
      addNotification({
        type: 'error',
        message: 'Name and schedule are required',
      });
      return;
    }

    try {
      setLoading(true);
      await updatesAPI.saveSchedule(editingSchedule ? { ...newSchedule, id: editingSchedule.id } : newSchedule);
      addNotification({
        type: 'success',
        message: `Schedule ${editingSchedule ? 'updated' : 'created'} successfully`,
      });
      setShowScheduleModal(false);
      setEditingSchedule(null);
      setNewSchedule({
        name: '',
        cronExpression: '0 2 * * *',
        enabled: true,
        updateType: 'all',
        restartContainers: true,
        excludedImages: [],
      });
      await loadSchedules();
    } catch (error) {
      console.error('Failed to save schedule:', error);
      addNotification({
        type: 'error',
        message: 'Failed to save schedule',
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      await updatesAPI.deleteSchedule(id);
      addNotification({
        type: 'success',
        message: 'Schedule deleted successfully',
      });
      await loadSchedules();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      addNotification({
        type: 'error',
        message: 'Failed to delete schedule',
      });
    }
  };

  const toggleUpdateSelection = (update) => {
    const isSelected = selectedUpdates.some(u => u.repository === update.repository && u.currentTag === update.currentTag);
    if (isSelected) {
      setSelectedUpdates(selectedUpdates.filter(u => !(u.repository === update.repository && u.currentTag === update.currentTag)));
    } else {
      setSelectedUpdates([...selectedUpdates, update]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedUpdates.length === availableUpdates.length) {
      setSelectedUpdates([]);
    } else {
      setSelectedUpdates([...availableUpdates]);
    }
  };

  const allSelected = availableUpdates.length > 0 && selectedUpdates.length === availableUpdates.length;
  const someSelected = selectedUpdates.length > 0 && selectedUpdates.length < availableUpdates.length;

  const formatAge = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 60) return '1 month ago';
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} year(s) ago`;
  };

  const updatesColumns = [
    {
      key: 'select',
      label: availableUpdates.length > 0 ? (
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={toggleSelectAll}
          className="w-4 h-4 text-primary bg-glass-light border-glass-border rounded focus:ring-primary cursor-pointer"
          title={allSelected ? 'Deselect all' : 'Select all'}
        />
      ) : '',
      sortable: false,
      render: (_, update) => (
        <input
          type="checkbox"
          checked={selectedUpdates.some(u => u.repository === update.repository && u.currentTag === update.currentTag)}
          onChange={() => toggleUpdateSelection(update)}
          className="w-4 h-4 text-primary bg-glass-light border-glass-border rounded focus:ring-primary"
        />
      ),
    },
    {
      key: 'repository',
      label: 'Image',
      sortable: true,
      render: (repository, update) => (
        <div>
          <div className="text-white font-medium">{repository}</div>
          <div className="text-xs text-slate-400">:{update.currentTag}</div>
        </div>
      ),
    },
    {
      key: 'currentVersion',
      label: 'Current',
      sortable: false,
      render: (currentVersion, update) => (
        <div className="text-sm">
          {currentVersion ? (
            <div className="text-slate-300">{currentVersion}</div>
          ) : (
            <div className="text-slate-400 text-xs">
              {formatAge(update.currentCreated) || 'Unknown'}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'newVersion',
      label: 'Available',
      sortable: false,
      render: (newVersion, update) => (
        <div className="text-sm">
          {newVersion ? (
            <div className="text-success font-medium">{newVersion}</div>
          ) : update.newCreated ? (
            <div className="text-success text-xs">
              Built {formatAge(update.newCreated)}
            </div>
          ) : (
            <Badge variant="warning" className="text-xs">New</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'size',
      label: 'Size',
      sortable: true,
      render: (size) => formatBytes(size),
    },
  ];

  const historyColumns = [
    {
      key: 'image',
      label: 'Image',
      sortable: true,
    },
    {
      key: 'timestamp',
      label: 'Time',
      sortable: true,
      render: (timestamp) => formatRelativeTime(timestamp),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (status) => {
        const variants = {
          completed: 'running',
          failed: 'exited',
          pending: 'starting',
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
      },
    },
    {
      key: 'affectedContainers',
      label: 'Containers',
      sortable: false,
      render: (count) => count || 0,
    },
  ];

  const tabs = [
    { id: 'available', label: 'Available Updates', icon: ArrowPathIcon },
    { id: 'schedules', label: 'Schedules', icon: ClockIcon },
    { id: 'history', label: 'History', icon: CheckCircleIcon },
  ];

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Updates</h1>
          <p className="mt-1 lg:mt-2 text-sm lg:text-base text-slate-400">Manage automatic image updates</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === 'available' && (
            <>
              <Button
                variant="primary"
                onClick={checkForUpdates}
                isLoading={isChecking}
                className="flex items-center"
              >
                <ArrowPathIcon className="h-5 w-5 lg:mr-2" />
                <span className="hidden sm:inline">Check for Updates</span>
              </Button>
              {selectedUpdates.length > 0 && (
                <Button
                  variant="success"
                  onClick={executeUpdates}
                  isLoading={isUpdating}
                >
                  <span className="hidden sm:inline">Update Selected</span> ({selectedUpdates.length})
                </Button>
              )}
            </>
          )}
          {activeTab === 'schedules' && (
            <Button
              variant="primary"
              onClick={() => setShowScheduleModal(true)}
              className="flex items-center"
            >
              <PlusIcon className="h-5 w-5 lg:mr-2" />
              <span className="hidden sm:inline">New Schedule</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-glass-border overflow-x-auto">
        <nav className="flex space-x-4 lg:space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-3 lg:py-4 px-1 border-b-2 font-medium text-xs lg:text-sm transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-400 hover:text-white hover:border-slate-300'
              }`}
            >
              <tab.icon className="h-4 w-4 lg:h-5 lg:w-5 mr-1 lg:mr-2" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'available' && (
        <Card>
          {!hasChecked ? (
            <div className="text-center py-12">
              <ArrowPathIcon className="mx-auto h-12 w-12 text-slate-500" />
              <h3 className="mt-2 text-sm font-medium text-white">No updates checked</h3>
              <p className="mt-1 text-sm text-slate-400">
                Click "Check for Updates" to scan for available image updates
              </p>
            </div>
          ) : availableUpdates.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircleIcon className="mx-auto h-12 w-12 text-success" />
              <h3 className="mt-2 text-sm font-medium text-white">No updates available</h3>
              <p className="mt-1 text-sm text-slate-400">
                All images are up to date. Check again later for new updates.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-slate-300 mb-4">
                Found {availableUpdates.length} available update{availableUpdates.length === 1 ? '' : 's'}
              </p>
              <Table columns={updatesColumns} data={availableUpdates} />
            </div>
          )}
        </Card>
      )}

      {activeTab === 'schedules' && (
        <Card>
          {schedules.length === 0 ? (
            <div className="text-center py-12">
              <ClockIcon className="mx-auto h-12 w-12 text-slate-500" />
              <h3 className="mt-2 text-sm font-medium text-white">No schedules configured</h3>
              <p className="mt-1 text-sm text-slate-400">
                Create a schedule to automatically check and update images
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="bg-glass-light rounded-lg p-4 border border-glass-border"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-white">{schedule.name}</h3>
                        <Badge variant={schedule.enabled ? 'running' : 'stopped'}>
                          {schedule.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">
                        Schedule: <span className="font-mono">{schedule.cronExpression}</span>
                      </p>
                      <p className="text-sm text-slate-400">
                        Update type: {schedule.updateType === 'minor' ? 'Minor updates only' : schedule.updateType === 'checkOnly' ? 'Check only (notify)' : 'All updates'}
                      </p>
                      {schedule.excludedImages && schedule.excludedImages.length > 0 && (
                        <p className="text-sm text-slate-400">
                          Excluded: {schedule.excludedImages.length} image(s)
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingSchedule(schedule);
                          setNewSchedule(schedule);
                          setShowScheduleModal(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => deleteSchedule(schedule.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'history' && (
        <Card>
          {history.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircleIcon className="mx-auto h-12 w-12 text-slate-500" />
              <h3 className="mt-2 text-sm font-medium text-white">No update history</h3>
              <p className="mt-1 text-sm text-slate-400">
                Update history will appear here after executing updates
              </p>
            </div>
          ) : (
            <Table columns={historyColumns} data={history} />
          )}
        </Card>
      )}

      {/* Schedule Modal */}
      <Modal
        isOpen={showScheduleModal}
        onClose={() => {
          setShowScheduleModal(false);
          setEditingSchedule(null);
          setNewSchedule({
            name: '',
            cronExpression: '0 2 * * *',
            enabled: true,
            updateType: 'all',
            restartContainers: true,
            excludedImages: [],
          });
        }}
        title={editingSchedule ? 'Edit Schedule' : 'Create Schedule'}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Schedule Name
            </label>
            <input
              type="text"
              value={newSchedule.name}
              onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
              placeholder="Daily Updates"
              className="glass-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Cron Expression
            </label>
            <input
              type="text"
              value={newSchedule.cronExpression}
              onChange={(e) => setNewSchedule({ ...newSchedule, cronExpression: e.target.value })}
              placeholder="0 2 * * *"
              className="glass-input w-full font-mono"
            />
            <p className="mt-1 text-xs text-slate-400">
              Examples: 0 2 * * * (daily at 2 AM), 0 */6 * * * (every 6 hours)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Update Type
            </label>
            <select
              value={newSchedule.updateType}
              onChange={(e) => setNewSchedule({ ...newSchedule, updateType: e.target.value })}
              className="glass-select w-full"
            >
              <option value="all">All updates</option>
              <option value="minor">Minor updates only</option>
              <option value="checkOnly">Check only (notify)</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="enabled"
              checked={newSchedule.enabled}
              onChange={(e) => setNewSchedule({ ...newSchedule, enabled: e.target.checked })}
              className="w-4 h-4 text-primary bg-glass-light border-glass-border rounded focus:ring-primary"
            />
            <label htmlFor="enabled" className="ml-2 text-sm text-slate-300">
              Enable this schedule
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="restart"
              checked={newSchedule.restartContainers}
              onChange={(e) => setNewSchedule({ ...newSchedule, restartContainers: e.target.checked })}
              className="w-4 h-4 text-primary bg-glass-light border-glass-border rounded focus:ring-primary"
            />
            <label htmlFor="restart" className="ml-2 text-sm text-slate-300">
              Restart containers after update
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowScheduleModal(false);
                setEditingSchedule(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={saveSchedule}
              isLoading={isLoading}
            >
              {editingSchedule ? 'Update' : 'Create'} Schedule
            </Button>
          </div>
        </div>
      </Modal>

      {/* Update Progress Modal */}
      <Modal
        isOpen={showProgressModal}
        onClose={() => {
          if (updateProgress.status === 'complete' || updateProgress.status === 'error') {
            setShowProgressModal(false);
            setUpdateProgress({
              current: 0,
              total: 0,
              currentImage: '',
              status: '',
              logs: [],
            });
          }
        }}
        title="Updating Images"
        size="lg"
      >
        <div className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-sm text-slate-300 mb-2">
              <span>Progress</span>
              <span>{updateProgress.current} / {updateProgress.total}</span>
            </div>
            <div className="w-full bg-glass-light rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  updateProgress.status === 'error' ? 'bg-danger' :
                  updateProgress.status === 'complete' ? 'bg-success' : 'bg-primary'
                }`}
                style={{ width: `${updateProgress.total > 0 ? (updateProgress.current / updateProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Current image */}
          {updateProgress.currentImage && updateProgress.status !== 'complete' && (
            <div className="flex items-center space-x-2 text-slate-300">
              <LoadingSpinner size="sm" />
              <span className="text-sm">Pulling {updateProgress.currentImage}...</span>
            </div>
          )}

          {/* Log output */}
          <div className="bg-glass-darker rounded-lg p-3 max-h-64 overflow-y-auto">
            {updateProgress.logs.length === 0 ? (
              <div className="text-slate-400 text-sm">Starting updates...</div>
            ) : (
              <div className="space-y-1">
                {updateProgress.logs.map((log, index) => (
                  <div
                    key={index}
                    className={`text-sm font-mono ${
                      log.status === 'completed' ? 'text-success' :
                      log.status === 'failed' ? 'text-danger' :
                      log.status === 'complete' ? 'text-primary font-semibold' :
                      'text-slate-300'
                    }`}
                  >
                    {log.status === 'completed' && '✓ '}
                    {log.status === 'failed' && '✗ '}
                    {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Close button - only show when complete or error */}
          {(updateProgress.status === 'complete' || updateProgress.status === 'error') && (
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                onClick={() => {
                  setShowProgressModal(false);
                  setUpdateProgress({
                    current: 0,
                    total: 0,
                    currentImage: '',
                    status: '',
                    logs: [],
                  });
                }}
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
