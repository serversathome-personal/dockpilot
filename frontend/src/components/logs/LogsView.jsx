import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../store';
import { containersAPI } from '../../api/containers.api';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Badge from '../common/Badge';
import {
  PlayIcon,
  PauseIcon,
  TrashIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CheckIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';

// Color palette for different containers
const CONTAINER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
  '#14b8a6', // teal
];

export default function LogsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { containers, setContainers, addNotification } = useStore();
  const [selectedContainers, setSelectedContainers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showContainerPicker, setShowContainerPicker] = useState(false);
  const [containerSearch, setContainerSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [streamFilter, setStreamFilter] = useState('all'); // 'all', 'stdout', 'stderr'
  const logsEndRef = useRef(null);
  const logsContainerRef = useRef(null);
  const containerColorsRef = useRef({});
  const [autoScroll, setAutoScroll] = useState(true);
  const initialSelectionDoneRef = useRef(false);

  // Load containers on mount
  useEffect(() => {
    loadContainers();
  }, []);

  // Handle URL params for pre-selecting containers
  useEffect(() => {
    if (isLoading || containers.length === 0 || initialSelectionDoneRef.current) return;

    const containerIds = searchParams.get('containers');
    const stackName = searchParams.get('stack');

    if (containerIds) {
      // Select specific containers by ID
      const ids = containerIds.split(',');
      const containersToSelect = containers.filter(c => ids.includes(c.id));
      if (containersToSelect.length > 0) {
        initialSelectionDoneRef.current = true;
        setSelectedContainers(containersToSelect);
        setAutoScroll(true);
        // Queue containers for subscription
        pendingSubscriptionsRef.current = [...containersToSelect];
        initWebSocket();
        setTimeout(scrollToBottom, 500);
        // Clear the URL params
        setSearchParams({});
      }
    } else if (stackName) {
      // Select all containers belonging to a stack
      const stackContainers = containers.filter(c => {
        // Check if container belongs to the stack by looking at labels or project name
        const labels = c.labels || {};
        const projectName = labels['com.docker.compose.project'];
        return projectName === stackName;
      });
      if (stackContainers.length > 0) {
        initialSelectionDoneRef.current = true;
        setSelectedContainers(stackContainers);
        setAutoScroll(true);
        // Queue containers for subscription
        pendingSubscriptionsRef.current = [...stackContainers];
        initWebSocket();
        setTimeout(scrollToBottom, 500);
        // Clear the URL params
        setSearchParams({});
      }
    }
  }, [isLoading, containers, searchParams]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [logs, autoScroll]);

  // Force scroll to bottom when containers are selected
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (logsEndRef.current) {
        logsEndRef.current.scrollIntoView({ behavior: 'auto' });
      }
    }, 100);
  }, []);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  }, []);

  const loadContainers = async () => {
    try {
      setIsLoading(true);
      const data = await containersAPI.list({ all: true });
      setContainers(data.data || []);
    } catch (error) {
      console.error('Failed to load containers:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load containers',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Assign colors to containers
  const getContainerColor = (containerId) => {
    if (!containerColorsRef.current[containerId]) {
      const usedColors = Object.values(containerColorsRef.current);
      const availableColors = CONTAINER_COLORS.filter(c => !usedColors.includes(c));
      containerColorsRef.current[containerId] = availableColors.length > 0
        ? availableColors[0]
        : CONTAINER_COLORS[Object.keys(containerColorsRef.current).length % CONTAINER_COLORS.length];
    }
    return containerColorsRef.current[containerId];
  };

  // WebSocket connection ref
  const wsRef = useRef(null);
  const wsConnectedRef = useRef(false);
  const pendingSubscriptionsRef = useRef([]);
  const selectedContainersRef = useRef([]);
  const isStreamingRef = useRef(true);

  // Keep refs in sync with state
  useEffect(() => {
    selectedContainersRef.current = selectedContainers;
  }, [selectedContainers]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Initialize WebSocket connection
  const initWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/logs`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Logs WebSocket connected');
      wsConnectedRef.current = true;
      // Subscribe to any pending containers
      pendingSubscriptionsRef.current.forEach(container => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          payload: { containerId: container.id, tail: 100 }
        }));
      });
      pendingSubscriptionsRef.current = [];
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'log' && data.containerId) {
          // Use ref to get current selected containers (avoids stale closure)
          const container = selectedContainersRef.current.find(c => c.id === data.containerId);
          if (container && isStreamingRef.current) {
            const color = getContainerColor(data.containerId);
            const logLine = data.data?.trim();
            if (logLine) {
              setLogs(prev => [...prev, {
                id: `${data.containerId}-${Date.now()}-${Math.random()}`,
                containerId: data.containerId,
                containerName: container.name,
                message: logLine,
                timestamp: new Date(),
                color,
                stream: data.stream || 'stdout',
              }].slice(-2000)); // Keep last 2000 lines
            }
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('Logs WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Logs WebSocket closed');
      wsConnectedRef.current = false;
      // Try to reconnect after a delay
      setTimeout(() => {
        if (selectedContainersRef.current.length > 0) {
          initWebSocket();
        }
      }, 3000);
    };

    wsRef.current = ws;
  }, []);

  // Start streaming logs for a container
  const startLogStream = (container) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      initWebSocket();
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'subscribe',
      payload: { containerId: container.id, tail: 100 }
    }));
  };

  // Stop streaming logs for a container
  const stopLogStream = (containerId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        payload: { containerId }
      }));
    }
  };

  // Toggle container selection
  const toggleContainer = (container) => {
    const isSelected = selectedContainers.some(c => c.id === container.id);
    if (isSelected) {
      stopLogStream(container.id);
      setSelectedContainers(prev => prev.filter(c => c.id !== container.id));
      // Clear logs from this container
      setLogs(prev => prev.filter(log => log.containerId !== container.id));
    } else {
      setSelectedContainers(prev => [...prev, container]);
      setAutoScroll(true);
      // Initialize WebSocket if needed, then subscribe
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        // Queue container for subscription when WS connects
        pendingSubscriptionsRef.current.push(container);
        initWebSocket();
      } else {
        startLogStream(container);
      }
      // Scroll to bottom after logs start arriving
      setTimeout(scrollToBottom, 500);
    }
  };

  // Select all running containers
  const selectAllRunning = () => {
    const runningContainers = containers.filter(c => c.state?.toLowerCase() === 'running');
    setSelectedContainers(runningContainers);
    setAutoScroll(true);
    // Initialize WebSocket and subscribe to all
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // Queue all running containers for subscription when WS connects
      pendingSubscriptionsRef.current = [...runningContainers];
      initWebSocket();
    } else {
      runningContainers.forEach(c => {
        wsRef.current.send(JSON.stringify({
          type: 'subscribe',
          payload: { containerId: c.id, tail: 100 }
        }));
      });
    }
    // Scroll to bottom after logs start arriving
    setTimeout(scrollToBottom, 500);
  };

  // Clear all selections
  const clearAllSelections = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      selectedContainers.forEach(c => {
        wsRef.current.send(JSON.stringify({
          type: 'unsubscribe',
          payload: { containerId: c.id }
        }));
      });
    }
    setSelectedContainers([]);
    setLogs([]);
  };

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
  };

  // Copy logs to clipboard (with fallback for non-HTTPS contexts)
  const copyLogs = async () => {
    const logText = filteredLogs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const container = selectedContainers.length > 1 ? `[${log.containerName}] ` : '';
      const stream = log.stream === 'stderr' ? '[err] ' : '';
      return `${time} ${container}${stream}${log.message}`;
    }).join('\n');

    try {
      // Try modern clipboard API first (requires HTTPS)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(logText);
      } else {
        // Fallback for non-secure contexts (HTTP)
        const textArea = document.createElement('textarea');
        textArea.value = logText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!success) {
          throw new Error('execCommand copy failed');
        }
      }
      addNotification({
        type: 'success',
        message: `Copied ${filteredLogs.length} log lines to clipboard`,
      });
    } catch (err) {
      addNotification({
        type: 'error',
        message: 'Failed to copy logs to clipboard',
      });
    }
  };

  // Toggle streaming
  const toggleStreaming = () => {
    setIsStreaming(prev => !prev);
  };

  // Filter logs based on selected containers, stream type, and search
  const selectedContainerIds = new Set(selectedContainers.map(c => c.id));
  const filteredLogs = logs
    .filter(log => selectedContainerIds.has(log.containerId))
    .filter(log => streamFilter === 'all' || log.stream === streamFilter)
    .filter(log =>
      !searchTerm ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.containerName.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // Filter and sort containers for picker
  const filteredContainers = [...containers]
    .filter(c => !containerSearch || c.name?.toLowerCase().includes(containerSearch.toLowerCase()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Logs</h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time container logs • {selectedContainers.length} container{selectedContainers.length !== 1 ? 's' : ''} selected
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isStreaming ? 'primary' : 'secondary'}
            onClick={toggleStreaming}
            className="flex items-center gap-2"
          >
            {isStreaming ? (
              <>
                <PauseIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Pause</span>
              </>
            ) : (
              <>
                <PlayIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Resume</span>
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={clearLogs}>
            <TrashIcon className="h-4 w-4" />
            <span className="hidden sm:inline ml-2">Clear</span>
          </Button>
          <Button variant="secondary" onClick={copyLogs} disabled={filteredLogs.length === 0}>
            <ClipboardDocumentIcon className="h-4 w-4" />
            <span className="hidden sm:inline ml-2">Copy</span>
          </Button>
          <Button variant="secondary" onClick={loadContainers}>
            <ArrowPathIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Container Picker & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Container Picker */}
        <div className="relative">
          <Button
            variant="secondary"
            onClick={() => setShowContainerPicker(!showContainerPicker)}
            className="w-full sm:w-auto justify-between"
          >
            <span>Select Containers ({selectedContainers.length})</span>
          </Button>

          {showContainerPicker && (
            <div className="absolute top-full left-0 mt-2 w-80 max-h-[70vh] overflow-auto bg-glass-dark border border-glass-border rounded-lg shadow-xl z-50">
              <div className="sticky top-0 bg-glass-dark p-2 border-b border-glass-border">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search containers..."
                    value={containerSearch}
                    onChange={(e) => setContainerSearch(e.target.value)}
                    className="w-full px-3 py-2 pr-8 bg-glass-darker border border-glass-border rounded text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {containerSearch && (
                    <button
                      onClick={() => setContainerSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-600 hover:bg-slate-500 text-white"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={selectAllRunning}
                    className="text-xs text-primary hover:text-primary-light"
                  >
                    Select all running
                  </button>
                  <button
                    onClick={clearAllSelections}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <div className="p-2 space-y-1">
                {filteredContainers.map(container => {
                  const isSelected = selectedContainers.some(c => c.id === container.id);
                  const isRunning = container.state?.toLowerCase() === 'running';
                  return (
                    <button
                      key={container.id}
                      onClick={() => toggleContainer(container)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-primary/20 text-white'
                          : 'hover:bg-glass-light text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isSelected && (
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getContainerColor(container.id) }}
                          />
                        )}
                        <span className="truncate">{container.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={isRunning ? 'success' : 'default'} className="text-xs">
                          {container.state}
                        </Badge>
                        {isSelected && <CheckIcon className="h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Stream Filter */}
        <select
          value={streamFilter}
          onChange={(e) => setStreamFilter(e.target.value)}
          className="px-3 py-2 bg-glass-dark border border-glass-border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option value="all">All Streams</option>
          <option value="stdout">stdout</option>
          <option value="stderr">stderr</option>
        </select>

        {/* Log Search */}
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2 bg-glass-dark border border-glass-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-600 hover:bg-slate-500 text-white"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Selected Containers Tags */}
      {selectedContainers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedContainers.map(container => (
            <button
              key={container.id}
              onClick={() => toggleContainer(container)}
              className="flex items-center gap-2 px-3 py-1 rounded-full text-sm text-white hover:opacity-80 transition-opacity"
              style={{ backgroundColor: getContainerColor(container.id) + '40', borderColor: getContainerColor(container.id), borderWidth: 1 }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getContainerColor(container.id) }}
              />
              {container.name}
              <XMarkIcon className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {/* Color Legend - shown when multiple containers selected and logs are present */}
      {selectedContainers.length > 1 && filteredLogs.length > 0 && (
        <div className="px-3 py-2 bg-glass-dark border border-glass-border rounded-lg">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs text-slate-400 font-medium">Legend:</span>
            {selectedContainers.map(container => (
              <div key={container.id} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getContainerColor(container.id) }}
                />
                <span className="text-sm text-slate-300">{container.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Click outside to close picker */}
      {showContainerPicker && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowContainerPicker(false)}
        />
      )}

      {/* Logs Display */}
      <div
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 bg-glass-darker border border-glass-border rounded-lg overflow-auto font-mono text-sm"
      >
        {selectedContainers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
            <p className="text-lg mb-2">No containers selected</p>
            <p className="text-sm">Click "Select Containers" to choose containers to monitor</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
            <p className="text-lg mb-2">
              {searchTerm ? 'No matching logs' : 'Waiting for logs...'}
            </p>
            <p className="text-sm">
              {searchTerm ? 'Try a different search term' : 'Logs will appear here in real-time'}
            </p>
            {isStreaming && !searchTerm && (
              <div className="mt-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                <span className="text-xs">Streaming...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex py-0.5 hover:bg-glass-light/30 px-2 rounded"
              >
                {selectedContainers.length > 1 && (
                  <span
                    className="flex-shrink-0 w-32 truncate mr-3 font-semibold"
                    style={{ color: log.color }}
                    title={log.containerName}
                  >
                    {log.containerName}
                  </span>
                )}
                <span className="text-slate-500 flex-shrink-0 mr-3">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className={`flex-shrink-0 w-8 mr-2 text-xs ${log.stream === 'stderr' ? 'text-amber-500' : 'text-slate-600'}`}>
                  {log.stream === 'stderr' ? 'err' : 'out'}
                </span>
                <span className="text-slate-200 whitespace-pre-wrap break-all">
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <div className="flex items-center gap-4">
          <span>{filteredLogs.length} lines</span>
          {searchTerm && <span>({logs.length} total)</span>}
        </div>
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <>
              <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
              <span>Live</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 bg-warning rounded-full" />
              <span>Paused</span>
            </>
          )}
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="ml-2 text-primary hover:text-primary-light"
            >
              Jump to bottom
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
