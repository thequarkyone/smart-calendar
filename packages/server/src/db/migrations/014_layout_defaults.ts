export const migration = {
  name: '014_layout_defaults',
  up: `
    UPDATE settings
    SET layout_config_json = json_set(
      COALESCE(layout_config_json, '{}'),
      '$.sidebarWidth', 380
    )
    WHERE json_extract(layout_config_json, '$.sidebarWidth') = 220
       OR layout_config_json IS NULL
       OR layout_config_json = '';
  `,
};
