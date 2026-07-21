import type { FastifyInstance } from 'fastify';

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' as const }));

  app.get('/status', async () => ({
    status: 'ok' as const,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  }));
}
