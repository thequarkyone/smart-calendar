export const migration = {
  name: '001_initial',
  up: `
    CREATE TABLE IF NOT EXISTS settings (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      household_name    TEXT    NOT NULL DEFAULT '',
      timezone          TEXT    NOT NULL DEFAULT 'UTC',
      latitude          REAL,
      longitude         REAL,
      location_label    TEXT,
      units             TEXT    NOT NULL DEFAULT 'metric'
                                CHECK (units IN ('metric', 'imperial')),
      clock_format      TEXT    NOT NULL DEFAULT '12h'
                                CHECK (clock_format IN ('12h', '24h')),
      theme             TEXT    NOT NULL DEFAULT 'dark'
                                CHECK (theme IN ('dark', 'light')),
      active_template_id TEXT,
      screen_sleep_start TEXT,
      screen_sleep_end   TEXT,
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO settings (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS tiles (
      id          TEXT    PRIMARY KEY,
      type        TEXT    NOT NULL,
      slot        TEXT    NOT NULL DEFAULT '',
      enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      config      TEXT    NOT NULL DEFAULT '{}',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calendars (
      id                  TEXT PRIMARY KEY,
      name                TEXT    NOT NULL,
      ics_url_secret_id   TEXT    NOT NULL,
      color               TEXT    NOT NULL DEFAULT '#4a90e2',
      enabled             INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      last_synced         TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id          TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      url         TEXT    NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      max_items   INTEGER NOT NULL DEFAULT 5,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS photo_sources (
      id          TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      type        TEXT    NOT NULL DEFAULT 'local' CHECK (type IN ('local')),
      path        TEXT    NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS secrets (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      ciphertext  TEXT NOT NULL,
      iv          TEXT NOT NULL,
      auth_tag    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system (
      id                  INTEGER PRIMARY KEY CHECK (id = 1),
      app_version         TEXT    NOT NULL DEFAULT '0.0.0',
      update_channel      TEXT    NOT NULL DEFAULT 'stable',
      device_name         TEXT    NOT NULL DEFAULT 'smart-display',
      onboarding_complete INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_complete IN (0, 1)),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO system (id) VALUES (1);
  `,
};
