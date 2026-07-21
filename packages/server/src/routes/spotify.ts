import type { FastifyInstance } from 'fastify';
import type { SpotifyService } from '../services/spotify.js';
import type { EventBus } from '../event-bus.js';

// Hardcode redirect URI — never derive from the Host header (attacker-controlled).
// In dev, also accept localhost so the OAuth flow works without mDNS.
function getRedirectUri(): string {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return 'http://localhost:3000/api/spotify/callback';
  }
  return 'http://smartdisplay.local/api/spotify/callback';
}

export function createSpotifyRoutes(spotify: SpotifyService, _bus: EventBus) {
  return async function spotifyRoutes(app: FastifyInstance): Promise<void> {
    // GET /api/spotify/status — returns current SpotifyState
    app.get('/api/spotify/status', async (_req, reply) => {
      return reply.send(spotify.getState());
    });

    // POST /api/spotify/credentials — save client ID + secret, return auth URL
    app.post('/api/spotify/credentials', {
      schema: {
        body: {
          type: 'object',
          required: ['clientId', 'clientSecret'],
          properties: {
            clientId: { type: 'string', minLength: 1, maxLength: 200 },
            clientSecret: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    }, async (req, reply) => {
      const { clientId, clientSecret } = req.body as { clientId: string; clientSecret: string };
      spotify.setCredentials(clientId, clientSecret);
      const authUrl = spotify.getAuthUrl(getRedirectUri());
      return reply.send({ ok: true, authUrl });
    });

    // GET /api/spotify/connect — redirect browser to Spotify auth (auth'd via session cookie)
    app.get('/api/spotify/connect', async (_req, reply) => {
      const authUrl = spotify.getAuthUrl(getRedirectUri());
      return reply.redirect(authUrl);
    });

    // GET /api/spotify/callback — OAuth callback from Spotify (no auth required — Spotify drives this)
    app.get('/api/spotify/callback', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            code: { type: 'string', maxLength: 512 },
            state: { type: 'string', maxLength: 128 },
            error: { type: 'string', maxLength: 128 },
          },
        },
      },
    }, async (req, reply) => {
      const { code, state, error } = req.query as Record<string, string | undefined>;

      if (error) {
        return reply.redirect(`/?spotify=error&reason=${encodeURIComponent(error)}`);
      }
      if (!code || !state) {
        return reply.redirect('/?spotify=error&reason=missing_params');
      }
      if (!spotify.validateState(state)) {
        return reply.redirect('/?spotify=error&reason=invalid_state');
      }

      try {
        await spotify.handleCallback(code, getRedirectUri());
        return reply.redirect('/?spotify=connected');
      } catch (err) {
        console.error('[spotify] callback error:', (err as Error).message);
        return reply.redirect('/?spotify=error&reason=token_exchange');
      }
    });

    // DELETE /api/spotify/disconnect — revoke tokens and credentials
    app.delete('/api/spotify/disconnect', async (_req, reply) => {
      spotify.stopPolling();
      spotify.clearCredentials();
      return reply.send({ ok: true });
    });
  };
}
