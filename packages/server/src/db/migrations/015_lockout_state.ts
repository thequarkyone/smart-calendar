export const migration = {
  name: '015_lockout_state',
  up: `
    ALTER TABLE system ADD COLUMN lockout_failures INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE system ADD COLUMN lockout_until    TEXT;
  `,
};
