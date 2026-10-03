import assert from 'node:assert';
import proxyaddr from 'proxy-addr';
import { getClientIp, isTrustedProxy, isCloudflareIp, getTrustedProxyConfiguration, configureAppProxyTrust } from '../server/proxy-trust.js';
import express from 'express';

const BASE_URL = 'http://127.0.0.1:3000';

async function runSuite() {
  console.log('=== RUNNING CLIENT IP & PROXY TRUST VERIFICATION SUITE ===\n');

  // -------------------------------------------------------------
  // 1. Direct Request IP Resolution
  // -------------------------------------------------------------
  console.log('--- 1. Direct Request IP Resolution (Untrusted Socket) ---');
  {
    // Direct connection from public IP 198.51.100.55 without headers
    const req1: any = {
      socket: { remoteAddress: '198.51.100.55' },
      headers: {},
      ip: '198.51.100.55',
    };
    const ip1 = getClientIp(req1);
    assert.strictEqual(ip1, '198.51.100.55', 'Direct request must return direct socket IP');

    // Direct connection with IPv6-mapped IPv4
    const reqV6: any = {
      socket: { remoteAddress: '::ffff:198.51.100.55' },
      headers: {},
      ip: '198.51.100.55',
    };
    assert.strictEqual(getClientIp(reqV6), '198.51.100.55', 'IPv6-mapped IPv4 must be normalized to IPv4');

    console.log('✅ [PASS] Direct untrusted requests correctly resolve to the socket remote address');
  }

  // -------------------------------------------------------------
  // 2. Request Through Trusted Proxy
  // -------------------------------------------------------------
  console.log('\n--- 2. Request Through Trusted Reverse Proxy ---');
  {
    const app = express();
    configureAppProxyTrust(app);

    // Request through trusted loopback proxy (127.0.0.1)
    const reqLoopback: any = {
      app,
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        'x-forwarded-for': '203.0.113.88',
      },
    };
    // Express req.ip evaluation
    Object.defineProperty(reqLoopback, 'ip', {
      get() {
        const trustFn = app.get('trust proxy fn');
        return proxyaddr(reqLoopback, trustFn);
      },
    });

    const resolved = getClientIp(reqLoopback);
    assert.strictEqual(resolved, '203.0.113.88', 'Should extract real client IP when forwarded by trusted proxy');

    // Multi-hop internal proxy chain: client (203.0.113.88) -> VPC gateway (10.0.0.1) -> Nginx (127.0.0.1)
    const reqMultiHop: any = {
      app,
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        'x-forwarded-for': '203.0.113.88, 10.0.0.1',
      },
    };
    Object.defineProperty(reqMultiHop, 'ip', {
      get() {
        const trustFn = app.get('trust proxy fn');
        return proxyaddr(reqMultiHop, trustFn);
      },
    });

    assert.strictEqual(getClientIp(reqMultiHop), '203.0.113.88', 'Should traverse internal trusted VPC hops to real client');
    console.log('✅ [PASS] Legitimate reverse proxy and multi-hop VPC routing correctly preserved');
  }

  // -------------------------------------------------------------
  // 3. Spoofed X-Forwarded-For & CF-Connecting-IP Defense
  // -------------------------------------------------------------
  console.log('\n--- 3. Spoofed Header Rejection & Anti-Bypass Security ---');
  {
    const app = express();
    configureAppProxyTrust(app);

    // Scenario A: Direct untrusted client trying to spoof X-Forwarded-For
    const reqDirectSpoof: any = {
      app,
      socket: { remoteAddress: '198.51.100.99' },
      headers: {
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
        'cf-connecting-ip': '9.9.9.9',
      },
      ip: '198.51.100.99',
    };
    const spoofResult = getClientIp(reqDirectSpoof);
    assert.strictEqual(
      spoofResult,
      '198.51.100.99',
      'Untrusted direct socket MUST NOT trust spoofed X-Forwarded-For or CF-Connecting-IP'
    );

    // Scenario B: Attacker behind trusted proxy tries to prepend spoofed IP to XFF
    // Proxy receives attacker IP 198.51.100.99 and appends it to XFF
    const reqProxyPrependSpoof: any = {
      app,
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        'x-forwarded-for': '8.8.8.8, 198.51.100.99',
      },
    };
    Object.defineProperty(reqProxyPrependSpoof, 'ip', {
      get() {
        const trustFn = app.get('trust proxy fn');
        return proxyaddr(reqProxyPrependSpoof, trustFn);
      },
    });
    assert.strictEqual(
      getClientIp(reqProxyPrependSpoof),
      '198.51.100.99',
      'Should stop at first untrusted hop (198.51.100.99) and ignore spoofed 8.8.8.8'
    );

    // Scenario C: Attacker behind non-Cloudflare proxy sends fake CF-Connecting-IP
    const reqFakeCf: any = {
      app,
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        'x-forwarded-for': '198.51.100.99',
        'cf-connecting-ip': '4.4.4.4', // Fake CF header
      },
    };
    Object.defineProperty(reqFakeCf, 'ip', {
      get() {
        const trustFn = app.get('trust proxy fn');
        return proxyaddr(reqFakeCf, trustFn);
      },
    });
    assert.strictEqual(
      getClientIp(reqFakeCf),
      '198.51.100.99',
      'Should reject spoofed CF-Connecting-IP when Cloudflare is not in the proxy chain'
    );

    // Scenario D: Legitimate Cloudflare Edge request
    const reqLegitCf: any = {
      app,
      socket: { remoteAddress: '173.245.48.10' }, // Cloudflare IP
      headers: {
        'cf-connecting-ip': '203.0.113.44',
        'x-forwarded-for': '203.0.113.44',
      },
    };
    Object.defineProperty(reqLegitCf, 'ip', {
      get() {
        const trustFn = app.get('trust proxy fn');
        return proxyaddr(reqLegitCf, trustFn);
      },
    });
    assert.strictEqual(
      getClientIp(reqLegitCf),
      '203.0.113.44',
      'Genuine Cloudflare edge request correctly resolves authentic CF-Connecting-IP'
    );

    console.log('✅ [PASS] All spoofed header variations rejected; authentic Cloudflare preserved');
  }

  // -------------------------------------------------------------
  // 4. Rate Limiting Enforcement Under Header Spoofing
  // -------------------------------------------------------------
  console.log('\n--- 4. Live Rate Limiter Test (No Bypass via Arbitrary Headers) ---');
  {
    // The register endpoint allows 5 attempts per 5 minutes per IP.
    // An attacker from real IP 203.0.113.195 sends requests through the reverse proxy,
    // attempting to bypass the rate limit by rotating arbitrary client spoofed headers.
    // The reverse proxy appends the attacker's authentic client IP to the right of XFF.
    const realClientIp = `203.0.113.${Date.now() % 200 + 50}`;
    let rateLimited429 = 0;
    let retryAfterHeaderFound = false;

    for (let i = 0; i < 8; i++) {
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Attacker sent spoofed IP 1.2.3.i, proxy appended realClientIp
          'X-Forwarded-For': `1.2.3.${i}, ${realClientIp}`,
          'CF-Connecting-IP': `9.9.9.${i}`, // Fake CF header
        },
        body: JSON.stringify({
          name: `Attacker ${i}`,
          email: `spoofed_attacker_${Date.now()}_${i}@example.com`,
          password: 'Password123!',
        }),
      });

      if (res.status === 429) {
        rateLimited429++;
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter && Number.parseInt(retryAfter, 10) > 0) {
          retryAfterHeaderFound = true;
        }
      }
    }

    assert(
      rateLimited429 > 0,
      'Rate limiter must block excess attempts despite arbitrary X-Forwarded-For headers'
    );
    assert(
      retryAfterHeaderFound,
      'Rate limiter must return standard HTTP 429 with Retry-After header'
    );
    console.log(`✅ [PASS] Rate limiter triggered (${rateLimited429} requests blocked with HTTP 429) — spoofing defeated`);
  }

  // -------------------------------------------------------------
  // 5. Production Deployment Configuration Validation
  // -------------------------------------------------------------
  console.log('\n--- 5. Production Deployment Configuration Checks ---');
  {
    const config = getTrustedProxyConfiguration();
    assert(Array.isArray(config), 'Default configuration must be a compiled list of trusted subnets');
    assert(config.includes('loopback'), 'Must include loopback for local reverse proxy / Nginx');
    assert(config.includes('linklocal'), 'Must include linklocal for cloud metadata');
    assert(config.includes('uniquelocal'), 'Must include uniquelocal for Docker/VPC/Cloud Run bridges');
    assert(config.includes('173.245.48.0/20'), 'Must include official Cloudflare IP ranges');

    // Verify known proxies
    assert.strictEqual(isTrustedProxy('127.0.0.1'), true, '127.0.0.1 must be trusted');
    assert.strictEqual(isTrustedProxy('10.0.0.5'), true, 'VPC 10.x.x.x must be trusted');
    assert.strictEqual(isTrustedProxy('172.16.1.1'), true, 'Private 172.16.x.x must be trusted');
    assert.strictEqual(isTrustedProxy('192.168.1.1'), true, 'Private 192.168.x.x must be trusted');
    assert.strictEqual(isTrustedProxy('173.245.48.1'), true, 'Cloudflare IP must be trusted');
    assert.strictEqual(isCloudflareIp('173.245.48.1'), true, 'Cloudflare IP recognized by isCloudflareIp');
    assert.strictEqual(isTrustedProxy('203.0.113.195'), false, 'Arbitrary public IP must NOT be trusted');
    assert.strictEqual(isCloudflareIp('203.0.113.195'), false, 'Arbitrary public IP is not Cloudflare');

    console.log('✅ [PASS] Production deployment proxy topology and environment config verified');
  }

  console.log('\n=== ALL PROXY TRUST & RATE LIMITING TESTS PASSED! ===\n');
}

runSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
