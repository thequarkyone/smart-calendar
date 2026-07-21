export const migration = {
  name: '028_week_start_sunday',
  // week_starts_on shipped defaulting to 'mon' (011_week_start.ts) with no settings UI ever
  // exposed to change it, so every device's value is still just the untouched default, not a
  // deliberate user choice. Flip to 'sun' to match the more common US convention. A fresh install
  // also passes through this migration (001_initial seeds the row with the old 'mon' default,
  // then every migration including this one runs in sequence), so a plain UPDATE covers both
  // existing devices and brand-new ones — no ALTER COLUMN SET DEFAULT (unsupported by SQLite)
  // or table rebuild needed.
  up: `
    UPDATE settings SET week_starts_on = 'sun' WHERE week_starts_on = 'mon';
  `,
};
