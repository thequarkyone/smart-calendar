import type Database from 'better-sqlite3';
import { migrations } from './migrations/index.js';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
  const applied = new Set(appliedRows.map((r) => r.name));

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      db.transaction(() => {
        db.exec(migration.up);
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
      })();
    }
  }
}
