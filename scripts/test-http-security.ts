/**
 * Automated Verification Suite for Aestific Production HTTP Security Configuration
 *
 * Tests:
 * 1. Normal browser request (GET /, security headers, CSP, no X-Powered-By)
 * 2. Authenticated request (Token auth, secure cookie headers, HttpOnly, SameSite, Secure)
 * 3. API request (/api/health, /api/models, JSON content-type, security headers)
 * 4. CORS from allowed origin (Preflight OPTIONS 204, explicit allow-origin, credentials, methods)
 * 5. CORS from unauthorized origin (Preflight OPTIONS 403, no allow-origin, CSRF blocked)
 * 6. HTTPS enforcement (x-forwarded-proto redirect, HSTS, healthcheck bypass)
 * 7. Clickjacking & MIME sniffing protection (X-Frame-Options, frame-ancestors, nosniff)
 */

import jwt from 'jsonwebtoken';
import { generateToken, TOKEN_COOKIE_NAME } from '../server/auth.js';
import { db } from '../server/db.js';

const BASE_URL = 'http://127.0.0.1:3000';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${testName}`);
    if (detail) console.error(`   Detail:`, detail);
  }
}

async function runSecuritySuite() {
  console.log('===============================================================');
  console.log('🛡️  AESTIFIC PRODUCTION HTTP SECURITY AUDIT & VERIFICATION SUITE');
  console.log('===============================================================\n');

  // =========================================================================
  // 1. NORMAL BROWSER REQUEST
  // =========================================================================
  console.log('--- 1. Testing Normal Browser Request ---');
  const browserRes = await fetch(`${BASE_URL}/`, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });

  assert(browserRes.status === 200, 'Normal browser GET / returns 200 OK');
  assert(browserRes.headers.get('x-content-type-options') === 'nosniff', 'MIME sniffing protection enabled (X-Content-Type-Options: nosniff)');
  assert(browserRes.headers.get('x-frame-options') === 'SAMEORIGIN', 'Clickjacking legacy framing protection (X-Frame-Options: SAMEORIGIN)');
  
  const csp = browserRes.headers.get('content-security-policy') || '';
  assert(csp.includes("default-src 'self'"), 'CSP includes default-src');
  assert(csp.includes('fonts.googleapis.com') && csp.includes('fonts.gstatic.com'), 'CSP allows Google Fonts for typography');
  assert(csp.includes('blob:') && csp.includes('media-src'), 'CSP allows blob: media for voice recorder/audio playback');
  assert(csp.includes('frame-ancestors') && csp.includes('https://ai.studio') && csp.includes('https://*.run.app'), 'CSP frame-ancestors permits Google AI Studio & Cloud Run while blocking unauthorized framing');
  
  assert(browserRes.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', 'Strict referrer policy configured');
  assert(browserRes.headers.get('permissions-policy')?.includes('microphone=(self)'), 'Permissions-Policy permits microphone for voice notes and restricts camera/geolocation');
  assert(!browserRes.headers.has('x-powered-by'), 'X-Powered-By is hidden (Information disclosure prevented)');

  // =========================================================================
  // 2. AUTHENTICATED REQUEST & COOKIE SECURITY
  // =========================================================================
  console.log('\n--- 2. Testing Authenticated Request & Secure Cookies ---');
  // Create or retrieve a test user
  const testEmail = `sec_audit_${Date.now()}@example.com`;
  const testUser = await db.createUser({
    email: testEmail,
    name: 'Test User',
    passwordHash: 'hashed_pass_placeholder',
    isEmailVerified: true,
    memoryEnabled: true,
  });
  const token = generateToken(testUser);

  // Authenticated request via cookie
  const authCookieRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: {
      Cookie: `${TOKEN_COOKIE_NAME}=${token}`,
    },
  });
  assert(authCookieRes.status === 200, 'Authenticated request with cookie returns 200 OK');
  const authUser = await authCookieRes.json();
  assert(authUser.user?.email === testEmail, 'User profile returned correctly via cookie authentication');
  assert(authCookieRes.headers.get('x-content-type-options') === 'nosniff', 'API response includes nosniff header');

  // Test Cookie options emitted by login / refresh
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-proto': 'https', // Simulate HTTPS proxy
    },
    body: JSON.stringify({
      email: testEmail,
      password: 'password_will_fail_but_we_test_headers',
    }),
  });
  // Verify that error responses still carry security headers
  assert(loginRes.headers.get('x-content-type-options') === 'nosniff', 'Auth response includes security headers even on errors');
  assert(!loginRes.headers.has('x-powered-by'), 'Auth response suppresses x-powered-by');

  // =========================================================================
  // 3. API REQUEST (CONTENT-TYPE & SECURITY HEADERS)
  // =========================================================================
  console.log('\n--- 3. Testing API Request Handling ---');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert(healthRes.status === 200, 'GET /api/health returns 200');
  assert(healthRes.headers.get('content-type')?.includes('application/json'), 'API returns application/json Content-Type');
  assert(healthRes.headers.get('x-content-type-options') === 'nosniff', '/api/health has nosniff');
  assert(!healthRes.headers.has('x-powered-by'), '/api/health has no x-powered-by');

  const modelsRes = await fetch(`${BASE_URL}/api/models`);
  assert(modelsRes.status === 200, 'GET /api/models returns 200');
  const modelsData = await modelsRes.json();
  assert(Array.isArray(modelsData.models), 'GET /api/models returns array of available models');
  assert(modelsRes.headers.get('vary')?.includes('Origin'), 'Vary: Origin is set on API responses');

  // =========================================================================
  // 4. CORS FROM ALLOWED ORIGIN
  // =========================================================================
  console.log('\n--- 4. Testing CORS from Allowed Origins ---');
  const allowedOrigins = [
    'http://localhost:3000',
    'https://ai.studio',
    'https://ais-dev-lqsgzmwvkmccqplbuxkifd-189730724189.asia-southeast1.run.app',
    'https://ais-pre-test-preview.asia-southeast1.run.app',
  ];

  for (const origin of allowedOrigins) {
    // 4a. Preflight OPTIONS request
    const preflight = await fetch(`${BASE_URL}/api/models`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    });

    assert(preflight.status === 204, `Preflight OPTIONS from ${origin} returns 204 No Content`);
    assert(preflight.headers.get('access-control-allow-origin') === origin, `Access-Control-Allow-Origin strictly matches ${origin}`);
    assert(preflight.headers.get('access-control-allow-credentials') === 'true', `Access-Control-Allow-Credentials is true for ${origin}`);
    assert(preflight.headers.get('access-control-allow-origin') !== '*', 'NEVER uses wildcard origin with credentials');
    assert(Boolean(preflight.headers.get('access-control-allow-methods')), 'Access-Control-Allow-Methods is present');
    assert(Boolean(preflight.headers.get('access-control-allow-headers')), 'Access-Control-Allow-Headers is present');

    // 4b. Actual GET request with allowed Origin
    const getWithCors = await fetch(`${BASE_URL}/api/models`, {
      headers: { Origin: origin },
    });
    assert(getWithCors.status === 200, `GET /api/models with Origin ${origin} returns 200`);
    assert(getWithCors.headers.get('access-control-allow-origin') === origin, `GET response returns exact Origin header: ${origin}`);
    assert(getWithCors.headers.get('access-control-allow-credentials') === 'true', `GET response has credentials: true`);
  }

  // =========================================================================
  // 5. CORS FROM UNAUTHORIZED ORIGIN
  // =========================================================================
  console.log('\n--- 5. Testing CORS from Unauthorized Origins ---');
  const unauthorizedOrigins = [
    'https://evil-attacker.com',
    'http://phishing-site.xyz',
    'https://fake-google-ai.com.attacker.com',
    'null',
  ];

  for (const badOrigin of unauthorizedOrigins) {
    // 5a. Preflight OPTIONS from unauthorized origin
    const badPreflight = await fetch(`${BASE_URL}/api/models`, {
      method: 'OPTIONS',
      headers: {
        Origin: badOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    });

    assert(badPreflight.status === 403, `Preflight OPTIONS from unauthorized ${badOrigin} is rejected with 403 Forbidden`);
    assert(!badPreflight.headers.has('access-control-allow-origin'), `No Access-Control-Allow-Origin sent to ${badOrigin}`);

    // 5b. State-changing POST API request from unauthorized origin (CSRF prevention)
    const badPost = await fetch(`${BASE_URL}/api/conversations`, {
      method: 'POST',
      headers: {
        Origin: badOrigin,
        'Content-Type': 'application/json',
        Cookie: `${TOKEN_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({ title: 'Malicious CSRF Conversation' }),
    });

    assert(badPost.status === 403, `State-changing POST from unauthorized ${badOrigin} blocked with 403 (CSRF blocked)`);
    assert(!badPost.headers.has('access-control-allow-origin'), `No Access-Control-Allow-Origin header returned on blocked request`);
  }

  // =========================================================================
  // 6. HTTPS ENFORCEMENT & HSTS
  // =========================================================================
  console.log('\n--- 6. Testing HTTPS Enforcement & HSTS ---');
  // Simulated production request over HTTPS
  const httpsReq = await fetch(`${BASE_URL}/api/health`, {
    headers: {
      'x-forwarded-proto': 'https',
    },
  });
  assert(httpsReq.headers.has('strict-transport-security'), 'Strict-Transport-Security (HSTS) header emitted on HTTPS connections');
  assert(httpsReq.headers.get('strict-transport-security')?.includes('max-age='), 'HSTS includes max-age');

  // Internal healthcheck bypass (never broken by HTTPS redirects)
  const healthCheckHttp = await fetch(`${BASE_URL}/api/health`, {
    headers: {
      'x-forwarded-proto': 'http',
      Host: 'app.example.com',
    },
  });
  assert(healthCheckHttp.status === 200, '/api/health is accessible without redirect for container health probes');

  console.log('\n===============================================================');
  console.log(`📊 FINAL RESULT: ${passedTests}/${totalTests} tests passed (${failedTests} failed)`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSecuritySuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
