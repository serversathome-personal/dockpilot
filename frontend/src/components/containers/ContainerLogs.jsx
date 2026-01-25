import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import Button from '../common/Button';
import { TrashIcon, ClipboardDocumentIcon, CheckIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

export default function ContainerLogs({ containerId }) {
  const navigate = useNavigate();
  const logsEndRef = useRef(null);
  const logsContainerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logs, setLogs] = useState([]);
  const [ws, setWs] = useState(null);
  const [logsCopied, setLogsCopied] = useState(false);
  const { addNotification } = useStore();

  // Maximum number of log lines to keep in memory
  const MAX_LOGS = 1000;

  useEffect(() => {
    // Connect to WebSocket through the Vite proxy
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port || (protocol === 'wss:' ? '443' : '80');

    // In development, Vite runs on port 3000 and proxies /ws to backend
    // In production, use the same host as the app
    const wsUrl = `${protocol}//${host}:${port}/ws/logs`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      // Subscribe to container logs
      websocket.send(JSON.stringify({
        type: 'subscribe',
        payload: {
          containerId,
          tail: 100,
        },
      }));
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'log':
            if (message.containerId === containerId) {
              setLogs((prev) => {
                const newLogs = [...prev, message.data];
                // Keep only the last MAX_LOGS entries to prevent memory leak
                if (newLogs.length > MAX_LOGS) {
                  return newLogs.slice(-MAX_LOGS);
                }
                return newLogs;
              });
            }
            break;
          case 'subscribed':
            console.log('Subscribed to container logs:', message.containerId);
            break;
          case 'error':
            console.error('WebSocket error:', message.message);
            addNotification({
              type: 'error',
              message: message.message,
            });
            break;
          case 'stream_end':
            console.log('Log stream ended');
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Don't spam notifications for every WebSocket error
    };

    websocket.onclose = (event) => {
      console.log('WebSocket disconnected');
      // Only show notification if it wasn't a clean close
      if (!event.wasClean && event.code !== 1000) {
        console.warn('WebSocket closed unexpectedly:', event.code, event.reason);
      }
    };

    setWs(websocket);

    // Cleanup on unmount
    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
          type: 'unsubscribe',
          payload: { containerId },
        }));
      }
      websocket.close();
    };
  }, [containerId, addNotification]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current && logsContainerRef.current) {
      // Scroll within the logs container only, don't scroll the entire page
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleCopyLogs = async () => {
    const logText = logs.join('\n');
    if (!logText) {
      addNotification({ type: 'warning', message: 'No logs to copy' });
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(logText);
      } else {
        // Fallback for HTTP contexts
        const textArea = document.createElement('textarea');
        textArea.value = logText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2000);
    } catch (error) {
      addNotification({ type: 'error', message: 'Failed to copy logs' });
    }
  };

  const handleOpenInLogsPage = () => {
    navigate(`/logs?containers=${containerId}`);
  };

  const handleScroll = () => {
    if (!logsContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    } else if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-glass-border bg-glass-darker text-primary focus:ring-primary focus:ring-offset-0"
            />
            <span>Auto-scroll</span>
          </label>
          <span className="text-xs text-slate-400">
            {logs.length} lines
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearLogs}
            className="flex items-center"
          >
            <TrashIcon className="h-4 w-4 mr-1" />
            Clear
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            className="flex items-center"
          >
            {logsCopied ? (
              <CheckIcon className="h-4 w-4 mr-1 text-green-400" />
            ) : (
              <ClipboardDocumentIcon className="h-4 w-4 mr-1" />
            )}
            {logsCopied ? 'Copied!' : 'Copy'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenInLogsPage}
            className="flex items-center"
          >
            <DocumentTextIcon className="h-4 w-4 mr-1" />
            Open in Logs Page
          </Button>
        </div>
      </div>

      <div
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="bg-black/50 rounded-lg border border-glass-border p-4 h-96 overflow-y-auto font-mono text-xs text-slate-300"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 text-center py-8">
            No logs available. Waiting for output...
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="hover:bg-white/5 px-2 py-0.5">
              {log}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
