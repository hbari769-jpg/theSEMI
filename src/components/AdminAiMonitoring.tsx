import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Cpu,
  Zap,
  TrendingUp,
  AlertTriangle,
  Search,
  RefreshCw,
  Image as ImageIcon,
  Globe,
  AlertCircle,
  Clock,
  User,
  Users,
  CheckCircle2,
  Filter,
  BarChart2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldAlert,
  Download,
  Info,
  Layers,
  Sparkles,
  Flame,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface UserUsageMetric {
  userId: string;
  userName: string;
  userEmail: string;
  totalRequests: number;
  requestsToday: number;
  requestsThisMonth: number;
  chatCount: number;
  imageCount: number;
  searchCount: number;
  errorCount: number;
  lastActiveAt: string;
  isUnusuallyHigh: boolean;
  anomalyReason?: string;
  severity?: 'normal' | 'medium' | 'high' | 'critical';
}

interface ModelUsageMetric {
  provider: string;
  model: string;
  count: number;
  percentage: number;
  requestsToday: number;
  color: string;
}

interface UnusualUsageAlert {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  requests24h: number;
  requestsLastHour: number;
  imageCount24h: number;
  severity: 'medium' | 'high' | 'critical';
  reason: string;
  detectedAt: string;
}

interface MonitoringOverviewData {
  summary: {
    totalAiRequests: number;
    requestsToday: number;
    requestsThisMonth: number;
    activeUsersTotal: number;
    activeUsersToday: number;
    activeUsers7d: number;
    activeUsers30d: number;
    totalImages: number;
    imagesToday: number;
    imagesThisMonth: number;
    totalWebSearches: number;
    searchesToday: number;
    searchesThisMonth: number;
    totalApiErrors: number;
    errorsToday: number;
    errorsThisMonth: number;
    errorRatePercent: number;
    unusualHighUsageAlertsCount: number;
  };
  usersUsage: UserUsageMetric[];
  modelsUsage: ModelUsageMetric[];
  providerDistribution: Array<{ provider: string; count: number; percentage: number }>;
  imageUsage: {
    total: number;
    today: number;
    thisMonth: number;
    byAspectRatio: Record<string, number>;
    byStyle: Record<string, number>;
    recentGenerations: Array<{
      id: string;
      timestamp: string;
      userEmail: string;
      prompt: string;
      aspectRatio: string;
      style: string;
    }>;
  };
  webSearchUsage: {
    total: number;
    today: number;
    thisMonth: number;
    byProvider: Record<string, number>;
    recentSearches: Array<{
      id: string;
      timestamp: string;
      userEmail: string;
      query: string;
      provider: string;
    }>;
  };
  apiErrors: {
    total: number;
    today: number;
    thisMonth: number;
    errorRatePercent: number;
    byType: Record<string, number>;
    byProvider: Record<string, number>;
    recentErrors: Array<{
      id: string;
      timestamp: number;
      isoDate: string;
      endpoint: string;
      provider?: string;
      model?: string;
      errorType: string;
      errorMessage: string;
      userId?: string;
      userEmail?: string;
      ip?: string;
    }>;
  };
  volumeOverTime: Array<{
    date: string;
    label: string;
    chats: number;
    images: number;
    searches: number;
    errors: number;
    total: number;
  }>;
  hourlyVolumeToday: Array<{ hour: string; chats: number; images: number; total: number }>;
  unusualUsageAlerts: UnusualUsageAlert[];
  monitoringStatus: {
    rateLimitingEnabled: boolean;
    storageMode: string;
    lastUpdated: string;
  };
}

interface AdminAiMonitoringProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AdminAiMonitoring: React.FC<AdminAiMonitoringProps> = ({ authFetch, showToast }) => {
  const [data, setData] = useState<MonitoringOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  // User search & filtering states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [userFilter, setUserFilter] = useState<'all' | 'anomalies' | 'today' | 'images'>('all');
  const [sortField, setSortField] = useState<'totalRequests' | 'requestsToday' | 'requestsThisMonth' | 'imageCount' | 'lastActiveAt'>('totalRequests');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  // Active view sub-section
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'users' | 'models' | 'images' | 'search' | 'errors'>('dashboard');

  const fetchMonitoringData = async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
      setError(null);
      const res = await authFetch('/api/admin/ai-monitoring');
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const jsonData = await res.json();
      setData(jsonData);
    } catch (err: any) {
      console.error('Failed to fetch AI monitoring telemetry:', err);
      setError(err?.message || 'Failed to load AI usage monitoring data.');
      if (!silent) showToast('Failed to refresh AI monitoring telemetry', 'error');
    } finally {
      setIsLoading(false);
      if (!silent) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMonitoringData();
  }, []);

  // Auto-refresh interval (30s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMonitoringData(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Filter and sort user metrics
  const filteredUsers = useMemo(() => {
    if (!data?.usersUsage) return [];
    let list = [...data.usersUsage];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (u) =>
          u.userEmail.toLowerCase().includes(q) ||
          u.userName.toLowerCase().includes(q) ||
          u.userId.toLowerCase().includes(q)
      );
    }

    if (userFilter === 'anomalies') {
      list = list.filter((u) => u.isUnusuallyHigh);
    } else if (userFilter === 'today') {
      list = list.filter((u) => u.requestsToday > 0);
    } else if (userFilter === 'images') {
      list = list.filter((u) => u.imageCount > 0);
    }

    list.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      if (sortField === 'lastActiveAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return list;
  }, [data?.usersUsage, searchQuery, userFilter, sortField, sortDirection]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const exportTelemetryJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aestific-ai-telemetry-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported AI monitoring telemetry JSON', 'success');
  };

  if (isLoading && !data) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] text-zinc-400 space-y-3 font-mono text-sm">
        <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
        <div>Compiling real-time AI Usage Telemetry...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/30 border border-red-800 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
        <div className="text-red-200 font-mono font-bold text-base">Monitoring Data Unavailable</div>
        <div className="text-zinc-400 text-xs font-mono max-w-md mx-auto">{error}</div>
        <button
          onClick={() => fetchMonitoringData()}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-mono font-bold cursor-pointer"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const s = data?.summary || {
    totalAiRequests: 0,
    requestsToday: 0,
    requestsThisMonth: 0,
    activeUsersTotal: 0,
    activeUsersToday: 0,
    activeUsers7d: 0,
    activeUsers30d: 0,
    totalImages: 0,
    imagesToday: 0,
    imagesThisMonth: 0,
    totalWebSearches: 0,
    searchesToday: 0,
    searchesThisMonth: 0,
    totalApiErrors: 0,
    errorsToday: 0,
    errorsThisMonth: 0,
    errorRatePercent: 0,
    unusualHighUsageAlertsCount: 0,
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Top Banner: Launch Unlimited Status & Decoupled Architecture Notice */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#140608] via-[#0d0305] to-[#080203] border border-red-900/60 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Initial Launch: Unlimited Usage Active
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-zinc-900 text-zinc-400 border border-zinc-700/60">
              Rate Limiting: Disabled
            </span>
            <span className="hidden sm:inline px-2.5 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-[#090203] border border-red-950">
              Modular Architecture Ready
            </span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            Autonomous AI Usage & Anomaly Monitoring
          </h2>
          <p className="text-xs text-zinc-400 font-mono">
            Full visibility into user requests, models, image generation, web search, and API errors without restricting public users.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-red-950/70 text-red-200 border-red-800 shadow-[0_0_10px_rgba(220,38,38,0.2)]'
                : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
            title="Auto-refresh telemetry every 30 seconds"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Auto: {autoRefresh ? '30s ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => fetchMonitoringData()}
            disabled={isRefreshing}
            className="px-3 py-1.5 bg-red-950/50 hover:bg-red-900/60 text-red-200 border border-red-800/80 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-red-400' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={exportTelemetryJson}
            className="px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/80 rounded-xl text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5"
            title="Export full telemetry data as JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total AI Requests */}
        <div className="p-4 rounded-2xl bg-[#090203] border border-red-950/80 hover:border-red-800/60 transition-all space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span className="uppercase tracking-wider">Total AI Requests</span>
            <Cpu className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {s.totalAiRequests.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-red-950/40 pt-2">
            <span>Today: <strong className="text-red-300">+{s.requestsToday}</strong></span>
            <span>This Month: <strong className="text-zinc-200">{s.requestsThisMonth}</strong></span>
          </div>
        </div>

        {/* Active AI Users */}
        <div className="p-4 rounded-2xl bg-[#090203] border border-red-950/80 hover:border-red-800/60 transition-all space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span className="uppercase tracking-wider">Active Users</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {s.activeUsersTotal.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-red-950/40 pt-2">
            <span>24h Active: <strong className="text-emerald-300">{s.activeUsersToday}</strong></span>
            <span>7d: <strong className="text-zinc-200">{s.activeUsers7d}</strong></span>
            <span>30d: <strong className="text-zinc-200">{s.activeUsers30d}</strong></span>
          </div>
        </div>

        {/* Image Generations */}
        <div className="p-4 rounded-2xl bg-[#090203] border border-red-950/80 hover:border-red-800/60 transition-all space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span className="uppercase tracking-wider">Image Generations</span>
            <ImageIcon className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {s.totalImages.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-red-950/40 pt-2">
            <span>Today: <strong className="text-purple-300">+{s.imagesToday}</strong></span>
            <span>Month: <strong className="text-zinc-200">{s.imagesThisMonth}</strong></span>
          </div>
        </div>

        {/* Web Searches & Grounding */}
        <div className="p-4 rounded-2xl bg-[#090203] border border-red-950/80 hover:border-red-800/60 transition-all space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span className="uppercase tracking-wider">Web Search Usage</span>
            <Globe className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {s.totalWebSearches.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-red-950/40 pt-2">
            <span>Today: <strong className="text-cyan-300">+{s.searchesToday}</strong></span>
            <span>Month: <strong className="text-zinc-200">{s.searchesThisMonth}</strong></span>
          </div>
        </div>
      </div>

      {/* Secondary KPI Row: Errors & Anomaly Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* API Error Diagnostic */}
        <div className="p-4 rounded-2xl bg-[#090203] border border-red-950/80 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
                API Error Diagnostics
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  s.errorRatePercent > 5
                    ? 'bg-red-950 text-red-300 border border-red-800'
                    : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80'
                }`}
              >
                {s.errorRatePercent > 5 ? 'Elevated Error Rate' : 'Healthy (<5%)'}
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-white flex items-center gap-3">
              <span>{s.totalApiErrors} Errors</span>
              <span className="text-xs text-zinc-400 font-normal">({s.errorRatePercent}% rate)</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400">
              Today: <strong className="text-red-300">+{s.errorsToday}</strong> | Month: <strong className="text-zinc-200">{s.errorsThisMonth}</strong>
            </div>
          </div>
          <button
            onClick={() => setActiveSubTab('errors')}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-mono text-zinc-300 border border-zinc-700/60 cursor-pointer"
          >
            View Errors
          </button>
        </div>

        {/* Unusually High Usage Alerts Banner */}
        <div className="p-4 rounded-2xl bg-[#090203] border border-red-950/80 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
                Unusually High Usage Anomaly Engine
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  s.unusualHighUsageAlertsCount > 0
                    ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                {s.unusualHighUsageAlertsCount} Flagged
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-white flex items-center gap-2">
              <Flame className={`w-5 h-5 ${s.unusualHighUsageAlertsCount > 0 ? 'text-amber-400' : 'text-zinc-600'}`} />
              <span>{s.unusualHighUsageAlertsCount} Accounts Detected</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400">
              Spike velocity or unusually elevated single-day volume
            </div>
          </div>
          <button
            onClick={() => {
              setActiveSubTab('users');
              setUserFilter('anomalies');
            }}
            className="px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 border border-amber-800/80 text-xs font-mono font-semibold cursor-pointer"
          >
            Inspect Flags
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-2 border-b border-red-950/80 pb-2">
        {[
          { id: 'dashboard', label: 'Volume Over Time', icon: TrendingUp },
          { id: 'users', label: `Requests Per User (${data?.usersUsage.length || 0})`, icon: Users },
          { id: 'models', label: 'Provider & Model Breakdown', icon: Cpu },
          { id: 'images', label: `Image Generations (${s.totalImages})`, icon: ImageIcon },
          { id: 'search', label: `Web Searches (${s.totalWebSearches})`, icon: Globe },
          { id: 'errors', label: `API Errors (${s.totalApiErrors})`, icon: AlertCircle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-medium transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                isActive
                  ? 'bg-red-950/80 text-red-200 border border-red-800/80 shadow-[0_0_12px_rgba(220,38,38,0.2)] font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#0c0204]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-red-400' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-TAB 1: DASHBOARD & REQUEST VOLUME OVER TIME */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Active Anomaly Alerts Box (if any) */}
          {data?.unusualUsageAlerts && data.unusualUsageAlerts.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-300 font-mono text-xs font-bold uppercase tracking-wider">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>Flagged Usage Anomalies ({data.unusualUsageAlerts.length})</span>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">
                  User accounts exceeding velocity or volume baselines
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.unusualUsageAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-xl bg-[#090203] border border-amber-950/80 flex items-start justify-between gap-3 text-xs font-mono"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{alert.userName}</span>
                        <span className="text-[10px] text-zinc-400 font-normal">({alert.userEmail})</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            alert.severity === 'critical'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </div>
                      <div className="text-amber-200/90 text-[11px]">{alert.reason}</div>
                      <div className="text-zinc-500 text-[10px]">
                        Last 60m: <strong>{alert.requestsLastHour} reqs</strong> | 24h: <strong>{alert.requests24h} reqs</strong>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSearchQuery(alert.userEmail);
                        setActiveSubTab('users');
                      }}
                      className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-700/60 shrink-0 cursor-pointer"
                    >
                      Inspect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 14-Day Volume Over Time Chart */}
          <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-mono font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-red-400" />
                  AI Request Volume Over Time (Last 14 Days)
                </h3>
                <p className="text-xs text-zinc-400 font-mono">
                  Daily aggregate of chat completions, image generations, and search grounding
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Chats
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-purple-500" /> Images
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" /> Searches
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.volumeOverTime || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chatColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="imageColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="searchColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26080b" />
                  <XAxis dataKey="label" stroke="#71717a" fontSize={11} tickLine={false} />
                  <YAxis stroke="#71717a" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0c0204',
                      borderColor: '#450a0a',
                      borderRadius: '0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  />
                  <Area type="monotone" dataKey="chats" stroke="#ef4444" fillOpacity={1} fill="url(#chatColor)" name="Chat Reqs" />
                  <Area type="monotone" dataKey="images" stroke="#a855f7" fillOpacity={1} fill="url(#imageColor)" name="Image Reqs" />
                  <Area type="monotone" dataKey="searches" stroke="#06b6d4" fillOpacity={1} fill="url(#searchColor)" name="Web Searches" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Today's 24-Hour Hourly Volume */}
          <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-mono font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Today&apos;s Hourly Volume Distribution (24 Hours)
                </h3>
                <p className="text-xs text-zinc-400 font-mono">
                  Hourly traffic cadence to identify peak load periods
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-400">Total Today: {s.requestsToday}</span>
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.hourlyVolumeToday || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26080b" />
                  <XAxis dataKey="hour" stroke="#71717a" fontSize={10} tickLine={false} />
                  <YAxis stroke="#71717a" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0c0204',
                      borderColor: '#450a0a',
                      borderRadius: '0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="chats" stackId="a" fill="#ef4444" name="Chats" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="images" stackId="a" fill="#a855f7" name="Images" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: REQUESTS PER USER */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          {/* Controls & Search */}
          <div className="p-4 rounded-2xl bg-[#080203] border border-red-950/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search user by name, email, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#040102] border border-red-950 rounded-xl text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-700"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'All Users' },
                { id: 'anomalies', label: `Anomalies (${data?.unusualUsageAlerts.length || 0})` },
                { id: 'today', label: 'Active Today' },
                { id: 'images', label: 'Image Creators' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setUserFilter(filter.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono whitespace-nowrap transition-all cursor-pointer ${
                    userFilter === filter.id
                      ? 'bg-red-950 text-red-200 border border-red-800 font-semibold'
                      : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* User Directory Table */}
          <div className="rounded-2xl bg-[#080203] border border-red-950/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#0c0304] border-b border-red-950 text-zinc-400 select-none">
                  <tr>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-[11px]">User Account</th>
                    <th
                      className="p-3.5 font-bold uppercase tracking-wider text-[11px] cursor-pointer hover:text-white"
                      onClick={() => handleSort('totalRequests')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Total Reqs</span>
                        {sortField === 'totalRequests' && (sortDirection === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th
                      className="p-3.5 font-bold uppercase tracking-wider text-[11px] cursor-pointer hover:text-white"
                      onClick={() => handleSort('requestsToday')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Today</span>
                        {sortField === 'requestsToday' && (sortDirection === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th
                      className="p-3.5 font-bold uppercase tracking-wider text-[11px] cursor-pointer hover:text-white hidden sm:table-cell"
                      onClick={() => handleSort('requestsThisMonth')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Month</span>
                        {sortField === 'requestsThisMonth' && (sortDirection === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-[11px] hidden md:table-cell">Breakdown</th>
                    <th
                      className="p-3.5 font-bold uppercase tracking-wider text-[11px] cursor-pointer hover:text-white hidden lg:table-cell"
                      onClick={() => handleSort('lastActiveAt')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Last Active</span>
                        {sortField === 'lastActiveAt' && (sortDirection === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th className="p-3.5 font-bold uppercase tracking-wider text-[11px]">Status / Anomaly</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-950/40 text-zinc-300">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-zinc-500 font-mono">
                        No users match current filters or search query.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.userId} className="hover:bg-red-950/20 transition-colors">
                        <td className="p-3.5">
                          <div className="space-y-0.5">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{u.userName}</span>
                              <span className="text-[10px] text-zinc-500 font-normal">#{u.userId.slice(-6)}</span>
                            </div>
                            <div className="text-[11px] text-zinc-400">{u.userEmail}</div>
                          </div>
                        </td>

                        <td className="p-3.5 font-bold text-white text-sm">{u.totalRequests.toLocaleString()}</td>

                        <td className="p-3.5">
                          <span className={u.requestsToday > 0 ? 'text-red-300 font-bold' : 'text-zinc-500'}>
                            +{u.requestsToday}
                          </span>
                        </td>

                        <td className="p-3.5 text-zinc-300 hidden sm:table-cell">{u.requestsThisMonth}</td>

                        <td className="p-3.5 hidden md:table-cell text-[11px] text-zinc-400 space-x-2">
                          <span title="Chat completions">💬 {u.chatCount}</span>
                          <span title="Image generations" className="text-purple-300">🎨 {u.imageCount}</span>
                          <span title="Web search groundings" className="text-cyan-300">🌐 {u.searchCount}</span>
                          {u.errorCount > 0 && <span title="API errors" className="text-red-400">⚠️ {u.errorCount}</span>}
                        </td>

                        <td className="p-3.5 text-zinc-500 text-[11px] hidden lg:table-cell">
                          {new Date(u.lastActiveAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        <td className="p-3.5">
                          {u.isUnusuallyHigh ? (
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  u.severity === 'critical'
                                    ? 'bg-red-950 text-red-300 border border-red-800'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}
                              >
                                <Flame className="w-3 h-3" />
                                <span>High Velocity</span>
                              </span>
                              {u.anomalyReason && (
                                <div className="text-[10px] text-amber-300/80 truncate max-w-[200px]" title={u.anomalyReason}>
                                  {u.anomalyReason}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              <span>Normal</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: MODEL USAGE BY PROVIDER & MODEL */}
      {activeSubTab === 'models' && (
        <div className="space-y-6">
          {/* Provider Share */}
          <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-4">
            <h3 className="text-sm font-mono font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-red-400" />
              Provider Distribution (Overall Request Share)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {(data?.providerDistribution || []).map((p) => (
                <div key={p.provider} className="p-4 rounded-xl bg-[#0d0305] border border-red-950 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                    <span className="font-bold uppercase tracking-wider text-white">{p.provider}</span>
                    <span>{p.percentage}%</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-red-200">{p.count} reqs</div>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-600 to-red-400"
                      style={{ width: `${Math.min(100, p.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Model Breakdown */}
          <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-4">
            <h3 className="text-sm font-mono font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              Model Usage Breakdown (Sorted by Volume)
            </h3>

            <div className="space-y-3">
              {(data?.modelsUsage || []).map((m) => (
                <div key={`${m.provider}-${m.model}`} className="p-3.5 rounded-xl bg-[#0d0305] border border-red-950 space-y-2 font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-zinc-900 text-zinc-300 border border-zinc-800">
                        {m.provider}
                      </span>
                      <strong className="text-white text-sm">{m.model}</strong>
                    </div>
                    <div className="text-zinc-400 text-xs flex items-center gap-3">
                      <span>Today: <strong className="text-red-300">+{m.requestsToday}</strong></span>
                      <span>Total: <strong className="text-white">{m.count}</strong> ({m.percentage}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(2, m.percentage))}%`,
                        backgroundColor: m.color || '#ef4444',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: IMAGE GENERATION USAGE */}
      {activeSubTab === 'images' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Aspect Ratio Distribution */}
            <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-3 font-mono">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-400" />
                Aspect Ratio Distribution
              </h3>
              <div className="space-y-2">
                {Object.entries(data?.imageUsage?.byAspectRatio || {}).map(([ratio, count]) => {
                  const pct = s.totalImages > 0 ? ((count / s.totalImages) * 100).toFixed(1) : '0';
                  return (
                    <div key={ratio} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-bold">{ratio}</span>
                        <span className="text-zinc-400">{count} images ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Style Distribution */}
            <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-3 font-mono">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Image Style Distribution
              </h3>
              <div className="space-y-2">
                {Object.entries(data?.imageUsage?.byStyle || {}).map(([style, count]) => {
                  const pct = s.totalImages > 0 ? ((count / s.totalImages) * 100).toFixed(1) : '0';
                  return (
                    <div key={style} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-bold capitalize">{style}</span>
                        <span className="text-zinc-400">{count} images ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recent Image Prompts Audit Log */}
          <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-3 font-mono">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              Recent AI Image Generation Activity
            </h3>

            <div className="divide-y divide-red-950/40 text-xs">
              {(data?.imageUsage?.recentGenerations || []).length === 0 ? (
                <div className="py-6 text-center text-zinc-500">No image generations logged yet.</div>
              ) : (
                data?.imageUsage?.recentGenerations.map((g) => (
                  <div key={g.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5 flex-1 pr-4">
                      <div className="text-white font-medium">&quot;{g.prompt}&quot;</div>
                      <div className="text-[10px] text-zinc-400 flex items-center gap-2">
                        <span>User: {g.userEmail}</span>
                        <span>•</span>
                        <span>Ratio: {g.aspectRatio}</span>
                        <span>•</span>
                        <span className="capitalize">Style: {g.style}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 shrink-0">
                      {new Date(g.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: WEB SEARCH USAGE */}
      {activeSubTab === 'search' && (
        <div className="space-y-6 font-mono">
          <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              Web Search Grounding Provider Share
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(data?.webSearchUsage?.byProvider || {}).map(([provider, count]) => {
                const pct = s.totalWebSearches > 0 ? ((count / s.totalWebSearches) * 100).toFixed(1) : '0';
                return (
                  <div key={provider} className="p-4 rounded-xl bg-[#0d0305] border border-red-950 space-y-1">
                    <div className="text-xs text-zinc-400 flex justify-between">
                      <span className="font-bold text-white">{provider}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="text-xl font-bold text-cyan-300">{count} queries</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Search Queries */}
          <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Recent Web Search Queries
            </h3>

            <div className="divide-y divide-red-950/40 text-xs">
              {(data?.webSearchUsage?.recentSearches || []).length === 0 ? (
                <div className="py-6 text-center text-zinc-500">No web searches logged yet.</div>
              ) : (
                data?.webSearchUsage?.recentSearches.map((sq) => (
                  <div key={sq.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-white font-medium">&quot;{sq.query}&quot;</div>
                      <div className="text-[10px] text-zinc-400 flex items-center gap-2">
                        <span>User: {sq.userEmail}</span>
                        <span>•</span>
                        <span className="text-cyan-400">{sq.provider}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 shrink-0">
                      {new Date(sq.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: API ERRORS */}
      {activeSubTab === 'errors' && (
        <div className="space-y-6 font-mono">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Error Categories */}
            <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                Errors by Category
              </h3>
              <div className="space-y-2">
                {Object.entries(data?.apiErrors?.byType || {}).length === 0 ? (
                  <div className="text-xs text-zinc-500 py-3">Zero error events recorded.</div>
                ) : (
                  Object.entries(data?.apiErrors?.byType || {}).map(([t, count]) => (
                    <div key={t} className="flex items-center justify-between text-xs p-2 rounded bg-[#0d0305]">
                      <span className="text-zinc-300 font-bold uppercase">{t}</span>
                      <span className="text-red-300 font-bold">{count} incidents</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Overall Rate */}
            <div className="p-5 rounded-2xl bg-[#080203] border border-red-950/80 space-y-3 flex flex-col justify-center">
              <div className="text-xs text-zinc-400 uppercase tracking-wider">Overall Error Ratio</div>
              <div className="text-3xl font-bold text-white">
                {s.errorRatePercent}%
              </div>
              <p className="text-xs text-zinc-400">
                Calculated over {s.totalAiRequests + s.totalApiErrors} total lifecycle operations.
              </p>
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="rounded-2xl bg-[#080203] border border-red-950/80 overflow-hidden">
            <div className="p-4 bg-[#0c0304] border-b border-red-950 font-bold text-white text-xs">
              Live API Error Audit Trail (Latest 15)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-red-950 text-zinc-400 bg-[#090203]">
                  <tr>
                    <th className="p-3">Endpoint</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Message</th>
                    <th className="p-3">User</th>
                    <th className="p-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-950/40 text-zinc-300">
                  {(data?.apiErrors?.recentErrors || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-zinc-500">
                        No errors recorded in audit log. All systems operational.
                      </td>
                    </tr>
                  ) : (
                    data?.apiErrors?.recentErrors.map((err) => (
                      <tr key={err.id} className="hover:bg-red-950/20">
                        <td className="p-3 font-bold text-red-300">{err.endpoint}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-red-950 text-red-300 border border-red-800 uppercase font-bold">
                            {err.errorType}
                          </span>
                        </td>
                        <td className="p-3 text-zinc-300 max-w-xs truncate" title={err.errorMessage}>
                          {err.errorMessage}
                        </td>
                        <td className="p-3 text-zinc-400">{err.userEmail || 'System/Guest'}</td>
                        <td className="p-3 text-zinc-500">
                          {new Date(err.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
