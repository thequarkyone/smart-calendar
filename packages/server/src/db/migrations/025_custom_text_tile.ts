export const migration = {
  name: '025_custom_text_tile',
  up: `
    INSERT OR IGNORE INTO tiles (id, type, slot, enabled, config, sort_order)
    VALUES ('custom_text', 'custom_text', 'sidebar', 0, '{}', 11);
  `,
};
