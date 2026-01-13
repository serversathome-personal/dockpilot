import apiClient from './client';

export const settingsAPI = {
  getRegistries: () => apiClient.get('/settings/registries'),
  loginRegistry: (data) => apiClient.post('/settings/registries/login', data),
  logoutRegistry: (data) => apiClient.post('/settings/registries/logout', data),
};
