import type { FastifyInstance } from 'fastify';
import type { WidgetStyle } from '@smart-display/shared';
import type { TilesService } from '../services/tiles.js';
import type { EventBus } from '../event-bus.js';

export function createTilesRoutes(tilesService: TilesService, bus: EventBus) {
  return async function tilesRoutes(app: FastifyInstance): Promise<void> {
    app.get('/tiles', async () => tilesService.list());

    app.patch<{ Params: { id: string }; Body: { enabled?: boolean; style?: WidgetStyle; config?: Record<string, unknown> } }>(
      '/tiles/:id',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              enabled: { type: 'boolean' },
              config: {
                type: 'object',
                maxProperties: 20,
                additionalProperties: { type: ['string', 'number', 'boolean', 'null'], maxLength: 1000 },
              },
              style: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  bgColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
                  bgOpacity: { type: 'number', minimum: 0, maximum: 1 },
                  borderRadius: { type: 'integer', minimum: 0, maximum: 100 },
                  borderColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
                  fontScale: { type: 'number', minimum: 0.5, maximum: 3 },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { enabled, style, config } = request.body;
        try {
          let updated = tilesService.list().find((t) => t.id === request.params.id);
          if (!updated) return reply.status(404).send({ error: 'Tile not found' });
          if (enabled !== undefined) {
            updated = tilesService.toggle(request.params.id, enabled);
          }
          if (config !== undefined) {
            updated = tilesService.updateConfig(request.params.id, config);
          }
          if (style !== undefined) {
            updated = tilesService.updateStyle(request.params.id, style);
          }
          bus.emit('tiles:changed', tilesService.list());
          return updated;
        } catch {
          return reply.status(404).send({ error: 'Tile not found' });
        }
      },
    );
  };
}
