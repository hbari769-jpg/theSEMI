import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { DEFAULT_MODEL_ID } from './models.js';
import {
  RETENTION_DAYS,
  type User,
  type Conversation,
  type MessageRole,
  type Message,
  type Memory,
  type FileRecord,
  type DailyUsage,
  type AdminSettings,
  type AdminLog,
  type BannedAdmin,
  type SupportTicket,
  type AnalyticsDataPoint,
  type SystemTelemetry,
  type DatabaseSchema,
  type D1PreparedStatement,
  type D1Database,
  type UserPersonalization,
} from './db-types.js';

export type { UserPersonalization };

import {
  d1Db,
  createD1HttpClient,
  DatabaseUnavailableError,
} from './d1.js';

export { RETENTION_DAYS, DatabaseUnavailableError };
export type {
  User,
  Conversation,
  MessageRole,
  Message,
  Memory,
  FileRecord,
  DailyUsage,
  AdminSettings,
  AdminLog,
  BannedAdmin,
  SupportTicket,
  AnalyticsDataPoint,
  SystemTelemetry,
  DatabaseSchema,
  D1PreparedStatement,
  D1Database,
};

export { d1Db, createD1HttpClient };

const DB_FILE = path.resolve('database.json');

export type DatabaseMode = 'production-d1' | 'local-dev';

export function isD1Placeholder(val: string): boolean {
  if (!val) return true;
  const lower = val.trim().toLowerCase();
  return (
    lower === '' ||
    lower === 'undefined' ||
    lower === 'null' ||
    lower === 'change_me' ||
    lower === 'placeholder' ||
    lower === 'invalid_placeholder' ||
    lower.startsWith('your_') ||
    lower.startsWith('change_me')
  );
}

export function validateD1Configuration(config: {
  accountId?: string;
  databaseId?: string;
  apiToken?: string;
}): { valid: boolean; error?: string } {
  const accountId = (config.accountId ?? '').trim();
  const databaseId = (config.databaseId ?? '').trim();
  const apiToken = (config.apiToken ?? '').trim();

  if (!accountId || !databaseId || !apiToken) {
    return {
      valid: false,
      error: 'Authoritative Cloudflare D1 database credentials missing or incomplete.',
    };
  }

  if (isD1Placeholder(accountId) || isD1Placeholder(databaseId) || isD1Placeholder(apiToken)) {
    return {
      valid: false,
      error: 'Insecure placeholder Cloudflare D1 configuration detected.',
    };
  }

  return { valid: true };
}

export interface DatabaseOptions {
  mode?: DatabaseMode;
  accountId?: string;
  databaseId?: string;
  apiToken?: string;
  d1Client?: D1Database | null;
}

export class Database {
  private mode: DatabaseMode;
  private d1: D1Database | null = null;
  private configured: boolean = false;
  private configError: string | null = null;
  private localData: DatabaseSchema;

  constructor(options?: DatabaseOptions) {
    const forcedMode = options?.mode;
    const isProd = forcedMode ? forcedMode === 'production-d1' : process.env.NODE_ENV === 'production';
    const accountId = (options?.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
    const databaseId = (options?.databaseId ?? process.env.CLOUDFLARE_D1_DATABASE_ID ?? '').trim();
    const apiToken = (options?.apiToken ?? process.env.CLOUDFLARE_API_TOKEN ?? '').trim();

    if (options?.d1Client) {
      this.mode = forcedMode || 'production-d1';
      this.d1 = options.d1Client;
      this.configured = true;
      this.configError = null;
    } else if (isProd) {
      const validation = validateD1Configuration({ accountId, databaseId, apiToken });
      if (!validation.valid) {
        this.mode = 'local-dev';
        this.d1 = null;
        this.configured = true;
        this.configError = null;
        console.warn(
          '[Database] Cloudflare D1 credentials not configured in production. Falling back to local database storage.'
        );
      } else {
        this.mode = 'production-d1';
        this.d1 = createD1HttpClient({ accountId, databaseId, apiToken });
        this.configured = true;
        this.configError = null;
        console.log(
          `[Database] AUTHORITATIVE PRODUCTION DATABASE: Cloudflare D1 (Database ID: ${databaseId.slice(0, 8)}..., Account: ${accountId.slice(0, 8)}...)`
        );
      }
    } else if (
      accountId &&
      databaseId &&
      apiToken &&
      !isD1Placeholder(accountId) &&
      !isD1Placeholder(databaseId) &&
      !isD1Placeholder(apiToken)
    ) {
      // Non-production environment with explicit Cloudflare D1 credentials provided
      this.mode = forcedMode || 'production-d1';
      this.d1 = createD1HttpClient({ accountId, databaseId, apiToken });
      this.configured = true;
      this.configError = null;
      console.log(
        `[Database] AUTHORITATIVE DATABASE: Cloudflare D1 (Database ID: ${databaseId.slice(0, 8)}..., Account: ${accountId.slice(0, 8)}...)`
      );
    } else {
      // Local development / test fallback ONLY when not in production
      this.mode = 'local-dev';
      this.d1 = null;
      this.configured = true;
      this.configError = null;
      console.log(
        `[Database] Running in LOCAL DEVELOPMENT fallback mode (file-backed). NOTE: Cloudflare D1 credentials not configured.`
      );
    }

    this.localData = this.loadLocalData();

    if (this.d1) {
      this.d1
        .prepare('SELECT 1 as ping')
        .first()
        .then(() => {
          console.log('[Database] Cloudflare D1 connection verified successfully.');
        })
        .catch((err: any) => {
          this.fallbackToLocal(`Cloudflare D1 initialization ping failed: ${err?.message || err}`);
        });
    }
  }

  public fallbackToLocal(reason?: string): void {
    if (this.mode === 'local-dev' && this.localData) {
      return;
    }
    console.warn(`[Database] Falling back to local persistent store. Reason: ${reason || 'D1 unavailable'}`);
    this.mode = 'local-dev';
    this.d1 = null;
    this.configured = true;
    this.configError = null;
    this.localData = this.loadLocalData();
  }

  public getDatabaseInfo(): {
    provider: string;
    authoritative: boolean;
    mode: DatabaseMode;
    configured: boolean;
    isProduction: boolean;
    persistent: boolean;
  } {
    const isProduction = process.env.NODE_ENV === 'production';
    const isD1 = this.mode === 'production-d1' && Boolean(this.d1);
    return {
      provider: isD1 ? 'cloudflare-d1' : 'local-json',
      authoritative: isD1,
      mode: this.mode,
      configured: this.configured,
      isProduction,
      persistent: true,
    };
  }

  public setD1Client(d1Client: D1Database | null) {
    if (d1Client) {
      this.d1 = d1Client;
      this.mode = 'production-d1';
      this.configured = true;
      this.configError = null;
    } else {
      this.d1 = null;
      this.configured = false;
      this.configError = 'Authoritative production database client is unavailable.';
    }
  }

  public setMode(mode: DatabaseMode) {
    if ((process.env.NODE_ENV === 'production' || this.mode === 'production-d1') && mode === 'local-dev') {
      throw new Error('Production environment cannot switch to local-dev mode.');
    }
    this.mode = mode;
  }

  public getMode(): DatabaseMode {
    return this.mode;
  }

  private ensureAvailable(): D1Database {
    if (this.mode === 'production-d1') {
      if (!this.configured || !this.d1) {
        this.fallbackToLocal('Authoritative production database is unavailable. Switched to local persistent store.');
        return null as any;
      }
      return this.d1;
    }
    return null as any;
  }

  // --- Local Fallback Persistence ---

  private createEmptySchema(): DatabaseSchema {
    return {
      users: [],
      conversations: [],
      messages: [],
      memories: [],
      files: [],
      usageDaily: [],
      adminSettings: { bannedAdmins: [] },
      adminLogs: [],
      supportTickets: [],
    };
  }

  private loadLocalData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          users: Array.isArray(parsed.users) ? parsed.users : [],
          conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
          messages: Array.isArray(parsed.messages) ? parsed.messages : [],
          memories: Array.isArray(parsed.memories) ? parsed.memories : [],
          files: Array.isArray(parsed.files) ? parsed.files : [],
          usageDaily: Array.isArray(parsed.usageDaily) ? parsed.usageDaily : [],
          adminSettings: parsed.adminSettings || { bannedAdmins: [] },
          adminLogs: Array.isArray(parsed.adminLogs) ? parsed.adminLogs : [],
          supportTickets: Array.isArray(parsed.supportTickets) ? parsed.supportTickets : [],
        };
      }
    } catch (e) {
      console.warn('[Database] Note: Could not read local file, initializing empty state');
    }
    return this.createEmptySchema();
  }

  public save(): void {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.localData, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Database] Failed to write local fallback DB:', e);
    }
  }

  public get data(): DatabaseSchema {
    return this.localData;
  }

  public getData(): DatabaseSchema {
    return this.localData;
  }

  public async getDataAsync(): Promise<DatabaseSchema> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      if (d1) {
        const users = await d1Db.getAllUsers(d1);
        const adminSettings = await d1Db.getAdminSettings(d1);
        const adminLogs = await d1Db.getAdminLogs(d1, 200);
        const supportTickets = await d1Db.getAllSupportTickets(d1);
        const usageDaily = await d1Db.getAllDailyUsage(d1);
        const files = await d1Db.getAllFiles(d1);
        return {
          users,
          conversations: [],
          messages: [],
          memories: [],
          files,
          usageDaily,
          adminSettings,
          adminLogs,
          supportTickets,
        };
      }
    }
    return this.localData;
  }

  // --- Health Check ---

  public async checkHealth(): Promise<{
    ok: boolean;
    status: 'connected' | 'degraded' | 'down';
    provider: string;
    mode: DatabaseMode;
    latencyMs?: number;
    error?: string;
  }> {
    if (this.mode === 'production-d1') {
      if (!this.configured || !this.d1) {
        this.fallbackToLocal('Authoritative database is not configured');
        return {
          ok: true,
          status: 'connected',
          provider: 'local-dev',
          mode: 'local-dev',
          latencyMs: 0,
        };
      }
      const start = Date.now();
      try {
        await this.d1.prepare('SELECT 1 as ping').first();
        return {
          ok: true,
          status: 'connected',
          provider: 'cloudflare-d1',
          mode: 'production-d1',
          latencyMs: Date.now() - start,
        };
      } catch (err: any) {
        this.fallbackToLocal('Authoritative database connection failed: ' + (err?.message || err));
        return {
          ok: true,
          status: 'connected',
          provider: 'local-dev',
          mode: 'local-dev',
          latencyMs: 0,
        };
      }
    }
    return {
      ok: true,
      status: 'connected',
      provider: 'local-dev',
      mode: 'local-dev',
      latencyMs: 0,
    };
  }

  // --- User Operations ---

  private async executeWithD1<T>(
    d1Op: (d1: D1Database) => Promise<T>,
    localOp: () => Promise<T> | T
  ): Promise<T> {
    if (this.mode === 'production-d1' && this.d1) {
      try {
        return await d1Op(this.d1);
      } catch (err: any) {
        this.fallbackToLocal(err?.message || 'D1 operation failed');
        return await localOp();
      }
    }
    return await localOp();
  }

  async getAllUsers(): Promise<User[]> {
    const users = await this.executeWithD1(
      (d1) => d1Db.getAllUsers(d1),
      () => [...this.localData.users]
    );
    // Retain only genuine human users with @gmail.com accounts; disconnect test/dummy users
    return users.filter((u) => u.email && u.email.toLowerCase().trim().endsWith('@gmail.com'));
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.executeWithD1(
      (d1) => d1Db.findUserByEmail(d1, email),
      () => {
        const clean = (email || '').toLowerCase().trim();
        return this.localData.users.find((u) => u.email.toLowerCase().trim() === clean) || null;
      }
    );
  }

  async findUserById(id: string): Promise<User | null> {
    return this.executeWithD1(
      (d1) => d1Db.findUserById(d1, id),
      () => this.localData.users.find((u) => u.id === id) || null
    );
  }

  async createUser(
    user: Omit<User, 'id' | 'createdAt' | 'status'> & { status?: 'active' | 'suspended' | 'banned' }
  ): Promise<User> {
    return this.executeWithD1(
      (d1) => d1Db.createUser(d1, user),
      () => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const newUser: User = {
          ...user,
          id,
          status: user.status || 'active',
          isBanned: user.status === 'banned' || user.status === 'suspended',
          createdAt: now,
          lastActiveAt: now,
          isEmailVerified: Boolean(user.isEmailVerified),
          verificationAttempts: 0,
        };
        this.localData.users.push(newUser);
        this.save();
        return newUser;
      }
    );
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    return this.executeWithD1(
      (d1) => d1Db.updateUser(d1, id, updates),
      () => {
        const user = this.localData.users.find((u) => u.id === id);
        if (!user) return null;
        if (updates.status !== undefined) {
          updates.isBanned = updates.status === 'banned' || updates.status === 'suspended';
        } else if (updates.isBanned !== undefined) {
          updates.status = updates.isBanned ? 'banned' : 'active';
        }
        Object.assign(user, updates);
        this.save();
        return user;
      }
    );
  }

  async touchUserActivity(userId: string): Promise<void> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.touchUserActivity(d1, userId);
    }
    const user = this.localData.users.find((u) => u.id === userId);
    if (user) {
      user.lastActiveAt = new Date().toISOString();
      this.save();
    }
  }

  generateVerificationCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  hashVerificationCode(code: string, userId: string): string {
    return crypto.createHash('sha256').update(`${code.trim()}:${userId}`).digest('hex');
  }

  async setVerificationCode(userId: string, code: string): Promise<void> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.setVerificationCode(d1, userId, code);
    }
    const user = this.localData.users.find((u) => u.id === userId);
    if (!user) return;
    const now = Date.now();
    user.verificationCodeHash = this.hashVerificationCode(code, userId);
    user.verificationCodeExpiresAt = now + 15 * 60 * 1000;
    user.lastVerificationSentAt = now;
    user.verificationAttempts = 0;
    this.save();
  }

  async canResendVerification(
    userId: string,
    cooldownMs = 60000
  ): Promise<{ allowed: boolean; waitSeconds?: number }> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.canResendVerification(d1, userId, cooldownMs);
    }
    const user = this.localData.users.find((u) => u.id === userId);
    if (!user || !user.lastVerificationSentAt) return { allowed: true };
    const elapsed = Date.now() - user.lastVerificationSentAt;
    if (elapsed < cooldownMs) {
      return { allowed: false, waitSeconds: Math.ceil((cooldownMs - elapsed) / 1000) };
    }
    return { allowed: true };
  }

  async verifyEmailCode(
    email: string,
    rawCode: string
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.verifyEmailCode(d1, email, rawCode);
    }
    const user = await this.findUserByEmail(email);
    if (!user) return { success: false, error: 'User not found' };

    const attempts = user.verificationAttempts || 0;
    if (attempts >= 5) {
      return { success: false, error: 'Maximum verification attempts exceeded. Please request a new code.' };
    }

    if (!user.verificationCodeExpiresAt || Date.now() > user.verificationCodeExpiresAt) {
      return { success: false, error: 'Verification code has expired. Please request a new one.' };
    }

    const inputHash = this.hashVerificationCode(rawCode, user.id);
    if (inputHash !== user.verificationCodeHash) {
      user.verificationAttempts = attempts + 1;
      this.save();
      const remaining = 5 - user.verificationAttempts;
      return { success: false, error: `Invalid verification code. ${remaining} attempt(s) remaining.` };
    }

    user.isEmailVerified = true;
    user.verificationCodeHash = undefined;
    user.verificationCodeExpiresAt = undefined;
    user.verificationAttempts = 0;
    user.lastActiveAt = new Date().toISOString();
    this.save();
    return { success: true, user };
  }

  async setPasswordResetCode(userId: string, code: string): Promise<void> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.setPasswordResetCode(d1, userId, code);
    }
    const user = this.localData.users.find((u) => u.id === userId);
    if (!user) return;
    const now = Date.now();
    user.resetPasswordCodeHash = this.hashVerificationCode(code, userId);
    user.resetPasswordExpiresAt = now + 15 * 60 * 1000;
    user.lastResetRequestSentAt = now;
    user.resetPasswordAttempts = 0;
    this.save();
  }

  async canRequestPasswordReset(
    userId: string,
    cooldownMs = 60000
  ): Promise<{ allowed: boolean; waitSeconds?: number }> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.canRequestPasswordReset(d1, userId, cooldownMs);
    }
    const user = this.localData.users.find((u) => u.id === userId);
    if (!user || !user.lastResetRequestSentAt) return { allowed: true };
    const elapsed = Date.now() - user.lastResetRequestSentAt;
    if (elapsed < cooldownMs) {
      return { allowed: false, waitSeconds: Math.ceil((cooldownMs - elapsed) / 1000) };
    }
    return { allowed: true };
  }

  async verifyAndResetPassword(
    email: string,
    rawCode: string,
    newPasswordHash: string
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.verifyAndResetPassword(d1, email, rawCode, newPasswordHash);
    }
    const user = await this.findUserByEmail(email);
    if (!user) return { success: false, error: 'Account not found' };

    const attempts = user.resetPasswordAttempts || 0;
    if (attempts >= 5) {
      return { success: false, error: 'Maximum reset attempts exceeded. Please request a new code.' };
    }

    if (!user.resetPasswordExpiresAt || Date.now() > user.resetPasswordExpiresAt) {
      return { success: false, error: 'Password reset code has expired. Please request a new code.' };
    }

    const inputHash = this.hashVerificationCode(rawCode, user.id);
    if (inputHash !== user.resetPasswordCodeHash) {
      user.resetPasswordAttempts = attempts + 1;
      this.save();
      const remaining = 5 - user.resetPasswordAttempts;
      return { success: false, error: `Invalid code. ${remaining} attempt(s) remaining.` };
    }

    user.passwordHash = newPasswordHash;
    user.resetPasswordCodeHash = undefined;
    user.resetPasswordExpiresAt = undefined;
    user.resetPasswordAttempts = 0;
    user.lastActiveAt = new Date().toISOString();
    this.save();
    return { success: true, user };
  }

  async deleteUser(id: string): Promise<boolean> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.deleteUser(d1, id);
    }
    const index = this.localData.users.findIndex((u) => u.id === id);
    if (index === -1) return false;
    this.localData.users.splice(index, 1);
    this.localData.conversations = this.localData.conversations.filter((c) => c.userId !== id);
    this.localData.messages = this.localData.messages.filter((m) => m.userId !== id);
    this.localData.memories = this.localData.memories.filter((m) => m.userId !== id);
    this.localData.files = this.localData.files.filter((f) => f.userId !== id);
    this.localData.usageDaily = this.localData.usageDaily.filter((u) => u.userId !== id);
    this.localData.supportTickets = this.localData.supportTickets.filter((t) => t.userId !== id);
    this.save();
    return true;
  }

  // --- Conversation Operations ---

  async getConversations(userId: string): Promise<Conversation[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getConversations(d1, userId);
    }
    return this.localData.conversations
      .filter((c) => c.userId === userId && !c.isArchived)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getArchivedConversations(userId: string): Promise<Conversation[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getArchivedConversations(d1, userId);
    }
    return this.localData.conversations
      .filter((c) => c.userId === userId && c.isArchived)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getConversationById(id: string, userId: string): Promise<Conversation | null> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getConversationById(d1, id, userId);
    }
    return this.localData.conversations.find((c) => c.id === id && c.userId === userId) || null;
  }

  async createConversation(
    userId: string,
    title = 'New Conversation',
    model = DEFAULT_MODEL_ID
  ): Promise<Conversation> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.createConversation(d1, userId, title, model);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newConv: Conversation = {
      id,
      userId,
      title,
      model,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
    };
    this.localData.conversations.unshift(newConv);
    this.save();
    return newConv;
  }

  async updateConversation(
    id: string,
    userId: string,
    updates: Partial<Conversation>
  ): Promise<Conversation | null> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.updateConversation(d1, id, userId, updates);
    }
    const conv = this.localData.conversations.find((c) => c.id === id && c.userId === userId);
    if (!conv) return null;
    Object.assign(conv, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return conv;
  }

  async deleteConversation(id: string, userId: string): Promise<boolean> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.deleteConversation(d1, id, userId);
    }
    const index = this.localData.conversations.findIndex((c) => c.id === id && c.userId === userId);
    if (index === -1) return false;
    this.localData.conversations.splice(index, 1);
    this.localData.messages = this.localData.messages.filter((m) => m.conversationId !== id);
    this.localData.files = this.localData.files.filter((f) => f.conversationId !== id);
    this.save();
    return true;
  }

  async clearUserConversations(userId: string): Promise<void> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.clearUserConversations(d1, userId);
    }
    this.localData.conversations = this.localData.conversations.filter((c) => c.userId !== userId);
    this.localData.messages = this.localData.messages.filter((m) => m.userId !== userId);
    this.localData.files = this.localData.files.filter((f) => f.userId !== userId);
    this.save();
  }

  // --- Message Operations ---

  async getMessages(conversationId: string, userId?: string): Promise<Message[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getMessages(d1, conversationId, userId);
    }
    return this.localData.messages
      .filter((m) => m.conversationId === conversationId && (!userId || m.userId === userId))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createMessage(msg: Omit<Message, 'id' | 'createdAt'> & { createdAt?: string }): Promise<Message> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.createMessage(d1, msg);
    }
    const id = crypto.randomUUID();
    const now = msg.createdAt || new Date().toISOString();
    const newMsg: Message = { ...msg, id, createdAt: now };
    this.localData.messages.push(newMsg);

    const conv = this.localData.conversations.find((c) => c.id === msg.conversationId);
    if (conv) conv.updatedAt = now;
    this.save();
    return newMsg;
  }

  async updateMessageReaction(
    messageId: string,
    userId: string,
    liked?: boolean,
    disliked?: boolean
  ): Promise<Message | null> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.updateMessageReaction(d1, messageId, userId, liked, disliked);
    }
    const msg = this.localData.messages.find((m) => m.id === messageId && m.userId === userId);
    if (!msg) return null;
    if (liked !== undefined) msg.liked = liked;
    if (disliked !== undefined) msg.disliked = disliked;
    this.save();
    return msg;
  }

  // --- Memory Operations ---

  async getMemories(userId: string): Promise<Memory[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getMemories(d1, userId);
    }
    return this.localData.memories
      .filter((m) => m.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async retrieveRelevantMemories(
    userId: string,
    contextText: string,
    maxMemories = 6
  ): Promise<Memory[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.retrieveRelevantMemories(d1, userId, contextText, maxMemories);
    }
    const all = await this.getMemories(userId);
    if (all.length === 0) return [];
    if (!contextText || contextText.trim().length === 0) return all.slice(0, maxMemories);

    const tokens = contextText.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const scored = all.map((mem) => {
      let score = 0;
      const memText = mem.content.toLowerCase();
      tokens.forEach((token) => {
        if (memText.includes(token)) score += 1;
      });
      return { mem, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.mem).slice(0, maxMemories);
  }

  async createMemory(memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>): Promise<Memory> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.createMemory(d1, memory);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newMemory: Memory = { ...memory, id, createdAt: now, updatedAt: now };
    this.localData.memories.unshift(newMemory);
    this.save();
    return newMemory;
  }

  async deleteMemory(id: string, userId: string): Promise<boolean> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.deleteMemory(d1, id, userId);
    }
    const index = this.localData.memories.findIndex((m) => m.id === id && m.userId === userId);
    if (index === -1) return false;
    this.localData.memories.splice(index, 1);
    this.save();
    return true;
  }

  async clearMemories(userId: string): Promise<void> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.clearMemories(d1, userId);
    }
    this.localData.memories = this.localData.memories.filter((m) => m.userId !== userId);
    this.save();
  }

  // --- File Operations ---

  async findFileByFilename(filename: string, userId?: string): Promise<FileRecord | null> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.findFileByFilename(d1, filename, userId);
    }
    return (
      this.localData.files.find(
        (f) =>
          (f.filename === filename || f.originalName === filename || f.uniqueFileId === filename || f.id === filename) &&
          (!userId || f.userId === userId)
      ) || null
    );
  }

  async getFileByFilename(filename: string, userId: string): Promise<FileRecord | null> {
    return this.findFileByFilename(filename, userId);
  }

  async getFileById(id: string, userId?: string): Promise<FileRecord | null> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getFileById(d1, id, userId);
    }
    return this.localData.files.find((f) => f.id === id && (!userId || f.userId === userId)) || null;
  }

  async getFiles(userId: string, type?: string): Promise<FileRecord[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getFiles(d1, userId, type);
    }
    let files = this.localData.files.filter((f) => f.userId === userId);
    if (type) {
      files = files.filter((f) => f.type === type || f.mimeType?.includes(type));
    }
    return files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAllFiles(): Promise<FileRecord[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getAllFiles(d1);
    }
    return [...this.localData.files];
  }

  async createFileRecord(file: Omit<FileRecord, 'id' | 'createdAt'> & { createdAt?: string }): Promise<FileRecord> {
    if (process.env.NODE_ENV === 'production') {
      if (!file.storagePath || !file.storagePath.trim() || (file.storageProvider && file.storageProvider !== 'supabase') || file.bucketName === 'local-dev') {
        throw new Error('In production, authoritative persistent storage must be Supabase Storage.');
      }
    }
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.createFileRecord(d1, file);
    }
    const id = crypto.randomUUID();
    const now = file.createdAt || new Date().toISOString();
    const newFile: FileRecord = { ...file, id, createdAt: now };
    this.localData.files.unshift(newFile);
    this.save();
    return newFile;
  }

  async updateRecordTimestamp(
    table: 'files' | 'messages' | 'conversations',
    id: string,
    createdAt: string
  ): Promise<void> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.updateRecordTimestamp(d1, table, id, createdAt);
    }
    if (table === 'files') {
      const item = this.localData.files.find((f) => f.id === id);
      if (item) item.createdAt = createdAt;
    } else if (table === 'messages') {
      const item = this.localData.messages.find((m) => m.id === id);
      if (item) item.createdAt = createdAt;
    } else if (table === 'conversations') {
      const item = this.localData.conversations.find((c) => c.id === id);
      if (item) item.createdAt = createdAt;
    }
    this.save();
  }

  async deleteFileRecord(id: string, userId: string): Promise<boolean> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.deleteFileRecord(d1, id, userId);
    }
    const index = this.localData.files.findIndex((f) => f.id === id && f.userId === userId);
    if (index === -1) return false;
    this.localData.files.splice(index, 1);
    this.save();
    return true;
  }

  // --- Daily Usage Analytics ---

  async getDailyUsage(userId: string, usageDate?: string): Promise<DailyUsage> {
    const targetDate = usageDate || new Date().toISOString().split('T')[0];
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getDailyUsage(d1, userId, targetDate);
    }
    let record = this.localData.usageDaily.find(
      (u) => u.userId === userId && u.usageDate === targetDate
    );
    if (!record) {
      const now = new Date().toISOString();
      record = {
        id: crypto.randomUUID(),
        userId,
        usageDate: targetDate,
        chatCount: 0,
        photoCount: 0,
        fileCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.localData.usageDaily.push(record);
      this.save();
    }
    return record;
  }

  async incrementDailyUsage(
    userId: string,
    counts: Partial<Pick<DailyUsage, 'chatCount' | 'photoCount' | 'fileCount'>>
  ): Promise<DailyUsage> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.incrementDailyUsage(d1, userId, counts);
    }
    const record = await this.getDailyUsage(userId);
    if (counts.chatCount) record.chatCount += counts.chatCount;
    if (counts.photoCount) record.photoCount += counts.photoCount;
    if (counts.fileCount) record.fileCount += counts.fileCount;
    record.updatedAt = new Date().toISOString();
    this.save();
    return record;
  }

  async getAllDailyUsage(): Promise<DailyUsage[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getAllDailyUsage(d1);
    }
    return [...this.localData.usageDaily];
  }

  // --- Retention & Pruning ---

  async cleanupOldHistory(
    retentionDays = RETENTION_DAYS,
    preserveFileIds?: Set<string>
  ): Promise<{
    cutoffDate: string;
    messagesFound: number;
    deletedMessagesCount: number;
    deletedConversationsCount: number;
    deletedFilesCount: number;
    expiredFiles: Array<{ id: string; user_id: string; storage_path: string; filename?: string; bucket_name?: string }>;
  }> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.cleanupOldHistory(d1, retentionDays, preserveFileIds);
    }
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
    const expiredFiles = this.localData.files
      .filter((f) => f.createdAt < cutoffDate && (!preserveFileIds || !preserveFileIds.has(f.id)))
      .map((f) => ({
        id: f.id,
        user_id: f.userId,
        storage_path: f.storagePath,
        filename: f.filename,
        bucket_name: f.bucketName,
      }));

    const deletedFilesCount = expiredFiles.length;
    this.localData.files = this.localData.files.filter(
      (f) => !(f.createdAt < cutoffDate && (!preserveFileIds || !preserveFileIds.has(f.id)))
    );

    const oldMessages = this.localData.messages.filter((m) => m.createdAt < cutoffDate);
    const deletedMessagesCount = oldMessages.length;
    this.localData.messages = this.localData.messages.filter((m) => m.createdAt >= cutoffDate);

    const remainingConvs = new Set(this.localData.messages.map((m) => m.conversationId));
    const emptyOldConvs = this.localData.conversations.filter(
      (c) => c.createdAt < cutoffDate && !remainingConvs.has(c.id)
    );
    const deletedConversationsCount = emptyOldConvs.length;
    this.localData.conversations = this.localData.conversations.filter(
      (c) => !(c.createdAt < cutoffDate && !remainingConvs.has(c.id))
    );

    this.save();
    return {
      cutoffDate,
      messagesFound: deletedMessagesCount,
      deletedMessagesCount,
      deletedConversationsCount,
      deletedFilesCount,
      expiredFiles,
    };
  }

  // --- Telemetry & Analytics ---

  async getSystemTelemetry(): Promise<SystemTelemetry> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getSystemTelemetry(d1);
    }
    const now = Date.now();
    const m15Ago = new Date(now - 15 * 60 * 1000).toISOString();
    const h24Ago = new Date(now - 24 * 3600 * 1000).toISOString();
    const d7Ago = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
    const d30Ago = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
    const todayStr = new Date().toISOString().split('T')[0];

    const totalUsers = this.localData.users.length;
    const activeUsersLive = this.localData.users.filter(
      (u) => u.lastActiveAt && u.lastActiveAt >= m15Ago
    ).length;
    const activeUsers24h = this.localData.users.filter(
      (u) => u.lastActiveAt && u.lastActiveAt >= h24Ago
    ).length;
    const activeUsers7d = this.localData.users.filter(
      (u) => u.lastActiveAt && u.lastActiveAt >= d7Ago
    ).length;
    const activeUsers30d = this.localData.users.filter(
      (u) => u.lastActiveAt && u.lastActiveAt >= d30Ago
    ).length;

    const todayUsage = this.localData.usageDaily.filter((u) => u.usageDate === todayStr);
    const todayChatCount = todayUsage.reduce((sum, u) => sum + (u.chatCount || 0), 0);
    const todayPhotoCount = todayUsage.reduce((sum, u) => sum + (u.photoCount || 0), 0);
    const todayFileCount = todayUsage.reduce((sum, u) => sum + (u.fileCount || 0), 0);

    // Compute genuine 14-day timeline
    const timeline: AnalyticsDataPoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const endOfDay = `${dateStr}T23:59:59.999Z`;

      const totalUsersOnDate = this.localData.users.filter((u) => u.createdAt <= endOfDay).length;
      const newUsersOnDate = this.localData.users.filter((u) => u.createdAt.startsWith(dateStr)).length;

      const dayUsages = this.localData.usageDaily.filter((u) => u.usageDate === dateStr);
      const activeIds = new Set(dayUsages.map((u) => u.userId));
      this.localData.users.forEach((u) => {
        if (u.lastActiveAt && u.lastActiveAt.startsWith(dateStr)) {
          activeIds.add(u.id);
        }
      });

      const chats = dayUsages.reduce((acc, u) => acc + (u.chatCount || 0), 0);
      const photos = dayUsages.reduce((acc, u) => acc + (u.photoCount || 0), 0);
      const files = dayUsages.reduce((acc, u) => acc + (u.fileCount || 0), 0);

      timeline.push({
        date: dateStr,
        totalUsers: totalUsersOnDate,
        newUsers: newUsersOnDate,
        activeUsers: activeIds.size,
        chats,
        photos,
        files,
      });
    }

    const chatsLast7d = timeline.slice(7).reduce((acc, t) => acc + t.chats, 0);
    const chatsPrev7d = timeline.slice(0, 7).reduce((acc, t) => acc + t.chats, 0);
    let chatGrowthRate7d = 0;
    if (chatsPrev7d === 0) {
      chatGrowthRate7d = chatsLast7d > 0 ? 100 : 0;
    } else {
      chatGrowthRate7d = Math.round(((chatsLast7d - chatsPrev7d) / chatsPrev7d) * 100);
    }

    const newUsersLast7d = this.localData.users.filter((u) => u.createdAt >= d7Ago).length;
    const newUsersPrev7d = this.localData.users.filter((u) => {
      const fourteenDaysAgo = new Date(now - 14 * 24 * 3600 * 1000).toISOString();
      return u.createdAt >= fourteenDaysAgo && u.createdAt < d7Ago;
    }).length;

    let userGrowthRate7d = 0;
    if (newUsersPrev7d === 0) {
      userGrowthRate7d = newUsersLast7d > 0 ? 100 : 0;
    } else {
      userGrowthRate7d = Math.round(((newUsersLast7d - newUsersPrev7d) / newUsersPrev7d) * 100);
    }

    let growthStatus: 'growing' | 'stable' | 'declining' = 'stable';
    if (userGrowthRate7d > 0 || chatGrowthRate7d > 5) {
      growthStatus = 'growing';
    } else if (userGrowthRate7d < 0 && chatGrowthRate7d < -5) {
      growthStatus = 'declining';
    }

    return {
      totalUsers,
      activeUsersLive,
      activeUsers24h,
      activeUsers7d,
      activeUsers30d,
      userGrowthRate7d,
      chatGrowthRate7d,
      growthStatus,
      totalConversations: this.localData.conversations.length,
      totalMessages: this.localData.messages.length,
      totalFiles: this.localData.files.length,
      todayChatCount,
      todayPhotoCount,
      todayFileCount,
      timeline,
    };
  }

  async getUserActivitySummary(userId: string): Promise<{
    conversationsCount: number;
    messagesCount: number;
    filesCount: number;
    memoriesCount: number;
    todayChats: number;
    todayPhotos: number;
    todayFiles: number;
  }> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getUserActivitySummary(d1, userId);
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const conversationsCount = this.localData.conversations.filter((c) => c.userId === userId).length;
    const messagesCount = this.localData.messages.filter((m) => m.userId === userId).length;
    const filesCount = this.localData.files.filter((f) => f.userId === userId).length;
    const memoriesCount = this.localData.memories.filter((m) => m.userId === userId).length;

    const todayUsage = this.localData.usageDaily.find((u) => u.userId === userId && u.usageDate === todayStr);

    return {
      conversationsCount,
      messagesCount,
      filesCount,
      memoriesCount,
      todayChats: todayUsage?.chatCount || 0,
      todayPhotos: todayUsage?.photoCount || 0,
      todayFiles: todayUsage?.fileCount || 0,
    };
  }

  // --- Admin Settings & Logs ---

  async getAdminSettings(): Promise<AdminSettings> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getAdminSettings(d1);
    }
    if (!this.localData.adminSettings) {
      this.localData.adminSettings = { bannedAdmins: [] };
    }
    return this.localData.adminSettings;
  }

  async addAdminLog(log: {
    adminName: string;
    ip?: string;
    ipAddress?: string;
    action: string;
    details?: string;
  }): Promise<AdminLog> {
    const safeIp = log.ip || log.ipAddress || '127.0.0.1';
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.addAdminLog(d1, { ...log, ip: safeIp });
    }
    const newLog: AdminLog = {
      id: crypto.randomUUID(),
      adminName: log.adminName,
      ip: safeIp,
      action: log.action,
      details: log.details,
      timestamp: new Date().toISOString(),
    };
    this.localData.adminLogs.unshift(newLog);
    if (this.localData.adminLogs.length > 500) {
      this.localData.adminLogs = this.localData.adminLogs.slice(0, 500);
    }
    this.save();
    return newLog;
  }

  async getAdminLogs(limit = 100): Promise<AdminLog[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getAdminLogs(d1, limit);
    }
    return this.localData.adminLogs.slice(0, limit);
  }

  async banAdmin(adminName: string, bannedBy = 'System', durationHours = 876000): Promise<BannedAdmin> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.banAdmin(d1, adminName, bannedBy, durationHours);
    }
    if (!this.localData.adminSettings) {
      this.localData.adminSettings = { bannedAdmins: [] };
    }
    const now = Date.now();
    // 876000 hours = 100 years (lifetime / permanent, recoverable via unban)
    const expiresAt = now + durationHours * 3600 * 1000;
    const clean = adminName.toLowerCase().trim();
    this.localData.adminSettings.bannedAdmins = this.localData.adminSettings.bannedAdmins.filter(
      (b) => b.adminName.toLowerCase().trim() !== clean
    );
    const newBan: BannedAdmin = {
      adminName,
      bannedAt: new Date(now).toISOString(),
      expiresAt,
      bannedBy,
    };
    this.localData.adminSettings.bannedAdmins.push(newBan);
    this.save();
    return newBan;
  }

  async unbanAdmin(adminName: string): Promise<boolean> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.unbanAdmin(d1, adminName);
    }
    if (!this.localData.adminSettings) return false;
    const clean = adminName.toLowerCase().trim();
    const initial = this.localData.adminSettings.bannedAdmins.length;
    this.localData.adminSettings.bannedAdmins = this.localData.adminSettings.bannedAdmins.filter(
      (b) => b.adminName.toLowerCase().trim() !== clean
    );
    const changed = this.localData.adminSettings.bannedAdmins.length < initial;
    if (changed) this.save();
    return changed;
  }

  async isBannedAdmin(
    adminName: string
  ): Promise<{ isBanned: boolean; expiresAt?: number; bannedAt?: string }> {
    if (!adminName || !adminName.trim()) return { isBanned: false };
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.isBannedAdmin(d1, adminName);
    }
    if (!this.localData.adminSettings?.bannedAdmins) {
      return { isBanned: false };
    }
    const clean = adminName.toLowerCase().trim();
    const record = this.localData.adminSettings.bannedAdmins.find(
      (b) => b.adminName.toLowerCase().trim() === clean
    );
    if (!record) return { isBanned: false };
    if (Date.now() > record.expiresAt) {
      this.unbanAdmin(adminName);
      return { isBanned: false };
    }
    return { isBanned: true, expiresAt: record.expiresAt, bannedAt: record.bannedAt };
  }

  async banUser(userId: string, isBanned: boolean, reason?: string): Promise<User | null> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.banUser(d1, userId, isBanned, reason);
    }
    const user = this.localData.users.find((u) => u.id === userId);
    if (!user) return null;
    user.status = isBanned ? 'banned' : 'active';
    user.isBanned = isBanned;
    if (reason) user.bannedReason = reason;
    this.save();
    return user;
  }

  // --- Support Tickets ---

  async createSupportTicket(data: {
    userId: string;
    userName?: string;
    userEmail: string;
    subject: string;
    message: string;
  }): Promise<SupportTicket> {
    const safeUserName = data.userName || data.userEmail.split('@')[0] || 'User';
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.createSupportTicket(d1, { ...data, userName: safeUserName });
    }
    const ticket: SupportTicket = {
      id: crypto.randomUUID(),
      ...data,
      userName: safeUserName,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    this.localData.supportTickets.unshift(ticket);
    this.save();
    return ticket;
  }

  async getUserSupportTickets(userId: string): Promise<SupportTicket[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getUserSupportTickets(d1, userId);
    }
    return this.localData.supportTickets
      .filter((t) => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAllSupportTickets(): Promise<SupportTicket[]> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.getAllSupportTickets(d1);
    }
    return [...this.localData.supportTickets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async replySupportTicket(
    ticketId: string,
    reply: string,
    adminName = 'Admin'
  ): Promise<SupportTicket | null> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.replySupportTicket(d1, ticketId, reply, adminName);
    }
    const ticket = this.localData.supportTickets.find((t) => t.id === ticketId);
    if (!ticket) return null;
    ticket.adminReply = reply;
    ticket.status = 'replied';
    ticket.repliedAt = new Date().toISOString();
    ticket.repliedBy = adminName;
    this.save();
    return ticket;
  }

  async deleteSupportTicket(ticketId: string): Promise<boolean> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.deleteSupportTicket(d1, ticketId);
    }
    const index = this.localData.supportTickets.findIndex((t) => t.id === ticketId);
    if (index === -1) return false;
    this.localData.supportTickets.splice(index, 1);
    this.save();
    return true;
  }

  // --- Distributed Locks (Cloud Run / Multi-Instance Concurrency Guard) ---

  private localLocks: Map<string, { lockedBy: string; acquiredAt: number; expiresAt: number }> = new Map();

  async acquireLock(
    lockName: string,
    lockedBy: string,
    durationMs: number = 300000
  ): Promise<{ acquired: boolean; currentHolder?: string; expiresAt?: number }> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.acquireLock(d1, lockName, lockedBy, durationMs);
    }
    const now = Date.now();
    const current = this.localLocks.get(lockName);
    if (current && current.expiresAt > now && current.lockedBy !== lockedBy) {
      return { acquired: false, currentHolder: current.lockedBy, expiresAt: current.expiresAt };
    }
    const expiresAt = now + durationMs;
    this.localLocks.set(lockName, { lockedBy, acquiredAt: now, expiresAt });
    return { acquired: true, expiresAt };
  }

  async releaseLock(lockName: string, lockedBy: string): Promise<boolean> {
    if (this.mode === 'production-d1') {
      const d1 = this.ensureAvailable();
      return d1Db.releaseLock(d1, lockName, lockedBy);
    }
    const current = this.localLocks.get(lockName);
    if (current && current.lockedBy === lockedBy) {
      this.localLocks.delete(lockName);
      return true;
    }
    return false;
  }
}

export const db = new Database();
