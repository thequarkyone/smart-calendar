import type { FastifyInstance } from 'fastify';
import type { UpdateService } from '../services/update.js';

export function createUpdateRoutes(updateService: UpdateService) {
  return async function updateRoutes(app: FastifyInstance): Promise<void> {
    app.get('/update', async (_req, reply) => {
      return reply.send(updateService.getStatus());
    });

    app.post('/update/check', async (_req, reply) => {
      const status = await updateService.check();
      return reply.send(status);
    });

    app.post('/update/apply', async (_req, reply) => {
      try {
        await updateService.apply();
        return reply.send(updateService.getStatus());
      } catch (err) {
        app.log.error({ err }, 'update apply failed');
        return reply.status(400).send({ error: 'Update failed' });
      }
    });

    app.post('/update/rollback', async (_req, reply) => {
      try {
        updateService.rollback();
        return reply.send(updateService.getStatus());
      } catch (err) {
        app.log.error({ err }, 'update rollback failed');
        return reply.status(400).send({ error: 'Rollback failed' });
      }
    });
  };
}
