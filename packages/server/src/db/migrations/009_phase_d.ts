export const migration = {
  name: '009_phase_d',
  up: `
    ALTER TABLE settings ADD COLUMN bg_type TEXT NOT NULL DEFAULT 'solid';
    ALTER TABLE settings ADD COLUMN bg_color TEXT NOT NULL DEFAULT '#0d1117';
    ALTER TABLE settings ADD COLUMN bg_gradient_end TEXT NOT NULL DEFAULT '#1a1a2e';
    ALTER TABLE settings ADD COLUMN layout_config_json TEXT NOT NULL DEFAULT '{"sidebarWidth":220,"photoStripHeight":120,"newsBandHeight":48}';
  `,
};
