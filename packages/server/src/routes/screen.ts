import type { FastifyInstance } from 'fastify';
import type { EventBus } from '../event-bus.js';

export function createScreenRoutes(bus: EventBus) {
  return async function screenRoutes(app: FastifyInstance): Promise<void> {
    app.post('/api/screen/wake', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (_req, reply) => {
      bus.emit('screen:wake');
      return reply.send({ ok: true });
    });
  };
}
