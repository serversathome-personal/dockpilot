import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function useLiveLogs(containerId, enabled = true) {
  const { sendMessage } = useStore();
  const previousEnabledRef = useRef(enabled);

  useEffect(() => {
    if (!containerId) return;

    // Start streaming logs when enabled
    if (enabled && !previousEnabledRef.current) {
      sendMessage({
        type: 'subscribe_logs',
        containerId,
      });
    }

    // Stop streaming logs when disabled
    if (!enabled && previousEnabledRef.current) {
      sendMessage({
        type: 'unsubscribe_logs',
        containerId,
      });
    }

    previousEnabledRef.current = enabled;

    // Cleanup on unmount
    return () => {
      if (enabled) {
        sendMessage({
          type: 'unsubscribe_logs',
          containerId,
        });
      }
    };
  }, [containerId, enabled, sendMessage]);

  const logs = useStore((state) => state.liveContainerLogs[containerId] || []);

  return logs;
}
