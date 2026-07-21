import type { FastifyInstance } from 'fastify';
import type { WifiService } from '../services/wifi.js';

export function createWifiRoutes(wifiService: WifiService) {
  return async function wifiRoutes(app: FastifyInstance): Promise<void> {
    app.get('/wifi/status', async (_req, reply) => {
      return reply.send(wifiService.getStatus());
    });

    app.post('/wifi/connect', {
      schema: {
        body: {
          type: 'object',
          required: ['ssid', 'password'],
          additionalProperties: false,
          properties: {
            ssid: { type: 'string', minLength: 1, maxLength: 32 },
            password: { type: 'string', minLength: 8, maxLength: 63 },
          },
        },
      },
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '5 minutes',
          keyGenerator: (request) => request.ip,
        },
      },
    }, async (req, reply) => {
      const { ssid, password } = req.body as { ssid: string; password: string };
      try {
        await wifiService.prepareConnection(ssid, password);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        req.log.error({ err }, 'wifi prepare failed');
        const isValidation = message.includes('must be') || message.includes('contains invalid');
        return reply.status(isValidation ? 400 : 500).send({ error: isValidation ? message : 'Operation failed' });
      }

      reply.send({ ok: true, status: 'connecting' });

      // Deferred on purpose: activateConnection() is what actually switches wlan0 off the AP,
      // which disconnects any AP-connected caller (the onboarding wizard, always) as a side
      // effect. Waiting until after the response above has gone out gives that response a
      // chance to actually reach the client before its network drops out from under it.
      setTimeout(() => {
        wifiService.activateConnection().catch((err: unknown) => {
          req.log.error({ err }, 'wifi activate failed');
        });
      }, 500);
    });
  };
}
