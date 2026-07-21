import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dns/promises before importing url-guard
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
import { assertSafeFetchUrl } from '../util/url-guard.js';

const mockLookup = vi.mocked(lookup);

function resolvesTo(addresses: string[]) {
  mockLookup.mockResolvedValue(
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as Awaited<ReturnType<typeof lookup>>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertSafeFetchUrl — scheme checks', () => {
  it('rejects file:// scheme', async () => {
    await expect(assertSafeFetchUrl('file:///etc/passwd')).rejects.toThrow('scheme');
  });

  it('rejects gopher:// scheme', async () => {
    await expect(assertSafeFetchUrl('gopher://evil.com')).rejects.toThrow('scheme');
  });

  it('rejects ftp:// scheme', async () => {
    await expect(assertSafeFetchUrl('ftp://evil.com')).rejects.toThrow('scheme');
  });

  it('allows http://', async () => {
    resolvesTo(['192.168.1.100']);
    await expect(assertSafeFetchUrl('http://homeassistant.local:8123')).resolves.toBeUndefined();
  });

  it('allows https://', async () => {
    resolvesTo(['192.168.1.100']);
    await expect(assertSafeFetchUrl('https://example.com')).resolves.toBeUndefined();
  });
});

describe('assertSafeFetchUrl — credential check', () => {
  it('rejects URLs with embedded credentials', async () => {
    await expect(assertSafeFetchUrl('http://user:pass@example.com')).rejects.toThrow('credentials');
  });
});

describe('assertSafeFetchUrl — blocked IPs (inline)', () => {
  it('rejects 127.0.0.1 (loopback)', async () => {
    await expect(assertSafeFetchUrl('http://127.0.0.1')).rejects.toThrow('Blocked IP');
  });

  it('rejects 127.0.0.50 (loopback subnet)', async () => {
    await expect(assertSafeFetchUrl('http://127.0.0.50')).rejects.toThrow('Blocked IP');
  });

  it('rejects 169.254.169.254 (cloud metadata)', async () => {
    await expect(assertSafeFetchUrl('http://169.254.169.254')).rejects.toThrow('Blocked IP');
  });

  it('rejects 169.254.1.1 (link-local)', async () => {
    await expect(assertSafeFetchUrl('http://169.254.1.1')).rejects.toThrow('Blocked IP');
  });

  it('rejects 0.0.0.0', async () => {
    await expect(assertSafeFetchUrl('http://0.0.0.0')).rejects.toThrow('Blocked IP');
  });

  it('rejects [::1] IPv6 loopback', async () => {
    await expect(assertSafeFetchUrl('http://[::1]')).rejects.toThrow('Blocked IPv6');
  });

  it('rejects [fe80::1] link-local IPv6', async () => {
    await expect(assertSafeFetchUrl('http://[fe80::1]')).rejects.toThrow('Blocked IPv6');
  });
});

describe('assertSafeFetchUrl — RFC-1918 LAN ranges are allowed', () => {
  it('allows 192.168.x.x', async () => {
    await expect(assertSafeFetchUrl('http://192.168.1.100:8123')).resolves.toBeUndefined();
  });

  it('allows 10.x.x.x', async () => {
    await expect(assertSafeFetchUrl('http://10.0.0.1')).resolves.toBeUndefined();
  });

  it('allows 172.16.x.x', async () => {
    await expect(assertSafeFetchUrl('http://172.16.0.1')).resolves.toBeUndefined();
  });
});

describe('assertSafeFetchUrl — DNS-resolved hostnames', () => {
  it('allows hostname resolving to a LAN address', async () => {
    resolvesTo(['192.168.1.50']);
    await expect(assertSafeFetchUrl('http://ha.local:8123')).resolves.toBeUndefined();
  });

  it('rejects hostname resolving to loopback', async () => {
    resolvesTo(['127.0.0.1']);
    await expect(assertSafeFetchUrl('http://evil.com')).rejects.toThrow('blocked address');
  });

  it('rejects hostname resolving to metadata IP', async () => {
    resolvesTo(['169.254.169.254']);
    await expect(assertSafeFetchUrl('http://metadata.internal')).rejects.toThrow('blocked address');
  });

  it('rejects hostname when no addresses resolve', async () => {
    mockLookup.mockResolvedValue([] as Awaited<ReturnType<typeof lookup>>);
    await expect(assertSafeFetchUrl('http://nxdomain.test')).rejects.toThrow('No addresses');
  });

  it('rejects when DNS lookup fails', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertSafeFetchUrl('http://nxdomain.test')).rejects.toThrow('resolve');
  });
});
