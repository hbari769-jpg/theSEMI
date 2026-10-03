import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

// =========================================================================
// SENSITIVE DATA REDACTION ENGINE
// Requirement 8: Never log passwords, JWTs, API keys, service-role keys, session secrets
// =========================================================================

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /currentpassword/i,
  /newpassword/i,
  /confirmpassword/i,
  /passcode/i,
  /masterpasscode/i,
  /secret/i,
  /jwt_?secret/i,
  /session_?secret/i,
  /admin_?secret/i,
  /sentinel/i,
  /api[-_]?key/i,
  /token/i,
  /auth(?:orization)?/i,
  /cookie/i,
  /service[-_]?role/i,
  /bearer/i,
  /encryption[-_]?key/i,
  /credential/i,
  /groq/i,
  /gemini/i,
  /exa/i,
  /brevo/i,
  /supabase/i,
  /cloudflare/i,
  /connection_?string/i,
  /database_?url/i,
];

// Regex patterns to detect secrets in raw text strings
const REGEX_JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.?[A-Za-z0-9-_.+/=]*\b/g;
const REGEX_BEARER = /Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi;
const REGEX_GEMINI_KEY = /\bAIza[0-9A-Za-z-_]{35}\b/g;
const REGEX_GROQ_KEY = /\bgsk_[0-9A-Za-z]{20,}\b/g;
const REGEX_BREVO_KEY = /\bxkeysib-[0-9a-zA-Z]{64}\b/g;
const REGEX_SUPABASE_KEY = /\bsbp_[0-9a-zA-Z]{20,}\b/g;
const REGEX_GENERIC_KEY = /\b(?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{20,}\b/g;
const REGEX_DB_URL = /(postgres(?:ql)?|mysql|mongodb|redis):\/\/([^:]+):([^@]+)@/gi;
const REGEX_JSON_SECRET = /(["']?(?:password|currentPassword|newPassword|confirmPassword|passcode|secret|masterPasscode|adminSecret|token|apiKey|serviceRoleKey|jwtSecret|sessionSecret|supabaseKey|cloudflareToken)["']?\s*[:=]\s*["'])([^"'\r\n]+)(["']?)/gi;
const REGEX_PARAM_SECRET = /((?:password|pwd|passcode|secret|masterPasscode|token|key|apiKey|serviceRoleKey)\s*[:=]\s*["']?)([^"',\s)]+)(["']?)/gi;
const REGEX_URL_SECRET = /([?&](?:token|password|secret|key|apiKey|serviceRoleKey|sessionSecret|code)=)([^&\s]+)/gi;

/**
 * Returns dynamic list of known environment secrets currently in process.env
 */
function getKnownEnvSecrets(): string[] {
  const secrets = new Set<string>();
  const explicitKeys = [
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GROQ_API_KEY',
    'JWT_SECRET',
    'BREVO_API_KEY',
    'EXA_API_KEY',
    'SUPABASE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ADMIN_MASTER_PASSCODE',
    'ADMIN_SENTINEL_CODE',
    'ADMIN_PASSWORD',
    'ADMIN_SECRET',
    'ADMIN_PASSCODE',
    'ADMIN_STEP_1',
    'ADMIN_STEP_2',
    'ADMIN_STEP_3',
    'ADMIN_STEP_4',
    'ADMIN_STEP_5',
    'CLOUDFLARE_API_TOKEN',
    'SESSION_SECRET',
    'DATABASE_URL',
    'DB_PASSWORD',
  ];

  for (const k of explicitKeys) {
    const val = process.env[k];
    if (val && typeof val === 'string' && val.trim().length >= 4) {
      secrets.add(val.trim());
    }
  }

  // Also dynamically detect any environment variable with sensitive names
  for (const [key, val] of Object.entries(process.env)) {
    if (!val || typeof val !== 'string') continue;
    const trimmed = val.trim();
    if (trimmed.length < 4) continue;
    if (/secret|key|password|passcode|token|credential|service_role|auth/i.test(key)) {
      secrets.add(trimmed);
    }
  }

  return Array.from(secrets).sort((a, b) => b.length - a.length);
}

/**
 * Redacts any sensitive data (passwords, JWTs, API keys, secrets) from any string,
 * object, array, or error.
 */
export function redactSensitiveData<T = any>(val: T, depth = 0, seen = new WeakSet()): T {
  if (depth > 8) return '[MAX_DEPTH]' as any;
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    let sanitized: string = val;

    // 1. Redact known runtime environment secrets
    for (const secret of getKnownEnvSecrets()) {
      if (sanitized.includes(secret)) {
        sanitized = sanitized.split(secret).join('[REDACTED_ENV_SECRET]');
      }
    }

    // 2. Redact JWTs
    sanitized = sanitized.replace(REGEX_JWT, '[REDACTED_JWT]');

    // 3. Redact Bearer headers
    sanitized = sanitized.replace(REGEX_BEARER, 'Bearer [REDACTED_TOKEN]');

    // 4. Redact specific provider API keys
    sanitized = sanitized.replace(REGEX_GEMINI_KEY, '[REDACTED_GEMINI_KEY]');
    sanitized = sanitized.replace(REGEX_GROQ_KEY, '[REDACTED_GROQ_KEY]');
    sanitized = sanitized.replace(REGEX_BREVO_KEY, '[REDACTED_BREVO_KEY]');
    sanitized = sanitized.replace(REGEX_SUPABASE_KEY, '[REDACTED_SUPABASE_KEY]');
    sanitized = sanitized.replace(REGEX_GENERIC_KEY, '[REDACTED_API_KEY]');

    // 5. Redact key-value pairs in JSON strings, parameters, query strings, or database URLs
    sanitized = sanitized.replace(REGEX_DB_URL, '$1://$2:[REDACTED]@');
    sanitized = sanitized.replace(REGEX_JSON_SECRET, '$1[REDACTED]$3');
    sanitized = sanitized.replace(REGEX_PARAM_SECRET, '$1[REDACTED]$3');
    sanitized = sanitized.replace(REGEX_URL_SECRET, '$1[REDACTED]');

    return sanitized as any;
  }

  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }

  if (typeof val === 'object') {
    if (seen.has(val as object)) {
      return '[CIRCULAR]' as any;
    }
    seen.add(val as object);

    if (val instanceof Error) {
      const sanitizedErr: any = new Error(redactSensitiveData(val.message, depth + 1, seen));
      sanitizedErr.name = val.name;
      if (val.stack) {
        sanitizedErr.stack = redactSensitiveData(val.stack, depth + 1, seen);
      }
      if ((val as any).code) sanitizedErr.code = (val as any).code;
      if ((val as any).status) sanitizedErr.status = (val as any).status;
      if ((val as any).statusCode) sanitizedErr.statusCode = (val as any).statusCode;
      return sanitizedErr;
    }

    if (Array.isArray(val)) {
      return val.map((item) => redactSensitiveData(item, depth + 1, seen)) as any;
    }

    const sanitizedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(val)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pat) => pat.test(key));
      if (isSensitiveKey) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = redactSensitiveData(value, depth + 1, seen);
      }
    }
    return sanitizedObj as any;
  }

  return val;
}

// =========================================================================
// SAFE SERVER-SIDE LOGGER
// Requirement 7 & 8: Log detailed errors server-side, but never log sensitive keys/passwords
// =========================================================================

export const safeLogger = {
  error(msg: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const cleanArgs = args.map((arg) => redactSensitiveData(arg));
    console.error(`[${timestamp}] [ERROR] ${redactSensitiveData(msg)}`, ...cleanArgs);
  },
  warn(msg: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const cleanArgs = args.map((arg) => redactSensitiveData(arg));
    console.warn(`[${timestamp}] [WARN] ${redactSensitiveData(msg)}`, ...cleanArgs);
  },
  info(msg: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const cleanArgs = args.map((arg) => redactSensitiveData(arg));
    console.info(`[${timestamp}] [INFO] ${redactSensitiveData(msg)}`, ...cleanArgs);
  },
};

// =========================================================================
// ERROR CLASSIFICATION & SANITIZATION ENGINE
// Requirements 1, 2, 3, 4, 5, 6, 9, 10
// =========================================================================

export type ErrorCategory =
  | 'validation'
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'rate_limit'
  | 'database'
  | 'ai_provider'
  | 'filesystem'
  | 'timeout'
  | 'server_error';

export interface ClassifiedError {
  category: ErrorCategory;
  statusCode: number;
  code: string;
  safeMessage: string;
  originalMessage: string;
  stack?: string;
}

/**
 * Classifies any error into a standardized, safe representation.
 * Sanitizes internal details so clients never see stack traces, raw SQL,
 * internal filesystem paths, or provider keys.
 */
export function classifyError(err: any): ClassifiedError {
  const rawMsg = typeof err === 'string' ? err : err?.message || '';
  const stack = typeof err === 'object' && err?.stack ? err.stack : undefined;
  const status = Number(err?.status || err?.statusCode || 0);
  const errCode = String(err?.code || '');
  const errName = String(err?.name || '');

  // 1. TIMEOUT ERRORS (HTTP 504 / 408)
  if (
    errName === 'AbortError' ||
    errCode === 'ETIMEDOUT' ||
    errCode === 'ESOCKETTIMEDOUT' ||
    /timeout|timed out|request timed out/i.test(rawMsg)
  ) {
    return {
      category: 'timeout',
      statusCode: 504,
      code: 'REQUEST_TIMEOUT',
      safeMessage: 'The request timed out. Please try again.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 2. DATABASE ERRORS (Requirement 3: Never expose DB errors directly)
  if (
    errName === 'DatabaseUnavailableError' ||
    errCode === 'DATABASE_UNAVAILABLE' ||
    status === 503 ||
    /DatabaseUnavailableError|temporarily unavailable|database unavailable|Cloudflare D1 HTTP Error/i.test(rawMsg)
  ) {
    return {
      category: 'database',
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      safeMessage: 'Service temporarily unavailable. Please try again shortly.',
      originalMessage: rawMsg,
      stack,
    };
  }

  const isDatabaseError =
    errCode.startsWith('SQLITE_') ||
    errCode === 'D1_ERROR' ||
    /SQLITE_|syntax error at or near|D1_ERROR|D1 error|database disk image|relation "|foreign key constraint|\bFROM\s+[a-zA-Z_]+\b|\bSELECT\s+.*?\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+[a-zA-Z_]+\s+SET\b|\bDELETE\s+FROM\b/i.test(
      rawMsg
    );

  if (isDatabaseError) {
    if (/unique constraint failed|UNIQUE constraint/i.test(rawMsg)) {
      return {
        category: 'conflict',
        statusCode: 409,
        code: 'RESOURCE_CONFLICT',
        safeMessage: 'A record with this information already exists.',
        originalMessage: rawMsg,
        stack,
      };
    }

    return {
      category: 'database',
      statusCode: 500,
      code: 'DATABASE_ERROR',
      safeMessage: 'A database error occurred. Please try again later.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 3. AI PROVIDER / UPSTREAM ERRORS (Requirement 4: Sanitize API provider errors)
  const isAIProviderError =
    Boolean(err?.isProviderError) ||
    Boolean(err?.provider) ||
    /groq|gemini|imagen|google.?gen|generative.?ai|openai|exa|anthropic|brevo|pollinations|ai-engine/i.test(rawMsg) ||
    /model not found|generateContent|completions|image generation/i.test(rawMsg);

  if (isAIProviderError) {
    // Rate limit / quota
    if (status === 429 || /429|rate limit|quota|resource_exhausted|too many requests/i.test(rawMsg)) {
      return {
        category: 'ai_provider',
        statusCode: 429,
        code: 'AI_RATE_LIMITED',
        safeMessage: 'AI service capacity is temporarily busy. Please wait a moment and try again.',
        originalMessage: rawMsg,
        stack,
      };
    }

    // Safety policy block
    if (/safety|blocked|policy|content filter/i.test(rawMsg)) {
      return {
        category: 'ai_provider',
        statusCode: 400,
        code: 'AI_SAFETY_BLOCKED',
        safeMessage: 'This request was blocked by AI safety guidelines. Please modify your query and try again.',
        originalMessage: rawMsg,
        stack,
      };
    }

    // Provider authentication / configuration (Never expose provider keys or endpoints)
    if (status === 401 || status === 403 || /api[-_]?key|invalid key|key not found|unauthorized|api_key_invalid/i.test(rawMsg)) {
      return {
        category: 'ai_provider',
        statusCode: 503,
        code: 'AI_SERVICE_UNAVAILABLE',
        safeMessage: 'AI service is temporarily unavailable. Please try again later.',
        originalMessage: rawMsg,
        stack,
      };
    }

    return {
      category: 'ai_provider',
      statusCode: 502,
      code: 'AI_PROVIDER_ERROR',
      safeMessage: 'AI service encountered a temporary error. Please try again.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 4. FILESYSTEM ERRORS (Requirement 5: Sanitize file system errors)
  const isFilesystemError =
    ['ENOENT', 'EACCES', 'EPERM', 'EISDIR', 'EBUSY', 'ENOTEMPTY', 'ENOSPC', 'EMFILE'].includes(errCode) ||
    /\/app\/applet\/|C:\\|\/var\/|\/tmp\/|no such file or directory|permission denied/i.test(rawMsg);

  if (isFilesystemError) {
    if (errCode === 'ENOENT' || /no such file or directory/i.test(rawMsg)) {
      return {
        category: 'filesystem',
        statusCode: 404,
        code: 'FILE_NOT_FOUND',
        safeMessage: 'The requested file could not be found.',
        originalMessage: rawMsg,
        stack,
      };
    }

    return {
      category: 'filesystem',
      statusCode: 500,
      code: 'FILE_SYSTEM_ERROR',
      safeMessage: 'An unexpected file processing error occurred. Please try again.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 5. MULTER & PAYLOAD SIZE LIMITS (HTTP 413 / 400)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return {
        category: 'payload_too_large',
        statusCode: 413,
        code: 'LIMIT_FILE_SIZE',
        safeMessage: 'Payload Too Large: File size exceeds the maximum allowed upload limit.',
        originalMessage: rawMsg,
        stack,
      };
    }
    return {
      category: 'validation',
      statusCode: 400,
      code: err.code || 'UPLOAD_ERROR',
      safeMessage: `Upload error: ${err.message}`,
      originalMessage: rawMsg,
      stack,
    };
  }

  const isPayloadTooLarge =
    err?.type === 'entity.too.large' ||
    status === 413 ||
    (typeof rawMsg === 'string' && /exceeds.*limit|limit.*exceeded|payload too large|file size exceeds/i.test(rawMsg));

  if (isPayloadTooLarge) {
    return {
      category: 'payload_too_large',
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      safeMessage: rawMsg && rawMsg.includes('limit') && !rawMsg.includes('/')
        ? rawMsg
        : 'Payload Too Large: The request body or file exceeds the allowed size limit.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 6. MALFORMED JSON (HTTP 400)
  const isMalformedJson =
    err?.type === 'entity.parse.failed' ||
    (err instanceof SyntaxError && 'body' in err) ||
    /unexpected token|malformed json|json.*syntax/i.test(rawMsg);

  if (isMalformedJson) {
    return {
      category: 'validation',
      statusCode: 400,
      code: 'MALFORMED_JSON',
      safeMessage: 'Malformed JSON payload: The request body could not be parsed.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 7. AUTHENTICATION ERRORS (Requirement 6: Keep generic)
  const isAuthError =
    errName === 'JsonWebTokenError' ||
    errName === 'TokenExpiredError' ||
    status === 401 ||
    /invalid token|jwt expired|jwt malformed|authentication required|session expired/i.test(rawMsg);

  if (isAuthError) {
    return {
      category: 'auth',
      statusCode: 401,
      code: 'UNAUTHORIZED',
      safeMessage: 'Authentication required or session expired. Please sign in again.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 8. FORBIDDEN (HTTP 403)
  if (status === 403 || /forbidden|insufficient privileges|access denied/i.test(rawMsg)) {
    return {
      category: 'forbidden',
      statusCode: 403,
      code: 'FORBIDDEN',
      safeMessage: 'Access denied. You do not have permission to perform this action.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 9. NOT FOUND (HTTP 404)
  if (status === 404 || /not found/i.test(rawMsg)) {
    return {
      category: 'not_found',
      statusCode: 404,
      code: 'NOT_FOUND',
      safeMessage: rawMsg && rawMsg.length < 80 && !rawMsg.includes('/') && !rawMsg.includes('Error:')
        ? rawMsg
        : 'The requested resource was not found.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 10. FILE & INPUT VALIDATION (HTTP 400)
  const isValidationPattern =
    /prohibited|unsupported file|unsupported audio|unsupported format|invalid file|invalid format|invalid mime|mime type.*invalid|signature mismatch|does not match.*signature|match.*signature|disguised executable|path traversal|characters in.*filename|empty \(0 bytes\)|empty file|file format is invalid|file validation failed/i.test(
      rawMsg
    );

  if (status === 400 || Boolean(err?.isClientError) || isValidationPattern) {
    // Sanitize message to make sure no internal paths or tokens leaked
    let safeValMsg = redactSensitiveData(rawMsg);
    // If it's a file validation message without server paths, keep it clear
    if (isValidationPattern && !safeValMsg.includes('/app/') && !safeValMsg.includes('/var/') && !safeValMsg.includes('\\')) {
      return {
        category: 'validation',
        statusCode: 400,
        code: 'INVALID_FILE',
        safeMessage: safeValMsg,
        originalMessage: rawMsg,
        stack,
      };
    }

    if (safeValMsg.includes('/') || safeValMsg.includes('\\') || safeValMsg.length > 150) {
      safeValMsg = 'Invalid request parameters. Please check your inputs.';
    }
    return {
      category: 'validation',
      statusCode: 400,
      code: 'INVALID_REQUEST',
      safeMessage: safeValMsg || 'Invalid request parameters.',
      originalMessage: rawMsg,
      stack,
    };
  }

  // 11. GENERAL SERVER ERROR (HTTP 500)
  return {
    category: 'server_error',
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    safeMessage: 'Something went wrong. Please try again.',
    originalMessage: rawMsg,
    stack,
  };
}

/**
 * Builds the HTTP response body for an error.
 * Requirement 2: Internal stack traces must NEVER be returned in production.
 * Requirement 10: Keep development debugging available only in development.
 */
export function formatErrorResponseBody(classified: ClassifiedError, isDevelopment = process.env.NODE_ENV !== 'production') {
  const response: Record<string, any> = {
    error: classified.safeMessage,
    code: classified.code,
    status: classified.statusCode,
  };

  // Development debugging info ONLY in non-production environments
  // In production, internal stack traces and debug details must NEVER be returned.
  if (isDevelopment && process.env.NODE_ENV !== 'production') {
    response.debug = {
      category: classified.category,
      message: redactSensitiveData(classified.originalMessage),
      stack: classified.stack ? redactSensitiveData(classified.stack) : undefined,
    };
  }

  return response;
}

/**
 * Helper to safely send an error response from an endpoint catch block.
 * Logs full sanitized error server-side and returns a safe response to client.
 */
export function sendSafeError(
  res: Response,
  err: any,
  overrideStatus?: number,
  fallbackSafeMessage?: string
) {
  if (res.headersSent) {
    safeLogger.warn('Attempted to send safe error after headers were already sent.');
    return;
  }

  const classified = classifyError(err);
  if (overrideStatus) {
    classified.statusCode = overrideStatus;
  }
  if (fallbackSafeMessage && classified.category === 'server_error') {
    classified.safeMessage = fallbackSafeMessage;
  }

  safeLogger.error(`[API Error] ${classified.code} (${classified.statusCode}):`, {
    category: classified.category,
    originalMessage: classified.originalMessage,
    stack: classified.stack,
  });

  const responseBody = formatErrorResponseBody(classified);
  return res.status(classified.statusCode).json(responseBody);
}

/**
 * Central Express Error Handling Middleware.
 * Registered as the final middleware in Express to catch all unhandled exceptions,
 * Multer errors, body-parser errors, and next(err) invocations.
 */
export function productionErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!err) return next();

  if (res.headersSent) {
    return next(err);
  }

  const classified = classifyError(err);

  safeLogger.error(`[Unhandled Route Error] ${req.method} ${req.originalUrl || req.path}:`, {
    code: classified.code,
    category: classified.category,
    statusCode: classified.statusCode,
    message: classified.originalMessage,
    stack: classified.stack,
  });

  const responseBody = formatErrorResponseBody(classified);
  return res.status(classified.statusCode).json(responseBody);
}
