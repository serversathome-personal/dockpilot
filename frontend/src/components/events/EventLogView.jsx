import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store';
import { eventsAPI } from '../../api/events.api';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';
import Badge from '../common/Badge';
import {
  ArrowPathIcon,
  PlayIcon,
  PauseIcon,
  CubeIcon,
  ServerIcon,
  Square3Stack3DIcon,
  GlobeAltIcon,
  CircleStackIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

export default function EventLogView() {
  const { addNotification } = useStore();
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [filter, setFilter] = useState('all');
  const eventSourceRef = useRef(null);
  const eventsContainerRef = useRef(null);

  useEffect(() => {
    loadEvents();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auto-scroll to top when new events arrive while streaming
  useEffect(() => {
    if (isStreaming && eventsContainerRef.current) {
      eventsContainerRef.current.scrollTop = 0;
    }
  }, [events, isStreaming]);

  const loadEvents = async () => {
    try {
      setIsLoading(true);
      const response = await eventsAPI.list({ limit: 200 });
      setEvents(response.data || []);
    } catch (error) {
      console.error('Failed to load events:', error);
      addNotification({
        type: 'error',
        message: 'Failed to load events',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const streamUrl = eventsAPI.getStreamUrl();
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'event') {
          setEvents((prev) => [data.data, ...prev].slice(0, 500));
        }
      } catch (error) {
        console.error('Failed to parse event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      addNotification({
        type: 'error',
        message: 'Event stream connection error',
      });
      stopStreaming();
    };

    eventSourceRef.current = eventSource;
    setIsStreaming(true);
  };

  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  };

  const getEventIcon = (type) => {
    switch (type) {
      case 'container':
        return <ServerIcon className="h-4 w-4" />;
      case 'image':
        return <Square3Stack3DIcon className="h-4 w-4" />;
      case 'network':
        return <GlobeAltIcon className="h-4 w-4" />;
      case 'volume':
        return <CircleStackIcon className="h-4 w-4" />;
      default:
        return <CubeIcon className="h-4 w-4" />;
    }
  };

  const getActionColor = (action) => {
    if (['start', 'create', 'connect', 'mount'].includes(action)) {
      return 'text-success';
    }
    if (['stop', 'kill', 'die', 'destroy', 'disconnect', 'unmount', 'delete', 'remove'].includes(action)) {
      return 'text-danger';
    }
    if (['restart', 'update', 'pull'].includes(action)) {
      return 'text-primary';
    }
    if (['pause', 'unpause'].includes(action)) {
      return 'text-warning';
    }
    return 'text-slate-300';
  };

  const getActionBadgeVariant = (action) => {
    if (['start', 'create', 'connect', 'mount'].includes(action)) {
      return 'success';
    }
    if (['stop', 'kill', 'die', 'destroy', 'disconnect', 'unmount', 'delete', 'remove'].includes(action)) {
      return 'danger';
    }
    if (['restart', 'update', 'pull'].includes(action)) {
      return 'primary';
    }
    if (['pause', 'unpause'].includes(action)) {
      return 'warning';
    }
    return 'default';
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const formatRelativeTime = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp * 1000;

    if (diff < 60000) {
      return 'Just now';
    } else if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }
  };

  const filteredEvents = events.filter((event) => {
    if (filter === 'all') return true;
    return event.type === filter;
  });

  const eventTypes = ['all', 'container', 'image', 'network', 'volume'];

  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Event Log</h1>
          <p className="mt-1 lg:mt-2 text-sm lg:text-base text-slate-400">
            Docker activity and events
            {isStreaming && (
              <Badge variant="success" className="ml-2">
                Live
              </Badge>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isStreaming ? (
            <Button variant="warning" onClick={stopStreaming}>
              <PauseIcon className="h-5 w-5 lg:mr-2" />
              <span className="hidden sm:inline">Pause</span>
            </Button>
          ) : (
            <Button variant="success" onClick={startStreaming}>
              <PlayIcon className="h-5 w-5 lg:mr-2" />
              <span className="hidden sm:inline">Live Stream</span>
            </Button>
          )}
          <Button variant="secondary" onClick={loadEvents} disabled={isLoading}>
            <ArrowPathIcon className="h-5 w-5 lg:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <FunnelIcon className="h-5 w-5 text-slate-400" />
        <span className="text-sm text-slate-400">Filter:</span>
        {eventTypes.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-2 lg:px-3 py-1 text-xs lg:text-sm rounded-lg transition-colors ${
              filter === type
                ? 'bg-primary text-white'
                : 'bg-glass-dark text-slate-300 hover:bg-glass-light'
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Events List */}
      <div
        ref={eventsContainerRef}
        className="bg-glass-dark backdrop-blur-xl rounded-lg border border-glass-border shadow-glass overflow-hidden max-h-[calc(100vh-280px)] overflow-y-auto"
      >
        {filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            No events found
          </div>
        ) : (
          <div className="divide-y divide-glass-border">
            {filteredEvents.map((event, index) => (
              <div
                key={`${event.time}-${event.action}-${index}`}
                className="p-4 hover:bg-glass-light transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className={`mt-1 ${getActionColor(event.action)}`}>
                      {getEventIcon(event.type)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={getActionBadgeVariant(event.action)}>
                          {event.action}
                        </Badge>
                        <span className="text-sm text-slate-400">{event.type}</span>
                      </div>
                      <div className="mt-1 text-white font-medium">
                        {event.actor?.name || event.actor?.id?.substring(0, 12) || 'Unknown'}
                      </div>
                      {event.actor?.attributes?.image && event.type === 'container' && (
                        <div className="mt-1 text-xs text-slate-400">
                          Image: {event.actor.attributes.image}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">
                      {formatRelativeTime(event.time)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatTime(event.time)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          Showing {filteredEvents.length} of {events.length} events
        </span>
        <span>
          Last 24 hours
        </span>
      </div>
    </div>
  );
}
