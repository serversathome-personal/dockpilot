import apiClient from './client';

export const stacksAPI = {
  list: () => apiClient.get('/stacks'),
  get: (name) => apiClient.get(`/stacks/${name}`),
  getContainers: (name) => apiClient.get(`/stacks/${name}/containers`),
  create: (data) => apiClient.post('/stacks', data),
  delete: (name, params) => apiClient.delete(`/stacks/${name}`, { params }),
  start: (name) => apiClient.post(`/stacks/${name}/start`),
  stop: (name) => apiClient.post(`/stacks/${name}/stop`),
  down: (name) => apiClient.post(`/stacks/${name}/down`),
  restart: (name) => apiClient.post(`/stacks/${name}/restart`),
  pull: (name) => apiClient.post(`/stacks/${name}/pull`),
  update: (name) => apiClient.post(`/stacks/${name}/update`),
  getCompose: (name) => apiClient.get(`/stacks/${name}/compose`),
  updateCompose: (name, content) => apiClient.put(`/stacks/${name}/compose`, { content }),
  getEnv: (name) => apiClient.get(`/stacks/${name}/env`),
  updateEnv: (name, envVars) => apiClient.put(`/stacks/${name}/env`, { envVars }),
  getLogs: (name, params) => apiClient.get(`/stacks/${name}/logs`, { params }),
  validate: (name) => apiClient.get(`/stacks/${name}/validate`),
  cloneFromGit: (data) => apiClient.post('/stacks/clone-git', data),
};
