/** The kinds of tiles a display can render. */
export type TileType =
  | 'clock'
  | 'calendar'
  | 'weather'
  | 'photos'
  | 'tasks'
  | 'rss'
  | 'home_assistant'
  | 'today_agenda'
  | 'countdown'
  | 'motd'
  | 'spotify'
  | 'custom_text';

/** Per-widget visual overrides (D1 + D4). All fields optional; undefined = use theme default. */
export interface WidgetStyle {
  /** Background fill color as CSS hex, e.g. '#1a1a2e'. */
  bgColor?: string;
  /** Background opacity 0–1. Applied on top of bgColor. */
  bgOpacity?: number;
  /** Border radius in pixels. */
  borderRadius?: number;
  /** Border color as CSS hex. */
  borderColor?: string;
  /** Font scale multiplier 0.75–1.5 relative to the layout default. */
  fontScale?: number;
}

/**
 * A configured tile placed in a layout slot. `config` is tile-type-specific and
 * validated by the corresponding integration module on the server.
 */
export interface Tile {
  id: string;
  type: TileType;
  /** Named slot in the active template (e.g. "sidebar", "main", "footer"). */
  slot: string;
  enabled: boolean;
  /** Tile-type-specific configuration; shape defined per module. */
  config: Record<string, unknown>;
  /** Per-widget visual overrides applied by the display. */
  style: WidgetStyle;
}
