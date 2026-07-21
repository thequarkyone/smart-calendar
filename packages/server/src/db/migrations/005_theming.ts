export const migration = {
  name: '005_theming',
  up: `
    ALTER TABLE settings ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#4a90e2';
    ALTER TABLE settings ADD COLUMN font_family TEXT NOT NULL DEFAULT 'system';
  `,
};
