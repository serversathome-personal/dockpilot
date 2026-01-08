import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { containersAPI } from '../../api/containers.api';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Badge from '../common/Badge';
import ContainerLogs from './ContainerLogs';
import { formatBytes, formatUptime, formatPorts } from '../../utils/formatters';
import {
  ArrowLeftIcon,
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  PauseIcon,
  TrashIcon,
  ArrowUpCircleIcon,
} from '@heroicons/react/24/outline';

export default function ContainerDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoading, setLoading, addNotification } = useStore();
  const [container, setContainer] = useState(null);
  const [containerDetails, setContainerDetails] = useState(null);
  const [containerStats, setContainerStats] = useState(null);
  const [statsInterval, setStatsInterval] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateOutput, setUpdateOutput] = useState('');
  const updateContentRef = useRef(null);

  useEffect(() => {
    loadContainerDetails();

    return () => {
      if (statsInterval) {
        clearInterval(statsInterval);
      }
    };
  }, [id]);

  // Auto-scroll update modal to bottom when content updates
  useEffect(() => {
    if (updateContentRef.current) {
      updateContentRef.current.scrollTop = updateContentRef.current.scrollHeight;
    }
  }, [updateOutput]);

  // Start stats polling only when container is loaded and running
  useEffect(() => {
    if (container && container.state?.toLowerCase() === 'running') {
      loadStats();
      const interval = setInterval(loadStats, 2000);
      setStatsInterval(interval);

      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    } else {
      // Clear stats if container is not running
      setContainerStats(null);
      if (statsInterval) {
        clearInterval(statsInterval);
        setStatsInterval(null);
      }
    }
  }, [container?.state]);

  const loadContainerDetails = async () => {
    try {
      setLoading(true);
      const [containerData, detailsData] = await Promise.all([
        containersAPI.list({ all: true }),
        containersAPI.get(id),
      ]);

      const currentContainer = containerData.data.find((c) => c.id === id || c.name === id);
      setContainer(currentContainer);
      setContainerDetails(detailsData.data);
    } catch (error) {
      console.error('Failed to load container details:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load container details',
      });
      navigate('/containers');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!id || !container) return;

    // Only load stats for running containers
    if (container.state?.toLowerCase() !== 'running') {
      return;
    }

    try {
      const data = await containersAPI.stats(id);
      setContainerStats(data.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
      // Clear the interval if stats are no longer available
      if (statsInterval) {
        clearInterval(statsInterval);
        setStatsInterval(null);
      }
    }
  };

  const handleAction = async (action, actionLabel) => {
    try {
      setLoading(true);
      await containersAPI[action](id);
      addNotification({
        type: 'success',
        message: `Container ${actionLabel} successfully`,
      });
      await loadContainerDetails();
    } catch (error) {
      console.error(`Failed to ${actionLabel} container:`, error);
      addNotification({
        type: 'error',
        message: error.message || `Failed to ${actionLabel} container`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    // Clear previous output and setup modal
    setUpdateOutput('');
    setShowUpdateModal(true);
    setLoading(true);

    // Connect to SSE endpoint
    const apiUrl = import.meta.env.DEV
      ? `http://${window.location.hostname}:5000/api/containers/${id}/stream-update`
      : `/api/containers/${id}/stream-update`;
    const eventSource = new EventSource(apiUrl);

    eventSource.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);

      if (type === 'stdout' || type === 'stderr') {
        setUpdateOutput((prev) => prev + data);
      } else if (type === 'done') {
        eventSource.close();
        addNotification({
          type: 'success',
          message: data
        });
        setLoading(false);
        loadContainerDetails();
      } else if (type === 'error') {
        eventSource.close();
        addNotification({
          type: 'error',
          message: data
        });
        setLoading(false);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
      addNotification({
        type: 'error',
        message: 'Failed to stream update output'
      });
      setLoading(false);
    };
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete container "${container?.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      await containersAPI.remove(id, { force: true });
      addNotification({
        type: 'success',
        message: `Container deleted successfully`,
      });
      navigate('/containers');
    } catch (error) {
      console.error('Failed to delete container:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to delete container',
      });
      setLoading(false);
    }
  };

  if (isLoading && !container) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!container) {
    return null;
  }

  const getStateBadge = (state) => {
    const stateColors = {
      running: 'success',
      exited: 'default',
      stopped: 'default',
      paused: 'warning',
      restarting: 'warning',
    };
    return <Badge variant={stateColors[state] || 'default'}>{state}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => navigate('/containers')}>
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white">{container.name}</h1>
            <div className="flex items-center space-x-3 mt-2">
              {getStateBadge(container.state)}
              <span className="text-sm text-slate-400 font-mono">{container.id.substring(0, 12)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-2">
          {container.state === 'exited' && (
            <Button
              variant="success"
              onClick={() => handleAction('start', 'started')}
              disabled={isLoading}
            >
              <PlayIcon className="h-5 w-5 mr-2" />
              Start
            </Button>
          )}
          {container.state === 'running' && (
            <>
              <Button
                variant="secondary"
                onClick={() => handleAction('restart', 'restarted')}
                disabled={isLoading}
              >
                <ArrowPathIcon className="h-5 w-5 mr-2" />
                Restart
              </Button>
              <Button
                variant="warning"
                onClick={() => handleAction('pause', 'paused')}
                disabled={isLoading}
              >
                <PauseIcon className="h-5 w-5 mr-2" />
                Pause
              </Button>
              <Button
                variant="warning"
                onClick={() => handleAction('stop', 'stopped')}
                disabled={isLoading}
              >
                <StopIcon className="h-5 w-5 mr-2" />
                Stop
              </Button>
            </>
          )}
          {container.state === 'paused' && (
            <Button
              variant="success"
              onClick={() => handleAction('unpause', 'unpaused')}
              disabled={isLoading}
            >
              <PlayIcon className="h-5 w-5 mr-2" />
              Unpause
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => loadContainerDetails()}
            disabled={isLoading}
          >
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={handleUpdate}
            disabled={isLoading}
          >
            <ArrowUpCircleIcon className="h-5 w-5 mr-2" />
            Update
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={isLoading}>
            <TrashIcon className="h-5 w-5 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Overview Section */}
      <Card title="Overview">
        {containerDetails && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <p className="text-sm text-slate-400">Image</p>
              <p className="text-white break-all">{container.image}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Status</p>
              <p className="text-white">{container.status}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Created</p>
              <p className="text-white">{new Date(containerDetails.created).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Ports</p>
              <p className="text-white">{formatPorts(container.ports) || 'None'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-slate-400 mb-2">Networks</p>
              <div className="flex flex-wrap gap-2">
                {container.networks?.map((network) => (
                  <Badge key={network} variant="default">
                    {network}
                  </Badge>
                )) || <span className="text-slate-400">None</span>}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Stats Section */}
      {container?.state?.toLowerCase() === 'running' && (
        <Card title="Resource Usage">
          {containerStats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-slate-400">CPU Usage</p>
                <p className="text-2xl font-bold text-white">{containerStats.cpu.percent}%</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Memory Usage</p>
                <p className="text-2xl font-bold text-white">
                  {formatBytes(containerStats.memory.usage)} / {formatBytes(containerStats.memory.limit)}
                </p>
                <p className="text-sm text-slate-400">{containerStats.memory.percent}%</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Network I/O</p>
                <p className="text-white">
                  ↓ {formatBytes(containerStats.network.rx)} / ↑ {formatBytes(containerStats.network.tx)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Block I/O</p>
                <p className="text-white">
                  R: {formatBytes(containerStats.blockIO.read)} / W: {formatBytes(containerStats.blockIO.write)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400">PIDs</p>
                <p className="text-xl font-bold text-white">{containerStats.pids}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          )}
        </Card>
      )}

      {/* Logs Section */}
      <Card title="Logs">
        {container ? (
          <ContainerLogs containerId={id} />
        ) : (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        )}
      </Card>

      {/* Inspect Section */}
      <Card title="Raw Configuration">
        {containerDetails && (
          <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto text-xs text-slate-300 font-mono max-h-[600px] overflow-y-auto">
            {JSON.stringify(containerDetails, null, 2)}
          </pre>
        )}
      </Card>

      {/* Update Output Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-glass-dark border border-glass-border rounded-lg shadow-glass w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Update Container: {container?.name}</h3>
              <button
                onClick={() => {
                  setShowUpdateModal(false);
                  setUpdateOutput('');
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="flex items-center justify-between">
                <p className="text-slate-300 text-sm">Docker pull output:</p>
              </div>
              <div
                ref={updateContentRef}
                className="bg-black/80 rounded-lg p-4 border border-slate-700 overflow-auto max-h-[500px]"
              >
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  <span className="text-green-400">{updateOutput || 'Initializing...'}</span>
                </pre>
              </div>
              <div className="flex justify-end pt-4">
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowUpdateModal(false);
                    setUpdateOutput('');
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
