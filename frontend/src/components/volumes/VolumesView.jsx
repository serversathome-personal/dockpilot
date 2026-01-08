import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { volumesAPI } from '../../api/volumes.api';
import Table from '../common/Table';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import { TrashIcon, PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { formatRelativeTime } from '../../utils/formatters';

export default function VolumesView() {
  const { volumes, setVolumes, isLoading, setLoading, addNotification } = useStore();
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVolume, setNewVolume] = useState({
    name: '',
    driver: 'local',
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadVolumes();
    const interval = setInterval(loadVolumes, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadVolumes = async () => {
    try {
      setLoading(true);
      const data = await volumesAPI.list();
      // Sort volumes by name to prevent rearranging
      const sortedVolumes = (data.data || []).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setVolumes(sortedVolumes);
    } catch (error) {
      console.error('Failed to load volumes:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load volumes',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newVolume.name.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter a volume name',
      });
      return;
    }

    try {
      setLoading(true);
      await volumesAPI.create({
        name: newVolume.name,
        driver: newVolume.driver,
      });
      addNotification({
        type: 'success',
        message: `Volume ${newVolume.name} created successfully`,
      });
      setShowCreateModal(false);
      setNewVolume({ name: '', driver: 'local' });
      await loadVolumes();
    } catch (error) {
      console.error('Failed to create volume:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to create volume',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (volume, force = false) => {
    try {
      setLoading(true);
      await volumesAPI.remove(volume.name, { force });
      addNotification({
        type: 'success',
        message: `Volume ${volume.name} deleted successfully`,
      });
      setShowDeleteModal(false);
      setSelectedVolume(null);
      await loadVolumes();
    } catch (error) {
      console.error('Failed to delete volume:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to delete volume',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrune = async () => {
    try {
      setLoading(true);
      await volumesAPI.prune();
      addNotification({
        type: 'success',
        message: 'Unused volumes pruned successfully',
      });
      await loadVolumes();
    } catch (error) {
      console.error('Failed to prune volumes:', error);
      addNotification({
        type: 'error',
        message: 'Failed to prune volumes',
      });
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
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
      key: 'mountpoint',
      label: 'Mount Point',
      sortable: true,
      render: (mountpoint) => (
        <span className="font-mono text-xs text-slate-300 break-all">
          {mountpoint}
        </span>
      ),
    },
    {
      key: 'scope',
      label: 'Scope',
      sortable: true,
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      render: (created) => created ? formatRelativeTime(created) : 'N/A',
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, volume) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedVolume(volume);
              setShowDeleteModal(true);
            }}
            className="text-danger hover:text-danger-light transition-colors"
            title="Delete volume"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      ),
    },
  ];

  if (isLoading && volumes.length === 0) {
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
          <h1 className="text-3xl font-bold text-white">Volumes</h1>
          <p className="mt-2 text-slate-400">
            Manage your Docker volumes • {volumes.length} total
          </p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="primary"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Create Volume
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Are you sure you want to prune all unused volumes?')) {
                handlePrune();
              }
            }}
          >
            Prune Unused
          </Button>
          <Button variant="secondary" onClick={loadVolumes}>
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center">
        <input
          type="text"
          placeholder="Search volumes by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 bg-glass-dark border border-glass-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      <Table
        columns={columns}
        data={volumes.filter((vol) => {
          if (!searchTerm) return true;
          const search = searchTerm.toLowerCase();
          return vol.name?.toLowerCase().includes(search);
        })}
      />

      {/* Create Volume Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewVolume({ name: '', driver: 'local' });
        }}
        title="Create Volume"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Volume Name
            </label>
            <input
              type="text"
              value={newVolume.name}
              onChange={(e) => setNewVolume({ ...newVolume, name: e.target.value })}
              placeholder="my-volume"
              className="glass-input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Driver
            </label>
            <select
              value={newVolume.driver}
              onChange={(e) => setNewVolume({ ...newVolume, driver: e.target.value })}
              className="glass-select w-full"
            >
              <option value="local">local</option>
              <option value="nfs">nfs</option>
            </select>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewVolume({ name: '', driver: 'local' });
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={isLoading}
              disabled={!newVolume.name.trim()}
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
          setSelectedVolume(null);
        }}
        title="Delete Volume"
      >
        <div className="space-y-4">
          <p className="text-slate-300">
            Are you sure you want to delete volume{' '}
            <span className="font-semibold text-white">{selectedVolume?.name}</span>?
          </p>
          <p className="text-sm text-slate-400">
            This action cannot be undone. Make sure no containers are using this volume.
          </p>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setSelectedVolume(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDelete(selectedVolume, false)}
              isLoading={isLoading}
            >
              Delete
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDelete(selectedVolume, true)}
              isLoading={isLoading}
            >
              Force Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
