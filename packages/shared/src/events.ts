import type { TileType } from './tiles.js';

/**
 * State for a single tile, pushed from the server to the display over the
 * WebSocket channel. `data` is tile-type-specific (defined per module).
 */
export interface TileState {
  tileId: string;
  type: TileType;
  data: unknown;
  /** ISO timestamp the state was produced. */
  updatedAt: string;
}

/** Messages the server pushes to the display renderer. */
export type ServerToDisplayMessage =
  | { kind: 'hello'; serverVersion: string }
  | { kind: 'tileState'; state: TileState }
  | { kind: 'layoutChanged' }
  | { kind: 'settingsChanged' };

/** Messages the display renderer may send back to the server. */
export type DisplayToServerMessage = { kind: 'subscribe' } | { kind: 'pong' };
