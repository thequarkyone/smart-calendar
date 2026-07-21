export const migration = {
  name: '019_touchscreen',
  up: `
    ALTER TABLE settings ADD COLUMN touchscreen_enabled INTEGER NOT NULL DEFAULT 0;
  `,
};
