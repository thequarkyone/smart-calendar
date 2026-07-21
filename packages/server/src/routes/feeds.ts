import type { FastifyInstance } from 'fastify';
import type { FeedsService } from '../services/feeds.js';
import type { EventBus } from '../event-bus.js';

export function createFeedsRoutes(feedsService: FeedsService, bus: EventBus) {
  return async function feedsRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/feeds', async (_req, reply) => {
      return reply.send(feedsService.getState());
    });

    app.post('/api/feeds', {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'url'],
          properties: {
            name: { type: 'string', maxLength: 200 },
            url: { type: 'string', maxLength: 2048 },
            maxItems: { type: 'integer', minimum: 1, maximum: 50 },
          },
        },
      },
    }, async (req, reply) => {
      const { name, url, maxItems } = req.body as { name: string; url: string; maxItems?: number };
      let source: Awaited<ReturnType<typeof feedsService.add>>;
      try {
        source = await feedsService.add(name, url, maxItems);
      } catch (err) {
        app.log.warn({ err }, '[feeds] add failed');
        return reply.status(400).send({ error: 'Invalid or unreachable feed URL' });
      }
      try { await feedsService.sync(source.id); } catch { /* best effort */ }
      const state = feedsService.getState();
      bus.emit('feeds:state', state);
      return reply.status(201).send(state);
    });

    app.delete('/api/feeds/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      feedsService.remove(id);
      const state = feedsService.getState();
      bus.emit('feeds:state', state);
      return reply.send(state);
    });

    app.post('/api/feeds/:id/sync', async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        await feedsService.sync(id);
      } catch (err) {
        app.log.warn({ err }, '[feeds] sync failed');
        return reply.status(400).send({ error: 'Invalid or unreachable feed URL' });
      }
      const state = feedsService.getState();
      bus.emit('feeds:state', state);
      return reply.send(state);
    });
  };
}
