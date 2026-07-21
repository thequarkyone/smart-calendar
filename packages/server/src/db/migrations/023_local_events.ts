export const migration = {
  name: '023_local_events',
  up: `
    ALTER TABLE calendar_events ADD COLUMN source TEXT NOT NULL DEFAULT 'ics';

    INSERT OR IGNORE INTO calendars (id, name, ics_url_secret_id, color, enabled, provider)
    VALUES ('local', 'My Events', '', '#4a90e2', 1, 'local');
  `,
};
