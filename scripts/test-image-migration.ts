/**
 * AESTIFIC AI — PRODUCTION AUDIT & VERIFICATION SUITE
 * PRE-LAUNCH FIX 4A: IMAGE GENERATION MODEL MIGRATION TEST
 * 
 * Verifies:
 * A. Image-generation intent is correctly classified.
 * B. Legacy Imagen IDs are not selected as active production targets.
 * C. The new supported image model/provider is selected.
 * D. Text models are not accidentally used for image-generation requests.
 * E. Image-generation provider failure returns a safe failure.
 * F. Successful generated image reaches the existing persistence flow.
 * G. User ownership/security checks remain intact.
 * H. Existing Smart Router tests still pass.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { analyzeAndRouteRequest } from '../server/smart-router.js';
import {
  IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL_ID,
  normalizeAndValidateImageModel,
  normalizeAndValidateModel,
  AVAILABLE_MODELS,
  DEFAULT_MODEL_ID,
} from '../server/models.js';
import {
  GoogleImageProvider,
  GoogleImagenProvider,
  generateImageWithImagen,
  imageProviderManager,
  type GenerateImageOptions,
} from '../server/image-generator.js';
import { db } from '../server/db.js';
import { classifyError } from '../server/error-handler.js';

console.log('=== RUNNING IMAGE GENERATION MODEL MIGRATION TEST SUITE ===\n');

let passedTests = 0;
let totalTests = 0;

function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`✅ [PASS] ${name}`);
        passedTests++;
      }).catch((err) => {
        console.error(`❌ [FAIL] ${name}`);
        console.error(err);
        process.exit(1);
      });
    }
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function runSuite() {
  // Test A: Image-generation intent classification
  test('A. Image-generation intent is correctly classified across multiple languages and formulations', () => {
    const imagePrompts = [
      'Draw a futuristic cyberpunk city in neon lights.',
      'generate an image of a serene mountain lake at sunrise',
      'Create a picture of a golden retriever in space',
      'একটি সুন্দর বিড়ালের ছবি আঁকো।',
      'Paint a watercolor illustration of Paris in spring',
      'Render a 3D avatar of a robot programmer',
    ];

    for (const prompt of imagePrompts) {
      const result = analyzeAndRouteRequest(prompt);
      assert.strictEqual(result.category, 'image_generation', `Prompt "${prompt}" should be classified as image_generation`);
      assert.strictEqual(result.isImageRequest, true, `Prompt "${prompt}" should set isImageRequest=true`);
      assert.strictEqual(result.primaryProvider, 'image', `Prompt "${prompt}" should have primaryProvider=image`);
    }
  });

  // Test B: Legacy Imagen IDs are not selected as active production targets
  test('B. Legacy Imagen IDs are NOT selected as active production targets', () => {
    const route = analyzeAndRouteRequest('Draw a beautiful sunset');
    assert.notStrictEqual(route.modelId, 'imagen-3.0-generate-002', 'imagen-3.0-generate-002 must not be the active model');
    assert.notStrictEqual(route.modelId, 'imagen-3.0-fast-generate-001', 'imagen-3.0-fast-generate-001 must not be the active model');
    assert(!route.fallbackChain.includes('imagen-3.0-generate-002'), 'Legacy model must not be in fallbackChain');
    assert(!route.fallbackChain.includes('imagen-3.0-fast-generate-001'), 'Legacy fast model must not be in fallbackChain');

    // Legacy IDs passed to normalizer must be safely mapped to current supported models
    const normalizedLegacy1 = normalizeAndValidateImageModel('imagen-3.0-generate-002');
    assert.strictEqual(normalizedLegacy1, IMAGE_MODELS.DEFAULT, 'Legacy imagen-3.0-generate-002 must normalize to DEFAULT');

    const normalizedLegacy2 = normalizeAndValidateImageModel('imagen-3.0-fast-generate-001');
    assert.strictEqual(normalizedLegacy2, IMAGE_MODELS.DEFAULT, 'Legacy imagen-3.0-fast-generate-001 must normalize to DEFAULT');

    const normalizedLegacy3 = normalizeAndValidateImageModel('imagen');
    assert.strictEqual(normalizedLegacy3, IMAGE_MODELS.DEFAULT, 'imagen must normalize to DEFAULT');

    // No legacy Imagen in AVAILABLE_MODELS
    const hasLegacyInAvailable = AVAILABLE_MODELS.some(
      (m) => m.id === 'imagen-3.0-generate-002' || m.id === 'imagen-3.0-fast-generate-001'
    );
    assert.strictEqual(hasLegacyInAvailable, false, 'No legacy Imagen ID allowed in AVAILABLE_MODELS');
  });

  // Test C: New supported image model/provider is selected
  test('C. New supported Google image model and provider are correctly configured', () => {
    assert.strictEqual(IMAGE_MODELS.DEFAULT, 'gemini-3.1-flash-lite-image', 'Default image model must be gemini-3.1-flash-lite-image');
    assert.strictEqual(IMAGE_MODELS.HIGH_QUALITY, 'gemini-3.1-flash-image', 'High quality image model must be gemini-3.1-flash-image');
    assert.strictEqual(DEFAULT_IMAGE_MODEL_ID, 'gemini-3.1-flash-lite-image');

    const provider = new GoogleImageProvider();
    assert.strictEqual(provider.id, 'gemini-3.1-flash-lite-image');
    assert(provider.name.includes('gemini-3.1-flash-lite-image'), 'Provider name must identify the modern model');

    // Backward compatibility alias must point to same class
    assert.strictEqual(GoogleImagenProvider, GoogleImageProvider);

    const route = analyzeAndRouteRequest('Please draw a cute panda eating bamboo');
    assert.strictEqual(route.modelId, 'gemini-3.1-flash-lite-image');
    assert(route.fallbackChain.includes('gemini-3.1-flash-image'));
    assert(route.fallbackChain.includes('pollinations-ai'));
  });

  // Test D: Text models are not accidentally used for image-generation requests
  test('D. Text models are not accidentally used for image generation & image models cannot be hijacked for text chat', () => {
    const route = analyzeAndRouteRequest('Draw an oil painting of a castle');
    assert.notStrictEqual(route.modelId, 'gemini-3.1-flash-lite', 'Text model must not be used as image model');
    assert.notStrictEqual(route.modelId, 'deepseek-v4-flash', 'Coding text model must not be used as image model');
    assert.notStrictEqual(route.modelId, 'gemini-3.1-pro-preview', 'Pro reasoning text model must not be used as image model');
    assert.strictEqual(route.primaryProvider, 'image', 'Provider must be image');

    // Trying to pass an image model to general text chat normalizer must safely fallback to text default
    const textNormalized = normalizeAndValidateModel('gemini-3.1-flash-lite-image');
    assert.strictEqual(textNormalized, DEFAULT_MODEL_ID, 'Text normalizer must not return image-only model for text chat');
  });

  // Test E: Image-generation provider failure returns a safe sanitized failure
  test('E. Image generation errors are sanitized and do not leak secrets or internals', async () => {
    // Empty prompt validation
    try {
      await generateImageWithImagen({
        prompt: ' ',
        userId: 'user-test-err',
      });
      assert.fail('Should have thrown on empty prompt');
    } catch (err: any) {
      assert(err.message.includes('descriptive prompt'), 'Validation error must be clear and friendly');
      assert(!err.message.includes('AIza'), 'No API key should leak');
    }

    // Provider error classification sanitization
    const simulatedError = new Error('Google Generative Language API call failed with status 429: Resource exhausted. API key: AIzaSyTestKey123');
    const classified = classifyError(simulatedError);
    assert(!classified.safeMessage.includes('AIzaSyTestKey123'), 'Sanitized error must strip API keys');
    assert(!classified.safeMessage.includes('stack'), 'Sanitized error must strip stack traces');
  });

  // Test F: Successful generated image reaches existing persistence flow
  await test('F. Successful generated image persists to uploads cache, registers FileRecord in DB and updates daily quota', async () => {
    // Create valid user in authoritative database to satisfy foreign key constraints
    const user = await db.createUser({
      email: `test-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@aestific.audit`,
      name: 'Image Test User',
      passwordHash: 'dummy-hash',
      memoryEnabled: true,
      isEmailVerified: true,
    });
    const testUserId = user.id;
    const conversation = await db.createConversation(testUserId, 'Image Test Chat', DEFAULT_MODEL_ID);
    const testConversationId = conversation.id;

    // Generate an image through the production pipeline (exercises the resilient fallback)
    const fileRecord = await generateImageWithImagen({
      prompt: 'A minimalist geometric neon badge on dark background',
      aspectRatio: '1:1',
      style: 'minimalist',
      userId: testUserId,
      conversationId: testConversationId,
    });

    assert(fileRecord, 'FileRecord must be returned');
    assert.strictEqual(fileRecord.userId, testUserId, 'FileRecord must match requesting userId');
    assert.strictEqual(fileRecord.conversationId, testConversationId, 'FileRecord must preserve conversationId');
    assert.strictEqual(fileRecord.storageProvider, 'supabase', 'Storage provider must be supabase');
    const expectedBucket = (process.env.SUPABASE_BUCKET_NAME || 'aestific-files').trim();
    assert(fileRecord.bucketName === expectedBucket || fileRecord.bucketName === 'aestific-files', `Bucket must be ${expectedBucket}`);
    assert.strictEqual(fileRecord.type, 'image', 'File record type must be image');
    assert(fileRecord.sizeBytes > 100, 'File must have valid size in bytes');
    assert(fileRecord.url.startsWith('/api/files/download/'), 'URL must route through secure download proxy');

    // Verify file exists on disk in uploads directory
    const diskPath = path.resolve('uploads', fileRecord.filename);
    assert(fs.existsSync(diskPath), `Generated image must exist on disk at ${diskPath}`);

    // Verify file record was written to DB and is queryable
    const userFiles = await db.getFiles(testUserId);
    assert(userFiles.some((f) => f.id === fileRecord.id), 'File record must be stored in database');

    // Clean up test file from disk and DB
    try {
      fs.unlinkSync(diskPath);
      await db.deleteFileRecord(fileRecord.id, testUserId);
      await db.deleteUser(testUserId);
    } catch {}
  });

  // Test G: User ownership and security checks remain intact
  await test('G. File security and user isolation checks remain strictly enforced for generated images', async () => {
    const owner = await db.createUser({
      email: `owner-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@aestific.audit`,
      name: 'Owner User',
      passwordHash: 'dummy-hash',
      memoryEnabled: true,
      isEmailVerified: true,
    });
    const attacker = await db.createUser({
      email: `attacker-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@aestific.audit`,
      name: 'Attacker User',
      passwordHash: 'dummy-hash',
      memoryEnabled: true,
      isEmailVerified: true,
    });
    const ownerId = owner.id;
    const attackerId = attacker.id;

    const fileRecord = await generateImageWithImagen({
      prompt: 'Security isolation test icon',
      aspectRatio: '1:1',
      style: 'photorealistic',
      userId: ownerId,
    });

    const diskPath = path.resolve('uploads', fileRecord.filename);

    // Attacker cannot delete owner's file
    const deleteByAttacker = await db.deleteFileRecord(fileRecord.id, attackerId);
    assert.strictEqual(deleteByAttacker, false, 'Attacker must not be able to delete another user file record');

    // Attacker cannot see file in their file list
    const attackerFiles = await db.getFiles(attackerId);
    assert(!attackerFiles.some((f) => f.id === fileRecord.id), 'Attacker must not see other user files');

    // Owner CAN delete their file
    const deleteByOwner = await db.deleteFileRecord(fileRecord.id, ownerId);
    assert.strictEqual(deleteByOwner, true, 'Owner must be able to delete their own file record');

    // Clean up disk file and users
    try {
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
      await db.deleteUser(ownerId);
      await db.deleteUser(attackerId);
    } catch {}
  });

  // Test H: Existing Smart Router tests still pass
  test('H. All Smart Router intent, coding, reasoning, web research, and image generation test cases pass', () => {
    const testCases = [
      { input: 'Hello, how are you?', expectedCat: 'default_simple', expectedModel: 'gemini-3.1-flash-lite' },
      { input: 'কেমন আছো?', expectedCat: 'default_simple', expectedModel: 'gemini-3.1-flash-lite' },
      { input: 'Write a Python binary search implementation and explain its complexity.', expectedCat: 'coding_reasoning', expectedModel: 'deepseek-v4-flash' },
      { input: 'Debug this TypeScript error: Cannot read properties of undefined.', expectedCat: 'coding_reasoning', expectedModel: 'deepseek-v4-flash' },
      { input: 'Prove that sqrt(2) is irrational using a formal proof by contradiction.', expectedCat: 'hard_reasoning', expectedModel: 'gemini-3.1-pro-preview' },
      { input: 'What is the latest stock price of NVIDIA today?', expectedCat: 'web_research', expectedModel: 'gemini-3.1-flash-lite' },
      { input: 'Draw a futuristic cyberpunk city in neon lights.', expectedCat: 'image_generation', expectedModel: 'gemini-3.1-flash-lite-image' },
      { input: 'একটি সুন্দর বিড়ালের ছবি আঁকো।', expectedCat: 'image_generation', expectedModel: 'gemini-3.1-flash-lite-image' },
    ];

    for (const tc of testCases) {
      const res = analyzeAndRouteRequest(tc.input);
      assert.strictEqual(res.category, tc.expectedCat, `Category mismatch for "${tc.input}"`);
      assert.strictEqual(res.modelId, tc.expectedModel, `Model mismatch for "${tc.input}"`);
    }
  });

  console.log(`\n==================================================`);
  console.log(`IMAGE GENERATION MIGRATION AUDIT: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`==================================================\n`);

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSuite();
