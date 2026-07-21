export const migration = {
  name: '018_new_tiles',
  up: `
    INSERT OR IGNORE INTO tiles (id, type, slot, enabled, config, sort_order)
    VALUES
      ('today_agenda', 'today_agenda', 'sidebar', 0, '{}', 7),
      ('countdown',    'countdown',    'sidebar', 0, '{}', 8),
      ('motd',         'motd',         'sidebar', 0, '{}', 9);
  `,
};
