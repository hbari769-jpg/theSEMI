import jwt from 'jsonwebtoken';
import { db } from '../server/db.js';
import { getJwtSecret, generateToken, generateAdminToken, revokeAdminSession } from '../server/auth.js';

const BASE_URL = 'http://127.0.0.1:3000';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
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

async function runTests() {
  console.log('=== RUNNING AESTIFIC ADMIN AUTH HARDENING TEST SUITE ===\n');
  let testsPassed = 0;
  let testsTotal = 0;

  function assert(condition: boolean, desc: string, detail?: any) {
    testsTotal++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      testsPassed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`, detail || '');
    }
  }

  // 1. UNAUTHENTICATED USER
  console.log('\n--- 1. Testing Unauthenticated User ---');
  const unauthVerify = await request('/api/admin/verify-step', {
    method: 'POST',
    body: JSON.stringify({ step: 1, code: 'dummy' }),
  });
  assert(unauthVerify.status === 401, 'Unauthenticated access to /api/admin/verify-step is rejected with 401', unauthVerify);

  const unauthOverview = await request('/api/admin/overview');
  assert(unauthOverview.status === 401, 'Unauthenticated access to /api/admin/overview is rejected with 401', unauthOverview);

  // 2. NORMAL USER
  console.log('\n--- 2. Testing Normal User ---');
  const normalUser = {
    id: '28ace9cd-ea72-47c9-8f95-75d6d0354768',
    email: 'audit_test_1787761112379@example.com',
    name: 'Normal User',
    role: 'user',
  };
  const normalToken = generateToken(normalUser as any);

  const normalVerify = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${normalToken}` },
    body: JSON.stringify({ step: 1, code: 'dummy' }),
  });
  assert(normalVerify.status === 403, 'Normal user calling /api/admin/verify-step is rejected with 403 Forbidden', normalVerify);

  const normalOverview = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  assert(normalOverview.status === 403, 'Normal user calling /api/admin/overview is rejected with 403 Forbidden', normalOverview);

  // 3. ADMIN USER - BASE vs ELEVATED
  console.log('\n--- 3. Testing Admin User ---');
  const configuredAdminEmail = (process.env.ADMIN_EMAILS || 'atifwasee1048@gmail.com').split(',')[0].trim();

  // Create fresh candidate user or retrieve existing
  let adminUser = await db.findUserByEmail(configuredAdminEmail);
  if (!adminUser) {
    adminUser = await db.createUser({
      name: 'Admin Test User',
      email: configuredAdminEmail,
      passwordHash: 'dummy_hash',
      memoryEnabled: true,
      isEmailVerified: true,
    });
  }
  // Base normal login token for the admin user
  const adminBaseToken = generateToken(adminUser!);

  // Admin user trying to call /api/admin/overview with ONLY base token (before 5-step verification)
  const adminBypassAttempt = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${adminBaseToken}` },
  });
  assert(adminBypassAttempt.status === 403, 'Admin user without elevated clearance cannot bypass gateway to /api/admin/overview', adminBypassAttempt);

  // 4. INCORRECT VERIFICATION
  console.log('\n--- 4. Testing Incorrect Verification ---');
  const incorrectStep = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminBaseToken}`,
      'X-Forwarded-For': '192.168.1.50',
    },
    body: JSON.stringify({ step: 1, code: 'completely_wrong_secret_12345' }),
  });
  assert(
    incorrectStep.status === 400 && incorrectStep.body?.error === 'Invalid verification credentials.',
    'Incorrect verification code returns generic error "Invalid verification credentials."',
    incorrectStep
  );

  // 5. EXPIRED / OUT-OF-SEQUENCE VERIFICATION
  console.log('\n--- 5. Testing Expired / Out-of-Sequence Verification ---');
  // Attempt step 3 without doing step 1 or 2
  const outOfSequence = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminBaseToken}`,
      'X-Forwarded-For': '192.168.1.60',
    },
    body: JSON.stringify({ step: 3, code: 'some_code' }),
  });
  assert(
    outOfSequence.status === 400 && outOfSequence.body?.expired === true,
    'Out-of-sequence or expired step returns 400 with expired: true',
    outOfSequence
  );

  // 6. EXPIRED ADMIN SESSION
  console.log('\n--- 6. Testing Expired Admin Session ---');
  const secret = getJwtSecret();
  const expiredToken = jwt.sign(
    {
      id: adminUser!.id,
      email: adminUser!.email,
      name: adminUser!.name,
      adminName: 'Admin Wasi',
      isAdmin: true,
      role: 'admin',
      jti: 'test-expired-jti',
      exp: Math.floor(Date.now() / 1000) - 60, // expired 1 minute ago
    },
    secret
  );
  const expiredAttempt = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert(expiredAttempt.status === 401, 'Expired admin session token is rejected with 401 Unauthorized', expiredAttempt);

  // 7. ELEVATED ADMIN ACCESS & LOGOUT
  console.log('\n--- 7. Testing Elevated Admin Access and Logout ---');
  // Generate a valid short-lived elevated admin token
  const elevated = generateAdminToken(adminUser!, 'Admin Wasi');
  assert(elevated.expiresIn === 3600, 'Admin session token has short-lived 1-hour expiration (3600 seconds)');

  // Access /api/admin/overview with elevated admin token
  const adminOverview = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${elevated.token}` },
  });
  assert(adminOverview.status === 200 && adminOverview.body?.system, 'Legitimate elevated admin access succeeds on /api/admin/overview', adminOverview);

  // Verify /api/admin/session status check
  const sessionCheck = await request('/api/admin/session', {
    headers: { Authorization: `Bearer ${elevated.token}` },
  });
  assert(sessionCheck.body?.active === true && sessionCheck.body?.adminName === 'Admin Wasi', '/api/admin/session confirms active elevated session');

  // Perform logout
  const logoutRes = await request('/api/admin/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${elevated.token}` },
  });
  assert(logoutRes.status === 200 && logoutRes.body?.success === true, 'Admin logout succeeds');

  // Verify that the logged-out admin token can no longer access /api/admin/overview
  const postLogoutOverview = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${elevated.token}` },
  });
  assert(postLogoutOverview.status === 401, 'Revoked admin session token is immediately blocked from /api/admin/overview with 401', postLogoutOverview);

  // 8. END-TO-END 5-STEP GATEWAY CLEARANCE & REPLAY ATTACK DEFENSE
  console.log('\n--- 8. Testing End-to-End 5-Step Gateway Clearance & Replay Prevention ---');
  const gatewayIp = '172.16.0.42';

  // Step 1
  const s1 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminBaseToken}`, 'X-Forwarded-For': gatewayIp },
    body: JSON.stringify({ step: 1, code: process.env.ADMIN_STEP_1 }),
  });
  assert(s1.status === 200 && s1.body?.nextStep === 2, 'Gateway Step 1 succeeds with valid secret', s1);

  // Step 2
  const s2 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminBaseToken}`, 'X-Forwarded-For': gatewayIp },
    body: JSON.stringify({ step: 2, code: process.env.ADMIN_STEP_2 }),
  });
  assert(s2.status === 200 && s2.body?.nextStep === 3, 'Gateway Step 2 succeeds with valid secret', s2);

  // Step 3
  const s3 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminBaseToken}`, 'X-Forwarded-For': gatewayIp },
    body: JSON.stringify({ step: 3, code: process.env.ADMIN_STEP_3 }),
  });
  assert(s3.status === 200 && s3.body?.nextStep === 4, 'Gateway Step 3 succeeds with valid secret', s3);

  // Step 4
  const s4 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminBaseToken}`, 'X-Forwarded-For': gatewayIp },
    body: JSON.stringify({ step: 4, code: process.env.ADMIN_STEP_4 }),
  });
  assert(s4.status === 200 && s4.body?.nextStep === 5, 'Gateway Step 4 succeeds with valid secret', s4);

  // Step 5
  const s5 = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminBaseToken}`, 'X-Forwarded-For': gatewayIp },
    body: JSON.stringify({ step: 5, adminName: 'SentinelMaster' }),
  });
  assert(
    s5.status === 200 && s5.body?.authorized === true && Boolean(s5.body?.token),
    'Gateway Step 5 creates elevated admin token with master clearance',
    s5
  );

  // Attempt replay of Step 5 immediately after completion
  const replayAttempt = await request('/api/admin/verify-step', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminBaseToken}`, 'X-Forwarded-For': gatewayIp },
    body: JSON.stringify({ step: 5, adminName: 'SentinelMaster' }),
  });
  assert(
    replayAttempt.status === 400 && replayAttempt.body?.expired === true,
    'Replay attack of completed verification sequence is blocked with expired: true',
    replayAttempt
  );

  // Use the freshly acquired token from Step 5 to access protected overview
  const gatewayAcquiredToken = s5.body?.token;
  const overviewWithGatewayToken = await request('/api/admin/overview', {
    headers: { Authorization: `Bearer ${gatewayAcquiredToken}` },
  });
  assert(
    overviewWithGatewayToken.status === 200 && overviewWithGatewayToken.body?.system,
    'Elevated session acquired via 5-step gateway successfully accesses admin overview',
    overviewWithGatewayToken
  );

  // 9. REPEATED INCORRECT VERIFICATION (Lockout)
  console.log('\n--- 9. Testing Repeated Incorrect Verification (Brute-Force Protection) ---');
  const testIp = `10.200.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const probeToken = generateToken(adminUser);
  let rateLimited = false;
  for (let i = 0; i < 6; i++) {
    const res = await request('/api/admin/verify-step', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${probeToken}`,
        'X-Forwarded-For': testIp,
      },
      body: JSON.stringify({ step: 1, code: `wrong_attempt_${i}` }),
    });
    if (res.status === 429) {
      rateLimited = true;
      break;
    }
  }
  assert(rateLimited, 'Repeated incorrect verification triggers rate limiter lockout (429 Too Many Requests)');

  // Summary
  console.log(`\n=== TEST RESULTS: ${testsPassed} / ${testsTotal} PASSED ===`);
  if (testsPassed === testsTotal) {
    console.log('🎉 ALL 8 ADMIN HARDENING TEST SCENARIOS PASSED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
