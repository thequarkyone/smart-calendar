export const migration = {
  name: '006_onboarding',
  up: `
    ALTER TABLE settings ADD COLUMN show_qr_code INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE settings ADD COLUMN onboarding_complete INTEGER NOT NULL DEFAULT 0;
  `,
};
