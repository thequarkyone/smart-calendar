import type { FastifyInstance } from 'fastify';
import type { SystemService } from '../services/system.js';

export function createSystemRoutes(systemService: SystemService) {
  return async function systemRoutes(app: FastifyInstance): Promise<void> {
    /** Reboot the device — non-destructive, no PIN re-entry required beyond normal session auth
     * (already enforced globally for all mutating routes). For a stuck device, not data loss. */
    app.post('/system/reboot', async (_req, reply) => {
      const result = await systemService.reboot();
      return reply.send({ ok: true, ...result });
    });
  };
}
