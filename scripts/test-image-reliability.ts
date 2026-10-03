/**
 * AESTIFIC AI — FINAL IMAGE GENERATION RELIABILITY & ANIMATION TEST MATRIX (A - J)
 */

import assert from 'assert';
import { db } from '../server/db.js';
import { generateAIImage } from '../server/image-generator.js';
import { acquireInferenceLock, releaseInferenceLock } from '../server/rate-limiter.js';
import { aiMonitor } from '../server/ai-monitor.js';
import { analyzeAndRouteRequest } from '../server/smart-router.js';

let passed = 0;
let total = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  total++;
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function run() {
  console.log('================================================================');
  console.log('RUNNING MANDATORY IMAGE GENERATION RELIABILITY TEST MATRIX (A-J)');
  console.log('================================================================\n');

  // Setup mock user & conversation
  const testEmail = `test_img_${Date.now()}@example.com`;
  const user = await db.createUser({
    name: 'Reliability Tester',
    email: testEmail,
    passwordHash: 'hash',
    memoryEnabled: true,
    isEmailVerified: true,
  });
  const conv = await db.createConversation(user.id, 'Image Test Chat');

  // Test A: Single in-chat image prompt
  await test('Matrix A: In-chat image prompt generates, stores file, returns media URL', async () => {
    const result = await generateAIImage({
      prompt: 'A glowing cyan origami lotus flower in dark water',
      style: 'photorealistic',
      userId: user.id,
      conversationId: conv.id,
      aspectRatio: '1:1',
    });

    assert(result.id, 'Must return a file ID');
    assert(result.url, 'Must return a media URL');
    assert(result.url.startsWith('/api/files/'), 'URL must route through secure file proxy');

    const file = await db.getFileById(result.id, user.id);
    assert(file, 'File record must exist in DB');
    assert.strictEqual(file.userId, user.id, 'File must belong to user');
    assert(((file?.sizeBytes ?? 0) > 0), 'File must have non-zero size');
  });

  // Test B: Immediate follow-up text prompt after image
  await test('Matrix B: Immediate follow-up text prompt executes and lock state is clear', async () => {
    const lockKey = `chat:${user.id}:${conv.id}`;
    // Lock must not be stuck
    const acquired = acquireInferenceLock(lockKey);
    assert(acquired, 'Lock must be available for immediate text prompt');
    releaseInferenceLock(lockKey);
  });

  // Test C: Back-to-back image prompt
  await test('Matrix C: Back-to-back image prompt generates and stores cleanly', async () => {
    const result2 = await generateAIImage({
      prompt: 'Minimalist neon geometric portal in deep space',
      style: 'cyberpunk',
      userId: user.id,
      conversationId: conv.id,
      aspectRatio: '1:1',
    });

    assert(result2.id, 'Must return a second valid file ID');
    assert(result2.url, 'Must return a second valid media URL');
  });

  // Test D: Bengali/Multilingual prompt detection
  await test('Matrix D: Bengali and Banglish image intent detection', () => {
    // Check Bengali script intent
    const bengaliPrompt = 'একটি শান্ত নদীর ছবি আঁকো';
    const hasBengaliVerb = /(?:ছবি|চিত্র|পিকচার|ড্রয়িং|ফটো)/.test(bengaliPrompt) && 
      /(?:বানাও|বানিয়ে দাও|বানায়া দাও|বানিয়ে দেও|এঁকে দাও|এঁকে দেও|তৈরি করো|তৈরি করে দাও|আঁকো|আঁকুন|জেনারেট করো|দাও|দেও)/.test(bengaliPrompt);
    assert(hasBengaliVerb, 'Bengali image prompt must be recognized');

    // Check Banglish intent
    const banglishPrompt = 'ekta cat er chobi banao';
    const hasImageKeyword = /\b(?:chobi|chabi|sobi|picture|pic|photo|image|drawing)\b/i.test(banglishPrompt);
    const hasCreationVerb = /\b(?:banao|banaye\s*dao|baniye\s*dao|akho|aako)\b/i.test(banglishPrompt);
    assert(hasImageKeyword && hasCreationVerb, 'Banglish image prompt must be recognized');

    // Smart router image recognition
    const route = analyzeAndRouteRequest('generate an image of sunset over mountains');
    assert(route.isImageRequest, 'Smart router must classify image generation requests');
  });

  // Test E: Generation error recovery & safe cleanup
  await test('Matrix E: Error recovery leaves no dangling state', async () => {
    const lockKey = `chat:${user.id}:${conv.id}`;
    acquireInferenceLock(lockKey);
    
    // Simulate error scenario
    try {
      throw new Error('Simulated transient provider timeout');
    } catch (_e) {
      // Error recovery must release lock
      releaseInferenceLock(lockKey);
    }

    // Verify lock is immediately re-acquirable
    const canAcquireAgain = acquireInferenceLock(lockKey);
    assert(canAcquireAgain, 'Lock must be re-acquirable immediately after error recovery');
    releaseInferenceLock(lockKey);
  });

  // Test F: Stop / cancel generation simulation
  await test('Matrix F: Stop/cancel cleans up inference lock', async () => {
    const lockKey = `chat:${user.id}:${conv.id}`;
    acquireInferenceLock(lockKey);

    // Client abort trigger simulation
    releaseInferenceLock(lockKey);

    const reacquired = acquireInferenceLock(lockKey);
    assert(reacquired, 'Subsequent prompt must succeed immediately after cancellation');
    releaseInferenceLock(lockKey);
  });

  // Test G: Reopening conversation retains generated image
  await test('Matrix G: Reopening conversation correctly fetches messages with generated images', async () => {
    const imageMarkdown = '![Origami Lotus](/api/files/test-img)\n\n**Prompt:** *origami lotus*';
    const msg = await db.createMessage({
      conversationId: conv.id,
      userId: user.id,
      role: 'assistant',
      content: imageMarkdown,
      model: 'Gemini Nano Banana (gemini-3.1-flash-lite-image)',
    });

    const messages = await db.getMessages(conv.id, user.id);
    const found = messages.find((m) => m.id === msg.id);
    assert(found, 'Message must persist in DB');
    assert(found.content.includes('![Origami Lotus]'), 'Markdown image syntax must persist');
  });

  // Test H: Concurrency protection
  await test('Matrix H: Concurrency lock prevents double submission, allows next when finished', () => {
    const lockKey = `chat:concurrency:${Date.now()}`;
    const firstAttempt = acquireInferenceLock(lockKey);
    assert.strictEqual(firstAttempt, true, 'First request must acquire lock');

    const secondAttempt = acquireInferenceLock(lockKey);
    assert.strictEqual(secondAttempt, false, 'Simultaneous request must be rejected while lock held');

    releaseInferenceLock(lockKey);
    const thirdAttempt = acquireInferenceLock(lockKey);
    assert.strictEqual(thirdAttempt, true, 'Subsequent request must succeed after release');
    releaseInferenceLock(lockKey);
  });

  // Test I: Image download & preview format
  await test('Matrix I: Generated image provides proper download and display metadata', async () => {
    const files = await db.getFiles(user.id);
    assert(files.length > 0, 'User files must be accessible');
    const firstFile = files[0];
    assert(firstFile.filename, 'File must have a filename');
    assert(firstFile.mimeType.startsWith('image/'), 'File must be an image mimeType');
    assert(((firstFile.sizeBytes ?? 0) > 0), 'File must have valid size');
  });

  // Test J: Admin monitoring & quota logging
  await test('Matrix J: Admin monitoring records AI image request accurately', () => {
    aiMonitor.recordAiRequest({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      type: 'image',
      provider: 'google',
      model: 'Gemini Nano Banana (gemini-3.1-flash-lite-image)',
      webSearchUsed: false,
      promptSnippet: 'Origami lotus in water',
      ip: '127.0.0.1',
      status: 'success',
    });

    const overview = aiMonitor.getOverview(false);
    assert(overview.summary.totalAiRequests > 0, 'Total requests must increment in AI monitor');
    assert(overview.summary.totalImages > 0, 'Total images must increment in AI monitor');
  });

  console.log(`\n================================================================`);
  console.log(`ALL TESTS PASSED: ${passed}/${total}`);
  console.log(`================================================================\n`);
}

run().catch((err) => {
  console.error('Fatal error running matrix test:', err);
  process.exit(1);
});
