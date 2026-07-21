import { createReadStream, existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { BackgroundSource } from '@smart-display/shared';
import type { BackgroundService } from '../services/background.js';
import type { SecretsService } from '../services/secrets.js';
import type { SettingsService } from '../services/settings.js';
import type { EventBus } from '../event-bus.js';

const VALID_SOURCES = new Set<BackgroundSource>(['nasa', 'unsplash', 'pexels']);

export function createBackgroundRoutes(background: BackgroundService, secrets: SecretsService, settings: SettingsService, bus: EventBus) {
  return async function backgroundRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/background', async (_req, reply) => {
      return reply.send(background.getState());
    });

    app.get('/api/background/current', async (_req, reply) => {
      const filePath = background.getImagePath();
      if (!filePath || !existsSync(filePath)) return reply.status(404).send({ error: 'No background image cached yet' });
      reply.header('Content-Type', 'image/jpeg');
      reply.header('Cache-Control', 'no-store');
      return reply.send(createReadStream(filePath));
    });

    // POST /api/background/refresh — manual "get a new photo now" trigger (also used right
    // after a source is switched or a key is saved, so the user doesn't wait for the next poll).
    app.post('/api/background/refresh', async (_req, reply) => {
      const source = settings.get().bgCyclingSource;
      try {
        const state = await background.refresh(source);
        bus.emit('background:state', state);
        return reply.send(state);
      } catch (err) {
        return reply.status(502).send({ error: (err as Error).message ?? 'Failed to fetch background image' });
      }
    });

    app.post('/api/background/keys', {
      schema: {
        body: {
          type: 'object',
          required: ['source', 'apiKey'],
          additionalProperties: false,
          properties: {
            source: { type: 'string', enum: ['nasa', 'unsplash', 'pexels'] },
            apiKey: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    }, async (req, reply) => {
      const { source, apiKey } = req.body as { source: BackgroundSource; apiKey: string };
      if (!VALID_SOURCES.has(source)) return reply.status(400).send({ error: 'Invalid source' });
      secrets.set(`${source}_api_key`, `${source} API key`, apiKey);
      return reply.send({ ok: true, settings: settings.get() });
    });

    app.delete('/api/background/keys/:source', async (req, reply) => {
      const { source } = req.params as { source: string };
      if (!VALID_SOURCES.has(source as BackgroundSource)) return reply.status(400).send({ error: 'Invalid source' });
      secrets.delete(`${source}_api_key`);
      return reply.send({ ok: true, settings: settings.get() });
    });
  };
}
