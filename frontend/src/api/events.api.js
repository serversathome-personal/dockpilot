import apiClient from './client';

export const eventsAPI = {
  /**
   * Get Docker events history
   * @param {Object} options - Query options
   * @returns {Promise} API response
   */
  list: (options = {}) => {
    const params = new URLSearchParams();
    if (options.since) params.append('since', options.since);
    if (options.until) params.append('until', options.until);
    if (options.limit) params.append('limit', options.limit);

    const queryString = params.toString();
    return apiClient.get(`/events${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Get stream URL for Docker events
   * @returns {string} SSE stream URL
   */
  getStreamUrl: () => {
    const baseUrl = import.meta.env.DEV
      ? `http://${window.location.hostname}:5000`
      : '';
    return `${baseUrl}/api/events/stream`;
  },
};
