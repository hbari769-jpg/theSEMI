import { Request, Response, NextFunction } from 'express';

/**
 * AESTIFIC PRODUCTION HTTP SECURITY CONFIGURATION
 *
 * Enforces:
 * - Strict HTTPS enforcement and HSTS
 * - Enterprise security headers (MIME sniffing, clickjacking, XSS, COOP, Permissions-Policy)
 * - Sensible, frontend-compatible Content Security Policy (CSP)
 * - Explicit CORS allowlist with credential protection (no wildcard origins with credentials)
 * - Origin validation against CSRF on state-changing API requests
 * - Information disclosure prevention (removes X-Powered-By, etc.)
 */

// Default explicitly trusted origins
export const DEFAULT_DEV_ALLOWED_ORIGINS: string[] = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://ai.studio',
];

export const DEFAULT_PROD_ALLOWED_ORIGINS: string[] = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://ai.studio',
];

export const DEFAULT_ALLOWED_ORIGINS = DEFAULT_DEV_ALLOWED_ORIGINS;

// Regex patterns for dynamically trusted environments (e.g. Google Cloud Run previews, Google AI Studio)
export const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  // Google Cloud Run services (*.run.app)
  /^https:\/\/[a-z0-9-]+(-[a-z0-9]+)?\.[a-z0-9-]+\.run\.app$/,
  // Google AI Studio domains (*.google.com)
  /^https:\/\/[a-z0-9-]+\.google\.com$/,
];

/**
 * Retrieves the complete list of explicit allowed origins, combining defaults with
 * environment-configured variables (ALLOWED_ORIGINS, APP_URL, FRONTEND_URL, PUBLIC_URL, PRODUCTION_URL, DOMAIN).
 */
export function getExplicitAllowedOrigins(): string[] {
  const isProd = process.env.NODE_ENV === 'production';
  const origins = new Set<string>(isProd ? DEFAULT_PROD_ALLOWED_ORIGINS : DEFAULT_DEV_ALLOWED_ORIGINS);

  const envVars = [
    process.env.ALLOWED_ORIGINS,
    process.env.APP_URL,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_URL,
    process.env.PRODUCTION_URL,
    process.env.DOMAIN,
  ];

  for (const envVal of envVars) {
    if (!envVal) continue;
    const parts = envVal.split(',').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      try {
        if (part.startsWith('http://') || part.startsWith('https://')) {
          origins.add(new URL(part).origin.toLowerCase());
        } else {
          origins.add(`https://${part.toLowerCase()}`);
        }
      } catch {
        // Ignore invalid URL
      }
    }
  }

  return Array.from(origins);
}

/**
 * Validates whether an incoming Origin string is authorized according to:
 * 1. Explicit allowlist
 * 2. Trusted domain patterns (e.g., *.run.app, *.google.com)
 * 3. Same-host comparison against the incoming Host header
 */
export function isOriginAllowed(origin: string | undefined, reqHost?: string): boolean {
  if (!origin) return false;

  const normalized = origin.trim().toLowerCase();

  // 1. Check explicit list
  const allowedList = getExplicitAllowedOrigins();
  if (allowedList.includes(normalized)) {
    return true;
  }

  // 2. Check regex patterns
  for (const pattern of ALLOWED_ORIGIN_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  // 3. Check against request Host header (same-host origin validation)
  if (reqHost) {
    const cleanHost = reqHost.trim().toLowerCase();
    if (normalized === `http://${cleanHost}` || normalized === `https://${cleanHost}`) {
      return true;
    }
  }

  return false;
}

/**
 * Generates the Content-Security-Policy directive string.
 * Tailored strictly to the Aestific frontend requirements:
 * - Google Fonts (fonts.googleapis.com, fonts.gstatic.com)
 * - Multimodal assets, blobs (audio recording, preview, downloads)
 * - Safe Vite development and module support
 * - Framing restricted strictly to Google AI Studio and Cloud Run
 */
export function getCspDirectives(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data:",
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com ws: wss:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self' https://ai.studio https://*.google.com https://*.run.app",
  ];

  return directives.join('; ');
}

/**
 * HTTPS Enforcement Middleware
 * Redirects HTTP traffic to HTTPS in production environments when behind a reverse proxy.
 * Safely preserves local loopback connections, container health checks, and test harnesses.
 */
export function httpsEnforcementMiddleware(req: Request, res: Response, next: NextFunction) {
  const isProduction = process.env.NODE_ENV === 'production';
  const proto = (req.headers['x-forwarded-proto'] || '').toString().toLowerCase();
  const host = (req.headers.host || '').toLowerCase();
  const isLocalhost =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('::1') ||
    host.includes('127.0.0.1:') ||
    host.includes('localhost:');

  // Skip redirect for internal health checks, local testing, and dev environments
  if (req.path === '/api/health' || isLocalhost || !isProduction) {
    return next();
  }

  // Redirect plain HTTP requests to HTTPS in production
  if (proto === 'http') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const secureUrl = `https://${req.headers.host}${req.originalUrl || req.url}`;
      return res.redirect(308, secureUrl);
    } else {
      return res.status(403).json({
        error: 'HTTPS is required in production.',
        code: 'HTTPS_REQUIRED',
      });
    }
  }

  next();
}

/**
 * Enterprise HTTP Security Headers Middleware
 * Protects against MIME sniffing, clickjacking, cross-site leaks, and unauthorized framing.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  const isProduction = process.env.NODE_ENV === 'production';
  const proto = (req.headers['x-forwarded-proto'] || '').toString().toLowerCase();
  const isHttps = isProduction || req.secure || proto === 'https';

  // 1. MIME Sniffing Protection (Requirement 3)
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 2. Clickjacking / Framing Protection
  // Modern browsers defer to CSP frame-ancestors below; legacy tools verify X-Frame-Options.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // 3. Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 4. Modern XSS Protection Header
  res.setHeader('X-XSS-Protection', '0');

  // 5. Cross-Origin Opener Policy (Isolates browsing context)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // 6. Permissions Policy (Delegates microphone for voice notes, restricts unused sensitive APIs)
  res.setHeader(
    'Permissions-Policy',
    'microphone=(self), camera=(), geolocation=(), payment=(), usb=()'
  );

  // 7. Strict-Transport-Security (HSTS in production / HTTPS)
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 8. Sensible, non-breaking Content Security Policy (Requirement 4)
  res.setHeader('Content-Security-Policy', getCspDirectives(!isProduction));

  next();
}

/**
 * Hardened CORS & Origin Validation Middleware
 * Enforces explicit allowlists, prevents wildcard credentials, and blocks unauthorized cross-origin requests.
 */
export function corsSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const reqHost = req.headers.host;

  // Always vary by Origin so caches do not serve cross-origin responses to wrong clients
  res.setHeader('Vary', 'Origin');

  if (origin) {
    if (isOriginAllowed(origin, reqHost)) {
      // REQUIREMENT 5 & 6: Set explicit origin, NEVER wildcard '*' with credentials
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, Origin, Range, Cache-Control'
      );
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Length, Content-Range, Content-Type, ETag'
      );
      res.setHeader('Access-Control-Max-Age', '86400'); // 24-hour preflight cache

      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
    } else {
      // Unauthorized origin: DO NOT set Access-Control-Allow-Origin
      if (req.method === 'OPTIONS') {
        // Explicitly deny unauthorized preflight requests
        return res.status(403).json({
          error: 'CORS origin not allowed',
          code: 'CORS_ORIGIN_DENIED',
        });
      }

      // Origin validation: Block state-changing API requests from unauthorized origins (CSRF defense)
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/api/')) {
        return res.status(403).json({
          error: 'Cross-origin request blocked: origin not permitted.',
          code: 'CSRF_ORIGIN_BLOCKED',
        });
      }
    }
  } else if (req.method === 'OPTIONS') {
    // OPTIONS request without origin header (e.g. server probe)
    res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    return res.status(204).end();
  }

  next();
}

/**
 * Configures the complete suite of HTTP security middleware on the Express application.
 */
export function configureHttpSecurity(app: { disable: (setting: string) => void; use: (...handlers: any[]) => void }) {
  // REQUIREMENT 9: Do not expose unnecessary server information
  app.disable('x-powered-by');

  // 1. HTTPS enforcement (runs first)
  app.use(httpsEnforcementMiddleware);

  // 2. Enterprise security headers (MIME sniffing, framing, CSP, HSTS)
  app.use(securityHeadersMiddleware);

  // 3. CORS & origin validation
  app.use(corsSecurityMiddleware);
}
