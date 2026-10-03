/**
 * AESTIFIC PRODUCTION CONFIGURATION & JWT VALIDATION SUITE (PROMPT 4D)
 *
 * Exhaustively validates:
 * A. Valid production JWT_SECRET => PASS
 * B. Missing JWT_SECRET => production validation FAIL (throws clear fatal error)
 * C. Short JWT_SECRET (< 16 chars) => FAIL (throws clear fatal error)
 * D. Placeholder JWT_SECRET => FAIL (throws clear fatal error)
 * E. Development mode remains compatible (no fatal crash, ephemeral secret fallback)
 * F. Secret value NEVER appears in error messages, thrown errors, or logged output
 * G. validateProductionEnvironment() agrees with getJwtSecret() as single source of truth
 */

import {
  getJwtSecret,
  validateJwtConfiguration,
  isDevPlaceholderSecret,
  MIN_JWT_SECRET_LENGTH,
} from '../server/auth.js';
import { validateProductionEnvironment } from '../server/production-config.js';

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

async function runJwtValidationAudit() {
  console.log('===============================================================');
  console.log('🛡️  AESTIFIC: PRODUCTION CONFIGURATION & JWT VALIDATION AUDIT');
  console.log('===============================================================\n');

  const originalEnv = { ...process.env };

  try {
    // -----------------------------------------------------------------------
    // SECTION A: Valid Production JWT_SECRET => PASS
    // -----------------------------------------------------------------------
    console.log('--- SECTION A: Valid Production JWT_SECRET => PASS ---');
    process.env.NODE_ENV = 'production';
    const strongSecret = 'aestific_prod_secret_99887766554433221100_valid_entropy';
    process.env.JWT_SECRET = strongSecret;

    const validationA = validateJwtConfiguration({ isProduction: true });
    assert(validationA.valid === true, 'A.1: validateJwtConfiguration returns valid=true for strong secret');
    assert(validationA.error === undefined, 'A.2: validateJwtConfiguration has no error for valid secret');

    let retrievedSecret = '';
    try {
      retrievedSecret = getJwtSecret();
    } catch (e: any) {
      assert(false, 'A.3: getJwtSecret() should not throw for valid production secret', e.message);
    }
    assert(retrievedSecret === strongSecret, 'A.3: getJwtSecret() returns trimmed valid secret in production');

    let prodReport: any = null;
    try {
      prodReport = validateProductionEnvironment({ isProduction: true });
    } catch (e: any) {
      assert(false, 'A.4: validateProductionEnvironment() should not throw for valid production secret', e.message);
    }
    assert(prodReport && prodReport.isProduction === true, 'A.4: validateProductionEnvironment() returns isProduction=true');
    assert(prodReport && prodReport.ready === true, 'A.5: validateProductionEnvironment() reports ready=true');
    assert(prodReport && prodReport.jwtSecretConfigured === true, 'A.6: validateProductionEnvironment() reports jwtSecretConfigured=true');

    // -----------------------------------------------------------------------
    // SECTION B: Missing JWT_SECRET => Production Validation FAIL
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION B: Missing JWT_SECRET => Production Validation FAIL ---');
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    const validationB1 = validateJwtConfiguration({ isProduction: true });
    assert(validationB1.valid === false, 'B.1: validateJwtConfiguration returns valid=false when JWT_SECRET is missing');
    assert(
      validationB1.error?.includes('JWT_SECRET environment variable is required in production'),
      'B.2: validateJwtConfiguration returns explicit required error'
    );

    let caughtMissingInGet = false;
    let missingErrorGet = '';
    try {
      getJwtSecret();
    } catch (err: any) {
      caughtMissingInGet = true;
      missingErrorGet = err.message || '';
    }
    assert(caughtMissingInGet, 'B.3: getJwtSecret() throws fatal error when JWT_SECRET is missing in production');
    assert(
      missingErrorGet.includes('CRITICAL PRODUCTION ERROR'),
      'B.4: getJwtSecret() throws explicit CRITICAL PRODUCTION ERROR for missing secret'
    );

    let caughtMissingInAudit = false;
    let missingErrorAudit = '';
    try {
      validateProductionEnvironment({ isProduction: true });
    } catch (err: any) {
      caughtMissingInAudit = true;
      missingErrorAudit = err.message || '';
    }
    assert(
      caughtMissingInAudit,
      'B.5: validateProductionEnvironment() throws fatal error when JWT_SECRET is missing in production (never merely warns)'
    );
    assert(
      missingErrorAudit.includes('CRITICAL PRODUCTION ERROR'),
      'B.6: validateProductionEnvironment() error contains CRITICAL PRODUCTION ERROR'
    );

    // Test whitespace-only secret
    process.env.JWT_SECRET = '     ';
    const validationB2 = validateJwtConfiguration({ isProduction: true });
    assert(validationB2.valid === false, 'B.7: Whitespace-only JWT_SECRET is rejected as missing/invalid');

    let caughtWhitespace = false;
    try {
      validateProductionEnvironment({ isProduction: true });
    } catch {
      caughtWhitespace = true;
    }
    assert(caughtWhitespace, 'B.8: validateProductionEnvironment() throws on whitespace-only JWT_SECRET');

    // -----------------------------------------------------------------------
    // SECTION C: Short JWT_SECRET (< 16 chars) => FAIL
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION C: Short JWT_SECRET (< 16 chars) => FAIL ---');
    process.env.NODE_ENV = 'production';
    const shortSecret = 'short99'; // 7 characters
    process.env.JWT_SECRET = shortSecret;

    const validationC = validateJwtConfiguration({ isProduction: true });
    assert(validationC.valid === false, 'C.1: validateJwtConfiguration returns valid=false for short secret');
    assert(
      validationC.error?.includes('at least 16 characters in production'),
      'C.2: validateJwtConfiguration specifies 16 characters requirement'
    );

    let caughtShortInGet = false;
    let shortErrorGet = '';
    try {
      getJwtSecret();
    } catch (err: any) {
      caughtShortInGet = true;
      shortErrorGet = err.message || '';
    }
    assert(caughtShortInGet, 'C.3: getJwtSecret() throws fatal error for short secret in production');
    assert(
      shortErrorGet.includes('at least 16 characters in production'),
      'C.4: getJwtSecret() short error message mentions 16 characters requirement'
    );

    let caughtShortInAudit = false;
    let shortErrorAudit = '';
    try {
      validateProductionEnvironment({ isProduction: true });
    } catch (err: any) {
      caughtShortInAudit = true;
      shortErrorAudit = err.message || '';
    }
    assert(caughtShortInAudit, 'C.5: validateProductionEnvironment() throws fatal error for short secret in production');

    // Edge boundary: 15 chars (FAIL) vs 16 chars (PASS)
    process.env.JWT_SECRET = '123456789012345'; // exactly 15 chars
    const validation15 = validateJwtConfiguration({ isProduction: true });
    assert(validation15.valid === false, 'C.6: Boundary check: 15 characters fails validation');

    process.env.JWT_SECRET = '1234567890123456'; // exactly 16 chars (not in placeholder list)
    const validation16 = validateJwtConfiguration({ isProduction: true });
    assert(validation16.valid === true, 'C.7: Boundary check: 16 characters passes validation');

    // -----------------------------------------------------------------------
    // SECTION D: Placeholder JWT_SECRET => FAIL
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION D: Placeholder JWT_SECRET => FAIL ---');
    process.env.NODE_ENV = 'production';

    const placeholdersToTest = [
      'dev_secret',
      'jwt_secret',
      'change_me',
      'changeme',
      'secret',
      'default',
      'test',
      'test_secret',
      '123456',
      'password',
      'aestific_secret',
      'placeholder',
      'placeholder_jwt_secret_for_production',
      'my_production_jwt_secret_key_long_enough',
      'your_jwt_secret_key_with_many_chars',
      'enter_your_secret_key_here_please',
      'dev_super_secret_production_key_12345',
      'sample_jwt_secret_value_with_entropy',
    ];

    let allPlaceholdersDetected = true;
    for (const ph of placeholdersToTest) {
      if (!isDevPlaceholderSecret(ph)) {
        allPlaceholdersDetected = false;
        console.error(`❌ isDevPlaceholderSecret failed to flag: ${ph}`);
      }
    }
    assert(allPlaceholdersDetected, 'D.1: isDevPlaceholderSecret flags all known placeholder patterns and prefixes');

    for (const ph of ['dev_secret', 'change_me', 'my_prod_secret_placeholder_long']) {
      process.env.JWT_SECRET = ph;

      const val = validateJwtConfiguration({ isProduction: true });
      assert(val.valid === false, `D.2: validateJwtConfiguration rejects placeholder pattern "${ph.slice(0, 8)}..."`);

      let caughtPhInGet = false;
      try {
        getJwtSecret();
      } catch (err: any) {
        caughtPhInGet = true;
        assert(
          err.message.includes('Insecure placeholder') || err.message.includes('CRITICAL PRODUCTION ERROR'),
          `D.3: getJwtSecret() rejects placeholder "${ph.slice(0, 8)}..." with critical error`
        );
      }
      assert(caughtPhInGet, `D.4: getJwtSecret() threw on placeholder "${ph.slice(0, 8)}..."`);

      let caughtPhInAudit = false;
      try {
        validateProductionEnvironment({ isProduction: true });
      } catch (err: any) {
        caughtPhInAudit = true;
      }
      assert(caughtPhInAudit, `D.5: validateProductionEnvironment() threw on placeholder "${ph.slice(0, 8)}..."`);
    }

    // -----------------------------------------------------------------------
    // SECTION E: Development Mode Remains Compatible
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION E: Development Mode Remains Compatible ---');
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;

    let devSecret1 = '';
    try {
      devSecret1 = getJwtSecret();
    } catch (e: any) {
      assert(false, 'E.1: getJwtSecret() should not throw in development when JWT_SECRET is missing', e.message);
    }
    assert(
      Boolean(devSecret1 && devSecret1.length >= 32),
      'E.1: getJwtSecret() provides non-empty ephemeral secret in development mode'
    );

    let devReport: any = null;
    try {
      devReport = validateProductionEnvironment({ isProduction: false });
    } catch (e: any) {
      assert(false, 'E.2: validateProductionEnvironment() should not throw in development mode', e.message);
    }
    assert(devReport && devReport.isProduction === false, 'E.2: validateProductionEnvironment() recognizes development mode');
    assert(devReport && devReport.ready === true, 'E.3: validateProductionEnvironment() reports ready=true in development mode');

    // Development mode with explicit custom secret
    process.env.JWT_SECRET = 'custom_dev_secret_for_local_debugging_12345';
    const devCustom = getJwtSecret();
    assert(
      devCustom === 'custom_dev_secret_for_local_debugging_12345',
      'E.4: getJwtSecret() accepts custom secret in development mode'
    );

    // -----------------------------------------------------------------------
    // SECTION F: Secret Value NEVER Appears in Error Output / Logging
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION F: Secret Value NEVER Appears in Error Output / Logging ---');
    process.env.NODE_ENV = 'production';

    const canarySecretShort = 'CANARY_SHORT_99';
    process.env.JWT_SECRET = canarySecretShort;

    let shortErrMessage = '';
    try {
      getJwtSecret();
    } catch (err: any) {
      shortErrMessage = err.message || '';
    }
    assert(
      !shortErrMessage.includes(canarySecretShort),
      'F.1: getJwtSecret() short secret error does NOT contain raw secret string'
    );

    let shortAuditErr = '';
    try {
      validateProductionEnvironment({ isProduction: true });
    } catch (err: any) {
      shortAuditErr = err.message || '';
    }
    assert(
      !shortAuditErr.includes(canarySecretShort),
      'F.2: validateProductionEnvironment() short secret error does NOT contain raw secret string'
    );

    const canaryPlaceholder = 'my_canary_placeholder_secret_with_entropy_9988';
    process.env.JWT_SECRET = canaryPlaceholder;

    let placeholderErrMessage = '';
    try {
      getJwtSecret();
    } catch (err: any) {
      placeholderErrMessage = err.message || '';
    }
    assert(
      !placeholderErrMessage.includes(canaryPlaceholder),
      'F.3: getJwtSecret() placeholder error does NOT contain raw secret string'
    );

    let placeholderAuditErr = '';
    try {
      validateProductionEnvironment({ isProduction: true });
    } catch (err: any) {
      placeholderAuditErr = err.message || '';
    }
    assert(
      !placeholderAuditErr.includes(canaryPlaceholder),
      'F.4: validateProductionEnvironment() placeholder error does NOT contain raw secret string'
    );

    // -----------------------------------------------------------------------
    // SECTION G: Single Source of Truth Alignment
    // -----------------------------------------------------------------------
    console.log('\n--- SECTION G: Single Source of Truth Alignment ---');
    // Verify that validateProductionEnvironment and getJwtSecret agree under all conditions:
    const testCases = [
      { name: 'Missing', secret: undefined, shouldPass: false },
      { name: 'Empty', secret: '', shouldPass: false },
      { name: 'Short', secret: 'abc1234', shouldPass: false },
      { name: 'Placeholder', secret: 'change_me', shouldPass: false },
      { name: 'Valid', secret: 'aestific_authoritative_prod_key_32_bytes_entropy_ok', shouldPass: true },
    ];

    let allAligned = true;
    for (const tc of testCases) {
      process.env.NODE_ENV = 'production';
      if (tc.secret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = tc.secret;
      }

      let getPassed = false;
      try {
        getJwtSecret();
        getPassed = true;
      } catch {
        getPassed = false;
      }

      let auditPassed = false;
      try {
        validateProductionEnvironment({ isProduction: true });
        auditPassed = true;
      } catch {
        auditPassed = false;
      }

      if (getPassed !== tc.shouldPass || auditPassed !== tc.shouldPass || getPassed !== auditPassed) {
        allAligned = false;
        console.error(`❌ Alignment mismatch on case "${tc.name}": getJwtSecret=${getPassed}, validateProductionEnv=${auditPassed}, expected=${tc.shouldPass}`);
      }
    }
    assert(
      allAligned,
      'G.1: validateProductionEnvironment and getJwtSecret agree 100% across all missing/short/placeholder/valid cases'
    );

  } finally {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  }

  console.log('\n===============================================================');
  console.log(`📊 JWT CONFIG VALIDATION SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('===============================================================');

  if (passed === total) {
    console.log('✨ ALL PRODUCTION JWT CONFIG VALIDATION INVARIANTS VERIFIED!');
  } else {
    console.error(`❌ ${total - passed} tests failed.`);
    process.exit(1);
  }
}

runJwtValidationAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
