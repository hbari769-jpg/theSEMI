import { Request, Response, NextFunction, CookieOptions } from 'express';
import type { ParamsDictionary, Query } from 'express-serve-static-core';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, User } from './db.js';
import { DEFAULT_MODEL_ID } from './models.js';

export const TOKEN_COOKIE_NAME = 'aestific_token';
export const AUTH_COOKIE_NAME = 'aestific_token';

export const USER_SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days persistent sliding session
export const USER_TOKEN_EXPIRES_IN = '30d';

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: USER_SESSION_MAX_AGE,
};

/**
 * Returns whether the response is served in a secure context (production or HTTPS).
 */
export function isResponseSecure(res: Response): boolean {
  const req = (res as any).req as Request | undefined;
  if (req) {
    const host = (req.headers?.host || '').toLowerCase();
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('::1');
    const proto = (req.headers?.['x-forwarded-proto'] || '').toString().toLowerCase();
    const isHttps = Boolean(req.secure || proto === 'https');
    if (isLocal && !isHttps) {
      return false;
    }
    if (isHttps) {
      return true;
    }
  }
  return process.env.NODE_ENV === 'production';
}

export function setAuthCookies(res: Response, token: string, customOptions?: CookieOptions) {
  const isSecure = isResponseSecure(res);
  const options: CookieOptions = {
    ...AUTH_COOKIE_OPTIONS,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    partitioned: isSecure ? true : undefined,
    ...customOptions,
  };
  res.cookie(TOKEN_COOKIE_NAME, token, options);
}

export function clearAuthCookies(res: Response) {
  const isSecure = isResponseSecure(res);
  const options: CookieOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    partitioned: isSecure ? true : undefined,
    path: '/',
  };
  res.clearCookie(TOKEN_COOKIE_NAME, options);
}

export interface TokenCandidate {
  token: string;
  source: 'header' | 'cookie' | 'query';
}

export function extractAuthTokenCandidates(req: Request, allowQuery: boolean = false): TokenCandidate[] {
  const candidates: TokenCandidate[] = [];

  // 0. Dedicated X-Admin-Token header (elevated in-memory admin session token)
  const adminTokenHeader = req.headers?.['x-admin-token'];
  if (typeof adminTokenHeader === 'string') {
    const raw = adminTokenHeader.trim();
    if (raw && raw !== 'null' && raw !== 'undefined') {
      candidates.push({ token: raw, source: 'header' });
    }
  }

  // 1. Authorization: Bearer <token> (explicit client-provided header takes priority)
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim();
    if (raw && raw !== 'null' && raw !== 'undefined' && !candidates.some((c) => c.token === raw)) {
      candidates.push({ token: raw, source: 'header' });
    }
  }

  // 2. HttpOnly Cookie session
  const cookieVal = req.cookies?.[TOKEN_COOKIE_NAME];
  if (typeof cookieVal === 'string') {
    const raw = cookieVal.trim();
    if (raw && raw !== 'null' && raw !== 'undefined' && !candidates.some((c) => c.token === raw)) {
      candidates.push({ token: raw, source: 'cookie' });
    }
  }

  // 3. Optional URL query token (only allowed on specific media streaming GET routes)
  if (allowQuery && typeof req.query?.token === 'string') {
    const raw = req.query.token.trim();
    if (raw && raw !== 'null' && raw !== 'undefined' && !candidates.some((c) => c.token === raw)) {
      candidates.push({ token: raw, source: 'query' });
    }
  }

  return candidates;
}

// Insecure development / placeholder secrets that must NEVER be used in production
const INSECURE_DEV_SECRETS = new Set([
  'secret',
  'dev_secret',
  'jwt_secret',
  'change_me',
  'changeme',
  'default',
  'test',
  'test_secret',
  '123456',
  'password',
  'aestific_secret',
  'todo',
  'placeholder',
  'admin',
  'root',
  'sample',
]);

export function isDevPlaceholderSecret(val: string): boolean {
  if (!val) return true;
  const lower = val.trim().toLowerCase();
  return (
    lower.startsWith('my_') ||
    lower.startsWith('your_') ||
    lower.startsWith('enter_') ||
    lower.startsWith('placeholder') ||
    lower.startsWith('change_me') ||
    lower.startsWith('changeme') ||
    lower.startsWith('dev_') ||
    lower.startsWith('test_') ||
    lower.startsWith('sample_') ||
    INSECURE_DEV_SECRETS.has(lower)
  );
}

export const MIN_JWT_SECRET_LENGTH = 16;

export interface JwtValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Single source of truth for validating JWT_SECRET configuration across the system.
 * Enforces production authentication security requirements without leaking secret values.
 *
 * Requirements:
 * 1. In NODE_ENV=production, JWT_SECRET is strictly mandatory.
 * 2. Missing, empty, or whitespace-only values fail validation.
 * 3. Secrets shorter than MIN_JWT_SECRET_LENGTH (16 characters) fail validation.
 * 4. Known development placeholders fail validation.
 * 5. Secret values are NEVER included in error messages or logs.
 */
export function validateJwtConfiguration(options?: { isProduction?: boolean }): JwtValidationResult {
  const isProduction = options?.isProduction !== undefined
    ? options.isProduction
    : process.env.NODE_ENV === 'production';

  const rawSecret = process.env.JWT_SECRET;
  const secret = rawSecret ? rawSecret.trim() : '';

  if (!secret) {
    return {
      valid: false,
      error: 'CRITICAL PRODUCTION ERROR: JWT_SECRET environment variable is required in production.',
    };
  }

  if (isDevPlaceholderSecret(secret)) {
    return {
      valid: false,
      error: 'CRITICAL PRODUCTION ERROR: Insecure placeholder JWT_SECRET detected in production.',
    };
  }

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    return {
      valid: false,
      error: `CRITICAL PRODUCTION ERROR: JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production.`,
    };
  }

  return { valid: true };
}

// Ephemeral or persistent runtime fallback if process.env.JWT_SECRET is missing.
let devEphemeralSecret: string | null = null;
const JWT_SECRET_FILE = path.resolve(process.cwd(), '.jwt_secret');

export function getJwtSecret(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const validation = validateJwtConfiguration({ isProduction });

  if (isProduction) {
    if (!validation.valid) {
      throw new Error(validation.error || 'CRITICAL PRODUCTION ERROR: JWT_SECRET configuration is invalid in production.');
    }
    return process.env.JWT_SECRET!.trim();
  }

  // Development / Test or unconfigured production fallback:
  const rawSecret = process.env.JWT_SECRET;
  const secret = rawSecret ? rawSecret.trim() : '';

  if (secret && !isDevPlaceholderSecret(secret) && secret.length >= MIN_JWT_SECRET_LENGTH) {
    return secret;
  }

  // Persistent fallback secret stored in .jwt_secret to preserve user sessions across dev reboots
  if (!devEphemeralSecret) {
    try {
      if (fs.existsSync(JWT_SECRET_FILE)) {
        const stored = fs.readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
        if (stored && stored.length >= MIN_JWT_SECRET_LENGTH) {
          devEphemeralSecret = stored;
          return devEphemeralSecret;
        }
      }
      const newSecret = crypto.randomBytes(64).toString('hex');
      fs.writeFileSync(JWT_SECRET_FILE, newSecret, 'utf-8');
      devEphemeralSecret = newSecret;
    } catch {
      devEphemeralSecret = crypto.randomBytes(64).toString('hex');
    }
    console.log('[AUTH] Using persistent session secret from .jwt_secret');
  }

  return devEphemeralSecret;
}

export interface AuthRequest<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = Query
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: User;
  adminCandidate?: User;
  admin?: {
    adminName: string;
    isAdmin: boolean;
  };
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export function hashPasswordSync(password: string): string {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

export async function verifyPasswordMatch(
  plainPassword: string,
  storedHash: string
): Promise<{ isValid: boolean; needsRehash: boolean }> {
  if (!plainPassword || !storedHash) {
    return { isValid: false, needsRehash: false };
  }

  // 1. Standard bcrypt hash check ($2a$, $2b$, $2y$)
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    try {
      const isValid = await bcrypt.compare(plainPassword, storedHash);
      return { isValid, needsRehash: false };
    } catch {
      return { isValid: false, needsRehash: false };
    }
  }

  // 2. Legacy Plaintext comparison (failsafe fallback)
  if (plainPassword === storedHash) {
    return { isValid: true, needsRehash: true };
  }

  return { isValid: false, needsRehash: false };
}

export function generateAdminToken(
  adminUser: { id: string; email: string; name?: string; role?: string },
  callSign?: string
): { token: string; jti: string; expiresIn: number } {
  if (!adminUser || !adminUser.id || !adminUser.email || !isAuthorizedAdminEmail(adminUser.email)) {
    throw new Error('Admin session creation requires an authenticated admin identity.');
  }
  const secret = getJwtSecret();
  const jti = crypto.randomUUID();
  const effectiveAdminName = (callSign && callSign.trim()) || adminUser.name || adminUser.email;

  // Clear any past user logout cutoff when a fresh session is legitimately minted
  userAdminLogoutTimestamps.delete(adminUser.id);

  const token = jwt.sign(
    {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name || effectiveAdminName,
      adminName: effectiveAdminName,
      isAdmin: true,
      role: 'admin',
      jti,
    },
    secret,
    { expiresIn: '1h' } // Short-lived admin session: 1 hour max
  );
  return { token, jti, expiresIn: 3600 };
}

export function generateToken(user: User, sessionId?: string): string {
  const secret = getJwtSecret();
  const isAdmin = isAuthorizedAdminEmail(user.email);
  const sid = sessionId || crypto.randomUUID();
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: isAdmin ? 'admin' : 'user',
      sid,
      jti: sid,
    },
    secret,
    { expiresIn: USER_TOKEN_EXPIRES_IN }
  );
}

// -------------------------------------------------------------
// Passwordless Admin Mode is strictly disabled (Admin Panel is always locked)
// -------------------------------------------------------------
export function enablePasswordlessAdminMode(_durationMinutes = 60): number {
  return 0;
}

export function isPasswordlessAdminModeActive(): boolean {
  return false;
}

export function getPasswordlessAdminModeExpiry(): number {
  return 0;
}

export function disablePasswordlessAdminMode(): void {
  // Always disabled
}

export function createAdminStepToken(userId: string, completedStep: number): string {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      purpose: 'admin_step_progression',
      userId,
      completedStep,
      nonce: crypto.randomUUID(),
    },
    secret,
    { expiresIn: '5m' }
  );
}

export function verifyAdminStepToken(
  token: string | undefined,
  userId: string,
  expectedCompletedStep: number
): boolean {
  if (!token || typeof token !== 'string') return false;
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret) as {
      purpose?: string;
      userId?: string;
      completedStep?: number;
    };
    return (
      payload?.purpose === 'admin_step_progression' &&
      payload?.userId === userId &&
      payload?.completedStep === expectedCompletedStep
    );
  } catch {
    return false;
  }
}

export function isAuthorizedAdminEmail(email?: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return false;

  const configured = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter((e) => Boolean(e) && !isDevPlaceholderSecret(e));

  // When ADMIN_EMAILS is not explicitly configured, any authenticated account can attempt the 5-step secret password lock
  if (configured.length === 0) {
    return true;
  }

  return configured.includes(cleanEmail);
}

// -------------------------------------------------------------
// Admin Session Revocation and Invalidation Tracker
// -------------------------------------------------------------
const revokedAdminJtis = new Set<string>();
const userAdminLogoutTimestamps = new Map<string, number>();
const bannedAdminNameInvalidations = new Map<string, number>();

export function revokeAdminSession(jti?: string, userId?: string) {
  if (jti) {
    revokedAdminJtis.add(jti);
  }
  if (userId) {
    // Invalidate any admin sessions issued before current timestamp
    userAdminLogoutTimestamps.set(userId, Math.floor(Date.now() / 1000));
  }
}

export function revokeAdminByName(adminName: string) {
  if (adminName && typeof adminName === 'string') {
    bannedAdminNameInvalidations.set(adminName.toLowerCase().trim(), Math.floor(Date.now() / 1000));
  }
}

export function isSessionRevoked(jti?: string, userId?: string, iat?: number, adminName?: string): boolean {
  if (jti && revokedAdminJtis.has(jti)) {
    return true;
  }
  if (userId && iat !== undefined) {
    const logoutSec = userAdminLogoutTimestamps.get(userId);
    if (logoutSec !== undefined && iat <= logoutSec) {
      return true;
    }
  }
  if (adminName && iat !== undefined) {
    const banSec = bannedAdminNameInvalidations.get(adminName.toLowerCase().trim());
    if (banSec !== undefined && iat <= banSec) {
      return true;
    }
  }
  return false;
}

// -------------------------------------------------------------
// User Session Revocation and Invalidation Tracker (Separate from Admin)
// -------------------------------------------------------------
const revokedUserSessionIds = new Set<string>();
const userLogoutTimestamps = new Map<string, number>();

export function revokeUserSession(sessionId?: string, userId?: string) {
  if (sessionId) {
    revokedUserSessionIds.add(sessionId);
  }
  if (userId) {
    // Invalidate any user sessions issued at or before current timestamp
    userLogoutTimestamps.set(userId, Math.floor(Date.now() / 1000));
  }
}

export function isUserSessionRevoked(sessionId?: string, userId?: string, iat?: number): boolean {
  if (sessionId && revokedUserSessionIds.has(sessionId)) {
    return true;
  }
  if (userId && iat !== undefined) {
    const logoutSec = userLogoutTimestamps.get(userId);
    if (logoutSec !== undefined && iat <= logoutSec) {
      return true;
    }
  }
  return false;
}

export function clearUserLogoutTimestamp(userId: string) {
  userLogoutTimestamps.delete(userId);
}

// -------------------------------------------------------------
// Sequential Admin Step Verification Tracker
// Prevents out-of-order execution, replay, and expired steps
// -------------------------------------------------------------
export interface VerificationSession {
  userId: string;
  email: string;
  completedStep: number;
  createdAt: number;
  lastStepAt: number;
  expiresAt: number;
}

const verificationSessions = new Map<string, VerificationSession>();

export function getVerificationSession(userId: string): VerificationSession | undefined {
  const session = verificationSessions.get(userId);
  if (!session) return undefined;
  if (Date.now() > session.expiresAt) {
    verificationSessions.delete(userId);
    return undefined;
  }
  return session;
}

export function startVerificationSession(userId: string, email: string): VerificationSession {
  const session: VerificationSession = {
    userId,
    email,
    completedStep: 1,
    createdAt: Date.now(),
    lastStepAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes TTL for sequence completion
  };
  verificationSessions.set(userId, session);
  return session;
}

export function advanceVerificationSession(userId: string, step: number): boolean {
  const session = getVerificationSession(userId);
  if (!session) return false;
  session.completedStep = step;
  session.lastStepAt = Date.now();
  return true;
}

export function deleteVerificationSession(userId: string): void {
  verificationSessions.delete(userId);
}

export async function verifyAdminSession(token?: string): Promise<{ active: boolean; adminName?: string }> {
  if (!token) return { active: false };
  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret) as {
      adminName?: string;
      isAdmin?: boolean;
      role?: string;
      id?: string;
      email?: string;
      name?: string;
      jti?: string;
      iat?: number;
      exp?: number;
    };
    const banCheckAdmin = await db.isBannedAdmin(payload.adminName || '');
    const banCheckEmail = await db.isBannedAdmin(payload.email || '');
    if (
      payload.isAdmin &&
      isAuthorizedAdminEmail(payload.email) &&
      !isSessionRevoked(payload.jti, payload.id, payload.iat, payload.adminName) &&
      !banCheckAdmin.isBanned &&
      !banCheckEmail.isBanned
    ) {
      return {
        active: true,
        adminName: (payload.adminName || payload.name || payload.email || 'Admin').trim(),
      };
    }
    return { active: false };
  } catch {
    return { active: false };
  }
}

export async function requireAdminCandidate(req: AuthRequest, res: Response, next: NextFunction) {
  const candidates = extractAuthTokenCandidates(req, false);

  if (candidates.length === 0) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in with an administrator account.',
    });
  }

  const secret = getJwtSecret();
  let verifiedPayload: any = null;
  let verifiedUser: User | null = null;
  let isTokenExpired = false;
  let hasValidNonAdminSession = false;

  for (const candidate of candidates) {
    try {
      const payload = jwt.verify(candidate.token, secret) as {
        id?: string;
        email?: string;
        role?: string;
        name?: string;
        isAdmin?: boolean;
        adminName?: string;
        jti?: string;
        iat?: number;
        exp?: number;
      };

      if (!payload.id && !payload.email) continue;

      const email = (payload.email || '').toLowerCase().trim();

      if (!isAuthorizedAdminEmail(email)) {
        hasValidNonAdminSession = true;
        continue;
      }

      let user: User | null | undefined;
      if (payload.id) {
        user = await db.findUserById(payload.id);
      } else if (email) {
        user = await db.findUserByEmail(email);
      }
      if (!user) continue;

      verifiedPayload = payload;
      verifiedUser = user;
      break;
    } catch (err: any) {
      if (err?.name === 'TokenExpiredError') {
        isTokenExpired = true;
      }
    }
  }

  if (!verifiedPayload || !verifiedUser) {
    if (hasValidNonAdminSession) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden. Administrator credentials required.',
      });
    }
    return res.status(401).json({
      success: false,
      error: isTokenExpired ? 'Session expired. Please sign in again.' : 'Invalid authentication credentials.',
    });
  }

  if (verifiedUser.isBanned || verifiedUser.status === 'banned' || verifiedUser.status === 'suspended') {
    return res.status(403).json({
      success: false,
      error: 'Account suspended or banned.',
    });
  }

  req.user = verifiedUser;
  req.adminCandidate = verifiedUser;
  return next();
}

export async function requireElevatedAdminAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const candidates = extractAuthTokenCandidates(req, false);

  if (candidates.length === 0) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to access admin functionality.' });
  }

  const secret = getJwtSecret();
  let verifiedPayload: any = null;
  let verifiedUser: User | null = null;
  let successfulCandidate: TokenCandidate | null = null;
  let isTokenExpired = false;
  let hasValidNonElevatedSession = false;

  for (const candidate of candidates) {
    try {
      const payload = jwt.verify(candidate.token, secret) as {
        adminName?: string;
        isAdmin?: boolean;
        role?: string;
        id?: string;
        email?: string;
        name?: string;
        jti?: string;
        iat?: number;
        exp?: number;
      };

      if (!payload.id && !payload.email) continue;

      const email = (payload.email || '').toLowerCase().trim();

      if (!payload.isAdmin || !isAuthorizedAdminEmail(email)) {
        hasValidNonElevatedSession = true;
        continue;
      }

      let user: User | null | undefined;
      if (payload.id) {
        user = await db.findUserById(payload.id);
      } else if (email) {
        user = await db.findUserByEmail(email);
      }
      if (!user) continue;

      verifiedPayload = payload;
      verifiedUser = user;
      successfulCandidate = candidate;
      break;
    } catch (err: any) {
      if (err?.name === 'TokenExpiredError') {
        isTokenExpired = true;
      }
    }
  }

  if (!verifiedPayload) {
    if (hasValidNonElevatedSession) {
      return res.status(403).json({
        error: 'Forbidden. Elevated administrator session required.',
      });
    }
    return res.status(401).json({
      error: isTokenExpired
        ? 'Admin session expired. Please sign in again.'
        : 'Admin session expired or invalid credentials.',
    });
  }

  const email = (verifiedPayload.email || '').toLowerCase().trim();
  const adminName = (verifiedPayload.adminName || verifiedPayload.name || email || 'Admin').trim();

  // Check if this admin is explicitly banned
  const banCheckName = await db.isBannedAdmin(adminName);
  const banCheckEmail = await db.isBannedAdmin(email);
  const banCheck = banCheckName.isBanned ? banCheckName : banCheckEmail;
  if (banCheck.isBanned) {
    const remainingMs = (banCheck.expiresAt || 0) - Date.now();
    const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
    return res.status(403).json({
      error: 'ADMIN_BANNED',
      message: `Admin access for "${banCheckName.isBanned ? adminName : email}" is suspended. Ban expires in approx ${remainingHours} hours.`,
      expiresAt: banCheck.expiresAt,
    });
  }

  // REQUIREMENT 12: Invalidate old/revoked admin sessions
  if (isSessionRevoked(verifiedPayload.jti, verifiedPayload.id, verifiedPayload.iat, verifiedPayload.adminName)) {
    return res.status(401).json({ error: 'Admin session expired or has been revoked. Please sign in again.' });
  }

  if (verifiedUser && (verifiedUser.isBanned || verifiedUser.status === 'banned' || verifiedUser.status === 'suspended')) {
    return res.status(403).json({ error: 'Account suspended or banned.' });
  }

  // Seamless migration: If authenticated via header and is an elevated admin session, issue cookie (1 hour)
  if (successfulCandidate && successfulCandidate.source === 'header' && verifiedPayload.isAdmin) {
    setAuthCookies(res, successfulCandidate.token, { maxAge: 60 * 60 * 1000 });
  }

  req.admin = {
    adminName,
    isAdmin: true,
  };
  if (verifiedUser) {
    req.user = verifiedUser;
  }
  return next();
}

export const requireAdminAuth = requireElevatedAdminAuth;

/**
 * Retention Cleanup Authorization Middleware
 * 
 * Supports two secure authorization methods:
 * 1. Elevated Sentinel Administrator session (via cookie or Bearer token)
 * 2. Authorized Cloud Scheduler / internal Cron trigger with CRON_SECRET / RETENTION_CRON_SECRET
 *    passed in Authorization: Bearer <secret> or X-Cron-Secret: <secret>
 * 
 * Secure Invariants:
 * - Unauthenticated requests are strictly rejected with 401 Unauthorized.
 * - Non-admin user tokens are rejected with 403 Forbidden.
 * - Constant-time comparison prevents timing analysis on secrets.
 * - Zero secrets are leaked in headers or responses.
 */
export async function requireRetentionTriggerAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // 1. Check for authorized Cloud Scheduler / internal Cron secret
  const configuredSecret = (
    process.env.CRON_SECRET ||
    process.env.RETENTION_CRON_SECRET ||
    (process.env.NODE_ENV !== 'production' ? 'test_super_secure_cron_secret_32bytes!' : '')
  ).trim();
  const authHeader = req.headers.authorization || '';
  const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = (req.headers['x-cron-secret'] as string || '').trim();
  const providedSecret = headerSecret || bearerToken;

  if (configuredSecret && providedSecret && configuredSecret.length >= 16) {
    const bufProvided = Buffer.from(providedSecret);
    const bufConfigured = Buffer.from(configuredSecret);
    if (bufProvided.length === bufConfigured.length && crypto.timingSafeEqual(bufProvided, bufConfigured)) {
      req.admin = {
        adminName: 'CloudSchedulerTrigger',
        isAdmin: true,
      };
      return next();
    }
  }

  // 2. Fall back to requiring elevated Sentinel administrator session
  return requireElevatedAdminAuth(req, res, next);
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const p = req.path || req.originalUrl || req.baseUrl || '';
  const allowQuery = req.method === 'GET' && (p.includes('/api/files/download/') || p.includes('/api/files/raw/'));
  const candidates = extractAuthTokenCandidates(req, allowQuery);

  if (candidates.length === 0) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to Aestific AI.' });
  }

  const secret = getJwtSecret();
  let verifiedUser: User | null = null;
  let verifiedPayload: any = null;
  let successfulCandidate: TokenCandidate | null = null;
  let isTokenExpired = false;
  let isRevoked = false;

  for (const candidate of candidates) {
    try {
      const payload = jwt.verify(candidate.token, secret) as {
        id?: string;
        email?: string;
        isAdmin?: boolean;
        sid?: string;
        jti?: string;
        iat?: number;
        exp?: number;
      };
      if (!payload || !payload.id) continue;

      const sid = payload.sid || payload.jti;
      if (isUserSessionRevoked(sid, payload.id, payload.iat)) {
        isRevoked = true;
        continue;
      }

      const user = await db.findUserById(payload.id);
      if (!user) continue;

      verifiedUser = user;
      verifiedPayload = payload;
      successfulCandidate = candidate;
      break;
    } catch (err: any) {
      if (err?.name === 'TokenExpiredError') {
        isTokenExpired = true;
      }
    }
  }

  if (!verifiedUser || !verifiedPayload) {
    clearAuthCookies(res);
    return res.status(401).json({
      error: isRevoked
        ? 'Session has been invalidated. Please sign in again.'
        : isTokenExpired
        ? 'Session expired or invalid token. Please sign in again.'
        : 'Authentication required or session expired. Please sign in again.',
    });
  }

  if (verifiedUser.isBanned || verifiedUser.status === 'banned' || verifiedUser.status === 'suspended') {
    clearAuthCookies(res);
    return res.status(403).json({ error: 'Account suspended or banned.', reason: verifiedUser.bannedReason });
  }

  // Sliding session: If token is valid and older than 1 day (86400s), roll it forward so active users stay logged in
  const nowSec = Math.floor(Date.now() / 1000);
  const tokenAgeSec = (verifiedPayload as any).iat ? nowSec - (verifiedPayload as any).iat : 0;
  if (tokenAgeSec >= 86400) {
    const rolledToken = generateToken(verifiedUser, (verifiedPayload as any).sid || (verifiedPayload as any).jti);
    setAuthCookies(res, rolledToken);
  } else if (successfulCandidate && successfulCandidate.source === 'header') {
    setAuthCookies(res, successfulCandidate.token);
  }

  req.user = verifiedUser;

  // Throttled lastActiveAt update (at most once every 60 seconds)
  const nowMs = Date.now();
  const lastActiveMs = verifiedUser.lastActiveAt ? new Date(verifiedUser.lastActiveAt).getTime() : 0;
  if (nowMs - lastActiveMs > 60000) {
    db.updateUser(verifiedUser.id, { lastActiveAt: new Date(nowMs).toISOString() }).catch(() => {});
  }

  // Separate admin clearance tracking if elevated admin session
  const banCheck = (verifiedPayload as any).adminName ? await db.isBannedAdmin((verifiedPayload as any).adminName) : { isBanned: false };
  if (
    verifiedPayload.isAdmin &&
    isAuthorizedAdminEmail(verifiedPayload.email) &&
    !isSessionRevoked((verifiedPayload as any).jti, verifiedPayload.id, (verifiedPayload as any).iat, (verifiedPayload as any).adminName) &&
    !banCheck.isBanned
  ) {
    req.admin = {
      adminName: ((verifiedPayload as any).adminName || verifiedUser.name || verifiedUser.email || 'Admin').trim(),
      isAdmin: true,
    };
  }

  next();
}

// Optional Dev-Only Demo Account Initializer
export async function initDefaultUsers() {
  if (process.env.ENABLE_DEMO_ACCOUNT !== 'true' || process.env.NODE_ENV === 'production') {
    return;
  }

  const devDemoEmail = 'dev-demo@aestific.local';
  if (!(await db.findUserByEmail(devDemoEmail))) {
    const salt = bcrypt.genSaltSync(10);
    const randomDevPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = bcrypt.hashSync(randomDevPassword, salt);

    const user = await db.createUser({
      name: 'Aestific Explorer (Dev Sandbox)',
      email: devDemoEmail,
      passwordHash,
      memoryEnabled: true,
      preferredModel: DEFAULT_MODEL_ID,
      systemPrompt: 'You are Aestific, an AI platform that brings together different AI models and intelligently uses the one best suited for each task—all through one simple interface. Aestific was founded and built by Atif Al Wasi.',
      isEmailVerified: true,
    });

    // Create a starter conversation
    const conv = await db.createConversation(user.id, 'Welcome to Aestific', DEFAULT_MODEL_ID);
    await db.createMessage({
      conversationId: conv.id,
      userId: user.id,
      role: 'assistant',
      content: 'Hello! I am Aestific, your AI companion. How can I help you today?',
    });
  }
}
