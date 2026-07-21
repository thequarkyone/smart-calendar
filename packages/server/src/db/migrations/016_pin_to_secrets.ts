export const migration = {
  name: '016_pin_to_secrets',
  up: `
    ALTER TABLE settings DROP COLUMN device_pin;
  `,
};
