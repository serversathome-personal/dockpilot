import axios from 'axios';

// Use relative path so it works with Vite proxy and across different hosts
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 600000, // 10 minutes to handle long-running docker builds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add any auth tokens here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    // Extract error message from different possible formats
    let message = 'An error occurred';

    if (error.response?.data?.error) {
      // Backend returns error as { error: { message: "...", details: "..." } }
      const errorData = error.response.data.error;
      if (typeof errorData === 'string') {
        message = errorData;
      } else if (errorData.message) {
        message = errorData.message;
      } else if (typeof errorData === 'object') {
        message = JSON.stringify(errorData);
      }
    } else if (error.response?.data?.message) {
      message = error.response.data.message;
    } else if (error.message) {
      message = error.message;
    }

    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

export default apiClient;
