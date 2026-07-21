export const migration = {
  name: '029_background_cycling',
  up: `
    ALTER TABLE settings ADD COLUMN bg_cycling_enabled INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE settings ADD COLUMN bg_cycling_source TEXT NOT NULL DEFAULT 'nasa';
  `,
};
