import { useState, useEffect } from 'react';
import {
  FolderIcon,
  DocumentIcon,
  LinkIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { filesAPI } from '../../api/files.api';
import { formatBytes } from '../../utils/formatters';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';

export default function FileBrowser({ containerId, containerName }) {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewFileName, setPreviewFileName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    loadFiles(currentPath);
  }, [containerId, currentPath]);

  const loadFiles = async (path) => {
    try {
      setLoading(true);
      setError(null);
      const response = await filesAPI.list(containerId, path);
      setFiles(response.data.data || []);
    } catch (err) {
      console.error('Failed to load files:', err);
      setError(err.response?.data?.error || 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (file) => {
    if (file.type === 'directory') {
      const newPath = currentPath === '/'
        ? `/${file.name}`
        : `${currentPath}/${file.name}`;
      setCurrentPath(newPath);
    }
  };

  const handleNavigateUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.length === 0 ? '/' : `/${parts.join('/')}`);
  };

  const handleBreadcrumbClick = (index) => {
    const parts = currentPath.split('/').filter(Boolean);
    if (index === -1) {
      setCurrentPath('/');
    } else {
      setCurrentPath(`/${parts.slice(0, index + 1).join('/')}`);
    }
  };

  const handlePreview = async (file) => {
    const filePath = currentPath === '/'
      ? `/${file.name}`
      : `${currentPath}/${file.name}`;

    try {
      setPreviewLoading(true);
      setPreviewFileName(file.name);
      setShowPreview(true);
      const response = await filesAPI.getContent(containerId, filePath);
      setPreviewContent(response.data.data?.content || '');
    } catch (err) {
      console.error('Failed to load file content:', err);
      setPreviewContent(`Error loading file: ${err.response?.data?.error || err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = (file) => {
    const filePath = currentPath === '/'
      ? `/${file.name}`
      : `${currentPath}/${file.name}`;
    const url = filesAPI.getDownloadUrl(containerId, filePath);
    window.open(url, '_blank');
  };

  const getFileIcon = (file) => {
    switch (file.type) {
      case 'directory':
        return <FolderIcon className="h-5 w-5 text-yellow-400" />;
      case 'symlink':
        return <LinkIcon className="h-5 w-5 text-purple-400" />;
      default:
        return <DocumentIcon className="h-5 w-5 text-slate-400" />;
    }
  };

  const formatPermissions = (mode) => {
    if (!mode) return '---';
    return mode;
  };

  const formatModified = (mtime) => {
    if (!mtime) return '-';
    try {
      return new Date(mtime).toLocaleString();
    } catch {
      return '-';
    }
  };

  const breadcrumbParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-1 text-sm bg-black/30 rounded-lg px-4 py-2 overflow-x-auto">
        <button
          onClick={() => handleBreadcrumbClick(-1)}
          className="text-primary hover:text-primary-light transition-colors font-medium"
        >
          /
        </button>
        {breadcrumbParts.map((part, index) => (
          <span key={index} className="flex items-center">
            <ChevronRightIcon className="h-4 w-4 text-slate-500 mx-1" />
            <button
              onClick={() => handleBreadcrumbClick(index)}
              className={`transition-colors ${
                index === breadcrumbParts.length - 1
                  ? 'text-white font-medium'
                  : 'text-primary hover:text-primary-light'
              }`}
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        /* File List */
        <div className="bg-glass-dark backdrop-blur-xl rounded-lg border border-glass-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-glass-border bg-black/20">
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-400 hidden sm:table-cell">Size</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-400 hidden md:table-cell">Permissions</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-400 hidden lg:table-cell">Modified</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Parent Directory Entry */}
              {currentPath !== '/' && (
                <tr
                  onClick={handleNavigateUp}
                  className="border-b border-glass-border/50 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-3">
                      <FolderIcon className="h-5 w-5 text-yellow-400" />
                      <span className="text-white font-medium">..</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 hidden sm:table-cell">-</td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell">-</td>
                  <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">-</td>
                  <td className="px-4 py-3 text-right">-</td>
                </tr>
              )}

              {/* File/Folder Entries */}
              {files.length === 0 && currentPath === '/' ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-slate-400">
                    No files found
                  </td>
                </tr>
              ) : (
                files.map((file, index) => (
                  <tr
                    key={`${file.name}-${index}`}
                    className="border-b border-glass-border/50 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div
                        className={`flex items-center space-x-3 ${
                          file.type === 'directory' ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => file.type === 'directory' && handleNavigate(file)}
                      >
                        {getFileIcon(file)}
                        <span className={`${
                          file.type === 'directory'
                            ? 'text-white font-medium hover:text-primary'
                            : 'text-slate-300'
                        }`}>
                          {file.name}
                          {file.type === 'symlink' && file.target && (
                            <span className="text-slate-500 ml-2">-&gt; {file.target}</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm hidden sm:table-cell">
                      {file.type === 'directory' ? '-' : formatBytes(file.size || 0)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm font-mono hidden md:table-cell">
                      {formatPermissions(file.permissions)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm hidden lg:table-cell">
                      {formatModified(file.mtime)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {file.type === 'file' && (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handlePreview(file)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Preview file"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Download file"
                          >
                            <ArrowDownTrayIcon className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        isOpen={showPreview}
        onClose={() => {
          setShowPreview(false);
          setPreviewContent('');
          setPreviewFileName('');
        }}
        title={`Preview: ${previewFileName}`}
        size="xl"
      >
        {previewLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto overflow-y-auto text-sm text-slate-300 font-mono max-h-[60vh] whitespace-pre-wrap break-words">
            {previewContent || '(empty file)'}
          </pre>
        )}
      </Modal>
    </div>
  );
}
