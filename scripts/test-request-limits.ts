/**
 * Comprehensive Request Body Limit & Hardening Test Suite
 * 
 * Verifies:
 * 1. Normal API request (small JSON payload <= 100KB) succeeds
 * 2. Large invalid request (> 100KB on standard endpoint) rejected with HTTP 413
 * 3. Legitimate upload (multipart form data within limits) is accepted
 * 4. Oversized upload (> 50MB file upload or > 25MB audio upload) rejected with HTTP 413
 * 5. Malformed body (invalid JSON syntax) cleanly rejected with HTTP 400
 * 6. Chat stream endpoint accommodates rich context (> 100KB up to 10MB) but rejects > 10MB
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:3000';

function doRequest(options: http.RequestOptions, body?: Buffer | string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log('========================================================');
  console.log('RUNNING REQUEST BODY LIMITS & HARDENING TEST SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (detail) console.error(`   Details: ${detail}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Normal API request with small standard JSON (< 100KB)
  // ----------------------------------------------------
  console.log('[TEST 1] Normal API Request (Small JSON Body)');
  try {
    const normalPayload = JSON.stringify({
      email: `test_user_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      name: 'Standard User',
    });

    const res = await doRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(normalPayload),
      },
    }, normalPayload);

    // Should succeed or return 400 (if email already registered) but NOT 413
    assert(res.status === 200 || res.status === 201 || res.status === 400, 'Standard small JSON request processed without 413', `Status: ${res.status}, body: ${res.body.slice(0, 100)}`);
  } catch (err: any) {
    assert(false, 'Standard small JSON request failed unexpectedly', err.message);
  }

  // ----------------------------------------------------
  // TEST 2: Large Invalid Request to Standard API (> 100KB JSON)
  // ----------------------------------------------------
  console.log('\n[TEST 2] Large Invalid Request to Standard API (> 100KB JSON Body)');
  try {
    // Generate a 250KB JSON payload (exceeds 100KB standard limit)
    const largeData = 'A'.repeat(250 * 1024);
    const oversizedPayload = JSON.stringify({
      email: 'attacker@example.com',
      password: 'password',
      largePadding: largeData,
    });
    const payloadLength = Buffer.byteLength(oversizedPayload);

    const res = await doRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payloadLength,
      },
    }, oversizedPayload);

    assert(res.status === 413, 'Oversized JSON to standard API rejected with HTTP 413 Payload Too Large', `Status: ${res.status}, response: ${res.body}`);
    const json = JSON.parse(res.body);
    assert(json.code === 'PAYLOAD_TOO_LARGE' || json.error.includes('Payload Too Large') || json.error.includes('100KB'), 'Clean descriptive error message returned for 413', json.error);
  } catch (err: any) {
    assert(false, 'Large invalid request test failed with error', err.message);
  }

  // ----------------------------------------------------
  // TEST 3: Large Invalid Chunked Request (No Content-Length Header)
  // ----------------------------------------------------
  console.log('\n[TEST 3] Large Invalid Chunked Request (> 100KB Chunked Stream)');
  try {
    // Send 150KB without Content-Length (streamed chunks)
    const largeChunk = 'B'.repeat(150 * 1024);
    const chunkedPayload = JSON.stringify({ padding: largeChunk });

    const res = await doRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
      },
    }, chunkedPayload);

    assert(res.status === 413, 'Chunked oversized payload rejected with HTTP 413 by streaming reader', `Status: ${res.status}`);
  } catch (err: any) {
    assert(false, 'Chunked large invalid request test failed with error', err.message);
  }

  // ----------------------------------------------------
  // TEST 4: Malformed JSON Body (Syntax Error)
  // ----------------------------------------------------
  console.log('\n[TEST 4] Malformed JSON Body (Syntax Error)');
  try {
    const malformedPayload = '{"email": "broken_user@example.com", "password": '; // Incomplete syntax

    const res = await doRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(malformedPayload),
      },
    }, malformedPayload);

    assert(res.status === 400, 'Malformed JSON rejected with HTTP 400 Bad Request', `Status: ${res.status}, response: ${res.body}`);
    const json = JSON.parse(res.body);
    assert(json.code === 'MALFORMED_JSON' || json.error.toLowerCase().includes('json'), 'Clean error response returned for malformed JSON', json.error);
  } catch (err: any) {
    assert(false, 'Malformed body test failed with error', err.message);
  }

  // ----------------------------------------------------
  // TEST 5: Legitimate Upload Endpoint Separation
  // ----------------------------------------------------
  console.log('\n[TEST 5] Legitimate Upload Endpoint Separation (Multipart Form Data)');
  try {
    // Upload endpoint should NOT use standard 100KB JSON parser.
    // A 500KB legitimate file upload should reach multer / auth middleware.
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fileContent = 'Aestific sample document text content.\n'.repeat(5000); // ~200KB
    
    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="sample_document.txt"\r\n`;
    body += `Content-Type: text/plain\r\n\r\n`;
    body += fileContent;
    body += `\r\n--${boundary}--\r\n`;

    const bodyBuffer = Buffer.from(body, 'utf-8');

    const res = await doRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/files/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
      },
    }, bodyBuffer);

    // Since unauthenticated, should return 401 Authentication required,
    // which proves it cleanly bypassed the 100KB JSON limit and reached the route!
    assert(res.status === 401, 'Legitimate 200KB upload successfully reaches route without 413 rejection', `Status: ${res.status}`);
  } catch (err: any) {
    assert(false, 'Legitimate upload test failed with error', err.message);
  }

  // ----------------------------------------------------
  // TEST 6: Oversized Upload Rejection (> 55MB Pre-Flight Header)
  // ----------------------------------------------------
  console.log('\n[TEST 6] Oversized Upload Rejection (> 55MB Pre-flight Check)');
  try {
    // Attacker announces a 60MB file in Content-Length
    const oversizedLength = 60 * 1024 * 1024; // 60MB

    const res = await doRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/files/upload',
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----WebKitBoundaryExample',
        'Content-Length': oversizedLength,
      },
    });

    assert(res.status === 413, 'Oversized file upload pre-flight rejected with HTTP 413 before disk allocation', `Status: ${res.status}, response: ${res.body}`);
    const json = JSON.parse(res.body);
    assert(json.code === 'PAYLOAD_TOO_LARGE' || json.error.includes('Payload Too Large'), 'Descriptive 413 error returned for oversized upload', json.error);
  } catch (err: any) {
    assert(false, 'Oversized upload test failed with error', err.message);
  }

  // ----------------------------------------------------
  // TEST 7: Oversized Voice Recording Rejection (> 28MB Pre-Flight)
  // ----------------------------------------------------
  console.log('\n[TEST 7] Oversized Voice Recording Rejection (> 28MB Pre-flight Check)');
  try {
    const oversizedVoiceLength = 30 * 1024 * 1024; // 30MB (exceeds 28MB voice ceiling)

    const res = await doRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/voice/transcribe',
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----WebKitVoiceBoundary',
        'Content-Length': oversizedVoiceLength,
      },
    });

    assert(res.status === 413, 'Oversized voice upload pre-flight rejected with HTTP 413', `Status: ${res.status}, response: ${res.body}`);
  } catch (err: any) {
    assert(false, 'Oversized voice test failed with error', err.message);
  }

  // ----------------------------------------------------
  // TEST 8: Chat Stream Endpoint Legitimate Rich Payload (> 100KB up to 10MB)
  // ----------------------------------------------------
  console.log('\n[TEST 8] Chat Stream Rich Payload Handling (> 100KB Context Allowed)');
  try {
    // Rich prompt / PDF context with 500KB of text
    const richContext = 'Relevant document context chunk. '.repeat(15000); // ~500KB
    const chatPayload = JSON.stringify({
      conversationId: 'mock-conv-id',
      message: 'Summarize the attached context',
      documentContext: richContext,
    });

    const res = await doRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/chat/stream',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(chatPayload),
      },
    }, chatPayload);

    // Unauthenticated request returns 401, which proves 500KB payload was NOT blocked by standard 100KB limit!
    assert(res.status === 401, 'Chat stream accepts 500KB rich context without 413 rejection', `Status: ${res.status}`);
  } catch (err: any) {
    assert(false, 'Chat stream rich payload test failed with error', err.message);
  }

  // ----------------------------------------------------
  // TEST 9: Chat Stream Endpoint Oversized Payload Rejection (> 10MB)
  // ----------------------------------------------------
  console.log('\n[TEST 9] Chat Stream Endpoint Oversized Payload Rejection (> 10MB)');
  try {
    // 12MB declared content length
    const oversizedChatLength = 12 * 1024 * 1024;

    const res = await doRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/chat/stream',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': oversizedChatLength,
      },
    });

    assert(res.status === 413, 'Chat stream payload > 10MB rejected with HTTP 413', `Status: ${res.status}`);
  } catch (err: any) {
    assert(false, 'Chat stream oversized test failed with error', err.message);
  }

  console.log('\n========================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
