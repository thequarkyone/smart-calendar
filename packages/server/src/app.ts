import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { existsSync } from 'node:fs';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SettingsService } from './services/settings.js';
import type { SecretsService } from './services/secrets.js';
import type { TilesService } from './services/tiles.js';
import type { CalendarService } from './services/calendar.js';
import type { WeatherService } from './services/weather.js';
import type { PhotoService } from './services/photos.js';
import type { TasksService } from './services/tasks.js';
import type { FeedsService } from './services/feeds.js';
import type { HaService } from './services/homeassistant.js';
import type { SpotifyService } from './services/spotify.js';
import type { UpdateService } from './services/update.js';
import type { WifiService } from './services/wifi.js';
import type { ResetService } from './services/reset.js';
import type { SystemService } from './services/system.js';
import type { BackgroundService } from './services/background.js';
import type { EventBus } from './event-bus.js';
import { healthRoutes } from './routes/health.js';
import { createUpdateRoutes } from './routes/update.js';
import { createSettingsRoutes } from './routes/settings.js';
import { createTilesRoutes } from './routes/tiles.js';
import { createCalendarRoutes } from './routes/calendars.js';
import { createWeatherRoutes } from './routes/weather.js';
import { createPhotosRoutes } from './routes/photos.js';
import { createTasksRoutes } from './routes/tasks.js';
import { createFeedsRoutes } from './routes/feeds.js';
import { createHaRoutes } from './routes/homeassistant.js';
import { createDisplayWsRoute } from './routes/ws-display.js';
import { createTemplatesRoutes } from './routes/templates.js';
import { createWifiRoutes } from './routes/wifi.js';
import { createResetRoutes } from './routes/reset.js';
import { createSystemRoutes } from './routes/system.js';
import { createMotdRoutes } from './routes/motd.js';
import { createBackupRoutes } from './routes/backup.js';
import { createSpotifyRoutes } from './routes/spotify.js';
import { createScreenRoutes } from './routes/screen.js';
import { createBackgroundRoutes } from './routes/background.js';

export interface AppContext {
  db: Database.Database;
  settings: SettingsService;
  secrets: SecretsService;
  tiles: TilesService;
  calendars: CalendarService;
  weather: WeatherService;
  photos: PhotoService;
  tasks: TasksService;
  feeds: FeedsService;
  ha: HaService;
  spotify: SpotifyService;
  update: UpdateService;
  wifi: WifiService;
  reset: ResetService;
  system: SystemService;
  background: BackgroundService;
  bus: EventBus;
  webConfigDir?: string;
  webDisplayDir?: string;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// /api/wifi/connect is NOT in this list — it is conditionally exempt in the preHandler below.
const AUTH_EXEMPT_PATHS = new Set(['/api/auth/verify', '/api/wifi/status', '/api/health', '/api/calendars/oauth/google/callback', '/api/spotify/callback', '/api/screen/wake']);
// GETs that expose private data require auth once onboarding is complete.
// Prefix-based so any future sub-routes under these paths are automatically gated.
const SENSITIVE_GET_PREFIXES = [
  '/api/settings',
  '/api/calendars',
  '/api/photos',
  '/api/tasks',
  '/api/feeds',
  '/api/ha',
  '/api/spotify',
  '/api/update',
  '/api/backup',
  '/ws/display',
];

// Brute-force lockout: global failed-auth counter (scoped per app instance).
// This is a single-user home device — a global lockout after N consecutive bad PINs
// is the right model. An attacker rotating IPs can't bypass it; the legitimate user
// just looks at the display to get the correct PIN.
const MAX_FAILURES = 10;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

// Session token store: opaque 32-byte hex token → expiry timestamp (sliding 24 h)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 10;
const sessionTokens = new Map<string, number>();

function createSessionToken(): string {
  // Evict the oldest token if at capacity before creating a new one
  if (sessionTokens.size >= MAX_SESSIONS) {
    let oldestToken = '';
    let oldestExpiry = Infinity;
    for (const [tok, exp] of sessionTokens) {
      if (exp < oldestExpiry) { oldestExpiry = exp; oldestToken = tok; }
    }
    if (oldestToken) sessionTokens.delete(oldestToken);
  }
  const token = randomBytes(32).toString('hex');
  sessionTokens.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function validateSessionToken(token: string): boolean {
  const expiry = sessionTokens.get(token);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) { sessionTokens.delete(token); return false; }
  sessionTokens.set(token, Date.now() + SESSION_TTL_MS); // sliding
  return true;
}

function revokeSessionToken(token: string): void {
  sessionTokens.delete(token);
}

/** Clears all active session tokens — called after a data or factory reset. */
export function clearAllSessions(): void {
  sessionTokens.clear();
}

// Kiosk tokens: short-lived (60 s), single-use tokens issued by display-info.
// The kiosk page fetches one, uses it once for the WS connect, then it's gone.
// This prevents XSS-in-display from extracting the durable PIN via display-info.
const KIOSK_TTL_MS = 60 * 1000;
const MAX_KIOSK_TOKENS = 5;
const kioskTokens = new Map<string, number>();

function createKioskToken(): string {
  // Evict expired tokens; if still at capacity, evict the oldest to cap map size.
  const now = Date.now();
  for (const [tok, exp] of kioskTokens) {
    if (exp < now) kioskTokens.delete(tok);
  }
  if (kioskTokens.size >= MAX_KIOSK_TOKENS) {
    let oldestToken = '';
    let oldestExpiry = Infinity;
    for (const [tok, exp] of kioskTokens) {
      if (exp < oldestExpiry) { oldestExpiry = exp; oldestToken = tok; }
    }
    if (oldestToken) kioskTokens.delete(oldestToken);
  }
  const token = randomBytes(16).toString('hex');
  kioskTokens.set(token, Date.now() + KIOSK_TTL_MS);
  return token;
}

function validateKioskToken(token: string): boolean {
  const expiry = kioskTokens.get(token);
  if (expiry === undefined) return false;
  // Single-use: delete on first successful validation regardless of expiry
  kioskTokens.delete(token);
  return Date.now() <= expiry;
}

// Hourly GC: evict expired tokens so the maps don't grow unboundedly on long-running Pi deployments
setInterval(() => {
  const now = Date.now();
  for (const [tok, exp] of sessionTokens) {
    if (exp < now) sessionTokens.delete(tok);
  }
  for (const [tok, exp] of kioskTokens) {
    if (exp < now) kioskTokens.delete(tok);
  }
}, 60 * 60 * 1000).unref();

function makeAuthGuard(db: Database.Database) {
  // Persist lockout state so a reboot doesn't reset the counter mid-attack
  type LockoutRow = { lockout_failures: number; lockout_until: string | null };
  const initial = db
    .prepare('SELECT lockout_failures, lockout_until FROM system WHERE id = 1')
    .get() as LockoutRow | undefined;
  let failCount = initial?.lockout_failures ?? 0;
  let lockedUntil = initial?.lockout_until ? new Date(initial.lockout_until).getTime() : 0;

  const persist = () => {
    db.prepare('UPDATE system SET lockout_failures = ?, lockout_until = ? WHERE id = 1')
      .run(failCount, lockedUntil > 0 ? new Date(lockedUntil).toISOString() : null);
  };

  return {
    isLockedOut(): boolean {
      if (lockedUntil > Date.now()) return true;
      if (lockedUntil !== 0) { failCount = 0; lockedUntil = 0; persist(); }
      return false;
    },
    recordFailure(): void {
      failCount += 1;
      if (failCount >= MAX_FAILURES) lockedUntil = Date.now() + LOCKOUT_MS;
      persist();
    },
    clearFailures(): void {
      failCount = 0;
      lockedUntil = 0;
      persist();
    },
  };
}

export async function buildApp(ctx: AppContext) {
  const authGuard = makeAuthGuard(ctx.db);
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test'
      ? {
          redact: ['req.headers.authorization'],
          serializers: {
            req(req) {
              // Strip ?token= query param from logged URLs so raw PINs never appear in logs
              const url = (req.url as string | undefined) ?? '';
              const safeUrl = url.replace(/([?&])token=[^&]*/g, '$1token=REDACTED');
              return { method: req.method, url: safeUrl, hostname: req.hostname };
            },
          },
        }
      : false,
    bodyLimit: 4096,
  });

  const corsOrigins: string[] = ['http://smartdisplay.local'];
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    // Dev/test origins — never added in production (NODE_ENV defaults to restrictive when unset)
    corsOrigins.push('http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000');
  }
  await app.register(cors, { origin: corsOrigins });
  await app.register(fastifyWebsocket);
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  // Security headers on all responses
  app.addHook('onSend', (req, reply, _payload, done) => {
    const wsOrigins = process.env.NODE_ENV === 'production'
      ? 'ws://smartdisplay.local wss://smartdisplay.local'
      : 'ws://smartdisplay.local wss://smartdisplay.local ws://localhost:3000 ws://localhost:5173 ws://localhost:5174';
    // /display is intentionally iframed by web-config's own Live Preview (same-origin) — allow
    // 'self' there so the embed isn't blocked, while every other page stays fully un-frameable.
    const frameAncestors = req.url.startsWith('/display') ? "'self'" : "'none'";
    void reply.header(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.scdn.co; connect-src 'self' ${wsOrigins}; frame-ancestors ${frameAncestors}; report-uri /api/csp-report`,
    );
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Referrer-Policy', 'no-referrer');
    void reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    done();
  });

  // Captive portal detection: when running in AP mode, all DNS resolves to us.
  // Non-API, non-local requests (captive portal probes from phones/laptops) get
  // redirected to the setup page so the OS opens our onboarding wizard.
  app.addHook('onRequest', (req, reply, done) => {
    // Use the socket's local IP (not the Host header, which is attacker-controlled)
    // to decide if this is a local/captive-portal request. Fall back to Host header
    // if socket info is unavailable (e.g. certain test scenarios).
    const localAddr = req.socket?.localAddress ?? '';
    const host = localAddr ? '' : (req.headers.host ?? '');
    const isLocalHost = localAddr
      ? (localAddr === '127.0.0.1' ||
        localAddr === '::1' ||
        localAddr === '::ffff:127.0.0.1' ||
        localAddr.startsWith('192.168.') ||
        localAddr.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(localAddr))
      : (host === 'smartdisplay.local' ||
        host.startsWith('localhost') ||
        host.startsWith('127.0.0.1') ||
        host.startsWith('192.168.'));
    const isApiOrWs =
      req.url.startsWith('/api') ||
      req.url.startsWith('/ws') ||
      req.url.startsWith('/display');
    if (!isLocalHost && !isApiOrWs) {
      void reply.status(302).redirect('http://smartdisplay.local/');
      return;
    }
    done();
  });

  // Device PIN auth: required on all mutating routes and on sensitive GETs once onboarding
  // is complete. /api/wifi/connect is exempt only while in AP/onboarding mode.
  // /ws/display and sensitive GETs accept token via Authorization header OR ?token= query.
  app.addHook('preHandler', (req, reply, done) => {
    // Use Fastify's matched route pattern (req.routeOptions.url) for auth checks — this is
    // already normalised and decoded, preventing percent-encoding bypass of prefix checks.
    // Fall back to decoded req.url only for unmatched paths (e.g. 404s).
    const routePattern: string = (req.routeOptions as { url?: string }).url ?? '';
    const path = routePattern || (() => { try { return decodeURIComponent(req.url.split('?')[0] ?? ''); } catch { return req.url.split('?')[0] ?? ''; } })();
    const isMutating = MUTATING_METHODS.has(req.method);
    const isSensitiveGet = req.method === 'GET' && SENSITIVE_GET_PREFIXES.some(
      (p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'),
    );
    if (!isMutating && !isSensitiveGet) { done(); return; }
    if (AUTH_EXEMPT_PATHS.has(path)) { done(); return; }
    if (path === '/api/wifi/connect') {
      const settings = ctx.settings.get();
      const wifiStatus = ctx.wifi.getStatus();
      if (!settings.onboardingComplete || wifiStatus.mode === 'ap') { done(); return; }
    }
    // During onboarding, only /api/settings GET and /ws/display are exempt from auth:
    // - the wizard reads settings to show current state
    // - the kiosk display connects before onboarding completes and has no data to protect
    // All other sensitive GETs (photos, feeds, HA, update, etc.) require auth even before
    // onboarding completes.
    if (isSensitiveGet && !isMutating && !ctx.settings.get().onboardingComplete) {
      if (path === '/api/settings' || path.startsWith('/api/settings/') || path === '/ws/display') { done(); return; }
    }
    // Brute-force lockout check (global counter — single-user home device)
    if (authGuard.isLockedOut()) {
      void reply.status(429).send({ error: 'Too many failed attempts. Try again later.' });
      return;
    }
    // Accept Bearer token from Authorization header, ?token= query param (WS upgrade), or httpOnly cookie
    const auth = req.headers.authorization ?? '';
    let token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      token = (req.query as Record<string, string | undefined>).token ?? '';
    }
    if (!token) {
      const cookieHeader = req.headers.cookie ?? '';
      token = cookieHeader.match(/(?:^|;\s*)sdToken=([^;]+)/)?.[1] ?? '';
    }
    // Accept: session token (web-config) or kiosk token (display WS connect).
    // Raw PIN is NOT accepted here — callers must exchange it for a session token at /api/auth/verify.
    // Kiosk tokens are short-lived (60s) and single-use — see createKioskToken().
    const valid = validateSessionToken(token) || validateKioskToken(token);
    if (!valid) {
      authGuard.recordFailure();
      req.log.warn({ ip: req.ip, path, method: req.method }, 'auth: invalid token');
      void reply.status(401).send({ error: 'Unauthorized' });
      return;
    }
    // Do NOT clear the brute-force counter here — only a correct PIN at /api/auth/verify
    // should reset it. Clearing on every authenticated request would allow an attacker with
    // a stolen session token to interleave requests and get unlimited PIN guesses.
    done();
  });

  if (ctx.webConfigDir && existsSync(ctx.webConfigDir)) {
    await app.register(fastifyStatic, {
      root: ctx.webConfigDir,
      wildcard: false,
    });
  }

  if (ctx.webDisplayDir && existsSync(ctx.webDisplayDir)) {
    // @fastify/static with a prefix does not auto-redirect the bare prefix (no trailing slash) to
    // the trailing-slash form it actually serves — GET /display 404s while GET /display/ works.
    // The kiosk launcher and preview iframe both hit the bare form, so redirect defensively.
    app.get('/display', (_req, reply) => {
      void reply.status(301).redirect('/display/');
    });
    await app.register(fastifyStatic, {
      root: ctx.webDisplayDir,
      prefix: '/display',
      wildcard: false,
      decorateReply: false,
    });
  }

  // PIN verification endpoint — no auth required, rate-limited tightly.
  // On success returns a short-lived session token; web-config stores and sends
  // this token on subsequent requests so the raw PIN never appears again.
  app.post('/api/auth/verify', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['pin'],
        properties: { pin: { type: 'string', maxLength: 64 } },
      },
    },
  }, async (req, reply) => {
    if (authGuard.isLockedOut()) {
      return reply.status(429).send({ ok: false, error: 'Too many failed attempts. Try again later.' });
    }
    const { pin } = req.body as { pin?: string };
    const correct = ctx.settings.getDevicePin();
    const provided = typeof pin === 'string' ? pin : '';
    // Reject obviously-too-long inputs before doing any crypto work
    if (provided.length > 64) {
      authGuard.recordFailure();
      return reply.status(401).send({ ok: false });
    }
    const maxLen = Math.max(provided.length, correct.length);
    const providedBuf = Buffer.from(provided.padEnd(maxLen, '\0'));
    const correctBuf = Buffer.from(correct.padEnd(maxLen, '\0'));
    const ok = timingSafeEqual(providedBuf, correctBuf) && provided.length === correct.length;
    if (!ok) {
      authGuard.recordFailure();
      return reply.status(401).send({ ok: false });
    }
    authGuard.clearFailures();
    const token = createSessionToken();
    void reply.header('Set-Cookie', `sdToken=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
    return reply.send({ ok: true });
  });

  // Session revocation — validates the token before revoking to prevent oracle attacks.
  // Accepts token from Authorization header OR the httpOnly cookie (matching preHandler extraction).
  app.delete('/api/auth/session', (req, reply) => {
    const auth = req.headers.authorization ?? '';
    let token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      const cookieHeader = req.headers.cookie ?? '';
      token = cookieHeader.match(/(?:^|;\s*)sdToken=([^;]+)/)?.[1] ?? '';
    }
    if (!token || !validateSessionToken(token)) {
      return reply.status(401).send({ error: 'Invalid or missing session token' });
    }
    revokeSessionToken(token);
    void reply.header('Set-Cookie', 'sdToken=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return reply.send({ ok: true });
  });

  // Display-info endpoint: issues a short-lived kiosk token + AP PSK — only accessible from
  // localhost (the kiosk). Returns a single-use 60s kiosk token instead of the raw PIN so
  // that an XSS flaw in the display page cannot exfiltrate the durable PIN.
  // IMPORTANT: this server must never be placed behind a reverse proxy — if X-Forwarded-For
  // is present the request could be spoofed from outside, so we reject it outright.
  app.get('/api/auth/display-info', {
    // Higher limit for localhost-only kiosk: reconnects happen on every page reload.
    // No DoS risk since only the local kiosk process can reach this path.
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    if (req.headers['x-forwarded-for']) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const ip = req.socket.remoteAddress ?? '';
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLocalhost) return reply.status(403).send({ error: 'Forbidden' });
    // apPsk is intentionally excluded — it is sensitive and served only via authenticated endpoints.
    return reply.send({ kioskToken: createKioskToken() });
  });

  // CSP violation reports — log and discard; no auth required (browser sends these automatically).
  // Tight rate limit and bounded logging to prevent log-fill from malicious reports.
  app.post('/api/csp-report', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    const report = (body?.['csp-report'] ?? body) as Record<string, unknown> | null;
    req.log.warn({
      violatedDirective: typeof report?.['violated-directive'] === 'string' ? report['violated-directive'] : undefined,
      blockedUri: typeof report?.['blocked-uri'] === 'string' ? report['blocked-uri'] : undefined,
    }, 'CSP violation report');
    return reply.status(204).send();
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(createSettingsRoutes(ctx.settings, ctx.bus), { prefix: '/api' });
  await app.register(createTilesRoutes(ctx.tiles, ctx.bus), { prefix: '/api' });
  await ctx.calendars.seedBuiltinHolidaysCalendar().catch((err: unknown) => {
    console.error('[calendar] failed to seed built-in holidays calendar:', (err as Error).message ?? err);
  });
  await app.register(createCalendarRoutes(ctx.calendars, ctx.bus), { prefix: '/api' });
  await app.register(createWeatherRoutes(ctx.weather, ctx.settings, ctx.bus));
  await app.register(createPhotosRoutes(ctx.photos, ctx.bus));
  await app.register(createTasksRoutes(ctx.tasks, ctx.bus));
  await app.register(createFeedsRoutes(ctx.feeds, ctx.bus));
  await app.register(createHaRoutes(ctx.ha, ctx.bus));
  await app.register(createTemplatesRoutes());
  await app.register(createUpdateRoutes(ctx.update), { prefix: '/api' });
  await app.register(createWifiRoutes(ctx.wifi), { prefix: '/api' });
  // Separate in-memory guard for reset-PIN failures so valid session tokens (which clear
  // the global authGuard on successful auth) cannot reset the lockout counter between
  // destructive reset attempts. Not persisted across reboots (5-min window is acceptable).
  type ResetLockoutRow = { reset_fail_count: number; reset_locked_until: string | null };
  const resetInitial = ctx.db
    .prepare('SELECT reset_fail_count, reset_locked_until FROM system WHERE id = 1')
    .get() as ResetLockoutRow | undefined;
  let resetFailCount = resetInitial?.reset_fail_count ?? 0;
  let resetLockedUntil = resetInitial?.reset_locked_until ? new Date(resetInitial.reset_locked_until).getTime() : 0;
  const persistResetGuard = () => {
    ctx.db
      .prepare('UPDATE system SET reset_fail_count = ?, reset_locked_until = ? WHERE id = 1')
      .run(resetFailCount, resetLockedUntil > 0 ? new Date(resetLockedUntil).toISOString() : null);
  };
  const resetGuard = {
    isLockedOut(): boolean {
      if (resetLockedUntil > Date.now()) return true;
      if (resetLockedUntil !== 0) { resetFailCount = 0; resetLockedUntil = 0; persistResetGuard(); }
      return false;
    },
    recordFailure(): void {
      resetFailCount += 1;
      if (resetFailCount >= MAX_FAILURES) resetLockedUntil = Date.now() + LOCKOUT_MS;
      persistResetGuard();
    },
    clearFailures(): void { resetFailCount = 0; resetLockedUntil = 0; persistResetGuard(); },
  };
  await app.register(createResetRoutes(ctx.reset, ctx.settings, resetGuard, clearAllSessions), { prefix: '/api' });
  await app.register(createSystemRoutes(ctx.system), { prefix: '/api' });
  await app.register(createMotdRoutes(ctx.tiles, ctx.bus));
  await app.register(createBackupRoutes(ctx), { prefix: '/api' });
  await app.register(createSpotifyRoutes(ctx.spotify, ctx.bus));
  await app.register(createScreenRoutes(ctx.bus));
  await app.register(createBackgroundRoutes(ctx.background, ctx.secrets, ctx.settings, ctx.bus));
  await app.register(createDisplayWsRoute(ctx.settings, ctx.tiles, ctx.calendars, ctx.weather, ctx.photos, ctx.tasks, ctx.feeds, ctx.ha, ctx.wifi, ctx.spotify, ctx.background, ctx.bus));

  return app;
}
