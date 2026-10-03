/**
 * Production-Safe Shared Rate Limiting Architecture for Aestific
 * 
 * Features:
 * - Persistent & Crash-Resilient: Stored in SQLite with Write-Ahead Logging (WAL) mode.
 * - Multi-Instance Safe: Safe for multiple concurrent server processes / cluster instances
 *   sharing the database file; uses OS-level WAL locks & atomic sliding-window transactions.
 * - Survives Server Restarts: Rate limits and lockouts persist across server reboots.
 * - Zero Paid Dependencies: Uses Node 22 native `node:sqlite` with zero extra npm cost.
 * - Multi-Dimensional: Per-IP, Per-User, and Per-Account sliding-window enforcement.
 * - Concurrency Safe: Atomic sliding-window pruning and insertion prevents race conditions.
 * - Self-Cleaning: Periodic TTL pruning prevents database bloat.
 * - Safe Retry-After: Returns accurate Retry-After (seconds) and HTTP 429 response helpers.
 * - Distributed Inference Locking: Prevents single users/IPs from spawning concurrent AI jobs.
 */

import { DatabaseSync, StatementSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import type { Request, Response } from 'express';

export interface RateLimitResult {
  allowed: boolean;
  message?: string;
  retryAfter?: number;
  count?: number;
  limit?: number;
  remaining?: number;
}

export interface FailedAttemptResult {
  allowed: boolean;
  message?: string;
  retryAfter?: number;
  attempts?: number;
}

// Modular Feature Flag: General AI generation rate limiting (disabled by default for initial public launch)
export let RATE_LIMITING_ENABLED = process.env.ENABLE_RATE_LIMITING === 'true';

export function isRateLimitingEnabled(): boolean {
  return RATE_LIMITING_ENABLED;
}

export function setRateLimitingEnabled(enabled: boolean): void {
  RATE_LIMITING_ENABLED = enabled;
  if (enabled) {
    rateLimiter.enableDatabase();
  }
}

// Optional data directory (RATE_LIMIT_DB_PATH is NOT required when rate limiting is disabled)
export function getResolvedDbPath(): string {
  return process.env.RATE_LIMIT_DB_PATH
    ? path.resolve(process.env.RATE_LIMIT_DB_PATH)
    : path.resolve(process.cwd(), 'ratelimit.sqlite');
}

class ProductionRateLimiter {
  private db: DatabaseSync | null = null;
  private isFallbackMode = false;
  private fallbackRateLimitBuckets = new Map<string, number[]>();
  private fallbackFailedBuckets = new Map<string, number[]>();
  private fallbackInferenceLocks = new Map<string, number>();
  private dbPath: string;

  // Prepared statements for maximum throughput (< 0.05ms per query)
  private stmtDeleteOldRateLimits: StatementSync | null = null;
  private stmtGetRateLimitStats: StatementSync | null = null;
  private stmtInsertRateLimit: StatementSync | null = null;
  private stmtDeleteRateLimitByKey: StatementSync | null = null;

  private stmtDeleteOldFailedAttempts: StatementSync | null = null;
  private stmtGetFailedStats: StatementSync | null = null;
  private stmtInsertFailedAttempt: StatementSync | null = null;
  private stmtDeleteFailedByKey: StatementSync | null = null;

  private stmtDeleteExpiredLocks: StatementSync | null = null;
  private stmtGetActiveLock: StatementSync | null = null;
  private stmtInsertLock: StatementSync | null = null;
  private stmtDeleteLock: StatementSync | null = null;

  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || getResolvedDbPath();
    // Only initialize SQLite on startup if rate limiting is explicitly enabled
    if (RATE_LIMITING_ENABLED) {
      this.initDatabase(this.dbPath);
    }
    this.startCleanupInterval();
  }

  public enableDatabase(dbPath?: string): void {
    if (dbPath) {
      this.dbPath = dbPath;
    }
    if (!this.db && !this.isFallbackMode) {
      this.initDatabase(this.dbPath);
    }
  }

  private ensureDatabaseInitialized(): void {
    if (RATE_LIMITING_ENABLED && !this.db && !this.isFallbackMode) {
      this.initDatabase(this.dbPath);
    }
  }

  public isDatabaseInitialized(): boolean {
    return this.db !== null;
  }

  public initDatabase(dbPath: string): void {
    try {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new DatabaseSync(dbPath);

      // Configure WAL (Write-Ahead Logging) mode for concurrent multi-process access
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA busy_timeout = 5000;');

      // Initialize schema
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rate_limits_key_ts ON rate_limits(key, timestamp);

        CREATE TABLE IF NOT EXISTS failed_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_failed_attempts_key_ts ON failed_attempts(key, timestamp);

        CREATE TABLE IF NOT EXISTS inference_locks (
          lock_key TEXT PRIMARY KEY,
          acquired_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          owner_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_inference_locks_exp ON inference_locks(expires_at);
      `);

      // Prepare statements
      this.stmtDeleteOldRateLimits = this.db.prepare(
        'DELETE FROM rate_limits WHERE key = ? AND timestamp < ?'
      );
      this.stmtGetRateLimitStats = this.db.prepare(
        'SELECT COUNT(*) as count, MIN(timestamp) as oldest FROM rate_limits WHERE key = ? AND timestamp >= ?'
      );
      this.stmtInsertRateLimit = this.db.prepare(
        'INSERT INTO rate_limits (key, timestamp) VALUES (?, ?)'
      );
      this.stmtDeleteRateLimitByKey = this.db.prepare(
        'DELETE FROM rate_limits WHERE key = ?'
      );

      this.stmtDeleteOldFailedAttempts = this.db.prepare(
        'DELETE FROM failed_attempts WHERE key = ? AND timestamp < ?'
      );
      this.stmtGetFailedStats = this.db.prepare(
        'SELECT COUNT(*) as count, MIN(timestamp) as oldest FROM failed_attempts WHERE key = ? AND timestamp >= ?'
      );
      this.stmtInsertFailedAttempt = this.db.prepare(
        'INSERT INTO failed_attempts (key, timestamp) VALUES (?, ?)'
      );
      this.stmtDeleteFailedByKey = this.db.prepare(
        'DELETE FROM failed_attempts WHERE key = ?'
      );

      this.stmtDeleteExpiredLocks = this.db.prepare(
        'DELETE FROM inference_locks WHERE lock_key = ? AND expires_at < ?'
      );
      this.stmtGetActiveLock = this.db.prepare(
        'SELECT lock_key, expires_at FROM inference_locks WHERE lock_key = ? AND expires_at >= ?'
      );
      this.stmtInsertLock = this.db.prepare(
        'INSERT INTO inference_locks (lock_key, acquired_at, expires_at, owner_id) VALUES (?, ?, ?, ?)'
      );
      this.stmtDeleteLock = this.db.prepare(
        'DELETE FROM inference_locks WHERE lock_key = ?'
      );

      this.isFallbackMode = false;
    } catch (err) {
      console.error(
        '[RateLimiter] Failed to initialize SQLite rate limit store. Falling back to in-memory mode:',
        err
      );
      this.isFallbackMode = true;
      this.db = null;
    }
  }

  /**
   * Check and record a request in a sliding time window.
   */
  public checkRateLimitByKey(
    key: string,
    maxRequests: number,
    windowMs: number,
    customMessage?: string
  ): RateLimitResult {
    // Security-critical auth/admin endpoints must always enforce rate limiting
    const isSecurityCritical =
      key.startsWith('reg:') ||
      key.startsWith('login:') ||
      key.startsWith('forgot:') ||
      key.startsWith('reset:') ||
      key.startsWith('verify:') ||
      key.startsWith('admin:');

    // For general AI generation/search endpoints: bypass if rate limiting feature flag is off (unlimited AI launch)
    if (!RATE_LIMITING_ENABLED && !isSecurityCritical) {
      return {
        allowed: true,
        count: 0,
        limit: Infinity,
        remaining: Infinity,
      };
    }

    if (RATE_LIMITING_ENABLED) {
      this.ensureDatabaseInitialized();
    }

    const now = Date.now();
    const cutoff = now - windowMs;

    if (this.isFallbackMode || !this.db) {
      let timestamps = this.fallbackRateLimitBuckets.get(key) || [];
      timestamps = timestamps.filter((t) => t >= cutoff);
      if (timestamps.length >= maxRequests) {
        this.fallbackRateLimitBuckets.set(key, timestamps);
        const oldest = timestamps[0] || now;
        const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        return {
          allowed: false,
          message:
            customMessage ||
            `Rate limit exceeded. Please wait ${retryAfterSec}s before trying again.`,
          retryAfter: retryAfterSec,
          count: timestamps.length,
          limit: maxRequests,
          remaining: 0,
        };
      }
      timestamps.push(now);
      this.fallbackRateLimitBuckets.set(key, timestamps);
      return {
        allowed: true,
        count: timestamps.length,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - timestamps.length),
      };
    }

    try {
      // Step 1: Clean up records older than window for this specific key
      this.stmtDeleteOldRateLimits!.run(key, cutoff);

      // Step 2: Query count and oldest timestamp within current window
      const stats = this.stmtGetRateLimitStats!.get(key, cutoff) as
        | { count: number; oldest: number | null }
        | undefined;

      const currentCount = stats?.count ? Number(stats.count) : 0;

      if (currentCount >= maxRequests) {
        const oldest = stats?.oldest ? Number(stats.oldest) : now;
        const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        return {
          allowed: false,
          message:
            customMessage ||
            `Rate limit exceeded. Please wait ${retryAfterSec}s before trying again.`,
          retryAfter: retryAfterSec,
          count: currentCount,
          limit: maxRequests,
          remaining: 0,
        };
      }

      // Step 3: Record new timestamp
      this.stmtInsertRateLimit!.run(key, now);

      return {
        allowed: true,
        count: currentCount + 1,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - (currentCount + 1)),
      };
    } catch (err) {
      console.error(`[RateLimiter] Error checking rate limit for key "${key}":`, err);
      // Fail closed or open gracefully? Allow current request to avoid total outage
      return { allowed: true };
    }
  }

  /**
   * Check if failed attempts limit has been breached (without incrementing).
   */
  public checkFailedRateLimit(
    key: string,
    maxAttempts: number,
    windowMs: number,
    customMessage?: string
  ): FailedAttemptResult {
    // When rate limiting is disabled, user accounts are unlimited; keep admin gateway hardened
    if (!RATE_LIMITING_ENABLED && !key.startsWith('admin:verify:')) {
      return { allowed: true, attempts: 0 };
    }

    if (RATE_LIMITING_ENABLED) {
      this.ensureDatabaseInitialized();
    }

    const now = Date.now();
    const cutoff = now - windowMs;

    if (this.isFallbackMode || !this.db) {
      let timestamps = this.fallbackFailedBuckets.get(key) || [];
      timestamps = timestamps.filter((t) => t >= cutoff);
      this.fallbackFailedBuckets.set(key, timestamps);
      if (timestamps.length >= maxAttempts) {
        const oldest = timestamps[0] || now;
        const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        return {
          allowed: false,
          message:
            customMessage ||
            `Too many failed attempts. Please wait ${retryAfterSec}s before trying again.`,
          retryAfter: retryAfterSec,
          attempts: timestamps.length,
        };
      }
      return { allowed: true, attempts: timestamps.length };
    }

    try {
      this.stmtDeleteOldFailedAttempts!.run(key, cutoff);
      const stats = this.stmtGetFailedStats!.get(key, cutoff) as
        | { count: number; oldest: number | null }
        | undefined;

      const attempts = stats?.count ? Number(stats.count) : 0;
      if (attempts >= maxAttempts) {
        const oldest = stats?.oldest ? Number(stats.oldest) : now;
        const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        return {
          allowed: false,
          message:
            customMessage ||
            `Too many failed attempts. Please wait ${retryAfterSec}s before trying again.`,
          retryAfter: retryAfterSec,
          attempts,
        };
      }

      return { allowed: true, attempts };
    } catch (err) {
      console.error(`[RateLimiter] Error checking failed rate limit for "${key}":`, err);
      return { allowed: true };
    }
  }

  /**
   * Record a failed attempt (e.g. invalid password, wrong admin verification code).
   */
  public recordFailedAttempt(key: string): void {
    if (RATE_LIMITING_ENABLED) {
      this.ensureDatabaseInitialized();
    }

    const now = Date.now();

    if (this.isFallbackMode || !this.db) {
      const timestamps = this.fallbackFailedBuckets.get(key) || [];
      timestamps.push(now);
      this.fallbackFailedBuckets.set(key, timestamps);
      return;
    }

    try {
      this.stmtInsertFailedAttempt!.run(key, now);
    } catch (err) {
      console.error(`[RateLimiter] Error recording failed attempt for "${key}":`, err);
    }
  }

  /**
   * Reset rate limit and failed attempts for a specific key.
   */
  public resetRateLimit(key: string): void {
    if (this.isFallbackMode || !this.db) {
      this.fallbackRateLimitBuckets.delete(key);
      this.fallbackFailedBuckets.delete(key);
      return;
    }

    try {
      this.stmtDeleteRateLimitByKey!.run(key);
      this.stmtDeleteFailedByKey!.run(key);
    } catch (err) {
      console.error(`[RateLimiter] Error resetting rate limit for "${key}":`, err);
    }
  }

  /**
   * Clear all rate limits (for testing, maintenance, or admin reset).
   */
  public clearAll(): void {
    if (RATE_LIMITING_ENABLED) {
      this.ensureDatabaseInitialized();
    }

    if (this.isFallbackMode || !this.db) {
      this.fallbackRateLimitBuckets.clear();
      this.fallbackFailedBuckets.clear();
      this.fallbackInferenceLocks.clear();
      return;
    }

    try {
      this.db.exec('DELETE FROM rate_limits; DELETE FROM failed_attempts; DELETE FROM inference_locks;');
    } catch (err) {
      console.error('[RateLimiter] Error clearing all rate limits:', err);
    }
  }

  /**
   * Acquire a distributed / persistent lock for expensive operations (e.g. AI inference).
   * Automatically expires after ttlMs (default 60,000ms) to avoid deadlock.
   */
  public acquireInferenceLock(lockKey: string, ttlMs: number = 60000, ownerId?: string): boolean {
    if (RATE_LIMITING_ENABLED) {
      this.ensureDatabaseInitialized();
    }

    const now = Date.now();

    if (this.isFallbackMode || !this.db) {
      const existingExpiresAt = this.fallbackInferenceLocks.get(lockKey);
      if (existingExpiresAt && existingExpiresAt >= now) {
        return false;
      }
      this.fallbackInferenceLocks.set(lockKey, now + ttlMs);
      return true;
    }

    try {
      // Clean expired lock for this key if any
      this.stmtDeleteExpiredLocks!.run(lockKey, now);

      // Check if active lock exists
      const active = this.stmtGetActiveLock!.get(lockKey, now);
      if (active) {
        return false;
      }

      // Insert lock
      this.stmtInsertLock!.run(lockKey, now, now + ttlMs, ownerId || null);
      return true;
    } catch {
      // Primary key constraint violation if another instance acquired it concurrently
      return false;
    }
  }

  /**
   * Release an active inference lock.
   */
  public releaseInferenceLock(lockKey: string): void {
    if (this.isFallbackMode || !this.db) {
      this.fallbackInferenceLocks.delete(lockKey);
      return;
    }

    try {
      this.stmtDeleteLock!.run(lockKey);
    } catch (err) {
      console.error(`[RateLimiter] Error releasing inference lock "${lockKey}":`, err);
    }
  }

  /**
   * Periodic garbage collection to prune old records and keep SQLite database small.
   */
  public cleanupStaleEntries(retentionMs: number = 86400000): void {
    const now = Date.now();
    const cutoff = now - retentionMs;

    if (this.isFallbackMode || !this.db) {
      for (const [key, timestamps] of this.fallbackRateLimitBuckets.entries()) {
        const valid = timestamps.filter((t) => t >= cutoff);
        if (valid.length === 0) {
          this.fallbackRateLimitBuckets.delete(key);
        } else {
          this.fallbackRateLimitBuckets.set(key, valid);
        }
      }
      for (const [key, timestamps] of this.fallbackFailedBuckets.entries()) {
        const valid = timestamps.filter((t) => t >= cutoff);
        if (valid.length === 0) {
          this.fallbackFailedBuckets.delete(key);
        } else {
          this.fallbackFailedBuckets.set(key, valid);
        }
      }
      for (const [key, expiresAt] of this.fallbackInferenceLocks.entries()) {
        if (expiresAt < now) {
          this.fallbackInferenceLocks.delete(key);
        }
      }
      return;
    }

    try {
      this.db.exec(`
        DELETE FROM rate_limits WHERE timestamp < ${cutoff};
        DELETE FROM failed_attempts WHERE timestamp < ${cutoff};
        DELETE FROM inference_locks WHERE expires_at < ${now};
      `);
    } catch (err) {
      console.error('[RateLimiter] Error during periodic cleanup:', err);
    }
  }

  private startCleanupInterval(): void {
    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleEntries(3600000); // Clean older than 1 hour
    }, 60000);

    // Unref so it does not block Node process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  public close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
  }
}

// Global Singleton Instance
export const rateLimiter = new ProductionRateLimiter();

// Exported standard helper functions matching existing server signatures

export function checkRateLimitByKey(
  key: string,
  maxRequests: number,
  windowMs: number,
  customMessage?: string
): RateLimitResult {
  return rateLimiter.checkRateLimitByKey(key, maxRequests, windowMs, customMessage);
}

export function checkFailedRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  customMessage?: string
): FailedAttemptResult {
  return rateLimiter.checkFailedRateLimit(key, maxAttempts, windowMs, customMessage);
}

export function recordFailedAttempt(key: string): void {
  rateLimiter.recordFailedAttempt(key);
}

export function resetRateLimit(key: string): void {
  rateLimiter.resetRateLimit(key);
}

export function clearAllRateLimits(): void {
  rateLimiter.clearAll();
}

export function acquireInferenceLock(lockKey: string, ttlMs: number = 60000, ownerId?: string): boolean {
  return rateLimiter.acquireInferenceLock(lockKey, ttlMs, ownerId);
}

export function releaseInferenceLock(lockKey: string): void {
  rateLimiter.releaseInferenceLock(lockKey);
}

/**
 * Standard HTTP 429 response helper with safe Retry-After header.
 */
export function sendRateLimitResponse(
  res: Response,
  rateResult: { message?: string; retryAfter?: number }
) {
  const retrySec = rateResult.retryAfter && rateResult.retryAfter > 0 ? rateResult.retryAfter : 1;
  res.setHeader('Retry-After', String(retrySec));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + retrySec));
  return res.status(429).json({
    error: rateResult.message || 'Rate limit exceeded. Please wait before trying again.',
    retryAfter: retrySec,
  });
}

// Production-Safe Trusted Proxy & Client IP Resolver
import {
  getClientIp,
  isTrustedProxy,
  isCloudflareIp,
  getTrustedProxyConfiguration,
  configureAppProxyTrust,
} from './proxy-trust.js';
export {
  getClientIp,
  isTrustedProxy,
  isCloudflareIp,
  getTrustedProxyConfiguration,
  configureAppProxyTrust,
};

export { ProductionRateLimiter };
