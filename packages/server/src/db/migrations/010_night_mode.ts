export const migration = {
  name: '010_night_mode',
  up: `
    ALTER TABLE settings ADD COLUMN screen_dim_enabled INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE settings ADD COLUMN screen_dim_level   INTEGER NOT NULL DEFAULT 20;
  `,
};
