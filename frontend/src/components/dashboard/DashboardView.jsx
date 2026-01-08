import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { dashboardAPI } from '../../api/dashboard.api';
import { formatBytes } from '../../utils/formatters';
import Card from '../common/Card';
import LoadingSpinner from '../common/LoadingSpinner';
import CircularProgress from '../common/CircularProgress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  ServerIcon,
  PhotoIcon,
  GlobeAltIcon,
  CircleStackIcon,
  CubeIcon,
  CpuChipIcon,
  CircleStackIcon as MemoryIcon,
} from '@heroicons/react/24/outline';

export default function DashboardView() {
  const { dashboardStats, setDashboardStats, isLoading, setLoading } = useStore();
  const navigate = useNavigate();
  const [systemInfo, setSystemInfo] = useState(null);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const [networkHistory, setNetworkHistory] = useState([]);

  useEffect(() => {
    loadStats();
    loadCpuHistory();
    loadMemoryHistory();
    loadNetworkHistory();

    // Refresh histories every minute
    const interval = setInterval(() => {
      loadCpuHistory();
      loadMemoryHistory();
      loadNetworkHistory();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await dashboardAPI.getOverview();
      // Extract stats from the response data
      const stats = response.data?.stats || {
        containers: { total: 0, running: 0, stopped: 0 },
        images: { total: 0, size: 0 },
        networks: 0,
        volumes: 0,
        stacks: { total: 0, running: 0 },
      };
      setDashboardStats(stats);
      setSystemInfo(response.data?.system || null);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCpuHistory = async () => {
    try {
      const response = await dashboardAPI.getCpuHistory();
      setCpuHistory(response.data || []);
    } catch (error) {
      console.error('Failed to load CPU history:', error);
    }
  };

  const loadMemoryHistory = async () => {
    try {
      const response = await dashboardAPI.getMemoryHistory();
      setMemoryHistory(response.data || []);
    } catch (error) {
      console.error('Failed to load memory history:', error);
    }
  };

  const loadNetworkHistory = async () => {
    try {
      const response = await dashboardAPI.getNetworkHistory();
      setNetworkHistory(response.data || []);
    } catch (error) {
      console.error('Failed to load network history:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const stats = [
    {
      name: 'Containers',
      icon: ServerIcon,
      total: dashboardStats.containers.total,
      running: dashboardStats.containers.running,
      stopped: dashboardStats.containers.stopped,
      color: 'text-primary',
      path: '/containers',
    },
    {
      name: 'Stacks',
      icon: CubeIcon,
      total: dashboardStats.stacks.total,
      running: dashboardStats.stacks.running,
      color: 'text-success',
      path: '/stacks',
    },
    {
      name: 'Images',
      icon: PhotoIcon,
      total: dashboardStats.images.total,
      size: formatBytes(dashboardStats.images.size),
      color: 'text-warning',
      path: '/images',
    },
    {
      name: 'Networks',
      icon: GlobeAltIcon,
      total: dashboardStats.networks,
      color: 'text-purple-500',
      path: '/networks',
    },
    {
      name: 'Volumes',
      icon: CircleStackIcon,
      total: dashboardStats.volumes,
      color: 'text-pink-500',
      path: '/volumes',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-slate-400">Overview of your Docker environment</p>
      </div>

      {/* Docker Resources Bar */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Docker Resources</h2>
        <div className="bg-glass-dark backdrop-blur-xl rounded-lg border border-glass-border shadow-glass overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 divide-x divide-glass-border">
            {stats.map((stat) => (
              <div
                key={stat.name}
                className="cursor-pointer hover:bg-glass-light transition-colors p-4"
                onClick={() => navigate(stat.path)}
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg bg-glass-light ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-400 truncate">{stat.name}</p>
                    <p className="text-2xl font-bold text-white">{stat.total}</p>
                    {stat.running !== undefined && (
                      <p className="text-sm text-success">
                        {stat.running} running
                      </p>
                    )}
                    {stat.size !== undefined && (
                      <p className="text-sm text-slate-400 truncate">
                        {stat.size}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Host System Metrics */}
      {systemInfo && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Host System</h2>
          <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* CPU Card - Compact */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-lg bg-glass-light text-primary">
                    <CpuChipIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-400">CPU Usage</p>
                    <p className="text-2xl font-bold text-white">{systemInfo.cpuUsage?.toFixed(1) || 0}%</p>
                  </div>
                </div>
                {systemInfo.cpuUsage !== undefined && (
                  <CircularProgress percentage={systemInfo.cpuUsage} size={60} strokeWidth={6} />
                )}
              </div>
              <p className="text-sm text-slate-400">{systemInfo.cpus} Cores • {systemInfo.architecture}</p>
            </Card>

            {/* Memory Card - Compact */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-lg bg-glass-light text-success">
                    <MemoryIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-400">Memory</p>
                    <p className="text-2xl font-bold text-white">{systemInfo.memoryUsage?.toFixed(1) || 0}%</p>
                  </div>
                </div>
                {systemInfo.memoryUsage !== undefined && (
                  <CircularProgress percentage={systemInfo.memoryUsage} size={60} strokeWidth={6} />
                )}
              </div>
              <p className="text-sm text-slate-400">
                {formatBytes(systemInfo.memory * (systemInfo.memoryUsage / 100))} / {formatBytes(systemInfo.memory)}
              </p>
            </Card>

            {/* Storage Card - Compact */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-lg bg-glass-light text-warning">
                    <CircleStackIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-400">Storage</p>
                    <p className="text-2xl font-bold text-white">
                      {systemInfo.storageUsagePercent?.toFixed(1) || 0}%
                    </p>
                  </div>
                </div>
                {systemInfo.storageUsagePercent !== undefined && (
                  <CircularProgress percentage={systemInfo.storageUsagePercent} size={60} strokeWidth={6} />
                )}
              </div>
              <p className="text-sm text-slate-400">
                {systemInfo.storageFree && systemInfo.storageTotal
                  ? `${formatBytes(systemInfo.storageFree)} free of ${formatBytes(systemInfo.storageTotal)}`
                  : 'Storage info unavailable'}
              </p>
            </Card>
          </div>

          {/* Usage History Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* CPU History */}
            <Card title="CPU History" className="p-3">
              {cpuHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={cpuHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                    <XAxis
                      dataKey="timestamp"
                      stroke="rgba(148, 163, 184, 0.5)"
                      tick={{ fill: 'rgba(148, 163, 184, 0.7)', fontSize: 11 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                      }}
                    />
                    <YAxis
                      stroke="rgba(148, 163, 184, 0.5)"
                      tick={{ fill: 'rgba(148, 163, 184, 0.7)', fontSize: 11 }}
                      domain={[0, 100]}
                      ticks={[0, 50, 100]}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                      labelFormatter={(value) => new Date(value).toLocaleString()}
                      formatter={(value) => [`${value}%`, 'CPU']}
                    />
                    <Line
                      type="monotone"
                      dataKey="usage"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[120px] text-slate-400 text-sm">
                  Collecting data...
                </div>
              )}
            </Card>

            {/* Memory History */}
            <Card title="Memory History" className="p-3">
              {memoryHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={memoryHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                    <XAxis
                      dataKey="timestamp"
                      stroke="rgba(148, 163, 184, 0.5)"
                      tick={{ fill: 'rgba(148, 163, 184, 0.7)', fontSize: 11 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                      }}
                    />
                    <YAxis
                      stroke="rgba(148, 163, 184, 0.5)"
                      tick={{ fill: 'rgba(148, 163, 184, 0.7)', fontSize: 11 }}
                      domain={[0, 100]}
                      ticks={[0, 50, 100]}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                      labelFormatter={(value) => new Date(value).toLocaleString()}
                      formatter={(value) => [`${value}%`, 'Memory']}
                    />
                    <Line
                      type="monotone"
                      dataKey="usage"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[120px] text-slate-400 text-sm">
                  Collecting data...
                </div>
              )}
            </Card>

            {/* Network History */}
            <Card title="Network History" className="p-3">
              {networkHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={networkHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                    <XAxis
                      dataKey="timestamp"
                      stroke="rgba(148, 163, 184, 0.5)"
                      tick={{ fill: 'rgba(148, 163, 184, 0.7)', fontSize: 11 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                      }}
                    />
                    <YAxis
                      stroke="rgba(148, 163, 184, 0.5)"
                      tick={{ fill: 'rgba(148, 163, 184, 0.7)', fontSize: 11 }}
                      tickFormatter={(value) => formatBytes(value) + '/s'}
                      tickCount={3}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                      labelFormatter={(value) => new Date(value).toLocaleString()}
                      formatter={(value, name) => [
                        formatBytes(value) + '/s',
                        name === 'rx' ? 'Download' : 'Upload'
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="rx"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                      name="Download"
                    />
                    <Line
                      type="monotone"
                      dataKey="tx"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                      name="Upload"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[120px] text-slate-400 text-sm">
                  Collecting data...
                </div>
              )}
            </Card>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
