import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ResetService } from '../services/reset.js';
import type { SettingsService } from '../services/settings.js';

interface AuthGuard {
  isLockedOut(): boolean;
  recordFailure(): void;
  clearFailures(): void;
}

function pinValid(provided: string | undefined, correct: string): boolean {
  const p = typeof provided === 'string' ? provided : '';
  if (p.length > 64) return false;
  const maxLen = Math.max(p.length, correct.length);
  return (
    timingSafeEqual(Buffer.from(p.padEnd(maxLen, '\0')), Buffer.from(correct.padEnd(maxLen, '\0'))) &&
    p.length === correct.length
  );
}

export function createResetRoutes(
  resetService: ResetService,
  settings: SettingsService,
  authGuard: AuthGuard,
  clearAllSessions: () => void,
) {
  const resetBodySchema = {
    body: {
      type: 'object',
      properties: { pin: { type: 'string', maxLength: 64 } },
    },
  };

  return async function resetRoutes(app: FastifyInstance): Promise<void> {
    /** Wipe all user data; keep WiFi + PIN. Device re-enters onboarding. */
    app.post('/reset/data', { schema: resetBodySchema }, async (req, reply) => {
      if (authGuard.isLockedOut()) {
        return reply.status(429).send({ error: 'Too many failed attempts. Try again later.' });
      }
      const { pin } = req.body as { pin?: string };
      if (!pinValid(pin, settings.getDevicePin())) {
        authGuard.recordFailure();
        return reply.status(401).send({ error: 'Invalid PIN' });
      }
      authGuard.clearFailures();
      try {
        await resetService.resetData();
        clearAllSessions();
        return reply.send({ ok: true });
      } catch (err) {
        console.error('[reset] data reset error:', err);
        return reply.status(500).send({ error: 'Reset failed' });
      }
    });

    /** Full factory reset: wipe data + WiFi credentials + reboot (Linux only). */
    app.post('/reset/factory', { schema: resetBodySchema }, async (req, reply) => {
      if (authGuard.isLockedOut()) {
        return reply.status(429).send({ error: 'Too many failed attempts. Try again later.' });
      }
      const { pin } = req.body as { pin?: string };
      if (!pinValid(pin, settings.getDevicePin())) {
        authGuard.recordFailure();
        return reply.status(401).send({ error: 'Invalid PIN' });
      }
      authGuard.clearFailures();
      try {
        await resetService.factoryReset();
        clearAllSessions();
        return reply.send({ ok: true, rebooting: process.platform === 'linux' });
      } catch (err) {
        console.error('[reset] factory reset error:', err);
        return reply.status(500).send({ error: 'Factory reset failed' });
      }
    });
  };
}
