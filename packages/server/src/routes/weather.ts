import type { FastifyInstance } from 'fastify';
import type { WeatherService } from '../services/weather.js';
import type { SettingsService } from '../services/settings.js';
import type { EventBus } from '../event-bus.js';

interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export function createWeatherRoutes(weatherService: WeatherService, settingsService: SettingsService, bus: EventBus) {
  return async function weatherRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/weather', async (_req, reply) => {
      return reply.send(weatherService.getState());
    });

    app.post('/api/weather/refresh', async (_req, reply) => {
      const settings = settingsService.get();
      const loc = settings.location;
      if (!loc) return reply.status(400).send({ error: 'No location set in settings' });
      const state = await weatherService.fetch(loc.latitude, loc.longitude, settings.units);
      bus.emit('weather:state', state);
      return reply.send(state);
    });

    app.get<{ Querystring: { q?: string } }>('/api/weather/geocode', async (request, reply) => {
      const q = (request.query.q ?? '').trim();
      if (!q || q.length > 100) return reply.status(400).send({ error: 'Query must be 1-100 characters' });
      const params = new URLSearchParams({ name: q, count: '5', language: 'en', format: 'json' });
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return reply.status(502).send({ error: 'Geocoding lookup failed' });
      const data = (await res.json()) as { results?: GeocodeResult[] };
      const results = (data.results ?? []).map((r) => ({
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country,
        admin1: r.admin1,
      }));
      return reply.send({ results });
    });
  };
}
