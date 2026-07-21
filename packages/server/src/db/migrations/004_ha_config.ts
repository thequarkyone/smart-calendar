export const migration = {
  name: '004_ha_config',
  up: `
    CREATE TABLE IF NOT EXISTS ha_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      url TEXT,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
      token_secret_id TEXT,
      entity_ids TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO ha_config (id) VALUES (1);
  `,
};
