export const createWebSocketSlice = (set) => ({
  // WebSocket connection state
  wsConnected: false,
  wsReconnecting: false,
  wsError: null,

  // Live data streams
  liveContainerLogs: {},
  liveContainerStats: {},

  // Actions
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setWsReconnecting: (reconnecting) => set({ wsReconnecting: reconnecting }),
  setWsError: (error) => set({ wsError: error }),

  setLiveContainerLogs: (containerId, logs) => set((state) => ({
    liveContainerLogs: {
      ...state.liveContainerLogs,
      [containerId]: logs,
    },
  })),

  appendContainerLog: (containerId, logLine) => set((state) => ({
    liveContainerLogs: {
      ...state.liveContainerLogs,
      [containerId]: [
        ...(state.liveContainerLogs[containerId] || []),
        logLine,
      ],
    },
  })),

  clearContainerLogs: (containerId) => set((state) => {
    const logs = { ...state.liveContainerLogs };
    delete logs[containerId];
    return { liveContainerLogs: logs };
  }),

  setLiveContainerStats: (containerId, stats) => set((state) => ({
    liveContainerStats: {
      ...state.liveContainerStats,
      [containerId]: stats,
    },
  })),

  clearContainerStats: (containerId) => set((state) => {
    const stats = { ...state.liveContainerStats };
    delete stats[containerId];
    return { liveContainerStats: stats };
  }),
});
