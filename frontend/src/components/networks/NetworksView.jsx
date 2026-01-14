import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { networksAPI } from '../../api/networks.api';
import Table from '../common/Table';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import { TrashIcon, PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function NetworksView() {
  const { networks, setNetworks, isLoading, setLoading, addNotification } = useStore();
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [networkDetails, setNetworkDetails] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [newNetwork, setNewNetwork] = useState({
    name: '',
    driver: 'bridge',
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadNetworks();
    const interval = setInterval(loadNetworks, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadNetworks = async () => {
    try {
      setLoading(true);
      const data = await networksAPI.list();
      // Add subnet and gateway as sortable fields
      const networksWithIPAM = (data.data || []).map(network => {
        const ipamInfo = getIPAMInfo(network.ipam);
        return {
          ...network,
          subnet: ipamInfo.subnet,
          gateway: ipamInfo.gateway,
        };
      });
      setNetworks(networksWithIPAM);
    } catch (error) {
      console.error('Failed to load networks:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load networks',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newNetwork.name.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter a network name',
      });
      return;
    }

    try {
      setLoading(true);
      await networksAPI.create({
        name: newNetwork.name,
        driver: newNetwork.driver,
      });
      addNotification({
        type: 'success',
        message: `Network ${newNetwork.name} created successfully`,
      });
      setShowCreateModal(false);
      setNewNetwork({ name: '', driver: 'bridge' });
      await loadNetworks();
    } catch (error) {
      console.error('Failed to create network:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to create network',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (network) => {
    try {
      setLoading(true);
      await networksAPI.remove(network.id);
      addNotification({
        type: 'success',
        message: `Network ${network.name} deleted successfully`,
      });
      setShowDeleteModal(false);
      setSelectedNetwork(null);
      await loadNetworks();
    } catch (error) {
      console.error('Failed to delete network:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to delete network',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrune = async () => {
    try {
      setLoading(true);
      await networksAPI.prune();
      addNotification({
        type: 'success',
        message: 'Unused networks pruned successfully',
      });
      await loadNetworks();
    } catch (error) {
      console.error('Failed to prune networks:', error);
      addNotification({
        type: 'error',
        message: 'Failed to prune networks',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleShowDetails = async (network) => {
    try {
      setSelectedNetwork(network);
      setShowDetailModal(true);
      setLoading(true);
      const data = await networksAPI.get(network.id);
      setNetworkDetails(data.data);
    } catch (error) {
      console.error('Failed to load network details:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load network details',
      });
    } finally {
      setLoading(false);
    }
  };

  const getIPAMInfo = (ipam) => {
    if (!ipam || !ipam.Config || ipam.Config.length === 0) {
      return { subnet: 'N/A', gateway: 'N/A' };
    }
    const config = ipam.Config[0];
    return {
      subnet: config.Subnet || 'N/A',
      gateway: config.Gateway || 'N/A',
    };
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'id',
      label: 'Network ID',
      sortable: true,
      render: (id) => id.substring(0, 12),
    },
    {
      key: 'driver',
      label: 'Driver',
      sortable: true,
      render: (driver) => (
        <Badge variant="default">{driver}</Badge>
      ),
    },
    {
      key: 'scope',
      label: 'Scope',
      sortable: true,
    },
    {
      key: 'subnet',
      label: 'Subnet',
      sortable: true,
      render: (subnet) => subnet,
    },
    {
      key: 'gateway',
      label: 'Gateway',
      sortable: true,
      render: (gateway) => gateway,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, network) => (
        <div className="flex items-center space-x-2">
          {!['bridge', 'host', 'none'].includes(network.name) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNetwork(network);
                setShowDeleteModal(true);
              }}
              className="text-danger hover:text-danger-light transition-colors"
              title="Delete network"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  if (isLoading && networks.length === 0) {
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
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Networks</h1>
          <p className="mt-1 lg:mt-2 text-sm lg:text-base text-slate-400">
            Manage your Docker networks • {networks.length} total
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center"
          >
            <PlusIcon className="h-5 w-5 lg:mr-2" />
            <span className="hidden sm:inline">Create</span>
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Are you sure you want to prune all unused networks?')) {
                handlePrune();
              }
            }}
          >
            Prune
          </Button>
          <Button variant="secondary" onClick={loadNetworks}>
            <ArrowPathIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center relative">
        <input
          type="text"
          placeholder="Search networks..."
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

      <Table
        columns={columns}
        data={networks.filter((net) => {
          if (!searchTerm) return true;
          const search = searchTerm.toLowerCase();
          return (
            net.name?.toLowerCase().includes(search) ||
            net.driver?.toLowerCase().includes(search)
          );
        })}
        onRowClick={handleShowDetails}
        defaultSort={{ key: 'name', direction: 'asc' }}
      />

      {/* Create Network Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewNetwork({ name: '', driver: 'bridge' });
        }}
        title="Create Network"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Network Name
            </label>
            <input
              type="text"
              value={newNetwork.name}
              onChange={(e) => setNewNetwork({ ...newNetwork, name: e.target.value })}
              placeholder="my-network"
              className="glass-input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Driver
            </label>
            <select
              value={newNetwork.driver}
              onChange={(e) => setNewNetwork({ ...newNetwork, driver: e.target.value })}
              className="glass-select w-full"
            >
              <option value="bridge">bridge</option>
              <option value="overlay">overlay</option>
              <option value="macvlan">macvlan</option>
              <option value="host">host</option>
            </select>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewNetwork({ name: '', driver: 'bridge' });
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={isLoading}
              disabled={!newNetwork.name.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedNetwork(null);
        }}
        title="Delete Network"
      >
        <div className="space-y-4">
          <p className="text-slate-300">
            Are you sure you want to delete network{' '}
            <span className="font-semibold text-white">{selectedNetwork?.name}</span>?
          </p>
          <p className="text-sm text-slate-400">
            This action cannot be undone. Make sure no containers are using this network.
          </p>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setSelectedNetwork(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDelete(selectedNetwork)}
              isLoading={isLoading}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Network Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedNetwork(null);
          setNetworkDetails(null);
        }}
        title={`Network: ${selectedNetwork?.name}`}
        size="lg"
      >
        {networkDetails ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-400">ID</p>
                <p className="text-white font-mono text-sm">{networkDetails.id.substring(0, 12)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Driver</p>
                <p className="text-white">{networkDetails.driver}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Scope</p>
                <p className="text-white">{networkDetails.scope}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Internal</p>
                <p className="text-white">{networkDetails.internal ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {networkDetails.ipam && networkDetails.ipam.Config && networkDetails.ipam.Config.length > 0 && (
              <div>
                <p className="text-sm text-slate-400 mb-2">IP Configuration</p>
                <div className="bg-glass-light rounded p-3 space-y-2">
                  {networkDetails.ipam.Config.map((config, idx) => (
                    <div key={idx} className="text-sm">
                      <p className="text-white">
                        <span className="text-slate-400">Subnet:</span> {config.Subnet || 'N/A'}
                      </p>
                      <p className="text-white">
                        <span className="text-slate-400">Gateway:</span> {config.Gateway || 'N/A'}
                      </p>
                      {config.IPRange && (
                        <p className="text-white">
                          <span className="text-slate-400">IP Range:</span> {config.IPRange}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-sm text-slate-400 mb-2">
                Connected Containers ({networkDetails.containers?.length || 0})
              </p>
              {networkDetails.containers && networkDetails.containers.length > 0 ? (
                <div className="bg-glass-light rounded overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-glass-darker">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Container</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">IPv4 Address</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">MAC Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-glass-border">
                      {networkDetails.containers.map((container) => (
                        <tr key={container.id}>
                          <td className="px-4 py-2 text-sm text-white">{container.name}</td>
                          <td className="px-4 py-2 text-sm text-slate-300 font-mono">
                            {container.ipv4Address || 'N/A'}
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-300 font-mono">
                            {container.macAddress || 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-glass-light rounded p-4 text-center text-slate-400 text-sm">
                  No containers connected to this network
                </div>
              )}
            </div>

            {networkDetails.labels && Object.keys(networkDetails.labels).length > 0 && (
              <div>
                <p className="text-sm text-slate-400 mb-2">Labels</p>
                <div className="bg-glass-light rounded p-3 space-y-1">
                  {Object.entries(networkDetails.labels).map(([key, value]) => (
                    <p key={key} className="text-sm text-white font-mono">
                      {key}: {value}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        )}
      </Modal>
    </div>
  );
}
