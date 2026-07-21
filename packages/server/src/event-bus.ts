import { EventEmitter } from 'node:events';
import type { BackgroundState, CalendarState, FeedsState, HaState, PhotoState, Settings, SpotifyState, TasksState, Tile, WeatherState } from '@smart-display/shared';

type BusEventMap = {
  'settings:changed': [settings: Settings];
  'calendar:state': [state: CalendarState];
  'weather:state': [state: WeatherState];
  'photos:state': [state: PhotoState];
  'background:state': [state: BackgroundState];
  'tasks:state': [state: TasksState];
  'feeds:state': [state: FeedsState];
  'ha:state': [state: HaState];
  'spotify:state': [state: SpotifyState];
  'tiles:changed': [tiles: Tile[]];
  'screen:sleep': [];
  'screen:wake': [];
  'screen:dim': [level: number];
};

export class EventBus extends EventEmitter<BusEventMap> {}
