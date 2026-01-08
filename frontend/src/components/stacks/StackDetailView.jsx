import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { stacksAPI } from '../../api/stacks.api';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Badge from '../common/Badge';
import { ArrowLeftIcon, PlayIcon, StopIcon, ArrowPathIcon, TrashIcon, ArrowUpCircleIcon, ArrowDownCircleIcon } from '@heroicons/react/24/outline';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';

export default function StackDetailView() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { isLoading, setLoading, addNotification } = useStore();
  const [stack, setStack] = useState(null);
  const [composeContent, setComposeContent] = useState('');
  const [envVars, setEnvVars] = useState({});
  const [envVarsText, setEnvVarsText] = useState('');
  const [logs, setLogs] = useState('');
  const [isEditingCompose, setIsEditingCompose] = useState(false);
  const [isEditingEnv, setIsEditingEnv] = useState(false);
  const [isOperationInProgress, setIsOperationInProgress] = useState(false);
  const [operationOutput, setOperationOutput] = useState('');
  const logsRef = useRef(null);
  const logsContentRef = useRef(null);

  useEffect(() => {
    loadStackDetails();
    loadLogs();
  }, [name]);

  // Auto-refresh logs continuously
  useEffect(() => {
    // Refresh every 2 seconds during operations, every 5 seconds otherwise
    const refreshInterval = isOperationInProgress ? 2000 : 5000;
    const interval = setInterval(loadLogs, refreshInterval);
    return () => clearInterval(interval);
  }, [isOperationInProgress, name]);

  // Auto-scroll logs to bottom when content updates
  useEffect(() => {
    if (logsContentRef.current) {
      logsContentRef.current.scrollTop = logsContentRef.current.scrollHeight;
    }
  }, [operationOutput, logs]);

  const loadStackDetails = async () => {
    try {
      setLoading(true);
      const [stackData, composeData, envData] = await Promise.all([
        stacksAPI.get(name),
        stacksAPI.getCompose(name),
        stacksAPI.getEnv(name),
      ]);

      setStack(stackData.data);

      // Convert compose object to YAML string
      const yaml = await import('js-yaml');
      setComposeContent(yaml.dump(composeData.data));

      // Convert env vars object to text format
      const envObj = envData.data || {};
      setEnvVars(envObj);
      const envText = Object.entries(envObj)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      setEnvVarsText(envText);
    } catch (error) {
      console.error('Failed to load stack details:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load stack details',
      });
      navigate('/stacks');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    if (!stack) return;

    try {
      const data = await stacksAPI.getLogs(name, { tail: 500, timestamps: true });
      setLogs(data.data.logs || '');
    } catch (error) {
      console.error('Failed to load logs:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load logs',
      });
    }
  };

  const handleSaveCompose = async () => {
    try {
      setLoading(true);
      await stacksAPI.updateCompose(name, composeContent);
      addNotification({
        type: 'success',
        message: 'Compose file updated successfully',
      });
      setIsEditingCompose(false);
      await loadStackDetails();
    } catch (error) {
      console.error('Failed to update compose file:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to update compose file',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEnv = async () => {
    try {
      setLoading(true);

      // Parse text format back to object
      const envObj = {};
      const lines = envVarsText.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const equalsIndex = trimmedLine.indexOf('=');
          if (equalsIndex > 0) {
            const key = trimmedLine.substring(0, equalsIndex).trim();
            const value = trimmedLine.substring(equalsIndex + 1).trim();
            if (key) {
              envObj[key] = value;
            }
          }
        }
      }

      await stacksAPI.updateEnv(name, envObj);
      addNotification({
        type: 'success',
        message: 'Environment variables updated successfully',
      });
      setIsEditingEnv(false);
      setEnvVars(envObj);
      await loadStackDetails();
    } catch (error) {
      console.error('Failed to update environment variables:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to update environment variables',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStackAction = async (action, actionLabel) => {
    try {
      setLoading(true);
      const result = await stacksAPI[action](name);

      // Capture operation output if available
      if (result.output) {
        setOperationOutput(result.output);
      }

      addNotification({
        type: 'success',
        message: `Stack ${actionLabel} successfully`,
      });
      await loadStackDetails();
      return result;
    } catch (error) {
      console.error(`Failed to ${actionLabel} stack:`, error);
      addNotification({
        type: 'error',
        message: error.message || `Failed to ${actionLabel} stack`,
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      setLoading(true);
      const result = await stacksAPI.update(name);

      // Capture operation output if available
      if (result.output) {
        setOperationOutput(result.output);
      }

      addNotification({
        type: 'success',
        message: `Stack updated successfully`,
      });
      await loadStackDetails();
      return result;
    } catch (error) {
      console.error('Failed to update stack:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to update stack',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete stack "${name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      await stacksAPI.delete(name, { removeVolumes: false });
      addNotification({
        type: 'success',
        message: `Stack ${name} deleted successfully`,
      });
      navigate('/stacks');
    } catch (error) {
      console.error('Failed to delete stack:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to delete stack',
      });
      setLoading(false);
    }
  };

  if (isLoading && !stack) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!stack) {
    return null;
  }

  const getStatusBadge = (status) => {
    if (status === 'running') return <Badge variant="success">Running</Badge>;
    if (status === 'stopped') return <Badge variant="default">Stopped</Badge>;
    return <Badge variant="warning">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => navigate('/stacks')}>
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white">Stack: {name}</h1>
            <div className="flex items-center space-x-3 mt-2">
              {getStatusBadge(stack.status)}
              <span className="text-sm text-slate-400">
                {stack.containerCount} containers
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-2">
          {stack.status === 'stopped' && (
            <Button
              variant="success"
              onClick={async () => {
                // Clear previous operation output
                setOperationOutput('');

                // Scroll to logs section
                logsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

                // Start streaming
                setIsOperationInProgress(true);
                setLoading(true);

                // Connect to SSE endpoint (EventSource doesn't support relative URLs through Vite proxy in some browsers)
                const apiUrl = import.meta.env.DEV
                  ? `http://${window.location.hostname}:5000/api/stacks/${name}/stream-start`
                  : `/api/stacks/${name}/stream-start`;
                const eventSource = new EventSource(apiUrl);

                eventSource.onmessage = (event) => {
                  const { type, data } = JSON.parse(event.data);

                  if (type === 'stdout' || type === 'stderr') {
                    setOperationOutput((prev) => prev + data);
                  } else if (type === 'done') {
                    eventSource.close();
                    addNotification({
                      type: 'success',
                      message: data
                    });
                    setLoading(false);
                    loadStackDetails();

                    // Pre-load logs first, then switch display after 3 seconds
                    setTimeout(async () => {
                      // Load logs first while still showing stream output
                      await loadLogs();
                      // Now switch to logs mode - logs are already loaded so no delay
                      setIsOperationInProgress(false);
                      setOperationOutput('');
                    }, 3000);
                  } else if (type === 'error') {
                    eventSource.close();
                    addNotification({
                      type: 'error',
                      message: data
                    });
                    setLoading(false);
                    setIsOperationInProgress(false);
                  }
                };

                eventSource.onerror = (error) => {
                  console.error('SSE error:', error);
                  eventSource.close();
                  addNotification({
                    type: 'error',
                    message: 'Failed to stream operation output'
                  });
                  setLoading(false);
                  setIsOperationInProgress(false);
                };
              }}
              disabled={isLoading}
            >
              <PlayIcon className="h-5 w-5 mr-2" />
              Start
            </Button>
          )}
          {stack.status === 'running' && (
            <>
              <Button
                variant="secondary"
                onClick={async () => {
                  // Clear previous operation output
                  setOperationOutput('');

                  // Scroll to logs section
                  logsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

                  // Start streaming
                  setIsOperationInProgress(true);
                  setLoading(true);

                  // Connect to SSE endpoint (EventSource doesn't support relative URLs through Vite proxy in some browsers)
                  const apiUrl = import.meta.env.DEV
                    ? `http://${window.location.hostname}:5000/api/stacks/${name}/stream-restart`
                    : `/api/stacks/${name}/stream-restart`;
                  const eventSource = new EventSource(apiUrl);

                  eventSource.onmessage = (event) => {
                    const { type, data } = JSON.parse(event.data);

                    if (type === 'stdout' || type === 'stderr') {
                      setOperationOutput((prev) => prev + data);
                    } else if (type === 'done') {
                      eventSource.close();
                      addNotification({
                        type: 'success',
                        message: data
                      });
                      setLoading(false);
                      loadStackDetails();

                      // Pre-load logs first, then switch display after 3 seconds
                      setTimeout(async () => {
                        // Load logs first while still showing stream output
                        await loadLogs();
                        // Now switch to logs mode - logs are already loaded so no delay
                        setIsOperationInProgress(false);
                        setOperationOutput('');
                      }, 3000);
                    } else if (type === 'error') {
                      eventSource.close();
                      addNotification({
                        type: 'error',
                        message: data
                      });
                      setLoading(false);
                      setIsOperationInProgress(false);
                    }
                  };

                  eventSource.onerror = (error) => {
                    console.error('SSE error:', error);
                    eventSource.close();
                    addNotification({
                      type: 'error',
                      message: 'Failed to stream operation output'
                    });
                    setLoading(false);
                    setIsOperationInProgress(false);
                  };
                }}
                disabled={isLoading}
              >
                <ArrowPathIcon className="h-5 w-5 mr-2" />
                Restart
              </Button>
              <Button
                variant="warning"
                onClick={() => handleStackAction('stop', 'stopped')}
                disabled={isLoading}
              >
                <StopIcon className="h-5 w-5 mr-2" />
                Stop
              </Button>
            </>
          )}
          <Button
            variant="danger"
            onClick={async () => {
              // Clear previous operation output
              setOperationOutput('');

              // Scroll to logs section
              logsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

              // Start streaming
              setIsOperationInProgress(true);
              setLoading(true);

              // Connect to SSE endpoint
              const apiUrl = import.meta.env.DEV
                ? `http://${window.location.hostname}:5000/api/stacks/${name}/stream-down`
                : `/api/stacks/${name}/stream-down`;
              const eventSource = new EventSource(apiUrl);

              eventSource.onmessage = (event) => {
                const { type, data } = JSON.parse(event.data);

                if (type === 'stdout' || type === 'stderr') {
                  setOperationOutput((prev) => prev + data);
                } else if (type === 'done') {
                  eventSource.close();
                  addNotification({
                    type: 'success',
                    message: data
                  });
                  setLoading(false);
                  loadStackDetails();

                  // For down action, just keep showing the output (no logs since containers are stopped)
                  setTimeout(() => {
                    setIsOperationInProgress(false);
                  }, 3000);
                } else if (type === 'error') {
                  eventSource.close();
                  addNotification({
                    type: 'error',
                    message: data
                  });
                  setLoading(false);
                  setIsOperationInProgress(false);
                }
              };

              eventSource.onerror = (error) => {
                console.error('SSE error:', error);
                eventSource.close();
                addNotification({
                  type: 'error',
                  message: 'Failed to stream operation output'
                });
                setLoading(false);
                setIsOperationInProgress(false);
              };
            }}
            disabled={isLoading}
          >
            <ArrowDownCircleIcon className="h-5 w-5 mr-2" />
            Down
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              loadStackDetails();
              loadLogs();
            }}
            disabled={isLoading}
          >
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              // Clear previous operation output
              setOperationOutput('');

              // Scroll to logs section
              logsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

              // Start streaming
              setIsOperationInProgress(true);
              setLoading(true);

              // Connect to SSE endpoint (EventSource doesn't support relative URLs through Vite proxy in some browsers)
              const apiUrl = import.meta.env.DEV
                ? `http://${window.location.hostname}:5000/api/stacks/${name}/stream-update`
                : `/api/stacks/${name}/stream-update`;
              const eventSource = new EventSource(apiUrl);

              eventSource.onmessage = (event) => {
                const { type, data } = JSON.parse(event.data);

                if (type === 'stdout' || type === 'stderr') {
                  setOperationOutput((prev) => prev + data);
                } else if (type === 'done') {
                  eventSource.close();
                  addNotification({
                    type: 'success',
                    message: data
                  });
                  setLoading(false);
                  loadStackDetails();

                  // Pre-load logs first, then switch display after 3 seconds
                  setTimeout(async () => {
                    // Load logs first while still showing stream output
                    await loadLogs();
                    // Now switch to logs mode - logs are already loaded so no delay
                    setIsOperationInProgress(false);
                    setOperationOutput('');
                  }, 3000);
                } else if (type === 'error') {
                  eventSource.close();
                  addNotification({
                    type: 'error',
                    message: data
                  });
                  setLoading(false);
                  setIsOperationInProgress(false);
                }
              };

              eventSource.onerror = (error) => {
                console.error('SSE error:', error);
                eventSource.close();
                addNotification({
                  type: 'error',
                  message: 'Failed to stream operation output'
                });
                setLoading(false);
                setIsOperationInProgress(false);
              };
            }}
            disabled={isLoading}
          >
            <ArrowUpCircleIcon className="h-5 w-5 mr-2" />
            Update
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={isLoading}
          >
            <TrashIcon className="h-5 w-5 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Compose File Section */}
      <Card>
        <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Compose File</h3>
          <div className="flex space-x-2">
            {isEditingCompose ? (
              <>
                <Button variant="secondary" onClick={() => setIsEditingCompose(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleSaveCompose}>
                  Save Changes
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setIsEditingCompose(true)}>
                Edit
              </Button>
            )}
          </div>
        </div>
        <div className="p-6">
          <CodeMirror
            value={composeContent}
            onChange={(value) => setComposeContent(value)}
            extensions={[yaml()]}
            theme={oneDark}
            editable={isEditingCompose}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              foldGutter: true,
            }}
            style={{
              fontSize: '14px',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
            minHeight="400px"
          />
        </div>
      </Card>

      {/* Environment Variables Section */}
      <Card>
        <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Environment Variables</h3>
          <div className="flex space-x-2">
            {isEditingEnv ? (
              <>
                <Button variant="secondary" onClick={() => {
                  setIsEditingEnv(false);
                  // Reset to original values
                  const envText = Object.entries(envVars)
                    .map(([key, value]) => `${key}=${value}`)
                    .join('\n');
                  setEnvVarsText(envText);
                }}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleSaveEnv}>
                  Save Changes
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setIsEditingEnv(true)}>
                Edit
              </Button>
            )}
          </div>
        </div>
        <div className="p-6">
          {!isEditingEnv && Object.keys(envVars).length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No environment variables defined
            </div>
          ) : (
            <div>
              <CodeMirror
                value={envVarsText}
                onChange={(value) => setEnvVarsText(value)}
                theme={oneDark}
                editable={isEditingEnv}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightActiveLine: true,
                }}
                style={{
                  fontSize: '14px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
                minHeight="200px"
                placeholder="KEY=value
ANOTHER_KEY=another_value
# Comments are supported"
              />
              {isEditingEnv && (
                <p className="mt-2 text-xs text-slate-400">
                  Format: KEY=value (one per line). Lines starting with # are ignored.
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Logs Section */}
      <Card ref={logsRef}>
        <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-white">Logs</h3>
            {isOperationInProgress && (
              <Badge variant="primary">Auto-refreshing...</Badge>
            )}
          </div>
          <Button variant="secondary" onClick={loadLogs}>
            Refresh Logs
          </Button>
        </div>
        <div className="p-6">
          <pre
            ref={logsContentRef}
            className="bg-black/50 rounded-lg p-4 overflow-x-auto text-xs font-mono min-h-[400px] max-h-[600px] overflow-y-auto whitespace-pre-wrap"
          >
            {operationOutput ? (
              <span className="text-green-400">{operationOutput || 'Initializing...'}</span>
            ) : (
              <span className="text-slate-300">{logs || 'No logs available'}</span>
            )}
          </pre>
        </div>
      </Card>
    </div>
  );
}
