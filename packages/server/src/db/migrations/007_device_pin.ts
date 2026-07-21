export const migration = {
  name: '007_device_pin',
  up: `
    ALTER TABLE settings ADD COLUMN device_pin TEXT DEFAULT NULL;
  `,
};
