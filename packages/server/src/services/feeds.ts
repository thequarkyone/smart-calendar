import { randomUUID } from 'node:crypto';
import Parser from 'rss-parser';
import type Database from 'better-sqlite3';
import type { FeedSourcePublic, FeedItem, FeedsState } from '@smart-display/shared';
import type { SecretsService } from './secrets.js';
import { assertSafeFetchUrl } from '../util/url-guard.js';

const FEED_TIMEOUT_MS = 15_000;
const FEED_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

interface FeedRow {
  id: string;
  name: string;
  url: string;
  url_secret_id: string | null;
  enabled: number;
  max_items: number;
}

const HTTP_LINK_RE = /^https?:\/\//i;

function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null;
  // Truncate before scanning to bound worst-case work on deeply-nested or malformed markup
  const input = s.length > 1000 ? s.slice(0, 1000) : s;
  let out = '';
  let inTag = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '<') { inTag = true; continue; }
    if (ch === '>') { inTag = false; continue; }
    if (!inTag) out += ch;
  }
  return out.trim() || null;
}

export class FeedsService {
  private items: Map<string, FeedItem[]> = new Map();
  private parser = new Parser();

  constructor(
    private readonly db: Database.Database,
    private readonly secrets: SecretsService,
  ) {
    this.migrateExistingUrls();
  }

  /** One-time startup migration: move plaintext URLs from the url column into secrets. */
  private migrateExistingUrls(): void {
    const rows = this.db
      .prepare('SELECT id, name, url FROM feeds WHERE url_secret_id IS NULL AND url != ?')
      .all('') as Array<{ id: string; name: string; url: string }>;
    for (const row of rows) {
      const secretId = `feed-url-${row.id}`;
      this.secrets.set(secretId, `Feed URL for ${row.name}`, row.url);
      this.db
        .prepare(`UPDATE feeds SET url_secret_id = ?, url = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(secretId, '', row.id);
    }
  }

  private getUrl(row: FeedRow): string {
    if (row.url_secret_id) {
      return this.secrets.get(row.url_secret_id) ?? '';
    }
    return row.url;
  }

  list(): FeedSourcePublic[] {
    return (this.db.prepare('SELECT * FROM feeds ORDER BY created_at ASC').all() as FeedRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      urlSet: (r.url_secret_id != null && (this.secrets.get(r.url_secret_id) ?? '').length > 0) || r.url.length > 0,
      enabled: r.enabled === 1,
      maxItems: r.max_items,
    }));
  }

  listForBackup(): Array<{ id: string; name: string; url: string; enabled: boolean; maxItems: number }> {
    return (this.db.prepare('SELECT * FROM feeds ORDER BY created_at ASC').all() as FeedRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      url: this.getUrl(r),
      enabled: r.enabled === 1,
      maxItems: r.max_items,
    }));
  }

  async add(name: string, url: string, maxItems = 5): Promise<FeedSourcePublic> {
    await assertSafeFetchUrl(url);
    const clampedMax = Math.min(50, Math.max(1, maxItems));
    const id = randomUUID();
    const secretId = `feed-url-${id}`;
    this.secrets.set(secretId, `Feed URL for ${name}`, url);
    this.db
      .prepare('INSERT INTO feeds (id, name, url, url_secret_id, max_items) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, '', secretId, clampedMax);
    return { id, name, urlSet: true, enabled: true, maxItems: clampedMax };
  }

  remove(id: string): void {
    const row = this.db.prepare('SELECT url_secret_id FROM feeds WHERE id = ?').get(id) as Pick<FeedRow, 'url_secret_id'> | undefined;
    this.db.prepare('DELETE FROM feeds WHERE id = ?').run(id);
    if (row?.url_secret_id) this.secrets.delete(row.url_secret_id);
    this.items.delete(id);
  }

  async sync(id: string): Promise<FeedItem[]> {
    const row = this.db.prepare('SELECT * FROM feeds WHERE id = ?').get(id) as FeedRow | undefined;
    if (!row) throw new Error(`Feed not found: ${id}`);
    const url = this.getUrl(row);
    if (!url) throw new Error(`No URL stored for feed ${id}`);
    // Validate only — resolveSafeUrl's hostname->IP rewrite breaks TLS SNI for any provider
    // that routes HTTPS by hostname at the load balancer (Google, Cloudflare-fronted hosts,
    // etc.), causing a hard failure (self-signed cert fallback) instead of a working fetch.
    // Confirmed live against calendar.ts's identical pattern. Reopens a narrow DNS-rebinding
    // TOCTOU window — same accepted tradeoff as update.ts's manifest fetch.
    await assertSafeFetchUrl(url);

    // Fetch with timeout + size cap (#25)
    const signal = AbortSignal.timeout(FEED_TIMEOUT_MS);
    const res = await fetch(url, { signal, redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let bytesRead = 0;
    const chunks: Uint8Array[] = [];
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > FEED_MAX_BYTES) {
        reader.cancel().catch(() => { /* ignore */ });
        throw new Error('Feed response too large');
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');

    const PARSE_TIMEOUT_MS = 10_000;
    const feed = await Promise.race([
      this.parser.parseString(text),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RSS parse timeout')), PARSE_TIMEOUT_MS)),
    ]);
    const items: FeedItem[] = (feed.items ?? []).slice(0, row.max_items).map((item) => {
      const link = item.link ?? '';
      // #24: only pass through http(s) links to prevent javascript: / data: XSS
      const safeLink = HTTP_LINK_RE.test(link) ? link : '';
      return {
        feedId: id,
        title: item.title ?? '(no title)',
        link: safeLink,
        pubDate: item.pubDate ?? item.isoDate ?? null,
        description: stripHtml(item.contentSnippet ?? item.content),
      };
    });
    this.items.set(id, items);
    return items;
  }

  getState(): FeedsState {
    const sources = this.list();
    const items = sources.flatMap((s) => this.items.get(s.id) ?? []);
    return { sources, items };
  }
}
