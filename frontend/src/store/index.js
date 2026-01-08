import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createDockerSlice } from './dockerSlice';
import { createUISlice } from './uiSlice';
import { createWebSocketSlice } from './websocketSlice';

export const useStore = create(
  devtools(
    (...args) => ({
      ...createDockerSlice(...args),
      ...createUISlice(...args),
      ...createWebSocketSlice(...args),
    }),
    { name: 'DockerManagementStore' }
  )
);
