/**
 * Cloudflare D1 Database Repository for Aestific (Alternative Edge Database Target)
 * 
 * 100% Pure Worker-Compatible:
 * - NO Node `fs`
 * - NO Node `path`
 * - NO Node `crypto` imports (uses standard Web Crypto API: crypto.subtle / crypto.randomUUID)
 * - NO local `database.json` read/write operations
 * 
 * Used as an alternative edge database target by Cloudflare Worker (`server/worker.ts`).
 * NOTE: The Authoritative Production database is managed via `server/db.ts` on Node.js / Cloud Run.
 */

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
} from './db-types.js';

export { RETENTION_DAYS };
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

export class DatabaseUnavailableError extends Error {
  public statusCode = 503;
  public code = 'DATABASE_UNAVAILABLE';
  constructor(message = 'Service temporarily unavailable. Please try again shortly.') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

/**
 * Universal safe UUID generator for Cloudflare Worker & Web runtimes
 */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Universal Web Crypto SHA-256 hexadecimal digest helper
 */
async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const d1Db = {
  /**
   * Initializes D1 schema non-destructively
   */
  async initSchema(d1: D1Database): Promise<void> {
    try {
      await d1.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          avatar_url TEXT,
          system_prompt TEXT,
          preferred_model TEXT,
          memory_enabled INTEGER DEFAULT 1,
          language_preference TEXT,
          personalization TEXT,
          is_email_verified INTEGER DEFAULT 0,
          verification_code_hash TEXT,
          verification_code_expires_at INTEGER,
          verification_attempts INTEGER DEFAULT 0,
          last_verification_sent_at INTEGER,
          reset_password_code_hash TEXT,
          reset_password_expires_at INTEGER,
          reset_password_attempts INTEGER DEFAULT 0,
          last_password_reset_sent_at INTEGER,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'banned')),
          created_at TEXT NOT NULL,
          last_active_at TEXT
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT 'New Conversation',
          model TEXT DEFAULT 'openai/gpt-oss-120b',
          last_message_preview TEXT,
          is_pinned INTEGER DEFAULT 0,
          is_archived INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          model TEXT,
          file_ids TEXT,
          liked INTEGER DEFAULT 0,
          disliked INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          conversation_id TEXT,
          message_id TEXT,
          storage_provider TEXT DEFAULT 'supabase',
          bucket_name TEXT DEFAULT 'aestific-files',
          storage_path TEXT NOT NULL,
          unique_file_id TEXT,
          filename TEXT,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          url TEXT,
          extracted_text TEXT,
          chunks TEXT,
          is_scanned INTEGER DEFAULT 0,
          page_count INTEGER DEFAULT 0,
          duration REAL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS usage_daily (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          usage_date TEXT NOT NULL,
          chat_count INTEGER DEFAULT 0,
          photo_count INTEGER DEFAULT 0,
          file_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT,
          category TEXT DEFAULT 'general',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS support_tickets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          user_name TEXT NOT NULL,
          user_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'replied', 'closed')),
          admin_reply TEXT,
          replied_at TEXT,
          replied_by TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS admin_logs (
          id TEXT PRIMARY KEY,
          admin_name TEXT NOT NULL,
          ip TEXT NOT NULL,
          action TEXT NOT NULL,
          details TEXT,
          timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS banned_admins (
          admin_name TEXT PRIMARY KEY,
          banned_at TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          banned_by TEXT
        );

        -- System Locks (Concurrency protection for background retention jobs)
        CREATE TABLE IF NOT EXISTS system_locks (
          lock_name TEXT PRIMARY KEY,
          locked_by TEXT NOT NULL,
          acquired_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );

        -- Performance & 30-Day Retention Indexes
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
        CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

        CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned ON conversations(user_id, is_pinned);
        CREATE INDEX IF NOT EXISTS idx_conversations_user_archived ON conversations(user_id, is_archived, is_pinned, updated_at);
        CREATE INDEX IF NOT EXISTS idx_conversations_id_user ON conversations(id, user_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

        CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

        CREATE INDEX IF NOT EXISTS idx_files_user_created ON files(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_files_conversation_id ON files(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_files_storage_path ON files(storage_path);
        CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename);
        CREATE INDEX IF NOT EXISTS idx_files_unique_file_id ON files(unique_file_id);
        CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);

        CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, usage_date);
        CREATE INDEX IF NOT EXISTS idx_usage_daily_date ON usage_daily(usage_date);

        CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
        CREATE INDEX IF NOT EXISTS idx_memories_user_updated ON memories(user_id, updated_at);

        CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
        CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created ON support_tickets(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at);
        CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

        CREATE INDEX IF NOT EXISTS idx_admin_logs_timestamp ON admin_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_banned_admins_expires ON banned_admins(expires_at);
      `);

      // Ensure personalization column exists for existing databases
      try {
        await d1.exec(`ALTER TABLE users ADD COLUMN personalization TEXT;`);
      } catch {
        // column already exists
      }
    } catch (err) {
      console.warn('[D1 Database] Schema initialization warning:', err);
    }
  },

  // --- Users CRUD ---

  async findUserByEmail(d1: D1Database, email: string): Promise<User | null> {
    if (!email) return null;
    const row = await d1
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .bind(email.trim())
      .first<any>();
    return row ? this.mapUser(row) : null;
  },

  async findUserById(d1: D1Database, id: string): Promise<User | null> {
    if (!id) return null;
    const row = await d1
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<any>();
    return row ? this.mapUser(row) : null;
  },

  async getAllUsers(d1: D1Database): Promise<User[]> {
    const res = await d1
      .prepare('SELECT * FROM users ORDER BY created_at DESC')
      .all<any>();
    const users = (res.results || []).map((r) => this.mapUser(r));
    // Retain only genuine human users with @gmail.com accounts; disconnect test/dummy users
    return users.filter((u) => u.email && u.email.toLowerCase().trim().endsWith('@gmail.com'));
  },

  async createUser(
    d1: D1Database,
    user: Omit<User, 'id' | 'createdAt' | 'status'> & { status?: 'active' | 'suspended' | 'banned' }
  ): Promise<User> {
    const id = generateUuid();
    const now = new Date().toISOString();
    const status = user.status || 'active';

    await d1
      .prepare(`
        INSERT INTO users (
          id, email, name, password_hash, avatar_url, system_prompt,
          preferred_model, memory_enabled, language_preference, personalization, is_email_verified,
          status, created_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        user.email.toLowerCase().trim(),
        user.name.trim(),
        user.passwordHash,
        user.avatarUrl || null,
        user.systemPrompt || null,
        user.preferredModel || null,
        user.memoryEnabled ? 1 : 0,
        user.languagePreference || null,
        user.personalization ? JSON.stringify(user.personalization) : null,
        user.isEmailVerified ? 1 : 0,
        status,
        now,
        now
      )
      .run();

    return {
      ...user,
      id,
      status,
      createdAt: now,
      lastActiveAt: now,
    };
  },

  async updateUser(d1: D1Database, id: string, updates: Partial<User>): Promise<User | null> {
    const existing = await this.findUserById(d1, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name.trim());
    }
    if (updates.passwordHash !== undefined) {
      fields.push('password_hash = ?');
      values.push(updates.passwordHash);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.systemPrompt !== undefined) {
      fields.push('system_prompt = ?');
      values.push(updates.systemPrompt);
    }
    if (updates.preferredModel !== undefined) {
      fields.push('preferred_model = ?');
      values.push(updates.preferredModel);
    }
    if (updates.memoryEnabled !== undefined) {
      fields.push('memory_enabled = ?');
      values.push(updates.memoryEnabled ? 1 : 0);
    }
    if (updates.languagePreference !== undefined) {
      fields.push('language_preference = ?');
      values.push(updates.languagePreference);
    }
    if (updates.personalization !== undefined) {
      fields.push('personalization = ?');
      values.push(updates.personalization ? JSON.stringify(updates.personalization) : null);
    }
    if (updates.isEmailVerified !== undefined) {
      fields.push('is_email_verified = ?');
      values.push(updates.isEmailVerified ? 1 : 0);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.verificationCodeHash !== undefined) {
      fields.push('verification_code_hash = ?');
      values.push(updates.verificationCodeHash);
    }
    if (updates.verificationCodeExpiresAt !== undefined) {
      fields.push('verification_code_expires_at = ?');
      values.push(updates.verificationCodeExpiresAt);
    }
    if (updates.verificationAttempts !== undefined) {
      fields.push('verification_attempts = ?');
      values.push(updates.verificationAttempts);
    }
    if (updates.lastVerificationSentAt !== undefined) {
      fields.push('last_verification_sent_at = ?');
      values.push(updates.lastVerificationSentAt);
    }
    if (updates.resetPasswordCodeHash !== undefined) {
      fields.push('reset_password_code_hash = ?');
      values.push(updates.resetPasswordCodeHash);
    }
    if (updates.resetPasswordExpiresAt !== undefined) {
      fields.push('reset_password_expires_at = ?');
      values.push(updates.resetPasswordExpiresAt);
    }
    if (updates.resetPasswordAttempts !== undefined) {
      fields.push('reset_password_attempts = ?');
      values.push(updates.resetPasswordAttempts);
    }
    if (updates.lastPasswordResetSentAt !== undefined) {
      fields.push('last_password_reset_sent_at = ?');
      values.push(updates.lastPasswordResetSentAt);
    }
    if (updates.lastActiveAt !== undefined) {
      fields.push('last_active_at = ?');
      values.push(updates.lastActiveAt);
    }

    if (fields.length === 0) return existing;

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    await d1.prepare(sql).bind(...values).run();

    return this.findUserById(d1, id);
  },

  async deleteUser(d1: D1Database, id: string): Promise<boolean> {
    const batch = [
      d1.prepare('DELETE FROM files WHERE user_id = ?').bind(id),
      d1.prepare('DELETE FROM messages WHERE user_id = ?').bind(id),
      d1.prepare('DELETE FROM conversations WHERE user_id = ?').bind(id),
      d1.prepare('DELETE FROM memories WHERE user_id = ?').bind(id),
      d1.prepare('DELETE FROM support_tickets WHERE user_id = ?').bind(id),
      d1.prepare('DELETE FROM usage_daily WHERE user_id = ?').bind(id),
      d1.prepare('DELETE FROM users WHERE id = ?').bind(id),
    ];
    const results = await d1.batch(batch);
    const userRes = results[results.length - 1];
    return (userRes?.meta?.changes || 0) > 0;
  },

  async touchUserActivity(d1: D1Database, userId: string): Promise<void> {
    const now = new Date().toISOString();
    await d1
      .prepare('UPDATE users SET last_active_at = ? WHERE id = ?')
      .bind(now, userId)
      .run()
      .catch(() => {});
  },

  // --- Email Verification & Password Reset (Web Crypto SHA-256) ---

  async setVerificationCode(d1: D1Database, userId: string, code: string): Promise<void> {
    const now = Date.now();
    const hash = await sha256Hex(`${code}:${userId}`);
    const expiresAt = now + 15 * 60 * 1000;

    await d1
      .prepare(`
        UPDATE users 
        SET verification_code_hash = ?, verification_code_expires_at = ?, verification_attempts = 0, last_verification_sent_at = ?
        WHERE id = ?
      `)
      .bind(hash, expiresAt, now, userId)
      .run();
  },

  async verifyEmailCode(d1: D1Database, email: string, rawCode: string): Promise<{ success: boolean; user?: User; error?: string }> {
    const user = await this.findUserByEmail(d1, email);
    if (!user) return { success: false, error: 'User not found' };

    const attempts = user.verificationAttempts || 0;
    if (attempts >= 5) {
      return { success: false, error: 'Maximum verification attempts exceeded. Please request a new code.' };
    }

    if (!user.verificationCodeExpiresAt || Date.now() > user.verificationCodeExpiresAt) {
      return { success: false, error: 'Verification code has expired. Please request a new one.' };
    }

    const inputHash = await sha256Hex(`${rawCode.trim()}:${user.id}`);
    if (inputHash !== user.verificationCodeHash) {
      const newAttempts = attempts + 1;
      await d1
        .prepare('UPDATE users SET verification_attempts = ? WHERE id = ?')
        .bind(newAttempts, user.id)
        .run();
      const remaining = 5 - newAttempts;
      return { success: false, error: `Invalid verification code. ${remaining} attempt(s) remaining.` };
    }

    const now = new Date().toISOString();
    await d1
      .prepare(`
        UPDATE users 
        SET is_email_verified = 1, verification_code_hash = NULL, verification_code_expires_at = NULL, verification_attempts = 0, last_active_at = ?
        WHERE id = ?
      `)
      .bind(now, user.id)
      .run();

    const updated = await this.findUserById(d1, user.id);
    return { success: true, user: updated || user };
  },

  async setPasswordResetCode(d1: D1Database, userId: string, code: string): Promise<void> {
    const now = Date.now();
    const hash = await sha256Hex(`${code}:${userId}`);
    const expiresAt = now + 15 * 60 * 1000;

    await d1
      .prepare(`
        UPDATE users 
        SET reset_password_code_hash = ?, reset_password_expires_at = ?, reset_password_attempts = 0, last_password_reset_sent_at = ?
        WHERE id = ?
      `)
      .bind(hash, expiresAt, now, userId)
      .run();
  },

  async verifyAndResetPassword(
    d1: D1Database,
    email: string,
    rawCode: string,
    newPasswordHash: string
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    const user = await this.findUserByEmail(d1, email);
    if (!user) return { success: false, error: 'User not found' };

    const attempts = user.resetPasswordAttempts || 0;
    if (attempts >= 5) {
      return { success: false, error: 'Maximum attempts exceeded. Please request a new password reset code.' };
    }

    if (!user.resetPasswordExpiresAt || Date.now() > user.resetPasswordExpiresAt) {
      return { success: false, error: 'Password reset code has expired. Please request a new one.' };
    }

    const inputHash = await sha256Hex(`${rawCode.trim()}:${user.id}`);
    if (inputHash !== user.resetPasswordCodeHash) {
      const newAttempts = attempts + 1;
      await d1
        .prepare('UPDATE users SET reset_password_attempts = ? WHERE id = ?')
        .bind(newAttempts, user.id)
        .run();
      const remaining = 5 - newAttempts;
      return { success: false, error: `Invalid reset code. ${remaining} attempt(s) remaining.` };
    }

    const now = new Date().toISOString();
    await d1
      .prepare(`
        UPDATE users 
        SET password_hash = ?, reset_password_code_hash = NULL, reset_password_expires_at = NULL, reset_password_attempts = 0, last_active_at = ?
        WHERE id = ?
      `)
      .bind(newPasswordHash, now, user.id)
      .run();

    const updated = await this.findUserById(d1, user.id);
    return { success: true, user: updated || user };
  },

  async canResendVerification(
    d1: D1Database,
    userId: string,
    cooldownMs = 60000
  ): Promise<{ allowed: boolean; waitSeconds?: number }> {
    const user = await this.findUserById(d1, userId);
    if (!user || !user.lastVerificationSentAt) return { allowed: true };
    const elapsed = Date.now() - user.lastVerificationSentAt;
    if (elapsed < cooldownMs) {
      return { allowed: false, waitSeconds: Math.ceil((cooldownMs - elapsed) / 1000) };
    }
    return { allowed: true };
  },

  async canRequestPasswordReset(
    d1: D1Database,
    userId: string,
    cooldownMs = 60000
  ): Promise<{ allowed: boolean; waitSeconds?: number }> {
    const user = await this.findUserById(d1, userId);
    if (!user || !user.lastPasswordResetSentAt) return { allowed: true };
    const elapsed = Date.now() - user.lastPasswordResetSentAt;
    if (elapsed < cooldownMs) {
      return { allowed: false, waitSeconds: Math.ceil((cooldownMs - elapsed) / 1000) };
    }
    return { allowed: true };
  },

  // --- Conversations & Messages ---

  async getConversations(d1: D1Database, userId: string): Promise<Conversation[]> {
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
    
    // Only return conversations that have active messages (created within 30d) OR are fresh (<30d old)
    const res = await d1
      .prepare(`
        SELECT c.* FROM conversations c
        WHERE c.user_id = ? AND c.is_archived = 0
        AND (
          c.created_at >= ?
          OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.created_at >= ?)
        )
        ORDER BY c.is_pinned DESC, c.updated_at DESC
      `)
      .bind(userId, cutoffDate, cutoffDate)
      .all<any>();

    return (res.results || []).map((r) => this.mapConversation(r));
  },

  async getArchivedConversations(d1: D1Database, userId: string): Promise<Conversation[]> {
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();

    const res = await d1
      .prepare(`
        SELECT c.* FROM conversations c
        WHERE c.user_id = ? AND c.is_archived = 1
        AND (
          c.created_at >= ?
          OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.created_at >= ?)
        )
        ORDER BY c.updated_at DESC
      `)
      .bind(userId, cutoffDate, cutoffDate)
      .all<any>();

    return (res.results || []).map((r) => this.mapConversation(r));
  },

  async getConversationById(d1: D1Database, id: string, userId: string): Promise<Conversation | null> {
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
    const row = await d1
      .prepare(`
        SELECT c.* FROM conversations c
        WHERE c.id = ? AND c.user_id = ?
        AND (
          c.created_at >= ?
          OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.created_at >= ?)
        )
      `)
      .bind(id, userId, cutoffDate, cutoffDate)
      .first<any>();

    return row ? this.mapConversation(row) : null;
  },

  async createConversation(
    d1: D1Database,
    userId: string,
    title = 'New Conversation',
    model = 'openai/gpt-oss-120b'
  ): Promise<Conversation> {
    const id = generateUuid();
    const now = new Date().toISOString();

    await d1
      .prepare(`
        INSERT INTO conversations (id, user_id, title, model, is_pinned, is_archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
      `)
      .bind(id, userId, title, model, now, now)
      .run();

    await this.touchUserActivity(d1, userId);

    return {
      id,
      userId,
      title,
      model,
      isPinned: false,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
  },

  async updateConversation(
    d1: D1Database,
    id: string,
    userId: string,
    updates: Partial<Conversation>
  ): Promise<Conversation | null> {
    const existing = await this.getConversationById(d1, id, userId);
    if (!existing) return null;

    const fields: string[] = ['updated_at = ?'];
    const now = new Date().toISOString();
    const values: any[] = [now];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title.trim());
    }
    if (updates.model !== undefined) {
      fields.push('model = ?');
      values.push(updates.model);
    }
    if (updates.lastMessagePreview !== undefined) {
      fields.push('last_message_preview = ?');
      values.push(updates.lastMessagePreview);
    }
    if (updates.isPinned !== undefined) {
      fields.push('is_pinned = ?');
      values.push(updates.isPinned ? 1 : 0);
    }
    if (updates.isArchived !== undefined) {
      fields.push('is_archived = ?');
      values.push(updates.isArchived ? 1 : 0);
    }

    values.push(id, userId);
    await d1
      .prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`)
      .bind(...values)
      .run();

    await this.touchUserActivity(d1, userId);
    return this.getConversationById(d1, id, userId);
  },

  async deleteConversation(d1: D1Database, id: string, userId: string): Promise<boolean> {
    const batch = [
      d1.prepare('DELETE FROM files WHERE conversation_id = ? AND user_id = ?').bind(id, userId),
      d1.prepare('DELETE FROM messages WHERE conversation_id = ? AND user_id = ?').bind(id, userId),
      d1.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').bind(id, userId),
    ];
    const results = await d1.batch(batch);
    await this.touchUserActivity(d1, userId);
    const convRes = results[results.length - 1];
    return (convRes?.meta?.changes || 0) > 0;
  },

  async clearUserConversations(d1: D1Database, userId: string): Promise<void> {
    const batch = [
      d1.prepare('DELETE FROM files WHERE user_id = ? AND conversation_id IS NOT NULL').bind(userId),
      d1.prepare('DELETE FROM messages WHERE user_id = ?').bind(userId),
      d1.prepare('DELETE FROM conversations WHERE user_id = ?').bind(userId),
    ];
    await d1.batch(batch);
    await this.touchUserActivity(d1, userId);
  },

  async getMessages(d1: D1Database, conversationId: string, userId?: string): Promise<Message[]> {
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
    let query = `
      SELECT * FROM messages 
      WHERE conversation_id = ? AND created_at >= ?
    `;
    const params: any[] = [conversationId, cutoffDate];
    if (userId) {
      query += ` AND user_id = ?`;
      params.push(userId);
    }
    query += ` ORDER BY created_at ASC`;

    const res = await d1.prepare(query).bind(...params).all<any>();
    return (res.results || []).map((r) => this.mapMessage(r));
  },

  async createMessage(d1: D1Database, msg: Omit<Message, 'id' | 'createdAt'> & { createdAt?: string }): Promise<Message> {
    const id = generateUuid();
    const now = msg.createdAt || new Date().toISOString();
    const role: MessageRole = msg.role || (msg.sender === 'user' ? 'user' : 'assistant');
    const sender: 'user' | 'assistant' = role === 'user' ? 'user' : 'assistant';
    const isLiked = Boolean(msg.liked || msg.reactions?.liked);
    const isDisliked = Boolean(msg.disliked || msg.reactions?.disliked);
    const model = msg.model || msg.modelUsed || null;
    const fileIds = msg.fileIds || (msg.attachments ? msg.attachments.map((a: any) => a.id).filter(Boolean) : undefined);
    const fileIdsStr = fileIds && fileIds.length > 0 ? JSON.stringify(fileIds) : null;
    const preview = msg.content ? msg.content.slice(0, 80) : '';

    await d1
      .prepare(`
        INSERT INTO messages (id, conversation_id, user_id, role, content, model, file_ids, liked, disliked, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(id, msg.conversationId, msg.userId, role, msg.content, model, fileIdsStr, isLiked ? 1 : 0, isDisliked ? 1 : 0, now)
      .run();

    // Update conversation updated_at and preview
    await d1
      .prepare('UPDATE conversations SET updated_at = ?, last_message_preview = ? WHERE id = ?')
      .bind(now, preview, msg.conversationId)
      .run()
      .catch(() => {});

    // If fileIds were provided, bind file metadata to this message
    if (fileIds && fileIds.length > 0) {
      for (const fileId of fileIds) {
        await d1
          .prepare('UPDATE files SET message_id = ?, conversation_id = ? WHERE (id = ? OR unique_file_id = ?) AND user_id = ?')
          .bind(id, msg.conversationId, fileId, fileId, msg.userId)
          .run()
          .catch(() => {});
      }
    }

    await this.touchUserActivity(d1, msg.userId);

    return {
      id,
      conversationId: msg.conversationId,
      userId: msg.userId,
      role,
      sender,
      content: msg.content,
      model: model || undefined,
      modelUsed: model || undefined,
      fileIds,
      liked: isLiked,
      disliked: isDisliked,
      reactions: { liked: isLiked, disliked: isDisliked },
      createdAt: now,
    };
  },

  async updateMessageReaction(
    d1: D1Database,
    messageId: string,
    userId: string,
    liked?: boolean,
    disliked?: boolean
  ): Promise<Message | null> {
    // Verify user owns the message OR owns the conversation
    const check = await d1
      .prepare(`
        SELECT m.id FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE m.id = ? AND (m.user_id = ? OR c.user_id = ?)
      `)
      .bind(messageId, userId, userId)
      .first<any>();

    if (!check) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (liked !== undefined) {
      fields.push('liked = ?');
      values.push(liked ? 1 : 0);
    }
    if (disliked !== undefined) {
      fields.push('disliked = ?');
      values.push(disliked ? 1 : 0);
    }

    if (fields.length === 0) return null;

    values.push(messageId);
    await d1
      .prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const row = await d1
      .prepare('SELECT * FROM messages WHERE id = ?')
      .bind(messageId)
      .first<any>();

    return row ? this.mapMessage(row) : null;
  },

  // --- Account-Level Memories ---

  async getMemories(d1: D1Database, userId: string): Promise<Memory[]> {
    const res = await d1
      .prepare('SELECT * FROM memories WHERE user_id = ? ORDER BY updated_at DESC')
      .bind(userId)
      .all<any>();
    return (res.results || []).map((r) => this.mapMemory(r));
  },

  async retrieveRelevantMemories(d1: D1Database, userId: string, contextText: string, maxMemories = 6): Promise<Memory[]> {
    const all = await this.getMemories(d1, userId);
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
  },

  async createMemory(d1: D1Database, memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>): Promise<Memory> {
    const id = generateUuid();
    const now = new Date().toISOString();

    await d1
      .prepare(`
        INSERT INTO memories (id, user_id, content, source, category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(id, memory.userId, memory.content, memory.source || null, memory.category || 'general', now, now)
      .run();

    await this.touchUserActivity(d1, memory.userId);

    return {
      ...memory,
      id,
      createdAt: now,
      updatedAt: now,
    };
  },

  async deleteMemory(d1: D1Database, id: string, userId: string): Promise<boolean> {
    const res = await d1
      .prepare('DELETE FROM memories WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .run();
    await this.touchUserActivity(d1, userId);
    return (res.meta?.changes || 0) > 0;
  },

  async clearMemories(d1: D1Database, userId: string): Promise<void> {
    await d1.prepare('DELETE FROM memories WHERE user_id = ?').bind(userId).run();
    await this.touchUserActivity(d1, userId);
  },

  // --- Files (Supabase Storage Metadata in D1) ---

  async getFileById(d1: D1Database, id: string, userId?: string): Promise<FileRecord | null> {
    if (userId) {
      const row = await d1
        .prepare('SELECT * FROM files WHERE id = ? AND user_id = ?')
        .bind(id, userId)
        .first<any>();
      return row ? this.mapFile(row) : null;
    }
    const row = await d1
      .prepare('SELECT * FROM files WHERE id = ?')
      .bind(id)
      .first<any>();
    return row ? this.mapFile(row) : null;
  },

  async findFileByFilename(d1: D1Database, filename: string, userId?: string): Promise<FileRecord | null> {
    let sql = 'SELECT * FROM files WHERE (filename = ? OR unique_file_id = ? OR id = ?)';
    const params: any[] = [filename, filename, filename];
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }
    const row = await d1.prepare(sql).bind(...params).first<any>();
    return row ? this.mapFile(row) : null;
  },

  async getFileByFilename(d1: D1Database, filename: string, userId: string): Promise<FileRecord | null> {
    const row = await d1
      .prepare('SELECT * FROM files WHERE (filename = ? OR unique_file_id = ?) AND user_id = ?')
      .bind(filename, filename, userId)
      .first<any>();
    return row ? this.mapFile(row) : null;
  },

  async getFiles(d1: D1Database, userId: string, type?: string): Promise<FileRecord[]> {
    let sql = 'SELECT * FROM files WHERE user_id = ?';
    const params: any[] = [userId];

    if (type) {
      sql += ' AND mime_type LIKE ?';
      params.push(`%${type}%`);
    }

    sql += ' ORDER BY created_at DESC';
    const res = await d1.prepare(sql).bind(...params).all<any>();
    return (res.results || []).map((r) => this.mapFile(r));
  },

  async getAllFiles(d1: D1Database): Promise<FileRecord[]> {
    const res = await d1.prepare('SELECT * FROM files ORDER BY created_at DESC').all<any>();
    return (res.results || []).map((r) => this.mapFile(r));
  },

  async createFileRecord(d1: D1Database, file: Omit<FileRecord, 'id' | 'createdAt'> & { createdAt?: string }): Promise<FileRecord> {
    if (process.env.NODE_ENV === 'production') {
      if (!file.storagePath || !file.storagePath.trim() || (file.storageProvider && file.storageProvider !== 'supabase') || file.bucketName === 'local-dev') {
        throw new Error('In production, authoritative persistent storage must be Supabase Storage.');
      }
    }
    const id = generateUuid();
    const now = file.createdAt || new Date().toISOString();
    const chunksStr = file.chunks ? JSON.stringify(file.chunks) : null;

    await d1
      .prepare(`
        INSERT INTO files (
          id, user_id, conversation_id, message_id, storage_provider,
          bucket_name, storage_path, unique_file_id, filename, original_name,
          mime_type, size_bytes, url, extracted_text, chunks, is_scanned,
          page_count, duration, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        file.userId,
        file.conversationId || null,
        file.messageId || null,
        file.storageProvider || 'supabase',
        file.bucketName || 'aestific-files',
        file.storagePath,
        file.uniqueFileId || file.filename,
        file.filename,
        file.originalName,
        file.mimeType,
        file.sizeBytes || 0,
        file.url || '',
        file.extractedText || null,
        chunksStr,
        file.isScanned ? 1 : 0,
        file.pageCount || 0,
        file.duration || null,
        now
      )
      .run();

    await this.touchUserActivity(d1, file.userId);

    return {
      ...file,
      id,
      createdAt: now,
    };
  },

  async updateRecordTimestamp(
    d1: D1Database,
    table: 'files' | 'messages' | 'conversations',
    id: string,
    createdAt: string
  ): Promise<void> {
    const validTables = ['files', 'messages', 'conversations'];
    if (!validTables.includes(table)) throw new Error('Invalid table');
    await d1.prepare(`UPDATE ${table} SET created_at = ? WHERE id = ?`).bind(createdAt, id).run();
  },

  async deleteFileRecord(d1: D1Database, id: string, userId: string): Promise<boolean> {
    const res = await d1
      .prepare('DELETE FROM files WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .run();
    await this.touchUserActivity(d1, userId);
    return (res.meta?.changes || 0) > 0;
  },

  // --- Daily Usage Analytics (Telemetry Only, strictly NO quota/limits) ---

  async getDailyUsage(d1: D1Database, userId: string, usageDate?: string): Promise<DailyUsage> {
    const today = usageDate || new Date().toISOString().split('T')[0];
    const row = await d1
      .prepare('SELECT * FROM usage_daily WHERE user_id = ? AND usage_date = ?')
      .bind(userId, today)
      .first<any>();

    if (row) {
      return this.mapUsage(row);
    }

    const id = generateUuid();
    const now = new Date().toISOString();
    await d1
      .prepare(`
        INSERT INTO usage_daily (id, user_id, usage_date, chat_count, photo_count, file_count, created_at, updated_at)
        VALUES (?, ?, ?, 0, 0, 0, ?, ?)
      `)
      .bind(id, userId, today, now, now)
      .run();

    return {
      id,
      userId,
      usageDate: today,
      chatCount: 0,
      photoCount: 0,
      fileCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  },

  async incrementDailyUsage(
    d1: D1Database,
    userId: string,
    delta: { chatCount?: number; photoCount?: number; fileCount?: number }
  ): Promise<DailyUsage> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();
    await this.getDailyUsage(d1, userId, today); // ensure row exists

    await d1
      .prepare(`
        UPDATE usage_daily 
        SET chat_count = chat_count + ?, photo_count = photo_count + ?, file_count = file_count + ?, updated_at = ?
        WHERE user_id = ? AND usage_date = ?
      `)
      .bind(
        delta.chatCount || 0,
        delta.photoCount || 0,
        delta.fileCount || 0,
        now,
        userId,
        today
      )
      .run();

    await this.touchUserActivity(d1, userId);
    return this.getDailyUsage(d1, userId, today);
  },

  async getAllDailyUsage(d1: D1Database): Promise<DailyUsage[]> {
    const res = await d1.prepare('SELECT * FROM usage_daily ORDER BY usage_date DESC').all<any>();
    return (res.results || []).map((r) => this.mapUsage(r));
  },

  // --- 30-Day Retention Cleanup ---

  async cleanupOldHistory(
    d1: D1Database,
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
    const cutoffTime = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();

    // 1. Identify expired files before deletion so storage objects can be purged
    const expiredFilesRes = await d1
      .prepare('SELECT id, user_id, storage_path, filename, bucket_name FROM files WHERE created_at < ?')
      .bind(cutoffTime)
      .all<any>();
    const expiredFiles: Array<{ id: string; user_id: string; storage_path: string; filename?: string; bucket_name?: string }> =
      (expiredFilesRes?.results || []) as any;

    let deletedFilesCount = 0;
    if (preserveFileIds && preserveFileIds.size > 0) {
      for (const f of expiredFiles) {
        if (!preserveFileIds.has(f.id)) {
          await d1.prepare('DELETE FROM files WHERE id = ?').bind(f.id).run();
          deletedFilesCount++;
        }
      }
    } else {
      const fileDel = await d1
        .prepare('DELETE FROM files WHERE created_at < ?')
        .bind(cutoffTime)
        .run();
      deletedFilesCount = fileDel.meta?.changes || expiredFiles.length;
    }

    // 2. Expired messages (evaluated strictly by message created_at)
    const countMsgRes = await d1
      .prepare('SELECT COUNT(*) as cnt FROM messages WHERE created_at < ?')
      .bind(cutoffTime)
      .first<any>();
    const messagesFound = countMsgRes?.cnt || 0;
    const msgDel = await d1
      .prepare('DELETE FROM messages WHERE created_at < ?')
      .bind(cutoffTime)
      .run();
    const deletedMessagesCount = msgDel.meta?.changes || messagesFound;

    // 3. Clear orphaned conversation files (EXCEPT any files preserved for storage retry)
    if (preserveFileIds && preserveFileIds.size > 0) {
      const preservedList = Array.from(preserveFileIds);
      const placeholders = preservedList.map(() => '?').join(',');
      await d1
        .prepare(`
          DELETE FROM files 
          WHERE conversation_id IS NOT NULL 
          AND conversation_id NOT IN (SELECT id FROM conversations)
          AND id NOT IN (${placeholders})
        `)
        .bind(...preservedList)
        .run()
        .catch(() => {});
    } else {
      await d1
        .prepare(`
          DELETE FROM files 
          WHERE conversation_id IS NOT NULL 
          AND conversation_id NOT IN (SELECT id FROM conversations)
        `)
        .run()
        .catch(() => {});
    }

    // 4. Empty conversations with 0 messages and 0 files remaining created before cutoff
    const convDel = await d1
      .prepare(`
        DELETE FROM conversations 
        WHERE id NOT IN (SELECT DISTINCT conversation_id FROM messages WHERE conversation_id IS NOT NULL)
        AND id NOT IN (SELECT DISTINCT conversation_id FROM files WHERE conversation_id IS NOT NULL)
        AND created_at < ?
      `)
      .bind(cutoffTime)
      .run();
    const deletedConversationsCount = convDel.meta?.changes || 0;

    return {
      cutoffDate: cutoffTime,
      messagesFound,
      deletedMessagesCount,
      deletedConversationsCount,
      deletedFilesCount,
      expiredFiles,
    };
  },

  // --- Telemetry & Analytics ---

  async getSystemTelemetry(d1: D1Database): Promise<SystemTelemetry> {
    const now = Date.now();
    const fifteenMinAgo = new Date(now - 15 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
    const today = new Date().toISOString().split('T')[0];

    const users = await this.getAllUsers(d1);
    const totalUsers = users.length;
    const activeUsersLive = users.filter((u) => u.lastActiveAt && u.lastActiveAt >= fifteenMinAgo).length;
    const activeUsers24h = users.filter((u) => u.lastActiveAt && u.lastActiveAt >= oneDayAgo).length;
    const activeUsers7d = users.filter((u) => u.lastActiveAt && u.lastActiveAt >= sevenDaysAgo).length;
    const activeUsers30d = users.filter((u) => u.lastActiveAt && u.lastActiveAt >= thirtyDaysAgo).length;

    const countConvs = await d1.prepare('SELECT COUNT(*) as cnt FROM conversations').first<any>();
    const countMsgs = await d1.prepare('SELECT COUNT(*) as cnt FROM messages').first<any>();
    const countFiles = await d1.prepare('SELECT COUNT(*) as cnt FROM files').first<any>();

    const todayUsage = await d1
      .prepare('SELECT SUM(chat_count) as chats, SUM(photo_count) as photos, SUM(file_count) as files FROM usage_daily WHERE usage_date = ?')
      .bind(today)
      .first<any>();

    const todayChatCount = todayUsage?.chats || 0;
    const todayPhotoCount = todayUsage?.photos || 0;
    const todayFileCount = todayUsage?.files || 0;

    const allDaily = await this.getAllDailyUsage(d1);

    const timeline: AnalyticsDataPoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const endOfDay = `${dateStr}T23:59:59.999Z`;

      const totalUsersOnDate = users.filter((u) => u.createdAt <= endOfDay).length;
      const newUsersOnDate = users.filter((u) => u.createdAt.startsWith(dateStr)).length;

      const dayUsages = allDaily.filter((u) => u.usageDate === dateStr);
      const activeIds = new Set(dayUsages.map((u) => u.userId));
      users.forEach((u) => {
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

    const newUsersLast7d = users.filter((u) => u.createdAt >= sevenDaysAgo).length;
    const newUsersPrev7d = users.filter((u) => {
      const fourteenDaysAgo = new Date(now - 14 * 24 * 3600 * 1000).toISOString();
      return u.createdAt >= fourteenDaysAgo && u.createdAt < sevenDaysAgo;
    }).length;

    let userGrowthRate7d = 0;
    if (newUsersPrev7d === 0) {
      userGrowthRate7d = newUsersLast7d > 0 ? 100 : 0;
    } else {
      userGrowthRate7d = Math.round(((newUsersLast7d - newUsersPrev7d) / newUsersPrev7d) * 100);
    }

    let growthStatus: 'growing' | 'stable' | 'declining' = 'stable';
    if (userGrowthRate7d > 5 || chatGrowthRate7d > 5) {
      growthStatus = 'growing';
    } else if (userGrowthRate7d < -5 || chatGrowthRate7d < -5) {
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
      totalConversations: countConvs?.cnt || 0,
      totalMessages: countMsgs?.cnt || 0,
      totalFiles: countFiles?.cnt || 0,
      todayChatCount,
      todayPhotoCount,
      todayFileCount,
      timeline,
    };
  },

  async getUserActivitySummary(
    d1: D1Database,
    userId: string
  ): Promise<{
    conversationsCount: number;
    messagesCount: number;
    filesCount: number;
    memoriesCount: number;
    todayChats: number;
    todayPhotos: number;
    todayFiles: number;
  }> {
    const todayStr = new Date().toISOString().split('T')[0];
    const [convCount, msgCount, fileCount, memCount, usage] = await Promise.all([
      d1.prepare('SELECT COUNT(*) as cnt FROM conversations WHERE user_id = ?').bind(userId).first<{ cnt: number }>(),
      d1.prepare('SELECT COUNT(*) as cnt FROM messages WHERE user_id = ?').bind(userId).first<{ cnt: number }>(),
      d1.prepare('SELECT COUNT(*) as cnt FROM files WHERE user_id = ?').bind(userId).first<{ cnt: number }>(),
      d1.prepare('SELECT COUNT(*) as cnt FROM memories WHERE user_id = ?').bind(userId).first<{ cnt: number }>(),
      d1
        .prepare('SELECT chat_count, photo_count, file_count FROM usage_daily WHERE user_id = ? AND usage_date = ?')
        .bind(userId, todayStr)
        .first<{ chat_count: number; photo_count: number; file_count: number }>(),
    ]);

    return {
      conversationsCount: convCount?.cnt || 0,
      messagesCount: msgCount?.cnt || 0,
      filesCount: fileCount?.cnt || 0,
      memoriesCount: memCount?.cnt || 0,
      todayChats: usage?.chat_count || 0,
      todayPhotos: usage?.photo_count || 0,
      todayFiles: usage?.file_count || 0,
    };
  },

  // --- Admin Logs & Banning ---

  async addAdminLog(
    d1: D1Database,
    log: { adminName: string; ip?: string; ipAddress?: string; action: string; details?: string }
  ): Promise<AdminLog> {
    const id = generateUuid();
    const timestamp = new Date().toISOString();
    const safeIp = log.ip || log.ipAddress || '127.0.0.1';

    await d1
      .prepare('INSERT INTO admin_logs (id, admin_name, ip, action, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, log.adminName, safeIp, log.action, log.details || null, timestamp)
      .run();

    return {
      id,
      adminName: log.adminName,
      ip: safeIp,
      action: log.action,
      details: log.details,
      timestamp,
    };
  },

  async getAdminLogs(d1: D1Database, limit = 100): Promise<AdminLog[]> {
    const res = await d1
      .prepare('SELECT * FROM admin_logs ORDER BY timestamp DESC LIMIT ?')
      .bind(limit)
      .all<any>();
    return (res.results || []).map((r) => ({
      id: r.id,
      adminName: r.admin_name,
      ip: r.ip,
      action: r.action,
      details: r.details,
      timestamp: r.timestamp,
    }));
  },

  async banAdmin(d1: D1Database, adminName: string, bannedBy = 'System', durationHours = 876000): Promise<BannedAdmin> {
    const cleanName = adminName.trim();
    const now = new Date().toISOString();
    // 876000 hours = 100 years (permanent / lifetime ban, recoverable via unban)
    const expiresAt = Date.now() + durationHours * 3600 * 1000;

    await d1
      .prepare('INSERT OR REPLACE INTO banned_admins (admin_name, banned_at, expires_at, banned_by) VALUES (?, ?, ?, ?)')
      .bind(cleanName, now, expiresAt, bannedBy)
      .run();

    return {
      adminName: cleanName,
      bannedAt: now,
      expiresAt,
      bannedBy,
    };
  },

  async unbanAdmin(d1: D1Database, adminName: string): Promise<boolean> {
    const res = await d1
      .prepare('DELETE FROM banned_admins WHERE LOWER(admin_name) = LOWER(?)')
      .bind(adminName.trim())
      .run();
    return (res.meta?.changes || 0) > 0;
  },

  async isBannedAdmin(d1: D1Database, adminName: string): Promise<{ isBanned: boolean; expiresAt?: number; bannedAt?: string }> {
    if (!adminName) return { isBanned: false };
    const row = await d1
      .prepare('SELECT * FROM banned_admins WHERE LOWER(admin_name) = LOWER(?) AND expires_at > ?')
      .bind(adminName.trim(), Date.now())
      .first<any>();

    if (!row) return { isBanned: false };
    return { isBanned: true, expiresAt: row.expires_at, bannedAt: row.banned_at };
  },

  async getAdminSettings(d1: D1Database): Promise<AdminSettings> {
    const res = await d1
      .prepare('SELECT * FROM banned_admins WHERE expires_at > ?')
      .bind(Date.now())
      .all<any>();
    return {
      bannedAdmins: (res.results || []).map((r) => ({
        adminName: r.admin_name,
        bannedAt: r.banned_at,
        expiresAt: r.expires_at,
        bannedBy: r.banned_by,
      })),
    };
  },

  async banUser(d1: D1Database, userId: string, isBanned: boolean, reason?: string): Promise<User | null> {
    const status = isBanned ? 'banned' : 'active';
    await d1
      .prepare('UPDATE users SET status = ? WHERE id = ?')
      .bind(status, userId)
      .run();
    return this.findUserById(d1, userId);
  },

  // --- Support Tickets ---

  async createSupportTicket(
    d1: D1Database,
    data: { userId: string; userName?: string; userEmail: string; subject: string; message: string }
  ): Promise<SupportTicket> {
    const id = generateUuid();
    const now = new Date().toISOString();
    const safeUserName = data.userName || data.userEmail.split('@')[0] || 'User';

    await d1
      .prepare(`
        INSERT INTO support_tickets (id, user_id, user_name, user_email, subject, message, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
      `)
      .bind(id, data.userId, safeUserName, data.userEmail, data.subject, data.message, now)
      .run();

    await this.touchUserActivity(d1, data.userId);

    return {
      ...data,
      userName: safeUserName,
      id,
      status: 'open',
      createdAt: now,
    };
  },

  async getUserSupportTickets(d1: D1Database, userId: string): Promise<SupportTicket[]> {
    const res = await d1
      .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<any>();
    return (res.results || []).map((r) => this.mapTicket(r));
  },

  async getAllSupportTickets(d1: D1Database): Promise<SupportTicket[]> {
    const res = await d1
      .prepare('SELECT * FROM support_tickets ORDER BY created_at DESC')
      .all<any>();
    return (res.results || []).map((r) => this.mapTicket(r));
  },

  async replySupportTicket(
    d1: D1Database,
    ticketId: string,
    reply: string,
    adminName = 'Admin'
  ): Promise<SupportTicket | null> {
    const now = new Date().toISOString();
    await d1
      .prepare(`
        UPDATE support_tickets 
        SET admin_reply = ?, status = 'replied', replied_at = ?, replied_by = ?
        WHERE id = ?
      `)
      .bind(reply, now, adminName, ticketId)
      .run();

    const row = await d1
      .prepare('SELECT * FROM support_tickets WHERE id = ?')
      .bind(ticketId)
      .first<any>();

    return row ? this.mapTicket(row) : null;
  },

  async deleteSupportTicket(d1: D1Database, ticketId: string): Promise<boolean> {
    const res = await d1.prepare('DELETE FROM support_tickets WHERE id = ?').bind(ticketId).run();
    return (res.meta?.changes || 0) > 0;
  },

  // --- Row Mappers ---

  mapUser(r: any): User {
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      passwordHash: r.password_hash,
      avatarUrl: r.avatar_url || undefined,
      systemPrompt: r.system_prompt || undefined,
      preferredModel: r.preferred_model || undefined,
      memoryEnabled: r.memory_enabled !== 0,
      languagePreference: r.language_preference || undefined,
      personalization: (() => {
        if (!r.personalization) return undefined;
        if (typeof r.personalization === 'object') return r.personalization;
        if (typeof r.personalization === 'string') {
          try {
            return JSON.parse(r.personalization);
          } catch {
            return undefined;
          }
        }
        return undefined;
      })(),
      isEmailVerified: r.is_email_verified === 1,
      status: r.status || 'active',
      isBanned: r.status === 'banned',
      verificationCodeHash: r.verification_code_hash || undefined,
      verificationCodeExpiresAt: r.verification_code_expires_at || undefined,
      verificationAttempts: r.verification_attempts || 0,
      lastVerificationSentAt: r.last_verification_sent_at || undefined,
      resetPasswordCodeHash: r.reset_password_code_hash || undefined,
      resetPasswordExpiresAt: r.reset_password_expires_at || undefined,
      resetPasswordAttempts: r.reset_password_attempts || 0,
      lastPasswordResetSentAt: r.last_password_reset_sent_at || undefined,
      createdAt: r.created_at,
      lastActiveAt: r.last_active_at || undefined,
    };
  },

  mapConversation(r: any): Conversation {
    return {
      id: r.id,
      userId: r.user_id,
      title: r.title,
      model: r.model || undefined,
      lastMessagePreview: r.last_message_preview || undefined,
      isPinned: r.is_pinned === 1,
      isArchived: r.is_archived === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  mapMessage(r: any): Message {
    let fileIds: string[] | undefined;
    if (r.file_ids) {
      try {
        fileIds = JSON.parse(r.file_ids);
      } catch {}
    }
    const isLiked = r.liked === 1 || r.liked === true;
    const isDisliked = r.disliked === 1 || r.disliked === true;
    const role: MessageRole = r.role || (r.sender === 'user' ? 'user' : 'assistant');
    const sender: 'user' | 'assistant' = role === 'user' ? 'user' : 'assistant';
    const model = r.model || r.model_used || undefined;

    return {
      id: r.id,
      conversationId: r.conversation_id || r.conversationId,
      userId: r.user_id || r.userId || '',
      role,
      sender,
      content: r.content || '',
      model,
      modelUsed: model,
      fileIds,
      liked: isLiked,
      disliked: isDisliked,
      reactions: {
        liked: isLiked,
        disliked: isDisliked,
      },
      createdAt: r.created_at || r.createdAt,
    };
  },

  mapMemory(r: any): Memory {
    return {
      id: r.id,
      userId: r.user_id,
      content: r.content,
      source: r.source || undefined,
      category: r.category || 'general',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  mapFile(r: any): FileRecord {
    let chunks: any[] | undefined;
    if (r.chunks) {
      try {
        chunks = JSON.parse(r.chunks);
      } catch {}
    }
    return {
      id: r.id,
      userId: r.user_id,
      conversationId: r.conversation_id || undefined,
      messageId: r.message_id || undefined,
      storageProvider: r.storage_provider || 'supabase',
      bucketName: r.bucket_name || 'aestific-files',
      storagePath: r.storage_path,
      uniqueFileId: r.unique_file_id || r.filename,
      filename: r.filename || r.unique_file_id,
      originalName: r.original_name,
      type: (r.mime_type?.startsWith('image/')
        ? 'image'
        : r.mime_type === 'application/pdf'
        ? 'pdf'
        : r.mime_type?.startsWith('audio/')
        ? 'audio'
        : r.mime_type?.startsWith('video/')
        ? 'video'
        : 'other') as any,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes || 0,
      url: r.url || '',
      extractedText: r.extracted_text || undefined,
      chunks,
      isScanned: r.is_scanned === 1,
      pageCount: r.page_count || undefined,
      duration: r.duration || undefined,
      createdAt: r.created_at,
    };
  },

  mapUsage(r: any): DailyUsage {
    return {
      id: r.id,
      userId: r.user_id,
      usageDate: r.usage_date,
      chatCount: r.chat_count || 0,
      photoCount: r.photo_count || 0,
      fileCount: r.file_count || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  mapTicket(r: any): SupportTicket {
    return {
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      subject: r.subject,
      message: r.message,
      status: r.status || 'open',
      adminReply: r.admin_reply || undefined,
      repliedAt: r.replied_at || undefined,
      repliedBy: r.replied_by || undefined,
      createdAt: r.created_at,
    };
  },

  /**
   * Safe, non-destructive migration utility from JSON data into Cloudflare D1
   */
  async migrateFromJson(
    d1: D1Database,
    source?: any
  ): Promise<{
    usersMigrated: number;
    conversationsMigrated: number;
    messagesMigrated: number;
    memoriesMigrated: number;
    filesMigrated: number;
    usageMigrated: number;
    ticketsMigrated: number;
    logsMigrated: number;
  }> {
    let schema: any;
    if (typeof source === 'string') {
      try {
        schema = JSON.parse(source);
      } catch {
        schema = {};
      }
    } else if (source && typeof source === 'object') {
      schema = source;
    } else {
      schema = {
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

    await this.initSchema(d1);

    let usersMigrated = 0;
    let conversationsMigrated = 0;
    let messagesMigrated = 0;
    let memoriesMigrated = 0;
    let filesMigrated = 0;
    let usageMigrated = 0;
    let ticketsMigrated = 0;
    let logsMigrated = 0;

    // 1. Users
    for (const u of schema.users || []) {
      const existing = await this.findUserById(d1, u.id);
      if (!existing) {
        await d1
          .prepare(`
            INSERT OR IGNORE INTO users (
              id, email, name, password_hash, avatar_url, system_prompt,
              preferred_model, memory_enabled, language_preference, is_email_verified,
              status, created_at, last_active_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            u.id,
            u.email.toLowerCase().trim(),
            u.name.trim(),
            u.passwordHash,
            u.avatarUrl || null,
            u.systemPrompt || null,
            u.preferredModel || null,
            u.memoryEnabled ? 1 : 0,
            u.languagePreference || null,
            u.isEmailVerified ? 1 : 0,
            u.status || 'active',
            u.createdAt || new Date().toISOString(),
            u.lastActiveAt || u.createdAt || new Date().toISOString()
          )
          .run();
        usersMigrated++;
      }
    }

    // 2. Conversations
    for (const c of schema.conversations || []) {
      await d1
        .prepare(`
          INSERT OR IGNORE INTO conversations (
            id, user_id, title, model, last_message_preview, is_pinned, is_archived, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          c.id,
          c.userId,
          c.title || 'New Conversation',
          c.model || 'openai/gpt-oss-120b',
          c.lastMessagePreview || null,
          c.isPinned ? 1 : 0,
          c.isArchived ? 1 : 0,
          c.createdAt || new Date().toISOString(),
          c.updatedAt || new Date().toISOString()
        )
        .run();
      conversationsMigrated++;
    }

    // 3. Messages
    for (const m of schema.messages || []) {
      const fileIdsStr = m.fileIds && m.fileIds.length > 0 ? JSON.stringify(m.fileIds) : null;
      await d1
        .prepare(`
          INSERT OR IGNORE INTO messages (
            id, conversation_id, user_id, role, content, model, file_ids, liked, disliked, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          m.id,
          m.conversationId,
          m.userId,
          m.role,
          m.content,
          m.model || null,
          fileIdsStr,
          m.liked ? 1 : 0,
          m.disliked ? 1 : 0,
          m.createdAt || new Date().toISOString()
        )
        .run();
      messagesMigrated++;
    }

    // 4. Memories
    for (const mem of schema.memories || []) {
      await d1
        .prepare(`
          INSERT OR IGNORE INTO memories (
            id, user_id, content, source, category, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          mem.id,
          mem.userId,
          mem.content,
          mem.source || null,
          mem.category || 'general',
          mem.createdAt || new Date().toISOString(),
          mem.updatedAt || new Date().toISOString()
        )
        .run();
      memoriesMigrated++;
    }

    // 5. Files
    for (const f of schema.files || []) {
      const chunksStr = f.chunks ? JSON.stringify(f.chunks) : null;
      await d1
        .prepare(`
          INSERT OR IGNORE INTO files (
            id, user_id, conversation_id, message_id, storage_provider,
            bucket_name, storage_path, unique_file_id, filename, original_name,
            mime_type, size_bytes, url, extracted_text, chunks, is_scanned,
            page_count, duration, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          f.id,
          f.userId,
          f.conversationId || null,
          f.messageId || null,
          f.storageProvider || 'supabase',
          f.bucketName || 'aestific-files',
          f.storagePath,
          f.uniqueFileId || f.filename,
          f.filename,
          f.originalName,
          f.mimeType,
          f.sizeBytes || 0,
          f.url || '',
          f.extractedText || null,
          chunksStr,
          f.isScanned ? 1 : 0,
          f.pageCount || 0,
          f.duration || null,
          f.createdAt || new Date().toISOString()
        )
        .run();
      filesMigrated++;
    }

    // 6. Usage Daily
    for (const u of schema.usageDaily || []) {
      await d1
        .prepare(`
          INSERT OR IGNORE INTO usage_daily (
            id, user_id, usage_date, chat_count, photo_count, file_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          u.id,
          u.userId,
          u.usageDate,
          u.chatCount || 0,
          u.photoCount || 0,
          u.fileCount || 0,
          u.createdAt || new Date().toISOString(),
          u.updatedAt || new Date().toISOString()
        )
        .run();
      usageMigrated++;
    }

    // 7. Support Tickets
    for (const t of schema.supportTickets || []) {
      await d1
        .prepare(`
          INSERT OR IGNORE INTO support_tickets (
            id, user_id, user_name, user_email, subject, message, status, admin_reply, replied_at, replied_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          t.id,
          t.userId,
          t.userName,
          t.userEmail,
          t.subject,
          t.message,
          t.status || 'open',
          t.adminReply || null,
          t.repliedAt || null,
          t.repliedBy || null,
          t.createdAt || new Date().toISOString()
        )
        .run();
      ticketsMigrated++;
    }

    // 8. Admin Settings / Banned Admins
    if (schema.adminSettings?.bannedAdmins) {
      for (const b of schema.adminSettings.bannedAdmins) {
        await d1
          .prepare(`
            INSERT OR REPLACE INTO banned_admins (admin_name, banned_at, expires_at, banned_by)
            VALUES (?, ?, ?, ?)
          `)
          .bind(b.adminName, b.bannedAt, b.expiresAt, b.bannedBy || null)
          .run();
      }
    }

    // 9. Admin Logs
    for (const l of schema.adminLogs || []) {
      await d1
        .prepare(`
          INSERT OR IGNORE INTO admin_logs (id, admin_name, ip, action, details, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(l.id, l.adminName, l.ip, l.action, l.details || null, l.timestamp)
        .run();
      logsMigrated++;
    }

    return {
      usersMigrated,
      conversationsMigrated,
      messagesMigrated,
      memoriesMigrated,
      filesMigrated,
      usageMigrated,
      ticketsMigrated,
      logsMigrated,
    };
  },

  /**
   * Distributed Lock Acquisition for Cloud Run & Multi-Instance Schedulers
   */
  async acquireLock(
    d1: D1Database,
    lockName: string,
    lockedBy: string,
    durationMs: number = 300000
  ): Promise<{ acquired: boolean; currentHolder?: string; expiresAt?: number }> {
    const now = Date.now();
    const expiresAt = now + durationMs;

    try {
      // Ensure system_locks table exists
      await d1.exec(`
        CREATE TABLE IF NOT EXISTS system_locks (
          lock_name TEXT PRIMARY KEY,
          locked_by TEXT NOT NULL,
          acquired_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
      `);

      // Clean expired locks lazily or check current holder
      const current = await d1
        .prepare('SELECT locked_by, expires_at FROM system_locks WHERE lock_name = ?')
        .bind(lockName)
        .first<{ locked_by: string; expires_at: number }>();

      if (current && current.expires_at > now && current.locked_by !== lockedBy) {
        return {
          acquired: false,
          currentHolder: current.locked_by,
          expiresAt: current.expires_at,
        };
      }

      await d1
        .prepare(`
          INSERT INTO system_locks (lock_name, locked_by, acquired_at, expires_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(lock_name) DO UPDATE SET
            locked_by = excluded.locked_by,
            acquired_at = excluded.acquired_at,
            expires_at = excluded.expires_at
        `)
        .bind(lockName, lockedBy, now, expiresAt)
        .run();

      return { acquired: true, expiresAt };
    } catch (err: any) {
      console.warn(`[System Lock] Notice during acquireLock(${lockName}):`, err?.message || err);
      return { acquired: true, expiresAt };
    }
  },

  /**
   * Releases distributed lock
   */
  async releaseLock(d1: D1Database, lockName: string, lockedBy: string): Promise<boolean> {
    try {
      await d1
        .prepare('DELETE FROM system_locks WHERE lock_name = ? AND locked_by = ?')
        .bind(lockName, lockedBy)
        .run();
      return true;
    } catch (err: any) {
      console.warn(`[System Lock] Notice during releaseLock(${lockName}):`, err?.message || err);
      return false;
    }
  },
};

/**
 * Creates a D1Database interface adapter backed by the Cloudflare D1 REST API.
 * Enables Node.js server, CI, and local scripts to interact seamlessly with Cloudflare D1.
 */
export function createD1HttpClient(config: {
  accountId: string;
  databaseId: string;
  apiToken: string;
}): D1Database {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

  async function executeQuery(sql: string, params: any[] = []): Promise<any> {
    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql, params }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          // Do not leak secrets in error
          const sanitizedErr = errText.replace(new RegExp(config.apiToken, 'g'), '[REDACTED]');
          if (res.status >= 500 && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
            continue;
          }
          throw new DatabaseUnavailableError(`Cloudflare D1 HTTP Error [${res.status}]: ${sanitizedErr}`);
        }

        const body = (await res.json()) as any;
        if (!body.success) {
          const msg = body.errors?.map((e: any) => e.message).join(', ') || 'Unknown D1 error';
          throw new Error(`Cloudflare D1 Query Failed: ${msg}`);
        }

        return body.result?.[0] || { results: [], success: true, meta: {} };
      } catch (err: any) {
        lastError = err;
        if (err?.name === 'AbortError' || err?.code === 'ETIMEDOUT') {
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
          throw new DatabaseUnavailableError('Cloudflare D1 request timed out.');
        }
        if (err instanceof DatabaseUnavailableError) {
          throw err;
        }
        if (attempt < maxRetries && /network|fetch|ECONNRESET|ETIMEDOUT/i.test(err?.message || '')) {
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
          continue;
        }
        break;
      }
    }

    if (lastError instanceof DatabaseUnavailableError) {
      throw lastError;
    }
    const cleanMsg = (lastError?.message || 'Database connection error').replace(new RegExp(config.apiToken, 'g'), '[REDACTED]');
    throw new DatabaseUnavailableError(cleanMsg);
  }

  function createStatement(query: string, boundParams: any[] = []): D1PreparedStatement {
    return {
      bind(...values: any[]) {
        return createStatement(query, values);
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const result = await executeQuery(query, boundParams);
        const firstRow = result.results?.[0];
        if (!firstRow) return null;
        if (colName) return firstRow[colName] ?? null;
        return firstRow as T;
      },
      async all<T = unknown>(): Promise<{ results: T[]; meta: any }> {
        const result = await executeQuery(query, boundParams);
        return {
          results: (result.results || []) as T[],
          meta: result.meta || {},
        };
      },
      async run(): Promise<{ meta: { changes?: number; last_row_id?: number } }> {
        const result = await executeQuery(query, boundParams);
        return {
          meta: {
            changes: result.meta?.changes ?? result.meta?.rows_written ?? 0,
            last_row_id: result.meta?.last_row_id,
          },
        };
      },
    };
  }

  return {
    prepare(query: string) {
      return createStatement(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<any[]> {
      const results: any[] = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
    async exec(query: string): Promise<any> {
      return executeQuery(query);
    },
  };
}
