import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { imagesAPI } from '../../api/images.api';
import Table from '../common/Table';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import { formatBytes, formatRelativeTime } from '../../utils/formatters';
import { TrashIcon, ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function ImagesView() {
  const { images, setImages, isLoading, setLoading, addNotification } = useStore();
  const [selectedImage, setSelectedImage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullImageName, setPullImageName] = useState('');
  const [isPulling, setIsPulling] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadImages();
    // Refresh every 10 seconds
    const interval = setInterval(loadImages, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadImages = async () => {
    try {
      setLoading(true);
      const data = await imagesAPI.list();
      // Add repository and tag as sortable fields
      const imagesWithTags = (data.data || []).map(image => {
        let repository = '<none>';
        let tag = '<none>';

        if (image.tags && image.tags.length > 0) {
          const parts = image.tags[0].split(':');
          repository = parts[0];
          tag = parts[1] || 'latest';
        }

        return {
          ...image,
          repository,
          tag,
        };
      });
      setImages(imagesWithTags);
    } catch (error) {
      console.error('Failed to load images:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load images',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (image, force = false) => {
    try {
      setLoading(true);
      await imagesAPI.remove(image.id, { force });
      addNotification({
        type: 'success',
        message: `Image ${image.tags[0] || image.id.substring(0, 12)} deleted successfully`,
      });
      setShowDeleteModal(false);
      setSelectedImage(null);
      await loadImages();
    } catch (error) {
      console.error('Failed to delete image:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to delete image',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrune = async () => {
    try {
      setLoading(true);
      await imagesAPI.prune();
      addNotification({
        type: 'success',
        message: 'Unused images pruned successfully',
      });
      await loadImages();
    } catch (error) {
      console.error('Failed to prune images:', error);
      addNotification({
        type: 'error',
        message: 'Failed to prune images',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePull = async () => {
    if (!pullImageName.trim()) {
      addNotification({
        type: 'error',
        message: 'Please enter an image name',
      });
      return;
    }

    try {
      setIsPulling(true);
      await imagesAPI.pull({ image: pullImageName });
      addNotification({
        type: 'success',
        message: `Image ${pullImageName} pulled successfully`,
      });
      setShowPullModal(false);
      setPullImageName('');
      await loadImages();
    } catch (error) {
      console.error('Failed to pull image:', error);
      addNotification({
        type: 'error',
        message: error.message || 'Failed to pull image',
      });
    } finally {
      setIsPulling(false);
    }
  };

  const columns = [
    {
      key: 'repository',
      label: 'Repository',
      sortable: true,
      render: (repository) => (
        <div className="max-w-[250px] overflow-hidden">
          <span className="truncate block" title={repository}>
            {repository}
          </span>
        </div>
      ),
    },
    {
      key: 'tag',
      label: 'Tag',
      sortable: true,
      render: (tag) => (
        <span className="truncate block max-w-[100px]" title={tag}>
          {tag}
        </span>
      ),
    },
    {
      key: 'id',
      label: 'Image ID',
      sortable: true,
      render: (id) => id.replace('sha256:', '').substring(0, 12),
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      render: (created) => formatRelativeTime(created * 1000),
    },
    {
      key: 'size',
      label: 'Size',
      sortable: true,
      render: (size) => formatBytes(size),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, image) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedImage(image);
              setShowDeleteModal(true);
            }}
            className="text-danger hover:text-danger-light transition-colors"
            title="Delete image"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      ),
    },
  ];

  // Calculate total size
  const totalSize = images.reduce((acc, img) => acc + (img.size || 0), 0);

  if (isLoading && images.length === 0) {
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
          <h1 className="text-3xl font-bold text-white">Images</h1>
          <p className="mt-2 text-slate-400">
            Manage your Docker images • {images.length} total • {formatBytes(totalSize)}
          </p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="secondary"
            onClick={() => setShowPullModal(true)}
            className="flex items-center"
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            Pull Image
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Are you sure you want to prune all unused images?')) {
                handlePrune();
              }
            }}
          >
            Prune Unused
          </Button>
          <Button variant="secondary" onClick={loadImages}>
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center relative">
        <input
          type="text"
          placeholder="Search images by repository or tag..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 pr-10 bg-glass-dark border border-glass-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
        data={images.filter((img) => {
          if (!searchTerm) return true;
          const search = searchTerm.toLowerCase();
          return (
            img.repository?.toLowerCase().includes(search) ||
            img.tag?.toLowerCase().includes(search) ||
            img.tags?.some(t => t.toLowerCase().includes(search))
          );
        })}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedImage(null);
        }}
        title="Delete Image"
      >
        <div className="space-y-4">
          <p className="text-slate-300">
            Are you sure you want to delete image{' '}
            <span className="font-semibold text-white">
              {selectedImage?.tags?.[0] || selectedImage?.id?.substring(0, 12)}
            </span>
            ?
          </p>
          <p className="text-sm text-slate-400">
            This action cannot be undone. If the image is in use by containers, you'll need to force delete it.
          </p>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setSelectedImage(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDelete(selectedImage, false)}
              isLoading={isLoading}
            >
              Delete
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDelete(selectedImage, true)}
              isLoading={isLoading}
            >
              Force Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Pull Image Modal */}
      <Modal
        isOpen={showPullModal}
        onClose={() => {
          setShowPullModal(false);
          setPullImageName('');
        }}
        title="Pull Docker Image"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Image Name
            </label>
            <input
              type="text"
              value={pullImageName}
              onChange={(e) => setPullImageName(e.target.value)}
              placeholder="e.g., nginx:latest or ubuntu:22.04"
              className="glass-input w-full"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handlePull();
                }
              }}
            />
            <p className="mt-2 text-xs text-slate-400">
              Enter the full image name with tag (e.g., nginx:latest, ubuntu:22.04)
            </p>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowPullModal(false);
                setPullImageName('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handlePull}
              isLoading={isPulling}
              disabled={!pullImageName.trim()}
            >
              Pull Image
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
