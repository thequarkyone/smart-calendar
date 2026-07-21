export const migration = {
  name: '021_reset_lockout',
  up: `
    ALTER TABLE system ADD COLUMN reset_fail_count   INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE system ADD COLUMN reset_locked_until TEXT;
  `,
};
