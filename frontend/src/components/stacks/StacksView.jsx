import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { stacksAPI } from '../../api/stacks.api';
import Table from '../common/Table';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import { formatRelativeTime } from '../../utils/formatters';
import {
  PlusIcon,
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  TrashIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  DocumentMagnifyingGlassIcon,
  ArrowUpCircleIcon,
  ArrowDownCircleIcon
} from '@heroicons/react/24/outline';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';

export default function StacksView() {
  const navigate = useNavigate();
  const { isLoading, setLoading, addNotification } = useStore();
  const [stacks, setStacks] = useState([]);
  const [selectedStack, setSelectedStack] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [dockerRunCommand, setDockerRunCommand] = useState('');
  const [showGitCloneModal, setShowGitCloneModal] = useState(false);
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalTitle, setTerminalTitle] = useState('');
  const [terminalLogs, setTerminalLogs] = useState('');
  const [terminalStackName, setTerminalStackName] = useState('');
  const [showingLogs, setShowingLogs] = useState(false);
  const terminalContentRef = useRef(null);

  // Create stack form
  const [newStackName, setNewStackName] = useState('');
  const [newStackCompose, setNewStackCompose] = useState('version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "80:80"\n');
  const [newStackEnvVars, setNewStackEnvVars] = useState('');

  // Detail view state
  const [activeTab, setActiveTab] = useState('compose');
  const [composeContent, setComposeContent] = useState('');
  const [envVars, setEnvVars] = useState({});
  const [logs, setLogs] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isOperationInProgress, setIsOperationInProgress] = useState(false);

  useEffect(() => {
    loadStacks();
    // Refresh every 5 seconds
    const interval = setInterval(loadStacks, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll terminal to bottom when content updates
  useEffect(() => {
    if (terminalContentRef.current) {
      terminalContentRef.current.scrollTop = terminalContentRef.current.scrollHeight;
    }
  }, [terminalOutput, terminalLogs]);

  // Auto-refresh logs when showing logs in terminal
  useEffect(() => {
    if (showingLogs && terminalStackName && showTerminalModal) {
      const interval = setInterval(() => loadTerminalLogs(), 5000);
      return () => clearInterval(interval);
    }
  }, [showingLogs, terminalStackName, showTerminalModal]);

  const loadTerminalLogs = async () => {
    if (!terminalStackName) return;

    try {
      const data = await stacksAPI.getLogs(terminalStackName, { tail: 500, timestamps: true });
      setTerminalLogs(data.data.logs || '');
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const loadStacks = async () => {
    try {
      const data = await stacksAPI.list();
      setStacks(data.data || []);
    } catch (error) {
      console.error('Failed to load stacks:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load stacks',
      });
    }
  };

  const handleSaveStack = async () => {
    if (!newStackName.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter a stack name',
      });
      return;
    }

    if (!newStackCompose.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter compose file content',
      });
      return;
    }

    try {
      setLoading(true);

      // Parse text format to object (KEY=value format)
      const envVarsObject = {};
      const lines = newStackEnvVars.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const equalsIndex = trimmedLine.indexOf('=');
          if (equalsIndex > 0) {
            const key = trimmedLine.substring(0, equalsIndex).trim();
            const value = trimmedLine.substring(equalsIndex + 1).trim();
            if (key) {
              envVarsObject[key] = value;
            }
          }
        }
      }

      await stacksAPI.create({
        name: newStackName,
        composeContent: newStackCompose,
        envVars: envVarsObject,
      });

      addNotification({
        type: 'success',
        message: `Stack ${newStackName} saved successfully`,
      });

      setShowCreateModal(false);
      setNewStackName('');
      setNewStackCompose('version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "80:80"\n');
      setNewStackEnvVars('');
      await loadStacks();
    } catch (error) {
      console.error('Failed to save stack:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to save stack',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeployStack = async () => {
    if (!newStackName.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter a stack name',
      });
      return;
    }

    if (!newStackCompose.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter compose file content',
      });
      return;
    }

    try {
      setLoading(true);

      // Parse text format to object (KEY=value format)
      const envVarsObject = {};
      const lines = newStackEnvVars.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const equalsIndex = trimmedLine.indexOf('=');
          if (equalsIndex > 0) {
            const key = trimmedLine.substring(0, equalsIndex).trim();
            const value = trimmedLine.substring(equalsIndex + 1).trim();
            if (key) {
              envVarsObject[key] = value;
            }
          }
        }
      }

      // Create the stack
      await stacksAPI.create({
        name: newStackName,
        composeContent: newStackCompose,
        envVars: envVarsObject,
      });

      // Start the stack immediately
      const startResult = await stacksAPI.start(newStackName);

      // Show terminal output
      setTerminalTitle(`Deploying Stack: ${newStackName}`);
      setTerminalOutput(startResult.output || 'Stack deployed successfully');
      setShowTerminalModal(true);

      addNotification({
        type: 'success',
        message: `Stack ${newStackName} deployed successfully`,
      });

      setShowCreateModal(false);
      setNewStackName('');
      setNewStackCompose('version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "80:80"\n');
      setNewStackEnvVars('');
      await loadStacks();
    } catch (error) {
      console.error('Failed to deploy stack:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to deploy stack',
      });
    } finally {
      setLoading(false);
    }
  };

  const convertDockerRunToCompose = async (dockerRunCmd) => {
    try {
      // Clean up the command - handle multi-line commands with backslashes
      let cmd = dockerRunCmd.trim();

      // Remove line continuations (backslash followed by newline)
      cmd = cmd.replace(/\\\s*\n\s*/g, ' ');

      // Replace any remaining newlines with spaces
      cmd = cmd.replace(/\n/g, ' ');

      // Remove multiple spaces
      cmd = cmd.replace(/\s+/g, ' ');

      // Remove 'docker run' from the beginning
      cmd = cmd.replace(/^docker\s+run\s+/, '');

      // Split command into tokens, respecting quotes
      const tokens = [];
      let current = '';
      let inQuotes = false;
      let quoteChar = '';

      for (let i = 0; i < cmd.length; i++) {
        const char = cmd[i];

        if ((char === '"' || char === "'") && !inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar && inQuotes) {
          inQuotes = false;
          quoteChar = '';
        } else if (char === ' ' && !inQuotes) {
          if (current) {
            tokens.push(current);
            current = '';
          }
          continue;
        }

        current += char;
      }
      if (current) tokens.push(current);

      // Parse tokens
      const service = {
        ports: [],
        volumes: [],
        environment: [],
        networks: [],
      };
      let containerName = 'app';
      let imageName = '';
      let command = [];

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token === '--name') {
          containerName = tokens[++i].replace(/['"]/g, '');
        } else if (token === '-p' || token === '--publish') {
          service.ports.push(tokens[++i].replace(/['"]/g, ''));
        } else if (token === '-v' || token === '--volume') {
          service.volumes.push(tokens[++i].replace(/['"]/g, ''));
        } else if (token === '-e' || token === '--env') {
          service.environment.push(tokens[++i].replace(/['"]/g, ''));
        } else if (token === '--network') {
          service.networks.push(tokens[++i].replace(/['"]/g, ''));
        } else if (token === '--restart') {
          service.restart = tokens[++i].replace(/['"]/g, '');
        } else if (token === '-d' || token === '--detach') {
          // Ignore, compose runs detached by default
        } else if (token === '--rm') {
          // Ignore, not applicable to compose
        } else if (token.startsWith('-')) {
          // Skip unknown flags and their values
          if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
            i++;
          }
        } else if (!imageName) {
          // First non-flag token is the image
          imageName = token.replace(/['"]/g, '');
        } else {
          // Everything else is command arguments
          command.push(token.replace(/['"]/g, ''));
        }
      }

      if (!imageName) {
        throw new Error('No image name found in docker run command');
      }

      // Build compose service object
      const composeService = {
        image: imageName,
        container_name: containerName,
      };

      if (service.ports.length > 0) {
        composeService.ports = service.ports;
      }

      if (service.volumes.length > 0) {
        composeService.volumes = service.volumes;
      }

      if (service.environment.length > 0) {
        composeService.environment = service.environment;
      }

      if (service.networks.length > 0) {
        composeService.networks = service.networks;
      }

      if (service.restart) {
        composeService.restart = service.restart;
      }

      if (command.length > 0) {
        composeService.command = command.join(' ');
      }

      // Create compose object
      const compose = {
        version: '3.8',
        services: {
          [containerName]: composeService,
        },
      };

      // Convert to YAML format
      const yamlLib = await import('js-yaml');
      return yamlLib.dump(compose);
    } catch (error) {
      throw new Error(`Failed to parse docker run command: ${error.message}`);
    }
  };

  const handleConvertDockerRun = async () => {
    if (!dockerRunCommand.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter a docker run command',
      });
      return;
    }

    try {
      const composeContent = await convertDockerRunToCompose(dockerRunCommand);

      // Extract container name for stack name suggestion
      const nameMatch = dockerRunCommand.match(/--name\s+([^\s]+)/);
      const suggestedName = nameMatch ? nameMatch[1].replace(/['"]/g, '') : '';

      // Close convert modal and open create modal with converted content
      setShowConvertModal(false);
      setNewStackCompose(composeContent);
      if (suggestedName) {
        setNewStackName(suggestedName);
      }
      setDockerRunCommand('');
      setShowCreateModal(true);

      addNotification({
        type: 'success',
        message: 'Docker run command converted successfully',
      });
    } catch (error) {
      console.error('Conversion error:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to convert docker run command',
      });
    }
  };

  const handleGitClone = async () => {
    if (!gitRepoUrl.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter a GitHub repository URL',
      });
      return;
    }

    try {
      setIsCloning(true);
      const response = await stacksAPI.cloneFromGit({ repoUrl: gitRepoUrl });

      addNotification({
        type: 'success',
        message: `Repository cloned successfully as stack: ${response.data.stackName}`,
      });

      setShowGitCloneModal(false);
      setGitRepoUrl('');
      await loadStacks();
    } catch (error) {
      console.error('Failed to clone repository:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to clone repository',
      });
    } finally {
      setIsCloning(false);
    }
  };

  const handleStackAction = async (stackName, action, actionLabel) => {
    // Use SSE streaming for start, restart, update, and down actions
    if (['start', 'restart', 'update', 'down'].includes(action)) {
      // Clear previous output and setup terminal
      setTerminalOutput('');
      setTerminalLogs('');
      setTerminalStackName(stackName);
      setShowingLogs(false);
      setTerminalTitle(`${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} Stack: ${stackName}`);
      setShowTerminalModal(true);
      setLoading(true);

      // Map action to streaming endpoint
      const streamEndpoint = {
        start: 'stream-start',
        restart: 'stream-restart',
        update: 'stream-update',
        down: 'stream-down'
      }[action];

      // Connect to SSE endpoint
      const apiUrl = import.meta.env.DEV
        ? `http://${window.location.hostname}:5000/api/stacks/${stackName}/${streamEndpoint}`
        : `/api/stacks/${stackName}/${streamEndpoint}`;
      const eventSource = new EventSource(apiUrl);

      eventSource.onmessage = (event) => {
        const { type, data } = JSON.parse(event.data);

        if (type === 'stdout' || type === 'stderr') {
          setTerminalOutput((prev) => prev + data);
        } else if (type === 'done') {
          eventSource.close();
          addNotification({
            type: 'success',
            message: `Stack ${stackName} ${actionLabel} successfully`
          });
          setLoading(false);
          loadStacks();

          // For down action, don't switch to logs (containers are stopped)
          if (action === 'down') {
            // Just keep showing the stream output
            setTimeout(() => {
              // Don't switch to logs, just clear the operation state
            }, 2000);
          } else {
            // Pre-load logs first, then switch display after 2 seconds
            setTimeout(async () => {
              // Load logs first while still showing stream output
              await loadTerminalLogs();
              // Now switch to logs mode - logs are already loaded so no delay
              setShowingLogs(true);
              setTerminalOutput('');
            }, 2000);
          }
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
          message: 'Failed to stream operation output'
        });
        setLoading(false);
      };
    } else {
      // For other actions (like stop), use the regular API
      try {
        setLoading(true);
        await stacksAPI[action](stackName);

        addNotification({
          type: 'success',
          message: `Stack ${stackName} ${actionLabel} successfully`,
        });
        await loadStacks();
      } catch (error) {
        console.error(`Failed to ${actionLabel} stack:`, error);
        addNotification({
          type: 'error',
          message: error.message || `Failed to ${actionLabel} stack`,
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteStack = async (removeVolumes = false) => {
    try {
      setLoading(true);
      await stacksAPI.delete(selectedStack.name, { removeVolumes });
      addNotification({
        type: 'success',
        message: `Stack ${selectedStack.name} deleted successfully`,
      });
      setShowDeleteModal(false);
      setSelectedStack(null);
      await loadStacks();
    } catch (error) {
      console.error('Failed to delete stack:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to delete stack',
      });
    } finally {
      setLoading(false);
    }
  };

  const openStackDetail = async (stack) => {
    try {
      setLoading(true);
      setSelectedStack(stack);

      // Load stack details
      const [composeData, envData] = await Promise.all([
        stacksAPI.getCompose(stack.name),
        stacksAPI.getEnv(stack.name),
      ]);

      // Convert compose object to YAML string
      const yaml = await import('js-yaml');
      setComposeContent(yaml.dump(composeData.data));
      setEnvVars(envData.data || {});
      setActiveTab('compose');
      setShowDetailModal(true);
    } catch (error) {
      console.error('Failed to load stack details:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load stack details',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCompose = async () => {
    try {
      setLoading(true);
      await stacksAPI.updateCompose(selectedStack.name, composeContent);
      addNotification({
        type: 'success',
        message: 'Compose file updated successfully',
      });
      setIsEditing(false);
      await loadStacks();
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
      await stacksAPI.updateEnv(selectedStack.name, envVars);
      addNotification({
        type: 'success',
        message: 'Environment variables updated successfully',
      });
      setIsEditing(false);
      await loadStacks();
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

  const loadLogs = async () => {
    if (!selectedStack) return;

    try {
      const data = await stacksAPI.getLogs(selectedStack.name, { tail: 500, timestamps: true });
      setLogs(data.data.logs || '');
    } catch (error) {
      console.error('Failed to load logs:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load logs',
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'logs' && selectedStack) {
      loadLogs();
    }
  }, [activeTab, selectedStack]);

  // Auto-refresh logs when operation is in progress
  useEffect(() => {
    if (isOperationInProgress && activeTab === 'logs' && selectedStack) {
      const interval = setInterval(loadLogs, 2000); // Refresh every 2 seconds
      return () => clearInterval(interval);
    }
  }, [isOperationInProgress, activeTab, selectedStack]);

  const addEnvVar = () => {
    setNewStackEnvVars([...newStackEnvVars, { key: '', value: '' }]);
  };

  const removeEnvVar = (index) => {
    setNewStackEnvVars(newStackEnvVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (index, field, value) => {
    const updated = [...newStackEnvVars];
    updated[index][field] = value;
    setNewStackEnvVars(updated);
  };

  const addEnvVarToDetail = () => {
    const newKey = `VAR_${Object.keys(envVars).length + 1}`;
    setEnvVars({ ...envVars, [newKey]: '' });
  };

  const removeEnvVarFromDetail = (key) => {
    const updated = { ...envVars };
    delete updated[key];
    setEnvVars(updated);
  };

  const updateEnvVarInDetail = (oldKey, newKey, value) => {
    const updated = { ...envVars };
    if (oldKey !== newKey) {
      delete updated[oldKey];
    }
    updated[newKey] = value;
    setEnvVars(updated);
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (status) => (
        <Badge variant={status === 'running' ? 'running' : 'stopped'}>
          {status}
        </Badge>
      ),
    },
    {
      key: 'containerCount',
      label: 'Containers',
      sortable: true,
      render: (count, stack) => (
        <span>
          {stack.runningCount || 0} / {count || 0}
        </span>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      render: (created) => formatRelativeTime(created),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, stack) => (
        <div className="flex items-center space-x-2">
          {stack.status === 'running' ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStackAction(stack.name, 'stop', 'stopped');
              }}
              className="text-warning hover:text-warning-light transition-colors"
              title="Stop stack"
            >
              <StopIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStackAction(stack.name, 'start', 'started');
              }}
              className="text-success hover:text-success-light transition-colors"
              title="Start stack"
            >
              <PlayIcon className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStackAction(stack.name, 'down', 'downed');
            }}
            className="text-danger hover:text-danger-light transition-colors"
            title="Down stack (remove containers)"
          >
            <ArrowDownCircleIcon className="h-5 w-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStackAction(stack.name, 'restart', 'restarted');
            }}
            className="text-primary hover:text-primary-light transition-colors"
            title="Restart stack"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStackAction(stack.name, 'update', 'updated');
            }}
            className="text-primary hover:text-primary-light transition-colors"
            title="Update stack"
          >
            <ArrowUpCircleIcon className="h-5 w-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedStack(stack);
              setShowDeleteModal(true);
            }}
            className="text-danger hover:text-danger-light transition-colors"
            title="Delete stack"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      ),
    },
  ];

  if (isLoading && stacks.length === 0) {
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
          <h1 className="text-3xl font-bold text-white">Stacks</h1>
          <p className="mt-2 text-slate-400">
            Manage your Docker Compose stacks • {stacks.length} total
          </p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="primary"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Create Stack
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowConvertModal(true)}
            className="flex items-center"
          >
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Convert Docker Run
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowGitCloneModal(true)}
            className="flex items-center"
          >
            <DocumentTextIcon className="h-5 w-5 mr-2" />
            Clone from GitHub
          </Button>
          <Button variant="secondary" onClick={loadStacks}>
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        data={stacks}
        onRowClick={(stack) => navigate(`/stacks/${stack.name}`)}
      />

      {/* Create Stack Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewStackName('');
          setNewStackCompose('version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "80:80"\n');
          setNewStackEnvVars('');
        }}
        title="Create New Stack"
        size="xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Stack Name
            </label>
            <input
              type="text"
              value={newStackName}
              onChange={(e) => setNewStackName(e.target.value)}
              placeholder="my-stack"
              className="glass-input w-full"
            />
            <p className="mt-1 text-xs text-slate-400">
              Use only alphanumeric characters, hyphens, and underscores
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Docker Compose File
            </label>
            <CodeMirror
              value={newStackCompose}
              onChange={(value) => setNewStackCompose(value)}
              extensions={[yaml()]}
              theme={oneDark}
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
              minHeight="300px"
              placeholder="version: '3.8'
services:
  app:
    image: nginx:latest"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Environment Variables
            </label>
            <CodeMirror
              value={newStackEnvVars}
              onChange={(value) => setNewStackEnvVars(value)}
              theme={oneDark}
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
              minHeight="150px"
              placeholder="KEY1=value1
KEY2=value2
# Comments are supported"
            />
            <p className="mt-1 text-xs text-slate-400">
              Use KEY=value format, one per line. Lines starting with # are treated as comments.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewStackName('');
                setNewStackCompose('version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "80:80"\n');
                setNewStackEnvVars('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={handleSaveStack}
              isLoading={isLoading}
              disabled={!newStackName.trim() || !newStackCompose.trim()}
            >
              Save
            </Button>
            <Button
              variant="success"
              onClick={handleDeployStack}
              isLoading={isLoading}
              disabled={!newStackName.trim() || !newStackCompose.trim()}
            >
              Deploy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Convert Docker Run Modal */}
      <Modal
        isOpen={showConvertModal}
        onClose={() => {
          setShowConvertModal(false);
          setDockerRunCommand('');
        }}
        title="Convert Docker Run Command"
        size="xl"
      >
        <div className="space-y-4">
          <p className="text-slate-300">
            Paste your docker run command below and it will be converted to a Docker Compose file.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Docker Run Command
            </label>
            <textarea
              value={dockerRunCommand}
              onChange={(e) => setDockerRunCommand(e.target.value)}
              placeholder="docker run -d --name myapp -p 8080:80 -e ENV_VAR=value nginx:latest"
              className="glass-input w-full font-mono text-sm"
              rows={10}
            />
            <p className="mt-2 text-xs text-slate-400">
              Example: docker run -d --name myapp -p 8080:80 -v /data:/data -e MYSQL_ROOT_PASSWORD=secret mysql:latest
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowConvertModal(false);
                setDockerRunCommand('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConvertDockerRun}
              disabled={!dockerRunCommand.trim()}
            >
              Convert
            </Button>
          </div>
        </div>
      </Modal>

      {/* GitHub Clone Modal */}
      <Modal
        isOpen={showGitCloneModal}
        onClose={() => {
          setShowGitCloneModal(false);
          setGitRepoUrl('');
        }}
        title="Clone from GitHub"
      >
        <div className="space-y-4">
          <p className="text-slate-300">
            Clone a GitHub repository with a docker-compose.yml file directly to your stacks directory.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              GitHub Repository URL
            </label>
            <input
              type="text"
              value={gitRepoUrl}
              onChange={(e) => setGitRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repository"
              className="glass-input w-full"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && gitRepoUrl.trim()) {
                  handleGitClone();
                }
              }}
            />
            <p className="mt-2 text-xs text-slate-400">
              The repository will be cloned into the stacks directory. Make sure it contains a docker-compose.yml file.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowGitCloneModal(false);
                setGitRepoUrl('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleGitClone}
              isLoading={isCloning}
              disabled={!gitRepoUrl.trim()}
            >
              Clone Repository
            </Button>
          </div>
        </div>
      </Modal>

      {/* Stack Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedStack(null);
          setIsEditing(false);
        }}
        title={selectedStack?.name}
        size="xl"
      >
        {selectedStack && (
          <div className="space-y-4">
            {/* Stack Info */}
            <div className="glass-card p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Status</p>
                  <Badge variant={selectedStack.status === 'running' ? 'running' : 'stopped'}>
                    {selectedStack.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Containers</p>
                  <p className="text-white font-medium">
                    {selectedStack.runningCount || 0} / {selectedStack.containerCount || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-2">
              {selectedStack.status === 'running' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleStackAction(selectedStack.name, 'stop', 'stopped')}
                >
                  <StopIcon className="h-4 w-4 mr-1" />
                  Stop
                </Button>
              ) : (
                <Button
                  variant="success"
                  size="sm"
                  onClick={async () => {
                    // Switch to logs tab and start auto-refresh
                    setActiveTab('logs');
                    setIsOperationInProgress(true);

                    // Perform the start action
                    await handleStackAction(selectedStack.name, 'start', 'started');

                    // Keep auto-refreshing logs for 5 more seconds after operation completes
                    setTimeout(() => {
                      setIsOperationInProgress(false);
                    }, 5000);
                  }}
                >
                  <PlayIcon className="h-4 w-4 mr-1" />
                  Start
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  // Switch to logs tab and start auto-refresh
                  setActiveTab('logs');
                  setIsOperationInProgress(true);

                  // Perform the restart action
                  await handleStackAction(selectedStack.name, 'restart', 'restarted');

                  // Keep auto-refreshing logs for 5 more seconds after operation completes
                  setTimeout(() => {
                    setIsOperationInProgress(false);
                  }, 5000);
                }}
              >
                <ArrowPathIcon className="h-4 w-4 mr-1" />
                Restart
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  // Switch to logs tab and start auto-refresh
                  setActiveTab('logs');
                  setIsOperationInProgress(true);

                  // Perform the update action
                  await handleStackAction(selectedStack.name, 'update', 'updated');

                  // Keep auto-refreshing logs for 5 more seconds after operation completes
                  setTimeout(() => {
                    setIsOperationInProgress(false);
                  }, 5000);
                }}
              >
                <ArrowUpCircleIcon className="h-4 w-4 mr-1" />
                Update
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setShowDetailModal(false);
                  setShowDeleteModal(true);
                }}
              >
                <TrashIcon className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>

            {/* Tabs */}
            <div className="border-b border-glass-border">
              <nav className="flex space-x-4">
                <button
                  onClick={() => setActiveTab('compose')}
                  className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'compose'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <DocumentTextIcon className="h-4 w-4 inline mr-1" />
                  Compose File
                </button>
                <button
                  onClick={() => setActiveTab('env')}
                  className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'env'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Cog6ToothIcon className="h-4 w-4 inline mr-1" />
                  Environment
                </button>
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'logs'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <DocumentMagnifyingGlassIcon className="h-4 w-4 inline mr-1" />
                  Logs
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
              {activeTab === 'compose' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-400">
                      Edit your docker-compose.yml configuration
                    </p>
                    {isEditing ? (
                      <div className="flex space-x-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsEditing(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleSaveCompose}
                          isLoading={isLoading}
                        >
                          Save Changes
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                  <textarea
                    value={composeContent}
                    onChange={(e) => setComposeContent(e.target.value)}
                    className="glass-input w-full font-mono text-sm"
                    rows={20}
                    disabled={!isEditing}
                  />
                </div>
              )}

              {activeTab === 'env' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-400">
                      Manage environment variables for this stack
                    </p>
                    {isEditing ? (
                      <div className="flex space-x-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsEditing(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleSaveEnv}
                          isLoading={isLoading}
                        >
                          Save Changes
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>

                  {isEditing && (
                    <Button variant="ghost" size="sm" onClick={addEnvVarToDetail}>
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Add Variable
                    </Button>
                  )}

                  <div className="space-y-2">
                    {Object.entries(envVars).map(([key, value]) => (
                      <div key={key} className="flex space-x-2">
                        <input
                          type="text"
                          value={key}
                          onChange={(e) => updateEnvVarInDetail(key, e.target.value, value)}
                          className="glass-input flex-1 font-mono text-sm"
                          disabled={!isEditing}
                        />
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => updateEnvVarInDetail(key, key, e.target.value)}
                          className="glass-input flex-1 font-mono text-sm"
                          disabled={!isEditing}
                        />
                        {isEditing && (
                          <button
                            onClick={() => removeEnvVarFromDetail(key)}
                            className="text-danger hover:text-danger-light transition-colors"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {Object.keys(envVars).length === 0 && (
                      <p className="text-slate-400 text-sm text-center py-8">
                        No environment variables defined
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm text-slate-400">
                        Aggregated logs from all containers in this stack
                      </p>
                      {isOperationInProgress && (
                        <Badge variant="primary">Auto-refreshing...</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={loadLogs}>
                      Refresh
                    </Button>
                  </div>
                  <div className="glass-card bg-black/50 p-4 rounded-lg overflow-auto max-h-[400px]">
                    <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                      {logs || 'No logs available'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedStack(null);
        }}
        title="Delete Stack"
      >
        <div className="space-y-4">
          <p className="text-slate-300">
            Are you sure you want to delete stack{' '}
            <span className="font-semibold text-white">{selectedStack?.name}</span>?
          </p>
          <p className="text-sm text-slate-400">
            This will stop all containers and remove the stack configuration. This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setSelectedStack(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDeleteStack(false)}
              isLoading={isLoading}
            >
              Delete Stack
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDeleteStack(true)}
              isLoading={isLoading}
            >
              Delete + Volumes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Terminal Output Modal */}
      <Modal
        isOpen={showTerminalModal}
        onClose={() => {
          setShowTerminalModal(false);
          setTerminalOutput('');
          setTerminalTitle('');
          setTerminalLogs('');
          setTerminalStackName('');
          setShowingLogs(false);
        }}
        title={terminalTitle}
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-slate-300 text-sm">
              {showingLogs ? 'Container Logs:' : 'Docker Compose command output:'}
            </p>
            {showingLogs && (
              <Badge variant="primary">Live</Badge>
            )}
          </div>

          <div
            ref={terminalContentRef}
            className="bg-black/80 rounded-lg p-4 border border-slate-700 overflow-auto max-h-[500px]"
          >
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {showingLogs ? (
                <span className="text-slate-300">{terminalLogs || 'Loading logs...'}</span>
              ) : (
                <span className="text-green-400">{terminalOutput || 'Initializing...'}</span>
              )}
            </pre>
          </div>

          <div className="flex justify-end pt-4">
            <Button
              variant="primary"
              onClick={() => {
                setShowTerminalModal(false);
                setTerminalOutput('');
                setTerminalTitle('');
                setTerminalLogs('');
                setTerminalStackName('');
                setShowingLogs(false);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
