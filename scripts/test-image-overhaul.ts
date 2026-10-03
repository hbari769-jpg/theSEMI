import assert from 'assert';
import { detectImageGenerationIntent } from '../server/image-intent.js';
import { enrichImagePrompt } from '../server/groq.js';
import { generateAIImages } from '../server/image-generator.js';
import { db } from '../server/db.js';

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
  console.log('======================================================');
  console.log('TESTING COMPLETE AESTIFIC IMAGE-GENERATION OVERHAUL');
  console.log('======================================================\n');

  // Test 1: Intent detection on test cases
  await test('Test Case 1: "realistic mountain landscape at sunrise" detected as image', () => {
    const res = detectImageGenerationIntent('realistic mountain landscape at sunrise');
    assert.strictEqual(res.isImage, true, 'Must detect as image');
    assert.strictEqual(res.quantity, 1, 'Quantity should be 1');
    assert(res.prompt.includes('mountain landscape at sunrise'), 'Prompt must retain subject');
  });

  await test('Test Case 2: "generate 4 futuristic cyberpunk cities" detected with quantity 4', () => {
    const res = detectImageGenerationIntent('generate 4 futuristic cyberpunk cities');
    assert.strictEqual(res.isImage, true, 'Must detect as image');
    assert.strictEqual(res.quantity, 4, 'Must detect quantity 4');
    assert(res.variations, 'Must flag variations');
    assert(res.prompt.includes('futuristic cyberpunk cities'), 'Must preserve subject');
  });

  await test('Test Case 3: "square black and white portrait of an old sailor" preserves aspect ratio and style', () => {
    const res = detectImageGenerationIntent('square black and white portrait of an old sailor');
    assert.strictEqual(res.isImage, true, 'Must detect as image');
    assert.strictEqual(res.aspectRatio, '1:1', 'Aspect ratio must be 1:1');
    assert.strictEqual(res.style, 'black_and_white', 'Style must be black_and_white');
    assert(res.prompt.includes('portrait of an old sailor') || res.prompt.includes('old sailor'), 'Must preserve subject');
  });

  await test('Test Case 4: "cinematic movie poster for a sci-fi space mission" preserves cinematic style & full prompt', () => {
    const res = detectImageGenerationIntent('cinematic movie poster for a sci-fi space mission');
    assert.strictEqual(res.isImage, true, 'Must detect as image');
    assert.strictEqual(res.style, 'cinematic', 'Style must be cinematic');
    assert(res.prompt.includes('movie poster for a sci-fi space mission') || res.prompt.includes('sci-fi space mission'), 'Must preserve prompt');
  });

  await test('Test Case 5: "Can you write an essay about mountains?" is NOT detected as image', () => {
    const res = detectImageGenerationIntent('Can you write an essay about mountains?');
    assert.strictEqual(res.isImage, false, 'Must NOT be detected as image request');
  });

  await test('Intent Detection: Additional natural keywords and constraints', () => {
    assert(detectImageGenerationIntent('draw something amazing').isImage, 'draw must detect');
    assert(detectImageGenerationIntent('create artwork of a neon samurai').isImage, 'artwork must detect');
    assert(detectImageGenerationIntent('visualize the solar system in 16:9').isImage, 'visualize must detect');
    assert.strictEqual(detectImageGenerationIntent('visualize the solar system in 16:9').aspectRatio, '16:9');
    assert(detectImageGenerationIntent('make a picture of an enchanted forest').isImage, 'make a picture must detect');
    assert.strictEqual(detectImageGenerationIntent('generate 3 variations of a modern logo').quantity, 3);
  });

  await test('Negative Detection: Non-image chat queries remain standard text', () => {
    assert(!detectImageGenerationIntent('How do I take a picture with my phone camera?').isImage);
    assert(!detectImageGenerationIntent('Explain how generative image models work under the hood').isImage);
    assert(!detectImageGenerationIntent('What is an image format?').isImage);
    assert(!detectImageGenerationIntent('Help me write code to upload an image in Python').isImage);
  });

  await test('Prompt Preservation: enrichImagePrompt does not truncate English prompts', async () => {
    const original = 'A dramatic wide-angle shot of an ancient obsidian monolith resting on a crimson desert dune during a solar eclipse, ultra detailed';
    const enriched = await enrichImagePrompt(original);
    assert.strictEqual(enriched, original, 'English prompts must be preserved verbatim');
  });

  // DB setup for actual multi-image generation test
  const testUser = await db.createUser({
    name: 'Image Test User',
    email: `image_test_${Date.now()}@example.com`,
    passwordHash: 'hash',
    isEmailVerified: true,
    memoryEnabled: true,
  });
  const testConv = await db.createConversation(testUser.id, 'Image Overhaul Chat');

  await test('Batch Multi-Image Generation: generateAIImages generates requested quantity with unique seeds', async () => {
    // Valid image buffer (>= 512 bytes) for deterministic pipeline validation
    const testImageBuffer = Buffer.alloc(1024, 'A');
    // Set PNG magic bytes at start
    testImageBuffer[0] = 0x89;
    testImageBuffer[1] = 0x50;
    testImageBuffer[2] = 0x4e;
    testImageBuffer[3] = 0x47;

    const { setImageProviderMock } = await import('../server/image-generator.js');
    setImageProviderMock(async (opts) => {
      return {
        result: {
          imageBuffer: testImageBuffer,
          mimeType: 'image/png',
          providerModel: `Neural-Test-Engine-Seed-${opts.seed}`,
        },
        providerName: 'Test Neural Engine',
      };
    });

    const results = await generateAIImages({
      prompt: 'futuristic cyberpunk city with neon holograms',
      style: 'cinematic',
      userId: testUser.id,
      conversationId: testConv.id,
      aspectRatio: '1:1',
      quantity: 4,
      variations: true,
    });

    // Reset mock
    setImageProviderMock(null);

    assert.strictEqual(results.length, 4, 'Must generate exactly 4 images');
    const urls = new Set(results.map(r => r.url));
    assert.strictEqual(urls.size, 4, 'All generated image URLs must be unique');

    for (const img of results) {
      assert(img.id, 'Must have file ID');
      assert(img.url.startsWith('/api/files/'), 'URL must route through file proxy');
      const file = await db.getFileById(img.id, testUser.id);
      assert(file, 'DB record must exist');
    }
  });

  console.log(`\n======================================================`);
  console.log(`ALL ${passed}/${total} IMAGE-GENERATION TESTS PASSED SUCCESSFULLY!`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
