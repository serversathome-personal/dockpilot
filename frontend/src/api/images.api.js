import apiClient from './client';

export const imagesAPI = {
  list: (params) => apiClient.get('/images', { params }),
  get: (id) => apiClient.get(`/images/${id}`),
  pull: (data) => apiClient.post('/images/pull', data),
  remove: (id, params) => apiClient.delete(`/images/${id}`, { params }),
  prune: () => apiClient.post('/images/prune'),
  inspect: (id) => apiClient.get(`/images/${id}/inspect`),
  history: (id) => apiClient.get(`/images/${id}/history`),
};
