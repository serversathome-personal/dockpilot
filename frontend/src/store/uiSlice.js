export const createUISlice = (set) => ({
  // Loading states
  isLoading: false,
  loadingMessage: '',

  // Modal states
  activeModal: null,
  modalData: null,

  // Notification/toast states
  notifications: [],

  // Mobile sidebar state
  sidebarOpen: false,

  // Actions
  setLoading: (isLoading, message = '') => set({ isLoading, loadingMessage: message }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  openModal: (modalType, data = null) => set({
    activeModal: modalType,
    modalData: data
  }),

  closeModal: () => set({
    activeModal: null,
    modalData: null
  }),

  addNotification: (notification) => set((state) => ({
    notifications: [
      ...state.notifications,
      {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        showToast: true, // Flag to show as toast popup
        ...notification,
      },
    ],
  })),

  dismissToast: (id) => set((state) => ({
    notifications: state.notifications.map((n) =>
      n.id === id ? { ...n, showToast: false } : n
    ),
  })),

  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((n) => n.id !== id),
  })),

  clearNotifications: () => set({ notifications: [] }),
});
