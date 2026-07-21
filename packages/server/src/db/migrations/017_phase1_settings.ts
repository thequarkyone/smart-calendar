export const migration = {
  name: '017_phase1_settings',
  up: `
    ALTER TABLE settings ADD COLUMN auto_theme INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE settings ADD COLUMN bg_photo_path TEXT;
  `,
};
