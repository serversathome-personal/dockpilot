import apiClient from './client';

export const networksAPI = {
  list: () => apiClient.get('/networks'),
  get: (id) => apiClient.get(`/networks/${id}`),
  create: (data) => apiClient.post('/networks', data),
  remove: (id) => apiClient.delete(`/networks/${id}`),
  prune: () => apiClient.post('/networks/prune'),
  inspect: (id) => apiClient.get(`/networks/${id}/inspect`),
  connect: (id, data) => apiClient.post(`/networks/${id}/connect`, data),
  disconnect: (id, data) => apiClient.post(`/networks/${id}/disconnect`, data),
};
