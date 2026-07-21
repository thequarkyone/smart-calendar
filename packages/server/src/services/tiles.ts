import type Database from 'better-sqlite3';
import type { Tile, TileType, WidgetStyle } from '@smart-display/shared';

interface TileRow {
  id: string;
  type: string;
  slot: string;
  enabled: number;
  config: string;
  sort_order: number;
}

const DEFAULT_TILES: Array<{ id: string; type: TileType; slot: string; enabled: boolean; sort_order: number }> = [
  { id: 'clock',          type: 'clock',          slot: 'sidebar', enabled: true,  sort_order: 0 },
  { id: 'calendar',       type: 'calendar',        slot: 'main',    enabled: true,  sort_order: 1 },
  { id: 'weather',        type: 'weather',         slot: 'sidebar', enabled: true,  sort_order: 2 },
  { id: 'photos',         type: 'photos',          slot: 'footer',  enabled: true,  sort_order: 3 },
  { id: 'tasks',          type: 'tasks',           slot: 'sidebar', enabled: false, sort_order: 4 },
  { id: 'rss',            type: 'rss',             slot: 'footer',  enabled: false, sort_order: 5 },
  { id: 'home_assistant', type: 'home_assistant',  slot: 'sidebar', enabled: false, sort_order: 6 },
  { id: 'today_agenda',  type: 'today_agenda',    slot: 'sidebar', enabled: false, sort_order: 7 },
  { id: 'countdown',     type: 'countdown',       slot: 'sidebar', enabled: false, sort_order: 8 },
  { id: 'motd',          type: 'motd',            slot: 'sidebar', enabled: false, sort_order: 9 },
  { id: 'spotify',       type: 'spotify',         slot: 'sidebar', enabled: false, sort_order: 10 },
  { id: 'custom_text',  type: 'custom_text',     slot: 'sidebar', enabled: false, sort_order: 11 },
];

export class TilesService {
  constructor(private readonly db: Database.Database) {}

  seedDefaults(): void {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO tiles (id, type, slot, enabled, config, sort_order)
       VALUES (@id, @type, @slot, @enabled, '{}', @sort_order)`,
    );
    this.db.transaction(() => {
      for (const t of DEFAULT_TILES) {
        insert.run({ ...t, enabled: t.enabled ? 1 : 0 });
      }
    })();
  }

  list(): Tile[] {
    const rows = this.db
      .prepare('SELECT * FROM tiles ORDER BY sort_order ASC')
      .all() as TileRow[];
    return rows.map(rowToTile);
  }

  toggle(id: string, enabled: boolean): Tile {
    this.db
      .prepare(`UPDATE tiles SET enabled = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(enabled ? 1 : 0, id);
    const row = this.db.prepare('SELECT * FROM tiles WHERE id = ?').get(id) as TileRow | undefined;
    if (!row) throw new Error(`Tile not found: ${id}`);
    return rowToTile(row);
  }

  updateConfig(id: string, config: Record<string, unknown>): Tile {
    const row = this.db.prepare('SELECT * FROM tiles WHERE id = ?').get(id) as TileRow | undefined;
    if (!row) throw new Error(`Tile not found: ${id}`);
    const existing = JSON.parse(row.config) as Record<string, unknown>;
    const merged = { ...existing, ...config };
    this.db
      .prepare(`UPDATE tiles SET config = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(merged), id);
    const updated = this.db.prepare('SELECT * FROM tiles WHERE id = ?').get(id) as TileRow;
    return rowToTile(updated);
  }

  updateStyle(id: string, style: WidgetStyle): Tile {
    const row = this.db.prepare('SELECT * FROM tiles WHERE id = ?').get(id) as TileRow | undefined;
    if (!row) throw new Error(`Tile not found: ${id}`);
    const config = JSON.parse(row.config) as Record<string, unknown>;
    config['style'] = style;
    this.db
      .prepare(`UPDATE tiles SET config = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(config), id);
    const updated = this.db.prepare('SELECT * FROM tiles WHERE id = ?').get(id) as TileRow;
    return rowToTile(updated);
  }
}

function rowToTile(row: TileRow): Tile {
  const config = JSON.parse(row.config) as Record<string, unknown>;
  const style = (config['style'] ?? {}) as WidgetStyle;
  const { style: _style, ...restConfig } = config;
  void _style;
  return {
    id: row.id,
    type: row.type as TileType,
    slot: row.slot,
    enabled: row.enabled === 1,
    config: restConfig,
    style,
  };
}
