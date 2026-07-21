export const migration = {
  name: '026_layout_zones',
  // Zone fields are stored inside the layout_config_json JSON blob and defaulted in
  // DEFAULT_LAYOUT_CONFIG — no schema changes needed. This migration just bumps the version.
  up: `SELECT 1; -- layout zone fields added to layout_config_json defaults (026)`,
};
