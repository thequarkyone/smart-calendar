import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';

// Many home routers hand out a private ULA (fd00::/8) as the device's only IPv6 address —
// Linux reports it as "global scope" (it's not link-local) but it isn't actually
// internet-routable. DNS still returns real AAAA records for external hosts, so Node's default
// dual-stack resolution intermittently tries that dead IPv6 path first and stalls/fails before
// falling back to IPv4 — surfacing as flaky, confusing errors on calendar sync, weather, and
// update checks depending on which address wins the race. Preferring IPv4 avoids the wasted
// attempt entirely; it's a no-op on networks with working IPv6.
setDefaultResultOrder('ipv4first');
import { config } from './config.js';
import { openDb } from './db/index.js';
import { loadOrCreateKey, SecretsService } from './services/secrets.js';
import { SettingsService } from './services/settings.js';
import { TilesService } from './services/tiles.js';
import { CalendarService } from './services/calendar.js';
import { WeatherService } from './services/weather.js';
import { PhotoService } from './services/photos.js';
import { TasksService } from './services/tasks.js';
import { FeedsService } from './services/feeds.js';
import { HaService } from './services/homeassistant.js';
import { SpotifyService } from './services/spotify.js';
import { UpdateService } from './services/update.js';
import { WifiService } from './services/wifi.js';
import { ResetService } from './services/reset.js';
import { SystemService } from './services/system.js';
import { BackgroundService } from './services/background.js';
import { ThemeScheduler } from './services/theme-scheduler.js';
import { EventBus } from './event-bus.js';
import { buildApp } from './app.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function timeInSleepWindow(current: string, start: string, end: string): boolean {
  // Handles windows that wrap midnight (e.g. 22:00–06:00)
  if (start <= end) return current >= start && current < end;
  return current >= start || current < end;
}

async function main(): Promise<void> {
  console.log(`[smart-display] server v${config.version} starting`);

  const db = openDb(config.dbPath);
  console.log(`[smart-display] database ready at ${config.dbPath}`);

  const key = loadOrCreateKey(config.keyPath);
  const secrets = new SecretsService(db, key);
  const settings = new SettingsService(db, secrets);
  const tiles = new TilesService(db);
  tiles.seedDefaults();
  const calendars = new CalendarService(db, secrets, settings);
  const weather = new WeatherService(db);
  const photos = new PhotoService(db);
  const tasks = new TasksService(db);
  const feeds = new FeedsService(db, secrets);
  const ha = new HaService(db, secrets);
  const spotify = new SpotifyService(secrets);
  const update = new UpdateService(config.version, config.manifestUrl, config.installDir);
  const wifi = new WifiService();
  const bus = new EventBus();
  const themeScheduler = new ThemeScheduler(settings, bus);
  const photoDir = join(config.dataDir, 'photos');
  const reset = new ResetService(db, secrets, ha, photoDir, config.keyPath, () => {
    // Invalidate any in-memory state that the services cache
    bus.emit('settings:changed', settings.get());
  });
  const system = new SystemService();
  const background = new BackgroundService(secrets, config.dataDir);

  const webConfigDir = join(packageRoot, '..', 'web-config', 'dist');
  const webDisplayDir = join(packageRoot, '..', 'web-display', 'dist');

  const app = await buildApp({
    db, settings, secrets, tiles, calendars, weather, photos, tasks, feeds, ha, spotify, update, wifi, reset, system, background, bus,
    webConfigDir, webDisplayDir,
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[smart-display] listening on :${config.port}`);

  // --- Pollers ---
  const pollerHandles: ReturnType<typeof setInterval>[] = [];

  // Initial fetch on startup (don't wait for first interval)
  const s0 = settings.get();
  if (s0.location) {
    weather.fetch(s0.location.latitude, s0.location.longitude, s0.units)
      .then((state) => { bus.emit('weather:state', state); themeScheduler.schedule(state); })
      .catch((err: unknown) => console.error('[weather] initial fetch error', err));
  }

  // Weather: poll every 10 minutes if location is set
  pollerHandles.push(setInterval(() => {
    const s = settings.get();
    const loc = s.location;
    if (!loc) return;
    weather.fetch(loc.latitude, loc.longitude, s.units)
      .then((state) => { bus.emit('weather:state', state); themeScheduler.schedule(state); })
      .catch((err: unknown) => console.error('[weather] poll error', err));
  }, 10 * 60 * 1000));

  // Photos: advance every 30 seconds if there are photos
  photos.scanAll();
  pollerHandles.push(setInterval(() => {
    if (photos.getState().totalCount === 0) return;
    photos.advance();
    bus.emit('photos:state', photos.getState());
  }, 30 * 1000));

  // Cycling background photo: fetch once at boot if enabled, then once every 24h. Individual
  // source fetch errors (bad/missing key, API down, today's APOD is a video) are logged and
  // simply leave yesterday's cached image in place rather than blanking the display.
  const doBackgroundRefresh = (): void => {
    const s = settings.get();
    if (!s.bgCyclingEnabled) return;
    background.refresh(s.bgCyclingSource)
      .then((state) => bus.emit('background:state', state))
      .catch((err: unknown) => console.error('[background] refresh error', (err as Error).message ?? err));
  };
  doBackgroundRefresh();
  pollerHandles.push(setInterval(doBackgroundRefresh, 24 * 60 * 60 * 1000));

  // Feeds: refresh every 15 minutes (also trigger initial refresh)
  const doFeedsRefresh = (): void => {
    const sources = feeds.list().filter((s) => s.enabled);
    Promise.allSettled(sources.map((s) =>
      feeds.sync(s.id).catch((err: unknown) => {
        // Log source ID only — the error message may contain the feed URL
        console.error(`[feeds] sync error for source ${s.id}:`, (err as Error).message ?? err);
      }),
    )).then(() => bus.emit('feeds:state', feeds.getState())).catch(() => { /* allSettled never rejects */ });
  };
  doFeedsRefresh();
  pollerHandles.push(setInterval(doFeedsRefresh, 15 * 60 * 1000));

  // Calendars: re-sync all enabled calendars every hour (also trigger initial sync on startup)
  const doCalendarSync = (): void => {
    const sources = calendars.list().filter((s) => s.enabled);
    Promise.allSettled(sources.map((s) =>
      calendars.sync(s.id).catch((err: unknown) => {
        console.error(`[calendar] sync error for source ${s.id}:`, (err as Error).message ?? err);
      }),
    )).then(() => bus.emit('calendar:state', calendars.getState())).catch(() => { /* allSettled never rejects */ });
  };
  doCalendarSync();
  pollerHandles.push(setInterval(doCalendarSync, 60 * 60 * 1000));

  // Auto-update: per-minute check.
  // Scheduled mode (autoUpdateTime set): fires once when clock matches "HH:mm".
  // Anytime mode (autoUpdateTime null): fires once every 24 h.
  const AUTOUPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
  let lastAutoUpdateRun = Date.now(); // treat boot as a run so anytime mode waits 24 h first
  let lastAutoUpdateMinute = '';
  const runAutoUpdate = (): void => {
    lastAutoUpdateRun = Date.now();
    update.check()
      .then(async (status) => {
        if (!status.updateAvailable || !status.managed) return;
        console.log(`[update] auto-update: applying v${status.latestVersion ?? '?'}`);
        await update.apply();
        console.log('[update] auto-update applied; service restarting');
      })
      .catch((err: unknown) => console.error('[update] auto-update error:', err));
  };
  pollerHandles.push(setInterval(() => {
    const s = settings.get();
    if (!s.autoUpdate) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const currentMinute = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (s.autoUpdateTime) {
      // Scheduled: fire exactly once when the minute matches, then skip until next day
      if (currentMinute === s.autoUpdateTime && lastAutoUpdateMinute !== currentMinute) {
        lastAutoUpdateMinute = currentMinute;
        runAutoUpdate();
      }
    } else {
      // Anytime: fire once every 24 h
      if (Date.now() - lastAutoUpdateRun >= AUTOUPDATE_INTERVAL_MS) {
        runAutoUpdate();
      }
    }
  }, 60_000));

  // Screen sleep/dim: check every minute. Emits the correct state on every tick rather than
  // only on a detected transition — the kiosk deliberately preserves its own sleep/dim state
  // across WebSocket reconnects (avoids a visible flicker), so gating on a remembered
  // in-memory flag (reset to false by every server restart) meant a restart happening while the
  // client was genuinely asleep left it permanently stuck showing "Tap to wake" with no way to
  // self-correct. Emitting idempotently every tick makes it self-healing within a minute
  // regardless of how client/server state drifted apart.
  pollerHandles.push(setInterval(() => {
    const s = settings.get();
    const sleepWindow = s.screenSleep;
    if (!sleepWindow) {
      bus.emit('screen:wake');
      return;
    }
    // Must use the configured display timezone, not the server's raw OS clock — the Pi's
    // system timezone has no reason to match where the device actually lives (confirmed this
    // session: server clock was BST while the household is in a different zone entirely), so
    // comparing s.screenSleep against now.getHours() silently evaluated the window several
    // hours off from what the user actually configured.
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: s.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const current = `${hh}:${mm}`;
    const { start, end } = sleepWindow;
    const inWindow = timeInSleepWindow(current, start, end);
    if (inWindow) {
      if (s.screenDimEnabled) {
        bus.emit('screen:dim', s.screenDimLevel);
      } else {
        bus.emit('screen:sleep');
      }
    } else {
      bus.emit('screen:wake');
    }
  }, 60 * 1000));

  // Spotify: poll only when a display WS client is connected and the tile is enabled
  spotify.setOnStateChange(() => bus.emit('spotify:state', spotify.getState()));

  // HA: live WebSocket subscription (replaces 1-min poller)
  ha.setOnStateChange(() => bus.emit('ha:state', ha.getState()));
  const haSettings = ha.getHaSettings();
  if (haSettings.enabled && haSettings.url) {
    ha.connectWs();
  }

  // Graceful shutdown: clear pollers, close server
  const shutdown = (): void => {
    console.log('[smart-display] shutting down');
    for (const handle of pollerHandles) clearInterval(handle);
    themeScheduler.clearTimers();
    spotify.stopPolling();
    ha.disconnectWs();
    app.close().catch((err: unknown) => console.error('[smart-display] close error', err));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error('[smart-display] fatal error', err);
  process.exit(1);
});
