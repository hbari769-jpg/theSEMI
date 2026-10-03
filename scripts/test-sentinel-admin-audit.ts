import jwt from 'jsonwebtoken';
import { db } from '../server/db.js';
import {
  getJwtSecret,
  generateToken,
  generateAdminToken,
  revokeAdminSession,
  startVerificationSession,
  advanceVerificationSession,
} from '../server/auth.js';

const BASE_URL = 'http://127.0.0.1:3000';
const RUN_IP = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Forwarded-For': RUN_IP,
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, headers: res.headers, body: json };
}

async function runSentinelAdminAudit() {
  console.log('================================================================');
  console.log('🛡️  AESTIFIC SENTINEL & ADMIN PORTAL PRODUCTION SECURITY AUDIT');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string, details?: any) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`, details ? JSON.stringify(details, null, 2) : '');
    }
  }

  // Set up Admin & Normal Users
  const adminEmail = (process.env.ADMIN_EMAILS || 'atifwasee1048@gmail.com').split(',')[0].trim();

  // Create or retrieve candidate admin user
  let adminUser = await db.findUserByEmail(adminEmail);
  if (!adminUser) {
    adminUser = await db.createUser({
      name: 'Audit Administrator',
      email: adminEmail,
      passwordHash: 'audit_pwd_hash',
      memoryEnabled: true,
      isEmailVerified: true,
    });
  }

  const normalEmail = `normal-user-${Date.now()}@aestific.local`;
  const normalUser = await db.createUser({
    name: 'Normal User',
    email: normalEmail,
    passwordHash: 'user_pwd_hash',
    memoryEnabled: true,
    isEmailVerified: true,
  });

  const normalToken = generateToken(normalUser);
  const adminCandidateToken = generateToken(adminUser);

  // 1. ALL ADMIN ENDPOINTS REJECT UNAUTHENTICATED REQUESTS (401)
  console.log('\n--- 1. Testing Unauthenticated Access to All Admin Endpoints ---');
  const adminEndpoints = [
    { method: 'GET', path: '/api/admin/overview' },
    { method: 'GET', path: '/api/admin/telemetry' },
    { method: 'GET', path: '/api/admin/dashboard' },
    { method: 'GET', path: '/api/admin/settings' },
    { method: 'GET', path: '/api/admin/logs' },
    { method: 'GET', path: '/api/admin/passcodes' },
    { method: 'GET', path: '/api/admin/banned-admins' },
    { method: 'GET', path: '/api/admin/support' },
    { method: 'GET', path: '/api/admin/ai-monitoring' },
    { method: 'POST', path: '/api/admin/ban-admin', body: { targetAdminName: 'test' } },
    { method: 'POST', path: '/api/admin/unban-admin', body: { targetAdminName: 'test' } },
    { method: 'PATCH', path: `/api/admin/users/${normalUser.id}/ban`, body: { isBanned: true } },
    { method: 'PATCH', path: `/api/admin/users/${normalUser.id}/status`, body: { isEmailVerified: true } },
    { method: 'DELETE', path: `/api/admin/users/${normalUser.id}` },
    { method: 'POST', path: '/api/admin/send-email', body: { toEmail: 't@a.com', subject: 's', textContent: 'c' } },
    { method: 'POST', path: '/api/admin/retention-cleanup', body: { retentionDays: 30 } },
    { method: 'POST', path: '/api/admin/trigger-cleanup', body: { retentionDays: 30 } },
    { method: 'POST', path: '/api/admin/cleanup-cloud-history' },
    { method: 'POST', path: '/api/admin/ai-monitoring/clear' },
    { method: 'GET', path: '/api/admin/check-access' },
    { method: 'GET', path: '/api/admin/gateway-hints' },
    { method: 'POST', path: '/api/admin/verify-step', body: { step: 1, code: 'dummy' } },
  ];

  for (const ep of adminEndpoints) {
    const res = await request(ep.path, {
      method: ep.method,
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    });
    assert(
      res.status === 401,
      `Unauthenticated ${ep.method} ${ep.path} rejected with 401 Unauthorized (got ${res.status})`
    );
  }

  // 2. ALL ADMIN ENDPOINTS REJECT NORMAL AUTHENTICATED USER (403)
  console.log('\n--- 2. Testing Normal Authenticated User Access to All Admin Endpoints ---');
  for (const ep of adminEndpoints) {
    const res = await request(ep.path, {
      method: ep.method,
      headers: { Authorization: `Bearer ${normalToken}` },
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    });
    assert(
      res.status === 403,
      `Normal user ${ep.method} ${ep.path} rejected with 403 Forbidden (got ${res.status})`
    );
  }

  // 3. ADMIN CANDIDATE CANNOT ACCESS PRIVILEGED APIS BEFORE 5-STEP VERIFICATION
  console.log('\n--- 3. Testing Admin Candidate Blocked from Privileged APIs ---');
  const candidateCheckAccess = await request('/api/admin/check-access', {
    headers: { Authorization: `Bearer ${adminCandidateToken}` },
  });
  assert(
    candidateCheckAccess.status === 200 && candidateCheckAccess.body?.authorized === true,
    'Admin candidate can query /api/admin/check-access for discreet entry'
  );

  const candidateGatewayHints = await request('/api/admin/gateway-hints', {
    headers: { Authorization: `Bearer ${adminCandidateToken}` },
  });
  assert(
    candidateGatewayHints.status === 200 && candidateGatewayHints.body?.steps?.length === 5,
    'Admin candidate can query /api/admin/gateway-hints'
  );

  const candidateOverview = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${adminCandidateToken}` },
  });
  assert(
    candidateOverview.status === 403,
    'Admin candidate WITHOUT elevated session cannot access /api/admin/overview (HTTP 403)'
  );

  // 4. FORGED ADMIN IDENTITY REJECTION
  console.log('\n--- 4. Testing Forged Admin Identity & Role Tampering ---');
  const secret = getJwtSecret();

  // Attack 4a: Normal user crafts token with role: 'admin' and isAdmin: true
  const forgedToken = jwt.sign(
    {
      id: normalUser.id,
      email: normalUser.email,
      name: 'Hacker',
      role: 'admin',
      isAdmin: true,
    },
    secret
  );
  const forgedOverview = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${forgedToken}` },
  });
  assert(
    forgedOverview.status === 403,
    'Forged role/isAdmin token for unauthorized email rejected with 403 Forbidden'
  );

  // Attack 4b: Normal user provides query string or body role spoofing
  const querySpoofRes = await request(`/api/admin/overview?role=admin&isAdmin=true&email=${encodeURIComponent(adminEmail)}`, {
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  assert(
    querySpoofRes.status === 403,
    'Client-provided query string role or email spoofing rejected with 403 Forbidden'
  );

  const bodySpoofRes = await request('/api/admin/retention-cleanup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${normalToken}` },
    body: JSON.stringify({ role: 'admin', isAdmin: true, email: adminEmail }),
  });
  assert(
    bodySpoofRes.status === 403,
    'Client-provided body role or email spoofing rejected with 403 Forbidden'
  );

  // 5. SENTINEL VERIFICATION: INCORRECT SECRETS, SKIPPED STEPS, OUT-OF-ORDER
  console.log('\n--- 5. Testing Sentinel Verification Hardening ---');
  const auditIp = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;

  // 5a. Incorrect secret on Step 1
  const badSecretRes = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}`, 'X-Forwarded-For': auditIp },
    body: JSON.stringify({ step: 1, code: 'WRONG_SECRET' }),
  });
  assert(
    badSecretRes.status === 400 && badSecretRes.body?.error === 'Invalid verification credentials.',
    'Incorrect secret on Step 1 returns generic error "Invalid verification credentials."'
  );

  // 5b. Skipped step: trying Step 3 without Step 1 or 2
  const skippedStepRes = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}`, 'X-Forwarded-For': auditIp },
    body: JSON.stringify({ step: 3, code: process.env.ADMIN_STEP_3 }),
  });
  assert(
    skippedStepRes.status === 400 && skippedStepRes.body?.expired === true,
    'Skipping steps without active sequence is rejected with 400 (expired: true)'
  );

  // 5c. Out of sequence: Start step 1, then attempt step 4
  const step1 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}`, 'X-Forwarded-For': auditIp },
    body: JSON.stringify({ step: 1, code: process.env.ADMIN_STEP_1 }),
  });
  assert(step1.status === 200 && step1.body?.nextStep === 2, 'Step 1 verification succeeds');

  const outOfOrderRes = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}`, 'X-Forwarded-For': auditIp },
    body: JSON.stringify({ step: 4, code: process.env.ADMIN_STEP_4 }),
  });
  assert(
    outOfOrderRes.status === 400 && outOfOrderRes.body?.error?.includes('Invalid verification sequence'),
    'Out-of-order step (1 -> 4) rejected with error "Invalid verification sequence"'
  );

  // 6. SENTINEL VERIFICATION: SUCCESSFUL 5-STEP SEQUENCE & ELEVATED TOKEN
  console.log('\n--- 6. Testing Complete 5-Step Sequence & Replay Defense ---');
  // Advance through 2, 3, 4, 5
  const step2 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}`, 'X-Forwarded-For': auditIp },
    body: JSON.stringify({ step: 2, code: process.env.ADMIN_STEP_2 }),
  });
  assert(step2.status === 200 && step2.body?.nextStep === 3, 'Step 2 verification succeeds');

  const step3 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}`, 'X-Forwarded-For': auditIp },
    body: JSON.stringify({ step: 3, code: process.env.ADMIN_STEP_3 }),
  });
  assert(step3.status === 200 && step3.body?.nextStep === 4, 'Step 3 verification succeeds');

  const step4 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}`, 'X-Forwarded-For': auditIp },
    body: JSON.stringify({ step: 4, code: process.env.ADMIN_STEP_4 }),
  });
  assert(step4.status === 200 && step4.body?.nextStep === 5, 'Step 4 verification succeeds');

  const step5 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}`, 'X-Forwarded-For': auditIp },
    body: JSON.stringify({ step: 5, adminName: 'ChiefSentinel' }),
  });
  assert(
    step5.status === 200 && step5.body?.authorized === true && Boolean(step5.body?.token),
    'Step 5 grants elevated clearance with valid JWT token'
  );

  const elevatedAdminToken = step5.body?.token;

  // 6b. Replay attack: Immediate reuse of Step 5 must fail
  const replayRes = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}`, 'X-Forwarded-For': auditIp },
    body: JSON.stringify({ step: 5, adminName: 'ChiefSentinel' }),
  });
  assert(
    replayRes.status === 400 && replayRes.body?.expired === true,
    'Replay of completed Step 5 rejected with 400 expired: true'
  );

  // 7. VERIFY PRIVILEGED ENDPOINTS WITH ELEVATED TOKEN
  console.log('\n--- 7. Testing Privileged Endpoints with Elevated Admin Token ---');
  const overviewRes = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
  });
  assert(
    overviewRes.status === 200 && Boolean(overviewRes.body?.system),
    '/api/admin/overview succeeds for elevated admin'
  );

  const telemetryRes = await request('/api/admin/telemetry', {
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
  });
  assert(
    telemetryRes.status === 200 && Boolean(telemetryRes.body?.system),
    '/api/admin/telemetry alias succeeds for elevated admin'
  );

  const dashboardRes = await request('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
  });
  assert(
    dashboardRes.status === 200 && Boolean(dashboardRes.body?.system),
    '/api/admin/dashboard alias succeeds for elevated admin'
  );

  const settingsRes = await request('/api/admin/settings', {
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
  });
  assert(
    settingsRes.status === 200 && Boolean(settingsRes.body?.settings),
    '/api/admin/settings succeeds for elevated admin'
  );

  const passcodesRes = await request('/api/admin/passcodes', {
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
  });
  assert(
    passcodesRes.status === 200 && Array.isArray(passcodesRes.body?.stepsStatus),
    '/api/admin/passcodes returns configuration status'
  );

  const logsRes = await request('/api/admin/logs', {
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
  });
  assert(
    logsRes.status === 200 && Array.isArray(logsRes.body?.logs),
    '/api/admin/logs returns audit logs'
  );

  // 8. BANNED ADMIN REJECTION
  console.log('\n--- 8. Testing Banned Admin Rejection & Self-Ban Protection ---');
  // 8a. Self-ban protection: Admin cannot ban their own name
  const selfBanRes = await request('/api/admin/ban-admin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
    body: JSON.stringify({ targetAdminName: 'ChiefSentinel' }),
  });
  assert(
    selfBanRes.status === 400 && selfBanRes.body?.error?.includes('Cannot ban your own active admin identity'),
    'Admin prevented from banning their own active identity'
  );

  // 8b. Ban a rogue admin
  const banRes = await request('/api/admin/ban-admin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
    body: JSON.stringify({ targetAdminName: 'RogueAdmin', durationHours: 24 }),
  });
  assert(banRes.status === 200 && banRes.body?.success === true, 'Successfully banned "RogueAdmin"');

  // 8c. Verify banned admin token is rejected
  const rogueElevatedToken = generateAdminToken(adminUser, 'RogueAdmin').token;

  const rogueAccessRes = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${rogueElevatedToken}` },
  });
  assert(
    rogueAccessRes.status === 403 && rogueAccessRes.body?.error === 'ADMIN_BANNED',
    'Banned admin token immediately rejected with 403 ADMIN_BANNED'
  );

  // 9. REVOCATION & LOGOUT
  console.log('\n--- 9. Testing Session Revocation & Logout ---');
  const logoutRes = await request('/api/admin/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
  });
  assert(logoutRes.status === 200 && logoutRes.body?.success === true, 'Admin logout succeeds');

  const postLogoutOverview = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${elevatedAdminToken}` },
  });
  assert(
    postLogoutOverview.status === 401,
    'Revoked elevated admin token is immediately rejected on /api/admin/overview (HTTP 401)'
  );

  // 10. BRUTE-FORCE RATE LIMITING ON VERIFY-STEP
  console.log('\n--- 10. Testing Brute-Force Rate Limiting Lockout ---');
  const bruteForceIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
  const bruteForceToken = generateToken(adminUser);
  let rateLimitHit = false;

  for (let i = 0; i < 7; i++) {
    const res = await request('/api/admin/verify-step', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bruteForceToken}`,
        'X-Forwarded-For': bruteForceIp,
      },
      body: JSON.stringify({ step: 1, code: `wrong_${i}` }),
    });
    if (res.status === 429) {
      rateLimitHit = true;
      break;
    }
  }
  assert(rateLimitHit, 'Rapid repeated verification failures trigger 429 Too Many Requests (Lockout)');

  // Summary
  console.log('\n================================================================');
  console.log(`📊 AUDIT SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================');
  if (passed === total) {
    console.log('🎉 ALL SENTINEL & ADMIN PORTAL SECURITY AUDIT CHECKS PASSED!');
  } else {
    console.error(`⚠️ ${total - passed} tests failed.`);
    process.exit(1);
  }
}

runSentinelAdminAudit().catch((err) => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
