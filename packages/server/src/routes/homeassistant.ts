import type { FastifyInstance } from 'fastify';
import type { HaService } from '../services/homeassistant.js';
import type { EventBus } from '../event-bus.js';
import { ENTITY_ID_RE } from '../util/url-guard.js';

// Printable ASCII only, 1–512 chars (HA long-lived access tokens are ~200 chars)
const HA_TOKEN_RE = /^[\x21-\x7E]{1,512}$/;

export function createHaRoutes(haService: HaService, bus: EventBus) {
  return async function haRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/ha', async (_req, reply) => {
      return reply.send(haService.getState());
    });

    app.get('/api/ha/browse', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (_req, reply) => {
      try {
        const entities = await haService.browseEntities();
        return reply.send(entities);
      } catch (err) {
        console.error('[ha] browse error:', err);
        return reply.status(400).send({ error: 'Could not fetch entities from Home Assistant' });
      }
    });

    app.patch('/api/ha/settings', {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', minLength: 1, maxLength: 2048 },
            token: { type: 'string', minLength: 1, maxLength: 512 },
            enabled: { type: 'boolean' },
          },
        },
      },
    }, async (req, reply) => {
      const { url, token, enabled } = req.body as { url?: string; token?: string; enabled?: boolean };
      // Validate token format if provided and non-empty
      if (token !== undefined && token !== '' && !HA_TOKEN_RE.test(token)) {
        return reply.status(400).send({ error: 'Invalid token format' });
      }
      const current = haService.getHaSettings();
      try {
        await haService.setHaSettings(
          url !== undefined ? url : current.url,
          token !== undefined ? token : current.token,
          enabled !== undefined ? enabled : current.enabled,
        );
      } catch (err) {
        console.error('[ha] setHaSettings error:', err);
        return reply.status(400).send({ error: 'Invalid or unreachable Home Assistant URL' });
      }
      const state = haService.getState();
      bus.emit('ha:state', state);
      return reply.send(state);
    });

    app.post('/api/ha/test', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (_req, reply) => {
      const result = await haService.test();
      return reply.send(result);
    });

    app.post('/api/ha/refresh', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (_req, reply) => {
      const entityIds = haService.getEntityIds();
      await haService.fetchEntities(entityIds);
      const state = haService.getState();
      bus.emit('ha:state', state);
      return reply.send(state);
    });

    app.post('/api/ha/entities', {
      schema: {
        body: {
          type: 'object',
          required: ['entityId'],
          additionalProperties: false,
          properties: { entityId: { type: 'string', maxLength: 128 } },
        },
      },
    }, async (req, reply) => {
      const { entityId } = req.body as { entityId?: string };
      if (typeof entityId !== 'string' || !ENTITY_ID_RE.test(entityId)) {
        return reply.status(400).send({ error: 'Invalid entity ID format' });
      }
      haService.addEntityId(entityId);
      // Fetch the new entity immediately so the display updates without waiting
      await haService.fetchEntities(haService.getEntityIds());
      const state = haService.getState();
      bus.emit('ha:state', state);
      return reply.send(state);
    });

    app.post('/api/ha/entities/:entityId/toggle', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (req, reply) => {
      const { entityId } = req.params as { entityId: string };
      if (!ENTITY_ID_RE.test(entityId)) {
        return reply.status(400).send({ error: 'Invalid entity ID format' });
      }
      try {
        await haService.toggleEntity(entityId);
      } catch (err) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'UNSUPPORTED_DOMAIN') {
          return reply.status(405).send({ error: err.message });
        }
        console.error('[ha] toggle error:', err);
        return reply.status(502).send({ error: 'Could not toggle entity' });
      }
      return reply.status(204).send();
    });

    app.delete('/api/ha/entities/:entityId', async (req, reply) => {
      const { entityId } = req.params as { entityId: string };
      if (!ENTITY_ID_RE.test(entityId)) {
        return reply.status(400).send({ error: 'Invalid entity ID format' });
      }
      haService.removeEntityId(entityId);
      const state = haService.getState();
      bus.emit('ha:state', state);
      return reply.send(state);
    });
  };
}
