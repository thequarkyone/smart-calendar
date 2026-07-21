export const migration = {
  name: '022_event_symbols',
  up: `
    ALTER TABLE settings ADD COLUMN event_symbol_rules TEXT NOT NULL DEFAULT '[]';
  `,
};
