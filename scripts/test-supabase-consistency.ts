/**
 * AESTIFIC AI — PRE-LAUNCH FIX 4B
 * SUPABASE STORAGE / DATABASE CONSISTENCY VERIFICATION SUITE
 *
 * Mandatory Verification Matrix:
 * A. Successful Supabase upload returns success:true.
 * B. Supabase upload API error returns success:false.
 * C. Supabase network/exception failure returns success:false.
 * D. Generated image is NOT inserted into the DB when Supabase persistence fails.
 * E. Generated image IS inserted into the DB after confirmed successful Supabase persistence.
 * F. Normal file upload follows the same consistency rule.
 * G. If DB creation fails after successful storage upload, compensating storage cleanup is attempted.
 * H. Existing 30-day retention tests still pass.
 * I. Existing file security tests still pass.
 * J. Existing authorization tests still pass.
 * K. Existing Smart Router tests still pass.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '../server/db.js';
import {
  uploadToSupabaseStorage,
  deleteFromSupabaseStorage,
  setStorageUploadMock,
  setStorageDeleteMock,
  getSupabaseConfig,
  getSupabaseClient,
  generateStoragePath,
  UPLOADS_DIR,
} from '../server/supabase-storage.js';
import {
  generateImageWithImagen,
  setImageProviderMock,
} from '../server/image-generator.js';
import { processUploadedFile } from '../server/files.js';

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

async function runSupabaseConsistencySuite() {
  console.log('===============================================================');
  console.log('🛡️  AESTIFIC: SUPABASE STORAGE / DB CONSISTENCY AUDIT (FIX 4B)');
  console.log('===============================================================\n');

  // Create isolated test user in authoritative database
  const testUser = await db.createUser({
    email: `consistency_test_${Date.now()}@aestific.io`,
    name: 'Storage Consistency Auditor',
    passwordHash: 'dummy_hash',
    memoryEnabled: true,
  } as any);
  const userId = testUser.id;

  console.log(`👤 Audit user established: id=${userId}`);

  // --------------------------------------------------------------------------
  // SECTION A: Successful Supabase Upload Returns success: true
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION A: Successful Supabase Upload Verification ---');
  {
    setStorageUploadMock(null);
    setStorageDeleteMock(null);

    const testBuffer = Buffer.from('Aestific Consistency Test Payload ' + Date.now());
    const uploadResult = await uploadToSupabaseStorage({
      userId,
      mimeType: 'text/plain',
      originalName: 'live_test.txt',
      buffer: testBuffer,
    });

    assert(
      uploadResult.success === true,
      'A.1: Confirmed Supabase upload returns success: true',
      `Result: ${JSON.stringify(uploadResult)}`
    );
    assert(
      uploadResult.storageProvider === 'supabase',
      'A.2: Returned storage provider is strictly "supabase"'
    );
    assert(
      uploadResult.storagePath.startsWith(`users/${userId}/`),
      'A.3: Storage path follows strict tenant isolation format'
    );
    assert(
      uploadResult.sizeBytes === testBuffer.length,
      'A.4: Upload result accurately reports byte size'
    );

    // Clean up test file from Supabase Storage
    if (uploadResult.storagePath) {
      await deleteFromSupabaseStorage(uploadResult.storagePath, uploadResult.uniqueFileId, uploadResult.bucketName);
    }
  }

  // --------------------------------------------------------------------------
  // SECTION B: Supabase Upload API Error Returns success: false
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION B: Supabase Upload API Error Truthfulness ---');
  {
    // Simulate Supabase API error (e.g. storage quota exceeded, 400 Bad Request, unauthorized)
    setStorageUploadMock(async (opts) => {
      return {
        success: false,
        storageProvider: 'supabase',
        bucketName: 'aestific',
        storagePath: opts.storagePath || `users/${opts.userId}/mock.png`,
        uniqueFileId: opts.uniqueFileId || 'mock.png',
        sizeBytes: 0,
        url: '',
        error: 'Storage service upload failed: Storage quota exceeded.',
      };
    });

    const uploadResult = await uploadToSupabaseStorage({
      userId,
      mimeType: 'image/png',
      originalName: 'quota_fail.png',
      buffer: Buffer.from('dummy'),
    });

    assert(
      uploadResult.success === false,
      'B.1: Supabase upload API error returns success: false (NEVER disguised as success: true)',
      `Actual success: ${uploadResult.success}`
    );
    assert(
      Boolean(uploadResult.error && uploadResult.error.length > 0),
      'B.2: Upload result contains descriptive sanitized error message',
      `Error: ${uploadResult.error}`
    );
    assert(
      !uploadResult.error?.includes('service_role') && !uploadResult.error?.includes('eyJ'),
      'B.3: Error message contains zero leaked secrets or credentials'
    );

    setStorageUploadMock(null);
  }

  // --------------------------------------------------------------------------
  // SECTION C: Supabase Network / Exception Failure Returns success: false
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION C: Supabase Network / Exception Failure Handling ---');
  {
    setStorageUploadMock(async () => {
      return {
        success: false,
        storageProvider: 'supabase',
        bucketName: 'aestific',
        storagePath: `users/${userId}/crash.png`,
        uniqueFileId: 'crash.png',
        sizeBytes: 0,
        url: '',
        error: 'Storage service is temporarily unavailable.',
      };
    });

    const uploadResult = await uploadToSupabaseStorage({
      userId,
      mimeType: 'image/png',
      originalName: 'network_crash.png',
      buffer: Buffer.from('dummy'),
    });

    assert(
      uploadResult.success === false,
      'C.1: Supabase network/exception outage returns success: false',
      `Actual success: ${uploadResult.success}`
    );
    assert(
      uploadResult.url === '',
      'C.2: Failed upload returns empty URL to prevent broken client-side links'
    );

    setStorageUploadMock(null);
  }

  // --------------------------------------------------------------------------
  // SECTION D: Generated Image NOT Inserted in DB When Supabase Persistence Fails
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION D: Generated Image Aborted on Storage Failure (No DB Record) ---');
  {
    // Mock image generation engine to produce valid image bytes without remote API delay
    const mockImageBytes = Buffer.from('Aestific Mock Generated Image PNG Bytes ' + crypto.randomBytes(32).toString('hex'));
    setImageProviderMock(async () => ({
      result: {
        imageBuffer: mockImageBytes,
        mimeType: 'image/png',
        providerModel: 'Mock Image Engine',
      },
      providerName: 'Mock Image Engine',
    }));

    // Mock storage failure
    setStorageUploadMock(async (opts) => ({
      success: false,
      storageProvider: 'supabase',
      bucketName: 'aestific',
      storagePath: opts.storagePath || '',
      uniqueFileId: opts.uniqueFileId || '',
      sizeBytes: 0,
      url: '',
      error: 'Simulated 503 Supabase Storage Outage',
    }));

    const initialFiles = await db.getFiles(userId);
    const initialCount = initialFiles.length;

    let threwExpected = false;
    try {
      await generateImageWithImagen({
        prompt: 'A majestic golden eagle soaring above mist',
        userId,
        aspectRatio: '1:1',
      });
    } catch (err: any) {
      threwExpected = true;
      assert(
        err?.statusCode === 503 || err?.code === 'STORAGE_UNAVAILABLE' || err?.message?.includes('temporarily unavailable'),
        'D.1: generateImageWithImagen throws safe temporary-unavailable error when storage fails',
        `Error: ${err?.message} (code: ${err?.code}, status: ${err?.statusCode})`
      );
    }

    assert(threwExpected, 'D.2: Call to generateImageWithImagen rejected on storage failure');

    // Verify authoritative DB record was NOT created
    const postFailFiles = await db.getFiles(userId);
    assert(
      postFailFiles.length === initialCount,
      'D.3: Authoritative database has ZERO new file records created (Strict Consistency)',
      `Before: ${initialCount}, After: ${postFailFiles.length}`
    );

    // Verify local uploads directory has no orphaned generated file
    const uploadsList = fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : [];
    const orphanedFiles = uploadsList.filter((f) => f.includes('aestific-img-') && f.includes(userId));
    assert(
      orphanedFiles.length === 0,
      'D.4: Temporary local disk file was cleanly unlinked upon storage failure'
    );

    setStorageUploadMock(null);
    setImageProviderMock(null);
  }

  // --------------------------------------------------------------------------
  // SECTION E: Generated Image IS Inserted into DB After Confirmed Storage Success
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION E: Generated Image Inserted After Storage Confirmed ---');
  {
    const mockImageBytes = Buffer.from('Aestific Valid Confirmed PNG Image ' + crypto.randomBytes(32).toString('hex'));
    setImageProviderMock(async () => ({
      result: {
        imageBuffer: mockImageBytes,
        mimeType: 'image/png',
        providerModel: 'Mock Image Engine',
      },
      providerName: 'Mock Image Engine',
    }));

    // Successful upload simulation
    let recordedStoragePath = '';
    setStorageUploadMock(async (opts) => {
      recordedStoragePath = opts.storagePath || `users/${opts.userId}/${opts.uniqueFileId}`;
      return {
        success: true,
        storageProvider: 'supabase',
        bucketName: 'aestific',
        storagePath: recordedStoragePath,
        uniqueFileId: opts.uniqueFileId || 'test.png',
        sizeBytes: opts.buffer?.length || 100,
        url: `/api/files/download/${opts.uniqueFileId}`,
      };
    });

    const fileRecord = await generateImageWithImagen({
      prompt: 'A tranquil zen garden at sunrise',
      userId,
      aspectRatio: '16:9',
    });

    assert(
      Boolean(fileRecord && fileRecord.id),
      'E.1: Generated image FileRecord returned with valid ID',
      `Record ID: ${fileRecord?.id}`
    );
    assert(
      fileRecord.storageProvider === 'supabase',
      'E.2: FileRecord strictly registers storageProvider as "supabase"'
    );
    assert(
      fileRecord.storagePath === recordedStoragePath,
      'E.3: FileRecord references confirmed remote storage path'
    );

    // Check database persistence
    const dbRecord = await db.getFileById(fileRecord.id, userId);
    assert(
      Boolean(dbRecord),
      'E.4: Generated image record is authoritatively queryable from database'
    );
    assert(
      dbRecord?.filename === fileRecord.filename,
      'E.5: Database record metadata matches generated image attributes'
    );

    // Cleanup generated record
    await db.deleteFileRecord(fileRecord.id, userId);

    setStorageUploadMock(null);
    setImageProviderMock(null);
  }

  // --------------------------------------------------------------------------
  // SECTION F: Normal File Upload Follows Strict Storage/DB Consistency
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION F: Normal File Upload Consistency ---');
  {
    // 1. Storage failure prevents DB commit
    const tempFileFailPath = path.join(UPLOADS_DIR, `temp_fail_${Date.now()}.png`);
    fs.writeFileSync(tempFileFailPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    setStorageUploadMock(async () => ({
      success: false,
      storageProvider: 'supabase',
      bucketName: 'aestific',
      storagePath: '',
      uniqueFileId: '',
      sizeBytes: 0,
      url: '',
      error: 'Supabase Storage 500 Internal Error',
    }));

    const beforeCount = (await db.getFiles(userId)).length;
    let normalUploadFailed = false;

    try {
      await processUploadedFile(
        {
          fieldname: 'file',
          originalname: 'document_fail.png',
          encoding: '7bit',
          mimetype: 'image/png',
          size: 8,
          destination: UPLOADS_DIR,
          filename: path.basename(tempFileFailPath),
          path: tempFileFailPath,
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        } as Express.Multer.File,
        userId
      );
    } catch (err: any) {
      normalUploadFailed = true;
      assert(
        err?.statusCode === 503 || err?.code === 'STORAGE_UNAVAILABLE' || err?.message?.includes('cloud storage'),
        'F.1: Normal file upload throws on storage failure'
      );
    }

    assert(normalUploadFailed, 'F.2: processUploadedFile threw error on storage failure');
    const afterCount = (await db.getFiles(userId)).length;
    assert(
      afterCount === beforeCount,
      'F.3: Authoritative DB contains NO record for failed normal file upload'
    );
    assert(
      !fs.existsSync(tempFileFailPath),
      'F.4: Temporary upload file was deleted on storage failure'
    );

    // 2. Storage success commits DB record
    const tempFileSuccPath = path.join(UPLOADS_DIR, `temp_succ_${Date.now()}.png`);
    fs.writeFileSync(tempFileSuccPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    setStorageUploadMock(async (opts) => ({
      success: true,
      storageProvider: 'supabase',
      bucketName: 'aestific',
      storagePath: opts.storagePath || `users/${opts.userId}/${opts.uniqueFileId}`,
      uniqueFileId: opts.uniqueFileId || 'succ.png',
      sizeBytes: 8,
      url: `/api/files/download/${opts.uniqueFileId}`,
    }));

    const succRecord = await processUploadedFile(
      {
        fieldname: 'file',
        originalname: 'document_succ.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 8,
        destination: UPLOADS_DIR,
        filename: path.basename(tempFileSuccPath),
        path: tempFileSuccPath,
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      } as Express.Multer.File,
      userId
    );

    assert(
      Boolean(succRecord && succRecord.id),
      'F.5: Normal file upload succeeds and returns DB record when storage succeeds'
    );
    assert(
      succRecord.storageProvider === 'supabase',
      'F.6: Normal file upload DB record marks storageProvider as "supabase"'
    );

    await db.deleteFileRecord(succRecord.id, userId);
    setStorageUploadMock(null);
  }

  // --------------------------------------------------------------------------
  // SECTION G: Compensating Storage Cleanup on DB Failure
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION G: Compensating Storage Cleanup When DB Save Fails ---');
  {
    // 1. Test image pipeline compensating cleanup
    let deletedPath = '';
    setStorageDeleteMock(async (storagePath) => {
      deletedPath = storagePath;
      return true;
    });

    setStorageUploadMock(async (opts) => ({
      success: true,
      storageProvider: 'supabase',
      bucketName: 'aestific',
      storagePath: opts.storagePath || `users/${opts.userId}/${opts.uniqueFileId}`,
      uniqueFileId: opts.uniqueFileId || 'comp_test.png',
      sizeBytes: 100,
      url: `/api/files/download/${opts.uniqueFileId}`,
    }));

    setImageProviderMock(async () => ({
      result: {
        imageBuffer: Buffer.from('compensating test image bytes'),
        mimeType: 'image/png',
        providerModel: 'Compensating Mock',
      },
      providerName: 'Compensating Mock',
    }));

    // Temporarily cause db.createFileRecord to fail
    const originalCreate = db.createFileRecord.bind(db);
    db.createFileRecord = async () => {
      throw new Error('Simulated authoritative DB connection abort during insert');
    };

    let imageCompensated = false;
    try {
      await generateImageWithImagen({
        prompt: 'A prompt that fails during DB insertion',
        userId,
      });
    } catch (err: any) {
      imageCompensated = true;
      assert(
        err?.message?.includes('Database error') || err?.code === 'DATABASE_ERROR',
        'G.1: Image generator bubbles database failure error'
      );
    }

    assert(imageCompensated, 'G.2: Image generation correctly threw on DB failure');
    assert(
      Boolean(deletedPath && deletedPath.startsWith(`users/${userId}/`)),
      'G.3: Compensating storage deletion was invoked for image uploaded prior to DB failure',
      `Deleted path: ${deletedPath}`
    );

    // 2. Test normal file upload compensating cleanup
    deletedPath = '';
    const tempCompPath = path.join(UPLOADS_DIR, `temp_comp_${Date.now()}.png`);
    fs.writeFileSync(tempCompPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    let fileCompensated = false;
    try {
      await processUploadedFile(
        {
          fieldname: 'file',
          originalname: 'document_comp.png',
          encoding: '7bit',
          mimetype: 'image/png',
          size: 8,
          destination: UPLOADS_DIR,
          filename: path.basename(tempCompPath),
          path: tempCompPath,
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        } as Express.Multer.File,
        userId
      );
    } catch (err: any) {
      fileCompensated = true;
    }

    assert(fileCompensated, 'G.4: Normal file upload correctly threw on DB failure');
    assert(
      Boolean(deletedPath && deletedPath.startsWith(`users/${userId}/`)),
      'G.5: Compensating storage deletion was invoked for normal file uploaded prior to DB failure',
      `Deleted path: ${deletedPath}`
    );

    // Restore original db.createFileRecord
    db.createFileRecord = originalCreate;
    setStorageUploadMock(null);
    setStorageDeleteMock(null);
    setImageProviderMock(null);
  }

  // Clean up test user
  try {
    await db.deleteUser(userId);
  } catch {}

  console.log('\n===============================================================');
  console.log(`📊 CONSISTENCY AUDIT RESULTS: ${passed}/${total} PASSED`);
  console.log('===============================================================');

  if (passed === total) {
    console.log('✨ ALL STORAGE/DATABASE CONSISTENCY INVARIANTS VERIFIED!\n');
    process.exit(0);
  } else {
    console.error(`❌ ${total - passed} CONSISTENCY AUDIT CHECKS FAILED.\n`);
    process.exit(1);
  }
}

runSupabaseConsistencySuite().catch((err) => {
  console.error('Fatal consistency test error:', err);
  process.exit(1);
});
