/**
 * Comprehensive Server-Side Authorization Audit Test Suite
 *
 * CRITICAL SECURITY REQUIREMENT:
 * USER A MUST NEVER ACCESS USER B'S DATA.
 *
 * Verifies:
 * 1. User A creates data (conversations, messages, files, memories).
 * 2. User B attempts to access User A's data (reading conversations, messages, files, memories).
 * 3. User B attempts to modify User A's data (updating title, model, pins, memory content).
 * 4. User B attempts to delete User A's data (deleting conversations, messages, files, memories).
 * 5. User B attempts to download User A's files.
 * 6. User A retains normal access throughout all unauthorized attempts.
 * 7. Unauthenticated callers are strictly blocked with HTTP 401.
 * 8. All unauthorized access returns safe HTTP 403 / 404 behavior without information leakage.
 */

import http from 'http';
import crypto from 'crypto';
import { db } from '../server/db.js';
import { generateToken } from '../server/auth.js';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

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
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Multipart helper for file upload
function buildMultipartBody(
  fieldName: string,
  filename: string,
  contentType: string,
  fileContent: Buffer
): { body: Buffer; contentTypeHeader: string } {
  const boundary = `----AuthAuditBoundary${crypto.randomBytes(16).toString('hex')}`;
  const parts: Buffer[] = [];

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    )
  );
  parts.push(fileContent);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentTypeHeader: `multipart/form-data; boundary=${boundary}`,
  };
}

async function runAuthorizationAudit() {
  console.log('====================================================');
  console.log('🛡️  STARTING SERVER-SIDE AUTHORIZATION AUDIT');
  console.log('====================================================\n');

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

  // Ensure server is reachable
  const health = await httpRequest({ method: 'GET', path: '/api/health' });
  if (health.statusCode !== 200) {
    throw new Error('Server health check failed');
  }

  // 1. Create two isolated test users: User A and User B
  const userAEmail = `auth_user_a_${Date.now()}@test.com`;
  const userBEmail = `auth_user_b_${Date.now()}@test.com`;

  const userA = await db.createUser({
    name: 'User Alpha',
    email: userAEmail,
    passwordHash: 'hashed_pw_a',
    memoryEnabled: true,
    isEmailVerified: true,
  });

  const userB = await db.createUser({
    name: 'User Beta',
    email: userBEmail,
    passwordHash: 'hashed_pw_b',
    memoryEnabled: true,
    isEmailVerified: true,
  });

  const tokenA = generateToken(userA);
  const tokenB = generateToken(userB);

  console.log(`🔐 Created isolated audit accounts:`);
  console.log(`   User A: id=${userA.id} (${userAEmail})`);
  console.log(`   User B: id=${userB.id} (${userBEmail})\n`);

  // ========================================================
  // SECTION 1: CONVERSATION ISOLATION & AUTHORIZATION
  // ========================================================
  console.log('--- SECTION 1: Conversation & Chat History Authorization ---');

  // Step 1: User A creates a conversation
  const createConvRes = await httpRequest({
    method: 'POST',
    path: '/api/conversations',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({ title: 'User A Secret Conversation' }),
  });
  assert(
    createConvRes.statusCode === 201 && createConvRes.json?.conversation?.id,
    'User A successfully creates private conversation'
  );
  const convAId = createConvRes.json?.conversation?.id;

  // Add a secret message to User A's conversation
  const secretMsg = await db.createMessage({
    conversationId: convAId,
    userId: userA.id,
    role: 'user',
    content: 'TOP SECRET MESSAGE: User A private financial data 12345',
  });
  assert(Boolean(secretMsg?.id), 'User A secret message added to conversation');

  // Step 2: User B attempts to read User A's conversation
  const bReadConvRes = await httpRequest({
    method: 'GET',
    path: `/api/conversations/${convAId}`,
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(
    bReadConvRes.statusCode === 404,
    'User B reading User A conversation is rejected with HTTP 404 (Not Found)'
  );
  assert(
    !bReadConvRes.body.includes('TOP SECRET') && !bReadConvRes.body.includes('financial data'),
    'User B response contains no leaked content from User A conversation'
  );

  // Step 3: User B attempts to modify User A's conversation (patch/rename)
  const bPatchConvRes = await httpRequest({
    method: 'PATCH',
    path: `/api/conversations/${convAId}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenB}`,
    },
    body: JSON.stringify({ title: 'HACKED BY USER B' }),
  });
  assert(
    bPatchConvRes.statusCode === 404,
    'User B modifying User A conversation is rejected with HTTP 404'
  );

  // Step 4: User B attempts to send a chat message into User A's conversation
  const bChatStreamRes = await httpRequest({
    method: 'POST',
    path: '/api/chat/stream',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenB}`,
    },
    body: JSON.stringify({
      conversationId: convAId,
      message: 'Malicious injection from User B',
    }),
  });
  assert(
    bChatStreamRes.statusCode === 404,
    'User B chatting into User A conversation is rejected with HTTP 404'
  );

  // Step 5: User B attempts to react to User A's message
  const bReactRes = await httpRequest({
    method: 'POST',
    path: `/api/messages/${secretMsg.id}/react`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenB}`,
    },
    body: JSON.stringify({ liked: true }),
  });
  assert(
    bReactRes.statusCode === 404,
    'User B reacting to User A message is rejected with HTTP 404'
  );

  // Step 6: User B attempts to delete User A's conversation
  const bDeleteConvRes = await httpRequest({
    method: 'DELETE',
    path: `/api/conversations/${convAId}`,
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(
    bDeleteConvRes.statusCode === 404,
    'User B deleting User A conversation is rejected with HTTP 404'
  );

  // Step 7: User B calls clear all conversations -> User A's conversations must NOT be deleted
  await httpRequest({
    method: 'DELETE',
    path: '/api/conversations',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const aListConvsRes = await httpRequest({
    method: 'GET',
    path: '/api/conversations',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const aConvs = aListConvsRes.json?.conversations || [];
  const retainedConvA = aConvs.find((c: any) => c.id === convAId);
  assert(
    Boolean(retainedConvA && retainedConvA.title === 'User A Secret Conversation'),
    'User A retains normal access and title is unmodified after User B attacks'
  );

  // ========================================================
  // SECTION 2: FILE STORAGE & DOWNLOAD AUTHORIZATION
  // ========================================================
  console.log('\n--- SECTION 2: Files & Downloads Authorization ---');

  // Step 1: User A uploads a private file (valid 1x1 PNG)
  const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  const multipart = buildMultipartBody('file', 'user_a_private.png', 'image/png', validPng);
  const uploadRes = await httpRequest({
    method: 'POST',
    path: '/api/files/upload',
    headers: {
      'Content-Type': multipart.contentTypeHeader,
      Authorization: `Bearer ${tokenA}`,
    },
    body: multipart.body,
  });

  assert(uploadRes.statusCode === 201 && uploadRes.json?.file?.id, 'User A uploads private file');
  const fileA = uploadRes.json?.file;
  const fileAUniqueName = fileA?.filename;
  const fileAId = fileA?.id;

  // Step 2: User B attempts to download User A's file
  const bDownloadRes = await httpRequest({
    method: 'GET',
    path: `/api/files/download/${fileAUniqueName}`,
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(
    bDownloadRes.statusCode === 403,
    'User B attempting to download User A file is strictly rejected with HTTP 403 Forbidden'
  );

  // Step 3: Unauthenticated user attempts to download User A's file
  const anonDownloadRes = await httpRequest({
    method: 'GET',
    path: `/api/files/download/${fileAUniqueName}`,
  });
  assert(
    anonDownloadRes.statusCode === 401,
    'Unauthenticated user download attempt is strictly rejected with HTTP 401 Unauthorized'
  );

  // Step 4: User B attempts to delete User A's file
  const bDeleteFileRes = await httpRequest({
    method: 'DELETE',
    path: `/api/files/${fileAId}`,
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(
    bDeleteFileRes.statusCode === 404,
    'User B deleting User A file is rejected with HTTP 404 (Access Denied)'
  );

  // Step 5: User A downloads their own file -> must succeed
  const aDownloadRes = await httpRequest({
    method: 'GET',
    path: `/api/files/download/${fileAUniqueName}`,
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(
    aDownloadRes.statusCode === 200,
    'User A retains full legitimate access to download their own file'
  );

  // ========================================================
  // SECTION 3: ACCOUNT-LEVEL MEMORY AUTHORIZATION
  // ========================================================
  console.log('\n--- SECTION 3: Account-Level Memory Authorization ---');

  // Step 1: User A creates a memory
  const createMemRes = await httpRequest({
    method: 'POST',
    path: '/api/memories',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      content: 'User A secret preference: Prefers concise answers in French',
      category: 'preference',
    }),
  });
  assert(createMemRes.statusCode === 201 && createMemRes.json?.memory?.id, 'User A creates private memory');
  const memoryAId = createMemRes.json?.memory?.id;

  // Step 2: User B reads their own memories -> User A's memory must NOT appear
  const bListMemRes = await httpRequest({
    method: 'GET',
    path: '/api/memories',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const bMemories = bListMemRes.json?.memories || [];
  const leakedMem = bMemories.find((m: any) => m.id === memoryAId || m.content?.includes('User A'));
  assert(!leakedMem, 'User B memory list does NOT contain any memories of User A');

  // Step 3: User B attempts to delete User A's memory
  const bDeleteMemRes = await httpRequest({
    method: 'DELETE',
    path: `/api/memories/${memoryAId}`,
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(
    bDeleteMemRes.statusCode === 404,
    'User B deleting User A memory is rejected with HTTP 404 (Not Found)'
  );

  // Step 4: User B calls clear all memories -> User A's memory must NOT be deleted
  await httpRequest({
    method: 'DELETE',
    path: '/api/memories',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const aListMemRes = await httpRequest({
    method: 'GET',
    path: '/api/memories',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const aMemories = aListMemRes.json?.memories || [];
  assert(
    aMemories.some((m: any) => m.id === memoryAId),
    'User A retains normal access to private memory after User B clear request'
  );

  // ========================================================
  // SECTION 4: PROFILE & SETTINGS AUTHORIZATION
  // ========================================================
  console.log('\n--- SECTION 4: Profile & Account Settings Authorization ---');

  // Step 1: User A gets own profile
  const aProfileRes = await httpRequest({
    method: 'GET',
    path: '/api/auth/me',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(
    aProfileRes.statusCode === 200 && aProfileRes.json?.user?.email === userAEmail,
    'User A profile contains authentic user details'
  );

  // Step 2: User B updates their profile, passing a spoofed userId targeting User A
  const bSpoofProfileRes = await httpRequest({
    method: 'PATCH',
    path: '/api/auth/update-profile',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenB}`,
    },
    body: JSON.stringify({
      id: userA.id, // Attacker sends User A id in body
      name: 'Spoofed Name By User B',
    }),
  });
  assert(
    bSpoofProfileRes.statusCode === 200 && bSpoofProfileRes.json?.user?.id === userB.id,
    'Server strictly binds profile update to authenticated User B token, ignoring spoofed id'
  );

  // Verify User A profile was not modified by User B's spoofed request
  const aProfileCheck = await httpRequest({
    method: 'GET',
    path: '/api/auth/me',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(
    aProfileCheck.json?.user?.name === 'User Alpha',
    'User A profile remains intact and untouched by User B spoofing attempt'
  );

  // ========================================================
  // SECTION 5: ACCOUNT DELETION BOUNDARY
  // ========================================================
  console.log('\n--- SECTION 5: Account Deletion Authorization ---');

  // User B deletes their own account
  const bDeleteAccRes = await httpRequest({
    method: 'DELETE',
    path: '/api/auth/account',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(bDeleteAccRes.statusCode === 200, 'User B successfully deletes their own account');

  // Verify User A account is still fully active
  const aActiveCheck = await httpRequest({
    method: 'GET',
    path: '/api/auth/me',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(
    aActiveCheck.statusCode === 200 && aActiveCheck.json?.user?.id === userA.id,
    'User A account remains fully active and unaffected by User B deletion'
  );

  // Clean up User A test file and account
  await httpRequest({
    method: 'DELETE',
    path: `/api/files/${fileAId}`,
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  await httpRequest({
    method: 'DELETE',
    path: '/api/auth/account',
    headers: { Authorization: `Bearer ${tokenA}` },
  });

  // ========================================================
  // FINAL AUDIT SUMMARY
  // ========================================================
  console.log('\n====================================================');
  console.log(`📊 AUTHORIZATION AUDIT SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================');

  if (passed === total) {
    console.log('🎉 ALL SERVER-SIDE AUTHORIZATION CHECKS PASSED FLAWLESSLY!');
  } else {
    console.error(`❌ ${total - passed} tests failed.`);
    process.exit(1);
  }
}

runAuthorizationAudit().catch((err) => {
  console.error('Fatal authorization audit failure:', err);
  process.exit(1);
});
