import { analyzeAndRouteRequest } from '../server/smart-router.js';

// Ensure Exa search testability
process.env.EXA_API_KEY = process.env.EXA_API_KEY || 'test-exa-key-active';

console.log('Testing Aestific Smart Router intent classification and model mapping (12 Mandatory Tests)...\n');

interface TestCase {
  id: number;
  input: string;
  options?: {
    explicitModelPreference?: string;
  };
  expectedCategory: string;
  expectedModelId: string;
  expectedProvider?: string;
  expectedWebSearch?: boolean;
  expectedImage?: boolean;
}

const testCases: TestCase[] = [
  // TEST 1
  {
    id: 1,
    input: 'Hello, how are you?',
    expectedCategory: 'default_simple',
    expectedModelId: 'gemini-3.1-flash-lite',
    expectedProvider: 'gemini',
    expectedWebSearch: false,
    expectedImage: false,
  },
  // TEST 2
  {
    id: 2,
    input: 'কেমন আছো?',
    expectedCategory: 'default_simple',
    expectedModelId: 'gemini-3.1-flash-lite',
    expectedProvider: 'gemini',
    expectedWebSearch: false,
    expectedImage: false,
  },
  // TEST 3
  {
    id: 3,
    input: 'Write a Python binary search implementation and explain its complexity.',
    expectedCategory: 'coding_reasoning',
    expectedModelId: 'deepseek-v4-flash',
    expectedProvider: 'deepseek',
    expectedWebSearch: false,
    expectedImage: false,
  },
  // TEST 4
  {
    id: 4,
    input: 'Debug this TypeScript error: Cannot read properties of undefined.',
    expectedCategory: 'coding_reasoning',
    expectedModelId: 'deepseek-v4-flash',
    expectedProvider: 'deepseek',
    expectedWebSearch: false,
    expectedImage: false,
  },
  // TEST 5
  {
    id: 5,
    input: 'Prove that sqrt(2) is irrational using a formal proof by contradiction.',
    expectedCategory: 'hard_reasoning',
    expectedModelId: 'gemini-3.1-pro-preview',
    expectedProvider: 'gemini',
    expectedWebSearch: false,
    expectedImage: false,
  },
  // TEST 6
  {
    id: 6,
    input: 'What is the latest stock price of NVIDIA today?',
    expectedCategory: 'web_research',
    expectedModelId: 'gemini-3.1-flash-lite', // Synthesized with Gemini 3.1 Flash-Lite
    expectedProvider: 'exa',
    expectedWebSearch: true,
    expectedImage: false,
  },
  // TEST 7
  {
    id: 7,
    input: 'Draw a futuristic cyberpunk city in neon lights.',
    expectedCategory: 'image_generation',
    expectedModelId: 'gemini-3.1-flash-lite-image',
    expectedProvider: 'image',
    expectedWebSearch: false,
    expectedImage: true,
  },
  // TEST 8
  {
    id: 8,
    input: 'একটি সুন্দর বিড়ালের ছবি আঁকো।',
    expectedCategory: 'image_generation',
    expectedModelId: 'gemini-3.1-flash-lite-image',
    expectedProvider: 'image',
    expectedWebSearch: false,
    expectedImage: true,
  },
  // TEST 9
  {
    id: 9,
    input: 'Write a very long normal essay about climate change.',
    expectedCategory: 'default_simple',
    expectedModelId: 'gemini-3.1-flash-lite',
    expectedProvider: 'gemini',
    expectedWebSearch: false,
    expectedImage: false,
  },
  // TEST 10
  {
    id: 10,
    input: 'Explain what a Python function is.',
    expectedCategory: 'default_simple',
    expectedModelId: 'gemini-3.1-flash-lite',
    expectedProvider: 'gemini',
    expectedWebSearch: false,
    expectedImage: false,
  },
  // TEST 11
  {
    id: 11,
    input: 'Hello',
    options: { explicitModelPreference: 'deepseek-v4-flash' },
    expectedCategory: 'coding_reasoning',
    expectedModelId: 'deepseek-v4-flash',
    expectedProvider: 'deepseek',
    expectedWebSearch: false,
    expectedImage: false,
  },
  // TEST 12
  {
    id: 12,
    input: 'Hello',
    options: { explicitModelPreference: 'deepseek-chat' }, // Legacy mapping to deepseek-v4-flash
    expectedCategory: 'coding_reasoning',
    expectedModelId: 'deepseek-v4-flash',
    expectedProvider: 'deepseek',
    expectedWebSearch: false,
    expectedImage: false,
  },
];

let passed = 0;
for (const tc of testCases) {
  const result = analyzeAndRouteRequest(tc.input, tc.options);
  const categoryMatch = result.category === tc.expectedCategory;
  const modelMatch = result.modelId === tc.expectedModelId;
  const providerMatch = tc.expectedProvider ? result.primaryProvider === tc.expectedProvider : true;
  const webMatch = tc.expectedWebSearch !== undefined ? result.requiresWebSearch === tc.expectedWebSearch : true;
  const imgMatch = tc.expectedImage !== undefined ? result.isImageRequest === tc.expectedImage : true;

  if (categoryMatch && modelMatch && providerMatch && webMatch && imgMatch) {
    console.log(`✅ TEST ${tc.id} PASS: "${tc.input}" -> [${result.category}] Model: ${result.modelId} (${result.displayName})`);
    passed++;
  } else {
    console.error(`❌ TEST ${tc.id} FAIL: "${tc.input}"`);
    console.error(`   Expected: category=${tc.expectedCategory}, modelId=${tc.expectedModelId}, provider=${tc.expectedProvider}`);
    console.error(`   Received: category=${result.category}, modelId=${result.modelId}, provider=${result.primaryProvider}`);
  }
}

console.log(`\nSmart Router Test Results: ${passed}/${testCases.length} passed.`);
if (passed === testCases.length) {
  process.exit(0);
} else {
  process.exit(1);
}
