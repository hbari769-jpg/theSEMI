import type { Request, Application } from 'express';
import proxyaddr from 'proxy-addr';
import net from 'node:net';

/**
 * Official Cloudflare IP Ranges (IPv4 and IPv6)
 * Reference: https://www.cloudflare.com/ips/
 */
export const CLOUDFLARE_IP_RANGES: string[] = [
  // IPv4
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  // IPv6
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

/**
 * Standard trusted proxy presets for containerized & cloud environments:
 * - 'loopback': 127.0.0.0/8, ::1/128 (local container reverse proxies, nginx)
 * - 'linklocal': 169.254.0.0/16, fe80::/10 (cloud metadata & internal links)
 * - 'uniquelocal': 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7 (Cloud Run, Docker bridge, VPCs)
 */
export const DEFAULT_TRUSTED_PROXY_PRESETS: string[] = [
  'loopback',
  'linklocal',
  'uniquelocal',
];

/**
 * Compiles the trusted proxy configuration list for Express.
 * Uses standard loopback (local container nginx reverse proxy), linklocal (cloud metadata),
 * and uniquelocal (container bridge & VPC subnets RFC 1918 / RFC 4193), plus Cloudflare edge ranges.
 * This safely and automatically handles reverse proxying in the platform container environment
 * without guessing specific proxy IP addresses or requiring custom environment variables.
 */
export function getTrustedProxyConfiguration(): string[] {
  const envProxies = process.env.TRUSTED_PROXIES || process.env.TRUST_PROXY;
  if (envProxies && envProxies.trim()) {
    const custom = envProxies
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (custom.length > 0) {
      return [...custom, ...DEFAULT_TRUSTED_PROXY_PRESETS, ...CLOUDFLARE_IP_RANGES];
    }
  }
  return [...DEFAULT_TRUSTED_PROXY_PRESETS, ...CLOUDFLARE_IP_RANGES];
}

function compileTrustChecker(config: string[] | boolean | number): (addr: string, i: number) => boolean {
  if (typeof config === 'boolean') {
    return () => config;
  }
  if (typeof config === 'number') {
    return (_addr: string, i: number) => i < config;
  }
  return proxyaddr.compile(config);
}

// Pre-compiled checkers (initialized at module load, refreshed if configureAppProxyTrust is called)
let cachedTrustFn: (addr: string, i: number) => boolean = compileTrustChecker(getTrustedProxyConfiguration());
const cloudflareTrustFn = proxyaddr.compile(CLOUDFLARE_IP_RANGES);

/**
 * Configures Express application proxy trust using the compiled trusted proxy topology.
 */
export function configureAppProxyTrust(app: Application): void {
  const config = getTrustedProxyConfiguration();
  app.set('trust proxy', config);
  const compiled = app.get('trust proxy fn');
  if (typeof compiled === 'function') {
    cachedTrustFn = compiled;
  } else {
    cachedTrustFn = compileTrustChecker(config);
  }
}

/**
 * Check if a given remote IP address originates from a known Cloudflare edge proxy.
 */
export function isCloudflareIp(ip: string): boolean {
  if (!ip) return false;
  const normalized = ip.startsWith('::ffff:') ? ip.substring(7) : ip;
  return cloudflareTrustFn(normalized, 0);
}

/**
 * Check if a given remote IP address originates from a known trusted reverse proxy.
 */
export function isTrustedProxy(ip: string): boolean {
  if (!ip) return false;
  const normalized = ip.startsWith('::ffff:') ? ip.substring(7) : ip;
  return cachedTrustFn(normalized, 0);
}

/**
 * Extracts the authentic client IP using Express's framework-trusted proxy mechanism.
 *
 * Security guarantees:
 * 1. If the direct socket connection is NOT from a verified trusted proxy, all client-supplied
 *    forwarding headers (X-Forwarded-For, CF-Connecting-IP, etc.) are ignored, returning the raw socket IP.
 * 2. If connected through a trusted proxy, Express's native `req.ip` (proxy-addr) traverses
 *    X-Forwarded-For right-to-left, stopping at the first untrusted client hop.
 * 3. CF-Connecting-IP is ONLY trusted if Cloudflare edge is legitimately in the proxy chain.
 * 4. Normalizes IPv4-mapped IPv6 addresses (e.g. ::ffff:192.168.1.1 -> 192.168.1.1).
 */
export function getClientIp(req: Request): string {
  // 1. Obtain the direct socket remote address
  const directRemote = req.socket?.remoteAddress || (req.connection as any)?.remoteAddress;
  const normalizedDirect = directRemote?.startsWith('::ffff:')
    ? directRemote.substring(7)
    : directRemote;

  if (!normalizedDirect) {
    return '127.0.0.1';
  }

  // 2. If the direct socket is NOT from a trusted reverse proxy,
  // DO NOT trust any client-supplied forwarding headers.
  if (!isTrustedProxy(normalizedDirect)) {
    return normalizedDirect;
  }

  // 3. Direct connection IS from a trusted proxy.
  // Verify if Cloudflare is legitimately in the proxy chain before trusting CF-Connecting-IP.
  let hasCloudflareHop = isCloudflareIp(normalizedDirect);
  const xff = req.headers['x-forwarded-for'];
  if (!hasCloudflareHop && typeof xff === 'string') {
    const hops = xff.split(',').map((s) => {
      const trimmed = s.trim();
      return trimmed.startsWith('::ffff:') ? trimmed.substring(7) : trimmed;
    }).filter(Boolean);
    hasCloudflareHop = hops.some((h) => isCloudflareIp(h));
  }

  if (hasCloudflareHop) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string') {
      const trimmed = cfIp.trim();
      const normCf = trimmed.startsWith('::ffff:') ? trimmed.substring(7) : trimmed;
      if (net.isIP(normCf)) {
        return normCf;
      }
    }
  }

  // 4. Use Express framework's trusted IP mechanism (req.ip powered by proxy-addr)
  let ip = req.ip || normalizedDirect;
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  return ip;
}
