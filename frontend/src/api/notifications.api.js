/**
 * Notifications API Client
 * Note: apiClient interceptor already unwraps response.data, so we return response directly
 */

import apiClient from './client';

export const notificationsAPI = {
  /**
   * Get notification settings
   */
  getSettings: async () => {
    return await apiClient.get('/notifications/settings');
  },

  /**
   * Save notification settings
   */
  saveSettings: async (settings) => {
    return await apiClient.post('/notifications/settings', settings);
  },

  /**
   * Test a notification URL
   */
  testUrl: async (url) => {
    return await apiClient.post('/notifications/test', { url });
  },

  /**
   * Send a manual notification
   */
  send: async (title, body, type = 'info') => {
    return await apiClient.post('/notifications/send', { title, body, type });
  },

  /**
   * Get notification history
   */
  getHistory: async (limit = 50) => {
    return await apiClient.get('/notifications/history', { params: { limit } });
  },

  /**
   * Clear notification history
   */
  clearHistory: async () => {
    return await apiClient.delete('/notifications/history');
  },
};
