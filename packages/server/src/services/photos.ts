import { randomUUID } from 'node:crypto';
import { readdirSync, lstatSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import type Database from 'better-sqlite3';
import type { PhotoSource, PhotoState } from '@smart-display/shared';

interface PhotoRow {
  id: string;
  name: string;
  path: string;
  enabled: number;
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

function walk(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) continue; // skip symlinks — prevents traversal out of base
      if (stat.isDirectory()) {
        results.push(...walk(full));
      } else if (IMAGE_EXTS.has(extname(entry).toLowerCase())) {
        results.push(full);
      }
    } catch {
      // skip inaccessible
    }
  }
  return results;
}

const PHOTOS_BASE = resolve('/data/photos');

export class PhotoService {
  private photoList: string[] = [];
  private currentIndex = 0;

  constructor(private readonly db: Database.Database) {}

  list(): PhotoSource[] {
    return (this.db.prepare('SELECT * FROM photo_sources ORDER BY created_at ASC').all() as PhotoRow[]).map(
      (r) => ({ id: r.id, name: r.name, path: r.path, enabled: r.enabled === 1 }),
    );
  }

  add(name: string, path: string): PhotoSource {
    const resolved = resolve(path);
    if (resolved !== PHOTOS_BASE && !resolved.startsWith(PHOTOS_BASE + sep)) {
      throw new Error('path must be under /data/photos');
    }
    const id = randomUUID();
    this.db.prepare('INSERT INTO photo_sources (id, name, path) VALUES (?, ?, ?)').run(id, name, path);
    return { id, name, path, enabled: true };
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM photo_sources WHERE id = ?').run(id);
  }

  scanAll(): string[] {
    const sources = this.list().filter((s) => s.enabled);
    this.photoList = sources.flatMap((s) => walk(s.path));
    this.currentIndex = 0;
    return this.photoList;
  }

  getCurrentPath(): string | null {
    return this.photoList[this.currentIndex] ?? null;
  }

  advance(): void {
    if (this.photoList.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.photoList.length;
  }

  getState(): PhotoState {
    return {
      sources: this.list(),
      currentPhoto: this.photoList.length > 0 ? '/api/photos/current' : null,
      totalCount: this.photoList.length,
    };
  }
}
