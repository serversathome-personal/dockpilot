import { format, formatDistanceToNow } from 'date-fns';

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format container status for display
 */
export function formatContainerStatus(status) {
  if (!status) return 'unknown';

  const statusLower = status.toLowerCase();

  if (statusLower.includes('up')) return 'running';
  if (statusLower.includes('exited')) return 'stopped';
  if (statusLower.includes('created')) return 'created';
  if (statusLower.includes('restarting')) return 'restarting';
  if (statusLower.includes('removing')) return 'removing';
  if (statusLower.includes('paused')) return 'paused';
  if (statusLower.includes('dead')) return 'dead';

  return statusLower;
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date) {
  if (!date) return 'N/A';

  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch (error) {
    return 'Invalid date';
  }
}

/**
 * Format date to standard format
 */
export function formatDate(date, formatString = 'PPpp') {
  if (!date) return 'N/A';

  try {
    return format(new Date(date), formatString);
  } catch (error) {
    return 'Invalid date';
  }
}

/**
 * Format container uptime
 */
export function formatUptime(seconds) {
  if (!seconds || seconds < 0) return 'N/A';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

/**
 * Format CPU percentage
 */
export function formatCPU(cpu) {
  if (cpu === null || cpu === undefined) return 'N/A';
  return `${cpu.toFixed(2)}%`;
}

/**
 * Format memory usage
 */
export function formatMemory(used, total) {
  if (!used || !total) return 'N/A';

  const percentage = ((used / total) * 100).toFixed(2);
  return `${formatBytes(used)} / ${formatBytes(total)} (${percentage}%)`;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str, length = 50) {
  if (!str) return '';
  if (str.length <= length) return str;
  return `${str.substring(0, length)}...`;
}

/**
 * Format port mapping
 */
export function formatPorts(ports) {
  if (!ports || ports.length === 0) return 'None';

  const formatted = ports
    .map(port => {
      // Support both uppercase and lowercase property names
      const publicPort = port.publicPort || port.PublicPort;
      const privatePort = port.privatePort || port.PrivatePort;
      const type = port.type || port.Type;

      if (publicPort) {
        return `${publicPort}:${privatePort}/${type}`;
      }
      return `${privatePort}/${type}`;
    });

  // Remove duplicates
  const unique = [...new Set(formatted)];

  return unique.join(', ');
}

/**
 * Format network mode
 */
export function formatNetworkMode(mode) {
  if (!mode) return 'default';

  if (mode.startsWith('container:')) {
    return `Container: ${mode.substring(10, 22)}...`;
  }

  return mode;
}

/**
 * Format restart policy
 */
export function formatRestartPolicy(policy) {
  if (!policy || !policy.Name) return 'no';

  if (policy.Name === 'on-failure' && policy.MaximumRetryCount) {
    return `${policy.Name}:${policy.MaximumRetryCount}`;
  }

  return policy.Name;
}
