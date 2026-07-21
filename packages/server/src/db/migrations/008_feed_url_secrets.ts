export const migration = {
  name: '008_feed_url_secrets',
  up: `ALTER TABLE feeds ADD COLUMN url_secret_id TEXT;`,
};
