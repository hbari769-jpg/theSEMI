/**
 * AESTIFIC AI — PROMPT 4F
 * CLOUD RUN STORAGE PATH CONSISTENCY & EPHEMERAL STORAGE HARDENING AUDIT
 *
 * Mandatory Verification Matrix:
 * A. Production persistent files use Supabase as authoritative storage.
 * B. Production download does not depend on ephemeral local uploads/.
 * C. Missing local file does not break a valid Supabase-backed download.
 * D. Missing Supabase object returns a safe error.
 * E. Local filesystem cannot override an authoritative remote file.
 * F. Development local-storage behaviour remains compatible.
 * G. Ownership/authorization remains enforced.
 * H. Retention cleanup remains intact.
 * I. No unrelated model/router changes occurred.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '../server/db.js';
import {
  uploadToSupabaseStorage,
  downloadFromSupabase,
  deleteFromSupabaseStorage,
  bulkDeleteFromSupabaseStorage,
  setStorageUploadMock,
  setStorageDeleteMock,
  setStorageDownloadMock,
  getFromSupabaseStorage,
  generateStoragePath,
  UPLOADS_DIR,
} from '../server/supabase-storage.js';
import {
  generateImageWithImagen,
  setImageProviderMock,
} from '../server/image-generator.js';
import { processUploadedFile } from '../server/files.js';
import { analyzeAndRouteRequest } from '../server/smart-router.js';

let totalTests = 0;
let passedTests = 0;

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

async function runStorageHardeningTests() {
  console.log('================================================================');
  console.log('🛡️  AESTIFIC AI: CLOUD RUN STORAGE CONSISTENCY HARDENING (4F)');
  console.log('================================================================\n');

  const originalNodeEnv = process.env.NODE_ENV;
  const originalCreateFile = db.createFileRecord.bind(db);

  // Setup Test User Accounts for isolation testing
  const userA = await db.createUser({
    email: `storage_harden_a_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@aestific.test`,
    name: 'Storage Harden User A',
    passwordHash: 'dummy_hash_a',
    memoryEnabled: false,
    isEmailVerified: true,
  });

  const userB = await db.createUser({
    email: `storage_harden_b_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@aestific.test`,
    name: 'Storage Harden User B',
    passwordHash: 'dummy_hash_b',
    memoryEnabled: false,
    isEmailVerified: true,
  });

  const userAId = userA.id;
  const userBId = userB.id;

  // ---------------------------------------------------------------------------
  // REQUIREMENT A: Production persistent files use Supabase as authoritative storage
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION A: Production Persistent Files Use Supabase As Authoritative Storage ---');
  {
    process.env.NODE_ENV = 'production';
    let supabaseUploadPayload: any = null;

    setStorageUploadMock(async (opts) => {
      supabaseUploadPayload = opts;
      return {
        success: true,
        storageProvider: 'supabase',
        bucketName: 'aestific',
        storagePath: opts.storagePath || `users/${opts.userId}/${opts.uniqueFileId}`,
        uniqueFileId: opts.uniqueFileId || 'mock_file.png',
        sizeBytes: 8,
        url: `/api/files/download/${opts.uniqueFileId}`,
      };
    });

    const tempUploadPath = path.join(UPLOADS_DIR, `temp_prod_upload_${Date.now()}.png`);
    fs.writeFileSync(tempUploadPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const uploaded = await processUploadedFile(
      {
        fieldname: 'file',
        originalname: 'production_sample.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 8,
        destination: UPLOADS_DIR,
        filename: path.basename(tempUploadPath),
        path: tempUploadPath,
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      } as Express.Multer.File,
      userAId
    );

    assert(Boolean(uploaded && uploaded.id), 'A.1: Upload returns valid database FileRecord in production');
    assert(uploaded.storageProvider === 'supabase', 'A.2: FileRecord storageProvider is strictly "supabase"');
    assert(
      Boolean(uploaded.storagePath && uploaded.storagePath.startsWith(`users/${userAId}/`)),
      'A.3: FileRecord storagePath is user-scoped and in Supabase',
      uploaded.storagePath
    );
    assert(
      Boolean(supabaseUploadPayload && supabaseUploadPayload.userId === userAId),
      'A.4: Supabase storage upload was executed with user payload'
    );

    // Test generated image
    setImageProviderMock(async () => ({
      result: {
        imageBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        mimeType: 'image/png',
        providerModel: 'Mock Provider',
      },
      providerName: 'Mock Provider',
    }));

    let imageUploadPayload: any = null;
    setStorageUploadMock(async (opts) => {
      imageUploadPayload = opts;
      return {
        success: true,
        storageProvider: 'supabase',
        bucketName: 'aestific',
        storagePath: opts.storagePath || `users/${opts.userId}/${opts.uniqueFileId}`,
        uniqueFileId: opts.uniqueFileId || 'gen_img.png',
        sizeBytes: 8,
        url: `/api/files/download/${opts.uniqueFileId}`,
      };
    });

    const generated = await generateImageWithImagen({
      userId: userAId,
      prompt: 'Minimalist architecture in morning fog',
    });

    assert(Boolean(generated && generated.id), 'A.5: Generated image returns valid FileRecord in production');
    assert(generated.storageProvider === 'supabase', 'A.6: Generated image storageProvider is "supabase"');
    assert(
      Boolean(generated.storagePath && generated.storagePath.startsWith(`users/${userAId}/`)),
      'A.7: Generated image storagePath is user-scoped in Supabase Storage'
    );
    assert(
      Boolean(imageUploadPayload && imageUploadPayload.userId === userAId),
      'A.8: Generated image buffer was synchronously uploaded to Supabase'
    );

    // Database rejects local-dev or missing storagePath in production
    let rejectedLocalDev = false;
    try {
      await db.createFileRecord({
        userId: userAId,
        storageProvider: 'supabase',
        bucketName: 'local-dev',
        storagePath: 'temp/file.png',
        uniqueFileId: 'temp.png',
        filename: 'temp.png',
        originalName: 'temp.png',
        type: 'image',
        mimeType: 'image/png',
        sizeBytes: 10,
        url: '/api/files/download/temp.png',
      });
    } catch {
      rejectedLocalDev = true;
    }
    assert(rejectedLocalDev, 'A.9: Database rejects creating FileRecord with bucket "local-dev" in production');

    setImageProviderMock(null);
    setStorageUploadMock(null);
  }

  // ---------------------------------------------------------------------------
  // REQUIREMENT B: Production download does not depend on ephemeral local uploads/
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION B: Production Download Does Not Depend on Local uploads/ ---');
  {
    process.env.NODE_ENV = 'production';

    const uniqueFileId = `prod_download_test_${Date.now()}.png`;
    const storagePath = `users/${userAId}/${uniqueFileId}`;
    const fileContent = Buffer.from('AUTHORITATIVE_SUPABASE_BUFFER_CONTENT_12345');

    // Ensure local file DOES NOT exist
    const localDiskPath = path.join(UPLOADS_DIR, uniqueFileId);
    if (fs.existsSync(localDiskPath)) fs.unlinkSync(localDiskPath);
    assert(!fs.existsSync(localDiskPath), 'B.1: Local file does not exist on disk in uploads/');

    // Configure mock to simulate remote Supabase Storage
    setStorageDownloadMock(async (sP) => {
      if (sP === storagePath) {
        return fileContent;
      }
      return null;
    });

    const result = await getFromSupabaseStorage(storagePath, uniqueFileId);
    assert(Boolean(result.buffer), 'B.2: getFromSupabaseStorage succeeds without local file');
    assert(
      result.buffer !== null && result.buffer.equals(fileContent),
      'B.3: Returned buffer matches authoritative remote content exactly'
    );
    assert(result.fromSupabase === true, 'B.4: Result confirms retrieval directly from Supabase Storage');

    setStorageDownloadMock(null);
  }

  // ---------------------------------------------------------------------------
  // REQUIREMENT C: Missing local file does not break a valid Supabase-backed download
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION C: Missing Local File Does Not Break Valid Supabase Download ---');
  {
    process.env.NODE_ENV = 'production';

    const testId = `coldstart_${Date.now()}.pdf`;
    const storagePath = `users/${userAId}/${testId}`;
    const pdfContent = Buffer.from('%PDF-1.4 Authoritative Cold Start Cloud Run Test Payload');

    // Confirm completely absent from local filesystem
    const diskPath = path.join(UPLOADS_DIR, testId);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    assert(!fs.existsSync(diskPath), 'C.1: File is absent from ephemeral disk (simulating instance restart)');

    setStorageDownloadMock(async (pathParam) => {
      if (pathParam === storagePath) return pdfContent;
      return null;
    });

    const downloaded = await downloadFromSupabase(storagePath, testId, 'aestific');
    assert(Boolean(downloaded), 'C.2: downloadFromSupabase returns buffer despite missing local file');
    assert(
      downloaded !== null && downloaded.equals(pdfContent),
      'C.3: Downloaded content is byte-for-byte identical to remote object'
    );

    setStorageDownloadMock(null);
  }

  // ---------------------------------------------------------------------------
  // REQUIREMENT D: Missing Supabase object returns a safe error
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION D: Missing Supabase Object Returns Safe Error ---');
  {
    process.env.NODE_ENV = 'production';

    const missingId = `nonexistent_${Date.now()}.png`;
    const missingStoragePath = `users/${userAId}/${missingId}`;

    // Ensure mock returns null for missing object
    setStorageDownloadMock(async () => null);

    // Also place an accidental local file with same name on disk to verify it is NOT silently returned
    const accidentalLocalDisk = path.join(UPLOADS_DIR, missingId);
    fs.writeFileSync(accidentalLocalDisk, Buffer.from('ACCIDENTAL_LOCAL_LEAK'));

    const res = await getFromSupabaseStorage(missingStoragePath, missingId);
    assert(res.buffer === null, 'D.1: getFromSupabaseStorage returns null buffer for missing Supabase object');
    assert(res.fromSupabase === false, 'D.2: fromSupabase is false');

    // Clean up accidental file
    if (fs.existsSync(accidentalLocalDisk)) fs.unlinkSync(accidentalLocalDisk);

    // Verify safe download return
    const downloadedMissing = await downloadFromSupabase(missingStoragePath, missingId, 'aestific');
    assert(downloadedMissing === null, 'D.3: downloadFromSupabase safely returns null for absent remote object');

    setStorageDownloadMock(null);
  }

  // ---------------------------------------------------------------------------
  // REQUIREMENT E: Local filesystem cannot override an authoritative remote file
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION E: Local Filesystem Cannot Override Remote File in Production ---');
  {
    process.env.NODE_ENV = 'production';

    const targetId = `conflict_test_${Date.now()}.png`;
    const targetStoragePath = `users/${userAId}/${targetId}`;

    const authoritativeContent = Buffer.from('AUTHORITATIVE_REMOTE_SUPABASE_DATA');
    const accidentalLocalContent = Buffer.from('ACCIDENTAL_STALE_LOCAL_DISK_DATA');

    // Write accidental/stale file to local uploads directory
    const localDiskPath = path.join(UPLOADS_DIR, targetId);
    fs.writeFileSync(localDiskPath, accidentalLocalContent);
    assert(fs.existsSync(localDiskPath), 'E.1: Stale local file exists on disk');

    // Supabase has authoritative data
    setStorageDownloadMock(async (pathParam) => {
      if (pathParam === targetStoragePath) return authoritativeContent;
      return null;
    });

    const result = await getFromSupabaseStorage(targetStoragePath, targetId);

    assert(Boolean(result.buffer), 'E.2: File retrieved successfully');
    assert(
      result.buffer !== null && result.buffer.equals(authoritativeContent),
      'E.3: Retrieved buffer strictly matches AUTHORITATIVE remote content, NOT stale local disk'
    );
    assert(
      result.buffer !== null && !result.buffer.equals(accidentalLocalContent),
      'E.4: Accidental local file was strictly prevented from overriding remote storage'
    );

    // Clean up
    if (fs.existsSync(localDiskPath)) fs.unlinkSync(localDiskPath);
    setStorageDownloadMock(null);
  }

  // ---------------------------------------------------------------------------
  // REQUIREMENT F: Development local-storage behaviour remains compatible
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION F: Development Local-Storage Behaviour Remains Compatible ---');
  {
    process.env.NODE_ENV = 'development';

    const devFileId = `dev_compat_${Date.now()}.png`;
    const devStoragePath = `users/${userAId}/${devFileId}`;
    const devContent = Buffer.from('DEVELOPMENT_LOCAL_DISK_CONTENT');

    const devDiskPath = path.join(UPLOADS_DIR, devFileId);
    fs.writeFileSync(devDiskPath, devContent);
    assert(fs.existsSync(devDiskPath), 'F.1: Local disk file created in dev environment');

    // In development with no Supabase mock/remote available, it should fall back to local disk
    setStorageDownloadMock(async () => null);

    const devResult = await getFromSupabaseStorage(devStoragePath, devFileId);
    assert(Boolean(devResult.buffer), 'F.2: Development mode successfully falls back to local disk cache');
    assert(
      devResult.buffer !== null && devResult.buffer.equals(devContent),
      'F.3: Development result contains correct local file content'
    );
    assert(devResult.fromSupabase === false, 'F.4: Dev mode accurately flags fromSupabase: false for local cache');

    // Clean up
    if (fs.existsSync(devDiskPath)) fs.unlinkSync(devDiskPath);
    setStorageDownloadMock(null);
    process.env.NODE_ENV = 'production';
  }

  // ---------------------------------------------------------------------------
  // REQUIREMENT G: Ownership/authorization remains enforced
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION G: Ownership and Tenant Isolation Enforced ---');
  {
    process.env.NODE_ENV = 'production';

    setStorageUploadMock(async (opts) => ({
      success: true,
      storageProvider: 'supabase',
      bucketName: 'aestific',
      storagePath: opts.storagePath || `users/${opts.userId}/${opts.uniqueFileId}`,
      uniqueFileId: opts.uniqueFileId || 'iso_test.png',
      sizeBytes: 8,
      url: `/api/files/download/${opts.uniqueFileId}`,
    }));

    const userAStaging = path.join(UPLOADS_DIR, `temp_iso_a_${Date.now()}.png`);
    fs.writeFileSync(userAStaging, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const fileA = await processUploadedFile(
      {
        fieldname: 'file',
        originalname: 'user_a_private.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 8,
        destination: UPLOADS_DIR,
        filename: path.basename(userAStaging),
        path: userAStaging,
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      } as Express.Multer.File,
      userAId
    );

    // User A can access their file
    const fileRecordA = await db.getFileById(fileA.id, userAId);
    assert(Boolean(fileRecordA && fileRecordA.id === fileA.id), 'G.1: User A can access their own FileRecord');

    // User B CANNOT access User A's file
    const fileRecordB = await db.getFileById(fileA.id, userBId);
    assert(fileRecordB === null, 'G.2: User B CANNOT access User A FileRecord (null returned)');

    // User B CANNOT delete User A's file
    const deleteAttempt = await db.deleteFileRecord(fileA.id, userBId);
    assert(!deleteAttempt, 'G.3: User B CANNOT delete User A FileRecord');

    // Clean up
    await db.deleteFileRecord(fileA.id, userAId);
    setStorageUploadMock(null);
  }

  // ---------------------------------------------------------------------------
  // REQUIREMENT H: Retention cleanup remains intact
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION H: 30-Day Retention Cleanup Operates Across Storage ---');
  {
    process.env.NODE_ENV = 'production';

    const testRetentionPath = `users/${userAId}/retention_test_${Date.now()}.png`;
    const testLocalDisk = path.join(UPLOADS_DIR, path.basename(testRetentionPath));
    fs.writeFileSync(testLocalDisk, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const bulkRes = await bulkDeleteFromSupabaseStorage([
      { storagePath: testRetentionPath, uniqueFileId: path.basename(testRetentionPath) },
    ]);

    assert(bulkRes.deletedCount >= 1, 'H.1: bulkDeleteFromSupabaseStorage reports deleted count >= 1');
    assert(!fs.existsSync(testLocalDisk), 'H.2: Local disk remnants expunged during retention cleanup');
  }

  // ---------------------------------------------------------------------------
  // REQUIREMENT I: No unrelated model/router changes occurred
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION I: Smart Router Architecture Untouched & Functional ---');
  {
    const r1 = analyzeAndRouteRequest('Hello, how are you?');
    assert(
      r1.category === 'default_simple' && r1.modelId === 'gemini-3.1-flash-lite',
      'I.1: Casual greeting routes to gemini-3.1-flash-lite'
    );

    const r2 = analyzeAndRouteRequest('Write a Python binary search implementation and explain its complexity.');
    assert(
      r2.category === 'coding_reasoning' && r2.modelId === 'deepseek-v4-flash',
      'I.2: Coding task routes to deepseek-v4-flash'
    );

    const r3 = analyzeAndRouteRequest('Prove that sqrt(2) is irrational using a formal proof by contradiction.');
    assert(
      r3.category === 'hard_reasoning' && r3.modelId === 'gemini-3.1-pro-preview',
      'I.3: Mathematical proof routes to gemini-3.1-pro-preview'
    );

    const r4 = analyzeAndRouteRequest('What is the latest stock price of NVIDIA today?');
    assert(
      r4.category === 'web_research' && r4.requiresWebSearch === true,
      'I.4: Real-time query triggers web search routing'
    );

    const r5 = analyzeAndRouteRequest('Draw a futuristic cyberpunk city in neon lights.');
    assert(
      r5.category === 'image_generation' && r5.isImageRequest === true,
      'I.5: Image generation request routes to image model'
    );
  }

  // Restore environment
  process.env.NODE_ENV = originalNodeEnv;
  db.createFileRecord = originalCreateFile;

  try {
    await db.deleteUser(userAId);
    await db.deleteUser(userBId);
  } catch {}

  console.log('\n================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('✨ ALL CLOUD RUN STORAGE PATH CONSISTENCY INVARIANTS PASSED!\n');
    process.exit(0);
  } else {
    console.error(`❌ ${totalTests - passedTests} CHECKS FAILED.\n`);
    process.exit(1);
  }
}

runStorageHardeningTests().catch((err) => {
  console.error('Fatal error during storage hardening tests:', err);
  process.exit(1);
});
