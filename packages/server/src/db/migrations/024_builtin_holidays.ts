export const migration = {
  name: '024_builtin_holidays',
  up: `
    ALTER TABLE calendars ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0;
  `,
};
