import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_MANIFEST_PREFIX = 'https://github.com/thequarkyone/smart-calendar/';
if (process.env.MANIFEST_URL) {
  try {
    const parsed = new URL(process.env.MANIFEST_URL);
    if (parsed.origin !== 'https://github.com') {
      throw new Error(`MANIFEST_URL must point to https://github.com, got: ${parsed.origin}`);
    }
    if (!process.env.MANIFEST_URL.startsWith(EXPECTED_MANIFEST_PREFIX)) {
      throw new Error(`MANIFEST_URL must start with ${EXPECTED_MANIFEST_PREFIX}, got: ${process.env.MANIFEST_URL}`);
    }
  } catch (err) {
    // Re-throw URL parse errors with clearer message
    if (!(err instanceof Error) || err.message.startsWith('MANIFEST_URL')) throw err;
    throw new Error(`MANIFEST_URL is not a valid URL: ${process.env.MANIFEST_URL}`);
  }
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';
const defaultDataDir = isProd ? '/data' : join(packageRoot, 'data');

// npm_package_version is only set when launched via `npm run`/`pnpm run` — smartdisplay.service
// invokes `node dist/index.js` directly, so it's never present in production. Read package.json
// directly instead, which release.yml stamps with the real tag version before packaging.
function resolveVersion(): string {
  if (process.env.npm_package_version) return process.env.npm_package_version;
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // fall through to default below
  }
  return '0.0.0';
}

export const config = {
  version: resolveVersion(),
  port: parseInt(process.env.PORT ?? '3000', 10),
  dataDir: process.env.DATA_DIR ?? defaultDataDir,
  get dbPath() {
    return process.env.DB_PATH ?? join(this.dataDir, 'smartdisplay.db');
  },
  get keyPath() {
    return process.env.KEY_PATH ?? join(this.dataDir, '.secret-key');
  },
  isProd,
  manifestUrl: process.env.MANIFEST_URL ?? 'https://github.com/thequarkyone/smart-calendar/releases/latest/download/version.json',
  installDir: process.env.INSTALL_DIR ?? (isProd ? '/opt/smartdisplay' : ''),
} as const;
