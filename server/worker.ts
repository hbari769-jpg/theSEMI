/**
 * Cloudflare Worker Entrypoint for Aestific (Alternative / Optional Edge Target)
 * Architecture:
 * - Runtime Platform: Cloudflare Workers (Alternative Edge Target - NOT Production Source of Truth)
 * - Database: Cloudflare D1 (Alternative Edge Database Target)
 * - File / Media Storage: Supabase Storage (aestific-files bucket)
 * - AI Intelligence: Groq API (Inference & Speech-to-Text)
 * - Scheduled Cron: Daily 30-day message & file retention cleanup (Edge Scheduled Trigger)
 *
 * NOTE: The Authoritative Production Runtime is Node.js + Express on Cloud Run (server.ts)
 * with the authoritative database (server/db.ts). This Worker is an optional alternative edge target.
 *
 * Strictly NO plans, NO pricing, NO subscriptions, NO usage limits or paywalls.
 */

import bcrypt from 'bcryptjs';
import { d1Db, D1Database, RETENTION_DAYS, User, Conversation, Message, FileRecord } from './d1.js';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from './models.js';

export { RETENTION_DAYS };

export interface Env {
  DB: D1Database;
  GROQ_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_BUCKET_NAME?: string;
  JWT_SECRET?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  ADMIN_SECRET?: string;
  ADMIN_STEP_1?: string;
  ADMIN_STEP_2?: string;
  ADMIN_STEP_3?: string;
  ADMIN_STEP_4?: string;
  ADMIN_STEP_5?: string;
  ADMIN_PASSWORD_HASH?: string;
}

/**
 * Universal safe configuration extractor for Cloudflare Worker runtime.
 * Prioritizes Worker env bindings; provides fallback only in local Node/test execution.
 * Strictly ignores any empty, undefined, or template placeholder strings.
 */
export function getWorkerConfig(env: Env, key: keyof Env | string): string | null {
  const isPlaceholder = (val: string): boolean => {
    const lower = val.toLowerCase();
    return (
      lower.startsWith('my_') ||
      lower.startsWith('your_') ||
      lower.startsWith('enter_') ||
      lower === 'none' ||
      lower === 'undefined' ||
      lower === 'null' ||
      lower === 'change_me' ||
      lower === 'todo'
    );
  };

  const val = (env as any)?.[key];
  if (typeof val === 'string' && val.trim().length > 0) {
    const clean = val.trim();
    if (!isPlaceholder(clean)) {
      return clean;
    }
  }
  if (typeof process !== 'undefined' && process?.env) {
    const procVal = (process.env as any)?.[key];
    if (typeof procVal === 'string' && procVal.trim().length > 0) {
      const clean = procVal.trim();
      if (!isPlaceholder(clean)) {
        return clean;
      }
    }
  }
  return null;
}

export function getWorkerJwtSecret(env: Env): string | null {
  return getWorkerConfig(env, 'JWT_SECRET');
}

export function getWorkerGroqKey(env: Env): string | null {
  return getWorkerConfig(env, 'GROQ_API_KEY');
}

// Safely parse JSON request body only once to prevent stream consumption errors in Fetch API
async function parseWorkerJson<T = any>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

// Simple Base64URL and HMAC SHA-256 for universal Cloudflare Worker JWT handling
async function signJwt(payload: any, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const b64Header = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const b64Payload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const data = `${b64Header}.${b64Payload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const b64Sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${data}.${b64Sig}`;
}

async function verifyJwt(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [b64Header, b64Payload, b64Sig] = parts;
    const data = `${b64Header}.${b64Payload}`;
    const enc = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    let sigBase64 = b64Sig.replace(/-/g, '+').replace(/_/g, '/');
    while (sigBase64.length % 4) sigBase64 += '=';
    const sigStr = atob(sigBase64);
    const sigBuf = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) sigBuf[i] = sigStr.charCodeAt(i);

    const isValid = await crypto.subtle.verify('HMAC', key, sigBuf, enc.encode(data));
    if (!isValid) return null;

    let payloadBase64 = b64Payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payloadBase64.length % 4) payloadBase64 += '=';
    const payloadStr = atob(payloadBase64);
    const payload = JSON.parse(payloadStr);

    if (payload.exp && Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

async function verifyPasswordMatch(
  plainPassword: string,
  storedHash: string
): Promise<{ isValid: boolean; needsRehash: boolean }> {
  if (!plainPassword || !storedHash) return { isValid: false, needsRehash: false };

  // 1. Standard bcrypt hash check ($2a$, $2b$, $2y$)
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    try {
      const isValid = bcrypt.compareSync(plainPassword, storedHash);
      return { isValid, needsRehash: false };
    } catch {
      return { isValid: false, needsRehash: false };
    }
  }

  // 2. Legacy Plaintext comparison (failsafe fallback for historical unhashed accounts)
  if (plainPassword === storedHash) {
    return { isValid: true, needsRehash: true };
  }

  return { isValid: false, needsRehash: false };
}

function jsonResponse(data: any, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      ...headers,
    },
  });
}

function isWorkerBrevoConfigured(env: Env): boolean {
  const apiKey = (getWorkerConfig(env, 'BREVO_API_KEY') || '').trim().replace(/^['"]|['"]$/g, '');
  const senderEmail = (getWorkerConfig(env, 'BREVO_SENDER_EMAIL') || '').trim().replace(/^['"]|['"]$/g, '');
  return Boolean(apiKey && apiKey.startsWith('xkeysib-') && apiKey.length > 25 && senderEmail && senderEmail.includes('@'));
}

function generateWorkerVerificationCode(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return num.toString();
}

async function sendWorkerVerificationEmail(
  env: Env,
  toEmail: string,
  userName: string,
  verificationCode: string
): Promise<{ success: boolean; error?: string }> {
  if (!isWorkerBrevoConfigured(env)) {
    return { success: false, error: 'Brevo email service is not configured.' };
  }

  const apiKey = (getWorkerConfig(env, 'BREVO_API_KEY') || '').trim().replace(/^['"]|['"]$/g, '');
  const senderEmail = (getWorkerConfig(env, 'BREVO_SENDER_EMAIL') || '').trim().replace(/^['"]|['"]$/g, '');
  const senderName = (getWorkerConfig(env, 'BREVO_SENDER_NAME') || 'Aestific Official').trim().replace(/^['"]|['"]$/g, '');

  const safeUserName = userName ? userName.trim() : 'Aestific Member';
  const recipientEmail = toEmail.trim().toLowerCase();

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Verify your Aestific account</title>
</head>
<body style="margin:0;padding:0;background-color:#07070d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e4e4e7;">
  <div style="width:100%;padding:40px 15px;box-sizing:border-box;">
    <div style="max-width:520px;margin:0 auto;background-color:#0d0d16;border:1px solid #27273a;border-radius:20px;padding:40px 32px;">
      <h1 style="font-size:26px;font-weight:800;color:#ffffff;margin:0 0 10px;text-align:center;">AESTIFIC</h1>
      <p style="font-size:14px;color:#a1a1aa;text-align:center;">Inventing What's Next</p>
      <div style="font-size:18px;font-weight:600;color:#f4f4f5;margin:24px 0 12px;">Hello ${safeUserName},</div>
      <p style="font-size:14px;line-height:1.6;color:#a1a1aa;">Welcome to Aestific. Please use the 6-digit verification code below to activate your account:</p>
      <div style="background-color:#040408;border:1px solid #3b1d4d;border-radius:14px;padding:20px;text-align:center;margin:28px 0;">
        <div style="font-size:11px;color:#ec4899;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Verification Code</div>
        <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#ffffff;font-family:monospace;margin:8px 0;">${verificationCode}</div>
        <div style="font-size:12px;color:#fbbf24;">Expires in 15 minutes</div>
      </div>
      <p style="font-size:12px;color:#71717a;border-top:1px solid #1f1f2e;padding-top:16px;">If you did not request this, please ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: safeUserName }],
        subject: 'Verify your Aestific account',
        htmlContent,
        textContent: `Your Aestific verification code is: ${verificationCode}`,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { success: false, error: errJson?.message || 'Brevo dispatch rejected' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to dispatch email' };
  }
}

async function sendWorkerPasswordResetEmail(
  env: Env,
  toEmail: string,
  userName: string,
  resetCode: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = getWorkerConfig(env, 'BREVO_API_KEY') || '';
  const senderEmail = getWorkerConfig(env, 'BREVO_SENDER_EMAIL') || '';
  const senderName = getWorkerConfig(env, 'BREVO_SENDER_NAME') || 'Aestific Official';

  if (!apiKey || !senderEmail) {
    return { success: false, error: 'Brevo email service is not configured.' };
  }

  const safeUserName = userName ? userName.trim() : 'Aestific Member';
  const recipientEmail = toEmail.trim().toLowerCase();

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Reset your Aestific password</title>
</head>
<body style="margin:0;padding:0;background-color:#07070d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e4e4e7;">
  <div style="width:100%;padding:40px 15px;box-sizing:border-box;">
    <div style="max-width:520px;margin:0 auto;background-color:#0d0d16;border:1px solid #27273a;border-radius:20px;padding:40px 32px;">
      <h1 style="font-size:26px;font-weight:800;color:#ffffff;margin:0 0 10px;text-align:center;">AESTIFIC</h1>
      <p style="font-size:14px;color:#a1a1aa;text-align:center;">Inventing What's Next</p>
      <div style="font-size:18px;font-weight:600;color:#f4f4f5;margin:24px 0 12px;">Hello ${safeUserName},</div>
      <p style="font-size:14px;line-height:1.6;color:#a1a1aa;">We received a request to reset your password. Use the secure code below:</p>
      <div style="background-color:#040408;border:1px solid #3b1d4d;border-radius:14px;padding:20px;text-align:center;margin:28px 0;">
        <div style="font-size:11px;color:#ec4899;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Password Reset Code</div>
        <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#ffffff;font-family:monospace;margin:8px 0;">${resetCode}</div>
        <div style="font-size:12px;color:#fbbf24;">Expires in 15 minutes</div>
      </div>
      <p style="font-size:12px;color:#71717a;border-top:1px solid #1f1f2e;padding-top:16px;">If you did not request a password reset, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: safeUserName }],
        subject: 'Reset your Aestific password',
        htmlContent,
        textContent: `Your Aestific password reset code is: ${resetCode}`,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { success: false, error: errJson?.message || 'Brevo dispatch rejected' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to dispatch email' };
  }
}

async function sendWorkerAdminDirectEmail(
  env: Env,
  options: {
    toEmail: string;
    toName?: string;
    senderDisplayName?: string;
    subject: string;
    textContent?: string;
    htmlContent?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const apiKey = getWorkerConfig(env, 'BREVO_API_KEY') || '';
  const senderEmail = getWorkerConfig(env, 'BREVO_SENDER_EMAIL') || '';
  const defaultSenderName = getWorkerConfig(env, 'BREVO_SENDER_NAME') || 'Aestific Support';

  if (!apiKey || !senderEmail) {
    return { success: false, error: 'Brevo email service is not configured in worker environment.' };
  }

  const effectiveSenderName = (options.senderDisplayName || defaultSenderName).trim();
  const recipientEmail = options.toEmail.trim().toLowerCase();
  const recipientName = (options.toName || options.toEmail).trim();
  const subject = options.subject.trim();

  const formattedHtml = options.htmlContent || `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#050508;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f4f4f5;">
  <div style="width:100%;padding:40px 15px;box-sizing:border-box;">
    <div style="max-width:600px;margin:0 auto;background-color:#0e0e14;border:1px solid #27273a;border-radius:16px;padding:36px 28px;">
      <div style="font-size:13px;font-weight:700;color:#ef4444;text-transform:uppercase;margin-bottom:8px;">${effectiveSenderName}</div>
      <div style="font-size:20px;font-weight:bold;color:#ffffff;margin-bottom:20px;">${subject}</div>
      <div style="font-size:15px;line-height:1.7;color:#d4d4d8;white-space:pre-wrap;margin-bottom:30px;">${(options.textContent || '').replace(/\n/g, '<br/>')}</div>
      <div style="font-size:12px;color:#71717a;border-top:1px solid #1f1f2e;padding-top:16px;text-align:center;">Sent by ${effectiveSenderName} • Official Communication</div>
    </div>
  </div>
</body>
</html>
  `;

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: effectiveSenderName, email: senderEmail },
        to: [{ email: recipientEmail, name: recipientName }],
        subject,
        htmlContent: formattedHtml,
        ...(options.textContent ? { textContent: options.textContent } : {}),
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { success: false, error: errJson?.message || 'Brevo rejected dispatch' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to dispatch email' };
  }
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }

  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = cookie.match(/aestific_token=([^;]+)/);
    if (match) return match[1].trim();
  }

  const url = new URL(request.url);
  // Only accept ?token= query parameter for direct file download streaming
  if (url.pathname.startsWith('/api/files/download/') || url.pathname.startsWith('/api/files/raw/')) {
    const queryToken = url.searchParams.get('token');
    if (queryToken) return queryToken.trim();
  }

  return null;
}

async function authenticate(request: Request, env: Env): Promise<User | null> {
  const token = getBearerToken(request);
  if (!token) return null;
  const secret = getWorkerJwtSecret(env);
  if (!secret) {
    console.error('FATAL AUTH ERROR: JWT_SECRET environment secret binding is missing in Cloudflare Worker.');
    return null;
  }
  const decoded = await verifyJwt(token, secret);
  if (!decoded || !decoded.id || decoded.isAdmin === true) return null;
  const user = await d1Db.findUserById(env.DB, decoded.id);
  if (!user || user.status === 'banned') return null;
  return user;
}

function isAuthorizedAdminEmail(email?: string, env?: Env): boolean {
  if (!email || typeof email !== 'string') return false;
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return false;

  const configured = env
    ? (getWorkerConfig(env, 'ADMIN_EMAILS') || getWorkerConfig(env, 'ADMIN_EMAIL') || '')
        .toLowerCase()
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
    : [];

  if (configured.length === 0) {
    return true;
  }

  return configured.includes(cleanEmail);
}

// Admin Session Revocation and Invalidation Tracker (Worker runtime)
const workerRevokedAdminJtis = new Set<string>();
const workerUserLogoutTimestamps = new Map<string, number>();
const workerBannedAdminNameInvalidations = new Map<string, number>();

function revokeWorkerAdminSession(jti?: string, userId?: string) {
  if (jti) {
    workerRevokedAdminJtis.add(jti);
  }
  if (userId) {
    workerUserLogoutTimestamps.set(userId, Math.floor(Date.now() / 1000));
  }
}

function revokeWorkerAdminByName(adminName: string) {
  if (adminName && typeof adminName === 'string') {
    workerBannedAdminNameInvalidations.set(adminName.toLowerCase().trim(), Math.floor(Date.now() / 1000));
  }
}

function isWorkerSessionRevoked(jti?: string, userId?: string, iat?: number, adminName?: string): boolean {
  if (jti && workerRevokedAdminJtis.has(jti)) {
    return true;
  }
  if (userId && iat !== undefined) {
    const logoutSec = workerUserLogoutTimestamps.get(userId);
    if (logoutSec !== undefined && iat <= logoutSec) {
      return true;
    }
  }
  if (adminName && iat !== undefined) {
    const banSec = workerBannedAdminNameInvalidations.get(adminName.toLowerCase().trim());
    if (banSec !== undefined && iat <= banSec) {
      return true;
    }
  }
  return false;
}

// Sequential Admin Step Verification Tracker (Worker runtime)
interface WorkerVerificationSession {
  userId: string;
  email: string;
  completedStep: number;
  createdAt: number;
  lastStepAt: number;
  expiresAt: number;
}

const workerVerificationSessions = new Map<string, WorkerVerificationSession>();

function getWorkerVerificationSession(userId: string): WorkerVerificationSession | undefined {
  const session = workerVerificationSessions.get(userId);
  if (!session) return undefined;
  if (Date.now() > session.expiresAt) {
    workerVerificationSessions.delete(userId);
    return undefined;
  }
  return session;
}

function startWorkerVerificationSession(userId: string, email: string): WorkerVerificationSession {
  const session: WorkerVerificationSession = {
    userId,
    email,
    completedStep: 1,
    createdAt: Date.now(),
    lastStepAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  workerVerificationSessions.set(userId, session);
  return session;
}

function advanceWorkerVerificationSession(userId: string, step: number): boolean {
  const session = getWorkerVerificationSession(userId);
  if (!session) return false;
  session.completedStep = step;
  session.lastStepAt = Date.now();
  return true;
}

function deleteWorkerVerificationSession(userId: string): void {
  workerVerificationSessions.delete(userId);
}

async function authenticateAdmin(
  request: Request,
  env: Env,
  requireElevatedClearance: boolean = false
): Promise<{ success: boolean; status?: number; error?: string; admin?: { adminName: string; isAdmin: boolean; userId?: string; email?: string; jti?: string } }> {
  const xAdminToken = request.headers.get('X-Admin-Token')?.trim();
  const token = xAdminToken || getBearerToken(request);
  if (!token) {
    return { success: false, status: 401, error: 'Authentication required. Please sign in to access admin functionality.' };
  }
  const secret = getWorkerJwtSecret(env);
  if (!secret) {
    console.error('FATAL AUTH ERROR: JWT_SECRET environment secret binding is missing in Cloudflare Worker.');
    return { success: false, status: 500, error: 'Authentication service temporarily unavailable.' };
  }
  const decoded = await verifyJwt(token, secret);
  if (!decoded) {
    return { success: false, status: 401, error: 'Admin session expired or invalid credentials.' };
  }

  // Requirement 1, 2, 3: Must be tied to an authenticated account identity with admin authorization
  if (!decoded.id && !decoded.email) {
    return { success: false, status: 401, error: 'Authentication required. Please sign in with an administrator account.' };
  }

  const isAuthorizedEmail = Boolean(decoded.email && isAuthorizedAdminEmail(decoded.email, env));

  if (!isAuthorizedEmail) {
    return { success: false, status: 403, error: 'Forbidden: Insufficient administrative privileges.' };
  }

  const hasElevatedClearance = decoded.isAdmin === true || decoded.role === 'admin';
  if (requireElevatedClearance && !hasElevatedClearance) {
    return {
      success: false,
      status: 403,
      error: 'Admin Panel is locked. Please complete the 5-step security verification first.',
    };
  }

  const adminName = (decoded.adminName || decoded.name || decoded.email || 'Admin').trim();

  const banCheckName = await d1Db.isBannedAdmin(env.DB, adminName);
  const banCheckEmail = decoded.email ? await d1Db.isBannedAdmin(env.DB, decoded.email) : { isBanned: false };
  const banCheck = banCheckName.isBanned ? banCheckName : banCheckEmail;
  if (banCheck.isBanned) {
    const remainingMs = ((banCheck as any).expiresAt || 0) - Date.now();
    const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
    return {
      success: false,
      status: 403,
      error: `Admin access for "${banCheckName.isBanned ? adminName : decoded.email}" is suspended. Ban expires in approx ${remainingHours} hours.`,
    };
  }

  // Requirement 12: Invalidate revoked admin sessions
  if (isWorkerSessionRevoked(decoded.jti, decoded.id, decoded.iat, decoded.adminName)) {
    return { success: false, status: 401, error: 'Admin session expired or has been revoked. Please sign in again.' };
  }

  return {
    success: true,
    admin: {
      adminName,
      isAdmin: hasElevatedClearance,
      userId: decoded.id,
      email: decoded.email,
      jti: decoded.jti,
    },
  };
}

function sanitizeWorkerUser(u: any) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status || 'active',
    isEmailVerified: Boolean(u.isEmailVerified),
    isBanned: Boolean(u.isBanned),
    bannedAt: u.bannedAt,
    bannedReason: u.bannedReason,
    memoryEnabled: Boolean(u.memoryEnabled),
    preferredModel: u.preferredModel,
    createdAt: u.createdAt,
    lastActiveAt: u.lastActiveAt,
  };
}

// Multi-Tier Rate Limiting for Cloudflare Worker Isolate
const workerRateLimitBuckets = new Map<string, number[]>();
const activeWorkerInferenceLocks = new Set<string>();

function getWorkerClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && typeof cfIp === 'string') {
    const trimmed = cfIp.trim();
    if (trimmed) return trimmed;
  }
  const xForwarded = request.headers.get('x-forwarded-for');
  if (xForwarded && typeof xForwarded === 'string') {
    // In reverse proxy chains, trusted proxies append to the end of the header;
    // extract the rightmost client hop rather than trusting arbitrary leftmost client spoofing
    const hops = xForwarded.split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }
  return '127.0.0.1';
}

function checkWorkerRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  customMessage?: string
): { allowed: boolean; message?: string; retryAfter?: number } {
  const now = Date.now();
  let timestamps = workerRateLimitBuckets.get(key) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    workerRateLimitBuckets.set(key, timestamps);
    const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
    return {
      allowed: false,
      message:
        customMessage ||
        `Rate limit exceeded. Please wait ${retryAfter > 0 ? retryAfter : 1}s before trying again.`,
      retryAfter: retryAfter > 0 ? retryAfter : 1,
    };
  }
  timestamps.push(now);
  workerRateLimitBuckets.set(key, timestamps);
  return { allowed: true };
}

function workerRateLimitResponse(rateResult: { message?: string; retryAfter?: number }): Response {
  const retrySec = rateResult.retryAfter || 1;
  return jsonResponse(
    {
      error: rateResult.message || 'Rate limit exceeded. Please try again shortly.',
      retryAfter: retrySec,
    },
    429,
    {
      'Retry-After': String(retrySec),
    }
  );
}

// --- Security, Storage & File Validation Constants ---
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.msi', '.vbs', '.vbe', '.ps1', '.psm1',
  '.scr', '.jar', '.apk', '.com', '.pif', '.app', '.dmg', '.deb', '.rpm',
  '.iso', '.img', '.bin', '.elf', '.so', '.dylib', '.cgi', '.pl', '.jsp',
  '.asp', '.aspx', '.phtml', '.shtml', '.htaccess', '.htpasswd'
]);

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const ALLOWED_AUDIO_EXTS = new Set(['.webm', '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mpeg', '.mkv', '.avi', '.ogg']);
const ALLOWED_DOC_EXTS = new Set([
  '.pdf', '.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.js', '.jsx',
  '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
  '.rs', '.php', '.rb', '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.sql', '.yaml', '.yml', '.xml', '.log', '.ini', '.cfg', '.conf', '.toml',
  '.dockerfile', '.graphql', '.proto', '.swift', '.kt', '.r', '.m', '.tex'
]);

const MAX_IMAGE_SIZE = 25 * 1024 * 1024;
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const MAX_VIDEO_SIZE = 35 * 1024 * 1024;
const MAX_DOC_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_SIZE = 50 * 1024 * 1024;

function validateWorkerFileMagicBytes(
  buffer: Uint8Array,
  ext: string,
  mime: string
): { isValid: boolean; error?: string } {
  if (buffer.length < 4) {
    return { isValid: false, error: 'File is empty or too small to verify.' };
  }

  // Check 1: Reject Executable / Dangerous Binary Signatures
  // DOS / Windows PE Executable (MZ)
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
    return { isValid: false, error: 'Executable binary files (MZ/PE) are strictly forbidden.' };
  }
  // Linux ELF Executable
  if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
    return { isValid: false, error: 'Executable binary files (ELF) are strictly forbidden.' };
  }
  // Java / Mach-O universal binary (0xCA 0xFE 0xBA 0xBE)
  if (buffer[0] === 0xCA && buffer[1] === 0xFE && buffer[2] === 0xBA && buffer[3] === 0xBE) {
    return { isValid: false, error: 'Compiled binary / Mach-O files are strictly forbidden.' };
  }

  // Check 2: Verify PDF signature
  if (ext === '.pdf' || mime === 'application/pdf') {
    const isPdf =
      buffer[0] === 0x25 && // %
      buffer[1] === 0x50 && // P
      buffer[2] === 0x44 && // D
      buffer[3] === 0x46 && // F
      buffer[4] === 0x2D;   // -
    if (!isPdf) {
      return { isValid: false, error: 'Invalid PDF file: Missing %PDF header signature.' };
    }
  }

  // Check 3: Verify JPEG signature
  if (ext === '.jpg' || ext === '.jpeg' || mime === 'image/jpeg') {
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    if (!isJpeg) {
      return { isValid: false, error: 'Invalid JPEG file: Binary header mismatch.' };
    }
  }

  // Check 4: Verify PNG signature
  if (ext === '.png' || mime === 'image/png') {
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A;
    if (!isPng) {
      return { isValid: false, error: 'Invalid PNG file: Binary header mismatch.' };
    }
  }

  // Check 5: Verify GIF signature
  if (ext === '.gif' || mime === 'image/gif') {
    const isGif =
      buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
    if (!isGif) {
      return { isValid: false, error: 'Invalid GIF file: Binary header mismatch.' };
    }
  }

  return { isValid: true };
}

function sanitizeWorkerFilename(name: string): string {
  return name.replace(/[\r\n\0]/g, '').trim().slice(0, 200) || 'Uploaded File';
}

function generateWorkerStoragePath(userId: string, originalName: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '') || 'user';
  const cleanExt = originalName.includes('.')
    ? '.' + originalName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';
  const safeExt = cleanExt.slice(0, 10);
  const randomHex = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const uniqueFileId = `${Date.now()}_${randomHex}${safeExt}`;
  const storagePath = `users/${safeUserId}/${uniqueFileId}`;

  return {
    uniqueFileId,
    storagePath,
  };
}

/**
 * 30-Day Retention Cleanup Engine for Cloudflare Worker & D1 (Edge Target)
 *
 * Rules:
 * 1. Strictly per-message creation timestamp (messages.created_at < now - 30 days).
 * 2. Messages < 30 days are NEVER deleted.
 * 3. Messages > 30 days are purged.
 * 4. Pinned conversations are NOT exempt — their expired messages are deleted according to policy.
 * 5. Conversations are only purged if they have NO messages remaining and were created before cutoff.
 * 6. Related expired file records and Supabase Storage blobs are cleanly purged.
 * 7. Completely separated from User Account delete logic.
 * 8. Optimized with B-Tree indexes on created_at to avoid full-table scans.
 */
export async function executeWorkerRetentionCleanup(
  env: Env,
  retentionDays = RETENTION_DAYS
): Promise<{
  cutoffDate: string;
  messagesFound: number;
  deletedMessagesCount: number;
  deletedConversationsCount: number;
  deletedFilesCount: number;
  deletedStorageObjectsCount: number;
  success: boolean;
  error?: string;
}> {
  const cutoffTime = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
  console.log(`[Cloudflare Retention Engine] Cleanup started. Policy: ${retentionDays} days. Cutoff timestamp: ${cutoffTime}`);

  if (!env.DB) {
    console.warn('[Cloudflare Retention Engine] D1 database binding (env.DB) not found. Skipping cleanup.');
    return {
      cutoffDate: cutoffTime,
      messagesFound: 0,
      deletedMessagesCount: 0,
      deletedConversationsCount: 0,
      deletedFilesCount: 0,
      deletedStorageObjectsCount: 0,
      success: false,
      error: 'D1 database binding (env.DB) not found',
    };
  }

  let deletedFilesCount = 0;
  let deletedStorageObjectsCount = 0;
  let deletedMessagesCount = 0;
  let deletedConversationsCount = 0;
  let messagesFound = 0;

  try {
    const bucketName = getWorkerConfig(env, 'SUPABASE_BUCKET_NAME') || 'aestific-files';
    const supabaseUrl = getWorkerConfig(env, 'SUPABASE_URL');
    const supabaseKey = getWorkerConfig(env, 'SUPABASE_SERVICE_ROLE_KEY');

    // 1. Identify and purge expired files in D1 & Supabase Storage (evaluated by files.created_at)
    const expiredFiles = await env.DB.prepare(
      'SELECT id, user_id, storage_path, filename, bucket_name FROM files WHERE created_at < ?'
    ).bind(cutoffTime).all();

    if (expiredFiles.results && expiredFiles.results.length > 0) {
      const failedKeys = new Set<string>();

      if (supabaseUrl && supabaseKey) {
        const pathsByBucket: Record<string, string[]> = {};
        for (const f of expiredFiles.results as any[]) {
          const rawPath = f.storage_path || (f.filename && f.user_id ? `users/${f.user_id}/${f.filename}` : '');
          if (!rawPath) continue;
          const cleanPath = rawPath
            .replace(/^(aestific-files|nvelora-files)\//, '')
            .replace(/^\/+/, '');
          if (!cleanPath) continue;
          const b = (f.bucket_name || bucketName).trim() || 'aestific-files';
          if (!pathsByBucket[b]) pathsByBucket[b] = [];
          pathsByBucket[b].push(cleanPath);
        }

        for (const [targetBucket, pathsToDelete] of Object.entries(pathsByBucket)) {
          for (let i = 0; i < pathsToDelete.length; i += 100) {
            const chunk = pathsToDelete.slice(i, i + 100);
            try {
              const res = await fetch(`${supabaseUrl}/storage/v1/object/${targetBucket}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${supabaseKey}`,
                  apikey: supabaseKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prefixes: chunk }),
              });
              if (res.ok) {
                const data = await res.json().catch(() => []);
                deletedStorageObjectsCount += Array.isArray(data) ? data.length : chunk.length;
              } else {
                const errorText = await res.text().catch(() => '');
                // Sanitize log: never leak secrets or long payload
                console.warn(`[Supabase Storage Retention Cleanup Error] HTTP ${res.status}: ${errorText.slice(0, 100)}`);
                for (const p of chunk) {
                  failedKeys.add(`${targetBucket}/${p}`);
                }
              }
            } catch (e: any) {
              console.warn('[Supabase Storage Retention Cleanup Error]', e?.message || 'Network error');
              for (const p of chunk) {
                failedKeys.add(`${targetBucket}/${p}`);
              }
            }
          }
        }

        for (const f of expiredFiles.results as any[]) {
          const rawPath = f.storage_path || (f.filename && f.user_id ? `users/${f.user_id}/${f.filename}` : '');
          const cleanPath = rawPath
            .replace(/^(aestific-files|nvelora-files)\//, '')
            .replace(/^\/+/, '');
          const b = (f.bucket_name || bucketName).trim() || 'aestific-files';
          const fileKey = `${b}/${cleanPath}`;

          if (failedKeys.has(fileKey)) {
            // Keep in D1 so next run can retry
            console.warn(`[Cloudflare Retention Engine] Preserved D1 record for file ${f.id} because storage deletion failed.`);
            continue;
          }

          // Storage deletion succeeded or file had no storage object
          await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(f.id).run();
          deletedFilesCount++;
        }
      } else {
        // No Supabase credentials configured
        const fileDeleteRes = await env.DB.prepare('DELETE FROM files WHERE created_at < ?').bind(cutoffTime).run();
        deletedFilesCount = fileDeleteRes.meta?.changes || expiredFiles.results.length;
      }
    }

    // 2. Count expired messages before deleting
    const countMsgRes = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE created_at < ?'
    ).bind(cutoffTime).first<any>();
    messagesFound = countMsgRes?.count || 0;

    // 3. Delete expired messages strictly based on each message's created_at timestamp
    const msgDeleteRes = await env.DB.prepare(
      'DELETE FROM messages WHERE created_at < ?'
    ).bind(cutoffTime).run();
    deletedMessagesCount = msgDeleteRes.meta?.changes || messagesFound;

    // 4. Clean up orphaned file records whose conversation was deleted
    await env.DB.prepare(`
      DELETE FROM files 
      WHERE conversation_id IS NOT NULL 
      AND conversation_id NOT IN (SELECT id FROM conversations)
    `).run().catch(() => {});

    // 5. Delete empty conversations that have 0 messages remaining and were created before cutoff
    const convDeleteRes = await env.DB.prepare(
      'DELETE FROM conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM messages) AND created_at < ?'
    ).bind(cutoffTime).run();
    deletedConversationsCount = convDeleteRes.meta?.changes || 0;

    console.log(
      `[Cloudflare Retention Engine] Cleanup completed. Cutoff: ${cutoffTime} | Messages found: ${messagesFound} | Messages deleted: ${deletedMessagesCount} | Empty conversations deleted: ${deletedConversationsCount} | Files deleted: ${deletedFilesCount} | Storage objects deleted: ${deletedStorageObjectsCount}`
    );

    return {
      cutoffDate: cutoffTime,
      messagesFound,
      deletedMessagesCount,
      deletedConversationsCount,
      deletedFilesCount,
      deletedStorageObjectsCount,
      success: true,
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'Unknown retention cleanup error';
    console.error(`[Cloudflare Retention Engine] Cleanup error at cutoff ${cutoffTime}:`, errorMsg);
    return {
      cutoffDate: cutoffTime,
      messagesFound,
      deletedMessagesCount,
      deletedConversationsCount,
      deletedFilesCount,
      deletedStorageObjectsCount,
      success: false,
      error: errorMsg,
    };
  }
}

export default {
  /**
   * Main HTTP Request Handler for Cloudflare Workers
   */
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (!env.DB) {
      return jsonResponse({ error: 'Cloudflare D1 Database binding (env.DB) is not configured.' }, 500);
    }

    // --- Health Check ---
    if (path === '/api/health') {
      return jsonResponse({
        status: 'ok',
        provider: 'cloudflare',
        database: 'cloudflare-d1',
        authoritative: false,
        role: 'alternative-edge-target',
        storage: 'supabase-storage',
        ai: 'groq',
        retentionPolicy: `${RETENTION_DAYS}-day message retention`,
        d1Connected: Boolean(env.DB),
        timestamp: new Date().toISOString(),
      });
    }

    // --- Settings / Status ---
    if (path === '/api/settings/status' && method === 'GET') {
      const isGroqConfigured = Boolean(getWorkerGroqKey(env));
      return jsonResponse({
        serverGroqConfigured: isGroqConfigured,
        activeProvider: isGroqConfigured ? 'Groq LPU (GPT-OSS 120B)' : 'Aestific AI Engine',
        retentionDays: RETENTION_DAYS,
        availableModels: AVAILABLE_MODELS,
      });
    }

    // --- Available Models List ---
    if (path === '/api/models' && method === 'GET') {
      return jsonResponse({
        models: AVAILABLE_MODELS,
        defaultModel: DEFAULT_MODEL_ID,
      });
    }

    // --- Auth Routes ---
    if (path === '/api/auth/register' && method === 'POST') {
      try {
        const clientIp = getWorkerClientIp(request);
        const ipRate = checkWorkerRateLimit(
          `reg:ip:${clientIp}`,
          5,
          300000,
          'Too many registration attempts from this network. Please wait 5 minutes.'
        );
        if (!ipRate.allowed) {
          return workerRateLimitResponse(ipRate);
        }

        const body = await parseWorkerJson(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        }
        const { name, email, password } = body as any;
        if (!name || !email || !password) {
          return jsonResponse({ error: 'Name, email, and password are required.' }, 400);
        }
        if (password.length < 6) {
          return jsonResponse({ error: 'Password must be at least 6 characters long.' }, 400);
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existing = await d1Db.findUserByEmail(env.DB, normalizedEmail);
        if (existing && existing.isEmailVerified) {
          return jsonResponse({ error: 'An account with this email address already exists. Please sign in.' }, 409);
        }

        const passwordHash = await hashPassword(password);
        const brevoActive = isWorkerBrevoConfigured(env);

        let user: User;
        if (existing && !existing.isEmailVerified) {
          user = (await d1Db.updateUser(env.DB, existing.id, { name: name.trim(), passwordHash }))!;
        } else {
          user = await d1Db.createUser(env.DB, {
            name: name.trim(),
            email: normalizedEmail,
            passwordHash,
            memoryEnabled: true,
            isEmailVerified: !brevoActive,
            preferredModel: 'openai/gpt-oss-120b',
            systemPrompt: 'You are Aestific, an AI platform that brings together different AI models and intelligently uses the one best suited for each task—all through one simple interface. Aestific was founded and built by Atif Al Wasi.',
          });
        }

        if (!brevoActive) {
          const secret = getWorkerJwtSecret(env);
          if (!secret) {
            return jsonResponse(
              { error: 'Server authentication configuration error: JWT_SECRET secret binding is required.' },
              500
            );
          }
          const token = await signJwt({ id: user.id, email: user.email }, secret);

          return jsonResponse(
            {
              message: 'Account created successfully!',
              requiresVerification: false,
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                memoryEnabled: user.memoryEnabled,
                preferredModel: user.preferredModel,
                avatarUrl: user.avatarUrl,
                isEmailVerified: true,
              },
              token,
            },
            201,
            {
              'Set-Cookie': `aestific_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
            }
          );
        }

        // Brevo email verification active
        const verificationCode = generateWorkerVerificationCode();
        await d1Db.setVerificationCode(env.DB, user.id, verificationCode);
        const emailResult = await sendWorkerVerificationEmail(env, user.email, user.name, verificationCode);

        if (!emailResult.success) {
          await d1Db.updateUser(env.DB, user.id, { isEmailVerified: true });
          const secret = getWorkerJwtSecret(env);
          const token = secret ? await signJwt({ id: user.id, email: user.email }, secret) : '';
          return jsonResponse(
            {
              message: 'Account created successfully! Welcome to Aestific.',
              requiresVerification: false,
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                memoryEnabled: user.memoryEnabled,
                preferredModel: user.preferredModel,
                avatarUrl: user.avatarUrl,
                isEmailVerified: true,
              },
              token,
            },
            201,
            token
              ? {
                  'Set-Cookie': `aestific_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
                }
              : undefined
          );
        }

        return jsonResponse(
          {
            message: 'Account created! A 6-digit verification code has been dispatched to your email.',
            requiresVerification: true,
            email: user.email,
          },
          201
        );
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'Registration failed' }, 500);
      }
    }

    if (path === '/api/auth/verify-email' && method === 'POST') {
      try {
        const clientIp = getWorkerClientIp(request);
        const body = await parseWorkerJson(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        }
        const { email, code } = body as any;
        if (!email || !code) {
          return jsonResponse({ error: 'Email address and 6-digit verification code are required.' }, 400);
        }

        const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();
        const cleanCode = (typeof code === 'string' ? code : '').trim();

        if (!/^\d{6}$/.test(cleanCode)) {
          return jsonResponse({ error: 'Please enter a valid 6-digit numerical code.' }, 400);
        }

        const ipRate = checkWorkerRateLimit(
          `verify:ip:${clientIp}`,
          15,
          300000,
          'Too many verification attempts from this network. Please wait a few minutes.'
        );
        if (!ipRate.allowed) return workerRateLimitResponse(ipRate);

        const emailRate = checkWorkerRateLimit(
          `verify:email:${normalizedEmail}`,
          10,
          300000,
          'Too many verification attempts for this account.'
        );
        if (!emailRate.allowed) return workerRateLimitResponse(emailRate);

        const result = await d1Db.verifyEmailCode(env.DB, normalizedEmail, cleanCode);
        if (!result.success || !result.user) {
          return jsonResponse({ error: result.error || 'Invalid verification code.' }, 400);
        }

        const verifiedUser = result.user;
        const secret = getWorkerJwtSecret(env);
        if (!secret) {
          return jsonResponse(
            { error: 'Server authentication configuration error: JWT_SECRET secret binding is required.' },
            500
          );
        }
        const token = await signJwt({ id: verifiedUser.id, email: verifiedUser.email }, secret);

        return jsonResponse(
          {
            message: 'Email successfully verified. Welcome to Aestific!',
            user: {
              id: verifiedUser.id,
              name: verifiedUser.name,
              email: verifiedUser.email,
              memoryEnabled: verifiedUser.memoryEnabled,
              preferredModel: verifiedUser.preferredModel,
              avatarUrl: verifiedUser.avatarUrl,
              isEmailVerified: true,
            },
            token,
          },
          200,
          {
            'Set-Cookie': `aestific_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
          }
        );
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'Verification failed' }, 500);
      }
    }

    if (path === '/api/auth/resend-verification' && method === 'POST') {
      try {
        const clientIp = getWorkerClientIp(request);
        const body = await parseWorkerJson(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        }
        const { email } = body as any;
        if (!email) {
          return jsonResponse({ error: 'Email address is required.' }, 400);
        }

        const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();

        const ipRate = checkWorkerRateLimit(
          `resend:ip:${clientIp}`,
          5,
          300000,
          'Too many resend attempts from this network. Please wait 5 minutes.'
        );
        if (!ipRate.allowed) return workerRateLimitResponse(ipRate);

        const emailRate = checkWorkerRateLimit(
          `resend:email:${normalizedEmail}`,
          3,
          300000,
          'Too many resend attempts for this account.'
        );
        if (!emailRate.allowed) return workerRateLimitResponse(emailRate);

        const user = await d1Db.findUserByEmail(env.DB, normalizedEmail);
        if (!user) {
          return jsonResponse({ error: 'No account found with this email address.' }, 404);
        }
        if (user.isEmailVerified) {
          return jsonResponse({ error: 'This email address is already verified. Please sign in.' }, 400);
        }

        if (!isWorkerBrevoConfigured(env)) {
          await d1Db.updateUser(env.DB, user.id, { isEmailVerified: true });
          return jsonResponse({ message: 'Email verified automatically (Brevo service not active).' });
        }

        const code = generateWorkerVerificationCode();
        await d1Db.setVerificationCode(env.DB, user.id, code);

        const sendRes = await sendWorkerVerificationEmail(env, user.email, user.name, code);
        if (!sendRes.success) {
          return jsonResponse({ error: sendRes.error || 'Failed to dispatch verification email.' }, 400);
        }

        return jsonResponse({ message: 'A new 6-digit verification code has been sent to your email.' });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'Failed to resend code' }, 500);
      }
    }

    if (path === '/api/auth/forgot-password' && method === 'POST') {
      try {
        const clientIp = getWorkerClientIp(request);
        const body = await parseWorkerJson(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        }
        const { email } = body as any;
        if (!email) {
          return jsonResponse({ error: 'Email address is required.' }, 400);
        }

        const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();

        const ipRate = checkWorkerRateLimit(
          `forgot:ip:${clientIp}`,
          5,
          300000,
          'Too many password reset attempts. Please wait 5 minutes.'
        );
        if (!ipRate.allowed) return workerRateLimitResponse(ipRate);

        const user = await d1Db.findUserByEmail(env.DB, normalizedEmail);
        if (!user) {
          return jsonResponse({ message: 'If an account exists with this email, a password reset code has been sent.' });
        }

        if (!isWorkerBrevoConfigured(env)) {
          return jsonResponse({ error: 'Brevo email service is not configured.' }, 400);
        }

        const code = generateWorkerVerificationCode();
        await d1Db.setPasswordResetCode(env.DB, user.id, code);

        const sendRes = await sendWorkerPasswordResetEmail(env, user.email, user.name, code);
        if (!sendRes.success) {
          return jsonResponse({ error: sendRes.error || 'Failed to send password reset email.' }, 400);
        }

        return jsonResponse({ message: 'A 6-digit password reset code has been sent to your email.' });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'Password reset request failed' }, 500);
      }
    }

    if (path === '/api/auth/reset-password' && method === 'POST') {
      try {
        const clientIp = getWorkerClientIp(request);
        const body = await parseWorkerJson(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        }
        const { email, code, newPassword } = body as any;
        if (!email || !code || !newPassword) {
          return jsonResponse({ error: 'Email, 6-digit code, and new password are required.' }, 400);
        }

        if (newPassword.length < 6) {
          return jsonResponse({ error: 'New password must be at least 6 characters long.' }, 400);
        }

        const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();
        const cleanCode = (typeof code === 'string' ? code : '').trim();

        const ipRate = checkWorkerRateLimit(
          `reset:ip:${clientIp}`,
          10,
          300000,
          'Too many reset attempts. Please wait 5 minutes.'
        );
        if (!ipRate.allowed) return workerRateLimitResponse(ipRate);

        const newHash = await hashPassword(newPassword);
        const result = await d1Db.verifyAndResetPassword(env.DB, normalizedEmail, cleanCode, newHash);
        if (!result.success) {
          return jsonResponse({ error: result.error || 'Password reset failed.' }, 400);
        }

        return jsonResponse({ message: 'Password reset successful! You can now sign in with your new password.' });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'Password reset failed' }, 500);
      }
    }

    if (path === '/api/auth/login' && method === 'POST') {
      try {
        const clientIp = getWorkerClientIp(request);
        const ipRate = checkWorkerRateLimit(
          `login:ip:${clientIp}`,
          10,
          60000,
          'Too many sign in attempts from this network. Please wait a minute.'
        );
        if (!ipRate.allowed) {
          return workerRateLimitResponse(ipRate);
        }

        const body = await parseWorkerJson(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        }
        const { email, password } = body as any;
        if (!email || !password) {
          return jsonResponse({ error: 'Email and password are required.' }, 400);
        }

        const normalizedEmail = email.trim().toLowerCase();
        const emailRate = checkWorkerRateLimit(
          `login:email:${normalizedEmail}`,
          6,
          60000,
          'Too many sign in attempts for this account. Please wait a minute.'
        );
        if (!emailRate.allowed) {
          return workerRateLimitResponse(emailRate);
        }

        const user = await d1Db.findUserByEmail(env.DB, normalizedEmail);
        if (!user) {
          return jsonResponse({ error: 'Invalid email or password.' }, 401);
        }

        if (user.status === 'banned') {
          return jsonResponse({ error: 'Your account has been suspended. Please contact support.' }, 403);
        }

        const { isValid: isPasswordValid, needsRehash } = await verifyPasswordMatch(password, user.passwordHash);
        if (!isPasswordValid) {
          return jsonResponse({ error: 'Invalid email or password.' }, 401);
        }

        // Automatic seamless rehash migration: upgrade legacy hash to bcrypt in Cloudflare D1
        if (needsRehash) {
          try {
            const upgradedHash = await hashPassword(password);
            await d1Db.updateUser(env.DB, user.id, { passwordHash: upgradedHash });
          } catch (rehashErr) {
            console.error('Failed to auto-upgrade legacy password hash to bcrypt in D1:', rehashErr);
          }
        }

        await d1Db.touchUserActivity(env.DB, user.id);
        const secret = getWorkerJwtSecret(env);
        if (!secret) {
          return jsonResponse(
            { error: 'Server authentication configuration error: JWT_SECRET secret binding is required.' },
            500
          );
        }
        const nowSec = Math.floor(Date.now() / 1000);
        const token = await signJwt({ id: user.id, email: user.email, exp: nowSec + 30 * 86400, sid: crypto.randomUUID() }, secret);

        return jsonResponse(
          {
            message: 'Sign in successful!',
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              memoryEnabled: user.memoryEnabled,
              preferredModel: user.preferredModel,
              avatarUrl: user.avatarUrl,
              isEmailVerified: user.isEmailVerified,
            },
            token,
          },
          200,
          {
            'Set-Cookie': `aestific_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
          }
        );
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'Login failed' }, 500);
      }
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      return jsonResponse({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          systemPrompt: user.systemPrompt,
          preferredModel: user.preferredModel,
          memoryEnabled: user.memoryEnabled,
          languagePreference: user.languagePreference,
          isEmailVerified: user.isEmailVerified,
        },
      });
    }

    if ((path === '/api/auth/profile' || path === '/api/auth/update-profile') && method === 'PATCH') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const updates = await parseWorkerJson(request);
      if (!updates) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
      const updated = await d1Db.updateUser(env.DB, user.id, updates);
      return jsonResponse({ user: updated });
    }

    if (path === '/api/auth/change-password' && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

      const clientIp = getWorkerClientIp(request);
      const userRate = checkWorkerRateLimit(
        `pw:user:${user.id}`,
        4,
        300000,
        'Too many password update attempts. Please wait 5 minutes.'
      );
      if (!userRate.allowed) {
        return workerRateLimitResponse(userRate);
      }

      const ipRate = checkWorkerRateLimit(
        `pw:ip:${clientIp}`,
        6,
        300000,
        'Too many password update attempts from this network.'
      );
      if (!ipRate.allowed) {
        return workerRateLimitResponse(ipRate);
      }

      const body = await parseWorkerJson(request);
      if (!body) {
        return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
      }
      const { currentPassword, newPassword } = body as any;
      if (!currentPassword || !newPassword) {
        return jsonResponse({ error: 'Both current and new passwords are required.' }, 400);
      }
      if (newPassword.length < 6) {
        return jsonResponse({ error: 'New password must be at least 6 characters long.' }, 400);
      }
      const { isValid: isCurValid } = await verifyPasswordMatch(currentPassword, user.passwordHash);
      if (!isCurValid) {
        return jsonResponse({ error: 'Current password is incorrect.' }, 400);
      }
      const newHash = await hashPassword(newPassword);
      await d1Db.updateUser(env.DB, user.id, { passwordHash: newHash });
      return jsonResponse({ message: 'Password updated successfully.' });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      return jsonResponse(
        { message: 'Signed out successfully.' },
        200,
        {
          'Set-Cookie': 'aestific_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        }
      );
    }

    if (path === '/api/auth/account' && method === 'DELETE') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      await d1Db.deleteUser(env.DB, user.id);
      return jsonResponse(
        { success: true, message: 'Account deleted permanently.' },
        200,
        {
          'Set-Cookie': 'aestific_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        }
      );
    }

    // --- Conversations Routes ---
    if (path === '/api/conversations' && method === 'GET') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const conversations = await d1Db.getConversations(env.DB, user.id);
      return jsonResponse(conversations);
    }

    if (path === '/api/conversations/archived' && method === 'GET') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const archived = await d1Db.getArchivedConversations(env.DB, user.id);
      return jsonResponse(archived);
    }

    if (path === '/api/conversations' && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const body = await parseWorkerJson(request);
      const conv = await d1Db.createConversation(
        env.DB,
        user.id,
        body?.title || 'New Conversation',
        body?.model || user.preferredModel || 'openai/gpt-oss-120b'
      );
      return jsonResponse({ conversation: conv }, 201);
    }

    if (path === '/api/conversations' && method === 'DELETE') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      await d1Db.clearUserConversations(env.DB, user.id);
      return jsonResponse({ success: true, message: 'All conversations cleared' });
    }

    // Conversation sub-routes: /api/conversations/:id...
    const convMatch = path.match(/^\/api\/conversations\/([^/]+)(\/(archive|unarchive|pin|unpin|messages|generate-title))?$/);
    if (convMatch) {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

      const convId = convMatch[1];
      const action = convMatch[3];

      if (!action) {
        if (method === 'GET') {
          const conv = await d1Db.getConversationById(env.DB, convId, user.id);
          if (!conv) return jsonResponse({ error: 'Conversation not found' }, 404);
          return jsonResponse({ conversation: conv });
        }
        if (method === 'PATCH') {
          const updates = await parseWorkerJson(request);
          if (!updates) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
          const updated = await d1Db.updateConversation(env.DB, convId, user.id, updates);
          if (!updated) return jsonResponse({ error: 'Conversation not found' }, 404);
          return jsonResponse({ conversation: updated });
        }
        if (method === 'DELETE') {
          const deleted = await d1Db.deleteConversation(env.DB, convId, user.id);
          return jsonResponse({ success: deleted });
        }
      } else if (action === 'messages' && method === 'GET') {
        const conv = await d1Db.getConversationById(env.DB, convId, user.id);
        if (!conv) return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
        const messages = await d1Db.getMessages(env.DB, convId);
        return jsonResponse(messages);
      } else if (action === 'pin' && method === 'POST') {
        const updated = await d1Db.updateConversation(env.DB, convId, user.id, { isPinned: true });
        if (!updated) return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
        return jsonResponse({ conversation: updated });
      } else if (action === 'unpin' && method === 'POST') {
        const updated = await d1Db.updateConversation(env.DB, convId, user.id, { isPinned: false });
        if (!updated) return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
        return jsonResponse({ conversation: updated });
      } else if (action === 'archive' && method === 'POST') {
        const updated = await d1Db.updateConversation(env.DB, convId, user.id, { isArchived: true });
        if (!updated) return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
        return jsonResponse({ conversation: updated });
      } else if (action === 'unarchive' && method === 'POST') {
        const updated = await d1Db.updateConversation(env.DB, convId, user.id, { isArchived: false });
        if (!updated) return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
        return jsonResponse({ conversation: updated });
      } else if (action === 'generate-title' && method === 'POST') {
        const conv = await d1Db.getConversationById(env.DB, convId, user.id);
        if (!conv) return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
        const history = await d1Db.getMessages(env.DB, convId);
        if (history.length > 0) {
          const firstMsg = history[0].content.slice(0, 30);
          const updated = await d1Db.updateConversation(env.DB, convId, user.id, { title: firstMsg });
          return jsonResponse({ conversation: updated });
        }
        return jsonResponse({ error: 'No messages to generate title' }, 400);
      }
    }

    // --- Messages Reactions ---
    const reactionMatch = path.match(/^\/api\/messages\/([^/]+)\/(reaction|react)$/);
    if (reactionMatch && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const msgId = reactionMatch[1];
      const body = await parseWorkerJson(request);
      if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
      const { liked, disliked } = body as any;
      const updated = await d1Db.updateMessageReaction(env.DB, msgId, user.id, liked, disliked);
      return jsonResponse({ success: true, message: updated });
    }

    // --- AI Chat Streaming (SSE) Route ---
    if (path === '/api/chat/stream' && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

      const clientIp = getWorkerClientIp(request);

      // Multi-tier Rate Limiting for AI requests
      const userBurstRate = checkWorkerRateLimit(
        `chat:user:burst:${user.id}`,
        8,
        10000,
        'Sending messages too fast. Please pause for a moment.'
      );
      if (!userBurstRate.allowed) {
        return workerRateLimitResponse(userBurstRate);
      }

      const userMinRate = checkWorkerRateLimit(
        `chat:user:min:${user.id}`,
        40,
        60000,
        'Rate limit reached: maximum 40 messages per minute.'
      );
      if (!userMinRate.allowed) {
        return workerRateLimitResponse(userMinRate);
      }

      const ipMinRate = checkWorkerRateLimit(
        `chat:ip:${clientIp}`,
        60,
        60000,
        'Network rate limit exceeded. Please wait a minute.'
      );
      if (!ipMinRate.allowed) {
        return workerRateLimitResponse(ipMinRate);
      }

      try {
        const body = await parseWorkerJson(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        }
        const { conversationId, message, model = 'openai/gpt-oss-120b', attachments = [] } = body as any;
        if (!conversationId || (!message && attachments.length === 0)) {
          return jsonResponse({ error: 'conversationId and message are required' }, 400);
        }

        const conv = await d1Db.getConversationById(env.DB, conversationId, user.id);
        if (!conv) {
          return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
        }

        const lockKey = `chat:${user.id}:${conversationId}`;
        if (activeWorkerInferenceLocks.has(lockKey)) {
          return jsonResponse(
            { error: 'A response is currently generating in this chat. Please wait for it to finish.' },
            429,
            { 'Retry-After': '2' }
          );
        }
        activeWorkerInferenceLocks.add(lockKey);

        // 1. Save user message to Cloudflare D1 (Edge target DB)
        const fileIds = attachments.map((a: any) => a.id).filter(Boolean);
        const userMsg = await d1Db.createMessage(env.DB, {
          conversationId,
          userId: user.id,
          role: 'user',
          content: message || '',
          model,
          fileIds,
        });

        // 2. Fetch past 30-day messages from D1 for conversational context
        const history = await d1Db.getMessages(env.DB, conversationId);

        // 3. User account memory retrieval
        let memoryContext = '';
        if (user.memoryEnabled) {
          const memories = await d1Db.retrieveRelevantMemories(env.DB, user.id, message || '', 4);
          if (memories.length > 0) {
            memoryContext = `\n\nUser Profile & Facts (Account Memory):\n${memories.map((m) => `- ${m.content}`).join('\n')}`;
          }
        }

        // 4. File attachments context
        let attachmentContext = '';
        if (attachments && attachments.length > 0) {
          attachmentContext = `\n\nUploaded Attachments:\n${attachments
            .map((a: any) => `- File: ${a.name} (${a.type})${a.extractedText ? `\nContent:\n${a.extractedText.slice(0, 1500)}` : ''}`)
            .join('\n')}`;
        }

        const defaultWorkerPrompt = `You are Aestific, an AI platform that brings together different AI models and intelligently uses the one best suited for each task—all through one simple interface. Aestific was founded and built by Atif Al Wasi.

CRITICAL IDENTITY & FOUNDER ARCHITECTURE:
- For "What is Aestific?" or general identity questions ("What are you?", "Who are you?", "Tell me about yourself.", "What is your identity?"): use core answer: "Aestific is an AI platform that brings together different AI models and intelligently uses the one best suited for each task—all through one simple interface. Aestific was founded and built by Atif Al Wasi."
- For questions specifically asking who created/founded Aestific ("Who created you?", "Who founded Aestific?", "Who made Aestific?"): use core answer: "I was created and founded by Atif Al Wasi, the founder of Aestific."
- Do not invent another founder, company, team, person, or organization.
- Do not say that Aestific was created by the AI itself.
- Keep answers natural and conversational.
- Preserve this identity consistently across all conversations and personalization settings.`;

        const systemPrompt =
          (user.systemPrompt || defaultWorkerPrompt) +
          memoryContext +
          attachmentContext;

        const groqMessages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
        ];

        const apiKey = getWorkerGroqKey(env);
        const actualModel = model.includes('/') ? model.split('/')[1] : model;

        // Create a ReadableStream SSE channel for real-time streaming
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        const sendEvent = async (event: string, data: any) => {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          await writer.write(encoder.encode(payload));
        };

        // Asynchronous streaming inference
        (async () => {
          try {
            await sendEvent('user_message', { userMessage: userMsg });
            await sendEvent('start', { modelUsed: actualModel });

            if (!apiKey) {
              const fallbackText = "I am Aestific. Please configure the `GROQ_API_KEY` secret in your Cloudflare environment for real-time AI responses.";
              for (const word of fallbackText.split(' ')) {
                await sendEvent('token', { token: word + ' ' });
              }
              const assistantMsg = await d1Db.createMessage(env.DB, {
                conversationId,
                userId: user.id,
                role: 'assistant',
                content: fallbackText,
                model: actualModel,
              });
              await d1Db.incrementDailyUsage(env.DB, user.id, { chatCount: 1 });
              await sendEvent('done', { assistantMessage: assistantMsg });
              await writer.close();
              return;
            }

            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: actualModel,
                messages: groqMessages,
                stream: true,
                temperature: 0.7,
                max_tokens: 2048,
              }),
            });

            if (!groqRes.ok || !groqRes.body) {
              const errBody = await groqRes.text();
              await sendEvent('error', { error: `Groq API Error: ${errBody}` });
              await writer.close();
              return;
            }

            const reader = groqRes.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';
            let buffer = '';

            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const dataPart = trimmed.slice(5).trim();
                if (dataPart === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(dataPart);
                  const token = parsed.choices?.[0]?.delta?.content;
                  if (token) {
                    accumulatedText += token;
                    await sendEvent('token', { token });
                  }
                } catch {}
              }
            }

            // Save assistant message to D1
            const assistantMsg = await d1Db.createMessage(env.DB, {
              conversationId,
              userId: user.id,
              role: 'assistant',
              content: accumulatedText,
              model: actualModel,
            });

            await d1Db.incrementDailyUsage(env.DB, user.id, { chatCount: 1 });
            await sendEvent('done', { assistantMessage: assistantMsg });
            activeWorkerInferenceLocks.delete(lockKey);
            await writer.close();
          } catch (streamErr: any) {
            activeWorkerInferenceLocks.delete(lockKey);
            await sendEvent('error', { error: streamErr?.message || 'Streaming failed' }).catch(() => {});
            await writer.close().catch(() => {});
          }
        })();

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'Chat stream failed' }, 500);
      }
    }

    // --- Standard Chat Route (Non-streaming) ---
    if (path === '/api/chat' && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

      const clientIp = getWorkerClientIp(request);

      const userBurstRate = checkWorkerRateLimit(
        `chat:user:burst:${user.id}`,
        8,
        10000,
        'Sending messages too fast. Please pause for a moment.'
      );
      if (!userBurstRate.allowed) {
        return workerRateLimitResponse(userBurstRate);
      }

      const userMinRate = checkWorkerRateLimit(
        `chat:user:min:${user.id}`,
        40,
        60000,
        'Rate limit reached: maximum 40 messages per minute.'
      );
      if (!userMinRate.allowed) {
        return workerRateLimitResponse(userMinRate);
      }

      const ipMinRate = checkWorkerRateLimit(
        `chat:ip:${clientIp}`,
        60,
        60000,
        'Network rate limit exceeded. Please wait a minute.'
      );
      if (!ipMinRate.allowed) {
        return workerRateLimitResponse(ipMinRate);
      }

      try {
        const body = await parseWorkerJson(request);
        if (!body) {
          return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        }
        const { conversationId, message, model = 'openai/gpt-oss-120b' } = body as any;
        if (!conversationId || !message) {
          return jsonResponse({ error: 'conversationId and message are required' }, 400);
        }

        const conv = await d1Db.getConversationById(env.DB, conversationId, user.id);
        if (!conv) {
          return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
        }

        const userMsg = await d1Db.createMessage(env.DB, {
          conversationId,
          userId: user.id,
          role: 'user',
          content: message,
          model,
        });

        const history = await d1Db.getMessages(env.DB, conversationId);

        let memoryContext = '';
        if (user.memoryEnabled) {
          const memories = await d1Db.retrieveRelevantMemories(env.DB, user.id, message, 4);
          if (memories.length > 0) {
            memoryContext = `\n\nUser Profile & Facts (Account Memory):\n${memories.map((m) => `- ${m.content}`).join('\n')}`;
          }
        }

        const defaultWorkerPrompt = `You are Aestific, an AI platform that brings together different AI models and intelligently uses the one best suited for each task—all through one simple interface. Aestific was founded and built by Atif Al Wasi.

CRITICAL IDENTITY & FOUNDER ARCHITECTURE:
- For "What is Aestific?" or general identity questions ("What are you?", "Who are you?", "Tell me about yourself.", "What is your identity?"): use core answer: "Aestific is an AI platform that brings together different AI models and intelligently uses the one best suited for each task—all through one simple interface. Aestific was founded and built by Atif Al Wasi."
- For questions specifically asking who created/founded Aestific ("Who created you?", "Who founded Aestific?", "Who made Aestific?"): use core answer: "I was created and founded by Atif Al Wasi, the founder of Aestific."
- Do not invent another founder, company, team, person, or organization.
- Do not say that Aestific was created by the AI itself.
- Keep answers natural and conversational.
- Preserve this identity consistently across all conversations and personalization settings.`;

        const systemPrompt = (user.systemPrompt || defaultWorkerPrompt) + memoryContext;
        const actualModel = model.includes('/') ? model.split('/')[1] : model;
        const groqMessages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
        ];

        const apiKey = getWorkerGroqKey(env);
        let assistantContent = 'Aestific is ready to assist you.';

        if (apiKey) {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: actualModel,
              messages: groqMessages,
              temperature: 0.7,
              max_tokens: 2048,
            }),
          });
          if (groqRes.ok) {
            const groqData: any = await groqRes.json();
            assistantContent = groqData.choices?.[0]?.message?.content || assistantContent;
          }
        }

        const assistantMsg = await d1Db.createMessage(env.DB, {
          conversationId,
          userId: user.id,
          role: 'assistant',
          content: assistantContent,
          model: actualModel,
        });

        await d1Db.incrementDailyUsage(env.DB, user.id, { chatCount: 1 });

        return jsonResponse({
          message: assistantMsg,
          userMessage: userMsg,
        });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'Chat generation failed' }, 500);
      }
    }

    // --- Memories Routes ---
    if (path === '/api/memories' && method === 'GET') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const memories = await d1Db.getMemories(env.DB, user.id);
      return jsonResponse(memories);
    }

    if (path === '/api/memories' && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const body = await parseWorkerJson(request);
      if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
      const { content, source, category } = body as any;
      if (!content) return jsonResponse({ error: 'Content is required' }, 400);
      const mem = await d1Db.createMemory(env.DB, { userId: user.id, content, source, category });
      return jsonResponse({ memory: mem }, 201);
    }

    if (path === '/api/memories' && method === 'DELETE') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      await d1Db.clearMemories(env.DB, user.id);
      return jsonResponse({ success: true });
    }

    if (path === '/api/memories/toggle' && method === 'PATCH') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const body = await parseWorkerJson(request);
      if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
      const { enabled } = body as any;
      await d1Db.updateUser(env.DB, user.id, { memoryEnabled: Boolean(enabled) });
      return jsonResponse({ success: true, memoryEnabled: Boolean(enabled) });
    }

    const memDelMatch = path.match(/^\/api\/memories\/([^/]+)$/);
    if (memDelMatch && method === 'DELETE') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const deleted = await d1Db.deleteMemory(env.DB, memDelMatch[1], user.id);
      return jsonResponse({ success: deleted });
    }

    // --- Files Metadata & Upload Routes ---
    if (path === '/api/files' && method === 'GET') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const type = url.searchParams.get('type') || undefined;
      const files = await d1Db.getFiles(env.DB, user.id, type);
      return jsonResponse(files);
    }

    if (path === '/api/files/upload' && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

      const clientIp = getWorkerClientIp(request);
      const userBurst = checkWorkerRateLimit(
        `file:user:burst:${user.id}`,
        8,
        30000,
        'Uploading files too quickly. Please wait 30 seconds.'
      );
      if (!userBurst.allowed) return workerRateLimitResponse(userBurst);

      const user2Min = checkWorkerRateLimit(
        `file:user:2min:${user.id}`,
        25,
        120000,
        'File upload rate limit reached. Please wait a couple minutes.'
      );
      if (!user2Min.allowed) return workerRateLimitResponse(user2Min);

      const ipRate = checkWorkerRateLimit(
        `file:ip:${clientIp}`,
        40,
        120000,
        'Network file upload rate limit exceeded. Please wait a couple minutes.'
      );
      if (!ipRate.allowed) return workerRateLimitResponse(ipRate);

      try {
        const formData = await request.formData();
        const file = formData.get('file') as any;
        const conversationId = (formData.get('conversationId') as string) || undefined;

        if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
          return jsonResponse({ error: 'No file uploaded or invalid file payload.' }, 400);
        }

        if (conversationId) {
          const conv = await d1Db.getConversationById(env.DB, conversationId, user.id);
          if (!conv) {
            return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
          }
        }

        const rawOriginalName = file.name || 'unnamed_file';
        const sanitizedOriginalName = sanitizeWorkerFilename(rawOriginalName);
        const mimeType = (file.type || 'application/octet-stream').toLowerCase();
        const sizeBytes = file.size || 0;

        const cleanExt = rawOriginalName.includes('.')
          ? '.' + rawOriginalName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')
          : '';

        // Step 1: Server-side validation
        if (BLOCKED_EXTENSIONS.has(cleanExt)) {
          return jsonResponse({ error: `Security Violation: Prohibited file extension ${cleanExt}` }, 400);
        }

        if (ALLOWED_IMAGE_EXTS.has(cleanExt) || mimeType.startsWith('image/')) {
          if (sizeBytes > MAX_IMAGE_SIZE) {
            return jsonResponse({ error: `Image file size exceeds the 25MB limit (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB).` }, 400);
          }
        } else if (ALLOWED_AUDIO_EXTS.has(cleanExt) || mimeType.startsWith('audio/')) {
          if (sizeBytes > MAX_AUDIO_SIZE) {
            return jsonResponse({ error: `Audio file size exceeds the 25MB limit (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB).` }, 400);
          }
        } else if (ALLOWED_VIDEO_EXTS.has(cleanExt) || mimeType.startsWith('video/')) {
          if (sizeBytes > MAX_VIDEO_SIZE) {
            return jsonResponse({ error: `Video file size exceeds the 35MB limit (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB).` }, 400);
          }
        } else if (cleanExt === '.pdf' || mimeType === 'application/pdf') {
          if (sizeBytes > MAX_DOC_SIZE) {
            return jsonResponse({ error: `PDF document size exceeds the 50MB limit (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB).` }, 400);
          }
        } else if (ALLOWED_DOC_EXTS.has(cleanExt) || mimeType.startsWith('text/')) {
          if (sizeBytes > 10 * 1024 * 1024) {
            return jsonResponse({ error: `Text/code document size exceeds the 10MB limit.` }, 400);
          }
        } else if (sizeBytes > MAX_TOTAL_UPLOAD_SIZE) {
          return jsonResponse({ error: `File size exceeds the 50MB total maximum upload limit.` }, 400);
        }

        const fileArrayBuffer = await file.arrayBuffer();
        const fileUint8 = new Uint8Array(fileArrayBuffer);

        const magicVal = validateWorkerFileMagicBytes(fileUint8, cleanExt, mimeType);
        if (!magicVal.isValid) {
          return jsonResponse({ error: magicVal.error || 'File signature mismatch.' }, 400);
        }

        const { uniqueFileId, storagePath } = generateWorkerStoragePath(user.id, rawOriginalName);
        const bucketName = getWorkerConfig(env, 'SUPABASE_BUCKET_NAME') || 'aestific-files';
        const supabaseUrl = getWorkerConfig(env, 'SUPABASE_URL');
        const supabaseKey = getWorkerConfig(env, 'SUPABASE_SERVICE_ROLE_KEY');

        // Step 2: Storage Upload (Synchronous verification before saving metadata)
        if (supabaseUrl && supabaseKey) {
          const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${storagePath}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
              'Content-Type': mimeType || 'application/octet-stream',
              'x-upsert': 'true',
            },
            body: fileArrayBuffer,
          });

          if (!uploadRes.ok) {
            const errText = await uploadRes.text().catch(() => 'Storage server error');
            console.error('[Worker Supabase Upload Failed]:', errText);
            return jsonResponse({ error: `Failed to upload file to storage: ${uploadRes.status}` }, 500);
          }
        }

        const fileType: 'pdf' | 'image' | 'video' | 'audio' | 'other' = mimeType.startsWith('image/')
          ? 'image'
          : mimeType === 'application/pdf' || cleanExt === '.pdf'
          ? 'pdf'
          : mimeType.startsWith('audio/')
          ? 'audio'
          : mimeType.startsWith('video/')
          ? 'video'
          : 'other';

        let extractedText: string | undefined;
        if (fileType === 'other' || mimeType.startsWith('text/')) {
          try {
            const textDecoder = new TextDecoder('utf-8', { fatal: false });
            const decoded = textDecoder.decode(fileUint8.slice(0, 100000));
            if (decoded && !decoded.includes('\0\0\0')) {
              extractedText = decoded;
            }
          } catch {}
        }

        // Step 3: Database Metadata Save (Only executed after storage upload succeeds)
        let fileRecord: FileRecord;
        try {
          fileRecord = await d1Db.createFileRecord(env.DB, {
            userId: user.id,
            conversationId,
            storageProvider: 'supabase',
            bucketName,
            storagePath,
            uniqueFileId,
            filename: uniqueFileId,
            originalName: sanitizedOriginalName,
            type: fileType,
            mimeType,
            sizeBytes,
            url: `/api/files/download/${uniqueFileId}`,
            extractedText,
          });
        } catch (dbErr: any) {
          // Compensation Cleanup: Delete from Supabase Storage if DB save fails
          if (supabaseUrl && supabaseKey) {
            await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${storagePath}`, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                apikey: supabaseKey,
              },
            }).catch(() => {});
          }
          return jsonResponse({ error: `Failed to save file metadata: ${dbErr?.message || 'Database error'}` }, 500);
        }

        await d1Db.incrementDailyUsage(env.DB, user.id, { fileCount: 1 });

        return jsonResponse({
          message: 'File uploaded successfully.',
          file: fileRecord,
        }, 201);
      } catch (err: any) {
        console.error('[Worker File Upload Error]:', err);
        return jsonResponse({ error: err?.message || 'File upload failed' }, 500);
      }
    }

    // --- File Streaming / Download Routes ---
    const fileDownloadMatch = path.match(/^\/api\/files\/download\/([^/]+)$/) || path.match(/^\/api\/media\/([^/]+)$/);
    if (fileDownloadMatch && method === 'GET') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const identifier = fileDownloadMatch[1];

      // Strict ownership check in D1
      let fileRecord = await d1Db.getFileByFilename(env.DB, identifier, user.id);
      if (!fileRecord) {
        fileRecord = await d1Db.getFileById(env.DB, identifier, user.id);
      }

      if (!fileRecord) {
        // Check if file exists globally to report 403 access denied vs 404
        const anyFile = await d1Db.findFileByFilename(env.DB, identifier);
        if (anyFile && anyFile.userId !== user.id) {
          return jsonResponse({ error: 'Access denied.' }, 403);
        }
        return jsonResponse({ error: 'File not found.' }, 404);
      }

      const supabaseUrl = getWorkerConfig(env, 'SUPABASE_URL');
      const supabaseKey = getWorkerConfig(env, 'SUPABASE_SERVICE_ROLE_KEY');

      if (supabaseUrl && supabaseKey && fileRecord.storagePath) {
        const bucketName = fileRecord.bucketName || getWorkerConfig(env, 'SUPABASE_BUCKET_NAME') || 'aestific-files';
        const storageRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${fileRecord.storagePath}`, {
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
        });

        if (!storageRes.ok) {
          return jsonResponse({ error: 'File storage unavailable.' }, 404);
        }

        const safeAscii = fileRecord.originalName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
        const safeEncoded = encodeURIComponent(fileRecord.originalName);

        return new Response(storageRes.body, {
          status: 200,
          headers: {
            'Content-Type': fileRecord.mimeType || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${safeAscii}"; filename*=UTF-8''${safeEncoded}`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=86400',
          },
        });
      }

      return jsonResponse({ error: 'Storage provider not configured.' }, 404);
    }

    const fileDelMatch = path.match(/^\/api\/files\/([^/]+)$/);
    if (fileDelMatch) {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const fileId = fileDelMatch[1];

      if (method === 'GET') {
        const file = await d1Db.getFileById(env.DB, fileId, user.id);
        if (!file) return jsonResponse({ error: 'File not found' }, 404);
        return jsonResponse(file);
      }

      if (method === 'DELETE') {
        const file = await d1Db.getFileById(env.DB, fileId, user.id);
        if (!file) return jsonResponse({ error: 'File not found' }, 404);

        const supabaseUrl = getWorkerConfig(env, 'SUPABASE_URL');
        const supabaseKey = getWorkerConfig(env, 'SUPABASE_SERVICE_ROLE_KEY');
        if (supabaseUrl && supabaseKey && file.storagePath) {
          const bucketName = file.bucketName || getWorkerConfig(env, 'SUPABASE_BUCKET_NAME') || 'aestific-files';
          await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${file.storagePath}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
            },
          }).catch(() => {});
        }
        const deleted = await d1Db.deleteFileRecord(env.DB, fileId, user.id);
        return jsonResponse({ success: deleted, message: 'File deleted.' });
      }
    }

    // --- Image Generation Route ---
    if (path === '/api/images/generate' && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

      const clientIp = getWorkerClientIp(request);
      const userBurst = checkWorkerRateLimit(
        `img:user:burst:${user.id}`,
        3,
        30000,
        'Generating images too quickly. Please wait 30 seconds.'
      );
      if (!userBurst.allowed) return workerRateLimitResponse(userBurst);

      const user2Min = checkWorkerRateLimit(
        `img:user:2min:${user.id}`,
        10,
        120000,
        'Image generation rate limit reached. Please wait a couple minutes.'
      );
      if (!user2Min.allowed) return workerRateLimitResponse(user2Min);

      const ipRate = checkWorkerRateLimit(
        `img:ip:${clientIp}`,
        20,
        120000,
        'Network image generation rate limit exceeded. Please wait a couple minutes.'
      );
      if (!ipRate.allowed) return workerRateLimitResponse(ipRate);

      try {
        const body = await parseWorkerJson(request);
        if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        const { prompt, aspectRatio = '1:1', style = 'photorealistic' } = body as any;
        if (!prompt) return jsonResponse({ error: 'Prompt is required' }, 400);

        const width = aspectRatio === '16:9' ? 1280 : aspectRatio === '9:16' ? 720 : 1024;
        const height = aspectRatio === '16:9' ? 720 : aspectRatio === '9:16' ? 1280 : 1024;
        const encodedPrompt = encodeURIComponent(`${prompt}, ${style} style, 8k resolution, photorealistic, masterpiece`);
        const generatedImageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Date.now()}`;

        await d1Db.incrementDailyUsage(env.DB, user.id, { photoCount: 1 });

        return jsonResponse({
          image: {
            url: generatedImageUrl,
            prompt,
            aspectRatio,
            style,
            createdAt: new Date().toISOString(),
          },
        });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'Image generation failed' }, 500);
      }
    }

    // --- Voice Transcription Route (Groq Whisper) ---
    if (path === '/api/voice/transcribe' && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);

      const clientIp = getWorkerClientIp(request);
      const userBurst = checkWorkerRateLimit(
        `voice:user:burst:${user.id}`,
        5,
        30000,
        'Transcribing audio too quickly. Please wait 30 seconds.'
      );
      if (!userBurst.allowed) return workerRateLimitResponse(userBurst);

      const user2Min = checkWorkerRateLimit(
        `voice:user:2min:${user.id}`,
        15,
        120000,
        'Voice transcription rate limit reached. Please wait a couple minutes.'
      );
      if (!user2Min.allowed) return workerRateLimitResponse(user2Min);

      const ipRate = checkWorkerRateLimit(
        `voice:ip:${clientIp}`,
        25,
        120000,
        'Network voice transcription rate limit exceeded. Please wait a couple minutes.'
      );
      if (!ipRate.allowed) return workerRateLimitResponse(ipRate);

      try {
        const formData = await request.formData();
        const audioFile = formData.get('audio') as any;
        const duration = parseFloat((formData.get('duration') as string) || '0');

        if (!audioFile || typeof audioFile === 'string' || typeof audioFile.arrayBuffer !== 'function') {
          return jsonResponse({ error: 'No audio provided or invalid audio payload.' }, 400);
        }

        const sizeBytes = audioFile.size || 0;
        if (sizeBytes > MAX_AUDIO_SIZE) {
          return jsonResponse({ error: `Audio recording exceeds the 25MB limit.` }, 400);
        }

        const audioArrayBuffer = await audioFile.arrayBuffer();
        const apiKey = getWorkerGroqKey(env);
        let transcription = 'Voice note received.';

        if (apiKey) {
          const whisperData = new FormData();
          whisperData.append('file', new Blob([audioArrayBuffer], { type: audioFile.type || 'audio/webm' }), 'voice.webm');
          whisperData.append('model', 'whisper-large-v3');

          const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            body: whisperData,
          });

          if (whisperRes.ok) {
            const whisperJson: any = await whisperRes.json();
            transcription = whisperJson.text || transcription;
          }
        }

        const { uniqueFileId, storagePath } = generateWorkerStoragePath(user.id, 'voice.webm');
        const bucketName = getWorkerConfig(env, 'SUPABASE_BUCKET_NAME') || 'aestific-files';
        const supabaseUrl = getWorkerConfig(env, 'SUPABASE_URL');
        const supabaseKey = getWorkerConfig(env, 'SUPABASE_SERVICE_ROLE_KEY');

        // Synchronous storage upload before saving metadata
        if (supabaseUrl && supabaseKey) {
          const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${storagePath}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
              'Content-Type': audioFile.type || 'audio/webm',
              'x-upsert': 'true',
            },
            body: audioArrayBuffer,
          });

          if (!uploadRes.ok) {
            return jsonResponse({ error: 'Failed to upload voice note to storage.' }, 500);
          }
        }

        const originalName = `Voice Note (${new Date().toLocaleTimeString()})`;
        let fileRecord: FileRecord;
        try {
          fileRecord = await d1Db.createFileRecord(env.DB, {
            userId: user.id,
            storageProvider: 'supabase',
            bucketName,
            storagePath,
            uniqueFileId,
            filename: uniqueFileId,
            originalName,
            type: 'audio',
            mimeType: audioFile.type || 'audio/webm',
            sizeBytes,
            url: `/api/files/download/${uniqueFileId}`,
            extractedText: transcription,
            duration,
          });
        } catch (dbErr: any) {
          if (supabaseUrl && supabaseKey) {
            await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${storagePath}`, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                apikey: supabaseKey,
              },
            }).catch(() => {});
          }
          return jsonResponse({ error: `Failed to save audio metadata: ${dbErr?.message || 'Database error'}` }, 500);
        }

        await d1Db.incrementDailyUsage(env.DB, user.id, { fileCount: 1 });

        return jsonResponse({
          transcription,
          file: fileRecord,
        });
      } catch (err: any) {
        console.error('[Worker Voice Transcription Error]:', err);
        return jsonResponse({ error: err?.message || 'Voice transcription failed' }, 500);
      }
    }

    // --- Usage Telemetry Route ---
    if (path === '/api/usage' && method === 'GET') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const usage = await d1Db.getDailyUsage(env.DB, user.id);
      return jsonResponse({
        usage: {
          chatCount: usage?.chatCount || 0,
          photoCount: usage?.photoCount || 0,
          fileCount: usage?.fileCount || 0,
        },
      });
    }

    // --- Support Tickets Routes ---
    if ((path === '/api/support' || path === '/api/support/tickets') && method === 'GET') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const tickets = await d1Db.getUserSupportTickets(env.DB, user.id);
      return jsonResponse({ tickets });
    }

    if ((path === '/api/support' || path === '/api/support/tickets') && method === 'POST') {
      const user = await authenticate(request, env);
      if (!user) return jsonResponse({ error: 'Not authenticated' }, 401);
      const body = await parseWorkerJson(request);
      if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
      const { subject, message } = body as any;
      if (!subject || !message) return jsonResponse({ error: 'Subject and message are required' }, 400);
      const ticket = await d1Db.createSupportTicket(env.DB, {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        subject,
        message,
      });
      return jsonResponse({ ticket, message: 'Ticket submitted successfully' }, 201);
    }

    // --- Admin Endpoints (Require Admin Auth, Authorization Verification, IP Rate Limiting, and Audit Logging) ---
    if (path.startsWith('/api/admin/')) {
      const clientIp = getWorkerClientIp(request);
      const adminRate = checkWorkerRateLimit(
        `admin:api:ip:${clientIp}`,
        60,
        60000,
        'Too many admin requests. Please wait a moment.'
      );
      if (!adminRate.allowed) return workerRateLimitResponse(adminRate);

      const isGatewayPreAuthRoute =
        path === '/api/admin/check-access' ||
        path === '/api/admin/gateway-hints' ||
        path === '/api/admin/verify-step' ||
        path === '/api/admin/logout';
      const authResult = await authenticateAdmin(request, env, !isGatewayPreAuthRoute);
      if (!authResult.success || !authResult.admin) {
        return jsonResponse({ error: authResult.error || 'Access denied' }, authResult.status || 401);
      }
      const admin = authResult.admin;

      // Check Admin Candidate Access (for discreet entry and direct routes)
      if (path === '/api/admin/check-access' && method === 'GET') {
        return jsonResponse({ success: true, authorized: true });
      }

      // Gateway Hints: Only accessible by authenticated administrators
      if (path === '/api/admin/gateway-hints' && method === 'GET') {
        const hintRate = checkWorkerRateLimit(`admin:hints:ip:${clientIp}`, 30, 60000);
        if (!hintRate.allowed) return workerRateLimitResponse(hintRate);

        return jsonResponse({
          success: true,
          steps: [
            { step: 1, title: 'Step 01' },
            { step: 2, title: 'Step 02' },
            { step: 3, title: 'Step 03' },
            { step: 4, title: 'Step 04' },
            { step: 5, title: 'Step 05' },
          ],
          message: 'Gateway step sequence verified.',
        });
      }

      // Admin Logout
      if (path === '/api/admin/logout' && method === 'POST') {
        revokeWorkerAdminSession(undefined, admin.userId);
        if (admin.adminName) revokeWorkerAdminByName(admin.adminName);
        await d1Db.addAdminLog(env.DB, {
          adminName: admin.adminName,
          ip: clientIp,
          action: 'ADMIN_LOGOUT',
          details: `Admin session terminated and revoked for ${admin.email || admin.adminName}. Client IP: ${clientIp}`,
        });
        return jsonResponse(
          { success: true, message: 'Admin signed out successfully.' },
          200,
          {
            'Set-Cookie': `aestific_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
          }
        );
      }

      // Step Verification: Only accessible by authenticated administrators
      if (path === '/api/admin/verify-step' && method === 'POST') {
        const verifyRate = checkWorkerRateLimit(
          `admin:verify:ip:${clientIp}`,
          15,
          60000,
          'Too many admin verification attempts. Please wait 1 minute.'
        );
        if (!verifyRate.allowed) return workerRateLimitResponse(verifyRate);

        const ipFailRate = checkWorkerRateLimit(
          `admin:verify:failed:ip:${clientIp}`,
          5,
          300000,
          'Too many failed admin verification attempts. Please wait 5 minutes before trying again.'
        );
        if (!ipFailRate.allowed) return workerRateLimitResponse(ipFailRate);

        const userKey = admin.userId || admin.email || 'unknown';
        const userFailRate = checkWorkerRateLimit(
          `admin:verify:failed:user:${userKey}`,
          5,
          300000,
          'Too many failed admin verification attempts for this account. Please wait 5 minutes.'
        );
        if (!userFailRate.allowed) return workerRateLimitResponse(userFailRate);

        try {
          const body = await parseWorkerJson(request);
          if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
          const { step, code, adminName: inputAdminName } = body as any;
          if (step === undefined || typeof step !== 'number' || step < 1 || step > 5) {
            return jsonResponse({ error: 'Invalid verification step.' }, 400);
          }

          // Step 1: Start sequence
          if (step === 1) {
            const configuredCode = getWorkerConfig(env, 'ADMIN_STEP_1');
            if (!configuredCode || !configuredCode.toString().trim()) {
              return jsonResponse(
                { error: 'Step 1 secret password (ADMIN_STEP_1) is not configured in Secrets.' },
                503
              );
            }
            const expectedCode = configuredCode.toString().trim();
            const rawInput = (code || '').toString().trim().replace(/^["']|["']$/g, '');

            if (!rawInput || rawInput !== expectedCode) {
              await d1Db.addAdminLog(env.DB, {
                adminName: admin.email || admin.adminName,
                ip: clientIp,
                action: 'ADMIN_STEP_FAILED',
                details: `Verification failed for Step 1. Client IP: ${clientIp}`,
              });
              return jsonResponse({ error: 'Incorrect Step 1 secret password. Access denied.' }, 400);
            }

            startWorkerVerificationSession(userKey, admin.email || '');
            await d1Db.addAdminLog(env.DB, {
              adminName: admin.email || admin.adminName,
              ip: clientIp,
              action: 'ADMIN_STEP_SUCCESS',
              details: `Successfully passed verification Step 1. Client IP: ${clientIp}`,
            });

            return jsonResponse({ success: true, stepCompleted: 1, nextStep: 2 });
          }

          // Steps 2-4: Sequential progress
          if (step >= 2 && step <= 4) {
            const activeSession = getWorkerVerificationSession(userKey);
            if (!activeSession) {
              await d1Db.addAdminLog(env.DB, {
                adminName: admin.email || admin.adminName,
                ip: clientIp,
                action: 'ADMIN_STEP_EXPIRED',
                details: `Verification sequence expired or not found for Step ${step}. Client IP: ${clientIp}`,
              });
              return jsonResponse({
                error: 'Verification session expired. Please restart the verification sequence.',
                expired: true,
              }, 400);
            }

            if (activeSession.completedStep !== step - 1) {
              return jsonResponse({
                error: 'Invalid verification sequence. Please complete steps in sequential order.',
              }, 400);
            }

            const configuredCode = getWorkerConfig(env, `ADMIN_STEP_${step}`);
            if (!configuredCode || !configuredCode.toString().trim()) {
              return jsonResponse(
                { error: `Step ${step} secret password (ADMIN_STEP_${step}) is not configured in Secrets.` },
                503
              );
            }
            const expectedCode = configuredCode.toString().trim();
            const rawInput = (code || '').toString().trim().replace(/^["']|["']$/g, '');

            if (!rawInput || rawInput !== expectedCode) {
              await d1Db.addAdminLog(env.DB, {
                adminName: admin.email || admin.adminName,
                ip: clientIp,
                action: 'ADMIN_STEP_FAILED',
                details: `Verification failed for Step ${step}. Client IP: ${clientIp}`,
              });
              return jsonResponse({ error: `Incorrect Step ${step} secret password. Access denied.` }, 400);
            }

            advanceWorkerVerificationSession(userKey, step);
            await d1Db.addAdminLog(env.DB, {
              adminName: admin.email || admin.adminName,
              ip: clientIp,
              action: 'ADMIN_STEP_SUCCESS',
              details: `Successfully passed verification Step ${step}. Client IP: ${clientIp}`,
            });

            return jsonResponse({ success: true, stepCompleted: step, nextStep: step + 1 });
          }

          // Step 5: Final clearance (Admin Name)
          if (step === 5) {
            const activeSession = getWorkerVerificationSession(userKey);
            if (!activeSession) {
              return jsonResponse({
                error: 'Verification session expired. Please restart the verification sequence.',
                expired: true,
              }, 400);
            }

            if (activeSession.completedStep !== 4) {
              return jsonResponse({
                error: 'Invalid verification sequence. Please complete steps 1 through 4 first.',
              }, 400);
            }

            const name = (inputAdminName || code || '').toString().trim().replace(/^["']|["']$/g, '');
            if (!name || name.length < 2 || name.length > 64) {
              return jsonResponse({ error: 'Please enter your Admin Name (between 2 and 64 characters) in Step 5.' }, 400);
            }

            // Immediately delete session to prevent replay
            deleteWorkerVerificationSession(userKey);

            const banCheck = await d1Db.isBannedAdmin(env.DB, name);
            if (banCheck.isBanned) {
              return jsonResponse({ error: 'Admin access for this identity is suspended.' }, 403);
            }

            const secret = getWorkerJwtSecret(env);
            if (!secret) {
              return jsonResponse(
                { error: 'Authentication service temporarily unavailable.' },
                500
              );
            }

            const jti = crypto.randomUUID();
            const nowSec = Math.floor(Date.now() / 1000);
            const adminToken = await signJwt({
              id: admin.userId,
              email: admin.email,
              adminName: name,
              isAdmin: true,
              role: 'admin',
              jti,
              iat: nowSec,
              exp: nowSec + 3600, // 1 hour short-lived session
            }, secret);

            await d1Db.addAdminLog(env.DB, {
              adminName: name,
              ip: clientIp,
              action: 'ADMIN_SESSION_CREATED',
              details: `Master clearance granted for account ${admin.email || name}. Session: ${jti}. IP: ${clientIp}`,
            });

            return jsonResponse(
              {
                success: true,
                adminName: name,
                authorized: true,
                token: adminToken,
              },
              200
            );
          }
        } catch (err: any) {
          return jsonResponse({ error: 'Admin verification failed.' }, 500);
        }
      }

      if ((path === '/api/admin/overview' || path === '/api/admin/telemetry') && method === 'GET') {
        const allUsers = await d1Db.getAllUsers(env.DB);
        const users = allUsers.map((u) => sanitizeWorkerUser(u));
        const stats = await d1Db.getSystemTelemetry(env.DB);
        const serverGroqConfigured = Boolean(getWorkerGroqKey(env));
        const brevoConfigured = isWorkerBrevoConfigured(env);
        return jsonResponse({
          stats,
          users,
          system: {
            environment: 'cloudflare-worker',
            role: 'alternative-edge-target',
            database: 'cloudflare-d1',
            groqConfigured: serverGroqConfigured,
            brevoConfigured,
            appVersion: '2.4.0',
            retentionDays: RETENTION_DAYS,
          },
        });
      }

      if (path === '/api/admin/passcodes' && method === 'GET') {
        const stepsStatus = [
          ...[1, 2, 3, 4].map((s) => ({
            step: s,
            envVar: `ADMIN_STEP_${s}`,
            isConfigured: Boolean(getWorkerConfig(env, `ADMIN_STEP_${s}`)),
          })),
          {
            step: 5,
            envVar: 'ADMIN_NAME (Identity)',
            isConfigured: true,
          },
        ];
        return jsonResponse({ stepsStatus, isEnvManaged: true });
      }

      if (path === '/api/admin/logs' && method === 'GET') {
        const logs = await d1Db.getAdminLogs(env.DB, 100);
        return jsonResponse({ logs });
      }

      if (path === '/api/admin/settings' && method === 'GET') {
        const settings = await d1Db.getAdminSettings(env.DB);
        return jsonResponse(settings);
      }

      if (path === '/api/admin/banned-admins' && method === 'GET') {
        const settings = await d1Db.getAdminSettings(env.DB);
        return jsonResponse({ bannedAdmins: settings.bannedAdmins || [] });
      }

      if (path === '/api/admin/support' && method === 'GET') {
        const tickets = await d1Db.getAllSupportTickets(env.DB);
        return jsonResponse({ tickets });
      }

      const ticketReplyMatch = path.match(/^\/api\/admin\/support\/([^/]+)\/reply$/);
      if (ticketReplyMatch && method === 'POST') {
        const supportRate = checkWorkerRateLimit(`admin:support:modify:ip:${clientIp}`, 30, 60000, 'Too many support updates. Please wait.');
        if (!supportRate.allowed) return workerRateLimitResponse(supportRate);

        const ticketId = ticketReplyMatch[1];
        const body = await parseWorkerJson(request);
        if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        const { reply } = body as any;
        if (!reply || !reply.trim()) {
          return jsonResponse({ error: 'Reply text cannot be empty.' }, 400);
        }
        const updated = await d1Db.replySupportTicket(env.DB, ticketId, reply.trim(), admin.adminName);
        if (!updated) return jsonResponse({ error: 'Support ticket not found.' }, 404);
        await d1Db.addAdminLog(env.DB, {
          adminName: admin.adminName,
          ip: clientIp,
          action: 'REPLY_SUPPORT_TICKET',
          details: `Replied to ticket ID ${ticketId} from ${updated.userName} (${updated.userEmail})`,
        });
        return jsonResponse({ success: true, ticket: updated });
      }

      const ticketDeleteMatch = path.match(/^\/api\/admin\/support\/([^/]+)$/);
      if (ticketDeleteMatch && method === 'DELETE') {
        const supportRate = checkWorkerRateLimit(`admin:support:modify:ip:${clientIp}`, 30, 60000, 'Too many support updates. Please wait.');
        if (!supportRate.allowed) return workerRateLimitResponse(supportRate);

        const ticketId = ticketDeleteMatch[1];
        const deleted = await d1Db.deleteSupportTicket(env.DB, ticketId);
        if (deleted) {
          await d1Db.addAdminLog(env.DB, {
            adminName: admin.adminName,
            ip: clientIp,
            action: 'DELETE_SUPPORT_TICKET',
            details: `Deleted support ticket ID ${ticketId}`,
          });
          return jsonResponse({ success: true, message: 'Support ticket removed.' });
        }
        return jsonResponse({ error: 'Support ticket not found' }, 404);
      }

      if (path === '/api/admin/send-email' && method === 'POST') {
        const emailRate = checkWorkerRateLimit(`admin:email:ip:${clientIp}`, 15, 60000, 'Too many email requests. Please wait.');
        if (!emailRate.allowed) return workerRateLimitResponse(emailRate);

        const body = await parseWorkerJson(request);
        if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        const { toEmail, toName, senderDisplayName, subject, textContent } = body as any;
        if (!toEmail || !toEmail.includes('@') || !subject || !textContent) {
          return jsonResponse({ error: 'Recipient email, subject, and message content are required.' }, 400);
        }
        const result = await sendWorkerAdminDirectEmail(env, {
          toEmail,
          toName,
          senderDisplayName: senderDisplayName || 'Aestific Official Support',
          subject,
          textContent,
        });
        if (!result.success) {
          return jsonResponse({ error: result.error || 'Failed to deliver email through Brevo.' }, 400);
        }
        await d1Db.addAdminLog(env.DB, {
          adminName: admin.adminName,
          ip: clientIp,
          action: 'SEND_DIRECT_EMAIL',
          details: `Dispatched direct email to "${toEmail}". Subject: "${subject}"`,
        });
        return jsonResponse({ success: true, message: 'Email sent successfully via Brevo!' });
      }

      if (path === '/api/admin/ban-admin' && method === 'POST') {
        const banRate = checkWorkerRateLimit(`admin:ban:ip:${clientIp}`, 20, 60000, 'Too many admin ban actions. Please wait.');
        if (!banRate.allowed) return workerRateLimitResponse(banRate);

        const body = await parseWorkerJson(request);
        if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        const { targetAdminName, durationHours = 24 } = body as any;
        const target = targetAdminName || (body as any)?.adminName;
        if (!target) return jsonResponse({ error: 'Target admin name is required' }, 400);
        const banned = await d1Db.banAdmin(env.DB, target, admin.adminName, durationHours);
        revokeWorkerAdminByName(target);
        await d1Db.addAdminLog(env.DB, {
          adminName: admin.adminName,
          ip: clientIp,
          action: 'BAN_ADMIN',
          details: `Suspended admin "${target}" for ${durationHours} hours.`,
        });
        return jsonResponse({ success: true, bannedAdmin: banned });
      }

      if (path === '/api/admin/unban-admin' && method === 'POST') {
        const banRate = checkWorkerRateLimit(`admin:ban:ip:${clientIp}`, 20, 60000, 'Too many admin unban actions. Please wait.');
        if (!banRate.allowed) return workerRateLimitResponse(banRate);

        const body = await parseWorkerJson(request);
        if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        const { targetAdminName } = body as any;
        const target = targetAdminName || (body as any)?.adminName;
        if (!target) return jsonResponse({ error: 'Target admin name is required' }, 400);
        const success = await d1Db.unbanAdmin(env.DB, target);
        if (success) {
          await d1Db.addAdminLog(env.DB, {
            adminName: admin.adminName,
            ip: clientIp,
            action: 'UNBAN_ADMIN',
            details: `Restored clearance for admin "${target}".`,
          });
        }
        return jsonResponse({ success });
      }

      const userStatusMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
      if (userStatusMatch && (method === 'PATCH' || method === 'POST')) {
        const userModRate = checkWorkerRateLimit(`admin:users:modify:ip:${clientIp}`, 30, 60000, 'Too many user management actions. Please wait.');
        if (!userModRate.allowed) return workerRateLimitResponse(userModRate);

        const userId = userStatusMatch[1];
        const body = await parseWorkerJson(request);
        if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        const { isEmailVerified } = body as any;
        const updated = await d1Db.updateUser(env.DB, userId, { isEmailVerified: Boolean(isEmailVerified) });
        if (!updated) return jsonResponse({ error: 'User not found' }, 404);
        await d1Db.addAdminLog(env.DB, {
          adminName: admin.adminName,
          ip: clientIp,
          action: 'UPDATE_USER_VERIFIED',
          details: `Set email verified = ${isEmailVerified} for ${updated.email}`,
        });
        return jsonResponse({ success: true, user: sanitizeWorkerUser(updated) });
      }

      const userBanMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/ban$/);
      if (userBanMatch && (method === 'POST' || method === 'PATCH')) {
        const userModRate = checkWorkerRateLimit(`admin:users:modify:ip:${clientIp}`, 30, 60000, 'Too many user management actions. Please wait.');
        if (!userModRate.allowed) return workerRateLimitResponse(userModRate);

        const body = await parseWorkerJson(request);
        if (!body) return jsonResponse({ error: 'Invalid or missing JSON in request body.' }, 400);
        const { isBanned, reason } = body as any;
        const updated = await d1Db.banUser(env.DB, userBanMatch[1], isBanned, reason);
        await d1Db.addAdminLog(env.DB, {
          adminName: admin.adminName,
          ip: clientIp,
          action: isBanned ? 'BAN_USER' : 'UNBAN_USER',
          details: `${isBanned ? 'Banned' : 'Unbanned'} user ID: ${userBanMatch[1]}. Reason: ${reason || 'Administrator Action'}`,
        });
        return jsonResponse({ success: true, user: sanitizeWorkerUser(updated) });
      }

      const userDeleteMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (userDeleteMatch && method === 'DELETE') {
        const userModRate = checkWorkerRateLimit(`admin:users:modify:ip:${clientIp}`, 30, 60000, 'Too many user management actions. Please wait.');
        if (!userModRate.allowed) return workerRateLimitResponse(userModRate);

        const userId = userDeleteMatch[1];
        const user = await d1Db.findUserById(env.DB, userId);
        const success = await d1Db.deleteUser(env.DB, userId);
        await d1Db.addAdminLog(env.DB, {
          adminName: admin.adminName,
          ip: clientIp,
          action: 'DELETE_USER',
          details: `Permanently deleted user account ${user?.email || userId}`,
        });
        return jsonResponse({ success, message: 'User deleted' });
      }

      if (path === '/api/admin/trigger-cleanup' && method === 'POST') {
        const result = await executeWorkerRetentionCleanup(env, RETENTION_DAYS);
        await d1Db.addAdminLog(env.DB, {
          adminName: admin.adminName,
          ip: clientIp,
          action: 'TRIGGER_RETENTION_CLEANUP',
          details: `Executed retention cleanup (${RETENTION_DAYS} days). Cleaned ${result.deletedMessagesCount} messages, ${result.deletedConversationsCount} empty conversations, and ${result.deletedFilesCount} files.`,
        });
        return jsonResponse({
          ...result,
          message: `Retention cleanup executed successfully. ${result.deletedMessagesCount} message(s) older than ${RETENTION_DAYS} days removed from Cloudflare D1.`,
        });
      }
    }

    // Default 404
    return jsonResponse({ error: 'Endpoint not found on Aestific Cloudflare Gateway' }, 404);
  },

  /**
   * Cloudflare Scheduled Cron Trigger Handler
   * Triggers daily at 00:00 UTC (0 0 * * *) to purge messages, empty conversations, and Supabase Storage files older than 30 days.
   * Evaluates each MESSAGE's own created_at timestamp.
   */
  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    const result = await executeWorkerRetentionCleanup(env, RETENTION_DAYS);
    if (env.DB && result.success) {
      await d1Db.addAdminLog(env.DB, {
        adminName: 'WorkerCronTrigger',
        ip: '127.0.0.1',
        action: '30_DAY_RETENTION_CLEANUP',
        details: `Automated 30-day retention cleanup. Purged ${result.deletedMessagesCount} messages, ${result.deletedConversationsCount} empty conversations, and ${result.deletedFilesCount} files. Cutoff: ${result.cutoffDate}`,
      }).catch(() => {});
    }
  },
};
