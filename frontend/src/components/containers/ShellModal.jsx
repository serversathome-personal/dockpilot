import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import Modal from '../common/Modal';

export default function ShellModal({ isOpen, onClose, container }) {
  const terminalRef = useRef(null);
  const terminalInstanceRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connectToShell = useCallback(() => {
    if (!container?.id || wsRef.current) return;

    setIsConnecting(true);
    setError(null);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/shell`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Shell WebSocket connected');

      // Get terminal dimensions
      const term = terminalInstanceRef.current;
      const cols = term?.cols || 80;
      const rows = term?.rows || 24;

      // Start shell session
      ws.send(JSON.stringify({
        type: 'start',
        payload: {
          containerId: container.id,
          cols,
          rows,
        },
      }));
    };

    ws.onmessage = (event) => {
      const term = terminalInstanceRef.current;
      if (!term) return;

      // Check if message is JSON (control message) or binary (shell output)
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'connected':
              console.log('Shell session connected:', data.clientId);
              break;
            case 'started':
              setIsConnected(true);
              setIsConnecting(false);
              term.focus();
              break;
            case 'exit':
              setIsConnected(false);
              term.writeln('\r\n\x1b[33mShell session ended.\x1b[0m');
              break;
            case 'error':
              setError(data.message);
              setIsConnecting(false);
              term.writeln(`\r\n\x1b[31mError: ${data.message}\x1b[0m`);
              break;
            default:
              // Unknown JSON message, might be output
              term.write(event.data);
          }
        } catch (e) {
          // Not JSON, treat as shell output
          term.write(event.data);
        }
      } else if (event.data instanceof Blob) {
        // Binary data - read and write to terminal
        event.data.text().then((text) => {
          term.write(text);
        });
      } else {
        term.write(event.data);
      }
    };

    ws.onerror = (event) => {
      console.error('Shell WebSocket error:', event);
      setError('Connection error');
      setIsConnecting(false);
    };

    ws.onclose = () => {
      console.log('Shell WebSocket closed');
      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;
    };
  }, [container?.id]);

  const initTerminal = useCallback(() => {
    if (!terminalRef.current || terminalInstanceRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        cursorAccent: '#1a1b26',
        selection: '#33467c',
        black: '#32344a',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#ad8ee6',
        cyan: '#449dab',
        white: '#787c99',
        brightBlack: '#444b6a',
        brightRed: '#ff7a93',
        brightGreen: '#b9f27c',
        brightYellow: '#ff9e64',
        brightBlue: '#7da6ff',
        brightMagenta: '#bb9af7',
        brightCyan: '#0db9d7',
        brightWhite: '#acb0d0',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    terminalInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle terminal input
    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'input',
          payload: { data },
        }));
      }
    });

    // Handle terminal resize
    term.onResize(({ cols, rows }) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize',
          payload: { cols, rows },
        }));
      }
    });

    // Write welcome message
    term.writeln('\x1b[36mConnecting to container shell...\x1b[0m');
    term.writeln('');

    // Connect to shell
    connectToShell();
  }, [connectToShell]);

  // Initialize terminal when modal opens
  useEffect(() => {
    if (isOpen && container) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        initTerminal();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isOpen, container, initTerminal]);

  // Handle window resize
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    // Also fit when modal content might have changed size
    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [isOpen]);

  // Cleanup on close
  const handleClose = useCallback(() => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Dispose terminal
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose();
      terminalInstanceRef.current = null;
    }

    fitAddonRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);

    onClose();
  }, [onClose]);

  // Reconnect handler
  const handleReconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setError(null);

    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear();
      terminalInstanceRef.current.writeln('\x1b[36mReconnecting...\x1b[0m');
      terminalInstanceRef.current.writeln('');
    }

    connectToShell();
  }, [connectToShell]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Shell - ${container?.name || 'Container'}`}
      size="xl"
    >
      <div className="flex flex-col h-[70vh]">
        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 text-sm">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="text-slate-400">
              {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {!isConnected && !isConnecting && (
              <button
                onClick={handleReconnect}
                className="px-2 py-1 text-xs bg-primary hover:bg-primary-dark rounded transition-colors"
              >
                Reconnect
              </button>
            )}
            <span className="text-slate-500 text-xs">
              {container?.id?.substring(0, 12)}
            </span>
          </div>
        </div>

        {/* Terminal container */}
        <div
          ref={terminalRef}
          className="flex-1 bg-[#1a1b26] p-1 overflow-hidden"
          style={{ minHeight: '400px' }}
        />

        {/* Error message */}
        {error && (
          <div className="px-3 py-2 bg-red-900/50 border-t border-red-700 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Help text */}
        <div className="px-3 py-2 bg-slate-800 border-t border-slate-700 text-xs text-slate-500">
          Press Ctrl+D or type 'exit' to close the shell session
        </div>
      </div>
    </Modal>
  );
}
