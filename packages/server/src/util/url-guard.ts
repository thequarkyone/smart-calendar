import { lookup } from 'node:dns/promises';

// RFC-1918 private ranges (10/8, 172.16/12, 192.168/16) are intentionally NOT blocked
// here — Home Assistant and ICS calendars commonly run on the local LAN.
const BLOCKED_CIDRS: Array<{ base: number; bits: number }> = [
  { base: ipv4ToInt('127.0.0.0'), bits: 8 },    // loopback
  { base: ipv4ToInt('169.254.0.0'), bits: 16 },  // link-local / cloud metadata (169.254.169.254)
  { base: ipv4ToInt('0.0.0.0'), bits: 8 },       // "this" network
  { base: ipv4ToInt('100.64.0.0'), bits: 10 },   // CGNAT shared address space
  { base: ipv4ToInt('224.0.0.0'), bits: 4 },     // multicast
  { base: ipv4ToInt('240.0.0.0'), bits: 4 },     // reserved (future use / broadcast)
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isBlockedIpv4(addr: string): boolean {
  const n = ipv4ToInt(addr);
  return BLOCKED_CIDRS.some(({ base, bits }) => {
    const mask = bits === 32 ? 0xffffffff : ~(0xffffffff >>> bits);
    return (n & mask) >>> 0 === (base & mask) >>> 0;
  });
}

function isBlockedIpv6(addr: string): boolean {
  const normalized = addr.toLowerCase()
    // Normalize dotted-decimal form e.g. ::ffff:127.0.0.1 → 127.0.0.1
    .replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1')
    // Also normalize hex form e.g. ::ffff:7f00:1 → 127.0.0.1
    .replace(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i, (_, hi, lo) => {
      const h = parseInt(hi, 16);
      const l = parseInt(lo, 16);
      return `${(h >> 8) & 0xff}.${h & 0xff}.${(l >> 8) & 0xff}.${l & 0xff}`;
    });
  // If it mapped to an IPv4 address, re-check as IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return isBlockedIpv4(normalized);
  // Block loopback, unspecified, link-local, and ULA (fc00::/7 — fd00::/8 + fc00::/8)
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  );
}

/**
 * Validates a URL for safe outbound fetching.
 * Blocks loopback, link-local, cloud-metadata, and unspecified addresses.
 * RFC-1918 LAN ranges are deliberately allowed (HA/calendar on local network).
 * Throws an Error describing the violation if the URL is unsafe.
 */
export async function assertSafeFetchUrl(raw: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Disallowed scheme: ${parsed.protocol}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials in URL are not allowed');
  }

  const hostname = parsed.hostname;

  // Inline IP checks (no DNS needed)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isBlockedIpv4(hostname)) throw new Error(`Blocked IP address: ${hostname}`);
    return;
  }
  // Strip brackets from IPv6 hostnames (WHATWG URL may or may not include them)
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (bare.includes(':')) {
    if (isBlockedIpv6(bare)) throw new Error(`Blocked IPv6 address: ${bare}`);
    return;
  }

  // Resolve hostname and check all returned addresses; return the first resolved IP
  let addrs: string[];
  try {
    const results = await lookup(hostname, { all: true });
    addrs = results.map((r) => r.address);
  } catch {
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }

  if (addrs.length === 0) throw new Error(`No addresses resolved for: ${hostname}`);

  for (const addr of addrs) {
    if (addr.includes(':') ? isBlockedIpv6(addr) : isBlockedIpv4(addr)) {
      throw new Error(`Hostname ${hostname} resolves to blocked address: ${addr}`);
    }
  }
}

// A resolveSafeUrl() used to exist here, pinning the connection to the resolved IP by
// rewriting it into the URL — intended to collapse the DNS-rebinding TOCTOU window for
// long-lived connections. Removed: connecting by raw IP breaks TLS SNI, and any provider that
// routes HTTPS by hostname at the load balancer (Google, Cloudflare-fronted hosts, and most
// reverse-proxied Home Assistant setups) responds with a generic self-signed fallback
// certificate instead of the real one — hard-failing every request with
// DEPTH_ZERO_SELF_SIGNED_CERT. Confirmed live against a real Google Calendar ICS URL. All
// three call sites now use assertSafeFetchUrl() (validate only, connect via the original
// hostname) — the same narrow TOCTOU tradeoff already accepted for update.ts's manifest fetch.

export const ENTITY_ID_RE = /^[a-z_]+\.[a-z0-9_]+$/;
