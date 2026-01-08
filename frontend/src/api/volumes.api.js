import apiClient from './client';

export const volumesAPI = {
  list: () => apiClient.get('/volumes'),
  get: (name) => apiClient.get(`/volumes/${name}`),
  create: (data) => apiClient.post('/volumes', data),
  remove: (name, params) => apiClient.delete(`/volumes/${name}`, { params }),
  prune: () => apiClient.post('/volumes/prune'),
  inspect: (name) => apiClient.get(`/volumes/${name}/inspect`),
};
