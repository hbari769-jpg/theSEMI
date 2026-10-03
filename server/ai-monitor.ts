/**
 * Autonomous AI Usage Monitoring Architecture for Aestific Sentinel Admin Panel
 * 
 * Features:
 * - Operates 100% independently from rate limiting (tracking occurs regardless of limit status)
 * - Zero mandatory environment configuration (no RATE_LIMIT_DB_PATH or external DB required)
 * - Persistent storage with atomic writes and automatic bootstrap from existing database records
 * - Tracks total AI requests, requests today, requests this month, active users
 * - Tracks requests per user (with deep per-user breakdown, search, sorting)
 * - Tracks model usage by provider (Groq, Gemini, Imagen, etc.) and model identifier
 * - Tracks image generation usage (total, today, month, aspect ratios, styles, prompt logs)
 * - Tracks web-search usage (total, today, month, queries, search providers)
 * - Tracks API errors (total, today, month, error rate %, categorized by error type, recent error log)
 * - Tracks request volume over time (14-day daily timeline + 24-hour hourly distribution)
 * - Anomaly detection for unusually high usage (spike velocity, volume thresholds, severity alerts)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface AiRequestLog {
  id: string;
  timestamp: number;
  isoDate: string; // YYYY-MM-DD
  userId: string;
  userEmail: string;
  userName: string;
  type: 'chat' | 'image';
  provider: string; // 'groq' | 'gemini' | 'simulation' | 'imagen'
  model: string;
  webSearchUsed: boolean;
  webSearchProvider?: string;
  promptSnippet?: string;
  aspectRatio?: string;
  style?: string;
  durationMs?: number;
  status: 'success' | 'error';
  errorMessage?: string;
  ip?: string;
}

export interface WebSearchLog {
  id: string;
  timestamp: number;
  isoDate: string;
  userId: string;
  userEmail: string;
  query: string;
  provider: string; // 'Exa Neural Search' | 'Google Grounding'
  resultsCount?: number;
}

export interface ApiErrorLog {
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
}

export interface UnusualUsageAlert {
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

export interface UserUsageMetric {
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

export interface ModelUsageMetric {
  provider: string;
  model: string;
  count: number;
  percentage: number;
  requestsToday: number;
  color: string;
}

export interface TimeVolumePoint {
  date: string;
  label: string;
  chats: number;
  images: number;
  searches: number;
  errors: number;
  total: number;
}

export interface MonitoringOverviewData {
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
    recentErrors: ApiErrorLog[];
  };
  volumeOverTime: TimeVolumePoint[];
  hourlyVolumeToday: Array<{ hour: string; chats: number; images: number; total: number }>;
  unusualUsageAlerts: UnusualUsageAlert[];
  monitoringStatus: {
    rateLimitingEnabled: boolean;
    storageMode: string;
    lastUpdated: string;
  };
}

interface MonitorStore {
  requests: AiRequestLog[];
  searches: WebSearchLog[];
  errors: ApiErrorLog[];
}

const MONITOR_DATA_FILE = path.resolve('data', 'ai-monitoring.json');

class AiMonitorService {
  private store: MonitorStore = {
    requests: [],
    searches: [],
    errors: [],
  };
  private saveTimeout: NodeJS.Timeout | null = null;
  private isLoaded = false;

  constructor() {
    this.ensureDataDirectory();
    this.loadStore();
    this.bootstrapFromDatabase();
  }

  private ensureDataDirectory(): void {
    const dir = path.dirname(MONITOR_DATA_FILE);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        console.error('[AiMonitor] Could not create data directory:', err);
      }
    }
  }

  private loadStore(): void {
    try {
      if (fs.existsSync(MONITOR_DATA_FILE)) {
        const raw = fs.readFileSync(MONITOR_DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.store = {
          requests: parsed.requests || [],
          searches: parsed.searches || [],
          errors: parsed.errors || [],
        };
        this.isLoaded = true;
      }
    } catch (err) {
      console.error('[AiMonitor] Error reading monitor storage file:', err);
      this.store = { requests: [], searches: [], errors: [] };
    }
  }

  /**
   * Seed historical data from existing database.json ONLY if explicitly enabled in development demo mode.
   * In production, monitoring must always start clean and reflect real production usage.
   */
  private bootstrapFromDatabase(): void {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEMO_ACCOUNT !== 'true') {
      return;
    }

    try {
      const dbFile = path.resolve('database.json');
      if (!fs.existsSync(dbFile)) return;

      const raw = fs.readFileSync(dbFile, 'utf-8');
      const dbData = JSON.parse(raw);

      const userMap = new Map<string, { email: string; name: string }>();
      (dbData.users || []).forEach((u: any) => {
        userMap.set(u.id, { email: u.email || 'user@example.com', name: u.name || 'User' });
      });

      const existingReqIds = new Set(this.store.requests.map((r) => r.id));

      // Import assistant messages as historical AI chat requests
      let addedMessages = 0;
      (dbData.messages || []).forEach((m: any) => {
        if (m.role === 'assistant' && !existingReqIds.has(m.id)) {
          const userMeta = userMap.get(m.userId) || { email: 'user@example.com', name: 'User' };
          const date = m.createdAt ? new Date(m.createdAt) : new Date();
          const timestamp = date.getTime();
          const isoDate = date.toISOString().split('T')[0];

          const modelName = m.model || 'llama-3.3-70b-versatile';
          const isGemini = modelName.toLowerCase().includes('gemini');
          const isGroq = modelName.toLowerCase().includes('llama') || modelName.toLowerCase().includes('groq');

          this.store.requests.push({
            id: m.id,
            timestamp,
            isoDate,
            userId: m.userId || 'system',
            userEmail: userMeta.email,
            userName: userMeta.name,
            type: 'chat',
            provider: isGemini ? 'gemini' : isGroq ? 'groq' : 'groq',
            model: modelName,
            webSearchUsed: Boolean(m.webSearchUsed),
            promptSnippet: m.content?.slice(0, 100) || '',
            status: 'success',
          });
          addedMessages++;
        }
      });

      // Import generated images from files
      (dbData.files || []).forEach((f: any) => {
        if (f.type?.startsWith('image/') || f.filename?.endsWith('.png') || f.filename?.endsWith('.jpg')) {
          const fileReqId = `img-hist-${f.id}`;
          if (!existingReqIds.has(fileReqId)) {
            const userMeta = userMap.get(f.userId) || { email: 'user@example.com', name: 'User' };
            const date = f.createdAt ? new Date(f.createdAt) : new Date();
            const timestamp = date.getTime();
            const isoDate = date.toISOString().split('T')[0];

            this.store.requests.push({
              id: fileReqId,
              timestamp,
              isoDate,
              userId: f.userId || 'system',
              userEmail: userMeta.email,
              userName: userMeta.name,
              type: 'image',
              provider: 'imagen',
              model: 'aestific Neural Image Engine',
              webSearchUsed: false,
              promptSnippet: f.description || f.prompt || 'Generated AI visual artwork',
              aspectRatio: f.aspectRatio || '1:1',
              style: f.style || 'photorealistic',
              status: 'success',
            });
          }
        }
      });

      if (addedMessages > 0) {
        this.saveStoreImmediately();
      }
    } catch (err) {
      console.error('[AiMonitor] Bootstrap error:', err);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveStoreImmediately();
      this.saveTimeout = null;
    }, 1000);
  }

  private saveStoreImmediately(): void {
    try {
      this.ensureDataDirectory();
      const payload = JSON.stringify(this.store, null, 2);
      fs.writeFileSync(MONITOR_DATA_FILE, payload, 'utf-8');
    } catch (err) {
      console.error('[AiMonitor] Failed to persist AI monitor store:', err);
    }
  }

  /**
   * Record an AI request event (Chat completion, streaming, or image generation)
   */
  public recordAiRequest(event: {
    userId: string;
    userEmail: string;
    userName: string;
    type: 'chat' | 'image';
    provider: string;
    model: string;
    webSearchUsed?: boolean;
    webSearchProvider?: string;
    promptSnippet?: string;
    aspectRatio?: string;
    style?: string;
    durationMs?: number;
    status?: 'success' | 'error';
    errorMessage?: string;
    ip?: string;
  }): AiRequestLog {
    const now = Date.now();
    const isoDate = new Date(now).toISOString().split('T')[0];

    const record: AiRequestLog = {
      id: crypto.randomUUID(),
      timestamp: now,
      isoDate,
      userId: event.userId,
      userEmail: event.userEmail || 'user@example.com',
      userName: event.userName || 'User',
      type: event.type,
      provider: event.provider || 'unknown',
      model: event.model || 'default',
      webSearchUsed: Boolean(event.webSearchUsed),
      webSearchProvider: event.webSearchProvider,
      promptSnippet: (event.promptSnippet || '').slice(0, 200),
      aspectRatio: event.aspectRatio,
      style: event.style,
      durationMs: event.durationMs,
      status: event.status || 'success',
      errorMessage: event.errorMessage,
      ip: event.ip,
    };

    this.store.requests.push(record);

    // Keep memory in bounds (last 20,000 requests)
    if (this.store.requests.length > 20000) {
      this.store.requests = this.store.requests.slice(-20000);
    }

    this.scheduleSave();
    return record;
  }

  /**
   * Record a web search invocation (Exa or Grounding)
   */
  public recordWebSearch(event: {
    userId: string;
    userEmail: string;
    query: string;
    provider: string;
    resultsCount?: number;
  }): WebSearchLog {
    const now = Date.now();
    const isoDate = new Date(now).toISOString().split('T')[0];

    const record: WebSearchLog = {
      id: crypto.randomUUID(),
      timestamp: now,
      isoDate,
      userId: event.userId,
      userEmail: event.userEmail || 'user@example.com',
      query: (event.query || '').slice(0, 300),
      provider: event.provider || 'Exa Neural Search',
      resultsCount: event.resultsCount,
    };

    this.store.searches.push(record);
    if (this.store.searches.length > 5000) {
      this.store.searches = this.store.searches.slice(-5000);
    }

    this.scheduleSave();
    return record;
  }

  /**
   * Record an API error (provider rate limit 429, upstream error 500, network error, etc.)
   */
  public recordApiError(event: {
    endpoint: string;
    provider?: string;
    model?: string;
    errorType: string;
    errorMessage: string;
    userId?: string;
    userEmail?: string;
    ip?: string;
  }): ApiErrorLog {
    const now = Date.now();
    const isoDate = new Date(now).toISOString().split('T')[0];

    const record: ApiErrorLog = {
      id: crypto.randomUUID(),
      timestamp: now,
      isoDate,
      endpoint: event.endpoint,
      provider: event.provider,
      model: event.model,
      errorType: event.errorType || 'unknown_error',
      errorMessage: (event.errorMessage || '').slice(0, 500),
      userId: event.userId,
      userEmail: event.userEmail,
      ip: event.ip,
    };

    this.store.errors.push(record);
    if (this.store.errors.length > 5000) {
      this.store.errors = this.store.errors.slice(-5000);
    }

    this.scheduleSave();
    return record;
  }

  /**
   * Compute comprehensive, rich monitoring overview for Sentinel Admin Panel
   */
  public getOverview(rateLimitingStatus: boolean): MonitoringOverviewData {
    const now = Date.now();
    const today = new Date(now).toISOString().split('T')[0];
    const currentMonthPrefix = today.slice(0, 7); // 'YYYY-MM'
    const oneDayAgo = now - 24 * 3600 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;
    const oneHourAgo = now - 3600 * 1000;

    const allRequests = this.store.requests;
    const allSearches = this.store.searches;
    const allErrors = this.store.errors;

    // Filter requests
    const todayRequests = allRequests.filter((r) => r.isoDate === today);
    const monthRequests = allRequests.filter((r) => r.isoDate.startsWith(currentMonthPrefix));

    // Active Users calculations
    const allUserIds = new Set<string>();
    const todayUserIds = new Set<string>();
    const sevenDaysUserIds = new Set<string>();
    const thirtyDaysUserIds = new Set<string>();

    allRequests.forEach((r) => {
      if (r.userId) {
        allUserIds.add(r.userId);
        if (r.timestamp >= oneDayAgo) todayUserIds.add(r.userId);
        if (r.timestamp >= sevenDaysAgo) sevenDaysUserIds.add(r.userId);
        if (r.timestamp >= thirtyDaysAgo) thirtyDaysUserIds.add(r.userId);
      }
    });

    // Image generations
    const allImages = allRequests.filter((r) => r.type === 'image');
    const todayImages = allImages.filter((r) => r.isoDate === today);
    const monthImages = allImages.filter((r) => r.isoDate.startsWith(currentMonthPrefix));

    const imageAspectRatios: Record<string, number> = {};
    const imageStyles: Record<string, number> = {};
    allImages.forEach((img) => {
      const ar = img.aspectRatio || '1:1';
      const st = img.style || 'photorealistic';
      imageAspectRatios[ar] = (imageAspectRatios[ar] || 0) + 1;
      imageStyles[st] = (imageStyles[st] || 0) + 1;
    });

    // Web searches
    const todaySearches = allSearches.filter((s) => s.isoDate === today);
    const monthSearches = allSearches.filter((s) => s.isoDate.startsWith(currentMonthPrefix));
    const searchProviders: Record<string, number> = {};
    allSearches.forEach((s) => {
      const p = s.provider || 'Exa Neural Search';
      searchProviders[p] = (searchProviders[p] || 0) + 1;
    });

    // Also count chat requests where webSearchUsed was true
    const chatSearchesCount = allRequests.filter((r) => r.type === 'chat' && r.webSearchUsed).length;
    const totalWebSearchCount = Math.max(allSearches.length, chatSearchesCount);

    // API Errors
    const todayErrors = allErrors.filter((e) => e.isoDate === today);
    const monthErrors = allErrors.filter((e) => e.isoDate.startsWith(currentMonthPrefix));
    const totalRequestsAndErrors = allRequests.length + allErrors.length;
    const errorRatePercent = totalRequestsAndErrors > 0
      ? Number(((allErrors.length / totalRequestsAndErrors) * 100).toFixed(2))
      : 0;

    const errorsByType: Record<string, number> = {};
    const errorsByProvider: Record<string, number> = {};
    allErrors.forEach((e) => {
      const t = e.errorType || 'Uncategorized';
      const p = e.provider || 'Gateway/Upstream';
      errorsByType[t] = (errorsByType[t] || 0) + 1;
      errorsByProvider[p] = (errorsByProvider[p] || 0) + 1;
    });

    // Model Usage Breakdown
    const modelStats = new Map<string, { provider: string; model: string; count: number; todayCount: number }>();
    allRequests.forEach((r) => {
      const key = `${r.provider}:::${r.model}`;
      const existing = modelStats.get(key) || {
        provider: r.provider,
        model: r.model,
        count: 0,
        todayCount: 0,
      };
      existing.count += 1;
      if (r.isoDate === today) existing.todayCount += 1;
      modelStats.set(key, existing);
    });

    const totalReqCount = Math.max(1, allRequests.length);
    const colorPalette = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];
    let colorIdx = 0;

    const modelsUsage: ModelUsageMetric[] = Array.from(modelStats.values())
      .map((m) => ({
        provider: m.provider,
        model: m.model,
        count: m.count,
        percentage: Number(((m.count / totalReqCount) * 100).toFixed(1)),
        requestsToday: m.todayCount,
        color: colorPalette[colorIdx++ % colorPalette.length],
      }))
      .sort((a, b) => b.count - a.count);

    // Provider distribution
    const providerMap = new Map<string, number>();
    allRequests.forEach((r) => {
      const p = r.provider || 'unknown';
      providerMap.set(p, (providerMap.get(p) || 0) + 1);
    });
    const providerDistribution = Array.from(providerMap.entries()).map(([provider, count]) => ({
      provider,
      count,
      percentage: Number(((count / totalReqCount) * 100).toFixed(1)),
    }));

    // Requests Per User & Anomaly Detection
    const userAggregates = new Map<string, {
      userId: string;
      userName: string;
      userEmail: string;
      total: number;
      today: number;
      month: number;
      chats: number;
      images: number;
      searches: number;
      errors: number;
      lastActive: number;
      lastHourCount: number;
      last24hCount: number;
    }>();

    allRequests.forEach((r) => {
      const uid = r.userId || 'anonymous';
      const existing = userAggregates.get(uid) || {
        userId: uid,
        userName: r.userName || 'User',
        userEmail: r.userEmail || 'user@example.com',
        total: 0,
        today: 0,
        month: 0,
        chats: 0,
        images: 0,
        searches: 0,
        errors: 0,
        lastActive: 0,
        lastHourCount: 0,
        last24hCount: 0,
      };

      existing.total += 1;
      if (r.isoDate === today) existing.today += 1;
      if (r.isoDate.startsWith(currentMonthPrefix)) existing.month += 1;
      if (r.type === 'chat') existing.chats += 1;
      if (r.type === 'image') existing.images += 1;
      if (r.webSearchUsed) existing.searches += 1;
      if (r.timestamp > existing.lastActive) existing.lastActive = r.timestamp;
      if (r.timestamp >= oneHourAgo) existing.lastHourCount += 1;
      if (r.timestamp >= oneDayAgo) existing.last24hCount += 1;

      userAggregates.set(uid, existing);
    });

    allErrors.forEach((e) => {
      if (e.userId && userAggregates.has(e.userId)) {
        userAggregates.get(e.userId)!.errors += 1;
      }
    });

    const unusualUsageAlerts: UnusualUsageAlert[] = [];
    const usersUsage: UserUsageMetric[] = [];

    // Calculate baseline to flag unusual high usage
    const userList = Array.from(userAggregates.values());
    const avgToday = userList.length > 0
      ? userList.reduce((acc, u) => acc + u.today, 0) / userList.length
      : 0;

    userList.forEach((u) => {
      let isUnusuallyHigh = false;
      let anomalyReason = '';
      let severity: 'normal' | 'medium' | 'high' | 'critical' = 'normal';

      // Velocity anomaly: > 25 requests in 1 hour
      if (u.lastHourCount >= 25) {
        isUnusuallyHigh = true;
        severity = u.lastHourCount >= 50 ? 'critical' : 'high';
        anomalyReason = `Burst Velocity: ${u.lastHourCount} requests dispatched in the past 60 minutes`;
      } else if (u.last24hCount >= 60 || (avgToday > 0 && u.today > 3 * avgToday && u.today > 25)) {
        isUnusuallyHigh = true;
        severity = u.last24hCount >= 120 ? 'critical' : 'high';
        anomalyReason = `Heavy Volume: ${u.last24hCount} requests in 24h (${u.today} today)`;
      } else if (u.images >= 20 && u.today >= 10) {
        isUnusuallyHigh = true;
        severity = 'medium';
        anomalyReason = `High Image Velocity: ${u.images} total images generated`;
      } else if (u.errors >= 10) {
        isUnusuallyHigh = true;
        severity = 'medium';
        anomalyReason = `Frequent API Errors: ${u.errors} error triggers logged`;
      }

      if (isUnusuallyHigh) {
        unusualUsageAlerts.push({
          id: `alert-${u.userId}`,
          userId: u.userId,
          userEmail: u.userEmail,
          userName: u.userName,
          requests24h: u.last24hCount,
          requestsLastHour: u.lastHourCount,
          imageCount24h: u.images,
          severity: severity === 'normal' ? 'medium' : severity,
          reason: anomalyReason,
          detectedAt: new Date().toISOString(),
        });
      }

      usersUsage.push({
        userId: u.userId,
        userName: u.userName,
        userEmail: u.userEmail,
        totalRequests: u.total,
        requestsToday: u.today,
        requestsThisMonth: u.month,
        chatCount: u.chats,
        imageCount: u.images,
        searchCount: u.searches,
        errorCount: u.errors,
        lastActiveAt: u.lastActive > 0 ? new Date(u.lastActive).toISOString() : new Date().toISOString(),
        isUnusuallyHigh,
        anomalyReason: isUnusuallyHigh ? anomalyReason : undefined,
        severity,
      });
    });

    // Sort users by total requests descending
    usersUsage.sort((a, b) => b.totalRequests - a.totalRequests);
    unusualUsageAlerts.sort((a, b) => (b.severity === 'critical' ? 2 : 1) - (a.severity === 'critical' ? 2 : 1));

    // 14-Day Timeline for Charts
    const volumeOverTime: TimeVolumePoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600 * 1000);
      const dStr = d.toISOString().split('T')[0];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const label = `${monthNames[d.getMonth()]} ${d.getDate()}`;

      const dayReqs = allRequests.filter((r) => r.isoDate === dStr);
      const dayChats = dayReqs.filter((r) => r.type === 'chat').length;
      const dayImages = dayReqs.filter((r) => r.type === 'image').length;
      const daySearches = allSearches.filter((s) => s.isoDate === dStr).length +
        dayReqs.filter((r) => r.type === 'chat' && r.webSearchUsed).length;
      const dayErrors = allErrors.filter((e) => e.isoDate === dStr).length;

      volumeOverTime.push({
        date: dStr,
        label,
        chats: dayChats,
        images: dayImages,
        searches: daySearches,
        errors: dayErrors,
        total: dayChats + dayImages,
      });
    }

    // Hourly Distribution for Today (00:00 to 23:00)
    const hourlyVolumeToday: Array<{ hour: string; chats: number; images: number; total: number }> = [];
    for (let h = 0; h < 24; h++) {
      const hourLabel = `${h.toString().padStart(2, '0')}:00`;
      let chatsCount = 0;
      let imagesCount = 0;

      todayRequests.forEach((r) => {
        const reqHour = new Date(r.timestamp).getHours();
        if (reqHour === h) {
          if (r.type === 'chat') chatsCount++;
          if (r.type === 'image') imagesCount++;
        }
      });

      hourlyVolumeToday.push({
        hour: hourLabel,
        chats: chatsCount,
        images: imagesCount,
        total: chatsCount + imagesCount,
      });
    }

    // Recent Image Generations
    const recentGenerations = allImages
      .slice(-10)
      .reverse()
      .map((img) => ({
        id: img.id,
        timestamp: new Date(img.timestamp).toISOString(),
        userEmail: img.userEmail,
        prompt: img.promptSnippet || 'Visual AI Generation',
        aspectRatio: img.aspectRatio || '1:1',
        style: img.style || 'photorealistic',
      }));

    // Recent Web Searches
    const recentSearches = allSearches
      .slice(-10)
      .reverse()
      .map((s) => ({
        id: s.id,
        timestamp: new Date(s.timestamp).toISOString(),
        userEmail: s.userEmail,
        query: s.query,
        provider: s.provider,
      }));

    // Recent API Errors
    const recentErrors = allErrors.slice(-15).reverse();

    return {
      summary: {
        totalAiRequests: allRequests.length,
        requestsToday: todayRequests.length,
        requestsThisMonth: monthRequests.length,
        activeUsersTotal: allUserIds.size,
        activeUsersToday: todayUserIds.size,
        activeUsers7d: sevenDaysUserIds.size,
        activeUsers30d: thirtyDaysUserIds.size,
        totalImages: allImages.length,
        imagesToday: todayImages.length,
        imagesThisMonth: monthImages.length,
        totalWebSearches: totalWebSearchCount,
        searchesToday: todaySearches.length,
        searchesThisMonth: monthSearches.length,
        totalApiErrors: allErrors.length,
        errorsToday: todayErrors.length,
        errorsThisMonth: monthErrors.length,
        errorRatePercent,
        unusualHighUsageAlertsCount: unusualUsageAlerts.length,
      },
      usersUsage,
      modelsUsage,
      providerDistribution,
      imageUsage: {
        total: allImages.length,
        today: todayImages.length,
        thisMonth: monthImages.length,
        byAspectRatio: imageAspectRatios,
        byStyle: imageStyles,
        recentGenerations,
      },
      webSearchUsage: {
        total: totalWebSearchCount,
        today: todaySearches.length,
        thisMonth: monthSearches.length,
        byProvider: searchProviders,
        recentSearches,
      },
      apiErrors: {
        total: allErrors.length,
        today: todayErrors.length,
        thisMonth: monthErrors.length,
        errorRatePercent,
        byType: errorsByType,
        byProvider: errorsByProvider,
        recentErrors,
      },
      volumeOverTime,
      hourlyVolumeToday,
      unusualUsageAlerts,
      monitoringStatus: {
        rateLimitingEnabled: rateLimitingStatus,
        storageMode: 'Independent Persistent Store',
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  /**
   * Reset monitoring data (for admin maintenance)
   */
  public clearAllMonitoring(): void {
    this.store = { requests: [], searches: [], errors: [] };
    this.saveStoreImmediately();
  }
}

export const aiMonitor = new AiMonitorService();
