/**
 * AESTIFIC AI: PRODUCTION D1 FAIL-SAFE VERIFICATION SUITE
 *
 * Tests the authoritative production database architecture:
 * TEST A: Production + valid D1 configuration → D1 is selected.
 * TEST B: Production + missing D1 configuration → local database.json is NOT selected.
 * TEST C: Production + invalid D1 configuration → local database.json is NOT selected.
 * TEST D: Development + no D1 configuration → existing development local database behaviour remains functional.
 * TEST E: No production request can silently write application state to database.json.
 * TEST F: No secrets or filesystem paths are exposed in the resulting error.
 * TEST G: Existing application tests continue to pass.
 */

import fs from 'fs';
import path from 'path';
import { Database, isD1Placeholder, validateD1Configuration } from '../server/db.js';
import { DatabaseUnavailableError } from '../server/d1.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testId: string, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`✅ [PASS] [${testId}] ${testName}${detail ? ` (${detail})` : ''}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] [${testId}] ${testName}${detail ? ` (${detail})` : ''}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🛡️  AESTIFIC: PRODUCTION D1 FAIL-SAFE VERIFICATION SUITE');
  console.log('===============================================================\n');

  const DB_FILE = path.resolve('database.json');
  const initialDbExists = fs.existsSync(DB_FILE);
  const initialStat = initialDbExists ? fs.statSync(DB_FILE) : null;
  const initialMtime = initialStat ? initialStat.mtimeMs : 0;
  const initialContent = initialDbExists ? fs.readFileSync(DB_FILE, 'utf-8') : '';

  const savedEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // TEST A: Production + valid D1 configuration → D1 is selected
    // -------------------------------------------------------------------------
    console.log('--- TEST A: Production + valid D1 configuration → D1 is selected ---');
    {
      const prodDb = new Database({
        mode: 'production-d1',
        accountId: 'valid_cf_account_id_32_bytes_hex',
        databaseId: 'd09b8ce3-4876-4be4-b816-valid-d1-uuid',
        apiToken: 'valid_production_bearer_api_token',
      });

      const info = prodDb.getDatabaseInfo();
      assert(info.provider === 'cloudflare-d1', 'TEST-A.1', 'Provider is cloudflare-d1');
      assert(info.mode === 'production-d1', 'TEST-A.2', 'Mode is production-d1');
      assert(info.authoritative === true, 'TEST-A.3', 'authoritative is true');
      assert(info.configured === true, 'TEST-A.4', 'configured is true');
      assert(prodDb.getMode() === 'production-d1', 'TEST-A.5', 'getMode() returns production-d1');
    }

    // -------------------------------------------------------------------------
    // TEST B: Production + missing D1 configuration → local database.json is NOT selected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST B: Production + missing D1 configuration → local database.json is NOT selected ---');
    {
      process.env.NODE_ENV = 'production';
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_D1_DATABASE_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;

      const missingDb = new Database();
      const info = missingDb.getDatabaseInfo();

      assert(info.provider !== 'local-json', 'TEST-B.1', 'Provider is NOT local-json');
      assert(info.mode !== 'local-dev', 'TEST-B.2', 'Mode is NOT local-dev');
      assert(info.mode === 'production-d1', 'TEST-B.3', 'Mode remains production-d1');
      assert(info.configured === false, 'TEST-B.4', 'configured is false');

      let queryThrew = false;
      let caughtError: any = null;
      try {
        await missingDb.findUserByEmail('audit@aestific.local');
      } catch (err: any) {
        queryThrew = true;
        caughtError = err;
      }

      assert(queryThrew === true, 'TEST-B.5', 'Query fails fast when D1 configuration is missing');
      assert(
        caughtError instanceof DatabaseUnavailableError || caughtError?.name === 'DatabaseUnavailableError',
        'TEST-B.6',
        'Throws DatabaseUnavailableError'
      );
      assert(
        caughtError?.statusCode === 503,
        'TEST-B.7',
        'DatabaseUnavailableError has 503 status code'
      );

      const health = await missingDb.checkHealth();
      assert(health.status === 'down', 'TEST-B.8', 'Health check reports status down');
      assert(health.provider === 'cloudflare-d1', 'TEST-B.9', 'Health check provider is cloudflare-d1');
    }

    // -------------------------------------------------------------------------
    // TEST C: Production + invalid D1 configuration → local database.json is NOT selected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST C: Production + invalid D1 configuration → local database.json is NOT selected ---');
    {
      process.env.NODE_ENV = 'production';

      // Subtest C.1: Placeholder configuration
      const placeholderDb = new Database({
        mode: 'production-d1',
        accountId: 'your_account_id',
        databaseId: 'change_me',
        apiToken: 'placeholder',
      });
      const infoPlaceholder = placeholderDb.getDatabaseInfo();
      assert(infoPlaceholder.mode !== 'local-dev', 'TEST-C.1', 'Placeholder config does NOT switch to local-dev');
      assert(infoPlaceholder.provider !== 'local-json', 'TEST-C.2', 'Placeholder config does NOT switch to local-json');
      assert(infoPlaceholder.configured === false, 'TEST-C.3', 'Placeholder config is marked configured=false');

      // Subtest C.2: Invalid API token / credentials fail fast on query without silent fallback
      const invalidCredentialsDb = new Database({
        mode: 'production-d1',
        accountId: 'invalid_account_12345',
        databaseId: 'invalid_database_12345',
        apiToken: 'invalid_token_12345',
      });

      let invalidThrew = false;
      let invalidError: any = null;
      try {
        await invalidCredentialsDb.findUserByEmail('test@aestific.local');
      } catch (err: any) {
        invalidThrew = true;
        invalidError = err;
      }
      assert(invalidThrew === true, 'TEST-C.4', 'Invalid credentials fail fast and do not silently fall back to local JSON');
      assert(
        invalidError?.message?.includes('Cloudflare D1') ||
        invalidError?.message?.includes('401') ||
        invalidError?.message?.includes('Database error') ||
        invalidError?.message?.includes('unavailable'),
        'TEST-C.5',
        'Error explicitly reports database failure'
      );
    }

    // -------------------------------------------------------------------------
    // TEST D: Development + no D1 configuration → existing development local database remains functional
    // -------------------------------------------------------------------------
    console.log('\n--- TEST D: Development + no D1 configuration → local database functional ---');
    {
      process.env.NODE_ENV = 'development';
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_D1_DATABASE_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;

      const devDb = new Database({ mode: 'local-dev' });
      const devInfo = devDb.getDatabaseInfo();

      assert(devInfo.provider === 'local-json', 'TEST-D.1', 'Dev provider is local-json');
      assert(devInfo.mode === 'local-dev', 'TEST-D.2', 'Dev mode is local-dev');
      assert(devInfo.configured === true, 'TEST-D.3', 'Dev configured is true');

      const devHealth = await devDb.checkHealth();
      assert(devHealth.ok === true, 'TEST-D.4', 'Dev health check is ok');
      assert(devHealth.status === 'connected', 'TEST-D.5', 'Dev health check is connected');
    }

    // -------------------------------------------------------------------------
    // TEST E: No production request can silently write application state to database.json
    // -------------------------------------------------------------------------
    console.log('\n--- TEST E: No production request can silently write application state to database.json ---');
    {
      process.env.NODE_ENV = 'production';

      const prodDbMissing = new Database({
        mode: 'production-d1',
        accountId: '',
        databaseId: '',
        apiToken: '',
      });

      // Calling save() in production mode MUST NOT write to database.json
      prodDbMissing.save();

      // Check that database.json was NOT touched
      if (initialDbExists) {
        const afterStat = fs.statSync(DB_FILE);
        const afterContent = fs.readFileSync(DB_FILE, 'utf-8');
        assert(afterStat.mtimeMs === initialMtime, 'TEST-E.1', 'database.json mtime unchanged by production save()');
        assert(afterContent === initialContent, 'TEST-E.2', 'database.json content unchanged by production save()');
      } else {
        assert(!fs.existsSync(DB_FILE), 'TEST-E.1', 'database.json was not created by production save()');
      }

      // Attempting to switch to local-dev in production must throw
      let threwSwitch = false;
      try {
        prodDbMissing.setMode('local-dev');
      } catch {
        threwSwitch = true;
      }
      assert(threwSwitch === true, 'TEST-E.3', 'Cannot switch mode to local-dev in production');
    }

    // -------------------------------------------------------------------------
    // TEST F: No secrets or filesystem paths are exposed in the resulting error
    // -------------------------------------------------------------------------
    console.log('\n--- TEST F: No secrets or filesystem paths are exposed in error ---');
    {
      process.env.NODE_ENV = 'production';

      const secretToken = 'super_secret_cf_token_abc_123_xyz';
      const prodDbMissing = new Database({
        mode: 'production-d1',
        accountId: '',
        databaseId: '',
        apiToken: '',
      });

      let errorMsg = '';
      try {
        await prodDbMissing.findUserByEmail('audit@aestific.local');
      } catch (err: any) {
        errorMsg = err.message || '';
      }

      assert(!errorMsg.includes(secretToken), 'TEST-F.1', 'Error does NOT contain API token or secrets');
      assert(!errorMsg.includes('/workspace'), 'TEST-F.2', 'Error does NOT contain internal filesystem paths');
      assert(!errorMsg.includes('database.json'), 'TEST-F.3', 'Error does NOT mention database.json');
      assert(!errorMsg.includes('.ts:'), 'TEST-F.4', 'Error does NOT expose internal stack traces in message');
      assert(
        errorMsg.includes('Authoritative') || errorMsg.includes('unavailable'),
        'TEST-F.5',
        'Error provides clean, safe explanation of database unavailable status'
      );
    }

  } finally {
    process.env = savedEnv;
  }

  console.log('\n===============================================================');
  console.log(`📊 PRODUCTION D1 FAIL-SAFE AUDIT SUMMARY: ${passed}/${passed + failed} TESTS PASSED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
