import type { FastifyInstance } from 'fastify';
import { PRESET_TEMPLATES } from '../templates.js';

export function createTemplatesRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/api/templates', async () => PRESET_TEMPLATES);
  };
}
