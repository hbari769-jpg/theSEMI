import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import path from 'path';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import { db, User, Conversation, Message, MessageRole, UserPersonalization } from './server/db.js';
import {
  generateToken,
  generateAdminToken,
  requireAuth,
  requireAdminAuth,
  requireRetentionTriggerAuth,
  requireAdminCandidate,
  verifyAdminSession,
  TOKEN_COOKIE_NAME,
  getJwtSecret,
  AuthRequest,
  initDefaultUsers,
  AUTH_COOKIE_OPTIONS,
  setAuthCookies,
  clearAuthCookies,
  hashPassword,
  verifyPasswordMatch,
  revokeAdminSession,
  revokeAdminByName,
  revokeUserSession,
  clearUserLogoutTimestamp,
  getVerificationSession,
  startVerificationSession,
  advanceVerificationSession,
  deleteVerificationSession,
  extractAuthTokenCandidates,
  createAdminStepToken,
  verifyAdminStepToken,
  isAuthorizedAdminEmail,
} from './server/auth.js';
import { createChatStream, transcribeAudioFile, extractAndSaveMemory, generateConversationTitle, getGroqClient, generateAIImage, generateAIImages, enrichImagePrompt } from './server/groq.js';
import { detectImageGenerationIntent, preserveAndCleanPrompt, type DetectedImageRequest } from './server/image-intent.js';
import { analyzeAndRouteRequest } from './server/smart-router.js';
import { getReadableSourceName, getDomainFromUrl } from './server/exa.js';
import {
  uploadMiddleware,
  audioUploadMiddleware,
  processUploadedFile,
  ALLOWED_IMAGE_EXTS,
  ALLOWED_AUDIO_EXTS,
  ALLOWED_VIDEO_EXTS,
  validateFileMagicBytes,
  sanitizeOriginalFilename,
  detectUploadPathTraversal,
} from './server/files.js';
import { retrieveRelevantChunks, createTextChunks } from './server/pdf-processor.js';
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from './server/models.js';
import {
  isPureIdentityMessage,
  generateIdentityResponse,
  sanitizeIdentityHallucinations,
} from './server/identity.js';
import { sendVerificationEmail, sendPasswordResetEmail, isBrevoConfigured, getBrevoSenderConfig, sendAdminDirectEmail } from './server/brevo.js';
import { initRetentionCronSchedule, run30DayRetentionCleanup } from './server/cleanup.js';
import { deleteFromSupabase, downloadFromSupabase, uploadToSupabaseStorage, generateStoragePath } from './server/supabase-storage.js';
import {
  getAllBehaviorRules,
  getActiveBehaviorRules,
  createBehaviorRule,
  updateBehaviorRule,
  toggleBehaviorRule,
  rollbackBehaviorRule,
  deleteBehaviorRule,
  getBehaviorAuditLogs,
  interpretAdminInstruction,
  testBehaviorComparison,
} from './server/behavior-store.js';
import {
  DEFAULT_JSON_LIMIT,
  DEFAULT_JSON_LIMIT_BYTES,
  DEFAULT_URLENCODED_LIMIT,
  CHAT_STREAM_JSON_LIMIT,
  CHAT_STREAM_JSON_LIMIT_BYTES,
  EXTENDED_TEXT_LIMIT,
  EXTENDED_TEXT_LIMIT_BYTES,
  MAX_FILE_UPLOAD_CEILING_BYTES,
  MAX_VOICE_UPLOAD_CEILING_BYTES,
  formatBytes,
  preflightSizeValidator,
  handlePayloadErrors,
} from './server/request-limits.js';
import {
  sendSafeError,
  safeLogger,
  productionErrorHandler,
  classifyError,
} from './server/error-handler.js';
import { validateProductionEnvironment } from './server/production-config.js';

// Production environment detection for compiled bundle execution
if (
  !process.env.NODE_ENV &&
  (process.env.npm_lifecycle_event === 'start' ||
    (typeof __filename !== 'undefined' && __filename.includes('dist')))
) {
  process.env.NODE_ENV = 'production';
}

// Production-Safe Shared Rate Limiter (Multi-Instance & Crash-Resilient)
import {
  checkRateLimitByKey,
  checkFailedRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  clearAllRateLimits,
  acquireInferenceLock,
  releaseInferenceLock,
  sendRateLimitResponse,
  getClientIp,
  configureAppProxyTrust,
  isRateLimitingEnabled,
} from './server/rate-limiter.js';
import { aiMonitor } from './server/ai-monitor.js';
import { configureHttpSecurity } from './server/security-headers.js';

dotenv.config();

const app = express();
configureAppProxyTrust(app);
configureHttpSecurity(app);
const PORT = 3000;
const UPLOADS_DIR = path.resolve('uploads');

// ==========================================
// REQUEST BODY LIMITS & SECURITY MIDDLEWARE
// ==========================================
app.use(cookieParser());

// 1. Dedicated Multipart File & Audio Uploads
// Kept strictly separate from JSON & URL-encoded parsers.
// Pre-flight validation inspects Content-Length before any file stream write occurs.
app.use('/api/files/upload', preflightSizeValidator(MAX_FILE_UPLOAD_CEILING_BYTES, 'file upload'));
app.use('/api/voice/transcribe', preflightSizeValidator(MAX_VOICE_UPLOAD_CEILING_BYTES, 'voice recording'));

// 2. Chat Streaming Endpoint (Genuinely needs larger JSON body for PDF text chunks & context)
app.use(
  '/api/chat/stream',
  preflightSizeValidator(CHAT_STREAM_JSON_LIMIT_BYTES, 'chat context'),
  express.json({ limit: CHAT_STREAM_JSON_LIMIT })
);

// 3. Extended Text Endpoints (Broadcast email templates and support submissions)
app.use(
  ['/api/admin/send-email', '/api/support', '/api/admin/support'],
  preflightSizeValidator(EXTENDED_TEXT_LIMIT_BYTES, 'document/email payload'),
  express.json({ limit: EXTENDED_TEXT_LIMIT })
);

// 4. Standard / Normal API Endpoints (Small, hardened 100KB limit for all normal requests)
const standardJson = express.json({ limit: DEFAULT_JSON_LIMIT });
const standardUrlencoded = express.urlencoded({ extended: true, limit: DEFAULT_URLENCODED_LIMIT });

app.use((req: Request, res: Response, next: NextFunction) => {
  // If request body was already parsed by an earlier route-specific parser, skip
  if (req.body !== undefined) {
    return next();
  }

  // Upload routes use multipart/form-data via multer; skip standard JSON & urlencoded parsers
  if (req.path.startsWith('/api/files/upload') || req.path.startsWith('/api/voice/transcribe')) {
    return next();
  }

  const contentType = (req.headers['content-type'] || '').toLowerCase();

  // Non-body or non-form requests continue
  if (
    !contentType.includes('application/json') &&
    !contentType.includes('application/x-www-form-urlencoded')
  ) {
    return next();
  }

  // Pre-flight early rejection if Content-Length exceeds standard 100KB limit
  const rawLen = req.headers['content-length'];
  if (rawLen !== undefined) {
    const contentLength = parseInt(rawLen, 10);
    if (!isNaN(contentLength) && contentLength > DEFAULT_JSON_LIMIT_BYTES) {
      res.setHeader('Connection', 'close');
      req.resume();
      return res.status(413).json({
        error: `Payload Too Large: Request body size (${formatBytes(contentLength)}) exceeds the 100KB limit for standard API requests.`,
        code: 'PAYLOAD_TOO_LARGE',
        status: 413,
        limit: DEFAULT_JSON_LIMIT,
        received: formatBytes(contentLength),
      });
    }
  }

  // Parse standard JSON and URL-encoded bodies with 100KB ceiling
  standardJson(req, res, (err) => {
    if (err) return next(err);
    standardUrlencoded(req, res, next);
  });
});

// Health check
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const dbHealth = await db.checkHealth();
    if (dbHealth.status === 'down') {
      return res.status(503).json({
        status: 'degraded',
        service: 'aestific-api',
        database: dbHealth,
      });
    }
    res.json({
      status: 'ok',
      service: 'aestific-api',
      database: dbHealth,
    });
  } catch (err: any) {
    safeLogger.error('Health check failure:', err);
    res.status(503).json({
      status: 'error',
      service: 'aestific-api',
      error: 'Service temporarily unavailable.',
    });
  }
});

// Initialize default dev sandbox if explicitly enabled
initDefaultUsers().catch((err) => console.warn('[Init] Demo user error:', err));

// ==========================================
// AUTHENTICATION API ROUTES
// ==========================================

// Register
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const ipRate = checkRateLimitByKey(
      `reg:ip:${clientIp}`,
      5,
      300000,
      'Too many registration attempts from this network. Please wait 5 minutes.'
    );
    if (!ipRate.allowed) {
      return sendRateLimitResponse(res, ipRate);
    }

    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({
        error: 'An account with this email address already exists. Please sign in.',
        code: 'ACCOUNT_EXISTS',
      });
    }

    const passwordHash = await hashPassword(password);

    const user: User = await db.createUser({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      memoryEnabled: true,
      preferredModel: DEFAULT_MODEL_ID,
      systemPrompt: 'You are aestific, an advanced AI assistant.',
      isEmailVerified: false,
    });

    // Check if Brevo is configured
    if (!isBrevoConfigured()) {
      // Auto-verify when Brevo is not configured in production/settings so user is never locked out
      await db.updateUser(user.id, { isEmailVerified: true });
      user.isEmailVerified = true;
      const token = generateToken(user);
      setAuthCookies(res, token);

      return res.status(201).json({
        message: 'Account created successfully! Welcome to aestific.',
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
      });
    }

    // Generate secure 6-digit verification code & set 10-minute expiration
    const verificationCode = db.generateVerificationCode();
    await db.setVerificationCode(user.id, verificationCode);

    // Dispatch verification email through Brevo
    const emailResult = await sendVerificationEmail(user.email, user.name, verificationCode);

    if (!emailResult.success) {
      await db.updateUser(user.id, { isEmailVerified: true });
      user.isEmailVerified = true;
      const token = generateToken(user);
      setAuthCookies(res, token);

      return res.status(201).json({
        message: 'Account created successfully! Welcome to aestific.',
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
      });
    }

    return res.status(201).json({
      message: 'Account created! A 6-digit verification code has been sent to your email.',
      requiresVerification: true,
      email: user.email,
    });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to create account. Please try again.');
  }
});

// Verify Email
app.post('/api/auth/verify-email', async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email address and 6-digit verification code are required.' });
    }

    const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();
    const cleanCode = (typeof code === 'string' ? code : '').trim();

    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit numerical code.' });
    }

    // Multi-tier Rate Limiting for verification attempts
    const ipRate = checkRateLimitByKey(
      `verify:ip:${clientIp}`,
      15,
      300000,
      'Too many verification attempts from this network. Please wait a few minutes.'
    );
    if (!ipRate.allowed) {
      return sendRateLimitResponse(res, ipRate);
    }

    const emailRate = checkRateLimitByKey(
      `verify:email:${normalizedEmail}`,
      10,
      300000,
      'Too many verification attempts for this account. Please wait a few minutes.'
    );
    if (!emailRate.allowed) {
      return sendRateLimitResponse(res, emailRate);
    }

    // Validate code, check 10-minute expiration, securely compare hash, and mark verified
    const result = await db.verifyEmailCode(normalizedEmail, cleanCode);
    if (!result.success || !result.user) {
      return res.status(400).json({ error: result.error || 'Invalid verification code.' });
    }

    const verifiedUser = result.user;
    const token = generateToken(verifiedUser);
    setAuthCookies(res, token);

    return res.json({
      message: 'Email successfully verified. Welcome to aestific!',
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
    });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to verify email. Please try again.');
  }
});

// Resend Verification Code
app.post('/api/auth/resend-verification', async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();

    // Multi-tier Rate Limiting for resend requests
    const ipRate = checkRateLimitByKey(
      `resend:ip:${clientIp}`,
      5,
      300000,
      'Too many resend requests from this network. Please wait 5 minutes.'
    );
    if (!ipRate.allowed) {
      return sendRateLimitResponse(res, ipRate);
    }

    const emailRate = checkRateLimitByKey(
      `resend:email:${normalizedEmail}`,
      3,
      300000,
      'Too many resend requests for this email. Please wait a few minutes.'
    );
    if (!emailRate.allowed) {
      return sendRateLimitResponse(res, emailRate);
    }

    const user = await db.findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email address.' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ error: 'This account is already verified. Please sign in.' });
    }

    if (!isBrevoConfigured()) {
      await db.updateUser(user.id, { isEmailVerified: true });
      const token = generateToken(user);
      setAuthCookies(res, token);
      return res.json({
        message: 'Account verified successfully.',
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
      });
    }

    // Cooldown check (60 seconds between resends)
    const cooldownCheck = await db.canResendVerification(user.id, 60000);
    if (!cooldownCheck.allowed) {
      return sendRateLimitResponse(res, {
        message: `Please wait ${cooldownCheck.waitSeconds || 60}s before requesting a new verification code.`,
        retryAfter: cooldownCheck.waitSeconds || 60,
      });
    }

    // Generate new code & invalidate old code
    const newCode = db.generateVerificationCode();
    await db.setVerificationCode(user.id, newCode);

    // Send through Brevo
    const emailResult = await sendVerificationEmail(user.email, user.name, newCode);
    if (!emailResult.success) {
      if (emailResult.isAuthError || !isBrevoConfigured()) {
        await db.updateUser(user.id, { isEmailVerified: true });
        user.isEmailVerified = true;
        const token = generateToken(user);
        setAuthCookies(res, token);
        return res.json({
          message: 'Account verified successfully.',
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
        });
      }

      safeLogger.warn('Failed to dispatch verification email:', emailResult.error);
      return res.status(400).json({
        error: 'Failed to dispatch verification email. Please check your configuration or try again later.',
      });
    }

    return res.json({
      message: 'A fresh 6-digit verification code has been sent to your email.',
    });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to resend verification email.');
  }
});

// Forgot Password (Request 15-minute reset code via Brevo)
app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();

    // Multi-tier Rate Limiting (IP & Email)
    const ipRate = checkRateLimitByKey(
      `forgot:ip:${clientIp}`,
      6,
      300000,
      'Too many password reset requests from this network. Please wait 5 minutes.'
    );
    if (!ipRate.allowed) {
      return sendRateLimitResponse(res, ipRate);
    }

    const emailRate = checkRateLimitByKey(
      `forgot:email:${normalizedEmail}`,
      3,
      300000,
      'Too many password reset requests for this email. Please wait a few minutes.'
    );
    if (!emailRate.allowed) {
      return sendRateLimitResponse(res, emailRate);
    }

    // Generic response message to prevent account enumeration / reconnaissance attacks
    const genericSuccessMessage = 'If an account exists for this email, a password reset email has been sent.';

    const user = await db.findUserByEmail(normalizedEmail);
    if (!user) {
      // Do not reveal that the account does not exist
      return res.json({ message: genericSuccessMessage });
    }

    // Cooldown check (60 seconds between reset emails)
    const cooldownCheck = await db.canRequestPasswordReset(user.id, 60000);
    if (!cooldownCheck.allowed) {
      // On cooldown, safely return generic message without triggering a duplicate dispatch
      return res.json({ message: genericSuccessMessage });
    }

    // Generate single-use, 6-digit cryptographically secure reset code
    const resetCode = db.generateVerificationCode();
    await db.setPasswordResetCode(user.id, resetCode);

    // Send password reset email via Brevo
    const emailResult = await sendPasswordResetEmail(user.email, user.name, resetCode);
    if (!emailResult.success) {
      safeLogger.warn('Failed to dispatch password reset email:', emailResult.error);
      return res.status(400).json({
        error: 'Failed to dispatch password reset email. Please try again later.',
      });
    }

    return res.json({
      message: genericSuccessMessage,
    });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to process password reset request.');
  }
});

// Reset Password (Verify 6-digit code and set new password)
app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const { email, code, newPassword, confirmPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, reset code, and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();
    const cleanCode = (typeof code === 'string' ? code : '').trim();

    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit password reset code.' });
    }

    // Rate Limiting for reset attempts
    const ipRate = checkRateLimitByKey(
      `reset:ip:${clientIp}`,
      10,
      300000,
      'Too many reset attempts from this network. Please wait 5 minutes.'
    );
    if (!ipRate.allowed) {
      return sendRateLimitResponse(res, ipRate);
    }

    const emailRate = checkRateLimitByKey(
      `reset:email:${normalizedEmail}`,
      6,
      300000,
      'Too many reset attempts for this email. Please wait a few minutes.'
    );
    if (!emailRate.allowed) {
      return sendRateLimitResponse(res, emailRate);
    }

    // Hash new password securely with bcrypt
    const newPasswordHash = await hashPassword(newPassword);

    // Verify token/code, ensure expiration < 15m, invalidate single-use code, update password
    const result = await db.verifyAndResetPassword(normalizedEmail, cleanCode, newPasswordHash);
    if (!result.success || !result.user) {
      return res.status(400).json({ error: result.error || 'Invalid or expired reset code.' });
    }

    const updatedUser = result.user;
    revokeUserSession(undefined, updatedUser.id);
    clearUserLogoutTimestamp(updatedUser.id);
    const token = generateToken(updatedUser);
    setAuthCookies(res, token);

    return res.json({
      message: 'Password reset successfully. You are now logged in.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        status: updatedUser.status || 'active',
        memoryEnabled: updatedUser.memoryEnabled,
        preferredModel: updatedUser.preferredModel,
        avatarUrl: updatedUser.avatarUrl,
        isEmailVerified: true,
      },
      token,
    });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to reset password. Please try again.');
  }
});

// Login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const ipRate = checkRateLimitByKey(
      `login:ip:${clientIp}`,
      10,
      60000,
      'Too many login attempts from this network. Please wait a minute.'
    );
    if (!ipRate.allowed) {
      return sendRateLimitResponse(res, ipRate);
    }

    const { email, password, remember } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();
    const emailRate = checkRateLimitByKey(
      `login:email:${normalizedEmail}`,
      6,
      60000,
      'Too many failed attempts for this account. Please wait a moment before trying again.'
    );
    if (!emailRate.allowed) {
      return sendRateLimitResponse(res, emailRate);
    }

    const user = await db.findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const { isValid: isMatch, needsRehash } = await verifyPasswordMatch(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (needsRehash) {
      try {
        const upgradedHash = await hashPassword(password);
        await db.updateUser(user.id, { passwordHash: upgradedHash });
        user.passwordHash = upgradedHash;
      } catch (rehashErr) {
        safeLogger.error('Failed to auto-upgrade legacy password hash to bcrypt:', rehashErr);
      }
    }

    // Ensure email is verified upon successful password authentication so user is never locked out
    if (!user.isEmailVerified) {
       await db.updateUser(user.id, { isEmailVerified: true });
       user.isEmailVerified = true;
    }

    // Clear any past user logout cutoff when a fresh session is legitimately minted
    clearUserLogoutTimestamp(user.id);

    const token = generateToken(user);
    setAuthCookies(res, token);

    return res.json({
      message: 'Sign in successful.',
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
    });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Sign in failed. Please try again.');
  }
});

// Optional Dev Demo Login (Disabled in Production)
app.post('/api/auth/demo-login', async (req: Request, res: Response) => {
  if (process.env.ENABLE_DEMO_ACCOUNT !== 'true' || process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Demo account is disabled. Please create an account or sign in.' });
  }

  const clientIp = getClientIp(req);
  const ipRate = checkRateLimitByKey(
    `demo:ip:${clientIp}`,
    6,
    60000,
    'Too many sandbox requests. Please wait a moment.'
  );
  if (!ipRate.allowed) {
    return sendRateLimitResponse(res, ipRate);
  }

  try {
    const devDemoEmail = 'dev-demo@aestific.local';
    let user = await db.findUserByEmail(devDemoEmail);
    if (!user) {
      await initDefaultUsers();
      user = await db.findUserByEmail(devDemoEmail);
    }
    if (!user) {
      return res.status(500).json({ error: 'Dev demo account unavailable.' });
    }

    const token = generateToken(user);
    setAuthCookies(res, token);

    return res.json({
      message: 'Welcome to the aestific Dev Sandbox.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        memoryEnabled: user.memoryEnabled,
        preferredModel: user.preferredModel,
        avatarUrl: user.avatarUrl,
      },
      token,
    });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Dev demo login failed. Please try again.');
  }
});

// Personalization validation and sanitization
function sanitizePersonalization(raw: any): UserPersonalization | null {
  if (!raw || typeof raw !== 'object') return null;

  const validCallPrefs = ['Name', 'Nickname', 'Username', 'No preference'];
  const validTones = ['Friendly', 'Professional', 'Direct', 'Casual', 'Creative', 'Tutor'];
  const validAddresses = ['Formal', 'Casual', 'Very Casual', 'Auto'];
  const validLangs = ['Auto', 'বাংলা', 'English', 'বাংলা + English'];
  const validFeels = ['Quick', 'Balanced', 'Detailed', 'Deep Explanation'];
  const validOccupations = [
    'Student',
    'Developer',
    'Designer',
    'Business Owner',
    'Researcher',
    'Teacher',
    'Content Creator',
    'Freelancer',
    'Other',
  ];
  const validRelationships = [
    'Assistant',
    'Friend',
    'Study Partner',
    'Creative Partner',
    'Work Partner',
    'Technical Partner',
    'Coach',
  ];

  const clean: UserPersonalization = {};

  if (typeof raw.callPreference === 'string' && validCallPrefs.includes(raw.callPreference)) {
    clean.callPreference = raw.callPreference as any;
  }
  if (typeof raw.customCallName === 'string') {
    clean.customCallName = raw.customCallName.trim().slice(0, 80);
  }
  if (typeof raw.tone === 'string' && validTones.includes(raw.tone)) {
    clean.tone = raw.tone as any;
  }
  if (typeof raw.addressStyle === 'string' && validAddresses.includes(raw.addressStyle)) {
    clean.addressStyle = raw.addressStyle as any;
  }
  if (typeof raw.preferredLanguage === 'string' && validLangs.includes(raw.preferredLanguage)) {
    clean.preferredLanguage = raw.preferredLanguage as any;
  }
  if (typeof raw.responseFeel === 'string' && validFeels.includes(raw.responseFeel)) {
    clean.responseFeel = raw.responseFeel as any;
  }
  if (typeof raw.occupation === 'string' && validOccupations.includes(raw.occupation)) {
    clean.occupation = raw.occupation as any;
  }
  if (typeof raw.customOccupation === 'string') {
    clean.customOccupation = raw.customOccupation.trim().slice(0, 100);
  }
  if (typeof raw.workContext === 'string') {
    clean.workContext = raw.workContext.trim().slice(0, 1000);
  }
  if (typeof raw.workingRelationship === 'string' && validRelationships.includes(raw.workingRelationship)) {
    clean.workingRelationship = raw.workingRelationship as any;
  }
  if (typeof raw.customInstructions === 'string') {
    clean.customInstructions = raw.customInstructions.trim().slice(0, 2000);
  }

  return clean;
}

// Get Current User (Me)
app.get('/api/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  // Preserve existing session ID if present in active token
  const currentToken = extractAuthTokenCandidates(req, false)[0]?.token;
  let sid: string | undefined;
  if (currentToken) {
    try {
      const payload = jwt.decode(currentToken) as any;
      sid = payload?.sid || payload?.jti;
    } catch {}
  }
  const token = generateToken(user, sid);
  setAuthCookies(res, token);
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      memoryEnabled: user.memoryEnabled,
      preferredModel: user.preferredModel,
      systemPrompt: user.systemPrompt,
      languagePreference: user.languagePreference,
      personalization: user.personalization || null,
      isEmailVerified: user.isEmailVerified !== false,
      isBanned: Boolean(user.isBanned),
      bannedAt: user.bannedAt,
      bannedReason: user.bannedReason,
      createdAt: user.createdAt,
    },
    token,
  });
});

// Update Profile
app.patch('/api/auth/update-profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const rateCheck = checkRateLimitByKey(
      `profile:user:${user.id}`,
      15,
      60000,
      'Too many profile update requests. Please wait a moment.'
    );
    if (!rateCheck.allowed) {
      return sendRateLimitResponse(res, rateCheck);
    }

    const { name, avatarUrl, preferredModel, systemPrompt, memoryEnabled, languagePreference, personalization } = req.body;

    const updates: Partial<User> = {
      ...(name ? { name: name.trim() } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(preferredModel ? { preferredModel } : {}),
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(memoryEnabled !== undefined ? { memoryEnabled: Boolean(memoryEnabled) } : {}),
      ...(languagePreference !== undefined ? { languagePreference } : {}),
    };

    if (personalization !== undefined) {
      updates.personalization = personalization ? sanitizePersonalization(personalization) || undefined : null as any;
    }

    const updated = await db.updateUser(user.id, updates);

    res.json({ message: 'Profile updated successfully.', user: updated });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to update profile.');
  }
});

// Get User Personalization
app.get('/api/user/personalization', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    res.json({ personalization: user.personalization || null, user });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to retrieve personalization settings.');
  }
});

// Save User Personalization
app.post('/api/user/personalization', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const rateCheck = checkRateLimitByKey(
      `personalize:user:${user.id}`,
      120,
      60000,
      'Too many personalization updates. Please wait a moment.'
    );
    if (!rateCheck.allowed) {
      return sendRateLimitResponse(res, rateCheck);
    }

    const { personalization } = req.body;
    const sanitized = sanitizePersonalization(personalization);

    const userUpdates: Partial<User> = {
      personalization: sanitized || (null as any),
    };
    if (sanitized?.preferredLanguage) {
      userUpdates.languagePreference = sanitized.preferredLanguage;
    }

    const updated = await db.updateUser(user.id, userUpdates);

    res.json({
      message: 'Personalization updated successfully.',
      personalization: updated?.personalization || null,
      user: updated,
    });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to save personalization settings.');
  }
});

// Reset User Personalization (Clears only personalization preferences, preserving chats and account data)
app.post('/api/user/personalization/reset', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const updated = await db.updateUser(user.id, {
      personalization: null as any,
    });

    res.json({
      message: 'Personalization reset to defaults successfully.',
      personalization: null,
      user: updated,
    });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to reset personalization settings.');
  }
});

// Change Password
app.post('/api/auth/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const clientIp = getClientIp(req);

    // Multi-tier rate limiting by user and IP
    const userRate = checkRateLimitByKey(
      `pw:user:${user.id}`,
      4,
      300000,
      'Too many password changes for this account. Please wait 5 minutes.'
    );
    if (!userRate.allowed) {
      return sendRateLimitResponse(res, userRate);
    }

    const ipRate = checkRateLimitByKey(
      `pw:ip:${clientIp}`,
      6,
      300000,
      'Too many password change requests from this network. Please wait 5 minutes.'
    );
    if (!ipRate.allowed) {
      return sendRateLimitResponse(res, ipRate);
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    const { isValid: isMatch } = await verifyPasswordMatch(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.updateUser(user.id, { passwordHash });

    // Invalidate previous sessions and mint a fresh active session
    revokeUserSession(undefined, user.id);
    clearUserLogoutTimestamp(user.id);
    const token = generateToken(user);
    setAuthCookies(res, token);

    res.json({ message: 'Password updated successfully.', token });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to change password.');
  }
});

// Logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const candidates = extractAuthTokenCandidates(req, false);
  const secret = getJwtSecret();
  for (const c of candidates) {
    try {
      const payload = jwt.verify(c.token, secret, { ignoreExpiration: true }) as any;
      if (payload && payload.id) {
        revokeUserSession(payload.sid || payload.jti, payload.id);
      }
    } catch {}
  }
  clearAuthCookies(res);
  res.json({ message: 'Signed out successfully.' });
});

// Enforce admin general rate limiting across ALL /api/admin/* endpoints
app.use('/api/admin', (req: Request, res: Response, next: NextFunction) => {
  const clientIp = getClientIp(req);
  const baseRate = checkRateLimitByKey(
    `admin:general:ip:${clientIp}`,
    120,
    60000,
    'Too many admin requests. Please wait a moment.'
  );
  if (!baseRate.allowed) {
    return sendRateLimitResponse(res, baseRate);
  }
  next();
});

// Admin Session Status Check (Returns active status for valid elevated admin sessions)
app.get('/api/admin/session', async (req: Request, res: Response) => {
  let token = (req.headers['x-admin-token'] as string) || '';
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    token = req.cookies?.[TOKEN_COOKIE_NAME];
  }
  const sessionStatus = await verifyAdminSession(token);
  return res.json({ success: true, ...sessionStatus });
});

// Admin Logout: immediately revokes active admin session while preserving normal user login if present
app.post('/api/admin/logout', async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);

  let token = (req.headers['x-admin-token'] as string) || '';
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    token = req.cookies?.[TOKEN_COOKIE_NAME];
  }

  let adminName = 'Admin';
  if (token) {
    try {
      const secret = getJwtSecret();
      const payload = jwt.verify(token, secret) as any;
      if (payload.jti) {
        revokeAdminSession(payload.jti, payload.id);
      } else if (payload.id) {
        revokeAdminSession(undefined, payload.id);
      }
      if (payload.adminName) {
        adminName = payload.adminName;
        revokeAdminByName(payload.adminName);
      } else if (payload.email) {
        adminName = payload.email;
      }
      if (payload.id) {
        deleteVerificationSession(payload.id);
        // Restore standard non-admin user cookie so normal chat session stays active
        const user = await db.findUserById(payload.id);
        if (user) {
          const standardUserToken = generateToken(user);
          setAuthCookies(res, standardUserToken);
        } else {
          clearAuthCookies(res);
        }
      } else {
        clearAuthCookies(res);
      }
    } catch {
      clearAuthCookies(res);
    }
  } else {
    clearAuthCookies(res);
  }

  await db.addAdminLog({
    adminName,
    ip: clientIp,
    action: 'ADMIN_LOGOUT',
    details: `Admin session terminated and revoked for ${adminName}. Client IP: ${clientIp}`,
  });
  return res.json({ success: true, message: 'Admin signed out successfully.' });
});

// Delete Account
app.delete('/api/auth/account', requireAuth, async (req: AuthRequest, res: Response) => {
  await db.deleteUser(req.user!.id);
  clearAuthCookies(res);
  res.json({ message: 'Account and associated data deleted permanently.' });
});

// ==========================================
// CONVERSATIONS API
// ==========================================

// List Conversations
app.get('/api/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const conversations = await db.getConversations(userId);
  res.json({ conversations });
});

// Create Conversation
app.post('/api/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { title, model } = req.body || {};
  const conv = await db.createConversation(userId, title || 'New Conversation', model || req.user!.preferredModel || DEFAULT_MODEL_ID);
  res.status(201).json({ conversation: conv });
});

// Get Single Conversation with Messages
app.get('/api/conversations/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const conv = await db.getConversationById(req.params.id, userId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  const rawMessages = await db.getMessages(conv.id, userId);
  const messages = await Promise.all(
    rawMessages.map(async (m: any) => {
      if (m.fileIds && Array.isArray(m.fileIds) && m.fileIds.length > 0 && (!m.attachments || m.attachments.length === 0)) {
        const files = await Promise.all(m.fileIds.map((fid: string) => db.getFileById(fid, userId)));
        const validAttachments = files
          .filter(Boolean)
          .map((f: any) => ({
            id: f.id,
            name: f.originalName || f.filename,
            filename: f.filename,
            type: f.type,
            mimeType: f.mimeType,
            size: f.size || f.sizeBytes || 0,
            url: f.url,
            pageCount: f.pageCount,
            duration: f.duration,
            createdAt: f.createdAt,
          }));
        return { ...m, attachments: validAttachments };
      }
      return m;
    })
  );
  res.json({ conversation: conv, messages });
});

// Update Conversation (Rename, Pin, Archive)
app.patch('/api/conversations/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { title, isPinned, isArchived, model } = req.body || {};
  const updated = await db.updateConversation(req.params.id, userId, {
    ...(title ? { title: title.trim() } : {}),
    ...(isPinned !== undefined ? { isPinned: Boolean(isPinned) } : {}),
    ...(isArchived !== undefined ? { isArchived: Boolean(isArchived) } : {}),
    ...(model ? { model } : {}),
  });
  if (!updated) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  res.json({ conversation: updated });
});

// Delete Conversation
app.delete('/api/conversations/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const success = await db.deleteConversation(req.params.id, userId);
  if (!success) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  res.json({ message: 'Conversation deleted.' });
});

// Clear All Conversations
app.delete('/api/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  await db.clearUserConversations(userId);
  res.json({ message: 'All conversations cleared.' });
});

// ==========================================
// In-Chat Image Generation Intent Detection & Sanitation
export { detectImageGenerationIntent, type DetectedImageRequest } from './server/image-intent.js';

// Helper to sanitize any raw JSON tool-calling hallucinations without instructing user to re-ask (Bug 2)
function sanitizeAssistantResponse(rawText: string, userLanguageHint: string): string {
  if (!rawText) return rawText;
  let text = sanitizeIdentityHallucinations(rawText);
  const isActionJson = (text.includes('"action"') || text.includes("'action'")) &&
    (text.includes('dalle') || text.includes('text2im') || text.includes('action_input') || text.includes('image_generator'));

  if (isActionJson) {
    const promptMatch = text.match(/\"prompt\"\s*:\s*\"([^\"]+)\"/i) || 
                        text.match(/\"action_input\"\s*:\s*\"([^\"]+)\"/i) ||
                        text.match(/prompt['"]?\s*:\s*['"]([^'"]+)['"]/i);
    if (promptMatch && promptMatch[1]) {
      return sanitizeIdentityHallucinations(promptMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim());
    }
    return userLanguageHint.trim();
  }

  return text;
}

/**
 * Shared In-Chat Image Generation Execution Helper
 * Guarantees that /image requests and recognized image intents actually execute and return
 * the rendered image rather than text or instructions (Bug 1 & Bug 2).
 */
async function executeInChatImageGeneration(params: {
  prompt: string;
  originalPrompt?: string;
  style?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  quantity?: number;
  variations?: boolean;
  isBengali?: boolean;
  user: any;
  conversationId: string;
  clientIp: string;
  res: Response;
  safeReleaseLock: () => void;
  isRecovery?: boolean;
}): Promise<void> {
  const {
    prompt,
    originalPrompt,
    style = 'natural',
    aspectRatio = '1:1',
    quantity = 1,
    variations = false,
    isBengali = false,
    user,
    conversationId,
    clientIp,
    res,
    safeReleaseLock,
    isRecovery = false,
  } = params;
  const count = Math.min(Math.max(quantity || 1, 1), 4);
  const isVariations = variations || count > 1;
  const modelName = 'Aestific Visual';

  res.write(`event: start\ndata: ${JSON.stringify({
    provider: 'aestific',
    modelUsed: modelName,
    webSearchUsed: false,
    isImageGeneration: true,
    prompt,
    quantity: count,
    variations: isVariations,
  })}\n\n`);

  // Phase 1: Understanding prompt
  res.write(`event: image_status\ndata: ${JSON.stringify({
    phase: 'understanding',
    label: count > 1 ? `Understanding prompt (${count} images)` : 'Understanding prompt',
    prompt,
    quantity: count,
  })}\n\n`);

  // Phase 2: Creating your image(s)
  res.write(`event: image_status\ndata: ${JSON.stringify({
    phase: 'creating',
    label: count > 1 ? `Creating ${count} variations` : 'Creating your image',
    prompt,
    quantity: count,
  })}\n\n`);

  let enrichedPrompt = prompt;
  try {
    enrichedPrompt = await enrichImagePrompt(originalPrompt || prompt, style, isBengali);
  } catch (enrichErr: any) {
    safeLogger.warn('Enrich prompt notice:', enrichErr?.message || enrichErr);
  }

  // Phase 3: Rendering
  res.write(`event: image_status\ndata: ${JSON.stringify({
    phase: 'rendering',
    label: count > 1 ? `Rendering ${count} images` : 'Rendering',
    prompt,
    quantity: count,
  })}\n\n`);

  let generatedImages: any[] = [];
  try {
    // Phase 4: Refining details
    res.write(`event: image_status\ndata: ${JSON.stringify({
      phase: 'refining',
      label: count > 1 ? `Refining ${count} variations` : 'Refining details',
      prompt,
      quantity: count,
    })}\n\n`);

    generatedImages = await generateAIImages({
      prompt: enrichedPrompt,
      style,
      userId: user.id,
      conversationId,
      aspectRatio,
      quantity: count,
      variations: isVariations,
    });
  } catch (genErr: any) {
    safeLogger.error('In-chat image generation error:', genErr?.message || genErr);
    const errMsg = genErr?.message && genErr.message.includes('safety')
      ? 'This request was blocked by image safety guidelines. Please adjust your prompt and try again.'
      : (genErr?.isRateLimit || (genErr?.message && (genErr.message.includes('quota') || genErr.message.includes('429') || genErr.message.includes('temporarily unavailable') || genErr.message.includes('resource_exhausted'))))
          ? 'Image generation is temporarily unavailable due to high demand. Please try again in a few moments.'
          : (genErr?.message || 'Could not generate the image at this moment. Please try again in a few moments.');

    res.write(`event: image_status\ndata: ${JSON.stringify({
      phase: 'error',
      label: 'Error',
      error: errMsg
    })}\n\n`);

    res.write(`event: token\ndata: ${JSON.stringify({ token: errMsg })}\n\n`);

    aiMonitor.recordApiError({
      endpoint: '/api/chat/stream',
      provider: 'google',
      model: modelName,
      errorType: 'image_generation_failure',
      errorMessage: genErr?.message || 'In-chat generation failed',
      userId: user?.id,
      userEmail: user?.email,
      ip: clientIp,
    });

    const assistantMsg = await db.createMessage({
      conversationId,
      userId: user.id,
      role: 'assistant',
      content: errMsg,
      model: modelName,
    });
    res.write(`event: done\ndata: ${JSON.stringify({ assistantMessage: assistantMsg })}\n\n`);
    safeReleaseLock();
    res.end();
    return;
  }

  // Phase 5: Image ready / delivered
  const primaryUrl = generatedImages[0]?.url;
  const allUrls = generatedImages.map((img: any) => img.url);
  const allFileIds = generatedImages.map((img: any) => img.id);

  res.write(`event: image_status\ndata: ${JSON.stringify({
    phase: 'ready',
    label: count > 1 ? `${generatedImages.length} images ready` : 'Image ready',
    imageUrl: primaryUrl,
    imageUrls: allUrls,
    fileId: generatedImages[0]?.id,
    fileIds: allFileIds,
    quantity: generatedImages.length,
    prompt
  })}\n\n`);

  // Requirement 6: Show results cleanly and visually without verbose boilerplate
  let imageMarkdown = '';
  if (generatedImages.length > 1) {
    imageMarkdown = `Here are ${generatedImages.length} variations:\n\n`;
    generatedImages.forEach((img: any, idx: number) => {
      imageMarkdown += `![Variation ${idx + 1}](${img.url})\n\n`;
    });
    imageMarkdown += `**Prompt:** *${prompt}*`;
  } else {
    const caption = prompt.replace(/[\[\]\(\)\*]/g, '').trim() || 'AI Generated Image';
    imageMarkdown = `![${caption}](${primaryUrl})\n\n**Prompt:** *${prompt}*`;
  }

  res.write(`event: token\ndata: ${JSON.stringify({ token: imageMarkdown })}\n\n`);

  await db.incrementDailyUsage(user.id, { chatCount: 1 });

  aiMonitor.recordAiRequest({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    type: 'image',
    provider: 'google',
    model: modelName,
    webSearchUsed: false,
    promptSnippet: prompt,
    ip: clientIp,
    status: 'success',
  });

  const assistantMsg = await db.createMessage({
    conversationId,
    userId: user.id,
    role: 'assistant',
    content: imageMarkdown,
    model: modelName,
    fileIds: allFileIds,
  });

  // Extract memory asynchronously
  extractAndSaveMemory(user.id, conversationId, prompt, `Generated artwork: ${prompt}`);

  res.write(`event: done\ndata: ${JSON.stringify({ assistantMessage: assistantMsg })}\n\n`);
  safeReleaseLock();
  res.end();
}

// CHAT & STREAMING INFERENCE
// ==========================================

app.post('/api/chat/stream', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const clientIp = getClientIp(req);
  const { conversationId, message, model, attachments, temperature, languagePreference, temporary, saveHistory, history, aiEnginePreferences, isRegenerate, reuseUserMessageId } = req.body || {};

  if (!conversationId || (!message && (!attachments || attachments.length === 0))) {
    return res.status(400).json({ error: 'conversationId and message or attachment are required.' });
  }

  const isTemporary = temporary === true || saveHistory === false || conversationId.startsWith('temp-') || conversationId.startsWith('temporary-');

  let conv: Conversation | null = null;
  if (isTemporary) {
    conv = {
      id: conversationId,
      userId: user.id,
      title: 'Temporary Chat',
      model: model || user.preferredModel || DEFAULT_MODEL_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isArchived: false,
    };
  } else {
    conv = await db.getConversationById(conversationId, user.id);
    if (!conv) {
      // Auto-heal: If conversation was purged or ID is stale, automatically create or restore it seamlessly
      try {
        conv = await db.createConversation(
          user.id,
          (message || 'New Conversation').slice(0, 40),
          model || user.preferredModel || DEFAULT_MODEL_ID
        );
      } catch {
        conv = {
          id: conversationId,
          userId: user.id,
          title: (message || 'New Conversation').slice(0, 40),
          model: model || user.preferredModel || DEFAULT_MODEL_ID,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isArchived: false,
        };
      }
    }
  }

  // 1. Multi-tier Anti-Spam & Rate Limiting (Burst, Minute, IP)
  const userBurstRate = checkRateLimitByKey(`chat:user:burst:${user.id}`, 8, 10000, 'Sending messages too fast. Please pause for a moment.');
  if (!userBurstRate.allowed) {
    return sendRateLimitResponse(res, userBurstRate);
  }

  const userMinRate = checkRateLimitByKey(`chat:user:min:${user.id}`, 40, 60000, 'Rate limit reached: maximum 40 messages per minute.');
  if (!userMinRate.allowed) {
    return sendRateLimitResponse(res, userMinRate);
  }

  const ipMinRate = checkRateLimitByKey(`chat:ip:${clientIp}`, 60, 60000, 'Network rate limit exceeded. Please wait a minute.');
  if (!ipMinRate.allowed) {
    return sendRateLimitResponse(res, ipMinRate);
  }

  // 2. In-Flight Request Concurrency Lock / Deduplication
  const lockKey = isTemporary ? `chat:${user.id}:temp` : `chat:${user.id}:${conversationId}`;
  if (!acquireInferenceLock(lockKey)) {
    return sendRateLimitResponse(res, {
      message: 'A response is currently generating in this chat. Please wait for it to finish or stop it.',
      retryAfter: 3,
    });
  }

  // Release lock on client disconnect or response completion
  let lockReleased = false;
  const safeReleaseLock = () => {
    if (!lockReleased) {
      lockReleased = true;
      releaseInferenceLock(lockKey);
    }
  };
  res.on('close', safeReleaseLock);
  res.on('finish', safeReleaseLock);

  // Construct message content including PDF, ZIP, Office, and any file extracted text context
  let augmentedUserContent = (message || '').trim();
  const imageUrls: string[] = [];
  const mediaAttachments: Array<{ type: 'video' | 'audio' | 'pdf'; mimeType: string; dataBase64: string; filename?: string }> = [];

  if (attachments && attachments.length > 0) {
    if (!augmentedUserContent) {
      const hasImg = attachments.some((a: any) => a.type === 'image' || a.mimeType?.startsWith('image/'));
      const hasVid = attachments.some((a: any) => a.type === 'video' || a.mimeType?.startsWith('video/'));
      const hasDoc = attachments.some((a: any) => a.type === 'pdf' || a.type === 'other');
      if (hasImg && !hasVid && !hasDoc) {
        augmentedUserContent = 'Please carefully inspect and analyze the attached image(s). Describe what you see in detail, extract any visible text, and explain the key elements.';
      } else if (hasVid && !hasImg && !hasDoc) {
        augmentedUserContent = 'Please analyze the attached video in detail, describe what happens, and summarize the key visual and audio details.';
      } else {
        augmentedUserContent = 'Please thoroughly read, analyze, explain, and summarize the contents of the attached file(s). Highlight the most important points, structure, and details.';
      }
    }

    for (const att of attachments) {
      // Hydrate missing metadata from DB if file ID is provided
      let dbFileRecord: any = null;
      if (att.id) {
        try {
          dbFileRecord = await db.getFileById(att.id, user.id);
        } catch {}
      }

      const effectiveExtractedText = att.extractedText || dbFileRecord?.extractedText;
      const effectiveChunks = (att.chunks && att.chunks.length > 0) ? att.chunks : dbFileRecord?.chunks;
      const effectivePageCount = att.pageCount || dbFileRecord?.pageCount || 1;
      const effectiveIsScanned = att.isScanned ?? dbFileRecord?.isScanned;

      if (att.type === 'pdf' || att.mimeType === 'application/pdf') {
        // Also try loading raw PDF buffer for multimodal Gemini PDF reading if available
        try {
          const filename = att.filename || dbFileRecord?.filename || (att.url ? path.basename(att.url.split('?')[0]) : null);
          if (filename) {
            const fileRecord = dbFileRecord || (await db.getFileByFilename(filename, user.id));
            const safeFilename = path.basename(filename);
            const filePath = path.resolve(UPLOADS_DIR, safeFilename);
            let pdfBuf: Buffer | null = null;
            if (fileRecord && filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
              pdfBuf = fs.readFileSync(filePath);
            } else if (fileRecord && fileRecord.storagePath) {
              pdfBuf = await downloadFromSupabase(
                fileRecord.storagePath,
                fileRecord.uniqueFileId || fileRecord.filename,
                fileRecord.bucketName
              );
            }
            if (pdfBuf && pdfBuf.length <= 20 * 1024 * 1024) {
              mediaAttachments.push({
                type: 'pdf',
                mimeType: 'application/pdf',
                dataBase64: pdfBuf.toString('base64'),
                filename: att.name || safeFilename,
              });
            }
          }
        } catch {}

        if (effectiveExtractedText && effectiveExtractedText.length > 0) {
          if (effectiveExtractedText.length <= 18000) {
            augmentedUserContent += `\n\n[ATTACHED PDF DOCUMENT: "${att.name}" (${effectivePageCount} pages) — Full Extracted Text]:\n${effectiveExtractedText}`;
          } else {
            const chunksToUse = (effectiveChunks && effectiveChunks.length > 0)
              ? effectiveChunks
              : createTextChunks(effectiveExtractedText, effectivePageCount);
            const relevantChunks = retrieveRelevantChunks(message || 'document overview', chunksToUse, 6);
            augmentedUserContent +=
              `\n\n[ATTACHED PDF DOCUMENT: "${att.name}" (Total ${effectivePageCount} pages, ${chunksToUse.length} sections)]\n` +
              `[Document Beginning Overview]:\n${effectiveExtractedText.slice(0, 3500)}\n\n` +
              `[Most Relevant Sections for User Question]:\n` +
              relevantChunks.map((c: any) => `--- Page ${c.page || 1} (Section ${c.index + 1}) ---\n${c.text}`).join('\n\n');
          }
        } else if (effectiveChunks && effectiveChunks.length > 0) {
          const relevantChunks = retrieveRelevantChunks(message || 'document overview', effectiveChunks, 6);
          augmentedUserContent += `\n\n[ATTACHED PDF DOCUMENT: "${att.name}" (Total ${effectivePageCount} pages, ${effectiveChunks.length} sections)]\n[Relevant Document Excerpts for query]:\n` +
            relevantChunks.map((c: any) => `--- Page ${c.page || 1} (Section ${c.index + 1}) ---\n${c.text}`).join('\n\n');
        } else if (effectiveIsScanned) {
          augmentedUserContent += `\n\n[ATTACHED PDF DOCUMENT: "${att.name}" (${effectivePageCount} pages)]\nNote: This PDF appears to be a scanned visual document. Analyze any visual pages provided or help the user with their request.`;
        }
      } else if (att.type === 'image' || att.mimeType?.startsWith('image/')) {
        let imgUrl = att.dataUrl && typeof att.dataUrl === 'string' && att.dataUrl.startsWith('data:image/')
          ? att.dataUrl
          : att.url;
        if (!imgUrl || !imgUrl.startsWith('data:image/')) {
          try {
            const filename = att.filename || dbFileRecord?.filename || (att.url ? path.basename(att.url.split('?')[0]) : null);
            if (filename) {
              const fileRecord = dbFileRecord || (await db.getFileByFilename(filename, user.id));
              const safeFilename = path.basename(filename);
              const filePath = path.resolve(UPLOADS_DIR, safeFilename);
              let fileBuf: Buffer | null = null;
              if (fileRecord && filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
                fileBuf = fs.readFileSync(filePath);
              } else if (fileRecord && fileRecord.storagePath) {
                fileBuf = await downloadFromSupabase(
                  fileRecord.storagePath,
                  fileRecord.uniqueFileId || fileRecord.filename,
                  fileRecord.bucketName
                );
              }
              if (fileBuf) {
                const ext = path.extname(filename).toLowerCase().replace('.', '') || 'jpeg';
                const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
                imgUrl = `data:${mime};base64,${fileBuf.toString('base64')}`;
              }
            }
          } catch (readErr) {
            console.warn('Image base64 conversion fallback to url:', readErr);
          }
        }
        if (imgUrl) imageUrls.push(imgUrl);
      } else if (att.type === 'video' || att.mimeType?.startsWith('video/')) {
        augmentedUserContent += `\n\n[Attached Video File: "${att.name}" (${Math.round((att.size || 0) / 1024 / 1024 * 10) / 10} MB). User requests analysis of this video content.]`;
        try {
          let videoLoaded = false;
          if (att.dataUrl && typeof att.dataUrl === 'string' && att.dataUrl.startsWith('data:video/')) {
            const match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              mediaAttachments.push({
                type: 'video',
                mimeType: match[1] || att.mimeType || 'video/mp4',
                dataBase64: match[2],
                filename: att.name,
              });
              videoLoaded = true;
            }
          }
          if (!videoLoaded) {
            const filename = att.filename || dbFileRecord?.filename || (att.url ? path.basename(att.url.split('?')[0]) : null);
            if (filename) {
              const fileRecord = dbFileRecord || (await db.getFileByFilename(filename, user.id));
              const safeFilename = path.basename(filename);
              const filePath = path.resolve(UPLOADS_DIR, safeFilename);
              let fileBuf: Buffer | null = null;
              let fileSize = fileRecord?.sizeBytes || fileRecord?.size || 0;
              if (fileRecord && filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                fileSize = stat.size;
                fileBuf = fs.readFileSync(filePath);
              } else if (fileRecord && fileRecord.storagePath) {
                fileBuf = await downloadFromSupabase(
                  fileRecord.storagePath,
                  fileRecord.uniqueFileId || fileRecord.filename,
                  fileRecord.bucketName
                );
                if (fileBuf) fileSize = fileBuf.length;
              }
              if (fileRecord && fileBuf) {
                if (fileSize <= 35 * 1024 * 1024) {
                  mediaAttachments.push({
                    type: 'video',
                    mimeType: fileRecord.mimeType || 'video/mp4',
                    dataBase64: fileBuf.toString('base64'),
                    filename: safeFilename,
                  });
                } else {
                  augmentedUserContent += `\n[Note: This video file (${Math.round(fileSize / 1024 / 1024)} MB) exceeds the 35MB inline multimodal processing threshold. Please notify the user of this size limit.]`;
                }
              }
            }
          }
        } catch (vidErr) {
          console.warn('Video attachment load note:', vidErr);
        }
      } else if (att.type === 'audio' || att.mimeType?.startsWith('audio/')) {
        augmentedUserContent += `\n\n[Attached Audio File: "${att.name}" (${Math.round((att.size || 0) / 1024 / 1024 * 10) / 10} MB). Transcribed content: "${effectiveExtractedText || 'Ready'}"]`;
      } else if (effectiveExtractedText) {
        if (effectiveExtractedText.length <= 32000) {
          augmentedUserContent += `\n\n[ATTACHED FILE CONTENT — "${att.name}"]:\n${effectiveExtractedText}`;
        } else {
          const chunksToUse = (effectiveChunks && effectiveChunks.length > 0)
            ? effectiveChunks
            : createTextChunks(effectiveExtractedText, effectivePageCount);
          const relevantChunks = retrieveRelevantChunks(message || 'file overview', chunksToUse, 8);
          augmentedUserContent +=
            `\n\n[ATTACHED FILE CONTENT — "${att.name}" (Total ${chunksToUse.length} sections)]\n` +
            `[File / Archive Overview & Header]:\n${effectiveExtractedText.slice(0, 6000)}\n\n` +
            `[Most Relevant File Sections for User Query]:\n` +
            relevantChunks.map((c: any) => `--- Section ${c.index + 1} ---\n${c.text}`).join('\n\n');
        }
      } else {
        augmentedUserContent += `\n\n[ATTACHED FILE: "${att.name}" (${att.mimeType || att.type || 'file'}, ${att.size || 0} bytes)]`;
      }
    }
  }

  // 3. Strict Pre-Call Usage Limits Enforcement with Credit Fallback
  const isComplexQuery = (attachments && attachments.length > 0) || (augmentedUserContent.length > 1500);
  const estimatedPromptTokens = Math.max(10, Math.ceil((augmentedUserContent.length + 300) / 3.8));

  // Save User Message (persist only if not in temporary/non-history mode and not an in-place regenerate/retry)
  const rawFileIds = attachments?.map((a: any) => a.id).filter(Boolean) || [];
  const fileOwnershipChecks = await Promise.all(
    rawFileIds.map(async (fid: string) => ({ fid, file: await db.getFileById(fid, user.id) }))
  );
  const fileIds = fileOwnershipChecks.filter((c) => Boolean(c.file)).map((c) => c.fid);

  let userMsg: Message;
  if (isTemporary || isRegenerate) {
    userMsg = {
      id: reuseUserMessageId || ('temp_user_' + Date.now()),
      conversationId,
      userId: user.id,
      role: 'user',
      content: message || '(Uploaded attachment)',
      model: model || conv.model || user.preferredModel || DEFAULT_MODEL_ID,
      fileIds: fileIds && fileIds.length > 0 ? fileIds : undefined,
      ...(attachments && attachments.length > 0
        ? {
            attachments: attachments.map((a: any) => ({
              id: a.id,
              name: a.name,
              filename: a.filename,
              type: a.type,
              mimeType: a.mimeType,
              size: a.size,
              url: a.url,
              previewUrl: a.previewUrl,
              pageCount: a.pageCount,
              duration: a.duration,
              createdAt: a.createdAt,
            })),
          }
        : {}),
      createdAt: new Date().toISOString(),
    };
  } else {
    const createdMsg = await db.createMessage({
      conversationId,
      userId: user.id,
      role: 'user',
      content: message || '(Uploaded attachment)',
      model: model || conv.model || user.preferredModel || DEFAULT_MODEL_ID,
      fileIds: fileIds && fileIds.length > 0 ? fileIds : undefined,
    });
    userMsg = {
      ...createdMsg,
      ...(attachments && attachments.length > 0
        ? {
            attachments: attachments.map((a: any) => ({
              id: a.id,
              name: a.name,
              filename: a.filename,
              type: a.type,
              mimeType: a.mimeType,
              size: a.size,
              url: a.url,
              previewUrl: a.previewUrl,
              pageCount: a.pageCount,
              duration: a.duration,
              createdAt: a.createdAt,
            })),
          }
        : {}),
    };
  }

  // Load existing conversation messages
  const existingMessages: Message[] = isTemporary
    ? (Array.isArray(history)
        ? history.map((h: any, idx: number) => ({
            id: 'temp_hist_' + idx,
            conversationId,
            userId: user.id,
            role: (h.role === 'assistant' ? 'assistant' : 'user') as MessageRole,
            content: String(h.content || ''),
            createdAt: new Date().toISOString(),
          }))
        : [])
    : await db.getMessages(conversationId, user.id);

  // If the user is asking a follow-up question in a conversation that already has uploaded files (PDF/ZIP/docs),
  // automatically include relevant excerpts from those conversation files so the AI can answer any follow-up question!
  if ((!attachments || attachments.length === 0) && aiEnginePreferences?.context !== 'off') {
    try {
      const historicalFileIds = new Set<string>();
      for (const m of existingMessages) {
        if (m.fileIds && Array.isArray(m.fileIds)) {
          for (const fid of m.fileIds) {
            if (fid) historicalFileIds.add(fid);
          }
        }
      }
      // Also check files linked directly to this conversationId
      const userFiles = await db.getFiles(user.id);
      for (const f of userFiles) {
        if (f.conversationId === conversationId && f.id) {
          historicalFileIds.add(f.id);
        }
      }

      if (historicalFileIds.size > 0) {
        const recentFileIds = Array.from(historicalFileIds).slice(-3);
        for (const fid of recentFileIds) {
          const histFile = await db.getFileById(fid, user.id);
          if (histFile && histFile.extractedText) {
            const textLen = histFile.extractedText.length;
            if (textLen <= 18000) {
              augmentedUserContent += `\n\n[PREVIOUSLY ATTACHED FILE IN THIS CHAT: "${histFile.originalName || histFile.filename}"]\n${histFile.extractedText}`;
            } else {
              const chunksToUse = (histFile.chunks && histFile.chunks.length > 0)
                ? histFile.chunks.map((c: any, idx: number) => ({
                    index: typeof c.index === 'number' ? c.index : idx,
                    text: c.text || '',
                    page: c.page,
                  }))
                : createTextChunks(histFile.extractedText, histFile.pageCount || 1);
              const relevantChunks = retrieveRelevantChunks(message || 'overview', chunksToUse, 6);
              augmentedUserContent +=
                `\n\n[PREVIOUSLY ATTACHED FILE IN THIS CHAT: "${histFile.originalName || histFile.filename}"]\n` +
                `[Overview]:\n${histFile.extractedText.slice(0, 3000)}\n\n` +
                `[Relevant Excerpts for Current Question]:\n` +
                relevantChunks.map((c: any) => `--- Section ${c.index + 1} ---\n${c.text}`).join('\n\n');
            }
          }
        }
      }
    } catch (histFileErr) {
      console.warn('Follow-up file context hydration note:', histFileErr);
    }
  }

  if (!isTemporary && existingMessages.length <= 2 && (conv.title === 'New Conversation' || !conv.title)) {
    setTimeout(() => {
      generateConversationTitle(message || 'Attachment discussion').then(async (newTitle) => {
        await db.updateConversation(conversationId, user.id, { title: newTitle });
      }).catch(() => {});
    }, 3500);
  }

  // Set SSE Headers (with X-Accel-Buffering: no for immediate unbuffered streaming)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial event with user message ID
  res.write(`event: user_message\ndata: ${JSON.stringify({ userMessage: userMsg })}\n\n`);

  let fullAssistantResponse = '';

  try {
    // Check for in-chat image generation request
    const imageIntent = detectImageGenerationIntent(message || '');
    if (imageIntent.isImage && (!attachments || attachments.length === 0)) {
      await executeInChatImageGeneration({
        prompt: imageIntent.prompt,
        originalPrompt: imageIntent.originalPrompt,
        style: imageIntent.style,
        aspectRatio: imageIntent.aspectRatio,
        quantity: imageIntent.quantity,
        variations: imageIntent.variations,
        isBengali: imageIntent.isBengali,
        user,
        conversationId,
        clientIp,
        res,
        safeReleaseLock,
      });
      return;
    }

    // Direct Identity & Founder Inquiry Check (e.g. "What is Aestific?", "Who created you?", "Who founded Aestific?", "Who are you?")
    if (isPureIdentityMessage(message || '') && (!attachments || attachments.length === 0)) {
      const identityText = generateIdentityResponse(message || '', {
        user,
        languagePreference,
      });

      const modelUsed = 'Aestific Core';
      res.write(`event: start\ndata: ${JSON.stringify({ provider: 'aestific', modelUsed, webSearchUsed: false })}\n\n`);

      // Stream words naturally for authentic typing experience
      const words = identityText.split(' ');
      for (let i = 0; i < words.length; i++) {
        const token = (i === 0 ? '' : ' ') + words[i];
        fullAssistantResponse += token;
        res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
        if (i < words.length - 1) {
          await new Promise((r) => setTimeout(r, 10));
        }
      }

      await db.incrementDailyUsage(user.id, { chatCount: 1 });
      aiMonitor.recordAiRequest({
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        type: 'chat',
        provider: 'aestific',
        model: modelUsed,
        webSearchUsed: false,
        promptSnippet: message,
        ip: clientIp,
        status: 'success',
      });

      let assistantMsg: Message;
      if (isTemporary) {
        assistantMsg = {
          id: 'temp_asst_' + Date.now(),
          conversationId,
          userId: user.id,
          role: 'assistant',
          content: fullAssistantResponse,
          model: modelUsed,
          createdAt: new Date().toISOString(),
        };
      } else {
        assistantMsg = await db.createMessage({
          conversationId,
          userId: user.id,
          role: 'assistant',
          content: fullAssistantResponse,
          model: modelUsed,
        });
      }

      res.write(`event: done\ndata: ${JSON.stringify({ assistantMessage: assistantMsg })}\n\n`);
      res.end();
      return;
    }

    // Format history
    let historyMessages = existingMessages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    // Add current user message with augmentation
    if (historyMessages.length > 0 && historyMessages[historyMessages.length - 1].role === 'user') {
      historyMessages[historyMessages.length - 1].content = augmentedUserContent;
    } else {
      historyMessages.push({ role: 'user', content: augmentedUserContent });
    }

    // Context setting: If Context is 'off', do not include optional previous conversation context for the request
    if (aiEnginePreferences?.context === 'off') {
      historyMessages = [{ role: 'user', content: augmentedUserContent }];
    }

    const effectiveUser: User = {
      ...user,
      ...(languagePreference ? { languagePreference } : {}),
      ...(user.personalization?.preferredLanguage ? { languagePreference: user.personalization.preferredLanguage } : {}),
    };

    const streamResult = await createChatStream({
      user: effectiveUser,
      messages: historyMessages,
      model: model || conv.model || user.preferredModel || DEFAULT_MODEL_ID,
      temperature: temperature || 0.7,
      imageUrls,
      mediaAttachments,
      aiEnginePreferences,
      onSearchProgress: (status) => {
        const formattedSources = (status.sources || []).map((s) => ({
          title: s.title || getReadableSourceName(s.url),
          url: s.url,
          sourceName: s.sourceName || getReadableSourceName(s.url),
          domain: s.domain || getDomainFromUrl(s.url),
          publishedDate: s.publishedDate,
        }));
        res.write(
          `event: search_status\ndata: ${JSON.stringify({
            phase: status.phase,
            query: status.query,
            sources: formattedSources,
          })}\n\n`
        );
        (res as any).flush?.();
      },
    });

    const { stream, provider, model: modelUsed, webSearchUsed, webSearchSources = [] } = streamResult as any;

    const collectedSourcesMap = new Map<
      string,
      { title: string; url: string; sourceName?: string; domain?: string; publishedDate?: string }
    >();

    if (Array.isArray(webSearchSources)) {
      for (const s of webSearchSources) {
        if (s && s.url && typeof s.url === 'string' && s.url.startsWith('http')) {
          const norm = s.url.replace(/\/+$/, '').toLowerCase();
          if (!collectedSourcesMap.has(norm)) {
            collectedSourcesMap.set(norm, {
              title: s.title || getReadableSourceName(s.url),
              url: s.url,
              sourceName: s.sourceName || getReadableSourceName(s.url),
              domain: s.domain || getDomainFromUrl(s.url),
              publishedDate: s.publishedDate,
            });
          }
        }
      }
    }

    res.write(
      `event: start\ndata: ${JSON.stringify({
        provider,
        modelUsed,
        webSearchUsed,
        sources: Array.from(collectedSourcesMap.values()),
      })}\n\n`
    );
    (res as any).flush?.();

    let pendingStreamBuffer = '';
    let streamForwardingConfirmed = false;
    let suppressTokenStreaming = false;

    const handleStreamToken = (delta: string) => {
      if (!delta) return;
      fullAssistantResponse += delta;

      if (suppressTokenStreaming) {
        return;
      }

      if (streamForwardingConfirmed) {
        res.write(`event: token\ndata: ${JSON.stringify({ token: delta })}\n\n`);
        (res as any).flush?.();
        return;
      }

      pendingStreamBuffer += delta;
      const trimmedStart = pendingStreamBuffer.trimStart();
      if (!trimmedStart) return;

      // Check if the stream is starting with /image, JSON tool call, or an image refusal that will be intercepted
      const isDefinitelyIntercepted =
        /^\/image\b/i.test(trimmedStart) ||
        /^\{\s*["']action["']/i.test(trimmedStart) ||
        /^(?:দুঃখিত[^।\n]*আমি\s*সরাসরি\s*ছবি|আমি\s*সরাসরি\s*ছবি\s*তৈরি\s*করতে\s*পারি\s*না|Sorry[^.\n]*I\s*can(?:not|'t)\s*(?:directly\s*)?(?:generate|create|draw)\s*(?:an?\s*)?(?:image|picture|photo))/i.test(trimmedStart);

      if (isDefinitelyIntercepted) {
        suppressTokenStreaming = true;
        pendingStreamBuffer = '';
        return;
      }

      // Hold buffer briefly ONLY if it is literally starting with /image or {"action"
      const mightBeInterceptedPrefix =
        trimmedStart.length < 12 &&
        (
          '/image'.startsWith(trimmedStart.toLowerCase()) ||
          '{"action"'.startsWith(trimmedStart.toLowerCase())
        );

      if (mightBeInterceptedPrefix) {
        return;
      }

      // Normal conversational response: flush buffer and stream all subsequent tokens live
      streamForwardingConfirmed = true;
      res.write(`event: token\ndata: ${JSON.stringify({ token: pendingStreamBuffer })}\n\n`);
      (res as any).flush?.();
      pendingStreamBuffer = '';
    };

    if (provider === 'groq') {
      for await (const chunk of stream as any) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          handleStreamToken(delta);
        }
      }
    } else if (provider === 'gemini') {
      for await (const chunk of stream as any) {
        const text = chunk.text || '';
        if (text) {
          handleStreamToken(text);
        }
        // Extract any native Google Search grounding chunks if present
        try {
          const groundingChunks = chunk?.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(groundingChunks)) {
            for (const gc of groundingChunks) {
              const uri = gc?.web?.uri;
              const title = gc?.web?.title;
              if (uri && typeof uri === 'string' && uri.startsWith('http')) {
                const norm = uri.replace(/\/+$/, '').toLowerCase();
                if (!collectedSourcesMap.has(norm)) {
                  collectedSourcesMap.set(norm, {
                    title: title || getReadableSourceName(uri),
                    url: uri,
                    sourceName: getReadableSourceName(uri, title),
                    domain: getDomainFromUrl(uri),
                  });
                }
              }
            }
          }
        } catch {}
      }
    } else if (provider === 'deepseek') {
      for await (const token of stream as any) {
        if (token && typeof token === 'string') {
          handleStreamToken(token);
        } else if (token?.choices?.[0]?.delta?.content) {
          handleStreamToken(token.choices[0].delta.content);
        }
      }
    } else {
      // Simulation stream
      for await (const chunk of stream as any) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          handleStreamToken(delta);
        }
      }
    }

    // Sanitize any raw tool-call hallucinations into clean user-facing guidance
    fullAssistantResponse = sanitizeAssistantResponse(fullAssistantResponse, message || '');

    // Intercept if LLM produced an /image command, action JSON, or an image-generation refusal instead of executing
    const trimmedAssistant = fullAssistantResponse.trim();
    const slashImageMatch = trimmedAssistant.match(/^\/image\s+(.+)$/is) || trimmedAssistant.match(/(?:^|\n)\/image\s+([^\n]+)/i);
    const isActionJson = (fullAssistantResponse.includes('"action"') || fullAssistantResponse.includes("'action'")) &&
      (fullAssistantResponse.includes('dalle') || fullAssistantResponse.includes('text2im') || fullAssistantResponse.includes('action_input') || fullAssistantResponse.includes('image_generator'));
    const isImageRefusal = /(?:আমি\s*সরাসরি\s*ছবি\s*তৈরি\s*করতে\s*পারি\s*না|ছবি\s*জেনারেট\s*করা\s*সম্ভব\s*নয়|ল্যাঙ্গুয়েজ\s*মডেল\s*বা\s*টেক্সট-ভিত্তিক\s*এআই|ইমেজ\s*জেনারেটর\s*টুলে\s*ব্যবহার|ইমেজ\s*জেনারেটিং\s*প্ল্যাটফর্মে|cannot\s+directly\s+(?:generate|create)\s+images?|cannot\s+(?:generate|create|draw)\s+images?\s+directly|unable\s+to\s+(?:generate|create)\s+images?|text-based\s+AI.*(?:image|picture|photo))/i.test(fullAssistantResponse);

    if (slashImageMatch || isActionJson || isImageRefusal) {
      let recoveryPrompt = '';
      if (slashImageMatch && slashImageMatch[1]) {
        recoveryPrompt = slashImageMatch[1].replace(/^\[|\]$/g, '').trim();
      } else if (isImageRefusal) {
        // Extract English Prompt: "..." if the LLM provided one inside its refusal
        const extractedPromptMatch =
          fullAssistantResponse.match(/Prompt\s*:\s*["“”'`]([^"“”'`\n]+)["“”'`]/i) ||
          fullAssistantResponse.match(/\*\*Prompt\s*:?\*\*\s*["“”'`]?([^"“”'`\n]+)["“”'`]?/i) ||
          fullAssistantResponse.match(/Prompt\s*:\s*([^\n]+)/i);
        if (extractedPromptMatch && extractedPromptMatch[1] && extractedPromptMatch[1].trim().length > 4) {
          recoveryPrompt = extractedPromptMatch[1].replace(/^["'`*]+|["'`*]+$/g, '').trim();
        } else {
          recoveryPrompt = preserveAndCleanPrompt(message || '');
        }
      } else {
        const promptMatch = fullAssistantResponse.match(/\"prompt\"\s*:\s*\"([^\"]+)\"/i) || 
                            fullAssistantResponse.match(/\"action_input\"\s*:\s*\"([^\"]+)\"/i) ||
                            fullAssistantResponse.match(/prompt['"]?\s*:\s*['"]([^'"]+)['"]/i);
        recoveryPrompt = promptMatch ? promptMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim() : (message || '').trim();
      }

      if (recoveryPrompt && recoveryPrompt.length > 2) {
        safeLogger.info(`[Image Recovery] Executing intercepted image request: "${recoveryPrompt}"`);
        const recoveryIntent = detectImageGenerationIntent(recoveryPrompt);
        const cleanPrompt = recoveryIntent.isImage ? recoveryIntent.prompt : preserveAndCleanPrompt(recoveryPrompt);
        await executeInChatImageGeneration({
          prompt: cleanPrompt || recoveryPrompt,
          originalPrompt: recoveryPrompt,
          style: recoveryIntent.style || imageIntent.style || 'natural',
          aspectRatio: recoveryIntent.aspectRatio || imageIntent.aspectRatio || '1:1',
          quantity: recoveryIntent.quantity || imageIntent.quantity || 1,
          variations: recoveryIntent.variations || imageIntent.variations || false,
          isBengali: recoveryIntent.isBengali || imageIntent.isBengali || /[^\x00-\x7F]/.test(recoveryPrompt),
          user,
          conversationId,
          clientIp,
          res,
          safeReleaseLock,
          isRecovery: true,
        });
        return;
      }
    }

    // Flush any remaining held buffer if it turned out to be a normal short response
    if (pendingStreamBuffer && !suppressTokenStreaming) {
      res.write(`event: token\ndata: ${JSON.stringify({ token: pendingStreamBuffer })}\n\n`);
      (res as any).flush?.();
      pendingStreamBuffer = '';
    }

    const finalSources = Array.from(collectedSourcesMap.values()).slice(0, 8);
    const effectiveWebSearchUsed = Boolean(webSearchUsed || finalSources.length > 0);

    // If web search was used and we have verified sources, ensure source links are also appended if the model omitted markdown links
    if (
      effectiveWebSearchUsed &&
      finalSources.length > 0 &&
      !suppressTokenStreaming &&
      !/\]\(https?:\/\//i.test(fullAssistantResponse)
    ) {
      const appendedSourcesMarkdown =
        `\n\n### 🌐 Sources\n` +
        finalSources
          .slice(0, 5)
          .map((s) => `- [${s.sourceName || s.domain || 'Source'} — ${s.title.replace(/\[|\]/g, '')}](${s.url})`)
          .join('\n');
      fullAssistantResponse += appendedSourcesMarkdown;
      res.write(`event: token\ndata: ${JSON.stringify({ token: appendedSourcesMarkdown })}\n\n`);
      (res as any).flush?.();
    }

    // Increment daily usage metric (Analytics only, NO restrictions)
    await db.incrementDailyUsage(user.id, { chatCount: 1 });

    // Record AI request and optional web search in Autonomous AI Monitor
    aiMonitor.recordAiRequest({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      type: 'chat',
      provider: provider || 'groq',
      model: modelUsed || 'default',
      webSearchUsed: effectiveWebSearchUsed,
      promptSnippet: message,
      ip: clientIp,
      status: 'success',
    });

    if (effectiveWebSearchUsed) {
      aiMonitor.recordWebSearch({
        userId: user.id,
        userEmail: user.email,
        query: message || 'Web Search Inquiry',
        provider: 'Aestific Live Web Search',
      });
    }

    // Save Assistant message (persist only if not temporary)
    let assistantMsg: Message;
    if (isTemporary) {
      assistantMsg = {
        id: 'temp_asst_' + Date.now(),
        conversationId,
        userId: user.id,
        role: 'assistant',
        content: fullAssistantResponse || 'Response completed.',
        model: modelUsed,
        webSearchUsed: effectiveWebSearchUsed,
        sources: finalSources.length > 0 ? finalSources : undefined,
        createdAt: new Date().toISOString(),
      };
    } else {
      const createdAsst = await db.createMessage({
        conversationId,
        userId: user.id,
        role: 'assistant',
        content: fullAssistantResponse || 'Response completed.',
        model: modelUsed,
      });
      assistantMsg = {
        ...createdAsst,
        webSearchUsed: effectiveWebSearchUsed,
        sources: finalSources.length > 0 ? finalSources : undefined,
      };

      // Extract memory asynchronously ONLY for persistent conversations
      extractAndSaveMemory(user.id, conversationId, message || '', fullAssistantResponse);
    }

    res.write(`event: done\ndata: ${JSON.stringify({ assistantMessage: assistantMsg })}\n\n`);
    res.end();
  } catch (err: any) {
    safeLogger.error('Chat stream failure:', err);

    const classified = classifyError(err);
    const userFacingError = classified.safeMessage;

    // Record API error in AI Monitor safely with sanitized error
    aiMonitor.recordApiError({
      endpoint: '/api/chat/stream',
      provider: 'ai-engine',
      model: 'chat-stream',
      errorType: classified.category === 'ai_provider' && classified.statusCode === 429
        ? 'upstream_429'
        : classified.category === 'timeout'
        ? 'network_timeout'
        : 'stream_failure',
      errorMessage: classified.safeMessage,
      userId: user?.id,
      userEmail: user?.email,
      ip: clientIp,
    });

    if (!res.headersSent) {
      return sendSafeError(res, err, classified.statusCode, userFacingError);
    }

    res.write(`event: error\ndata: ${JSON.stringify({ error: userFacingError, code: classified.code })}\n\n`);
    res.end();
  } finally {
    safeReleaseLock();
  }
});

// React to message (Like / Dislike)
app.post('/api/messages/:id/react', requireAuth, async (req: AuthRequest, res: Response) => {
  const { liked, disliked } = req.body || {};
  const updated = await db.updateMessageReaction(req.params.id, req.user!.id, liked, disliked);
  if (!updated) {
    return res.status(404).json({ error: 'Message not found or access denied.' });
  }
  res.json({ message: updated });
});

// ==========================================
// MEMORIES API (Account-Level Memory)
// ==========================================

app.get('/api/memories', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const memories = await db.getMemories(userId);
  res.json({ memories, memoryEnabled: req.user!.memoryEnabled });
});

app.post('/api/memories', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { content, category } = req.body || {};

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Memory content is required.' });
  }

  const newMem = await db.createMemory({
    userId,
    content: content.trim(),
    category: category || 'preference',
  });

  res.status(201).json({ memory: newMem });
});

app.delete('/api/memories/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const success = await db.deleteMemory(req.params.id, userId);
  if (!success) {
    return res.status(404).json({ error: 'Memory not found.' });
  }
  res.json({ message: 'Memory removed.' });
});

app.delete('/api/memories', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  await db.clearMemories(userId);
  res.json({ message: 'All memories cleared.' });
});

app.patch('/api/memories/toggle', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { enabled } = req.body || {};
  const updated = await db.updateUser(userId, { memoryEnabled: Boolean(enabled) });
  res.json({ memoryEnabled: updated?.memoryEnabled });
});

// ==========================================
// FILES & MULTIMODAL API
// ==========================================

app.post(
  '/api/files/upload',
  requireAuth,
  detectUploadPathTraversal,
  uploadMiddleware.single('file') as unknown as RequestHandler,
  async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const userId = req.user!.id;
    const clientIp = getClientIp(req);
    const rawConversationId = req.body.conversationId;
    let validConversationId: string | undefined = undefined;

    if (
      rawConversationId &&
      !String(rawConversationId).startsWith('temp-') &&
      !String(rawConversationId).startsWith('temp_') &&
      !String(rawConversationId).startsWith('temporary-')
    ) {
      const conv = await db.getConversationById(rawConversationId, userId);
      if (!conv) {
        if (req.file.path && fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch {}
        }
        return res.status(404).json({ error: 'Conversation not found or access denied.' });
      }
      validConversationId = rawConversationId;
    }

    // Multi-tier Rate Limiting for file uploads
    const userBurst = checkRateLimitByKey(`file:user:burst:${userId}`, 8, 30000, 'Uploading files too quickly. Please wait a moment.');
    if (!userBurst.allowed) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return sendRateLimitResponse(res, userBurst);
    }

    const user2Min = checkRateLimitByKey(`file:user:2min:${userId}`, 25, 120000, 'File upload rate limit reached. Please wait a couple minutes.');
    if (!user2Min.allowed) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return sendRateLimitResponse(res, user2Min);
    }

    const ipRate = checkRateLimitByKey(`file:ip:${clientIp}`, 40, 120000, 'Network upload rate limit exceeded. Please wait a couple minutes.');
    if (!ipRate.allowed) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return sendRateLimitResponse(res, ipRate);
    }

    const fileRecord = await processUploadedFile(req.file, userId, validConversationId);

    res.status(201).json({
      message: 'File processed successfully.',
      file: fileRecord,
    });
  } catch (err: any) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    return sendSafeError(res, err, undefined, 'Failed to upload and process file. Please try again.');
  }
});

app.get('/api/files', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const type = req.query.type as string | undefined;
  const files = await db.getFiles(userId, type);
  res.json({ files });
});

app.get('/api/files/download/:filename', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const rawFilename = req.params.filename;
    if (!rawFilename || typeof rawFilename !== 'string') {
      return res.status(400).json({ error: 'Filename is required.' });
    }

    // Path traversal defense
    if (
      rawFilename.includes('..') ||
      rawFilename.includes('/') ||
      rawFilename.includes('\\') ||
      rawFilename.includes('\0') ||
      rawFilename.includes('%') ||
      rawFilename.startsWith('.')
    ) {
      return res.status(400).json({ error: 'Invalid filename specified.' });
    }

    const safeFilename = path.basename(rawFilename.trim());
    if (!safeFilename || !/^[a-zA-Z0-9_\-\.]+$/.test(safeFilename)) {
      return res.status(400).json({ error: 'Invalid filename specified.' });
    }

    // Step 1: Find database file record (MUST exist in database)
    const fileRecord = await db.findFileByFilename(safeFilename);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found.' });
    }

    // Step 2: Strict ownership check (MUST belong to authenticated user or elevated admin)
    const isOwner = fileRecord.userId === user.id;
    const isElevatedAdmin = Boolean(req.admin?.isAdmin);
    if (!isOwner && !isElevatedAdmin) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to access this file.' });
    }

    // Step 3: Verify physical file boundary & existence on disk or Supabase Storage
    const diskFilename = path.basename(fileRecord.filename || fileRecord.uniqueFileId || safeFilename);
    const filePath = path.resolve(UPLOADS_DIR, diskFilename);
    const normalizedUploadsDir = path.resolve(UPLOADS_DIR) + path.sep;
    if (!filePath.startsWith(normalizedUploadsDir)) {
      return res.status(400).json({ error: 'Path traversal attempt detected.' });
    }

    const safeDownloadName = encodeURIComponent(fileRecord.originalName || diskFilename);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-transform, max-age=86400');

    // Security: Content-Disposition & Sandbox for non-media / executable or HTML files
    const ext = path.extname(diskFilename).toLowerCase();
    const isMedia = ALLOWED_IMAGE_EXTS.has(ext) || ALLOWED_AUDIO_EXTS.has(ext) || ALLOWED_VIDEO_EXTS.has(ext) || ext === '.pdf';

    if (isMedia) {
      if (fileRecord.mimeType) {
        res.setHeader('Content-Type', fileRecord.mimeType);
      }
      res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName}"; filename*=UTF-8''${safeDownloadName}`);
    } else {
      // Force download attachment and sandbox for documents/code to prevent XSS
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"; filename*=UTF-8''${safeDownloadName}`);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }

    const isProd = process.env.NODE_ENV === 'production';

    // Step 4: Storage provider resolution & authoritative file retrieval
    if (isProd) {
      const storagePath = fileRecord.storagePath;
      if (fileRecord.storageProvider === 'local-fallback' || !storagePath) {
        if (fs.existsSync(filePath)) {
          return res.sendFile(filePath);
        }
      }

      if (storagePath) {
        const supabaseBuffer = await downloadFromSupabase(
          storagePath,
          fileRecord.uniqueFileId || diskFilename,
          fileRecord.bucketName
        );

        if (supabaseBuffer) {
          return res.send(supabaseBuffer);
        }
      }

      // Safe fallback if file exists on disk
      if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
      }

      safeLogger.warn(`[Download] Storage object unavailable for record ${fileRecord.id} (${storagePath}).`);
      return res.status(404).json({ error: 'File not found on storage service.' });
    }

    // Development/test behaviour: may continue using local files where explicitly intended
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }

    if (fileRecord.storagePath) {
      const supabaseBuffer = await downloadFromSupabase(
        fileRecord.storagePath,
        fileRecord.uniqueFileId || diskFilename,
        fileRecord.bucketName
      );
      if (supabaseBuffer) {
        return res.send(supabaseBuffer);
      }
    }

    return res.status(404).json({ error: 'File not found on server or storage.' });
  } catch (err: any) {
    return sendSafeError(res, err, 500, 'Failed to retrieve file.');
  }
});

app.delete('/api/files/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const fileId = req.params.id;

  if (
    !fileId ||
    typeof fileId !== 'string' ||
    !/^[a-zA-Z0-9_\-\.]+$/.test(fileId.trim()) ||
    fileId.includes('..') ||
    fileId.includes('/') ||
    fileId.includes('\\') ||
    fileId.includes('\0') ||
    fileId.includes('%')
  ) {
    return res.status(400).json({ error: 'Invalid file ID specified.' });
  }

  const fileRecord = await db.getFileById(fileId, userId);
  const success = await db.deleteFileRecord(fileId, userId);
  if (!success) {
    return res.status(404).json({ error: 'File not found or access denied.' });
  }
  if (fileRecord && fileRecord.storagePath) {
    deleteFromSupabase(fileRecord.storagePath, fileRecord.uniqueFileId || fileRecord.filename, fileRecord.bucketName).catch(() => {});
  }
  res.json({ message: 'File deleted.' });
});

// ==========================================
// VOICE RECORDING & TRANSCRIPTION API
// ==========================================

app.post(
  '/api/voice/transcribe',
  requireAuth,
  detectUploadPathTraversal,
  audioUploadMiddleware.single('audio') as unknown as RequestHandler,
  async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio recording received.' });
    }

    const user = req.user!;
    const clientIp = getClientIp(req);
    const durationSeconds = Math.max(1, Math.round(parseFloat(req.body.duration || '0')));

    // Verify conversation ownership upfront if provided
    let validConversationId = req.body.conversationId;
    if (validConversationId) {
      const conv = await db.getConversationById(validConversationId, user.id);
      if (!conv) {
        if (req.file.path && fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch {}
        }
        return res.status(404).json({ error: 'Conversation not found or access denied.' });
      }
    }

    // Multi-tier Rate Limiting for voice transcription abuse prevention
    const userBurst = checkRateLimitByKey(`voice:user:burst:${user.id}`, 5, 30000, 'Sending voice notes too fast. Please wait a moment.');
    if (!userBurst.allowed) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return sendRateLimitResponse(res, userBurst);
    }

    const user2Min = checkRateLimitByKey(`voice:user:2min:${user.id}`, 15, 120000, 'Voice recording rate limit reached. Please wait a couple minutes.');
    if (!user2Min.allowed) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return sendRateLimitResponse(res, user2Min);
    }

    const ipRate = checkRateLimitByKey(`voice:ip:${clientIp}`, 25, 120000, 'Network voice rate limit exceeded. Please wait a couple minutes.');
    if (!ipRate.allowed) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return sendRateLimitResponse(res, ipRate);
    }

    const audioExt = path.extname(req.file.originalname).toLowerCase();
    const magicCheck = validateFileMagicBytes(req.file.path, audioExt, req.file.mimetype);
    if (!magicCheck.isValid) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(400).json({ error: magicCheck.error || 'Invalid audio binary signature.' });
    }

    const text = await transcribeAudioFile(req.file.path);

    const originalAudioName = sanitizeOriginalFilename(req.file.originalname) || `Voice Note ${new Date().toLocaleTimeString()}`;
    const { storagePath } = generateStoragePath(user.id, originalAudioName);

    // Synchronously upload to storage before saving database metadata
    const uploadResult = await uploadToSupabaseStorage({
      userId: user.id,
      uniqueFileId: req.file.filename,
      storagePath,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      originalName: originalAudioName,
    });

    if (!uploadResult.success) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      safeLogger.error('Voice note storage upload failed:', uploadResult.error);
      return res.status(503).json({ error: 'Storage service is temporarily unavailable. Failed to save voice note.' });
    }

    // Save file record in database with compensation cleanup on failure
    let fileRecord;
    try {
      fileRecord = await db.createFileRecord({
        userId: user.id,
        conversationId: validConversationId,
        storageProvider: 'supabase',
        bucketName: uploadResult.bucketName || 'aestific-files',
        storagePath,
        uniqueFileId: req.file.filename,
        filename: req.file.filename,
        originalName: originalAudioName,
        type: 'audio',
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        url: `/api/files/download/${req.file.filename}`,
        extractedText: text,
        duration: durationSeconds,
      });
    } catch (dbErr) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      deleteFromSupabase(storagePath, req.file.filename, uploadResult.bucketName).catch(() => {});
      throw dbErr;
    }

    // Track daily usage metric (Analytics only, NO restriction)
    await db.incrementDailyUsage(user.id, { fileCount: 1 });

    // Ephemeral filesystem hardening: Clean up temporary audio processing file after confirmed persistence
    if (req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }

    res.json({
      transcription: text,
      file: fileRecord,
    });
  } catch (err: any) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    safeLogger.error('Voice transcription error:', err);
    return sendSafeError(res, err, undefined, 'Voice transcription failed. Please try again.');
  }
});

// ==========================================
// DAILY USAGE ANALYTICS TELEMETRY
// ==========================================

app.get('/api/usage', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = (await db.findUserById(req.user!.id)) || req.user!;
  const usage = await db.getDailyUsage(user.id);
  res.json({
    usage,
    status: user.status || 'active',
  });
});

// Cloud History Auto-Cleanup (Admin Trigger)
app.post('/api/admin/cleanup-cloud-history', requireRetentionTriggerAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:cleanup:ip:${clientIp}`, 10, 60000, 'Too many cleanup requests. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const { retentionDays, force } = req.body || {};
    const days = typeof retentionDays === 'number' && Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : 30;
    const result = await run30DayRetentionCleanup(days, { triggerSource: admin.adminName, forceLock: Boolean(force) });

    await db.addAdminLog({
      adminName: admin.adminName,
      ip: clientIp,
      action: 'TRIGGER_RETENTION_CLEANUP',
      details: `Triggered cloud history cleanup with ${days}-day retention policy via ${admin.adminName}. Removed ${result.deletedConversationsCount} conversations and ${result.deletedMessagesCount} messages.${result.skipped ? ' [SKIPPED: lock active]' : ''}`,
    });

    return res.json({
      ...result,
      message: `Successfully cleaned ${result.deletedConversationsCount} stale conversations, ${result.deletedMessagesCount} messages, and ${result.deletedFilesCount} storage files older than ${days} days.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Cloud cleanup failed' });
  }
});

// ============================================================================
// RETENTION CLEANUP AUTHORITATIVE HTTP TRIGGER (Cloud Scheduler & Admin)
// Authoritative Production Contract: POST /api/cron/retention-cleanup
// POST-only: Never exposes an unauthenticated GET endpoint.
// Authentication: Requires CRON_SECRET / RETENTION_CRON_SECRET OR elevated Sentinel admin auth.
// ============================================================================
app.post(
  ['/api/admin/retention-cleanup', '/api/admin/trigger-cleanup', '/api/cron/retention-cleanup'],
  requireRetentionTriggerAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const admin = req.admin!;
      const clientIp = getClientIp(req);
      const rate = checkRateLimitByKey(`admin:cleanup:ip:${clientIp}`, 10, 60000, 'Too many cleanup requests. Please wait.');
      if (!rate.allowed) return sendRateLimitResponse(res, rate);

      const { retentionDays, force } = req.body || {};
      const days = typeof retentionDays === 'number' && Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : 30;
      const result = await run30DayRetentionCleanup(days, { triggerSource: admin.adminName, forceLock: Boolean(force) });

      await db.addAdminLog({
        adminName: admin.adminName,
        ip: clientIp,
        action: 'TRIGGER_RETENTION_CLEANUP',
        details: `Executed retention cleanup (${days} days) via ${admin.adminName}. Cleaned ${result.deletedConversationsCount} conversations, ${result.deletedMessagesCount} messages, ${result.deletedFilesCount} files.${result.skipped ? ' [SKIPPED: lock active]' : ''}`,
      });

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Retention cleanup failed' });
    }
  }
);

// ==========================================
// AI PICTURE & IMAGE GENERATION API
// ==========================================

app.post('/api/images/generate', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const clientIp = getClientIp(req);
  const lockKey = `img:${user.id}`;

  try {
    const { prompt, aspectRatio, style, conversationId, quantity, variations } = req.body || {};

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Please provide a prompt describing the picture you want to generate.' });
    }

    const count = Math.min(Math.max(quantity || 1, 1), 4);
    const isVariations = Boolean(variations) || count > 1;

    // Multi-tier Rate Limiting for image generation
    const userBurst = checkRateLimitByKey(`img:user:burst:${user.id}`, 15, 30000, 'Generating images too quickly. Please wait 30 seconds.');
    if (!userBurst.allowed) {
      return sendRateLimitResponse(res, userBurst);
    }

    const user2Min = checkRateLimitByKey(`img:user:2min:${user.id}`, 40, 120000, 'Image generation rate limit reached. Please wait a couple minutes.');
    if (!user2Min.allowed) {
      return sendRateLimitResponse(res, user2Min);
    }

    const ipRate = checkRateLimitByKey(`img:ip:${clientIp}`, 60, 120000, 'Network image generation rate limit exceeded. Please wait a couple minutes.');
    if (!ipRate.allowed) {
      return sendRateLimitResponse(res, ipRate);
    }

    // In-flight concurrency lock to prevent simultaneous duplicate requests
    if (!acquireInferenceLock(lockKey)) {
      return sendRateLimitResponse(res, {
        message: 'An image generation is already processing. Please wait for it to finish.',
        retryAfter: 5,
      });
    }

    // Verify conversation ownership if provided
    let validConversationId = conversationId;
    if (validConversationId) {
      const conv = await db.getConversationById(validConversationId, user.id);
      if (!conv) {
        return res.status(404).json({ error: 'Conversation not found or access denied.' });
      }
    }

    // Clean conversational wrappers and translate/enrich prompt (supports Bengali, Banglish, and any language)
    const cleanedSubject = preserveAndCleanPrompt(prompt.trim());
    const enrichedPrompt = await enrichImagePrompt(cleanedSubject || prompt.trim(), style);

    const fileRecords = await generateAIImages({
      prompt: enrichedPrompt || cleanedSubject || prompt.trim(),
      aspectRatio: aspectRatio || '1:1',
      style: style || 'photorealistic',
      userId: user.id,
      conversationId: validConversationId,
      quantity: count,
      variations: isVariations,
    });

    // If conversationId is provided, also create a message in chat with the generated image attachment
    if (validConversationId) {
      let content = '';
      if (fileRecords.length > 1) {
        content = `Here are ${fileRecords.length} variations:\n\n`;
        fileRecords.forEach((f, idx) => {
          content += `![Variation ${idx + 1}](${f.url})\n\n`;
        });
        content += `**Prompt:** *${prompt.trim()}*`;
      } else {
        content = `![Generated Image](${fileRecords[0].url})\n\n**Prompt:** *${prompt.trim()}*`;
      }

      await db.createMessage({
        conversationId: validConversationId,
        userId: user.id,
        role: 'assistant',
        content,
        model: 'Aestific Visual',
        fileIds: fileRecords.map(f => f.id),
      });
    }

    // Record AI request event in AI Monitor
    aiMonitor.recordAiRequest({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      type: 'image',
      provider: 'aestific',
      model: 'Aestific Visual',
      aspectRatio: aspectRatio || '1:1',
      style: style || 'photorealistic',
      promptSnippet: prompt.trim(),
      ip: clientIp,
      status: 'success',
    });

    return res.json({
      message: count > 1 ? `${fileRecords.length} images generated successfully.` : 'Image generated successfully.',
      image: fileRecords[0],
      images: fileRecords,
    });
  } catch (err: any) {
    safeLogger.error('Image generation error:', err);
    const classified = classifyError(err);

    // Record API error in AI Monitor
    aiMonitor.recordApiError({
      endpoint: '/api/images/generate',
      provider: 'imagen',
      model: 'aestific Neural Image Engine',
      errorType: classified.code.toLowerCase(),
      errorMessage: classified.safeMessage,
      userId: user?.id,
      userEmail: user?.email,
      ip: clientIp,
    });

    let safeMsg = classified.safeMessage;
    let statusCode = classified.statusCode;

    const lowerMsg = (err?.message || '').toLowerCase();
    if (lowerMsg.includes('safety') || lowerMsg.includes('policy') || lowerMsg.includes('blocked')) {
      statusCode = 400;
      safeMsg = 'This request was blocked by image safety guidelines. Please modify your prompt and try again.';
    } else if (lowerMsg.includes('descriptive prompt') || lowerMsg.includes('empty')) {
      statusCode = 400;
      safeMsg = 'Please provide a prompt describing the picture you want to generate.';
    } else if (err?.isRateLimit || lowerMsg.includes('quota') || lowerMsg.includes('429') || lowerMsg.includes('resource_exhausted')) {
      statusCode = 429;
      safeMsg = 'Image generation is temporarily unavailable due to high demand. Please try again in a few moments.';
    } else if (lowerMsg.includes('not configured') || lowerMsg.includes('unconfigured') || lowerMsg.includes('gemini_api_key')) {
      statusCode = 503;
      safeMsg = 'Image generation service is temporarily unavailable. Please try again later.';
    }

    return sendSafeError(res, err, statusCode, safeMsg);
  } finally {
    releaseInferenceLock(lockKey);
  }
});

// ==========================================
// AI ENGINE CONFIG & STATUS
// ==========================================

app.get('/api/settings/status', requireAuth, (_req: AuthRequest, res: Response) => {
  const serverGeminiConfigured = Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('MY_'));
  const serverGroqConfigured = Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.startsWith('MY_') && process.env.GROQ_API_KEY.length > 5);
  const serverExaConfigured = Boolean(process.env.EXA_API_KEY && !process.env.EXA_API_KEY.startsWith('MY_') && process.env.EXA_API_KEY.length > 5);

  res.json({
    serverGroqConfigured,
    serverGeminiConfigured,
    serverExaConfigured,
    activeProvider: 'Aestific Intelligence',
    webSearchProvider: 'Exa Neural Search',
    availableModels: AVAILABLE_MODELS,
  });
});

app.get('/api/models', (_req: Request, res: Response) => {
  res.json({
    models: AVAILABLE_MODELS,
    defaultModel: DEFAULT_MODEL_ID,
  });
});

// ==========================================
// SECRET ADMIN MANAGEMENT API ENDPOINTS
// ==========================================

// Helper to retrieve configured admin step secrets strictly from process.env (Secrets) for each specific step
// Step 1 -> ADMIN_STEP_1
// Step 2 -> ADMIN_STEP_2
// Step 3 -> ADMIN_STEP_3
// Step 4 -> ADMIN_STEP_4
// Zero hardcoded secrets or cross-step fallbacks exist in the codebase.
function getAdminStepSecrets(step: number): string[] {
  const stepSpecificKeys = [
    `ADMIN_STEP_${step}`,
    `ADMIN_STEP${step}`,
    `STEP_${step}`,
    `STEP${step}`,
    `ADMIN_PASS_${step}`,
    `ADMIN_PASSCODE_${step}`,
    `ADMIN_PASSWORD_${step}`,
    `ADMIN_SECRET_${step}`,
    `ADMIN_KEY_${step}`,
  ];

  const results: string[] = [];

  for (const k of stepSpecificKeys) {
    const val = process.env[k];
    if (val && typeof val === 'string' && val.trim() !== '') {
      const rawTrimmed = val.trim();
      if (rawTrimmed !== 'undefined' && rawTrimmed !== 'null') {
        if (!results.includes(rawTrimmed)) {
          results.push(rawTrimmed);
        }
        const unquoted = rawTrimmed.replace(/^["']|["']$/g, '').trim();
        if (unquoted && !results.includes(unquoted)) {
          results.push(unquoted);
        }
      }
    }
  }

  return results;
}

function timingSafeMatchSecret(input: string, expected: string): boolean {
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    const dummy = Buffer.alloc(a.length);
    crypto.timingSafeEqual(a, dummy);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Check Admin Candidate Access (Admin panel is always locked and requires 5-step verification)
app.get('/api/admin/check-access', requireAdminCandidate, (_req: AuthRequest, res: Response) => {
  return res.json({
    success: true,
    authorized: true,
    passwordlessMode: false,
    locked: true,
  });
});

// Quick-Access is permanently disabled: Admin Panel cannot be entered without the 5-step secret passwords
app.post('/api/admin/quick-access', (_req: Request, res: Response) => {
  return res.status(403).json({
    success: false,
    authorized: false,
    passwordlessMode: false,
    error: 'Admin panel is strictly locked. Password verification for Steps 1-4 and Admin Name in Step 5 are required.',
  });
});

// Retrieve verification steps configuration status
app.get('/api/admin/gateway-hints', requireAdminCandidate, (req: AuthRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const hintRate = checkRateLimitByKey(
      `admin:hints:ip:${clientIp}`,
      30,
      60000,
      'Too many admin requests. Please wait a moment.'
    );
    if (!hintRate.allowed) {
      return sendRateLimitResponse(res, hintRate);
    }

    // Return safe minimal step sequence definition, without leaking secrets, env var names, or configuration state
    return res.json({
      success: true,
      steps: [
        { step: 1, name: 'Step 01' },
        { step: 2, name: 'Step 02' },
        { step: 3, name: 'Step 03' },
        { step: 4, name: 'Step 04' },
        { step: 5, name: 'Step 05' },
      ],
      message: 'Gateway step sequence verified.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve gateway status.' });
  }
});

// Verify Step in Sequential 5-Step Process
app.post('/api/admin/verify-step', requireAdminCandidate, async (req: AuthRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);

    // Requirement 1 & 3: Admin session creation must require an authenticated admin identity
    const authUser = req.user;
    if (!authUser || !authUser.id || !authUser.email) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please sign in with an administrator account.' });
    }

    // Multi-tier Rate Limiting against admin gateway brute forcing
    const ipRate = checkRateLimitByKey(
      `admin:verify:ip:${clientIp}`,
      15,
      60000,
      'Too many admin verification attempts. Please wait 1 minute.'
    );
    if (!ipRate.allowed) {
      return sendRateLimitResponse(res, ipRate);
    }

    // Account-level and IP-level failed attempt lockout (5 failed attempts per 5 minutes)
    const ipFailRate = checkFailedRateLimit(
      `admin:verify:failed:ip:${clientIp}`,
      5,
      300000,
      'Too many failed admin verification attempts. Please wait 5 minutes before trying again.'
    );
    if (!ipFailRate.allowed) {
      return sendRateLimitResponse(res, ipFailRate);
    }

    const userFailRate = checkFailedRateLimit(
      `admin:verify:failed:user:${authUser.id}`,
      5,
      300000,
      'Too many failed admin verification attempts for this account. Please wait 5 minutes.'
    );
    if (!userFailRate.allowed) {
      return sendRateLimitResponse(res, userFailRate);
    }

    // Malformed request body checks
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, error: 'Malformed request body.' });
    }

    const { step, code, adminName, stepToken } = req.body;

    if (step === undefined || typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > 5) {
      return res.status(400).json({ success: false, error: 'Invalid verification step. Must be an integer from 1 to 5.' });
    }

    // STEP 1: Verify against ADMIN_STEP_1 secret from environment
    if (step === 1) {
      if (code === undefined || typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ success: false, error: 'Invalid verification credentials.' });
      }

      const expectedCodes = getAdminStepSecrets(1);
      if (expectedCodes.length === 0) {
        return res.status(503).json({
          success: false,
          error: 'Step 1 secret (ADMIN_STEP_1) is not configured in server Secrets.',
        });
      }

      const rawInput = (code || '').toString().trim();
      const cleanedInput = rawInput.replace(/^["']|["']$/g, '').trim();

      const isMatch = expectedCodes.some((exp) => {
        const expClean = exp.trim();
        return (
          timingSafeMatchSecret(rawInput, expClean) ||
          timingSafeMatchSecret(cleanedInput, expClean)
        );
      });

      if (!isMatch) {
        // Enforce progressive failed attempt counters
        recordFailedAttempt(`admin:verify:failed:ip:${clientIp}`);
        recordFailedAttempt(`admin:verify:failed:user:${authUser.id}`);

        // Audit log failed attempt (NEVER log the passcode or secret!)
        await db.addAdminLog({
          adminName: authUser.email,
          ip: clientIp,
          action: 'ADMIN_STEP_FAILED',
          details: `Verification failed for Step 1. Client IP: ${clientIp}`,
        });

        return res.status(400).json({
          success: false,
          error: 'Incorrect password for Step 1. Access denied.',
        });
      }

      // Initiate a strictly timed, sequential verification session (5 minute total window)
      startVerificationSession(authUser.id, authUser.email);
      const nextStepToken = createAdminStepToken(authUser.id, 1);

      // Audit log step success
      await db.addAdminLog({
        adminName: authUser.email,
        ip: clientIp,
        action: 'ADMIN_STEP_SUCCESS',
        details: `Successfully passed verification Step 1. Client IP: ${clientIp}`,
      });

      return res.json({
        success: true,
        stepCompleted: 1,
        nextStep: 2,
        stepToken: nextStepToken,
      });
    }

    // STEPS 2-4: Verify against ADMIN_STEP_2, ADMIN_STEP_3, ADMIN_STEP_4 secrets in strict sequential order
    if (step >= 2 && step <= 4) {
      const activeSession = getVerificationSession(authUser.id);
      if (!activeSession) {
        await db.addAdminLog({
          adminName: authUser.email,
          ip: clientIp,
          action: 'ADMIN_STEP_EXPIRED',
          details: `Verification sequence expired or not found for Step ${step}. Client IP: ${clientIp}`,
        });
        return res.status(400).json({
          success: false,
          error: 'Verification session expired. Please restart from Step 1.',
          expired: true,
        });
      }

      // Strict sequential enforcement: Step N requires Step N-1 to be completed
      if (
        activeSession.completedStep !== step - 1 ||
        (stepToken !== undefined && !verifyAdminStepToken(stepToken, authUser.id, step - 1))
      ) {
        return res.status(400).json({
          success: false,
          error: `Invalid verification sequence. Step ${step - 1} must be verified before Step ${step}.`,
        });
      }

      if (code === undefined || typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ success: false, error: 'Invalid verification credentials.' });
      }

      const expectedCodes = getAdminStepSecrets(step);
      if (expectedCodes.length === 0) {
        return res.status(503).json({
          success: false,
          error: `Step ${step} secret (ADMIN_STEP_${step}) is not configured in server Secrets.`,
        });
      }

      const rawInput = (code || '').toString().trim();
      const cleanedInput = rawInput.replace(/^["']|["']$/g, '').trim();

      const isMatch = expectedCodes.some((exp) => {
        const expClean = exp.trim();
        return (
          timingSafeMatchSecret(rawInput, expClean) ||
          timingSafeMatchSecret(cleanedInput, expClean)
        );
      });

      if (!isMatch) {
        recordFailedAttempt(`admin:verify:failed:ip:${clientIp}`);
        recordFailedAttempt(`admin:verify:failed:user:${authUser.id}`);

        await db.addAdminLog({
          adminName: authUser.email,
          ip: clientIp,
          action: 'ADMIN_STEP_FAILED',
          details: `Verification failed for Step ${step}. Client IP: ${clientIp}`,
        });

        return res.status(400).json({
          success: false,
          error: `Incorrect password for Step ${step}. Access denied.`,
        });
      }

      advanceVerificationSession(authUser.id, step);
      const nextStepToken = createAdminStepToken(authUser.id, step);

      await db.addAdminLog({
        adminName: authUser.email,
        ip: clientIp,
        action: 'ADMIN_STEP_SUCCESS',
        details: `Successfully passed verification Step ${step}. Client IP: ${clientIp}`,
      });

      return res.json({
        success: true,
        stepCompleted: step,
        nextStep: step + 1,
        stepToken: nextStepToken,
      });
    }

    // STEP 5: Enter Admin Name & issue short-lived admin session (only after Steps 1-4 are verified)
    if (step === 5) {
      const activeSession = getVerificationSession(authUser.id);
      if (!activeSession) {
        return res.status(400).json({
          success: false,
          error: 'Verification session expired. Please restart the verification sequence.',
          expired: true,
        });
      }

      if (
        activeSession.completedStep !== 4 ||
        (stepToken !== undefined && !verifyAdminStepToken(stepToken, authUser.id, 4))
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid verification sequence. Please complete password steps 1 through 4 first.',
        });
      }

      const candidate = adminName !== undefined ? adminName : code;
      const name = (candidate || '').toString().trim().replace(/^["']|["']$/g, '').trim();
      if (!name || name.length < 2 || name.length > 64) {
        return res.status(400).json({
          success: false,
          error: 'Please enter a valid Admin Name (between 2 and 64 characters) for Step 5.',
        });
      }

      // Immediately consume and delete the verification session so Step 5 cannot be replayed
      deleteVerificationSession(authUser.id);

      // Check if this admin name, account email, or account name is banned
      const banCheckName = await db.isBannedAdmin(name);
      const banCheckEmail = await db.isBannedAdmin(authUser.email);
      const banCheckUserName = authUser.name ? await db.isBannedAdmin(authUser.name) : { isBanned: false };
      const banCheck = banCheckName.isBanned ? banCheckName : (banCheckEmail.isBanned ? banCheckEmail : banCheckUserName);
      if (banCheck.isBanned) {
        const remainingMs = ((banCheck as any).expiresAt || 0) - Date.now();
        const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
        return res.status(403).json({
          success: false,
          error: 'ADMIN_BANNED',
          message: `Admin access for "${banCheckName.isBanned ? name : authUser.email}" is suspended. Ban expires in approx ${remainingHours} hours.`,
          expiresAt: (banCheck as any).expiresAt,
        });
      }

      // REQUIREMENT 12: Invalidate prior admin sessions for this user
      revokeAdminSession(undefined, authUser.id);

      // REQUIREMENT 1, 2, 4: Generate SHORT-LIVED (1-hour) admin session bound strictly to authenticated admin identity
      const { token: adminToken, jti } = generateAdminToken(
        {
          id: authUser.id,
          email: authUser.email,
          name: authUser.name,
          role: 'admin',
        },
        name
      );

      // REQUIREMENT 5: Store admin sessions securely via HttpOnly cookies (1 hour max)
      setAuthCookies(res, adminToken, {
        maxAge: 60 * 60 * 1000, // 1 hour short-lived session
      });

      // REQUIREMENT 7 & 8: Safe server-side audit logging without secrets, keys, or passwords
      await db.addAdminLog({
        adminName: name,
        ip: clientIp,
        action: 'ADMIN_SESSION_CREATED',
        details: `Master clearance granted for account ${authUser.email}. Session ID: ${jti}. Client IP: ${clientIp}`,
      });

      return res.json({
        success: true,
        adminName: name,
        authorized: true,
        token: adminToken,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Internal gateway verification failure.' });
  }
});

// Safe Admin User Sanitizer: strictly strips passwordHash, verificationCodeHash, and internal tokens
function sanitizeAdminUser(u: any) {
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

// Admin Overview, Telemetry, and Dashboard
app.get(['/api/admin/overview', '/api/admin/telemetry', '/api/admin/dashboard'], requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:overview:ip:${clientIp}`, 60, 60000, 'Too many requests. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const rawUsers = await db.getAllUsers();
    const users = await Promise.all(
      rawUsers.map(async (u) => ({
        ...sanitizeAdminUser(u),
        usage: await db.getDailyUsage(u.id),
        activity: await db.getUserActivitySummary(u.id),
      }))
    );

    const stats = await db.getSystemTelemetry();
    const serverGroqConfigured = Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.startsWith('MY_') && process.env.GROQ_API_KEY.length > 5);
    const serverGeminiConfigured = Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('MY_'));
    const brevoConfigured = Boolean(process.env.BREVO_API_KEY && !process.env.BREVO_API_KEY.startsWith('xkeysib-xxxx'));

    return res.json({
      stats,
      users,
      system: {
        nodeEnv: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        groqConfigured: serverGroqConfigured,
        neuralEngineConfigured: serverGeminiConfigured,
        geminiConfigured: serverGeminiConfigured,
        brevoConfigured,
        appVersion: '2.4.0',
        memoryUsage: process.memoryUsage(),
      },
    });
  } catch (err: any) {
    safeLogger.error('Admin overview error:', err);
    return sendSafeError(res, err, 500, 'Failed to retrieve admin overview telemetry');
  }
});

// Admin User Full Activity & Inspector Details
app.get('/api/admin/users/:id/details', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:user-details:ip:${clientIp}`, 60, 60000);
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const { id } = req.params;
    const user = await db.findUserById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [conversations, files, memories, usage, activity] = await Promise.all([
      db.getConversations(id),
      db.getFiles(id),
      db.getMemories(id),
      db.getDailyUsage(id),
      db.getUserActivitySummary(id),
    ]);

    return res.json({
      success: true,
      user: sanitizeAdminUser(user),
      activity,
      usage,
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model,
        isPinned: c.isPinned,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      filesCount: files.length,
      memoriesCount: memories.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve user inspector details' });
  }
});

// Admin Settings
app.get('/api/admin/settings', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:settings:ip:${clientIp}`, 60, 60000, 'Too many requests. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const settings = await db.getAdminSettings();
    return res.json({ success: true, settings });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve admin settings' });
  }
});

// Autonomous AI Usage Monitoring Telemetry (Works independently from rate limiting)
app.get('/api/admin/ai-monitoring', requireAdminAuth, (req: AuthRequest, res: Response) => {
  try {
    const data = aiMonitor.getOverview(isRateLimitingEnabled());
    return res.json(data);
  } catch (err: any) {
    safeLogger.error('AI monitoring telemetry error:', err);
    return sendSafeError(res, err, 500, 'Failed to retrieve AI monitoring telemetry');
  }
});

// Clear AI Monitoring logs (Admin Maintenance)
app.post('/api/admin/ai-monitoring/clear', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    aiMonitor.clearAllMonitoring();
    await db.addAdminLog({
      adminName: req.admin?.adminName || req.user?.email || 'Admin',
      ip: getClientIp(req),
      action: 'ai_monitoring_cleared',
      details: 'Administrator cleared historical AI monitoring store.',
    });
    return res.json({ success: true, message: 'AI monitoring logs cleared successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to clear AI monitoring logs' });
  }
});

// Passcode Configuration Status (Server-Only Environment Secrets; secrets are NEVER exposed)
app.get('/api/admin/passcodes', requireAdminAuth, (req: AuthRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:passcodes:ip:${clientIp}`, 30, 60000, 'Too many requests. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const stepsStatus = [1, 2, 3, 4, 5].map((s) => ({
      step: s,
      envVar: s === 5 ? 'Admin Name (Identity)' : `ADMIN_STEP_${s}`,
      isConfigured: s === 5 ? true : getAdminStepSecrets(s).length > 0,
    }));
    return res.json({ stepsStatus, isEnvManaged: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve passcodes status' });
  }
});

// Audit Logs
app.get('/api/admin/logs', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:logs:ip:${clientIp}`, 60, 60000, 'Too many requests. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const logs = await db.getAdminLogs(200);

    // Compute admin roster, active status, last actions, and IPs
    const adminMap = new Map<string, {
      adminName: string;
      isActive: boolean;
      lastActiveAt: string;
      ip: string;
      actionCount: number;
      lastAction: string;
    }>();

    // Current logged-in admin is guaranteed live right now
    const currentAdminName = req.admin?.adminName || 'Superadmin';
    adminMap.set(currentAdminName.toLowerCase(), {
      adminName: currentAdminName,
      isActive: true,
      lastActiveAt: new Date().toISOString(),
      ip: clientIp,
      actionCount: 0,
      lastAction: 'ACTIVE_SESSION',
    });

    const now = Date.now();
    for (const log of logs) {
      const key = log.adminName.toLowerCase().trim();
      const logTime = new Date(log.timestamp).getTime();
      const isRecentlyActive = now - logTime < 15 * 60 * 1000;

      const existing = adminMap.get(key);
      if (existing) {
        existing.actionCount += 1;
        if (logTime > new Date(existing.lastActiveAt).getTime()) {
          existing.lastActiveAt = log.timestamp;
          existing.ip = log.ip || existing.ip;
          existing.lastAction = log.action;
          if (isRecentlyActive) existing.isActive = true;
        }
      } else {
        adminMap.set(key, {
          adminName: log.adminName,
          isActive: isRecentlyActive,
          lastActiveAt: log.timestamp,
          ip: log.ip,
          actionCount: 1,
          lastAction: log.action,
        });
      }
    }

    const adminRoster = Array.from(adminMap.values());
    return res.json({ logs, adminRoster });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Ban/Unban Admin
app.get('/api/admin/banned-admins', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:banned:ip:${clientIp}`, 60, 60000, 'Too many requests. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const settings = await db.getAdminSettings();
    return res.json({ bannedAdmins: settings.bannedAdmins || [] });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve banned admins' });
  }
});

app.post('/api/admin/ban-admin', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { targetAdminName } = req.body || {};
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:ban:ip:${clientIp}`, 20, 60000, 'Too many admin ban actions. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    if (!targetAdminName || !targetAdminName.trim()) {
      return res.status(400).json({ error: 'Target admin name is required.' });
    }

    if (
      targetAdminName.toLowerCase().trim() === admin.adminName.toLowerCase().trim() ||
      targetAdminName.toLowerCase().trim() === req.user?.email?.toLowerCase().trim()
    ) {
      return res.status(400).json({ error: 'Cannot ban your own active admin identity.' });
    }

    // Lifetime ban (100 years = 876000 hours, can be recovered later via unban)
    const lifetimeHours = 876000;
    const banned = await db.banAdmin(targetAdminName.trim(), admin.adminName, lifetimeHours);
    revokeAdminByName(targetAdminName.trim());
    await db.addAdminLog({
      adminName: admin.adminName,
      ip: clientIp,
      action: 'BAN_ADMIN_LIFETIME',
      details: `Permanently banned admin "${targetAdminName.trim()}" for life (recoverable via unban).`,
    });

    return res.json({
      success: true,
      bannedAdmin: banned,
      message: `Admin "${targetAdminName.trim()}" has been permanently banned for life. Access has been completely revoked.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to ban admin' });
  }
});

app.post('/api/admin/unban-admin', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { targetAdminName } = req.body || {};
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:ban:ip:${clientIp}`, 20, 60000, 'Too many admin unban actions. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    if (!targetAdminName || !targetAdminName.trim()) {
      return res.status(400).json({ error: 'Target admin name is required.' });
    }

    const unbanned = await db.unbanAdmin(targetAdminName);
    if (unbanned) {
      await db.addAdminLog({
        adminName: admin.adminName,
        ip: clientIp,
        action: 'UNBAN_ADMIN',
        details: `Restored clearance for admin "${targetAdminName}".`,
      });
      return res.json({ success: true, message: `Admin "${targetAdminName}" unbanned.` });
    }
    return res.status(404).json({ error: 'Banned admin record not found.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to unban admin' });
  }
});

// Ban/Unban User
app.patch('/api/admin/users/:id/ban', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { id } = req.params;
    const { isBanned, reason } = req.body || {};
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:users:modify:ip:${clientIp}`, 30, 60000, 'Too many user management actions. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    if (id === req.user?.id && isBanned) {
      return res.status(400).json({ error: 'Cannot ban your own administrator user account.' });
    }

    const updated = await db.banUser(id, Boolean(isBanned), reason);
    if (!updated) return res.status(404).json({ error: 'User not found' });

    await db.addAdminLog({
      adminName: admin.adminName,
      ip: clientIp,
      action: isBanned ? 'BAN_USER' : 'UNBAN_USER',
      details: `${isBanned ? 'Banned' : 'Unbanned'} user: ${updated.name} (${updated.email}). Reason: ${reason || 'Administrator Action'}`,
    });

    return res.json({
      success: true,
      user: sanitizeAdminUser(updated),
      message: isBanned ? 'User banned successfully.' : 'User restored successfully.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update ban status' });
  }
});

app.patch('/api/admin/users/:id/status', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { id } = req.params;
    const { isEmailVerified } = req.body || {};
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:users:modify:ip:${clientIp}`, 30, 60000, 'Too many user management actions. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const updated = await db.updateUser(id, { isEmailVerified: Boolean(isEmailVerified) });
    if (!updated) return res.status(404).json({ error: 'User not found' });

    await db.addAdminLog({
      adminName: admin.adminName,
      ip: clientIp,
      action: 'UPDATE_USER_VERIFIED',
      details: `Set email verified = ${isEmailVerified} for ${updated.email}`,
    });

    return res.json({ success: true, user: sanitizeAdminUser(updated) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

app.delete('/api/admin/users/:id', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { id } = req.params;
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:users:modify:ip:${clientIp}`, 30, 60000, 'Too many user management actions. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    if (id === req.user?.id) {
      return res.status(400).json({ error: 'Cannot delete your own administrator user account.' });
    }

    const user = await db.findUserById(id);
    const success = await db.deleteUser(id);

    await db.addAdminLog({
      adminName: admin.adminName,
      ip: clientIp,
      action: 'DELETE_USER',
      details: `Permanently deleted user account ${user?.email || id}`,
    });

    return res.json({ success, message: 'User deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Admin Custom Direct Email Dispatcher (Via Brevo)
app.post('/api/admin/send-email', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const clientIp = getClientIp(req);
    const emailRate = checkRateLimitByKey(`admin:email:ip:${clientIp}`, 10, 60000, 'Too many emails dispatched. Please wait.');
    if (!emailRate.allowed) return sendRateLimitResponse(res, emailRate);

    const { toEmail, toName, senderDisplayName, subject, textContent } = req.body || {};

    if (!toEmail || !toEmail.includes('@') || !subject || !textContent) {
      return res.status(400).json({ error: 'Recipient email, subject, and message content are required.' });
    }

    const result = await sendAdminDirectEmail({
      toEmail,
      toName,
      senderDisplayName: senderDisplayName || 'aestific Official Support',
      subject,
      textContent,
    });

    if (!result.success) {
      safeLogger.warn('Brevo direct email dispatch failed:', result.error);
      return res.status(400).json({ error: 'Failed to deliver email through Brevo. Please check email configuration.' });
    }

    await db.addAdminLog({
      adminName: admin.adminName,
      ip: clientIp,
      action: 'SEND_DIRECT_EMAIL',
      details: `Dispatched direct email to "${toEmail}" with Sender Display: "${senderDisplayName || 'aestific Support'}". Subject: "${subject}"`,
    });

    return res.json({ success: true, messageId: result.messageId, message: 'Email sent successfully via Brevo!' });
  } catch (err: any) {
    safeLogger.error('Admin direct email error:', err);
    return sendSafeError(res, err, 500, 'Failed to dispatch email.');
  }
});

// ==========================================
// PLATFORM DOCUMENTS MANAGEMENT (PUBLIC + ADMIN EDITOR)
// ==========================================

const DOCUMENTS_STORE_PATH = path.resolve(process.cwd(), 'documents-store.json');

function readStoredDocuments(): Record<string, any> {
  try {
    if (fs.existsSync(DOCUMENTS_STORE_PATH)) {
      const raw = fs.readFileSync(DOCUMENTS_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not read documents-store.json:', err);
  }
  return {};
}

function writeStoredDocuments(docs: Record<string, any>): void {
  try {
    fs.writeFileSync(DOCUMENTS_STORE_PATH, JSON.stringify(docs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Could not write documents-store.json:', err);
  }
}

app.get('/api/documents', (_req: Request, res: Response) => {
  try {
    const documents = readStoredDocuments();
    return res.json({ success: true, documents });
  } catch {
    return res.json({ success: true, documents: {} });
  }
});

app.put('/api/admin/documents', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const clientIp = getClientIp(req);
    const { documents, updatedDocId } = req.body || {};

    if (!documents || typeof documents !== 'object') {
      return res.status(400).json({ error: 'Valid documents payload is required.' });
    }

    writeStoredDocuments(documents);

    await db.addAdminLog({
      adminName: admin.adminName,
      ip: clientIp,
      action: 'UPDATE_PLATFORM_DOCUMENTS',
      details: updatedDocId
        ? `Updated platform document "${updatedDocId}" via Admin Documents Editor.`
        : 'Updated platform documents via Admin Documents Editor.',
    });

    return res.json({
      success: true,
      documents,
      message: 'Documents updated and published successfully.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save platform documents.' });
  }
});

// ==========================================
// USER SUPPORT CENTER & ADMIN TICKETING API
// ==========================================

// User creates support message
app.post('/api/support', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { subject, message } = req.body || {};

    if (!subject || !message || !subject.trim() || !message.trim()) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }

    const ticket = await db.createSupportTicket({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      subject: subject.trim(),
      message: message.trim(),
    });

    return res.json({ success: true, ticket });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create support ticket' });
  }
});

// User views their support tickets
app.get('/api/support', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const tickets = await db.getUserSupportTickets(user.id);
    return res.json({ tickets });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve support tickets' });
  }
});

// Admin views all tickets
app.get('/api/admin/support', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:support:ip:${clientIp}`, 60, 60000);
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const tickets = await db.getAllSupportTickets();
    return res.json({ tickets });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve all support tickets' });
  }
});

// Admin replies to a ticket
app.post('/api/admin/support/:id/reply', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { id } = req.params;
    const { reply } = req.body || {};
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:support:modify:ip:${clientIp}`, 30, 60000, 'Too many support ticket updates. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    if (!reply || !reply.trim()) {
      return res.status(400).json({ error: 'Reply text cannot be empty.' });
    }

    const updated = await db.replySupportTicket(id, reply, admin.adminName);
    if (!updated) return res.status(404).json({ error: 'Support ticket not found.' });

    await db.addAdminLog({
      adminName: admin.adminName,
      ip: clientIp,
      action: 'REPLY_SUPPORT_TICKET',
      details: `Replied to ticket ID ${id} from ${updated.userName} (${updated.userEmail})`,
    });

    return res.json({ success: true, ticket: updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reply to support ticket' });
  }
});

// Admin deletes a ticket
app.delete('/api/admin/support/:id', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { id } = req.params;
    const clientIp = getClientIp(req);
    const rate = checkRateLimitByKey(`admin:support:modify:ip:${clientIp}`, 30, 60000, 'Too many support ticket updates. Please wait.');
    if (!rate.allowed) return sendRateLimitResponse(res, rate);

    const deleted = await db.deleteSupportTicket(id);
    if (deleted) {
      await db.addAdminLog({
        adminName: admin.adminName,
        ip: clientIp,
        action: 'DELETE_SUPPORT_TICKET',
        details: `Deleted support ticket ID ${id}`,
      });
      return res.json({ success: true, message: 'Support ticket removed.' });
    }
    return res.status(404).json({ error: 'Support ticket not found' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete support ticket' });
  }
});

// ==========================================
// AESTIFIC BEHAVIOR CENTER (ADMIN-ONLY CHAT & GLOBAL RULES)
// ==========================================

// Get all behavior rules & stats
app.get('/api/admin/behavior/rules', requireAdminAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const rules = getAllBehaviorRules();
    const activeCount = rules.filter((r) => r.status === 'active').length;
    return res.json({
      success: true,
      rules,
      activeCount,
      totalCount: rules.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve behavior rules' });
  }
});

// Admin chats directly with Aestific Behavior Assistant to interpret & preview a proposed rule
app.post('/api/admin/behavior/chat', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message instruction is required.' });
    }

    const interpretation = await interpretAdminInstruction(message.trim());
    return res.json({
      success: true,
      aestificResponse: interpretation.aestificResponse,
      proposedRule: interpretation.proposedRule,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to interpret behavior instruction.' });
  }
});

// Test mode comparison: Current Response vs Candidate Response with new rule
app.post('/api/admin/behavior/test', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { sampleQuestion, candidateInstruction } = req.body || {};
    if (!sampleQuestion || !sampleQuestion.trim() || !candidateInstruction || !candidateInstruction.trim()) {
      return res.status(400).json({ error: 'Both sampleQuestion and candidateInstruction are required.' });
    }

    const comparison = await testBehaviorComparison({
      sampleQuestion: sampleQuestion.trim(),
      candidateInstruction: candidateInstruction.trim(),
    });

    return res.json({
      success: true,
      currentResponse: comparison.currentResponse,
      candidateResponse: comparison.candidateResponse,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to generate behavior comparison test.' });
  }
});

// Admin creates & applies a new behavior rule globally
app.post('/api/admin/behavior/rules', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { title, instruction, category, priority } = req.body || {};
    if (!title || !title.trim() || !instruction || !instruction.trim()) {
      return res.status(400).json({ error: 'Title and instruction are required.' });
    }

    const rule = createBehaviorRule({
      title,
      instruction,
      category,
      priority,
      adminId: (admin as any).id || admin.adminName || 'admin',
      adminName: admin.adminName || 'Admin',
    });

    return res.json({ success: true, rule, message: 'Behavior rule applied globally to all users.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to create behavior rule.' });
  }
});

// Admin edits an existing behavior rule (increments version, preserves history)
app.put('/api/admin/behavior/rules/:id', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { id } = req.params;
    const { title, instruction, category, priority, changeNote } = req.body || {};

    const updated = updateBehaviorRule(
      id,
      { title, instruction, category, priority, changeNote },
      (admin as any).id || admin.adminName || 'admin',
      admin.adminName || 'Admin'
    );

    return res.json({ success: true, rule: updated, message: `Rule updated to v${updated.version}.` });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to update behavior rule.' });
  }
});

// Admin toggles active / disabled
app.patch('/api/admin/behavior/rules/:id/toggle', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { id } = req.params;

    const updated = toggleBehaviorRule(id, (admin as any).id || admin.adminName || 'admin', admin.adminName || 'Admin');
    return res.json({
      success: true,
      rule: updated,
      message: `Rule is now ${updated.status === 'active' ? 'active' : 'disabled'}.`,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to toggle behavior rule.' });
  }
});

// Admin rolls back a rule to a previous version
app.post('/api/admin/behavior/rules/:id/rollback', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { id } = req.params;
    const { targetVersion } = req.body || {};

    if (!targetVersion || typeof targetVersion !== 'number') {
      return res.status(400).json({ error: 'Valid targetVersion number is required.' });
    }

    const updated = rollbackBehaviorRule(
      id,
      targetVersion,
      (admin as any).id || admin.adminName || 'admin',
      admin.adminName || 'Admin'
    );

    return res.json({
      success: true,
      rule: updated,
      message: `Rule rolled back to version ${targetVersion} specs (now saved as v${updated.version}).`,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to rollback behavior rule.' });
  }
});

// Admin deletes a behavior rule
app.delete('/api/admin/behavior/rules/:id', requireAdminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const { id } = req.params;

    deleteBehaviorRule(id, (admin as any).id || admin.adminName || 'admin', admin.adminName || 'Admin');
    return res.json({ success: true, message: 'Behavior rule deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to delete behavior rule.' });
  }
});

// Admin retrieves audit logs for behavior changes
app.get('/api/admin/behavior/audit-logs', requireAdminAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const logs = getBehaviorAuditLogs();
    return res.json({ success: true, logs });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve behavior audit logs.' });
  }
});

// ==========================================
// ERROR HANDLING MIDDLEWARE (Security & Clean Responses)
// ==========================================

// Handle 404 for missing API routes
app.use('/api/*', (_req: Request, res: Response) => {
  return res.status(404).json({
    error: 'The requested API endpoint was not found.',
    code: 'NOT_FOUND',
    status: 404,
  });
});

app.use(handlePayloadErrors);
app.use(productionErrorHandler);

// ==========================================
// VITE & CLIENT APP SERVING
// ==========================================

async function startServer() {
  if (!process.env.JWT_SECRET) {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = getJwtSecret();
    process.env.NODE_ENV = prevEnv;
  }

  // Production configuration pre-flight audit
  validateProductionEnvironment();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Initialize automated 30-day retention cron cleanup
  initRetentionCronSchedule();

  // Verify database connectivity and fallback to local persistent store if needed
  try {
    await db.checkHealth();
  } catch (dbErr) {
    console.warn('[Database] Initial health check warning:', dbErr);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`🚀 aestific Core Server running on port ${PORT}`);
    console.log(`✨ Inventing What's Next.`);
    console.log(`========================================\n`);
  });
}

startServer();
