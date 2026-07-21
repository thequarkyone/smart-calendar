export const migration = {
  name: '020_google_oauth',
  up: `
    ALTER TABLE calendars ADD COLUMN provider TEXT NOT NULL DEFAULT 'ics';
    ALTER TABLE calendars ADD COLUMN refresh_token_secret_id TEXT;
  `,
};
