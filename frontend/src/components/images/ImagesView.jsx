import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { imagesAPI } from '../../api/images.api';
import { containersAPI } from '../../api/containers.api';
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
  const [danglingFilter, setDanglingFilter] = useState('hide'); // 'hide', 'show', 'only'
  const [isPruning, setIsPruning] = useState(false);
  const [containers, setContainers] = useState([]);

  useEffect(() => {
    loadImages();
    // Refresh every 10 seconds
    const interval = setInterval(loadImages, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadImages = async () => {
    try {
      setLoading(true);
      const [imagesData, containersData] = await Promise.all([
        imagesAPI.list(),
        containersAPI.list({ all: true }),
      ]);

      const containersList = containersData.data || [];
      setContainers(containersList);

      // Build a map of image ID to containers
      const imageToContainers = {};
      containersList.forEach(container => {
        const imageId = container.imageId || container.ImageID;
        if (imageId) {
          if (!imageToContainers[imageId]) {
            imageToContainers[imageId] = [];
          }
          imageToContainers[imageId].push(container.name);
        }
      });

      // Add repository, tag, and containers as sortable fields
      const imagesWithTags = (imagesData.data || []).map(image => {
        let repository = '<none>';
        let tag = '<none>';

        if (image.tags && image.tags.length > 0) {
          const parts = image.tags[0].split(':');
          repository = parts[0];
          tag = parts[1] || 'latest';
        }

        // Get containers using this image
        const usingContainers = imageToContainers[image.id] || [];

        return {
          ...image,
          repository,
          tag,
          containers: usingContainers,
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
      setIsPruning(true);
      const result = await imagesAPI.prune();
      const pruneData = result.data;

      // Show detailed result (handle both response formats)
      const imagesDeleted = pruneData?.ImagesDeleted || pruneData?.imagesDeleted || [];
      const spaceReclaimed = pruneData?.SpaceReclaimed || pruneData?.spaceReclaimed || 0;

      if (imagesDeleted.length > 0) {
        // Count actual images (Untagged entries), not layers (Deleted entries)
        // Each image has one Untagged entry but multiple Deleted layer entries
        const imageCount = imagesDeleted.filter(img => img.Untagged).length;
        const layerCount = imagesDeleted.filter(img => img.Deleted).length;

        const message = imageCount > 0
          ? `Pruned ${imageCount} image(s) (${layerCount} layers), reclaimed ${formatBytes(spaceReclaimed)}`
          : `Pruned ${layerCount} layer(s), reclaimed ${formatBytes(spaceReclaimed)}`;

        addNotification({
          type: 'success',
          message,
        });
      } else {
        addNotification({
          type: 'info',
          message: 'No unused images to prune (images may still be referenced by stopped containers)',
        });
      }

      // Small delay to ensure Docker has finished cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      // Refresh the images list
      await loadImages();
    } catch (error) {
      console.error('Failed to prune images:', error);
      addNotification({
        type: 'error',
        message: 'Failed to prune images',
      });
    } finally {
      setIsPruning(false);
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
      key: 'containers',
      label: 'Used By',
      sortable: true,
      render: (containers) => {
        if (!containers || containers.length === 0) {
          return <span className="text-slate-500">-</span>;
        }
        return (
          <div className="flex flex-col gap-0.5 max-w-[150px]">
            {containers.map((name, idx) => (
              <span key={idx} className="text-xs truncate" title={name}>
                {name}
              </span>
            ))}
          </div>
        );
      },
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

  // Filter images based on dangling filter and search
  const filteredImages = images.filter((img) => {
    const isDangling = img.repository === '<none>';

    // Apply dangling filter
    if (danglingFilter === 'hide' && isDangling) {
      return false;
    }
    if (danglingFilter === 'only' && !isDangling) {
      return false;
    }
    // 'show' includes all images

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        img.repository?.toLowerCase().includes(search) ||
        img.tag?.toLowerCase().includes(search) ||
        img.tags?.some(t => t.toLowerCase().includes(search))
      );
    }
    return true;
  });

  // Count dangling images
  const danglingCount = images.filter(img => img.repository === '<none>').length;

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
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Images</h1>
          <p className="mt-1 lg:mt-2 text-sm lg:text-base text-slate-400">
            Manage your Docker images • {filteredImages.length} shown • {formatBytes(totalSize)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowPullModal(true)}
            className="flex items-center"
          >
            <ArrowDownTrayIcon className="h-5 w-5 lg:mr-2" />
            <span className="hidden sm:inline">Pull</span>
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Are you sure you want to prune all unused images? This will remove all dangling images.')) {
                handlePrune();
              }
            }}
            isLoading={isPruning}
            disabled={isPruning}
          >
            {isPruning ? 'Pruning...' : 'Prune'}
          </Button>
          <Button variant="secondary" onClick={loadImages}>
            <ArrowPathIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Search Bar and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search images..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 lg:px-4 py-2 pr-10 bg-glass-dark border border-glass-border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm lg:text-base"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              title="Clear search"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {danglingCount > 0 && (
          <select
            value={danglingFilter}
            onChange={(e) => setDanglingFilter(e.target.value)}
            className="glass-select text-sm py-2 px-3"
          >
            <option value="hide">Hide dangling</option>
            <option value="show">Show all ({images.length})</option>
            <option value="only">Only dangling ({danglingCount})</option>
          </select>
        )}
      </div>

      <Table
        columns={columns}
        data={filteredImages}
        defaultSort={{ key: 'repository', direction: 'asc' }}
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
