import apiClient from './client';

// Get base URL for download links
const getBaseUrl = () => {
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:5000`;
  }
  return '';
};

export const filesAPI = {
  list: (containerId, path = '/') =>
    apiClient.get(`/containers/${containerId}/files`, { params: { path } }),

  getContent: (containerId, path) =>
    apiClient.get(`/containers/${containerId}/files/content`, { params: { path } }),

  getDownloadUrl: (containerId, path) =>
    `${getBaseUrl()}/api/containers/${containerId}/files/download?path=${encodeURIComponent(path)}`,
};
