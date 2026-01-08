export const createDockerSlice = (set, get) => ({
  // Dashboard stats
  dashboardStats: {
    containers: { total: 0, running: 0, stopped: 0 },
    images: { total: 0, size: 0 },
    networks: 0,
    volumes: 0,
    stacks: { total: 0, running: 0 },
  },

  // Docker entities
  containers: [],
  stacks: [],
  images: [],
  networks: [],
  volumes: [],

  // Actions
  setDashboardStats: (stats) => set({ dashboardStats: stats }),

  setContainers: (containers) => set({ containers }),
  updateContainer: (id, updates) => set((state) => ({
    containers: state.containers.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    ),
  })),

  setStacks: (stacks) => set({ stacks }),
  updateStack: (name, updates) => set((state) => ({
    stacks: state.stacks.map((s) =>
      s.name === name ? { ...s, ...updates } : s
    ),
  })),

  setImages: (images) => set({ images }),
  removeImage: (id) => set((state) => ({
    images: state.images.filter((img) => img.id !== id),
  })),

  setNetworks: (networks) => set({ networks }),
  removeNetwork: (id) => set((state) => ({
    networks: state.networks.filter((net) => net.id !== id),
  })),

  setVolumes: (volumes) => set({ volumes }),
  removeVolume: (name) => set((state) => ({
    volumes: state.volumes.filter((vol) => vol.name !== name),
  })),

  // Clear all data
  clearDockerData: () => set({
    containers: [],
    stacks: [],
    images: [],
    networks: [],
    volumes: [],
    dashboardStats: {
      containers: { total: 0, running: 0, stopped: 0 },
      images: { total: 0, size: 0 },
      networks: 0,
      volumes: 0,
      stacks: { total: 0, running: 0 },
    },
  }),
});
