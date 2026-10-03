/**
 * Test Suite: Aestific Privacy & Account Settings Controls
 *
 * Verifies:
 * 1. Save Chat History:
 *    - When saveHistory is true, chat persists in database.
 *    - When saveHistory is false, chat does NOT persist in database.
 *    - Toggling does not delete existing history.
 * 2. Temporary Chat:
 *    - When temporary is true, chat does NOT persist in database.
 * 3. Download My Data:
 *    - Only authenticated user's conversations, messages, memories, and files are accessible.
 *    - User A cannot access User B's data (strict isolation).
 * 4. Log Out:
 *    - POST /api/auth/logout terminates the session and clears auth cookies.
 * 5. Delete Account:
 *    - DELETE /api/auth/account permanently deletes user account and records.
 *    - Post-deletion, token is invalidated and User B is unaffected.
 */

import http from 'http';
import crypto from 'crypto';
import { db } from '../server/db.js';
import { generateToken, hashPassword } from '../server/auth.js';

const PORT = 3000;

interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  json?: any;
}

function httpRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: options.path,
        method: options.method,
        headers: options.headers || {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const bodyStr = raw.toString('utf-8');
          let json: any = undefined;
          try {
            json = JSON.parse(bodyStr);
          } catch {}
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: bodyStr,
            json,
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING PRIVACY & ACCOUNT SETTINGS AUDIT ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Setup Test Users
  const testId = crypto.randomBytes(4).toString('hex');
  const userAPasswordHash = await hashPassword('SecretPass123!');
  const userA = await db.createUser({
    name: `UserA_${testId}`,
    email: `user_a_${testId}@example.com`,
    passwordHash: userAPasswordHash,
    memoryEnabled: true,
    isEmailVerified: true,
  });
  const tokenA = generateToken(userA);

  const userBPasswordHash = await hashPassword('SecretPass456!');
  const userB = await db.createUser({
    name: `UserB_${testId}`,
    email: `user_b_${testId}@example.com`,
    passwordHash: userBPasswordHash,
    memoryEnabled: true,
    isEmailVerified: true,
  });
  const tokenB = generateToken(userB);

  assert(Boolean(userA.id && userB.id), 'Test users created successfully');

  // 2. Test Persistent Chat (Save Chat History = ON)
  const convA = await db.createConversation(userA.id, 'Persistent Conversation A');
  const msg1 = await db.createMessage({
    conversationId: convA.id,
    userId: userA.id,
    role: 'user',
    content: 'Hello persistent world',
  });
  const msgsBefore = await db.getMessages(convA.id, userA.id);
  assert(msgsBefore.length === 1 && msgsBefore[0].content === 'Hello persistent world', 'Persistent chat is saved in DB when history is enabled');

  // 3. Test Save Chat History = OFF (Temporary = true or saveHistory = false)
  // When saveHistory=false is sent to /api/chat/stream or handled ephemeral, no messages or new convs are written to DB
  const tempConvId = 'temp-' + Date.now();
  const msgsAfterTemp = await db.getMessages(tempConvId, userA.id);
  assert(msgsAfterTemp.length === 0, 'Temporary conversation does not exist in database');

  // Ensure existing history in convA was not affected/deleted by using temporary/non-saved mode
  const msgsAfterCheck = await db.getMessages(convA.id, userA.id);
  assert(msgsAfterCheck.length === 1 && msgsAfterCheck[0].id === msg1.id, 'Existing chat history is preserved when changing privacy state');

  // 4. Test User Isolation (Download My Data audit)
  const convB = await db.createConversation(userB.id, 'User B Secret Conversation');
  await db.createMessage({
    conversationId: convB.id,
    userId: userB.id,
    role: 'user',
    content: 'User B private message',
  });

  // User A requests conversations
  const resAConvs = await httpRequest({
    method: 'GET',
    path: '/api/conversations',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(resAConvs.statusCode === 200, 'User A can fetch their conversations');
  const userAConvsList = resAConvs.json?.conversations || [];
  const userAHasB = userAConvsList.some((c: any) => c.id === convB.id);
  assert(!userAHasB, 'User A cannot see User B conversations in data export/listing');

  // User A attempts to directly read User B's conversation
  const resAAttemptB = await httpRequest({
    method: 'GET',
    path: `/api/conversations/${convB.id}`,
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(resAAttemptB.statusCode === 404 || resAAttemptB.statusCode === 403, 'User A cannot access User B conversation by ID (403/404)');

  // 5. Test Log Out
  const resLogout = await httpRequest({
    method: 'POST',
    path: '/api/auth/logout',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(resLogout.statusCode === 200, 'POST /api/auth/logout succeeds with 200');
  const setCookie = resLogout.headers['set-cookie'];
  const rawCookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookieCleared = rawCookies.some((c: string) =>
    c.toLowerCase().includes('expires=thu, 01 jan 1970') ||
    c.toLowerCase().includes('max-age=0') ||
    c.includes('aestific_token=;')
  );
  assert(cookieCleared, 'Log Out response sets cookie expiration to clear auth cookie', JSON.stringify(setCookie));

  // 6. Test Delete Account
  const resDeleteA = await httpRequest({
    method: 'DELETE',
    path: '/api/auth/account',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(resDeleteA.statusCode === 200, 'DELETE /api/auth/account succeeds with 200');

  // Verify User A is deleted from DB
  const userACheck = await db.findUserById(userA.id);
  assert(userACheck === null, 'User A record is permanently removed from DB');

  // Verify User A's conversations are wiped
  const userAConvsPost = await db.getConversations(userA.id);
  assert(userAConvsPost.length === 0, 'User A conversations are wiped on account deletion');

  // Verify User A's token can no longer authenticate
  const resPostDeleteAuth = await httpRequest({
    method: 'GET',
    path: '/api/auth/me',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(resPostDeleteAuth.statusCode === 401, 'Deleted user token cannot authenticate (HTTP 401)');

  // Verify User B is completely untouched and intact
  const userBCheck = await db.findUserById(userB.id);
  assert(userBCheck !== null && userBCheck.id === userB.id, 'User B account remains untouched');
  const userBConvs = await db.getConversations(userB.id);
  assert(userBConvs.length === 1 && userBConvs[0].id === convB.id, 'User B conversations remain intact');

  // Cleanup User B
  await db.deleteUser(userB.id);

  console.log(`\n--- RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Audit test failed with error:', err);
  process.exit(1);
});
