import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import {
  checkRateLimitByKey,
  checkFailedRateLimit,
  recordFailedAttempt,
  acquireInferenceLock,
  releaseInferenceLock,
  resetRateLimit,
  clearAllRateLimits,
  sendRateLimitResponse,
  ProductionRateLimiter,
  setRateLimitingEnabled,
  isRateLimitingEnabled,
  rateLimiter,
} from '../server/rate-limiter.js';

async function runTests() {
  console.log('=== RUNNING PRODUCTION-SAFE RATE LIMITER TEST SUITE ===\n');
  setRateLimitingEnabled(true);

  // Test 1: Sliding-window rate limiting accuracy
  console.log('--- 1. Sliding-Window Rate Limiting Accuracy ---');
  clearAllRateLimits();
  const testKey = 'test:sliding:user:1';
  const limit = 5;
  const windowMs = 2000;

  for (let i = 1; i <= limit; i++) {
    const res = checkRateLimitByKey(testKey, limit, windowMs);
    assert.strictEqual(res.allowed, true, `Request ${i} should be allowed`);
    assert.strictEqual(res.count, i);
  }

  // Next request must be blocked
  const blocked = checkRateLimitByKey(testKey, limit, windowMs);
  assert.strictEqual(blocked.allowed, false, 'Request over limit must be blocked');
  assert.strictEqual(typeof blocked.retryAfter, 'number');
  assert(blocked.retryAfter! > 0, 'Retry-after must be positive');
  assert(blocked.message?.includes('Rate limit exceeded'), 'Should include rate limit message');
  console.log('✅ [PASS] Sliding-window correctly enforces limit and blocks excess requests');

  // Test 2: HTTP 429 & Retry-After response helper
  console.log('--- 2. HTTP 429 & Retry-After Header Compliance ---');
  let statusSet = 0;
  let headersSet: Record<string, string> = {};
  let jsonSent: any = null;

  const mockRes: any = {
    setHeader(name: string, val: string) {
      headersSet[name] = val;
    },
    status(code: number) {
      statusSet = code;
      return this;
    },
    json(data: any) {
      jsonSent = data;
      return this;
    },
  };

  sendRateLimitResponse(mockRes, blocked);
  assert.strictEqual(statusSet, 429, 'Status code must be 429');
  assert.strictEqual(headersSet['Retry-After'], String(blocked.retryAfter), 'Retry-After header must be set');
  assert(headersSet['X-RateLimit-Reset'], 'X-RateLimit-Reset header must be set');
  assert.strictEqual(jsonSent.error, blocked.message);
  assert.strictEqual(jsonSent.retryAfter, blocked.retryAfter);
  console.log('✅ [PASS] HTTP 429 and RFC-compliant Retry-After header verified');

  // Test 3: Failed attempt lockout mechanism (Admin / Password defense)
  console.log('--- 3. Failed Attempt Lockout Mechanism ---');
  const failKey = 'test:failed:user:admin';
  const maxFails = 3;
  const failWindow = 5000;

  assert.strictEqual(checkFailedRateLimit(failKey, maxFails, failWindow).allowed, true);
  recordFailedAttempt(failKey);
  recordFailedAttempt(failKey);
  assert.strictEqual(checkFailedRateLimit(failKey, maxFails, failWindow).allowed, true);
  recordFailedAttempt(failKey); // 3rd failure

  const failCheck = checkFailedRateLimit(failKey, maxFails, failWindow);
  assert.strictEqual(failCheck.allowed, false, '3 failures should trigger lockout');
  assert(failCheck.message?.includes('Too many failed attempts'), 'Should contain failed attempt warning');

  // Reset after successful action
  resetRateLimit(failKey);
  assert.strictEqual(checkFailedRateLimit(failKey, maxFails, failWindow).allowed, true, 'Reset must clear lockout');
  console.log('✅ [PASS] Failed attempt lockout blocks brute force and clears on reset');

  // Test 4: In-flight Concurrency Lock (Deduplication for AI inference)
  console.log('--- 4. In-Flight Inference Concurrency Lock ---');
  const lockKey = 'lock:inference:chat:conv1';
  assert.strictEqual(acquireInferenceLock(lockKey, 5000), true, 'First lock acquire must succeed');
  assert.strictEqual(acquireInferenceLock(lockKey, 5000), false, 'Concurrent lock acquire must fail');
  releaseInferenceLock(lockKey);
  assert.strictEqual(acquireInferenceLock(lockKey, 5000), true, 'Acquire after release must succeed');
  releaseInferenceLock(lockKey);
  console.log('✅ [PASS] In-flight concurrency lock prevents simultaneous duplicate AI jobs');

  // Test 5: Multi-Process Shared Rate Limiting (WAL Mode Concurrency)
  console.log('--- 5. Multi-Process Concurrency & Shared State (WAL Mode) ---');
  clearAllRateLimits();
  const sharedKey = 'concurrent:test:key';
  const sharedLimit = 8;

  function runWorkerProcess(): Promise<number> {
    return new Promise((resolve) => {
      const code = `
        import { checkRateLimitByKey } from './server/rate-limiter.ts';
        let allowed = 0;
        for (let i = 0; i < 6; i++) {
          const res = checkRateLimitByKey('${sharedKey}', ${sharedLimit}, 60000);
          if (res.allowed) allowed++;
        }
        console.log('ALLOWED:' + allowed);
      `;
      const p = spawn('npx', ['tsx', '-e', code], {
        env: { ...process.env, ENABLE_RATE_LIMITING: 'true' },
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d.toString()));
      p.on('close', () => {
        const m = out.match(/ALLOWED:(\d+)/);
        resolve(m ? parseInt(m[1]) : 0);
      });
    });
  }

  // Run 2 processes simultaneously, each trying to make 6 requests (total 12 requests, limit 8)
  const [allowed1, allowed2] = await Promise.all([runWorkerProcess(), runWorkerProcess()]);
  const totalAllowed = allowed1 + allowed2;
  console.log(`Worker 1 allowed: ${allowed1}, Worker 2 allowed: ${allowed2}, Total: ${totalAllowed}`);
  assert.strictEqual(totalAllowed, sharedLimit, `Combined requests allowed must exactly equal ${sharedLimit}`);
  console.log('✅ [PASS] Multiple concurrent server processes safely share rate limit in WAL mode');

  // Test 6: Persistence across server process restart
  console.log('--- 6. State Persistence Across Process Restart ---');
  const restartKey = 'restart:persist:key';
  clearAllRateLimits();

  // Process 1 exhausts limit (3/3)
  const exhaustProc = spawn(
    'npx',
    [
      'tsx',
      '-e',
      `
    import { checkRateLimitByKey } from './server/rate-limiter.ts';
    checkRateLimitByKey('${restartKey}', 3, 60000);
    checkRateLimitByKey('${restartKey}', 3, 60000);
    checkRateLimitByKey('${restartKey}', 3, 60000);
    console.log('EXHAUSTED');
  `,
    ],
    { env: { ...process.env, ENABLE_RATE_LIMITING: 'true' } }
  );
  await new Promise((r) => exhaustProc.on('close', r));

  // Process 2 starts fresh as a completely new process
  const verifyProc = spawn(
    'npx',
    [
      'tsx',
      '-e',
      `
    import { checkRateLimitByKey } from './server/rate-limiter.ts';
    const res = checkRateLimitByKey('${restartKey}', 3, 60000);
    console.log('RESULT:' + JSON.stringify(res));
  `,
    ],
    { env: { ...process.env, ENABLE_RATE_LIMITING: 'true' } }
  );
  let verifyOut = '';
  verifyProc.stdout.on('data', (d) => (verifyOut += d.toString()));
  await new Promise((r) => verifyProc.on('close', r));

  const jsonMatch = verifyOut.match(/RESULT:(\{.*\})/);
  assert(jsonMatch, 'Verification process must output result');
  const freshResult = JSON.parse(jsonMatch[1]);
  assert.strictEqual(freshResult.allowed, false, 'Rate limit must persist across process restart');
  assert.strictEqual(freshResult.count, 3);
  console.log('✅ [PASS] Rate limits persist across server restarts (unlike in-memory Map)');

  // Test 7: Segregation between IPs and Users
  console.log('--- 7. Multi-Dimensional Key Segregation ---');
  clearAllRateLimits();
  checkRateLimitByKey('api:ip:192.168.1.1', 1, 60000);
  const ip1Blocked = checkRateLimitByKey('api:ip:192.168.1.1', 1, 60000);
  assert.strictEqual(ip1Blocked.allowed, false, 'IP 1 must be blocked');

  const ip2Allowed = checkRateLimitByKey('api:ip:192.168.1.2', 1, 60000);
  assert.strictEqual(ip2Allowed.allowed, true, 'IP 2 must NOT be blocked by IP 1');

  const user1Blocked = checkRateLimitByKey('chat:user:burst:usr_alpha', 1, 60000);
  assert.strictEqual(user1Blocked.allowed, true);
  const user1Next = checkRateLimitByKey('chat:user:burst:usr_alpha', 1, 60000);
  assert.strictEqual(user1Next.allowed, false);

  const user2Allowed = checkRateLimitByKey('chat:user:burst:usr_beta', 1, 60000);
  assert.strictEqual(user2Allowed.allowed, true, 'User beta must NOT be blocked by user alpha');
  console.log('✅ [PASS] Independent users and IPs are properly isolated');

  // Test 8: Clean up test artifacts and ensure rate limiting remains disabled for production launch
  console.log('--- 8. Cleanup Test Artifacts ---');
  rateLimiter.close();
  const testFiles = ['ratelimit.sqlite', 'ratelimit.sqlite-wal', 'ratelimit.sqlite-shm'];
  for (const f of testFiles) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
  setRateLimitingEnabled(false);
  assert.strictEqual(isRateLimitingEnabled(), false, 'Rate limiting must remain disabled for launch');
  console.log('✅ [PASS] SQLite database artifacts cleaned and rate limiting restored to disabled for launch');

  console.log('\n=== ALL RATE LIMITER TESTS PASSED SUCCESSFULLY! ===\n');
}

runTests().catch((err) => {
  console.error('Rate limiter test error:', err);
  process.exit(1);
});
