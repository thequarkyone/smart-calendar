import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openDb } from '../db/index.js';
import { TilesService } from '../services/tiles.js';

let db: Database.Database;
let service: TilesService;

beforeEach(() => {
  db = openDb(':memory:');
  service = new TilesService(db);
});

afterEach(() => {
  db.close();
});

describe('seedDefaults()', () => {
  it('inserts 12 default tiles', () => {
    service.seedDefaults();
    expect(service.list()).toHaveLength(12);
  });

  it('is idempotent — calling twice does not duplicate tiles', () => {
    service.seedDefaults();
    service.seedDefaults();
    expect(service.list()).toHaveLength(12);
  });
});

describe('list()', () => {
  it('returns tiles ordered by sort_order', () => {
    service.seedDefaults();
    const tiles = service.list();
    expect(tiles[0]?.type).toBe('clock');
    expect(tiles[1]?.type).toBe('calendar');
  });

  it('maps enabled column to boolean', () => {
    service.seedDefaults();
    const tiles = service.list();
    const clock = tiles.find((t) => t.id === 'clock');
    const tasks = tiles.find((t) => t.id === 'tasks');
    expect(clock?.enabled).toBe(true);
    expect(tasks?.enabled).toBe(false);
  });
});

describe('toggle()', () => {
  it('disables an enabled tile', () => {
    service.seedDefaults();
    const tile = service.toggle('clock', false);
    expect(tile.enabled).toBe(false);
    expect(service.list().find((t) => t.id === 'clock')?.enabled).toBe(false);
  });

  it('enables a disabled tile', () => {
    service.seedDefaults();
    const tile = service.toggle('tasks', true);
    expect(tile.enabled).toBe(true);
  });

  it('throws for a nonexistent tile id', () => {
    service.seedDefaults();
    expect(() => service.toggle('nonexistent', true)).toThrow('Tile not found');
  });
});

describe('tile style (D1/D4)', () => {
  it('returns empty style object by default', () => {
    service.seedDefaults();
    const tile = service.list().find((t) => t.id === 'clock');
    expect(tile?.style).toEqual({});
  });

  it('updateStyle persists and returns style', () => {
    service.seedDefaults();
    const updated = service.updateStyle('clock', { bgColor: '#ff0000', bgOpacity: 0.5, borderRadius: 8, fontScale: 1.2 });
    expect(updated.style).toEqual({ bgColor: '#ff0000', bgOpacity: 0.5, borderRadius: 8, fontScale: 1.2 });
    const reloaded = service.list().find((t) => t.id === 'clock');
    expect(reloaded?.style).toEqual({ bgColor: '#ff0000', bgOpacity: 0.5, borderRadius: 8, fontScale: 1.2 });
  });

  it('style does not leak into config', () => {
    service.seedDefaults();
    service.updateStyle('calendar', { bgColor: '#123456' });
    const tile = service.list().find((t) => t.id === 'calendar');
    expect(tile?.config['style']).toBeUndefined();
    expect(tile?.style.bgColor).toBe('#123456');
  });

  it('throws for a nonexistent tile id', () => {
    service.seedDefaults();
    expect(() => service.updateStyle('nonexistent', {})).toThrow('Tile not found');
  });
});
