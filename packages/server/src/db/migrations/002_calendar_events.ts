export const migration = {
  name: '002_calendar_events',
  up: `
    CREATE TABLE IF NOT EXISTS calendar_events (
      id          TEXT    PRIMARY KEY,
      calendar_id TEXT    NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      uid         TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      start       TEXT    NOT NULL,
      end         TEXT    NOT NULL,
      all_day     INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
      location    TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_id
      ON calendar_events(calendar_id);

    CREATE INDEX IF NOT EXISTS idx_calendar_events_start
      ON calendar_events(start);
  `,
};
