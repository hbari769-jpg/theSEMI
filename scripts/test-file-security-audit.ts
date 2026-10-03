/**
 * Automated Security Audit Test Suite for File Upload, Download, and Deletion
 * Tests all required audit criteria:
 * 1. Valid file upload
 * 2. Wrong extension (blocked / unsupported)
 * 3. Wrong MIME type (mismatched / spoofed)
 * 4. Invalid signature (magic bytes mismatch / disguised executable)
 * 5. Oversized file (exceeding category limits)
 * 6. Duplicate filename (no collision, separate storage paths)
 * 7. Path traversal attempts (upload originalname & download parameter)
 * 8. Unauthorized download (cross-user access denied 403)
 * 9. Unauthorized deletion (cross-user delete denied 404)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '../server/db.js';
import { generateToken } from '../server/auth.js';

const BASE_PORT = 3000;
const BASE_HOST = '127.0.0.1';

// Helper to make HTTP requests
function httpRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: Buffer | string;
}): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string; json: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: BASE_HOST,
        port: BASE_PORT,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks);
          const bodyStr = bodyBuffer.toString('utf8');
          let json: any = null;
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

// Helper to build multipart/form-data payload
function buildMultipartBody(
  fieldName: string,
  filename: string,
  contentType: string,
  fileContent: Buffer,
  additionalFields: Record<string, string> = {}
): { body: Buffer; boundary: string; contentTypeHeader: string } {
  const boundary = `----AuditBoundary${crypto.randomBytes(16).toString('hex')}`;
  const parts: Buffer[] = [];

  for (const [k, v] of Object.entries(additionalFields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
      )
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    )
  );
  parts.push(fileContent);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);
  return {
    body,
    boundary,
    contentTypeHeader: `multipart/form-data; boundary=${boundary}`,
  };
}

async function getOrCreateVerifiedUserToken(email: string, name: string): Promise<string> {
  let user = await db.findUserByEmail(email);
  if (!user) {
    user = await db.createUser({
      name,
      email,
      passwordHash: 'dummy_audit_hash',
      memoryEnabled: true,
      isEmailVerified: true,
    });
  }
  return generateToken(user);
}

async function runAuditTests() {
  console.log('====================================================');
  console.log('🛡️  STARTING FILE UPLOAD SYSTEM SECURITY AUDIT');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   Detail: ${detail}`);
    }
  }

  // Wait for server to be responsive
  let serverReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const ping = await httpRequest({ method: 'GET', path: '/api/health' });
      if (ping.statusCode === 200) {
        serverReady = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!serverReady) {
    throw new Error('Server on port 3000 did not become ready.');
  }

  // Setup Users: User A and User B for cross-tenant isolation testing
  const userAEmail = `audit_user_a_${Date.now()}@test.com`;
  const userBEmail = `audit_user_b_${Date.now()}@test.com`;
  console.log(`🔐 Creating test user accounts:`);
  console.log(`   User A: ${userAEmail}`);
  console.log(`   User B: ${userBEmail}`);

  const tokenA = await getOrCreateVerifiedUserToken(userAEmail, 'Audit User A');
  const tokenB = await getOrCreateVerifiedUserToken(userBEmail, 'Audit User B');

  let userAFileRecord: any = null;

  // ----------------------------------------------------
  // TEST 1: Valid File Upload (PNG image with valid magic bytes)
  // ----------------------------------------------------
  console.log('\n--- TEST 1: Valid File Upload ---');
  {
    // Minimal 1x1 valid PNG binary buffer
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND chunk
      0x42, 0x60, 0x82,
    ]);

    const { body, contentTypeHeader } = buildMultipartBody(
      'file',
      'valid_test_image.png',
      'image/png',
      validPngBuffer
    );

    const res = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': contentTypeHeader,
        'Content-Length': body.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body,
    });

    assert(
      res.statusCode === 201 && res.json?.file?.id,
      'Valid PNG upload succeeded with HTTP 201 and file metadata created',
      `Status: ${res.statusCode}, Body: ${res.body}`
    );
    userAFileRecord = res.json?.file;
  }

  // ----------------------------------------------------
  // TEST 2: Wrong Extension (Blocked Executable / Script)
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Wrong Extension (Blocked Executable & Unsupported) ---');
  {
    // Test 2a: Blocked .exe extension
    const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00Dummy executable');
    const { body: exeBody, contentTypeHeader: exeHeader } = buildMultipartBody(
      'file',
      'malicious_payload.exe',
      'application/x-msdownload',
      exeBuffer
    );

    const resExe = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': exeHeader,
        'Content-Length': exeBody.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body: exeBody,
    });

    assert(
      resExe.statusCode === 400 && resExe.body.includes('prohibited'),
      'Blocked .exe file upload rejected with HTTP 400 and prohibited warning',
      `Status: ${resExe.statusCode}, Body: ${resExe.body}`
    );

    // Test 2b: Unsupported extension (.xyz)
    const { body: xyzBody, contentTypeHeader: xyzHeader } = buildMultipartBody(
      'file',
      'random_file.xyz',
      'application/octet-stream',
      Buffer.from('Some random content')
    );

    const resXyz = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': xyzHeader,
        'Content-Length': xyzBody.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body: xyzBody,
    });

    assert(
      resXyz.statusCode === 400 && resXyz.body.includes('Unsupported file extension'),
      'Unsupported file extension rejected with HTTP 400',
      `Status: ${resXyz.statusCode}, Body: ${resXyz.body}`
    );
  }

  // ----------------------------------------------------
  // TEST 3: Wrong MIME Type (Mismatched / Spoofed)
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Wrong MIME Type Validation ---');
  {
    // Upload image.png with executable MIME type
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { body, contentTypeHeader } = buildMultipartBody(
      'file',
      'sneaky_image.png',
      'application/x-dosexec',
      validPngBuffer
    );

    const res = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': contentTypeHeader,
        'Content-Length': body.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body,
    });

    assert(
      res.statusCode === 400 && (res.body.includes('MIME') || res.body.includes('invalid') || res.body.includes('prohibited')),
      'Extension/MIME mismatch (png + application/x-dosexec) rejected with HTTP 400',
      `Status: ${res.statusCode}, Body: ${res.body}`
    );
  }

  // ----------------------------------------------------
  // TEST 4: Invalid Signature / Magic-Byte Validation
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Invalid Signature / Disguised File ---');
  {
    // Test 4a: File named 'fake_photo.jpg' with plain text content
    const fakeJpgContent = Buffer.from('This is completely fake JPEG content without FF D8 FF header');
    const { body: fakeJpgBody, contentTypeHeader: fakeJpgHeader } = buildMultipartBody(
      'file',
      'fake_photo.jpg',
      'image/jpeg',
      fakeJpgContent
    );

    const resFakeJpg = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': fakeJpgHeader,
        'Content-Length': fakeJpgBody.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body: fakeJpgBody,
    });

    assert(
      resFakeJpg.statusCode === 400 && resFakeJpg.body.includes('signature'),
      'Fake JPEG without valid magic bytes rejected with HTTP 400 signature mismatch',
      `Status: ${resFakeJpg.statusCode}, Body: ${resFakeJpg.body}`
    );

    // Test 4b: Windows PE executable disguised with .png extension
    const peDisguisedBuffer = Buffer.concat([
      Buffer.from('MZ\x90\x00\x03\x00\x00\x00This program cannot be run in DOS mode'),
      Buffer.alloc(100),
    ]);
    const { body: peBody, contentTypeHeader: peHeader } = buildMultipartBody(
      'file',
      'trojan_disguised.png',
      'image/png',
      peDisguisedBuffer
    );

    const resPe = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': peHeader,
        'Content-Length': peBody.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body: peBody,
    });

    assert(
      resPe.statusCode === 400 && (resPe.body.includes('executable') || resPe.body.includes('signature')),
      'Disguised PE executable (MZ) with .png extension blocked by magic bytes inspection',
      `Status: ${resPe.statusCode}, Body: ${resPe.body}`
    );

    // Test 4c: Empty file upload (0 bytes)
    const { body: emptyBody, contentTypeHeader: emptyHeader } = buildMultipartBody(
      'file',
      'empty.png',
      'image/png',
      Buffer.alloc(0)
    );

    const resEmpty = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': emptyHeader,
        'Content-Length': emptyBody.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body: emptyBody,
    });

    assert(
      resEmpty.statusCode === 400 && (resEmpty.body.includes('Empty file') || resEmpty.body.includes('validation')),
      'Zero-byte empty file rejected with HTTP 400',
      `Status: ${resEmpty.statusCode}, Body: ${resEmpty.body}`
    );
  }

  // ----------------------------------------------------
  // TEST 5: Oversized File (Size Limit Enforcement)
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Oversized File Limits ---');
  {
    // Category limit for text documents is 10MB. Test with 11.5MB text file
    const oversizedText = Buffer.alloc(11.5 * 1024 * 1024, 0x61); // 11.5MB of 'a'
    const { body: overBody, contentTypeHeader: overHeader } = buildMultipartBody(
      'file',
      'oversized_notes.txt',
      'text/plain',
      oversizedText
    );

    const resOversized = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': overHeader,
        'Content-Length': overBody.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body: overBody,
    });

    assert(
      resOversized.statusCode === 413,
      'Oversized file exceeding category limit returned HTTP 413 Payload Too Large',
      `Status: ${resOversized.statusCode}, Body: ${resOversized.body.slice(0, 150)}`
    );
  }

  // ----------------------------------------------------
  // TEST 6: Duplicate Filename (Collision & Overwrite Prevention)
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Duplicate Filename Handling ---');
  {
    const validPngBuffer = Buffer.from([
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

    // Upload 1: by User A with duplicate_test.png
    const { body: body1, contentTypeHeader: header1 } = buildMultipartBody(
      'file',
      'duplicate_test.png',
      'image/png',
      validPngBuffer
    );
    const res1 = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': header1,
        'Content-Length': body1.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body: body1,
    });

    // Upload 2: by User B with EXACT SAME filename duplicate_test.png
    const { body: body2, contentTypeHeader: header2 } = buildMultipartBody(
      'file',
      'duplicate_test.png',
      'image/png',
      validPngBuffer
    );
    const res2 = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': header2,
        'Content-Length': body2.length.toString(),
        Authorization: `Bearer ${tokenB}`,
      },
      body: body2,
    });

    const fileA = res1.json?.file;
    const fileB = res2.json?.file;

    assert(
      fileA && fileB && fileA.id !== fileB.id,
      'Duplicate filenames created distinct DB records with unique IDs',
      `FileA ID: ${fileA?.id}, FileB ID: ${fileB?.id}`
    );

    assert(
      fileA && fileB && fileA.uniqueFileId !== fileB.uniqueFileId,
      'Duplicate filenames allocated separate uniqueFileIds',
      `FileA uniqueFileId: ${fileA?.uniqueFileId}, FileB uniqueFileId: ${fileB?.uniqueFileId}`
    );

    assert(
      fileA && fileB && fileA.storagePath !== fileB.storagePath,
      'Duplicate filenames isolated in separate tenant storage paths',
      `FileA Path: ${fileA?.storagePath}, FileB Path: ${fileB?.storagePath}`
    );
  }

  // ----------------------------------------------------
  // TEST 7: Path Traversal Defense
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Path Traversal Defense ---');
  {
    // Test 7a: Traversal sequence in uploaded original filename
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { body: travBody, contentTypeHeader: travHeader } = buildMultipartBody(
      'file',
      '../../etc/passwd.png',
      'image/png',
      validPngBuffer
    );

    const resTrav = await httpRequest({
      method: 'POST',
      path: '/api/files/upload',
      headers: {
        'Content-Type': travHeader,
        'Content-Length': travBody.length.toString(),
        Authorization: `Bearer ${tokenA}`,
      },
      body: travBody,
    });

    assert(
      resTrav.statusCode === 400 && (resTrav.body.includes('traversal') || resTrav.body.includes('Invalid')),
      'Upload attempt with path traversal in filename rejected with HTTP 400',
      `Status: ${resTrav.statusCode}, Body: ${resTrav.body}`
    );

    // Test 7b: Path traversal in download endpoint parameter
    const resTravDownload1 = await httpRequest({
      method: 'GET',
      path: '/api/files/download/..%2f..%2fetc%2fpasswd',
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resTravDownload1.statusCode === 400,
      'Encoded path traversal in download parameter (..%2f) rejected with HTTP 400',
      `Status: ${resTravDownload1.statusCode}, Body: ${resTravDownload1.body}`
    );

    const resTravDownload2 = await httpRequest({
      method: 'GET',
      path: '/api/files/download/%2e%2e%2fpackage.json',
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resTravDownload2.statusCode === 400,
      'Dot-encoded path traversal in download parameter (%2e%2e) rejected with HTTP 400',
      `Status: ${resTravDownload2.statusCode}, Body: ${resTravDownload2.body}`
    );
  }

  // ----------------------------------------------------
  // TEST 8: Download Authorization & Cross-Tenant Protection
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Download Authorization & Ownership ---');
  {
    const targetFilename = userAFileRecord?.filename;
    assert(Boolean(targetFilename), 'User A file record available for ownership testing');

    // Test 8a: User A (Owner) downloads their own file -> Should SUCCEED (HTTP 200)
    const resOwnerDownload = await httpRequest({
      method: 'GET',
      path: `/api/files/download/${targetFilename}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resOwnerDownload.statusCode === 200,
      'File owner (User A) successfully downloaded their own file with HTTP 200',
      `Status: ${resOwnerDownload.statusCode}`
    );

    // Verify security headers
    const nosniff = resOwnerDownload.headers['x-content-type-options'];
    assert(
      nosniff === 'nosniff',
      'Download response sets X-Content-Type-Options: nosniff header',
      `Value: ${nosniff}`
    );

    // Test 8b: User B attempts to download User A's private file by filename -> MUST BE REJECTED (HTTP 403 Forbidden)
    const resUnauthorizedDownload = await httpRequest({
      method: 'GET',
      path: `/api/files/download/${targetFilename}`,
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    assert(
      resUnauthorizedDownload.statusCode === 403,
      'User B attempting to download User A private file by filename strictly rejected with HTTP 403 Forbidden',
      `Status: ${resUnauthorizedDownload.statusCode}, Body: ${resUnauthorizedDownload.body}`
    );

    // Test 8b-2: User A downloads own file by File ID (UUID) -> Should SUCCEED (HTTP 200)
    const resOwnerDownloadById = await httpRequest({
      method: 'GET',
      path: `/api/files/download/${userAFileRecord.id}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resOwnerDownloadById.statusCode === 200,
      'File owner (User A) successfully downloaded own file using File Record ID (UUID) with HTTP 200',
      `Status: ${resOwnerDownloadById.statusCode}`
    );

    // Test 8b-3: User B requests User A's File ID (UUID) -> MUST BE REJECTED (HTTP 403 Forbidden)
    const resUnauthorizedDownloadById = await httpRequest({
      method: 'GET',
      path: `/api/files/download/${userAFileRecord.id}`,
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    assert(
      resUnauthorizedDownloadById.statusCode === 403,
      'User B attempting to download User A private file using File ID (UUID) strictly rejected with HTTP 403 Forbidden',
      `Status: ${resUnauthorizedDownloadById.statusCode}, Body: ${resUnauthorizedDownloadById.body}`
    );

    // Test 8c: Unauthenticated user downloads file -> MUST BE REJECTED (HTTP 401 Unauthorized)
    const resAnonDownload = await httpRequest({
      method: 'GET',
      path: `/api/files/download/${targetFilename}`,
    });

    assert(
      resAnonDownload.statusCode === 401,
      'Unauthenticated download attempt strictly rejected with HTTP 401 Unauthorized',
      `Status: ${resAnonDownload.statusCode}`
    );

    // Test 8d: Guessing non-existent file ID -> HTTP 404 Not Found
    const resGuessedDownload = await httpRequest({
      method: 'GET',
      path: '/api/files/download/random_guess_123456789.png',
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resGuessedDownload.statusCode === 404,
      'Guessing non-existent file returned HTTP 404 Not Found',
      `Status: ${resGuessedDownload.statusCode}`
    );

    // Test 8e: Malformed file ID in download -> HTTP 400 Bad Request
    const resMalformedDownload = await httpRequest({
      method: 'GET',
      path: '/api/files/download/malformed!@#$id',
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resMalformedDownload.statusCode === 400,
      'Malformed file ID in download strictly rejected with HTTP 400 Bad Request',
      `Status: ${resMalformedDownload.statusCode}`
    );
  }

  // ----------------------------------------------------
  // TEST 9: Deletion Authorization & Ownership
  // ----------------------------------------------------
  console.log('\n--- TEST 9: Deletion Authorization & Ownership ---');
  {
    const fileId = userAFileRecord?.id;
    assert(Boolean(fileId), 'User A file ID available for deletion authorization test');

    // Test 9a: User B attempts to delete User A's file -> MUST BE REJECTED (HTTP 404 access denied)
    const resUnauthorizedDelete = await httpRequest({
      method: 'DELETE',
      path: `/api/files/${fileId}`,
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    assert(
      resUnauthorizedDelete.statusCode === 404,
      'User B attempting to delete User A file strictly rejected with HTTP 404 / Access Denied',
      `Status: ${resUnauthorizedDelete.statusCode}, Body: ${resUnauthorizedDelete.body}`
    );

    // Test 9b: Confirm User A's file still exists and was NOT deleted by User B
    const resVerifyExisting = await httpRequest({
      method: 'GET',
      path: `/api/files/download/${userAFileRecord.filename}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resVerifyExisting.statusCode === 200,
      'Verified User A file is intact and was NOT deleted or compromised by User B',
      `Status: ${resVerifyExisting.statusCode}`
    );

    // Test 9c: Unauthenticated delete attempt -> MUST BE REJECTED (HTTP 401)
    const resAnonDelete = await httpRequest({
      method: 'DELETE',
      path: `/api/files/${fileId}`,
    });

    assert(
      resAnonDelete.statusCode === 401,
      'Unauthenticated delete attempt rejected with HTTP 401',
      `Status: ${resAnonDelete.statusCode}`
    );

    // Test 9c-2: Malformed file ID in deletion -> HTTP 400 Bad Request
    const resMalformedDelete = await httpRequest({
      method: 'DELETE',
      path: '/api/files/malformed%2e%2eid',
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resMalformedDelete.statusCode === 400,
      'Malformed file ID in deletion strictly rejected with HTTP 400 Bad Request',
      `Status: ${resMalformedDelete.statusCode}`
    );

    // Test 9d: Legitimate deletion by file owner (User A) -> Should SUCCEED (HTTP 200)
    const resOwnerDelete = await httpRequest({
      method: 'DELETE',
      path: `/api/files/${fileId}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resOwnerDelete.statusCode === 200,
      'Legitimate deletion by file owner (User A) succeeded with HTTP 200',
      `Status: ${resOwnerDelete.statusCode}, Body: ${resOwnerDelete.body}`
    );

    // Test 9e: Subsequent download returns 404
    const resPostDeleteDownload = await httpRequest({
      method: 'GET',
      path: `/api/files/download/${userAFileRecord.filename}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert(
      resPostDeleteDownload.statusCode === 404,
      'Deleted file is no longer accessible (HTTP 404)',
      `Status: ${resPostDeleteDownload.statusCode}`
    );
  }

  console.log('\n====================================================');
  console.log(`📊 FILE SECURITY AUDIT SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================');

  if (passedTests === totalTests) {
    console.log('🎉 ALL FILE UPLOAD SECURITY AUDIT TESTS PASSED FLAWLESSLY!\n');
    process.exit(0);
  } else {
    console.error(`💥 ${totalTests - passedTests} TESTS FAILED.`);
    process.exit(1);
  }
}

runAuditTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
