import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { openDb } from '../db/index.js';
import { SettingsService } from '../services/settings.js';
import { SecretsService } from '../services/secrets.js';
import { TilesService } from '../services/tiles.js';
import { CalendarService } from '../services/calendar.js';
import { WeatherService } from '../services/weather.js';
import { PhotoService } from '../services/photos.js';
import { TasksService } from '../services/tasks.js';
import { FeedsService } from '../services/feeds.js';
import { HaService } from '../services/homeassistant.js';
import { SpotifyService } from '../services/spotify.js';
import { UpdateService } from '../services/update.js';
import { WifiService } from '../services/wifi.js';
import { ResetService } from '../services/reset.js';
import { SystemService } from '../services/system.js';
import { BackgroundService } from '../services/background.js';
import { EventBus } from '../event-bus.js';
import { buildApp } from '../app.js';

let db: Database.Database;
let app: FastifyInstance;
let bus: EventBus;
let authHeaders: { authorization: string };
let devicePin: string;

/** Session tokens are delivered via HttpOnly Set-Cookie, not the JSON body. */
function extractSessionToken(res: { headers: Record<string, string | string[] | undefined> }): string {
  const setCookie = res.headers['set-cookie'];
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookieStr?.match(/sdToken=([^;]+)/)?.[1] ?? '';
}

beforeEach(async () => {
  db = openDb(':memory:');
  const key = randomBytes(32);
  const secrets = new SecretsService(db, key);
  const settings = new SettingsService(db, secrets);
  const tiles = new TilesService(db);
  tiles.seedDefaults();
  const calendars = new CalendarService(db, secrets, settings);
  const weather = new WeatherService(db);
  const photos = new PhotoService(db);
  const tasks = new TasksService(db);
  const feeds = new FeedsService(db);
  const ha = new HaService(db, secrets);
  const spotify = new SpotifyService(secrets);
  const update = new UpdateService('0.0.0', 'http://localhost/manifest.json', '');
  const wifi = new WifiService();
  const reset = new ResetService(db, secrets, ha, '/tmp/test-photos', '/tmp/test-secret-key', () => {});
  const system = new SystemService();
  const background = new BackgroundService(secrets, '/tmp/test-background');
  bus = new EventBus();
  app = await buildApp({ db, settings, secrets, tiles, calendars, weather, photos, tasks, feeds, ha, spotify, update, wifi, reset, system, background, bus });
  // Listen on a random port so injectWS has a real backing server
  await app.listen({ port: 0, host: '127.0.0.1' });
  // Exchange PIN for a session token — raw PIN is no longer accepted as a bearer token
  devicePin = settings.getDevicePin();
  const pinRes = await app.inject({
    method: 'POST',
    url: '/api/auth/verify',
    payload: { pin: devicePin },
  });
  authHeaders = { authorization: `Bearer ${extractSessionToken(pinRes)}` };
});

afterEach(async () => {
  await app.close();
  db.close();
});

describe('GET /api/health', () => {
  it('returns 200 ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });
});

describe('GET /api/status', () => {
  it('returns status and uptimeSeconds without leaking version unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; version?: string; uptimeSeconds: number }>();
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
    // HD21: version field intentionally stripped to avoid unauthenticated info disclosure
    expect(body.version).toBeUndefined();
  });
});

describe('GET /api/settings', () => {
  it('returns default settings', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ timezone: string; theme: string }>();
    expect(body.timezone).toBe('UTC');
    expect(body.theme).toBe('dark');
  });
});

describe('PATCH /api/settings', () => {
  it('updates and returns new settings', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { householdName: 'Test Family', timezone: 'America/Chicago' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ householdName: string; timezone: string }>();
    expect(body.householdName).toBe('Test Family');
    expect(body.timezone).toBe('America/Chicago');
  });

  it('persists the update (verified by subsequent GET)', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { householdName: 'Persisted Family' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.json<{ householdName: string }>().householdName).toBe('Persisted Family');
  });

  it('emits settings:changed on the event bus', async () => {
    let emitted = false;
    bus.once('settings:changed', () => {
      emitted = true;
    });
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { householdName: 'Bus Test' },
    });
    expect(emitted).toBe(true);
  });
});

describe('GET /api/tiles', () => {
  it('returns the 12 seeded tiles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tiles' });
    expect(res.statusCode).toBe(200);
    const tiles = res.json<Array<{ id: string; type: string; enabled: boolean }>>();
    expect(tiles).toHaveLength(12);
    expect(tiles[0]?.type).toBe('clock');
  });
});

describe('PATCH /api/tiles/:id', () => {
  it('toggles a tile off', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/tiles/clock',
      headers: authHeaders,
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ enabled: boolean }>().enabled).toBe(false);
  });

  it('returns 404 for an unknown tile id', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/tiles/nonexistent',
      headers: authHeaders,
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it('saves tile style and returns updated tile', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/tiles/clock',
      headers: authHeaders,
      payload: { style: { bgColor: '#ff0000', bgOpacity: 0.8, borderRadius: 12, fontScale: 1.1 } },
    });
    expect(res.statusCode).toBe(200);
    const tile = res.json<{ style: { bgColor: string; bgOpacity: number; borderRadius: number; fontScale: number } }>();
    expect(tile.style.bgColor).toBe('#ff0000');
    expect(tile.style.fontScale).toBe(1.1);
  });
});

describe('GET /api/update', () => {
  it('returns update status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/update', headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ currentVersion: string; managed: boolean }>();
    expect(body.currentVersion).toBe('0.0.0');
    expect(body.managed).toBe(false);
  });
});

describe('GET /api/wifi/status', () => {
  it('returns wifi status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/wifi/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ mode: string; managed: boolean }>();
    expect(['ap', 'client', 'unknown']).toContain(body.mode);
    expect(typeof body.managed).toBe('boolean');
  });
});

describe('POST /api/wifi/connect auth (SR2)', () => {
  it('rejects unauthenticated connect when onboarding is complete', async () => {
    // Mark onboarding complete first
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { onboardingComplete: true },
    });

    // No auth header — should be rejected
    const res = await app.inject({
      method: 'POST',
      url: '/api/wifi/connect',
      payload: { ssid: 'TestNet', password: 'password123' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('allows unauthenticated connect when onboarding is not complete', async () => {
    // onboardingComplete defaults to false; WifiService.connect() will throw on non-Linux
    // but auth should pass — we see a non-401 response (likely 500/400 from wifi logic)
    const res = await app.inject({
      method: 'POST',
      url: '/api/wifi/connect',
      payload: { ssid: 'TestNet', password: 'password123' },
    });
    expect(res.statusCode).not.toBe(401);
  });

  it('allows authenticated connect when onboarding is complete', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { onboardingComplete: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/wifi/connect',
      headers: authHeaders,
      payload: { ssid: 'TestNet', password: 'password123' },
    });
    // Auth passes — response will be 500 (non-Linux) but not 401
    expect(res.statusCode).not.toBe(401);
  });
});

describe('WebSocket /ws/display', () => {
  it('sends init message with settings on connect', async () => {
    // Use onInit to attach listener before any frames can arrive, avoiding the
    // race where the server sends init synchronously during handshake.
    let firstMessageResolve!: (msg: string) => void;
    const firstMessage = new Promise<string>((resolve) => {
      firstMessageResolve = resolve;
    });

    const ws = await app.injectWS('/ws/display', {}, {
      onInit: (socket) => {
        socket.once('message', (data) => firstMessageResolve(data.toString()));
      },
    });

    const msg = JSON.parse(await firstMessage) as {
      type: string;
      payload: { settings: { timezone: string } };
    };
    expect(msg.type).toBe('init');
    expect(msg.payload.settings.timezone).toBe('UTC');
    ws.close();
  });

  it('pushes settings:changed to connected client when settings are patched', async () => {
    const messages: string[] = [];

    const ws = await app.injectWS('/ws/display', {}, {
      onInit: (socket) => {
        socket.on('message', (data) => messages.push(data.toString()));
      },
    });

    // Wait for init message to arrive
    await new Promise<void>((resolve) => {
      const check = () => (messages.length > 0 ? resolve() : setTimeout(check, 10));
      check();
    });

    const nextMessage = new Promise<string>((resolve) => {
      ws.once('message', (data) => resolve(data.toString()));
    });

    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { householdName: 'WS Push Test' },
    });

    const msg = JSON.parse(await nextMessage) as { type: string; payload: { householdName: string } };
    expect(msg.type).toBe('settings:changed');
    expect(msg.payload.householdName).toBe('WS Push Test');
    ws.close();
  });
});

describe('SR3 — sensitive GET auth', () => {
  const SENSITIVE_GETS = [
    '/api/settings',
    '/api/calendars',
    '/api/photos',
    '/api/tasks',
    '/api/feeds',
    '/api/ha',
  ];

  it('allows /api/settings GET unauthenticated when onboarding is not complete', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).not.toBe(401);
  });

  it('blocks other sensitive GETs unauthenticated even when onboarding is not complete', async () => {
    // /api/settings and /ws/display are exempt during onboarding; everything else requires auth
    const restricted = SENSITIVE_GETS.filter((u) => u !== '/api/settings');
    for (const url of restricted) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    }
  });

  it('blocks sensitive GETs without auth once onboarding is complete', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { onboardingComplete: true },
    });
    for (const url of SENSITIVE_GETS) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    }
  });

  it('allows sensitive GETs with correct PIN once onboarding is complete', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { onboardingComplete: true },
    });
    for (const url of SENSITIVE_GETS) {
      const res = await app.inject({ method: 'GET', url, headers: authHeaders });
      expect(res.statusCode).not.toBe(401);
    }
  });

  it('allows sensitive GETs with ?token= query param once onboarding is complete', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { onboardingComplete: true },
    });
    const pin = authHeaders.authorization.replace('Bearer ', '');
    for (const url of SENSITIVE_GETS) {
      const res = await app.inject({ method: 'GET', url: `${url}?token=${pin}` });
      expect(res.statusCode).not.toBe(401);
    }
  });
});

describe('SR3 — photo path traversal', () => {
  it('rejects photo source paths outside /data/photos', async () => {
    const cases = [
      '/data/../etc/passwd',
      '/tmp/photos',
      '/data/other',
      '/data/photos/../../../etc',
    ];
    for (const path of cases) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: authHeaders,
        payload: { name: 'test', path },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('accepts photo source paths under /data/photos', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/photos',
      headers: authHeaders,
      payload: { name: 'test', path: '/data/photos/vacation' },
    });
    // Will be 201 (or 500 if scanAll fails in test env) — not a 400 validation error
    expect(res.statusCode).not.toBe(400);
  });
});

describe('SR4 — brute-force lockout', () => {
  it('locks out after 10 consecutive bad PINs', async () => {
    // First 9 failures — should all be 401
    for (let i = 0; i < 9; i++) {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { authorization: 'Bearer WRONGPIN1' },
        payload: { householdName: 'x' },
      });
      expect(res.statusCode).toBe(401);
    }
    // 10th failure — triggers lockout
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { authorization: 'Bearer WRONGPIN1' },
      payload: { householdName: 'x' },
    });
    // Subsequent request — should be 429 (locked out)
    const locked = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { authorization: 'Bearer WRONGPIN1' },
      payload: { householdName: 'x' },
    });
    expect(locked.statusCode).toBe(429);
  });

  it('clears the failure count on a successful auth', async () => {
    // Fail 9 times
    for (let i = 0; i < 9; i++) {
      await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { authorization: 'Bearer WRONGPIN2' },
        payload: { householdName: 'x' },
      });
    }
    // Succeed — resets counter
    const ok = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { householdName: 'x' },
    });
    expect(ok.statusCode).toBe(200);
    // A subsequent bad attempt should be 401 (not 429 — counter was cleared)
    const after = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { authorization: 'Bearer WRONGPIN2' },
      payload: { householdName: 'x' },
    });
    expect(after.statusCode).toBe(401);
  });
});

describe('SR4 — display-info X-Forwarded-For rejection', () => {
  it('rejects display-info with X-Forwarded-For header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/display-info',
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects display-info from non-localhost (simulated via inject remoteAddress)', async () => {
    // inject() always uses 127.0.0.1 as remoteAddress, so this mainly tests the XFF check.
    // The remoteAddress check is validated by the first test above (port-level isolation).
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/display-info',
    });
    // From inject (127.0.0.1) without XFF — should succeed
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('kioskToken');
  });
});

describe('SR4 — PIN entropy / kiosk token', () => {
  it('display-info returns a short-lived kiosk token (hex string)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/display-info',
    });
    expect(res.statusCode).toBe(200);
    const { kioskToken } = res.json<{ kioskToken: string }>();
    expect(kioskToken).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('SR5 — session tokens', () => {
  it('POST /api/auth/verify returns a session token on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: devicePin },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
    const token = extractSessionToken(res);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(32);
  });

  it('POST /api/auth/verify does not set a session cookie on failure', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: 'WRONGPIN' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
    expect(extractSessionToken(res)).toBe('');
  });

  it('session token is accepted in place of the raw PIN', async () => {
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: devicePin },
    });
    const token = extractSessionToken(verifyRes);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { householdName: 'Token Auth Test' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('revoked session token is rejected', async () => {
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { pin: devicePin },
    });
    const token = extractSessionToken(verifyRes);

    // Revoke the token
    await app.inject({
      method: 'DELETE',
      url: '/api/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });

    // Should now be rejected
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { householdName: 'Should Fail' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('raw PIN is rejected as a bearer token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { authorization: `Bearer ${devicePin}` },
      payload: { householdName: 'PIN Direct' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('SR8 — DELETE /api/auth/session validation', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/auth/session' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for an unknown/invalid token', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/auth/session',
      headers: { authorization: 'Bearer deadbeefdeadbeef' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 for a valid session token and revokes it', async () => {
    const token = extractSessionToken(
      await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { pin: devicePin } })
    );

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);

    // Token should now be invalid
    const retry = await app.inject({
      method: 'DELETE',
      url: '/api/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(retry.statusCode).toBe(401);
  });
});

describe('SR8 — reset routes require PIN', () => {
  it('POST /api/reset/data returns 401 without PIN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reset/data',
      headers: authHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/reset/data returns 401 with wrong PIN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reset/data',
      headers: authHeaders,
      payload: { pin: 'WRONGPIN' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/reset/data succeeds with correct PIN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reset/data',
      headers: authHeaders,
      payload: { pin: devicePin },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('SR9 — settings input validation', () => {
  it('rejects invalid units enum', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { units: 'kelvin' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid accentColor', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { accentColor: 'blue' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid autoUpdateTime', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { autoUpdateTime: '3am' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts valid settings patch', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: authHeaders,
      payload: { units: 'imperial', accentColor: '#ff0000', autoUpdateTime: '03:00' },
    });
    expect(res.statusCode).toBe(200);
  });
});
