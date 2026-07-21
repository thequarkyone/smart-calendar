import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { BackgroundState, CalendarState, FeedsState, HaState, PhotoState, Settings, SpotifyState, TasksState, Tile, WeatherState } from '@smart-display/shared';
import type { SettingsService } from '../services/settings.js';
import type { TilesService } from '../services/tiles.js';
import type { WifiService } from '../services/wifi.js';
import type { CalendarService } from '../services/calendar.js';
import type { WeatherService } from '../services/weather.js';
import type { PhotoService } from '../services/photos.js';
import type { TasksService } from '../services/tasks.js';
import type { FeedsService } from '../services/feeds.js';
import type { HaService } from '../services/homeassistant.js';
import type { SpotifyService } from '../services/spotify.js';
import type { BackgroundService } from '../services/background.js';
import type { EventBus } from '../event-bus.js';
import { getLanIp } from '../util/lan-ip.js';
import { readApPsk } from '../util/ap-psk.js';

// How often an already-connected display re-checks wifiMode/apPsk/deviceIp. The kiosk's WS
// typically connects at boot and stays open indefinitely, but all three of these can change
// well after that first connection — most notably, the AP-mode fallback's own 20s "wait for
// connectivity, then start the hotspot" decision (smartdisplay-network-fallback.sh) always
// completes *after* a client that connected at boot would have already received its one-shot
// `init` payload. Without a periodic re-check, the onboarding overlay stays frozen on
// whatever (often null/pre-network) snapshot it saw at connect time.
const NETWORK_STATE_POLL_MS = 10_000;

export function createDisplayWsRoute(
  settingsService: SettingsService,
  tilesService: TilesService,
  calendarService: CalendarService,
  weatherService: WeatherService,
  photoService: PhotoService,
  tasksService: TasksService,
  feedsService: FeedsService,
  haService: HaService,
  wifiService: WifiService,
  spotifyService: SpotifyService,
  backgroundService: BackgroundService,
  bus: EventBus,
) {
  return async function displayWsRoute(app: FastifyInstance): Promise<void> {
    app.get('/ws/display', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
      // Display WS is server-to-client only — reject any client-initiated data
      socket.on('message', () => socket.close());

      spotifyService.notifyClientConnected(tilesService.list().some((t) => t.type === 'spotify' && t.enabled));

      // Pre-onboarding, this route is reachable by ANY LAN client with no auth token at all
      // (app.ts's preHandler explicitly exempts it — "the kiosk display connects before
      // onboarding completes and has no data to protect"). That assumption breaks for the PIN:
      // unlike apPsk (a bounded, setup-only credential), the PIN is the device's master secret
      // — it mints session tokens and is meant to require physically being in front of the
      // screen. Only ever include it for genuinely-localhost connections (the kiosk itself),
      // same check as the now-retired raw-PIN path in /api/auth/display-info.
      const remoteAddr = req.socket?.remoteAddress ?? '';
      const isLocalhost = !req.headers['x-forwarded-for']
        && (remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1');

      const getNetworkState = (): { wifiMode: string; apPsk: string | null; deviceIp: string | null } => ({
        wifiMode: wifiService.getStatus().mode,
        apPsk: settingsService.get().onboardingComplete ? null : readApPsk(),
        deviceIp: getLanIp(),
      });

      let lastNetworkState = getNetworkState();

      socket.send(
        JSON.stringify({
          type: 'init',
          version: 1,
          payload: {
            settings: settingsService.get(),
            tiles: tilesService.list(),
            calendar: calendarService.getState(),
            weather: weatherService.getState(),
            photos: photoService.getState(),
            tasks: tasksService.getState(),
            feeds: feedsService.getState(),
            ha: haService.getState(),
            spotify: spotifyService.getState(),
            background: backgroundService.getState(),
            // Sent here rather than /api/auth/display-info: that endpoint intentionally stopped
            // returning the raw PIN (HD18 hardening — an XSS-in-display flaw could otherwise
            // exfiltrate it) and now only issues a single-use kiosk token — but nothing was ever
            // updated to source the PIN from here instead, so the onboarding overlay's "look at
            // the screen for your PIN" step has been silently showing no PIN at all since that
            // change landed. Gated to isLocalhost (not just a valid token) since pre-onboarding
            // this whole route is reachable by any LAN client with no token at all — see isLocalhost above.
            devicePin: isLocalhost ? settingsService.getDevicePin() : null,
            ...lastNetworkState,
          },
        }),
      );

      const send = (type: string, payload: unknown): void => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type, payload }));
        }
      };

      const networkStatePoll = setInterval(() => {
        const current = getNetworkState();
        if (
          current.wifiMode !== lastNetworkState.wifiMode
          || current.apPsk !== lastNetworkState.apPsk
          || current.deviceIp !== lastNetworkState.deviceIp
        ) {
          lastNetworkState = current;
          send('network:state', current);
        }
      }, NETWORK_STATE_POLL_MS);

      const onSettingsChanged = (settings: Settings): void => send('settings:changed', settings);
      const onTilesChanged = (tiles: Tile[]): void => {
        spotifyService.setSpotifyTileEnabled(tiles.some((t) => t.type === 'spotify' && t.enabled));
        send('tiles:changed', tiles);
      };
      const onCalendarState = (state: CalendarState): void => send('calendar:state', state);
      const onWeatherState = (state: WeatherState): void => send('weather:state', state);
      const onPhotosState = (state: PhotoState): void => send('photos:state', state);
      const onTasksState = (state: TasksState): void => send('tasks:state', state);
      const onFeedsState = (state: FeedsState): void => send('feeds:state', state);
      const onHaState = (state: HaState): void => send('ha:state', state);
      const onSpotifyState = (state: SpotifyState): void => send('spotify:state', state);
      const onBackgroundState = (state: BackgroundState): void => send('background:state', state);
      const onScreenSleep = (): void => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'screen:sleep' })); };
      const onScreenWake = (): void => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'screen:wake' })); };
      const onScreenDim = (level: number): void => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'screen:dim', payload: { level } })); };

      bus.on('settings:changed', onSettingsChanged);
      bus.on('tiles:changed', onTilesChanged);
      bus.on('calendar:state', onCalendarState);
      bus.on('weather:state', onWeatherState);
      bus.on('photos:state', onPhotosState);
      bus.on('tasks:state', onTasksState);
      bus.on('feeds:state', onFeedsState);
      bus.on('ha:state', onHaState);
      bus.on('spotify:state', onSpotifyState);
      bus.on('background:state', onBackgroundState);
      bus.on('screen:sleep', onScreenSleep);
      bus.on('screen:wake', onScreenWake);
      bus.on('screen:dim', onScreenDim);

      socket.on('close', () => {
        clearInterval(networkStatePoll);
        spotifyService.notifyClientDisconnected();
        bus.off('settings:changed', onSettingsChanged);
        bus.off('tiles:changed', onTilesChanged);
        bus.off('calendar:state', onCalendarState);
        bus.off('weather:state', onWeatherState);
        bus.off('photos:state', onPhotosState);
        bus.off('tasks:state', onTasksState);
        bus.off('feeds:state', onFeedsState);
        bus.off('ha:state', onHaState);
        bus.off('spotify:state', onSpotifyState);
        bus.off('background:state', onBackgroundState);
        bus.off('screen:sleep', onScreenSleep);
        bus.off('screen:wake', onScreenWake);
        bus.off('screen:dim', onScreenDim);
      });
    });
  };
}
