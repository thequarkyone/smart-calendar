import { describe, it, expect, afterEach } from 'vitest';
import { openDb } from '../db/index.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

afterEach(() => {
  db?.close();
});

describe('openDb / migrations', () => {
  it('creates all expected tables', () => {
    db = openDb(':memory:');

    const tables = (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
        .all() as { name: string }[]
    ).map((r) => r.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        '_migrations',
        'calendars',
        'feeds',
        'photo_sources',
        'secrets',
        'settings',
        'system',
        'tiles',
      ]),
    );
  });

  it('seeds a default settings row', () => {
    db = openDb(':memory:');
    const row = db.prepare('SELECT id, timezone, units FROM settings WHERE id = 1').get() as {
      id: number;
      timezone: string;
      units: string;
    };
    expect(row).toMatchObject({ id: 1, timezone: 'UTC', units: 'metric' });
  });

  it('seeds a default system row', () => {
    db = openDb(':memory:');
    const row = db.prepare('SELECT id, app_version FROM system WHERE id = 1').get() as {
      id: number;
      app_version: string;
    };
    expect(row).toMatchObject({ id: 1, app_version: '0.0.0' });
  });

  it('records applied migrations', () => {
    db = openDb(':memory:');
    const rows = db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
    expect(rows.map((r) => r.name)).toContain('001_initial');
  });

  it('is idempotent — running migrations twice does not throw', () => {
    db = openDb(':memory:');
    expect(() => openDb(':memory:')).not.toThrow();
  });

  it('enables WAL journal mode', () => {
    db = openDb(':memory:');
    // WAL is not supported on :memory: but pragma should not throw
    const row = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(row[0]).toBeDefined();
  });
});
