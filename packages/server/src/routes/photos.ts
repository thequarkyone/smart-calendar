import { createReadStream, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { extname, resolve, sep, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import type { PhotoService } from '../services/photos.js';
import type { EventBus } from '../event-bus.js';

const PHOTOS_BASE = resolve('/data/photos');
const UPLOAD_DIR = join(PHOTOS_BASE, 'uploaded');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

function assertUnderPhotosBase(p: string): void {
  const resolved = resolve(p);
  if (resolved !== PHOTOS_BASE && !resolved.startsWith(PHOTOS_BASE + sep)) {
    throw new Error('path must be under /data/photos');
  }
}

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export function createPhotosRoutes(photoService: PhotoService, bus: EventBus) {
  return async function photosRoutes(app: FastifyInstance): Promise<void> {
    await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

    app.post('/api/photos/upload', async (req, reply) => {
      const data = await req.file();
      if (!data) return reply.status(400).send({ error: 'No file provided' });
      const mime = data.mimetype;
      if (!ALLOWED_MIME.has(mime)) {
        return reply.status(400).send({ error: 'Only jpeg, png, and webp files are allowed' });
      }
      const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
      mkdirSync(UPLOAD_DIR, { recursive: true });
      const filename = `${randomUUID()}${ext}`;
      const dest = join(UPLOAD_DIR, filename);
      // Validate dest is under PHOTOS_BASE before writing
      const resolvedDest = resolve(dest);
      if (!resolvedDest.startsWith(PHOTOS_BASE + sep)) {
        return reply.status(400).send({ error: 'Invalid path' });
      }
      try {
        await pipeline(data.file, createWriteStream(resolvedDest));
      } catch {
        return reply.status(500).send({ error: 'Upload failed' });
      }
      // Auto-register the uploaded/ directory as a photo source if not already present
      const sources = photoService.list();
      if (!sources.some((s) => resolve(s.path) === UPLOAD_DIR)) {
        photoService.add('Uploaded photos', UPLOAD_DIR);
      }
      photoService.scanAll();
      const state = photoService.getState();
      bus.emit('photos:state', state);
      return reply.status(201).send({ filename: basename(resolvedDest), state });
    });

    app.get('/api/photos/uploaded', async (_req, reply) => {
      const sources = photoService.list();
      const hasUploaded = sources.some((s) => resolve(s.path) === UPLOAD_DIR);
      if (!hasUploaded || !existsSync(UPLOAD_DIR)) return reply.send({ files: [] });
      const { readdirSync } = await import('node:fs');
      const files = readdirSync(UPLOAD_DIR)
        .filter((f) => ALLOWED_MIME.has(MIME[extname(f).toLowerCase()] ?? ''))
        .map((f) => ({ name: f, url: `/api/photos/uploaded/${encodeURIComponent(f)}` }));
      return reply.send({ files });
    });

    app.get('/api/photos/uploaded/:filename', async (req, reply) => {
      const { filename } = req.params as { filename: string };
      // Validate: no path separators, only basename
      if (filename !== basename(filename) || filename.includes('\0')) {
        return reply.status(400).send({ error: 'Invalid filename' });
      }
      const filePath = join(UPLOAD_DIR, filename);
      const resolved = resolve(filePath);
      if (!resolved.startsWith(UPLOAD_DIR + sep) && resolved !== UPLOAD_DIR) {
        return reply.status(400).send({ error: 'Invalid path' });
      }
      if (!existsSync(resolved)) return reply.status(404).send({ error: 'Not found' });
      const ext = extname(resolved).toLowerCase();
      const mime2 = MIME[ext] ?? 'application/octet-stream';
      reply.header('Content-Type', mime2);
      reply.header('Cache-Control', 'no-store');
      return reply.send(createReadStream(resolved));
    });

    app.get('/api/photos', async (_req, reply) => {
      return reply.send(photoService.getState());
    });

    app.post('/api/photos', {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'path'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', maxLength: 200 },
            path: { type: 'string', maxLength: 512 },
          },
        },
      },
    }, async (req, reply) => {
      const { name, path } = req.body as { name: string; path: string };
      try {
        assertUnderPhotosBase(path);
      } catch {
        return reply.status(400).send({ error: 'Photo path must be under /data/photos' });
      }
      photoService.add(name, path);
      photoService.scanAll();
      const state = photoService.getState();
      bus.emit('photos:state', state);
      return reply.status(201).send(state);
    });

    app.delete('/api/photos/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      photoService.remove(id);
      photoService.scanAll();
      const state = photoService.getState();
      bus.emit('photos:state', state);
      return reply.send(state);
    });

    app.get('/api/photos/current', async (_req, reply) => {
      let filePath = photoService.getCurrentPath();
      if (filePath && !existsSync(filePath)) {
        photoService.scanAll();
        filePath = photoService.getCurrentPath();
      }
      if (!filePath) return reply.status(404).send({ error: 'No photos' });
      // Re-validate containment: index may have been seeded before symlink-stripping was added
      try {
        assertUnderPhotosBase(filePath);
      } catch {
        return reply.status(404).send({ error: 'No photos' });
      }
      const ext = extname(filePath).toLowerCase();
      const mime = MIME[ext] ?? 'application/octet-stream';
      reply.header('Content-Type', mime);
      reply.header('Cache-Control', 'no-store');
      return reply.send(createReadStream(filePath));
    });

    app.post('/api/photos/next', async (_req, reply) => {
      photoService.advance();
      const state = photoService.getState();
      bus.emit('photos:state', state);
      return reply.send(state);
    });
  };
}
