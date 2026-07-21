import { createWriteStream, existsSync, readdirSync, readlinkSync, symlinkSync, renameSync, unlinkSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { assertSafeFetchUrl } from '../util/url-guard.js';

const execFileAsync = promisify(_execFile);

const VERSION_RE = /^\d+\.\d+\.\d+$/;

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('error', reject)
      .pipe(hash)
      .on('error', reject)
      .on('finish', () => resolve(hash.digest('hex')));
  });
}

export interface UpdateManifest {
  version: string;
  releaseDate: string;
  tarballUrl: string;
  notes: string;
  sha256: string;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  notes: string | null;
  managed: boolean;
  applying: boolean;
  error: string | null;
}

interface UpdateStatusInternal extends UpdateStatus {
  /** Cached from last check() — used by apply() to avoid TOCTOU re-fetch */
  _tarballUrl: string | null;
  _sha256: string | null;
}

function parseVersion(v: string): [number, number, number] {
  const parts = v.replace(/^v/, '').split('.');
  return [
    parseInt(parts[0] ?? '0', 10),
    parseInt(parts[1] ?? '0', 10),
    parseInt(parts[2] ?? '0', 10),
  ];
}

function isNewer(candidate: string, current: string): boolean {
  const [cMaj, cMin, cPat] = parseVersion(candidate);
  const [eMaj, eMin, ePat] = parseVersion(current);
  if (cMaj !== eMaj) return cMaj > eMaj;
  if (cMin !== eMin) return cMin > eMin;
  return cPat > ePat;
}

const GITHUB_TARBALL_PREFIX = 'https://github.com/thequarkyone/smart-calendar/';

export class UpdateService {
  private status: UpdateStatusInternal;
  private readonly releasesDir: string;
  private readonly currentLink: string;
  private readonly managed: boolean;

  constructor(
    private readonly currentVersion: string,
    private readonly manifestUrl: string,
    private readonly installDir: string,
  ) {
    this.releasesDir = join(installDir, 'releases');
    this.currentLink = join(installDir, 'current');
    this.managed = installDir.length > 0 && existsSync(this.currentLink);
    this.status = {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      notes: null,
      managed: this.managed,
      applying: false,
      error: null,
      _tarballUrl: null,
      _sha256: null,
    };
  }

  getStatus(): UpdateStatus {
    const { _tarballUrl: _, _sha256: __, ...pub } = this.status;
    return pub;
  }

  async check(): Promise<UpdateStatus> {
    this.status = { ...this.status, error: null };
    try {
      await assertSafeFetchUrl(this.manifestUrl);
      // GitHub release-asset URLs (…/releases/latest/download/… and …/releases/download/…) return
      // 302 redirects to GitHub's object CDN, so we must follow redirects — `redirect: 'error'`
      // would make every fetch fail. SSRF is bounded by the domain-pin below plus assertSafeFetchUrl
      // on the initial URL; redirects stay within GitHub-controlled hosts.
      const res = await fetch(this.manifestUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
      const manifest = await res.json() as UpdateManifest;
      if (!VERSION_RE.test(manifest.version)) throw new Error('Manifest returned invalid version string');
      if (!/^[0-9a-f]{64}$/.test(manifest.sha256)) throw new Error('Manifest returned invalid sha256');
      if (!manifest.tarballUrl.startsWith(GITHUB_TARBALL_PREFIX)) throw new Error('Manifest tarball URL is not from expected GitHub repository');
      const notes = typeof manifest.notes === 'string' ? manifest.notes.slice(0, 2000) : '';
      const updateAvailable = isNewer(manifest.version, this.currentVersion);
      this.status = {
        ...this.status,
        latestVersion: manifest.version,
        updateAvailable,
        notes,
        _tarballUrl: manifest.tarballUrl,
        _sha256: manifest.sha256,
      };
    } catch (err) {
      console.error('[update] check failed:', err);
      this.status = { ...this.status, error: 'Manifest fetch failed' };
    }
    return this.getStatus();
  }

  async apply(): Promise<void> {
    if (!this.managed) throw new Error('Not running from a managed install — cannot apply update');
    if (this.status.applying) throw new Error('Update already in progress');
    if (!this.status.latestVersion) throw new Error('No update checked yet — call check() first');
    if (!this.status.updateAvailable) throw new Error('No update available');

    const version = this.status.latestVersion;
    if (!VERSION_RE.test(version)) throw new Error('Invalid version string');

    // Use cached tarball URL + sha256 from check() — avoids TOCTOU re-fetch
    const tarballUrl = this.status._tarballUrl;
    const sha256 = this.status._sha256;
    if (!tarballUrl || !sha256) throw new Error('Manifest missing tarball URL or sha256 — call check() first');

    // Validate tarball URL — domain-pin to GitHub + SSRF guard
    if (!tarballUrl.startsWith(GITHUB_TARBALL_PREFIX)) {
      throw new Error('Tarball URL is not from the expected GitHub repository');
    }
    await assertSafeFetchUrl(tarballUrl);

    this.status = { ...this.status, applying: true, error: null };

    // Rollback lock file: prevents rollback while applying
    const applyingLock = join(this.installDir, '.applying');
    writeFileSync(applyingLock, String(process.pid));

    try {
      const targetDir = join(this.releasesDir, `v${version}`);
      const tmpFile = join(tmpdir(), `smartdisplay-${version}.tar.gz`);

      // Download tarball
      const dlRes = await fetch(tarballUrl, { signal: AbortSignal.timeout(5 * 60_000), redirect: 'follow' });
      if (!dlRes.ok) throw new Error(`Tarball download failed: ${dlRes.status}`);
      if (!dlRes.body) throw new Error('Empty response body');

      const MAX_TARBALL_BYTES = 500 * 1024 * 1024;
      let bytesReceived = 0;
      const byteCounter = new Transform({
        transform(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null, data?: Buffer) => void) {
          bytesReceived += chunk.length;
          if (bytesReceived > MAX_TARBALL_BYTES) {
            cb(new Error(`Tarball exceeds ${MAX_TARBALL_BYTES} byte limit`));
          } else {
            cb(null, chunk);
          }
        },
      });

      await pipeline(Readable.fromWeb(dlRes.body as Parameters<typeof Readable.fromWeb>[0]), byteCounter, createWriteStream(tmpFile));

      // Verify SHA-256
      const actual = await sha256File(tmpFile);
      if (actual !== sha256) {
        await rm(tmpFile, { force: true });
        throw new Error('SHA-256 mismatch — tarball may be corrupted or tampered with');
      }

      // Pre-validate tar entry names to block path traversal before extraction
      const { stdout: tarList } = await execFileAsync('tar', ['-tzf', tmpFile]);
      for (const entry of tarList.split('\n')) {
        if (entry.includes('../') || entry.startsWith('/')) {
          await rm(tmpFile, { force: true });
          throw new Error(`Tarball contains unsafe path: ${entry}`);
        }
      }

      // Extract
      await mkdir(targetDir, { recursive: true });
      await execFileAsync('tar', ['-xzf', tmpFile, '-C', targetDir, '--strip-components=1', '--no-absolute-names', '--no-overwrite-dir', '--no-same-owner']);
      await rm(tmpFile, { force: true });

      // Health check: verify server entry point exists
      if (!existsSync(join(targetDir, 'packages', 'server', 'dist', 'index.js'))) {
        await rm(targetDir, { recursive: true, force: true });
        throw new Error('Health check failed — server entry point not found in extracted tarball');
      }

      // Atomic symlink flip: remove stale .next if present, create, rename
      const tmpLink = `${this.currentLink}.next`;
      try { unlinkSync(tmpLink); } catch { /* ignore if tmpLink doesn't exist */ }
      symlinkSync(targetDir, tmpLink);
      renameSync(tmpLink, this.currentLink);

      // Remove apply lock
      try { rmSync(applyingLock); } catch { /* ignore */ }

      // Prune old releases so the SD card doesn't fill over time — each release bundles its own
      // node_modules (~100+ MB). Keep the newest few for rollback headroom.
      this.pruneOldReleases(3);

      // Restart via systemd (best-effort — service will restart itself)
      execFileAsync('systemctl', ['restart', 'smartdisplay']).catch(() => {});

      this.status = {
        ...this.status,
        currentVersion: version,
        latestVersion: version,
        updateAvailable: false,
        applying: false,
      };
    } catch (err) {
      try { rmSync(applyingLock); } catch { /* ignore */ }
      console.error('[update] apply failed:', err);
      this.status = { ...this.status, applying: false, error: 'Update failed — check server logs' };
      throw err;
    }
  }

  /**
   * Delete all but the `keep` newest release directories (by semantic version). Never removes the
   * currently-linked release. Best-effort: failures to remove a stale dir are logged, not fatal.
   */
  private pruneOldReleases(keep: number): void {
    let entries: string[];
    try {
      entries = readdirSync(this.releasesDir)
        .filter((e) => VERSION_RE.test(e.replace(/^v/, '')))
        .sort((a, b) => {
          const [aMaj, aMin, aPat] = parseVersion(a);
          const [bMaj, bMin, bPat] = parseVersion(b);
          return bMaj - aMaj || bMin - aMin || bPat - aPat;
        });
    } catch {
      return;
    }

    // Resolve the currently-linked release so we never delete what's running.
    let currentTarget: string | null = null;
    try { currentTarget = readlinkSync(this.currentLink); } catch { /* no current link */ }

    for (const stale of entries.slice(keep)) {
      const dir = join(this.releasesDir, stale);
      if (currentTarget && (dir === currentTarget || currentTarget.endsWith(`/${stale}`))) continue;
      try { rmSync(dir, { recursive: true, force: true }); } catch (err) {
        console.error(`[update] failed to prune old release ${stale}:`, err);
      }
    }
  }

  rollback(): void {
    if (!this.managed) throw new Error('Not running from a managed install — cannot rollback');
    if (this.status.applying) throw new Error('Update in progress — cannot rollback now');
    const applyingLockPath = join(this.installDir, '.applying');
    if (existsSync(applyingLockPath)) {
      // Treat as stale if mtime > 10 minutes (crashed apply)
      const age = Date.now() - statSync(applyingLockPath).mtimeMs;
      if (age < 10 * 60 * 1000) throw new Error('Update in progress — cannot rollback now');
      try { unlinkSync(applyingLockPath); } catch { /* ignore */ }
    }

    // Find the two most recent release dirs (sorted descending)
    let entries: string[];
    try {
      entries = readdirSync(this.releasesDir)
        .filter((e) => VERSION_RE.test(e.replace(/^v/, '')))
        .sort((a, b) => {
          const [aMaj, aMin, aPat] = parseVersion(a);
          const [bMaj, bMin, bPat] = parseVersion(b);
          return bMaj - aMaj || bMin - aMin || bPat - aPat;
        });
    } catch {
      throw new Error('Could not read releases directory');
    }

    // Current is entries[0]; previous is entries[1]
    const previous = entries[1];
    if (!previous) throw new Error('No previous release to roll back to');

    const previousDir = join(this.releasesDir, previous);
    const tmpLink = `${this.currentLink}.next`;
    symlinkSync(previousDir, tmpLink);
    renameSync(tmpLink, this.currentLink);

    execFileAsync('systemctl', ['restart', 'smartdisplay']).catch(() => {});

    this.status = {
      ...this.status,
      currentVersion: previous.replace(/^v/, ''),
      updateAvailable: false,
      error: null,
    };
  }
}
