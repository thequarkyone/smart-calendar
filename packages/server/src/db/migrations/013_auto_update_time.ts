export const migration = {
  name: '013_auto_update_time',
  up: `ALTER TABLE settings ADD COLUMN auto_update_time TEXT;`,
};
