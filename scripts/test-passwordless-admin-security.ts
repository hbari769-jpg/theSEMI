import { db } from '../server/db.js';
import {
  generateToken,
  generateAdminToken,
  isAuthorizedAdminEmail,
  isPasswordlessAdminModeActive,
  disablePasswordlessAdminMode,
  enablePasswordlessAdminMode,
} from '../server/auth.js';

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

async function runPasswordlessSecurityTests() {
  console.log('=== RUNNING PASSWORDLESS ADMIN SECURITY VERIFICATION SUITE ===\n');
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

  // Ensure clean initial state
  disablePasswordlessAdminMode();
  const existingStale = await db.findUserByEmail('admin@aestific.local');
  if (existingStale) {
    await db.deleteUser(existingStale.id);
  }

  // Test setup: Identify admin email from environment
  const configuredAdminEmail = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'atifwasee1048@gmail.com')
    .split(',')[0]
    .trim()
    .toLowerCase();

  const normalUserEmail = `normal_user_${Date.now()}@example.com`;
  const attackerEmail = `attacker_${Date.now()}@evil.com`;

  // Create normal user in db
  const normalUser = await db.createUser({
    name: 'Normal User',
    email: normalUserEmail,
    passwordHash: 'dummy_hash_normal',
    memoryEnabled: true,
    isEmailVerified: true,
  });
  const normalToken = generateToken(normalUser);

  // Retrieve or create admin user in db
  let adminUser = await db.findUserByEmail(configuredAdminEmail);
  if (!adminUser) {
    adminUser = await db.createUser({
      name: 'Authorized Administrator',
      email: configuredAdminEmail,
      passwordHash: 'dummy_hash_admin',
      memoryEnabled: true,
      isEmailVerified: true,
    });
  }
  const adminCandidateToken = generateToken(adminUser);

  // --------------------------------------------------------------------------
  // TEST 1: Logged-out User & Invalid Session → Denied (401)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Logged-Out / Unauthenticated / Invalid User ---');
  const loggedOutQuickAccess = await request('/api/admin/quick-access', {
    method: 'POST',
  });
  assert(
    loggedOutQuickAccess.status === 401,
    'SCENARIO 1A: Logged-out user calling POST /api/admin/quick-access is strictly rejected with 401',
    loggedOutQuickAccess
  );

  const loggedOutCheckAccess = await request('/api/admin/check-access');
  assert(
    loggedOutCheckAccess.status === 401,
    'SCENARIO 1B: Logged-out user calling GET /api/admin/check-access is strictly rejected with 401',
    loggedOutCheckAccess
  );

  const loggedOutOverview = await request('/api/admin/ai-monitoring');
  assert(
    loggedOutOverview.status === 401,
    'SCENARIO 1C: Logged-out user calling GET /api/admin/ai-monitoring is strictly rejected with 401',
    loggedOutOverview
  );

  const invalidTokenQuickAccess = await request('/api/admin/quick-access', {
    method: 'POST',
    headers: { Authorization: 'Bearer totally_invalid_malformed_token_999' },
  });
  assert(
    invalidTokenQuickAccess.status === 401,
    'SCENARIO 1D: Invalid session token calling POST /api/admin/quick-access is strictly rejected with 401',
    invalidTokenQuickAccess
  );

  // --------------------------------------------------------------------------
  // TEST 2: Normal Authenticated User → Denied (403)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Normal Non-Admin User ---');
  const normalUserQuickAccess = await request('/api/admin/quick-access', {
    method: 'POST',
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  assert(
    normalUserQuickAccess.status === 403,
    'SCENARIO 2A: Normal non-admin user calling POST /api/admin/quick-access is rejected with 403 Forbidden',
    normalUserQuickAccess
  );

  const normalUserCheckAccess = await request('/api/admin/check-access', {
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  assert(
    normalUserCheckAccess.status === 403,
    'SCENARIO 2B: Normal non-admin user calling GET /api/admin/check-access is rejected with 403 Forbidden',
    normalUserCheckAccess
  );

  const normalUserOverview = await request('/api/admin/ai-monitoring', {
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  assert(
    normalUserOverview.status === 403,
    'SCENARIO 2C: Normal non-admin user calling GET /api/admin/ai-monitoring is rejected with 403 Forbidden',
    normalUserOverview
  );

  // --------------------------------------------------------------------------
  // TEST 3: Authorized Admin Candidate → Allowed
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Authorized Administrator Access ---');
  const adminCheckAccess = await request('/api/admin/check-access', {
    headers: { Authorization: `Bearer ${adminCandidateToken}` },
  });
  assert(
    adminCheckAccess.status === 200 && adminCheckAccess.body?.authorized === true,
    'SCENARIO 3A: Authorized administrator calling GET /api/admin/check-access is granted access (200 OK)',
    adminCheckAccess
  );

  const adminQuickAccess = await request('/api/admin/quick-access', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminCandidateToken}` },
  });
  assert(
    adminQuickAccess.status === 200 &&
      adminQuickAccess.body?.authorized === true &&
      Boolean(adminQuickAccess.body?.token),
    'SCENARIO 3B: Authorized administrator calling POST /api/admin/quick-access receives elevated token (200 OK)',
    adminQuickAccess
  );

  const elevatedAdminToken = adminQuickAccess.body?.token;
  if (elevatedAdminToken) {
    const adminMonitoring = await request('/api/admin/ai-monitoring', {
      headers: { Authorization: `Bearer ${elevatedAdminToken}` },
    });
    assert(
      adminMonitoring.status === 200 && Boolean(adminMonitoring.body?.summary),
      'SCENARIO 3C: Elevated admin token from quick-access successfully accesses /api/admin/ai-monitoring',
      adminMonitoring
    );
  }

  // --------------------------------------------------------------------------
  // TEST 4: Passwordless Mode Cannot Globally Grant Admin Access
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Global Passwordless Mode Hardening ---');
  // Explicitly activate passwordless mode window to test global isolation
  enablePasswordlessAdminMode(60);
  assert(
    isPasswordlessAdminModeActive() === true,
    'SCENARIO 4A: Passwordless admin window is actively running'
  );

  // Verification 4B: Even when passwordless mode is active, an unauthenticated user is still rejected!
  const unauthWhilePasswordless = await request('/api/admin/check-access');
  assert(
    unauthWhilePasswordless.status === 401,
    'SCENARIO 4B: While passwordless mode is active, logged-out user calling /api/admin/check-access is STILL 401',
    unauthWhilePasswordless
  );

  const unauthOverviewWhilePasswordless = await request('/api/admin/ai-monitoring');
  assert(
    unauthOverviewWhilePasswordless.status === 401,
    'SCENARIO 4C: While passwordless mode is active, logged-out user calling /api/admin/ai-monitoring is STILL 401',
    unauthOverviewWhilePasswordless
  );

  // Verification 4D: Even when passwordless mode is active, a normal non-admin user is still rejected!
  const normalUserWhilePasswordless = await request('/api/admin/check-access', {
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  assert(
    normalUserWhilePasswordless.status === 403,
    'SCENARIO 4D: While passwordless mode is active, normal user calling /api/admin/check-access is STILL 403',
    normalUserWhilePasswordless
  );

  const normalOverviewWhilePasswordless = await request('/api/admin/ai-monitoring', {
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  assert(
    normalOverviewWhilePasswordless.status === 403,
    'SCENARIO 4E: While passwordless mode is active, normal user calling /api/admin/ai-monitoring is STILL 403',
    normalOverviewWhilePasswordless
  );

  // Verification 4F: While passwordless mode is active, logged-out user calling quick-access is STILL 401
  const unauthQuickAccessWhilePasswordless = await request('/api/admin/quick-access', {
    method: 'POST',
  });
  assert(
    unauthQuickAccessWhilePasswordless.status === 401,
    'SCENARIO 4F: While passwordless mode is active, logged-out user calling /api/admin/quick-access is STILL 401',
    unauthQuickAccessWhilePasswordless
  );

  // Verification 4G: While passwordless mode is active, normal user calling quick-access is STILL 403
  const normalQuickAccessWhilePasswordless = await request('/api/admin/quick-access', {
    method: 'POST',
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  assert(
    normalQuickAccessWhilePasswordless.status === 403,
    'SCENARIO 4G: While passwordless mode is active, normal user calling /api/admin/quick-access is STILL 403',
    normalQuickAccessWhilePasswordless
  );

  // Verification 4H: isAuthorizedAdminEmail does not grant admin rights to arbitrary emails
  assert(
    isAuthorizedAdminEmail(normalUserEmail) === false,
    'SCENARIO 4H: isAuthorizedAdminEmail returns FALSE for normal user during passwordless mode'
  );
  assert(
    isAuthorizedAdminEmail(attackerEmail) === false,
    'SCENARIO 4I: isAuthorizedAdminEmail returns FALSE for attacker email during passwordless mode'
  );
  assert(
    isAuthorizedAdminEmail(configuredAdminEmail) === true,
    'SCENARIO 4J: isAuthorizedAdminEmail returns TRUE for configured ADMIN_EMAILS'
  );

  // Verification 4K: No automatic fake admin created in database
  const fakeAdmin = await db.findUserByEmail('admin@aestific.local');
  assert(
    fakeAdmin === null || fakeAdmin === undefined,
    'SCENARIO 4K: No insecure admin@aestific.local user exists in database'
  );

  // Verification 4L: First user in database is NEVER treated as admin unless in ADMIN_EMAILS
  const allUsersInDb = await db.getAllUsers();
  if (allUsersInDb.length > 0) {
    const firstUser = allUsersInDb[0];
    const isFirstAdmin = isAuthorizedAdminEmail(firstUser.email);
    assert(
      isFirstAdmin === false || (process.env.ADMIN_EMAILS || '').includes(firstUser.email),
      'SCENARIO 4L: First user in database is NEVER granted admin rights unless explicitly listed in ADMIN_EMAILS'
    );
  }

  // Cleanup: Reset passwordless mode
  disablePasswordlessAdminMode();
  assert(
    isPasswordlessAdminModeActive() === false,
    'SCENARIO 4M: Passwordless admin mode cleanly disabled'
  );

  // Summary
  console.log(`\n=== PASSWORDLESS ADMIN SECURITY AUDIT RESULTS: ${testsPassed} / ${testsTotal} PASSED ===`);
  if (testsPassed === testsTotal) {
    console.log('🎉 ALL PASSWORDLESS ADMIN SECURITY TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPasswordlessSecurityTests().catch((err) => {
  console.error('Passwordless security test failed with unhandled error:', err);
  process.exit(1);
});
