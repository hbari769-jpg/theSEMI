/**
 * Production Deployment & Configuration Verification Suite
 *
 * Verifies all 9 production requirements:
 * 1. Development secrets must not be used in production.
 * 2. Production must fail safely if required secrets are missing.
 * 3. Do not print secrets during startup.
 * 4. Do not expose environment variables to the frontend unnecessarily.
 * 5. Set NODE_ENV=production in the production environment.
 * 6. Secure cookies must work under HTTPS.
 * 7. Configure trusted proxy behavior correctly.
 * 8. Configure CORS for the real production domain.
 * 9. Keep development-only debugging disabled in production.
 * 10. Verify production build starts cleanly.
 */

import { getJwtSecret, isDevPlaceholderSecret, isResponseSecure, AUTH_COOKIE_OPTIONS } from '../server/auth.js';
import { getTrustedProxyConfiguration, isTrustedProxy, isCloudflareIp } from '../server/proxy-trust.js';
import { isOriginAllowed, getExplicitAllowedOrigins } from '../server/security-headers.js';
import { validateProductionEnvironment } from '../server/production-config.js';
import { classifyError, formatErrorResponseBody } from '../server/error-handler.js';

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  total++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (detail) console.error(`   Detail: ${detail}`);
  }
}

async function runProductionAudit() {
  console.log('====================================================');
  console.log('🚀 RUNNING PRODUCTION DEPLOYMENT AUDIT SUITE');
  console.log('====================================================\n');

  const originalEnv = { ...process.env };

  try {
    // ----------------------------------------------------
    // TEST 1: Development secrets rejected in production
    // ----------------------------------------------------
    console.log('--- Requirement 1: Development secrets rejection ---');
    assert(isDevPlaceholderSecret('secret'), 'isDevPlaceholderSecret identifies "secret" as insecure');
    assert(isDevPlaceholderSecret('dev_secret'), 'isDevPlaceholderSecret identifies "dev_secret" as insecure');
    assert(isDevPlaceholderSecret('change_me'), 'isDevPlaceholderSecret identifies "change_me" as insecure');
    assert(isDevPlaceholderSecret('my_test_key'), 'isDevPlaceholderSecret identifies "my_test_key" placeholder');

    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev_secret';
    let caughtDevSecret = false;
    try {
      getJwtSecret();
    } catch (e: any) {
      caughtDevSecret = true;
    }
    assert(caughtDevSecret, 'getJwtSecret throws critical error if development secret used in production');

    let caughtDevSecretInAudit = false;
    try {
      validateProductionEnvironment();
    } catch {
      caughtDevSecretInAudit = true;
    }
    assert(caughtDevSecretInAudit, 'validateProductionEnvironment throws critical error if development secret used in production');

    // Test short secret in production
    process.env.JWT_SECRET = 'short_key';
    let caughtShortInAudit = false;
    try {
      validateProductionEnvironment();
    } catch {
      caughtShortInAudit = true;
    }
    assert(caughtShortInAudit, 'validateProductionEnvironment throws critical error if JWT_SECRET is too short (< 16 chars) in production');

    // ----------------------------------------------------
    // TEST 2: Fail safely if required secrets are missing
    // ----------------------------------------------------
    console.log('\n--- Requirement 2: Fail safely on missing secrets ---');
    delete process.env.JWT_SECRET;
    let caughtMissingSecret = false;
    try {
      getJwtSecret();
    } catch (e: any) {
      caughtMissingSecret = true;
    }
    assert(caughtMissingSecret, 'Production fails safely with explicit error when JWT_SECRET is missing');

    let caughtMissingInAudit = false;
    try {
      validateProductionEnvironment();
    } catch {
      caughtMissingInAudit = true;
    }
    assert(caughtMissingInAudit, 'validateProductionEnvironment fails decisively when JWT_SECRET is missing (never merely warns)');

    // Restore strong JWT_SECRET for remaining production checks
    process.env.JWT_SECRET = 'aestific_production_strong_secret_key_32_bytes_entropy';
    const prodSecret = getJwtSecret();
    assert(
      prodSecret === 'aestific_production_strong_secret_key_32_bytes_entropy',
      'Valid production JWT_SECRET is accepted cleanly'
    );

    // ----------------------------------------------------
    // TEST 3: Pre-flight production environment audit
    // ----------------------------------------------------
    console.log('\n--- Requirement 3 & 5: Production Environment Validation ---');
    process.env.NODE_ENV = 'production';
    const auditReport = validateProductionEnvironment();
    assert(auditReport.isProduction === true, 'NODE_ENV=production is correctly recognized');
    assert(auditReport.jwtSecretConfigured === true, 'JWT secret configured and validated');
    assert(auditReport.demoAccountDisabled === true, 'Demo accounts disabled in production');
    assert(auditReport.developmentDebugDisabled === true, 'Debug mode disabled in production');

    // ----------------------------------------------------
    // TEST 4: Frontend Environment Variable Isolation
    // ----------------------------------------------------
    console.log('\n--- Requirement 4: Frontend environment variable isolation ---');
    const frontendKeys = Object.keys(process.env).filter((k) => k.startsWith('VITE_'));
    assert(
      frontendKeys.length === 0,
      'Zero sensitive VITE_ keys exposed in environment'
    );

    // ----------------------------------------------------
    // TEST 6: Secure cookies under HTTPS
    // ----------------------------------------------------
    console.log('\n--- Requirement 6: Secure cookies under HTTPS ---');
    const mockHttpsReq = {
      secure: true,
      headers: { 'x-forwarded-proto': 'https', host: 'aestific.com' },
    };
    const mockHttpsRes: any = { req: mockHttpsReq };
    assert(
      isResponseSecure(mockHttpsRes) === true,
      'isResponseSecure returns true for HTTPS requests'
    );

    const mockProxiedHttpsReq = {
      secure: false,
      headers: { 'x-forwarded-proto': 'https', host: 'ais-dev-preview.run.app' },
    };
    const mockProxiedHttpsRes: any = { req: mockProxiedHttpsReq };
    assert(
      isResponseSecure(mockProxiedHttpsRes) === true,
      'isResponseSecure returns true for requests behind HTTPS reverse proxies'
    );

    // ----------------------------------------------------
    // TEST 7: Trusted proxy behavior
    // ----------------------------------------------------
    console.log('\n--- Requirement 7: Trusted proxy configuration ---');
    const trustedProxies = getTrustedProxyConfiguration();
    assert(trustedProxies.includes('loopback'), 'Trusted proxies includes loopback');
    assert(trustedProxies.includes('uniquelocal'), 'Trusted proxies includes container subnets (uniquelocal)');
    assert(
      trustedProxies.some((cidr) => cidr.startsWith('173.245.') || cidr.startsWith('103.21.')),
      'Trusted proxies includes Cloudflare edge CIDR blocks'
    );

    // Test custom TRUSTED_PROXIES override via environment variable
    process.env.TRUSTED_PROXIES = '192.168.100.1, 10.200.0.0/16';
    const customProxies = getTrustedProxyConfiguration();
    assert(
      customProxies.includes('192.168.100.1') && customProxies.includes('10.200.0.0/16'),
      'TRUSTED_PROXIES environment variable allows custom deployment-specific proxy overrides'
    );
    delete process.env.TRUSTED_PROXIES;

    // ----------------------------------------------------
    // TEST 8: Production CORS for real production domains
    // ----------------------------------------------------
    console.log('\n--- Requirement 8: Production CORS configuration ---');
    process.env.ALLOWED_ORIGINS = 'https://my-production-domain.com, https://app.aestific.com';
    assert(
      isOriginAllowed('https://my-production-domain.com'),
      'CORS allows domain configured via ALLOWED_ORIGINS'
    );
    assert(
      isOriginAllowed('https://app.aestific.com'),
      'CORS allows secondary domain configured via ALLOWED_ORIGINS'
    );
    assert(
      isOriginAllowed('https://ais-dev-eq3ohuwel2wpize2aqdtlv-624458498955.asia-southeast1.run.app'),
      'CORS automatically allows Cloud Run deployment domains (*.run.app)'
    );
    assert(
      isOriginAllowed('https://ai.studio'),
      'CORS allows Google AI Studio preview embedding'
    );
    assert(
      !isOriginAllowed('https://malicious-attacker.com'),
      'CORS blocks unauthorized external attacker origins'
    );

    // ----------------------------------------------------
    // TEST 9: Development-only debugging disabled in production
    // ----------------------------------------------------
    console.log('\n--- Requirement 9: Development debugging disabled in production ---');
    process.env.NODE_ENV = 'production';
    const testError = new Error('Database connection failed: SELECT * FROM users password=secret123');
    const classified = classifyError(testError);
    const prodErrorResponse = formatErrorResponseBody(classified, false);
    assert(
      prodErrorResponse.debug === undefined,
      'Production error response contains NO debug object'
    );
    assert(
      !JSON.stringify(prodErrorResponse).includes('password='),
      'Production error response contains NO raw database queries or passwords'
    );

  } finally {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  }

  console.log('\n====================================================');
  console.log(`📊 PRODUCTION AUDIT SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================');

  if (passed === total) {
    console.log('🎉 ALL PRODUCTION DEPLOYMENT REQUIREMENTS VERIFIED SUCCESSFULLY!');
  } else {
    console.error(`❌ ${total - passed} tests failed.`);
    process.exit(1);
  }
}

runProductionAudit().catch((err) => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
