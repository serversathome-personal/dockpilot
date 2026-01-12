/**
 * Notifications API Client
 */

import apiClient from './client';

export const notificationsAPI = {
  /**
   * Get notification settings
   */
  getSettings: async () => {
    const response = await apiClient.get('/notifications/settings');
    return response.data;
  },

  /**
   * Save notification settings
   */
  saveSettings: async (settings) => {
    const response = await apiClient.post('/notifications/settings', settings);
    return response.data;
  },

  /**
   * Test a notification URL
   */
  testUrl: async (url) => {
    const response = await apiClient.post('/notifications/test', { url });
    return response.data || { success: false, message: 'No response from server' };
  },

  /**
   * Send a manual notification
   */
  send: async (title, body, type = 'info') => {
    const response = await apiClient.post('/notifications/send', { title, body, type });
    return response.data;
  },

  /**
   * Get notification history
   */
  getHistory: async (limit = 50) => {
    const response = await apiClient.get('/notifications/history', { params: { limit } });
    return response.data;
  },

  /**
   * Clear notification history
   */
  clearHistory: async () => {
    const response = await apiClient.delete('/notifications/history');
    return response.data;
  },
};
