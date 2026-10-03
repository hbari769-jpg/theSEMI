import assert from 'node:assert';
import { aiMonitor } from '../server/ai-monitor.js';
import { isRateLimitingEnabled, checkRateLimitByKey } from '../server/rate-limiter.js';

async function runTests() {
  console.log('=== RUNNING AUTONOMOUS AI USAGE MONITORING TEST SUITE ===\n');

  // Test 1: Verify Initial Launch State (Unlimited user access, rate limiting disabled)
  console.log('--- 1. Verification of Initial Launch Architecture ---');
  const rateLimitStatus = isRateLimitingEnabled();
  assert.strictEqual(rateLimitStatus, false, 'Rate limiting must be disabled for initial public launch');

  // Verify rate limit check returns unlimited
  const unlimitedCheck = checkRateLimitByKey('test:user:unlimited', 5, 60000);
  assert.strictEqual(unlimitedCheck.allowed, true, 'User request must be allowed without limit');
  assert.strictEqual(unlimitedCheck.remaining, Infinity, 'Remaining requests should be Infinity');
  console.log('✅ [PASS] User-facing AI usage is completely unlimited, rate limiting disabled');

  // Test 2: AI Monitor Initialization & Bootstrap
  console.log('--- 2. AI Monitoring Store Bootstrap ---');
  const initialOverview = aiMonitor.getOverview(rateLimitStatus);
  assert(initialOverview.summary, 'Overview must contain summary metrics');
  assert(Array.isArray(initialOverview.usersUsage), 'Overview must contain users usage array');
  assert(Array.isArray(initialOverview.modelsUsage), 'Overview must contain models usage array');
  assert(Array.isArray(initialOverview.volumeOverTime), 'Overview must contain 14-day volume timeline');
  assert(Array.isArray(initialOverview.hourlyVolumeToday), 'Overview must contain hourly volume');
  console.log(`✅ [PASS] AI Monitor initialized successfully with ${initialOverview.summary.totalAiRequests} total requests`);

  // Test 3: Record AI Chat and Image Requests
  console.log('--- 3. Recording Real-Time AI Requests ---');
  const testUserId = 'test-user-monitor-99';
  const testUserEmail = 'monitor.tester@example.com';
  const testUserName = 'Monitor Tester';

  const req1 = aiMonitor.recordAiRequest({
    userId: testUserId,
    userEmail: testUserEmail,
    userName: testUserName,
    type: 'chat',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    webSearchUsed: false,
    promptSnippet: 'Explain quantum computing simply',
    status: 'success',
  });
  assert(req1.id, 'Recorded request must have a unique ID');

  const req2 = aiMonitor.recordAiRequest({
    userId: testUserId,
    userEmail: testUserEmail,
    userName: testUserName,
    type: 'chat',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    webSearchUsed: true,
    webSearchProvider: 'Exa Neural Search',
    promptSnippet: 'Latest stock market indices',
    status: 'success',
  });

  aiMonitor.recordWebSearch({
    userId: testUserId,
    userEmail: testUserEmail,
    query: 'Latest stock market indices',
    provider: 'Exa Neural Search',
  });

  const req3 = aiMonitor.recordAiRequest({
    userId: testUserId,
    userEmail: testUserEmail,
    userName: testUserName,
    type: 'image',
    provider: 'imagen',
    model: 'aestific Neural Image Engine',
    aspectRatio: '16:9',
    style: 'photorealistic',
    promptSnippet: 'Cyberpunk rainy neon street at night',
    status: 'success',
  });

  console.log('✅ [PASS] Successfully recorded Chat (Groq), Chat with Web Search (Gemini), and Image Generation (Imagen)');

  // Test 4: Record API Errors
  console.log('--- 4. Recording and Analyzing API Errors ---');
  aiMonitor.recordApiError({
    endpoint: '/api/chat/stream',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    errorType: 'upstream_429',
    errorMessage: 'Upstream Groq rate limit exceeded. Retry in 2s.',
    userId: testUserId,
    userEmail: testUserEmail,
  });

  aiMonitor.recordApiError({
    endpoint: '/api/images/generate',
    provider: 'imagen',
    model: 'aestific Neural Image Engine',
    errorType: 'safety_policy',
    errorMessage: 'Prompt flagged by safety filters.',
    userId: testUserId,
    userEmail: testUserEmail,
  });

  // Test 5: Verify Comprehensive Overview Metrics
  console.log('--- 5. Verifying Overview & Aggregation Engine ---');
  const updatedOverview = aiMonitor.getOverview(rateLimitStatus);

  // Summary checks
  assert(updatedOverview.summary.totalAiRequests >= 3, 'Total AI requests must reflect new events');
  assert(updatedOverview.summary.requestsToday >= 3, 'Requests today must reflect new events');
  assert(updatedOverview.summary.requestsThisMonth >= 3, 'Requests this month must reflect new events');
  assert(updatedOverview.summary.totalImages >= 1, 'Total images must reflect new generation');
  assert(updatedOverview.summary.totalWebSearches >= 1, 'Total searches must reflect new search event');
  assert(updatedOverview.summary.totalApiErrors >= 2, 'API errors must reflect recorded errors');
  assert(updatedOverview.summary.errorRatePercent > 0, 'Error rate % must be computed');
  console.log('✅ [PASS] Summary counters accurately calculated');

  // Requests per user checks
  const targetUserMetric = updatedOverview.usersUsage.find((u) => u.userId === testUserId);
  assert(targetUserMetric, 'Tester user must appear in requestsPerUser');
  assert.strictEqual(targetUserMetric.userEmail, testUserEmail);
  assert(targetUserMetric.chatCount >= 2, 'Chat count must equal at least 2');
  assert(targetUserMetric.imageCount >= 1, 'Image count must equal at least 1');
  assert(targetUserMetric.searchCount >= 1, 'Search count must equal at least 1');
  assert(targetUserMetric.errorCount >= 2, 'Error count must equal at least 2');
  console.log('✅ [PASS] Requests per user granular counters verified');

  // Model and Provider usage checks
  const groqModel = updatedOverview.modelsUsage.find((m) => m.model === 'llama-3.3-70b-versatile');
  assert(groqModel, 'Groq model must appear in modelsUsage');
  assert(groqModel.count >= 1);
  const geminiModel = updatedOverview.modelsUsage.find((m) => m.model === 'gemini-2.5-flash');
  assert(geminiModel, 'Gemini model must appear in modelsUsage');
  assert(geminiModel.count >= 1);
  console.log('✅ [PASS] Model usage breakdown by provider and model verified');

  // Image Aspect Ratio and Style breakdown
  assert(updatedOverview.imageUsage.byAspectRatio['16:9'] >= 1, '16:9 aspect ratio counted');
  assert(updatedOverview.imageUsage.byStyle['photorealistic'] >= 1, 'photorealistic style counted');
  console.log('✅ [PASS] Image generation aspect ratio and style analytics verified');

  // Web search queries
  const recentSearch = updatedOverview.webSearchUsage.recentSearches.find((s) => s.query.includes('stock market'));
  assert(recentSearch, 'Recent search query must be present in search logs');
  console.log('✅ [PASS] Web search provider and query logs verified');

  // API error diagnostics
  assert(updatedOverview.apiErrors.byType['upstream_429'] >= 1, 'upstream_429 error type counted');
  assert(updatedOverview.apiErrors.byType['safety_policy'] >= 1, 'safety_policy error type counted');
  console.log('✅ [PASS] API error diagnostics and logs verified');

  // Test 6: Anomaly Detection Engine (Unusually High Usage)
  console.log('--- 6. Anomaly Detection Engine (Spike Velocity & Volume) ---');
  const heavyUserId = 'heavy-spammer-user-88';
  const heavyUserEmail = 'heavy.user@anomaly.test';

  // Simulate a burst of 30 requests in rapid succession
  for (let i = 0; i < 30; i++) {
    aiMonitor.recordAiRequest({
      userId: heavyUserId,
      userEmail: heavyUserEmail,
      userName: 'Heavy User',
      type: 'chat',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      status: 'success',
    });
  }

  const anomalyOverview = aiMonitor.getOverview(rateLimitStatus);
  const flaggedAnomaly = anomalyOverview.unusualUsageAlerts.find((a) => a.userId === heavyUserId);
  assert(flaggedAnomaly, 'User with 30 rapid requests must be flagged by anomaly engine');
  assert(flaggedAnomaly.requestsLastHour >= 30, 'Velocity in last hour must be recorded');
  assert(flaggedAnomaly.reason.includes('Burst Velocity'), 'Anomaly reason must specify burst velocity');
  console.log(`✅ [PASS] Anomaly engine correctly identified burst velocity: "${flaggedAnomaly.reason}"`);

  // Test 7: Independent Operation from Rate Limiting
  console.log('--- 7. Decoupled Architecture (Independent of Rate Limiting) ---');
  // AI Monitoring operates purely via event recording and does NOT block requests or require any database config
  assert.strictEqual(isRateLimitingEnabled(), false, 'Rate limiting remains strictly disabled');
  console.log('✅ [PASS] AI Monitoring operates completely independently from rate limiting');

  // Test 8: Reset and Clean State for Production Readiness
  console.log('--- 8. Cleanup Test Artifacts ---');
  aiMonitor.clearAllMonitoring();
  const clearedOverview = aiMonitor.getOverview(rateLimitStatus);
  assert.strictEqual(clearedOverview.summary.totalAiRequests, 0, 'Monitoring logs must be reset after testing');
  assert.strictEqual(clearedOverview.summary.totalImages, 0);
  assert.strictEqual(clearedOverview.summary.totalWebSearches, 0);
  assert.strictEqual(clearedOverview.summary.totalApiErrors, 0);
  console.log('✅ [PASS] AI Monitoring successfully cleared all test artifacts');

  console.log('\n=== ALL AI USAGE MONITORING TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
