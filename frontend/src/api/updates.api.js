import apiClient from './client';

export const updatesAPI = {
  checkForUpdates: () => apiClient.get('/updates/check'),
  executeUpdates: (data) => apiClient.post('/updates/execute', data),
  getSchedules: () => apiClient.get('/updates/schedules'),
  saveSchedule: (data) => apiClient.post('/updates/schedules', data),
  deleteSchedule: (id) => apiClient.delete(`/updates/schedules/${id}`),
  getHistory: (params) => apiClient.get('/updates/history', { params }),
  clearHistory: () => apiClient.delete('/updates/history'),
};
