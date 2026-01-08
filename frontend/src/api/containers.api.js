import apiClient from './client';

export const containersAPI = {
  list: (params) => apiClient.get('/containers', { params }),
  get: (id) => apiClient.get(`/containers/${id}`),
  start: (id) => apiClient.post(`/containers/${id}/start`),
  stop: (id) => apiClient.post(`/containers/${id}/stop`),
  restart: (id) => apiClient.post(`/containers/${id}/restart`),
  pause: (id) => apiClient.post(`/containers/${id}/pause`),
  unpause: (id) => apiClient.post(`/containers/${id}/unpause`),
  remove: (id, params) => apiClient.delete(`/containers/${id}`, { params }),
  update: (id) => apiClient.post(`/containers/${id}/update`),
  logs: (id, params) => apiClient.get(`/containers/${id}/logs`, { params }),
  stats: (id) => apiClient.get(`/containers/${id}/stats`),
  inspect: (id) => apiClient.get(`/containers/${id}/inspect`),
};
