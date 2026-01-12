import apiClient from './client';

export const dashboardAPI = {
  getOverview: () => apiClient.get('/dashboard/overview'),
  getStats: () => apiClient.get('/dashboard/stats'),
  getSystemInfo: () => apiClient.get('/dashboard/system'),
  getCpuHistory: () => apiClient.get('/dashboard/cpu-history'),
  getMemoryHistory: () => apiClient.get('/dashboard/memory-history'),
  getNetworkHistory: () => apiClient.get('/dashboard/network-history'),
  getVersion: () => apiClient.get('/dashboard/version'),
};
