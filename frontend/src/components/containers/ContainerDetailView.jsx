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
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const [networkHistory, setNetworkHistory] = useState([]);
  const prevNetworkStats = useRef({ rx: 0, tx: 0, timestamp: 0 });
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
      setCpuHistory([]);
      setMemoryHistory([]);
      setNetworkHistory([]);
      prevNetworkStats.current = { rx: 0, tx: 0, timestamp: 0 };
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
      const stats = data.data;
      setContainerStats(stats);

      // Add to history (keep last 30 data points = 1 minute at 2s intervals)
      const timestamp = Date.now();
      const maxHistory = 30;

      setCpuHistory((prev) => {
        const newHistory = [...prev, { timestamp, value: stats.cpu.percent }];
        return newHistory.slice(-maxHistory);
      });

      setMemoryHistory((prev) => {
        const newHistory = [...prev, { timestamp, value: stats.memory.usage, limit: stats.memory.limit }];
        return newHistory.slice(-maxHistory);
      });

      // Calculate network throughput (bytes/sec) from delta
      const prevNet = prevNetworkStats.current;
      const timeDelta = prevNet.timestamp ? (timestamp - prevNet.timestamp) / 1000 : 2; // seconds
      const rxRate = prevNet.rx ? Math.max(0, (stats.network.rx - prevNet.rx) / timeDelta) : 0;
      const txRate = prevNet.tx ? Math.max(0, (stats.network.tx - prevNet.tx) / timeDelta) : 0;

      // Store current values for next delta calculation
      prevNetworkStats.current = { rx: stats.network.rx, tx: stats.network.tx, timestamp };

      setNetworkHistory((prev) => {
        // Skip first reading (no delta yet)
        if (prevNet.timestamp === 0) return prev;
        const newHistory = [...prev, { timestamp, rx: rxRate, tx: txRate }];
        return newHistory.slice(-maxHistory);
      });
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
              <div className="flex flex-wrap gap-2">
                {container.ports && container.ports.length > 0 ? (
                  (() => {
                    // Create unique port mappings
                    const portMappings = container.ports.map(port => {
                      const publicPort = port.publicPort || port.PublicPort;
                      const privatePort = port.privatePort || port.PrivatePort;
                      const type = port.type || port.Type;
                      const portText = publicPort ? `${publicPort}:${privatePort}/${type}` : `${privatePort}/${type}`;
                      return { publicPort, privatePort, type, portText };
                    });
                    // Deduplicate by portText
                    const uniquePorts = Array.from(
                      new Map(portMappings.map(p => [p.portText, p])).values()
                    );
                    return uniquePorts.map((port, idx) => {
                      if (port.publicPort) {
                        const protocol = port.publicPort === 443 ? 'https' : 'http';
                        const url = `${protocol}://${window.location.hostname}:${port.publicPort}`;
                        return (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary-light underline"
                            title={`Open ${url}`}
                          >
                            {port.portText}
                          </a>
                        );
                      }
                      return (
                        <span key={idx} className="text-slate-400">
                          {port.portText}
                        </span>
                      );
                    });
                  })()
                ) : (
                  <span className="text-slate-400">None</span>
                )}
              </div>
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
            <div className="space-y-6">
              {/* Current Stats Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pb-4 border-b border-glass-border">
                <div>
                  <p className="text-xs text-slate-400">CPU</p>
                  <p className="text-lg font-bold text-white">{containerStats.cpu.percent}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Memory</p>
                  <p className="text-lg font-bold text-white">{containerStats.memory.percent}%</p>
                  <p className="text-xs text-slate-500">{formatBytes(containerStats.memory.usage)} / {formatBytes(containerStats.memory.limit)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Network</p>
                  <p className="text-sm text-white">↓ {formatBytes(containerStats.network.rx)}</p>
                  <p className="text-sm text-white">↑ {formatBytes(containerStats.network.tx)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Block I/O</p>
                  <p className="text-sm text-white">R: {formatBytes(containerStats.blockIO.read)}</p>
                  <p className="text-sm text-white">W: {formatBytes(containerStats.blockIO.write)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">PIDs</p>
                  <p className="text-lg font-bold text-white">{containerStats.pids}</p>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* CPU Chart */}
                <div>
                  <p className="text-sm text-slate-400 mb-2">CPU Usage</p>
                  <div className="h-32">
                    {cpuHistory.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cpuHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                          <XAxis
                            dataKey="timestamp"
                            stroke="rgba(148, 163, 184, 0.3)"
                            tick={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="rgba(148, 163, 184, 0.3)"
                            tick={{ fill: 'rgba(148, 163, 184, 0.7)', fontSize: 10 }}
                            domain={[0, 100]}
                            ticks={[0, 50, 100]}
                            tickFormatter={(v) => `${v}%`}
                            width={35}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.95)',
                              border: '1px solid rgba(148, 163, 184, 0.2)',
                              borderRadius: '8px',
                              color: '#fff',
                            }}
                            labelFormatter={(v) => new Date(v).toLocaleTimeString()}
                            formatter={(v) => [`${v}%`, 'CPU']}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#3b82f6"
                            fill="rgba(59, 130, 246, 0.2)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                        Collecting data...
                      </div>
                    )}
                  </div>
                </div>

                {/* Memory Chart */}
                <div>
                  <p className="text-sm text-slate-400 mb-2">Memory Usage</p>
                  <div className="h-32">
                    {memoryHistory.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={memoryHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                          <XAxis
                            dataKey="timestamp"
                            stroke="rgba(148, 163, 184, 0.3)"
                            tick={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="rgba(148, 163, 184, 0.3)"
                            tick={{ fill: 'rgba(148, 163, 184, 0.7)', fontSize: 10 }}
                            domain={[0, memoryHistory[0]?.limit || 'auto']}
                            tickFormatter={(v) => formatBytes(v)}
                            width={50}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.95)',
                              border: '1px solid rgba(148, 163, 184, 0.2)',
                              borderRadius: '8px',
                              color: '#fff',
                            }}
                            labelFormatter={(v) => new Date(v).toLocaleTimeString()}
                            formatter={(v) => [formatBytes(v), 'Memory']}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#10b981"
                            fill="rgba(16, 185, 129, 0.2)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                        Collecting data...
                      </div>
                    )}
                  </div>
                </div>

                {/* Network Chart */}
                <div>
                  <p className="text-sm text-slate-400 mb-2">Network Throughput</p>
                  <div className="h-32">
                    {networkHistory.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={networkHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                          <XAxis
                            dataKey="timestamp"
                            stroke="rgba(148, 163, 184, 0.3)"
                            tick={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="rgba(148, 163, 184, 0.3)"
                            tick={{ fill: 'rgba(148, 163, 184, 0.7)', fontSize: 10 }}
                            tickFormatter={(v) => `${formatBytes(v)}/s`}
                            width={60}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.95)',
                              border: '1px solid rgba(148, 163, 184, 0.2)',
                              borderRadius: '8px',
                              color: '#fff',
                            }}
                            labelFormatter={(v) => new Date(v).toLocaleTimeString()}
                            formatter={(v, name) => [`${formatBytes(v)}/s`, name === 'rx' ? 'Download' : 'Upload']}
                          />
                          <Area
                            type="monotone"
                            dataKey="rx"
                            stroke="#8b5cf6"
                            fill="rgba(139, 92, 246, 0.2)"
                            strokeWidth={2}
                            name="rx"
                          />
                          <Area
                            type="monotone"
                            dataKey="tx"
                            stroke="#f59e0b"
                            fill="rgba(245, 158, 11, 0.2)"
                            strokeWidth={2}
                            name="tx"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                        Collecting data...
                      </div>
                    )}
                  </div>
                </div>
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
