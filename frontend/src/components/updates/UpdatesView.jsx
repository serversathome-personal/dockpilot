import { useEffect, useState } from 'react';
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

    try {
      setIsUpdating(true);
      const data = await updatesAPI.executeUpdates({
        images: selectedUpdates,
        restartContainers: true,
      });

      addNotification({
        type: 'success',
        message: `Successfully updated ${selectedUpdates.length} image(s)`,
      });

      setSelectedUpdates([]);
      await checkForUpdates();
      await loadHistory();
    } catch (error) {
      console.error('Failed to execute updates:', error);
      addNotification({
        type: 'error',
        message: 'Failed to execute updates',
      });
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

  const updatesColumns = [
    {
      key: 'select',
      label: '',
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
      label: 'Repository',
      sortable: true,
    },
    {
      key: 'currentTag',
      label: 'Current Tag',
      sortable: true,
    },
    {
      key: 'currentDigest',
      label: 'Current',
      sortable: false,
      render: (digest) => <span className="font-mono text-xs">{digest}</span>,
    },
    {
      key: 'latestDigest',
      label: 'Latest',
      sortable: false,
      render: (digest) => <span className="font-mono text-xs">{digest}</span>,
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Updates</h1>
          <p className="mt-2 text-slate-400">Manage automatic image updates</p>
        </div>
        <div className="flex space-x-3">
          {activeTab === 'available' && (
            <>
              <Button
                variant="primary"
                onClick={checkForUpdates}
                isLoading={isChecking}
                className="flex items-center"
              >
                <ArrowPathIcon className="h-5 w-5 mr-2" />
                Check for Updates
              </Button>
              {selectedUpdates.length > 0 && (
                <Button
                  variant="success"
                  onClick={executeUpdates}
                  isLoading={isUpdating}
                >
                  Update Selected ({selectedUpdates.length})
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
              <PlusIcon className="h-5 w-5 mr-2" />
              New Schedule
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-glass-border">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-400 hover:text-white hover:border-slate-300'
              }`}
            >
              <tab.icon className="h-5 w-5 mr-2" />
              {tab.label}
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
                        Update type: {schedule.updateType === 'minor' ? 'Minor updates only' : 'All updates'}
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
    </div>
  );
}
