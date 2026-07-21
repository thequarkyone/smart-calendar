export const migration = {
  name: '027_qr_code_default_on',
  // show_qr_code shipped defaulting to 0 (006_onboarding.ts), so a factory-fresh device never
  // showed the on-screen QR/PIN/WiFi overlay meant to guide setup — breaking the "no terminal,
  // no IP typing" onboarding goal for non-technical users. SQLite has no ALTER COLUMN SET
  // DEFAULT, so flip it on directly, scoped to devices that haven't finished onboarding yet —
  // this never overrides a user's deliberate post-setup choice to hide it (web-config's
  // Appearance section already exposes a toggle for that).
  up: `
    UPDATE settings SET show_qr_code = 1 WHERE onboarding_complete = 0;
  `,
};
