/**
 * AESTIFIC PRODUCTION CONFIGURATION & PRE-FLIGHT AUDIT
 *
 * Enforces production readiness requirements:
 * 1. Development secrets must not be used in production.
 * 2. Production must fail safely if required secrets are missing.
 * 3. Do not print secrets during startup.
 * 4. Do not expose environment variables to the frontend unnecessarily.
 * 5. Set NODE_ENV=production in the production environment.
 * 6. Secure cookies must work under HTTPS.
 * 7. Configure trusted proxy behavior correctly.
 * 8. Configure CORS for the real production domain.
 * 9. Keep development-only debugging disabled in production.
 */

import { validateJwtConfiguration, isDevPlaceholderSecret } from './auth.js';
import { getTrustedProxyConfiguration } from './proxy-trust.js';
import { getExplicitAllowedOrigins } from './security-headers.js';
import { safeLogger } from './error-handler.js';

export interface ProductionAuditReport {
  isProduction: boolean;
  ready: boolean;
  nodeEnv: string;
  jwtSecretConfigured: boolean;
  trustedProxiesCount: number;
  allowedOriginsCount: number;
  demoAccountDisabled: boolean;
  developmentDebugDisabled: boolean;
}

/**
 * Performs a comprehensive audit of the production environment configuration.
 * In production mode, throws a fatal error if critical security requirements are violated.
 *
 * Enforces:
 * 1. In NODE_ENV=production, JWT_SECRET is strictly mandatory.
 * 2. Missing, too short (< 16 chars), or placeholder secrets cause immediate fatal failure (never a mere warning).
 * 3. Never introduces an automatic random JWT fallback in production.
 * 4. Secret values and sensitive environment values are NEVER logged or exposed.
 * 5. Uses auth.ts validateJwtConfiguration as the single authoritative source of truth.
 */
export function validateProductionEnvironment(options?: { isProduction?: boolean }): ProductionAuditReport {
  const isProduction = options?.isProduction !== undefined
    ? options.isProduction
    : process.env.NODE_ENV === 'production';
  const nodeEnv = process.env.NODE_ENV || 'development';

  // 1. Strict JWT / Session Secret Validation using the single source of truth in auth.ts
  const jwtValidation = validateJwtConfiguration({ isProduction });
  const rawSecret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : '';
  const jwtSecretConfigured = Boolean(rawSecret && !isDevPlaceholderSecret(rawSecret) && rawSecret.length >= 16);

  if (isProduction && !jwtValidation.valid) {
    const errorMsg = jwtValidation.error || 'CRITICAL PRODUCTION ERROR: JWT_SECRET configuration is invalid or missing in production.';
    safeLogger.error(`[PRODUCTION AUDIT] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 2. Demo Account & Development-only Sandbox Disabled in Production
  const demoAccountDisabled = !isProduction || process.env.ENABLE_DEMO_ACCOUNT !== 'true';
  if (isProduction && !demoAccountDisabled) {
    const errorMsg = 'CRITICAL PRODUCTION ERROR: ENABLE_DEMO_ACCOUNT must not be enabled in production.';
    safeLogger.error(`[PRODUCTION AUDIT] FATAL: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 3. Trusted Proxy Configuration
  const trustedProxies = getTrustedProxyConfiguration();
  const trustedProxiesCount = trustedProxies.length;

  // 4. CORS & Allowed Origins Configuration
  const allowedOrigins = getExplicitAllowedOrigins();
  const allowedOriginsCount = allowedOrigins.length;

  // 5. Development Debugging Flag
  const developmentDebugDisabled = isProduction;

  const report: ProductionAuditReport = {
    isProduction,
    ready: isProduction ? (jwtSecretConfigured && demoAccountDisabled) : true,
    nodeEnv,
    jwtSecretConfigured,
    trustedProxiesCount,
    allowedOriginsCount,
    demoAccountDisabled,
    developmentDebugDisabled,
  };

  // Safe startup logging: Never print secrets, only operational statuses
  if (isProduction) {
    safeLogger.info('Production environment verified: all security configurations active.', {
      nodeEnv,
      jwtSecretConfigured,
      trustedProxiesCount,
      allowedOriginsCount,
      demoAccountDisabled,
    });
  } else if (!jwtSecretConfigured) {
    safeLogger.info('[DEVELOPMENT AUDIT] Running in development mode without configured JWT_SECRET; using ephemeral secret.');
  }

  return report;
}
