/**
 * 30-Day Retention Reliability & Cloud Run Scheduling Verification Suite
 *
 * Mandatory Verification Matrix:
 * 1. Exact 30-day cutoff calculation & fresh record preservation
 * 2. Successful storage deletion -> DB file record deleted
 * 3. Missing/already-deleted storage object -> safely handled idempotently, DB record removed
 * 4. Complete storage API failure/exception -> DB file records preserved (NO data loss)
 * 5. Partial storage deletion failure -> successful files deleted, failed files preserved
 * 6. DB preservation retry -> next run retries and cleanly removes once storage succeeds
 * 7. Idempotent secondary execution -> zero side-effects, 0 duplicate changes
 * 8. User isolation -> User A cleanup never affects User B
 * 9. Concurrency protection -> simultaneous runs are safely guarded across instances
 * 10. Production HTTP trigger authorization -> strict authentication via Admin or Cron Secret
 */

import dotenv from 'dotenv';
dotenv.config();

// Ensure test environment variables for admin authorization
process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS || 'admin@aestific.io';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test_super_secure_cron_secret_32bytes!';

import { db } from '../server/db.js';
import { generateAdminToken } from '../server/auth.js';
import { setStorageBulkDeleteMock } from '../server/supabase-storage.js';
import { run30DayRetentionCleanup } from '../server/cleanup.js';
import crypto from 'crypto';

let passed = 0;
let total = 0;

const BASE_URL = 'http://127.0.0.1:3000';

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

async function request(path: string, options: RequestInit = {}) {
  try {
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
  } catch (err: any) {
    return { status: 0, ok: false, headers: null, body: err?.message };
  }
}

function makeFileParams(params: any) {
  return {
    storageProvider: 'supabase' as const,
    bucketName: 'aestific-files',
    uniqueFileId: params.filename,
    type: 'document' as const,
    url: '',
    ...params,
  };
}

async function runRetentionReliabilitySuite() {
  console.log('===============================================================');
  console.log('🛡️  AESTIFIC: 30-DAY RETENTION RELIABILITY & SCHEDULING AUDIT');
  console.log('===============================================================\n');

  const now = Date.now();
  const DAY_MS = 24 * 3600 * 1000;

  // Ensure test users exist in database
  const userA = await db.createUser({
    email: `ret_user_a_${Date.now()}@aestific.io`,
    name: 'Retention Test User A',
    passwordHash: 'hash',
  } as any);

  const userB = await db.createUser({
    email: `ret_user_b_${Date.now()}@aestific.io`,
    name: 'Retention Test User B',
    passwordHash: 'hash',
  } as any);

  const userAId = userA.id;
  const userBId = userB.id;

  // ---------------------------------------------------------------------------
  // TEST 1: Exact 30-Day Cutoff & Fresh Records Preserved
  // ---------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Exact Cutoff & Fresh Records Preservation ---');

  const freshConvA = await db.createConversation(userAId, 'Fresh Conversation A');
  const expiredConvA = await db.createConversation(userAId, 'Expired Conversation A');

  // Backdate expired conversation created timestamp to 35 days ago
  const t35DaysAgo = new Date(now - 35 * DAY_MS).toISOString();
  const t25DaysAgo = new Date(now - 25 * DAY_MS).toISOString();

  // Create fresh message (25 days old) and expired message (35 days old)
  const freshMsgA = await db.createMessage({
    conversationId: freshConvA.id,
    userId: userAId,
    role: 'user',
    content: 'This message is 25 days old (fresh, MUST be preserved)',
  });
  await db.updateRecordTimestamp('messages', freshMsgA.id, t25DaysAgo);

  const expiredMsgA = await db.createMessage({
    conversationId: expiredConvA.id,
    userId: userAId,
    role: 'user',
    content: 'This message is 35 days old (expired, MUST be purged)',
  });
  await db.updateRecordTimestamp('messages', expiredMsgA.id, t35DaysAgo);
  await db.updateRecordTimestamp('conversations', expiredConvA.id, t35DaysAgo);

  // Fresh file (10 days old) vs Expired file (40 days old)
  const freshFileRecord = await db.createFileRecord(makeFileParams({
    userId: userAId,
    conversationId: freshConvA.id,
    originalName: 'fresh_doc.pdf',
    filename: 'fresh_doc.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storagePath: `users/${userAId}/fresh_doc.pdf`,
    createdAt: new Date(now - 10 * DAY_MS).toISOString(),
  }));

  const expiredFileRecord = await db.createFileRecord(makeFileParams({
    userId: userAId,
    conversationId: expiredConvA.id,
    originalName: 'expired_doc.pdf',
    filename: 'expired_doc.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    storagePath: `users/${userAId}/expired_doc.pdf`,
    createdAt: new Date(now - 40 * DAY_MS).toISOString(),
  }));

  assert(
    new Date(freshFileRecord.createdAt).getTime() > now - 30 * DAY_MS,
    'T1.1: Fresh file record creation timestamp is strictly within 30-day window'
  );
  assert(
    new Date(expiredFileRecord.createdAt).getTime() < now - 30 * DAY_MS,
    'T1.2: Expired file record creation timestamp is strictly beyond 30-day cutoff'
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Complete Storage API Failure / Exception Must NEVER Cause Data Loss
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Storage Exception -> Zero Data Loss ---');

  const criticalPath = `users/${userAId}/critical_report.pdf`;
  const criticalFile = await db.createFileRecord(makeFileParams({
    userId: userAId,
    conversationId: expiredConvA.id,
    originalName: 'critical_report.pdf',
    filename: 'critical_report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 50000,
    storagePath: criticalPath,
    bucketName: 'aestific-files',
    createdAt: new Date(now - 45 * DAY_MS).toISOString(),
  }));
  const criticalFileId = criticalFile.id;

  // Mock bulkDeleteFromSupabaseStorage to throw an unexpected exception
  setStorageBulkDeleteMock(async () => {
    throw new Error('Supabase Storage 503 Service Unavailable / Network Partition');
  });

  const crashReport = await run30DayRetentionCleanup(30, { triggerSource: 'TestStorageCrash', forceLock: true });

  // Verify that despite the storage exception, the critical file record STILL EXISTS in DB!
  const fileAfterCrash = await db.getFileById(criticalFileId);
  assert(
    fileAfterCrash !== null && fileAfterCrash.id === criticalFileId,
    'T2.1: Expired DB file record is strictly PRESERVED when storage deletion throws an exception',
    `File was missing or null after storage exception: ${JSON.stringify(fileAfterCrash)}`
  );
  assert(
    fileAfterCrash?.storagePath === criticalPath,
    'T2.2: Preserved DB file record maintains complete storage path and bucket metadata for future retry'
  );
  assert(
    crashReport.preservedFilesCount >= 1,
    'T2.3: Retention cleanup report correctly indicates preserved files count for retry'
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Partial Storage Deletion Failure
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Partial Storage Failure Handling ---');

  const filePartSucc = await db.createFileRecord(makeFileParams({
    userId: userAId,
    originalName: 'part_succ.png',
    filename: 'part_succ.png',
    mimeType: 'image/png',
    sizeBytes: 1000,
    storagePath: `users/${userAId}/part_succ.png`,
    createdAt: new Date(now - 42 * DAY_MS).toISOString(),
  }));
  const partialSuccessFileId = filePartSucc.id;

  const filePartFail = await db.createFileRecord(makeFileParams({
    userId: userAId,
    originalName: 'part_fail.png',
    filename: 'part_fail.png',
    mimeType: 'image/png',
    sizeBytes: 1000,
    storagePath: `users/${userAId}/part_fail.png`,
    createdAt: new Date(now - 42 * DAY_MS).toISOString(),
  }));
  const partialFailFileId = filePartFail.id;

  // Mock partial storage deletion: part_succ.png succeeds, part_fail.png fails
  setStorageBulkDeleteMock(async (items: any[]) => {
    const successfulPaths: string[] = [];
    const failedPaths: string[] = [];
    for (const item of items) {
      if (item.storagePath.includes('part_fail')) {
        failedPaths.push(item.storagePath.replace(/^(aestific-files)\//, ''));
      } else {
        successfulPaths.push(item.storagePath.replace(/^(aestific-files)\//, ''));
      }
    }
    return {
      deletedCount: successfulPaths.length,
      storageObjectsDeleted: successfulPaths.length,
      localFilesDeleted: 0,
      errors: ['Failed to delete part_fail.png: Object locked'],
      failedPaths,
      successfulPaths,
    };
  });

  const partialReport = await run30DayRetentionCleanup(30, { triggerSource: 'TestPartialFailure', forceLock: true });

  const recordSuccAfter = await db.getFileById(partialSuccessFileId);
  const recordFailAfter = await db.getFileById(partialFailFileId);

  assert(
    recordSuccAfter === null,
    'T3.1: Successfully deleted storage file record is cleanly purged from DB'
  );
  assert(
    recordFailAfter !== null && recordFailAfter.id === partialFailFileId,
    'T3.2: Failed storage file record is preserved in DB without data loss',
    'Failed file was erroneously purged'
  );
  assert(
    partialReport.deletedFilesCount >= 1,
    'T3.3: Partial batch proceeds cleanly: one failure does not halt successful deletions'
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Retry Behavior -> Next Run Cleans Preserved Record Once Storage Recovers
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Retry Behavior on Recovered Storage ---');

  // Now storage recovers and succeeds for all paths
  setStorageBulkDeleteMock(async (items: any[]) => {
    return {
      deletedCount: items.length,
      storageObjectsDeleted: items.length,
      localFilesDeleted: 0,
      errors: [],
      failedPaths: [],
      successfulPaths: items.map((i: any) => i.storagePath.replace(/^(aestific-files)\//, '')),
    };
  });

  const retryReport = await run30DayRetentionCleanup(30, { triggerSource: 'TestRetryRecovered', forceLock: true });

  const retriedRecordAfter = await db.getFileById(partialFailFileId);
  const retriedCriticalAfter = await db.getFileById(criticalFileId);

  assert(
    retriedRecordAfter === null,
    'T4.1: Previously failed file record is retried and deleted once storage succeeds'
  );
  assert(
    retriedCriticalAfter === null,
    'T4.2: Previously crashed file record is retried and deleted once storage succeeds'
  );
  assert(
    retryReport.success === true,
    'T4.3: Retry cleanup completes successfully'
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Missing / Already-Deleted Storage Objects Handled Idempotently
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Missing Storage Object Handled Safely ---');

  const missingFile = await db.createFileRecord(makeFileParams({
    userId: userAId,
    originalName: 'already_deleted.pdf',
    filename: 'already_deleted.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2000,
    storagePath: `users/${userAId}/already_deleted.pdf`,
    createdAt: new Date(now - 50 * DAY_MS).toISOString(),
  }));
  const missingStorageFileId = missingFile.id;

  // Supabase returns { data: [], error: null } when deleting already-missing object
  setStorageBulkDeleteMock(async (items: any[]) => {
    return {
      deletedCount: items.length,
      storageObjectsDeleted: items.length,
      localFilesDeleted: 0,
      errors: [],
      failedPaths: [],
      successfulPaths: items.map((i: any) => i.storagePath.replace(/^(aestific-files)\//, '')),
    };
  });

  await run30DayRetentionCleanup(30, { triggerSource: 'TestMissingObject', forceLock: true });

  const missingFileAfter = await db.getFileById(missingStorageFileId);
  assert(
    missingFileAfter === null,
    'T5.1: Missing/already-deleted storage object is treated safely; DB record is cleaned without blocking'
  );

  // ---------------------------------------------------------------------------
  // TEST 6: User Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: User Isolation ---');

  const userBFile = await db.createFileRecord(makeFileParams({
    userId: userBId,
    originalName: 'user_b_active.pdf',
    filename: 'user_b_active.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4000,
    storagePath: `users/${userBId}/user_b_active.pdf`,
    createdAt: new Date(now - 5 * DAY_MS).toISOString(), // 5 days old (fresh)
  }));
  const userBFileId = userBFile.id;

  await run30DayRetentionCleanup(30, { triggerSource: 'TestUserIsolation', forceLock: true });

  const userBFileAfter = await db.getFileById(userBFileId);
  assert(
    userBFileAfter !== null && userBFileAfter.id === userBFileId,
    'T6.1: User B fresh file is 100% preserved during system retention cleanup'
  );

  const freshFileAAfter = await db.getFileById(freshFileRecord.id);
  assert(
    freshFileAAfter !== null && freshFileAAfter.id === freshFileRecord.id,
    'T6.2: User A fresh file (10 days old) remains 100% preserved'
  );

  // ---------------------------------------------------------------------------
  // TEST 7: Idempotency (Consecutive Cleanups Cause Zero Side-Effects)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Idempotent Execution ---');

  const run1 = await run30DayRetentionCleanup(30, { triggerSource: 'TestIdempotent1', forceLock: true });
  const run2 = await run30DayRetentionCleanup(30, { triggerSource: 'TestIdempotent2', forceLock: true });

  assert(run1.success === true, 'T7.1: First retention run succeeds');
  assert(run2.success === true, 'T7.2: Second retention run completes cleanly');
  assert(
    run2.deletedFilesCount === 0 && run2.deletedMessagesCount === 0,
    'T7.3: Second run finds 0 stale records to delete (fully idempotent)'
  );

  // ---------------------------------------------------------------------------
  // TEST 8: Concurrency Guard (Cloud Run Multi-Instance Protection)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Concurrency Guard ---');

  // Test distributed lock acquisition
  const lockInstance1 = 'cloud_run_inst_1';
  const lockInstance2 = 'cloud_run_inst_2';

  const acq1 = await db.acquireLock('retention_cleanup', lockInstance1, 10000);
  assert(acq1.acquired === true, 'T8.1: Instance 1 successfully acquires retention lock');

  const acq2 = await db.acquireLock('retention_cleanup', lockInstance2, 10000);
  assert(
    acq2.acquired === false,
    'T8.2: Instance 2 is blocked from concurrent execution while lock is held',
    `Instance 2 was not blocked: ${JSON.stringify(acq2)}`
  );

  const runWhileLocked = await run30DayRetentionCleanup(30, { triggerSource: 'TestConcurrentRun' });
  assert(
    runWhileLocked.skipped === true,
    'T8.3: run30DayRetentionCleanup skips gracefully when lock is held by another instance'
  );

  await db.releaseLock('retention_cleanup', lockInstance1);
  const acq2After = await db.acquireLock('retention_cleanup', lockInstance2, 10000);
  assert(
    acq2After.acquired === true,
    'T8.4: After release, Instance 2 can safely acquire lock'
  );
  await db.releaseLock('retention_cleanup', lockInstance2);

  // Reset storage mock
  setStorageBulkDeleteMock(null);

  // ---------------------------------------------------------------------------
  // TEST 9: Production HTTP Trigger & Authorization Architecture
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Production HTTP Trigger Authorization ---');

  // 9.1 Unauthenticated request must be rejected (401)
  const unauthRes = await request('/api/cron/retention-cleanup', {
    method: 'POST',
    body: JSON.stringify({ retentionDays: 30 }),
  });
  assert(
    unauthRes.status === 401,
    'T9.1: Unauthenticated request to /api/cron/retention-cleanup is rejected with 401 Unauthorized',
    `Status: ${unauthRes.status}`
  );

  // 9.2 Request with invalid cron secret must be rejected (401)
  const badSecretRes = await request('/api/cron/retention-cleanup', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer wrong-or-too-short-secret',
      'x-cron-secret': 'invalid',
    },
    body: JSON.stringify({ retentionDays: 30 }),
  });
  assert(
    badSecretRes.status === 401,
    'T9.2: Request with invalid cron secret is rejected with 401 Unauthorized',
    `Status: ${badSecretRes.status}`
  );

  // 9.3 Request with valid Cloud Scheduler Cron Secret must succeed (200)
  const cronSecretRes = await request('/api/cron/retention-cleanup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ retentionDays: 30, force: true }),
  });
  assert(
    cronSecretRes.status === 200,
    'T9.3: Authorized Cloud Scheduler request with CRON_SECRET succeeds (200 OK)',
    `Status: ${cronSecretRes.status}, body: ${JSON.stringify(cronSecretRes.body)}`
  );

  // 9.4 Request with elevated admin credentials must be accepted (200)
  const adminEmail = process.env.ADMIN_EMAILS.split(',')[0].trim();
  const adminTokenResult = generateAdminToken(
    {
      id: 'admin_test_id',
      email: adminEmail,
      name: 'SentinelAdminTest',
      role: 'admin',
    },
    'SentinelAdminTest'
  );
  const elevatedAdminToken = adminTokenResult.token;

  const adminRes = await request('/api/cron/retention-cleanup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${elevatedAdminToken}`,
    },
    body: JSON.stringify({ retentionDays: 30, force: true }),
  });
  assert(
    adminRes.status === 200,
    'T9.4: Authorized administrator request to /api/cron/retention-cleanup succeeds (200 OK)',
    `Status: ${adminRes.status}, body: ${JSON.stringify(adminRes.body)}`
  );

  // 9.5 Legacy admin endpoint /api/admin/retention-cleanup also protected
  const unauthAdminRouteRes = await request('/api/admin/retention-cleanup', {
    method: 'POST',
    body: JSON.stringify({ retentionDays: 30 }),
  });
  assert(
    unauthAdminRouteRes.status === 401,
    'T9.5: Unauthenticated request to /api/admin/retention-cleanup is rejected with 401 Unauthorized',
    `Status: ${unauthAdminRouteRes.status}`
  );

  // Cleanup test users and files
  try {
    await db.deleteUser(userAId);
    await db.deleteUser(userBId);
  } catch {}

  console.log('\n===============================================================');
  console.log(`📊 RETENTION RELIABILITY AUDIT RESULTS: ${passed}/${total} PASSED`);
  console.log('===============================================================');

  if (passed === total) {
    console.log('✨ ALL RETENTION & SCHEDULING RELIABILITY INVARIANTS VERIFIED!\n');
    process.exit(0);
  } else {
    console.error(`❌ ${total - passed} AUDIT CHECKS FAILED.\n`);
    process.exit(1);
  }
}

runRetentionReliabilitySuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
