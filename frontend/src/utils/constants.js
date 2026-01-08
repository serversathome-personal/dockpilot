/**
 * Container states and their display configurations
 */
export const CONTAINER_STATES = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  PAUSED: 'paused',
  RESTARTING: 'restarting',
  REMOVING: 'removing',
  EXITED: 'exited',
  CREATED: 'created',
  DEAD: 'dead',
};

/**
 * Container health states
 */
export const HEALTH_STATES = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  STARTING: 'starting',
  NONE: 'none',
};

/**
 * Image pull states
 */
export const PULL_STATES = {
  IDLE: 'idle',
  PULLING: 'pulling',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * Stack states
 */
export const STACK_STATES = {
  RUNNING: 'running',
  PARTIAL: 'partial',
  STOPPED: 'stopped',
  ERROR: 'error',
};

/**
 * Modal types
 */
export const MODAL_TYPES = {
  CONTAINER_LOGS: 'container_logs',
  CONTAINER_INSPECT: 'container_inspect',
  CONTAINER_STATS: 'container_stats',
  CONTAINER_DELETE: 'container_delete',
  STACK_CREATE: 'stack_create',
  STACK_EDIT: 'stack_edit',
  STACK_DELETE: 'stack_delete',
  IMAGE_PULL: 'image_pull',
  IMAGE_DELETE: 'image_delete',
  NETWORK_CREATE: 'network_create',
  NETWORK_DELETE: 'network_delete',
  VOLUME_CREATE: 'volume_create',
  VOLUME_DELETE: 'volume_delete',
  CONFIRM: 'confirm',
};

/**
 * WebSocket message types
 */
export const WS_MESSAGE_TYPES = {
  SUBSCRIBE_LOGS: 'subscribe_logs',
  UNSUBSCRIBE_LOGS: 'unsubscribe_logs',
  SUBSCRIBE_STATS: 'subscribe_stats',
  UNSUBSCRIBE_STATS: 'unsubscribe_stats',
  CONTAINER_LOG: 'container_log',
  CONTAINER_STATS: 'container_stats',
  CONTAINER_UPDATE: 'container_update',
};

/**
 * Notification types
 */
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

/**
 * Table row actions
 */
export const TABLE_ACTIONS = {
  START: 'start',
  STOP: 'stop',
  RESTART: 'restart',
  PAUSE: 'pause',
  UNPAUSE: 'unpause',
  REMOVE: 'remove',
  LOGS: 'logs',
  INSPECT: 'inspect',
  STATS: 'stats',
};

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  DASHBOARD: '/dashboard',
  STACKS: '/stacks',
  CONTAINERS: '/containers',
  IMAGES: '/images',
  NETWORKS: '/networks',
  VOLUMES: '/volumes',
  UPDATES: '/updates',
};

/**
 * Polling intervals (in milliseconds)
 */
export const POLLING_INTERVALS = {
  DASHBOARD: 5000,
  CONTAINERS: 3000,
  STACKS: 5000,
  IMAGES: 10000,
  STATS: 1000,
};

/**
 * Default pagination settings
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
};

/**
 * Network drivers
 */
export const NETWORK_DRIVERS = {
  BRIDGE: 'bridge',
  HOST: 'host',
  OVERLAY: 'overlay',
  MACVLAN: 'macvlan',
  NONE: 'none',
};

/**
 * Volume drivers
 */
export const VOLUME_DRIVERS = {
  LOCAL: 'local',
  NFS: 'nfs',
};

/**
 * Restart policies
 */
export const RESTART_POLICIES = {
  NO: 'no',
  ALWAYS: 'always',
  ON_FAILURE: 'on-failure',
  UNLESS_STOPPED: 'unless-stopped',
};
