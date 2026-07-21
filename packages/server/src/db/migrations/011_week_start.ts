export const migration = {
  name: '011_week_start',
  up: `
    ALTER TABLE settings ADD COLUMN week_starts_on TEXT NOT NULL DEFAULT 'mon';
  `,
};
