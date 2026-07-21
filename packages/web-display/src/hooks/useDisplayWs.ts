import { useState, useEffect, useRef } from 'react';
import type { BackgroundState, CalendarState, FeedsState, HaState, PhotoState, Settings, SpotifyState, TasksState, Tile, WeatherState } from '@smart-display/shared';

type WsMessage =
  | { type: 'init'; version: number; payload: { settings: Settings; tiles: Tile[]; calendar: CalendarState; weather: WeatherState; photos: PhotoState; tasks: TasksState; feeds: FeedsState; ha: HaState; spotify: SpotifyState; background: BackgroundState; wifiMode: string; apPsk: string | null; deviceIp: string | null; devicePin: string | null } }
  | { type: 'settings:changed'; payload: Settings }
  | { type: 'tiles:changed'; payload: Tile[] }
  | { type: 'calendar:state'; payload: CalendarState }
  | { type: 'weather:state'; payload: WeatherState }
  | { type: 'photos:state'; payload: PhotoState }
  | { type: 'tasks:state'; payload: TasksState }
  | { type: 'feeds:state'; payload: FeedsState }
  | { type: 'ha:state'; payload: HaState }
  | { type: 'spotify:state'; payload: SpotifyState }
  | { type: 'background:state'; payload: BackgroundState }
  | { type: 'screen:sleep' }
  | { type: 'screen:wake' }
  | { type: 'screen:dim'; payload: { level: number } }
  | { type: 'network:state'; payload: { wifiMode: string; apPsk: string | null; deviceIp: string | null } };

export interface DisplayState {
  settings: Settings | null;
  tiles: Tile[];
  calendar: CalendarState | null;
  weather: WeatherState | null;
  photos: PhotoState | null;
  tasks: TasksState | null;
  feeds: FeedsState | null;
  ha: HaState | null;
  spotify: SpotifyState | null;
  background: BackgroundState | null;
  connected: boolean;
  sleeping: boolean;
  /** Dim level 0–100, or null when not in dim mode. */
  dimLevel: number | null;
  wifiMode: string | null;
  apPsk: string | null;
  deviceIp: string | null;
  devicePin: string | null;
}

const RECONNECT_DELAY_MS = 3000;

export function useDisplayWs(): DisplayState {
  const [state, setState] = useState<DisplayState>({
    settings: null, tiles: [], calendar: null, weather: null, photos: null, tasks: null, feeds: null, ha: null, spotify: null, background: null, connected: false, sleeping: false, dimLevel: null, wifiMode: null, apPsk: null, deviceIp: null, devicePin: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function getKioskToken(): Promise<string | null> {
      try {
        const res = await fetch('/api/auth/display-info');
        if (!res.ok) return null;
        const data = await res.json() as { kioskToken?: string };
        return data.kioskToken ?? null;
      } catch {
        return null;
      }
    }

    async function connect() {
      const kioskToken = await getKioskToken();
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const tokenParam = kioskToken ? `?token=${encodeURIComponent(kioskToken)}` : '';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/display${tokenParam}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setState((s) => ({ ...s, connected: true }));
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          if (msg.type === 'init') {
            const { wifiMode, apPsk, deviceIp, devicePin, ...rest } = msg.payload;
            setState((s) => ({ ...rest, connected: true, sleeping: s.sleeping, dimLevel: s.dimLevel, wifiMode, apPsk, deviceIp, devicePin }));
          } else if (msg.type === 'network:state') {
            setState((s) => ({ ...s, ...msg.payload }));
          } else if (msg.type === 'spotify:state') {
            setState((s) => ({ ...s, spotify: msg.payload }));
          } else if (msg.type === 'settings:changed') {
            setState((s) => ({ ...s, settings: msg.payload }));
          } else if (msg.type === 'tiles:changed') {
            setState((s) => ({ ...s, tiles: msg.payload }));
          } else if (msg.type === 'calendar:state') {
            setState((s) => ({ ...s, calendar: msg.payload }));
          } else if (msg.type === 'weather:state') {
            setState((s) => ({ ...s, weather: msg.payload }));
          } else if (msg.type === 'photos:state') {
            setState((s) => ({ ...s, photos: msg.payload }));
          } else if (msg.type === 'tasks:state') {
            setState((s) => ({ ...s, tasks: msg.payload }));
          } else if (msg.type === 'feeds:state') {
            setState((s) => ({ ...s, feeds: msg.payload }));
          } else if (msg.type === 'ha:state') {
            setState((s) => ({ ...s, ha: msg.payload }));
          } else if (msg.type === 'background:state') {
            setState((s) => ({ ...s, background: msg.payload }));
          } else if (msg.type === 'screen:sleep') {
            setState((s) => ({ ...s, sleeping: true, dimLevel: null }));
          } else if (msg.type === 'screen:wake') {
            setState((s) => ({ ...s, sleeping: false, dimLevel: null }));
          } else if (msg.type === 'screen:dim') {
            setState((s) => ({ ...s, sleeping: false, dimLevel: msg.payload.level }));
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setState((s) => ({ ...s, connected: false }));
        timerRef.current = setTimeout(() => { void connect(); }, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    void connect();

    return () => {
      cancelled = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, []);

  return state;
}
