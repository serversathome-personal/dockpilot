import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { containersAPI } from '../../api/containers.api';
import Table from '../common/Table';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import ContainerLogs from './ContainerLogs';
import {
  formatBytes,
  formatRelativeTime,
  formatUptime,
  formatPorts,
} from '../../utils/formatters';
import {
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  PauseIcon,
  TrashIcon,
  ArrowUpCircleIcon,
  DocumentTextIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';
import ShellModal from './ShellModal';

export default function ContainersView() {
  const navigate = useNavigate();
  const { containers, setContainers, isLoading, setLoading, addNotification } = useStore();
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [containerStats, setContainerStats] = useState(null);
  const [containerDetails, setContainerDetails] = useState(null);
  const [statsInterval, setStatsInterval] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateOutput, setUpdateOutput] = useState('');
  const [updateContainerName, setUpdateContainerName] = useState('');
  const updateContentRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showShellModal, setShowShellModal] = useState(false);
  const [shellContainer, setShellContainer] = useState(null);

  useEffect(() => {
    loadContainers();
    // Refresh every 5 seconds
    const interval = setInterval(loadContainers, 5000);
    return () => clearInterval(interval);
  }, [showAll]);

  // Load stats when detail modal is open and stats tab is active
  useEffect(() => {
    if (showDetailModal && selectedContainer && activeTab === 'stats') {
      loadStats();
      const interval = setInterval(loadStats, 2000);
      setStatsInterval(interval);
      return () => clearInterval(interval);
    } else if (statsInterval) {
      clearInterval(statsInterval);
      setStatsInterval(null);
    }
  }, [showDetailModal, selectedContainer, activeTab]);

  // Load container details when opening modal
  useEffect(() => {
    if (showDetailModal && selectedContainer) {
      loadContainerDetails();
    }
  }, [showDetailModal, selectedContainer]);

  // Auto-scroll update modal to bottom when content updates
  useEffect(() => {
    if (updateContentRef.current) {
      updateContentRef.current.scrollTop = updateContentRef.current.scrollHeight;
    }
  }, [updateOutput]);

  const loadContainers = async () => {
    try {
      setLoading(true);
      const data = await containersAPI.list({ all: showAll });
      setContainers(data.data || []);
    } catch (error) {
      console.error('Failed to load containers:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load containers',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadContainerDetails = async () => {
    if (!selectedContainer) return;
    try {
      const data = await containersAPI.get(selectedContainer.id);
      setContainerDetails(data.data);
    } catch (error) {
      console.error('Failed to load container details:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load container details',
      });
    }
  };

  const loadStats = async () => {
    if (!selectedContainer) return;
    try {
      const data = await containersAPI.stats(selectedContainer.id);
      setContainerStats(data.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleAction = async (action, container) => {
    // Handle update action specially with streaming
    if (action === 'update') {
      // Clear previous output and setup modal
      setUpdateOutput('');
      setUpdateContainerName(container.name);
      setShowUpdateModal(true);
      setLoading(true);

      // Connect to SSE endpoint
      const apiUrl = import.meta.env.DEV
        ? `http://${window.location.hostname}:5000/api/containers/${container.id}/stream-update`
        : `/api/containers/${container.id}/stream-update`;
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
          loadContainers();
          if (showDetailModal) {
            loadContainerDetails();
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
          message: 'Failed to stream update output'
        });
        setLoading(false);
      };

      return;
    }

    // Handle other actions normally
    try {
      setLoading(true);
      let message = '';

      switch (action) {
        case 'start':
          await containersAPI.start(container.id);
          message = `Container ${container.name} started`;
          break;
        case 'stop':
          await containersAPI.stop(container.id);
          message = `Container ${container.name} stopped`;
          break;
        case 'restart':
          await containersAPI.restart(container.id);
          message = `Container ${container.name} restarted`;
          break;
        case 'pause':
          await containersAPI.pause(container.id);
          message = `Container ${container.name} paused`;
          break;
        case 'unpause':
          await containersAPI.unpause(container.id);
          message = `Container ${container.name} unpaused`;
          break;
      }

      addNotification({
        type: 'success',
        message,
      });

      await loadContainers();
      if (showDetailModal) {
        await loadContainerDetails();
      }
    } catch (error) {
      console.error(`Failed to ${action} container:`, error);
      addNotification({
        type: 'error',
        message: error.message || `Failed to ${action} container`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (force = false) => {
    try {
      setLoading(true);
      await containersAPI.remove(selectedContainer.id, { force, volumes: false });
      addNotification({
        type: 'success',
        message: `Container ${selectedContainer.name} removed successfully`,
      });
      setShowDeleteModal(false);
      setShowDetailModal(false);
      setSelectedContainer(null);
      await loadContainers();
    } catch (error) {
      console.error('Failed to remove container:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to remove container',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeVariant = (state) => {
    const stateLower = state?.toLowerCase() || '';
    if (stateLower === 'running') return 'running';
    if (stateLower === 'paused') return 'paused';
    if (stateLower === 'exited') return 'exited';
    if (stateLower === 'created') return 'created';
    if (stateLower === 'restarting') return 'restarting';
    return 'default';
  };

  const calculateUptime = (created, state) => {
    if (state?.toLowerCase() !== 'running') return 'N/A';
    const now = Date.now();
    const createdTime = new Date(created).getTime();
    const uptimeSeconds = Math.floor((now - createdTime) / 1000);
    return formatUptime(uptimeSeconds);
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (name) => (
        <span className="font-medium text-white truncate block max-w-[150px]" title={name}>{name || 'N/A'}</span>
      ),
    },
    {
      key: 'image',
      label: 'Image',
      sortable: true,
      render: (image) => (
        <div className="max-w-[200px] overflow-hidden">
          <span className="text-sm text-slate-300 truncate block" title={image}>
            {image}
          </span>
        </div>
      ),
    },
    {
      key: 'state',
      label: 'Status',
      sortable: true,
      render: (state) => (
        <Badge variant={getStatusBadgeVariant(state)}>
          {state || 'unknown'}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'Details',
      sortable: true,
      render: (status) => (
        <span className="text-xs text-slate-400">{status}</span>
      ),
    },
    {
      key: 'ports',
      label: 'Ports',
      sortable: true,
      render: (ports) => {
        if (!ports || ports.length === 0) return <span className="text-xs">None</span>;

        // Create unique port mappings
        const portMappings = ports.map(port => {
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

        return (
          <div className="flex flex-col gap-0.5 max-w-[120px]">
            {uniquePorts.map((port, idx) => {
              // Only make it clickable if there's a public port
              if (port.publicPort) {
                // Use http for most ports, https for 443
                const protocol = port.publicPort === 443 ? 'https' : 'http';
                const url = `${protocol}://${window.location.hostname}:${port.publicPort}`;

                return (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary hover:text-primary-light underline cursor-pointer"
                    title={`Open ${url}`}
                  >
                    {port.portText}
                  </a>
                );
              }

              return (
                <span key={idx} className="text-xs text-slate-400">
                  {port.portText}
                </span>
              );
            })}
          </div>
        );
      },
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      render: (created) => formatRelativeTime(created * 1000),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, container) => (
        <div className="flex items-center gap-1">
          {container.state?.toLowerCase() === 'running' && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShellContainer(container);
                  setShowShellModal(true);
                }}
                className="text-cyan-400 hover:text-cyan-300 transition-colors"
                title="Shell"
              >
                <CommandLineIcon className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction('stop', container);
                }}
                className="text-warning hover:text-warning-light transition-colors"
                title="Stop"
              >
                <StopIcon className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction('restart', container);
                }}
                className="text-primary hover:text-primary-light transition-colors"
                title="Restart"
              >
                <ArrowPathIcon className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction('pause', container);
                }}
                className="text-slate-400 hover:text-white transition-colors"
                title="Pause"
              >
                <PauseIcon className="h-5 w-5" />
              </button>
            </>
          )}
          {container.state?.toLowerCase() === 'exited' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAction('start', container);
              }}
              className="text-success hover:text-success-light transition-colors"
              title="Start"
            >
              <PlayIcon className="h-5 w-5" />
            </button>
          )}
          {container.state?.toLowerCase() === 'paused' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAction('unpause', container);
              }}
              className="text-success hover:text-success-light transition-colors"
              title="Unpause"
            >
              <PlayIcon className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAction('update', container);
            }}
            className="text-success hover:text-success-light transition-colors"
            title="Update"
          >
            <ArrowUpCircleIcon className="h-5 w-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedContainer(container);
              setActiveTab('logs');
              setShowDetailModal(true);
            }}
            className="text-slate-400 hover:text-white transition-colors"
            title="View Logs"
          >
            <DocumentTextIcon className="h-5 w-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedContainer(container);
              setShowDeleteModal(true);
            }}
            className="text-danger hover:text-danger-light transition-colors"
            title="Remove"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      ),
    },
  ];

  const handleRowClick = (container) => {
    setSelectedContainer(container);
    setShowDetailModal(true);
    setActiveTab('overview');
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedContainer(null);
    setContainerDetails(null);
    setContainerStats(null);
    setActiveTab('overview');
  };

  // Filter containers based on showAll toggle and search term
  const filteredContainers = containers
    .filter((c) => showAll || c.state?.toLowerCase() === 'running')
    .filter((c) => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        c.name?.toLowerCase().includes(search) ||
        c.image?.toLowerCase().includes(search) ||
        c.state?.toLowerCase().includes(search) ||
        c.status?.toLowerCase().includes(search)
      );
    });

  if (isLoading && containers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Containers</h1>
          <p className="mt-1 lg:mt-2 text-sm lg:text-base text-slate-400">
            Manage your Docker containers • {filteredContainers.length} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="w-4 h-4 rounded border-glass-border bg-glass-darker text-primary focus:ring-primary focus:ring-offset-0"
            />
            <span>Show stopped</span>
          </label>
          <Button variant="secondary" onClick={loadContainers}>
            <ArrowPathIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center relative">
        <input
          type="text"
          placeholder="Search containers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-3 lg:px-4 py-2 pr-10 bg-glass-dark border border-glass-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm lg:text-base"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 text-slate-400 hover:text-white transition-colors"
            title="Clear search"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <Table columns={columns} data={filteredContainers} onRowClick={(container) => navigate(`/containers/${container.id}`)} />

      {/* Container Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        title={`Container: ${selectedContainer?.name || 'Details'}`}
        size="xl"
      >
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex space-x-4 border-b border-glass-border">
            {['overview', 'logs', 'stats', 'inspect'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'border-primary text-white'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {/* Overview Tab */}
            {activeTab === 'overview' && containerDetails && (
              <div className="space-y-2">
                {/* Action Buttons */}
                <div className="flex items-center space-x-3">
                  {selectedContainer?.state?.toLowerCase() === 'running' && (
                    <>
                      <Button
                        variant="warning"
                        onClick={() => handleAction('stop', selectedContainer)}
                        className="flex items-center"
                      >
                        <StopIcon className="h-4 w-4 mr-2" />
                        Stop
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => handleAction('restart', selectedContainer)}
                        className="flex items-center"
                      >
                        <ArrowPathIcon className="h-4 w-4 mr-2" />
                        Restart
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleAction('pause', selectedContainer)}
                        className="flex items-center"
                      >
                        <PauseIcon className="h-4 w-4 mr-2" />
                        Pause
                      </Button>
                    </>
                  )}
                  {selectedContainer?.state?.toLowerCase() === 'exited' && (
                    <Button
                      variant="success"
                      onClick={() => handleAction('start', selectedContainer)}
                      className="flex items-center"
                    >
                      <PlayIcon className="h-4 w-4 mr-2" />
                      Start
                    </Button>
                  )}
                  {selectedContainer?.state?.toLowerCase() === 'paused' && (
                    <Button
                      variant="success"
                      onClick={() => handleAction('unpause', selectedContainer)}
                      className="flex items-center"
                    >
                      <PlayIcon className="h-4 w-4 mr-2" />
                      Unpause
                    </Button>
                  )}
                  {selectedContainer?.state?.toLowerCase() === 'running' && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShellContainer(selectedContainer);
                        setShowShellModal(true);
                      }}
                      className="flex items-center"
                    >
                      <CommandLineIcon className="h-4 w-4 mr-2" />
                      Shell
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => handleAction('update', selectedContainer)}
                    className="flex items-center"
                  >
                    <ArrowUpCircleIcon className="h-4 w-4 mr-2" />
                    Update
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center"
                  >
                    <TrashIcon className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                </div>

                {/* Container Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Container ID</h3>
                    <p className="text-sm text-white font-mono">
                      {containerDetails.id?.substring(0, 12)}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Name</h3>
                    <p className="text-sm text-white">{containerDetails.name}</p>
                  </div>
                  <div className="col-span-2">
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Image</h3>
                    <p className="text-sm text-white break-all">{containerDetails.image}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Status</h3>
                    <Badge variant={getStatusBadgeVariant(containerDetails.state?.Status)}>
                      {containerDetails.state?.Status || 'unknown'}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Created</h3>
                    <p className="text-sm text-white">
                      {formatRelativeTime(containerDetails.created)}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Restart Policy</h3>
                    <p className="text-sm text-white">
                      {containerDetails.restartPolicy?.Name || 'no'}
                    </p>
                  </div>
                </div>

                {/* Ports */}
                {containerDetails.ports && Object.keys(containerDetails.ports).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Ports</h3>
                    <div className="bg-glass-darker rounded-lg p-3">
                      {Object.entries(containerDetails.ports).map(([key, bindings]) => (
                        <div key={key} className="text-sm text-slate-300">
                          {key} → {bindings?.[0]?.HostPort || 'not bound'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Networks */}
                {containerDetails.networks && Object.keys(containerDetails.networks).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Networks</h3>
                    <div className="bg-glass-darker rounded-lg p-3">
                      {Object.entries(containerDetails.networks).map(([name, network]) => (
                        <div key={name} className="text-sm text-slate-300">
                          {name}: {network.IPAddress || 'N/A'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mounts */}
                {containerDetails.mounts && containerDetails.mounts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Volumes</h3>
                    <div className="bg-glass-darker rounded-lg p-3 space-y-1">
                      {containerDetails.mounts.map((mount, index) => (
                        <div key={index} className="text-sm text-slate-300">
                          {mount.Source} → {mount.Destination} ({mount.Mode})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && selectedContainer && (
              <ContainerLogs containerId={selectedContainer.id} />
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
              <div className="space-y-2">
                {containerStats ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Card title="CPU Usage">
                        <div className="text-3xl font-bold text-primary">
                          {containerStats.cpu.percent}%
                        </div>
                      </Card>
                      <Card title="Memory Usage">
                        <div className="text-3xl font-bold text-primary">
                          {containerStats.memory.percent}%
                        </div>
                        <div className="text-sm text-slate-400 mt-2">
                          {formatBytes(containerStats.memory.usage)} / {formatBytes(containerStats.memory.limit)}
                        </div>
                      </Card>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Card title="Network I/O">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">RX:</span>
                            <span className="text-white">{formatBytes(containerStats.network.rx)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">TX:</span>
                            <span className="text-white">{formatBytes(containerStats.network.tx)}</span>
                          </div>
                        </div>
                      </Card>
                      <Card title="Block I/O">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Read:</span>
                            <span className="text-white">{formatBytes(containerStats.blockIO.read)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Write:</span>
                            <span className="text-white">{formatBytes(containerStats.blockIO.write)}</span>
                          </div>
                        </div>
                      </Card>
                    </div>

                    <Card title="Process Count">
                      <div className="text-2xl font-bold text-white">
                        {containerStats.pids}
                      </div>
                    </Card>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-64">
                    <LoadingSpinner size="lg" />
                  </div>
                )}
              </div>
            )}

            {/* Inspect Tab */}
            {activeTab === 'inspect' && containerDetails && (
              <div className="bg-black/50 rounded-lg p-4 overflow-auto max-h-96">
                <pre className="text-xs text-slate-300 font-mono">
                  {JSON.stringify(containerDetails, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          if (!showDetailModal) {
            setSelectedContainer(null);
          }
        }}
        title="Remove Container"
      >
        <div className="space-y-4">
          <p className="text-slate-300">
            Are you sure you want to remove container{' '}
            <span className="font-semibold text-white">
              {selectedContainer?.name}
            </span>
            ?
          </p>
          <p className="text-sm text-slate-400">
            This action cannot be undone. If the container is running, you'll need to force remove it.
          </p>
          <div className="flex justify-end space-x-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                if (!showDetailModal) {
                  setSelectedContainer(null);
                }
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDelete(false)}
              isLoading={isLoading}
            >
              Remove
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDelete(true)}
              isLoading={isLoading}
            >
              Force Remove
            </Button>
          </div>
        </div>
      </Modal>

      {/* Update Output Modal */}
      <Modal
        isOpen={showUpdateModal}
        onClose={() => {
          setShowUpdateModal(false);
          setUpdateOutput('');
          setUpdateContainerName('');
        }}
        title={`Update Container: ${updateContainerName}`}
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-slate-300 text-sm">
              Docker pull output:
            </p>
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
                setUpdateContainerName('');
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Shell Modal */}
      <ShellModal
        isOpen={showShellModal}
        onClose={() => {
          setShowShellModal(false);
          setShellContainer(null);
        }}
        container={shellContainer}
      />
    </div>
  );
}
