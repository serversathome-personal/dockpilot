import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  const {
    setWsConnected,
    setWsReconnecting,
    setWsError,
    appendContainerLog,
    setLiveContainerStats,
  } = useStore();

  const connect = useCallback(() => {
    try {
      // Use relative path so it goes through Vite proxy
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        setWsReconnecting(false);
        setWsError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle different message types
          switch (data.type) {
            case 'container_log':
              appendContainerLog(data.containerId, data.log);
              break;
            case 'container_stats':
              setLiveContainerStats(data.containerId, data.stats);
              break;
            case 'container_update':
              // Will be handled by individual components
              break;
            default:
              console.log('Unknown WebSocket message type:', data.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsError('WebSocket connection error');
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setWsConnected(false);

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          setWsReconnecting(true);
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
            connect();
          }, RECONNECT_DELAY);
        } else {
          setWsError('Max reconnection attempts reached');
          setWsReconnecting(false);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setWsError(error.message);
    }
  }, [setWsConnected, setWsReconnecting, setWsError, appendContainerLog, setLiveContainerStats]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    sendMessage,
    disconnect,
    reconnect: connect,
  };
}
