export const migration = {
  name: '012_auto_update',
  up: `ALTER TABLE settings ADD COLUMN auto_update INTEGER NOT NULL DEFAULT 0 CHECK (auto_update IN (0, 1));`,
};
