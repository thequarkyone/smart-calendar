import type { FastifyInstance } from 'fastify';
import type { CalendarService } from '../services/calendar.js';
import type { EventBus } from '../event-bus.js';

const COLOR_HEX_RE = /^#[0-9a-fA-F]{6}$/;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function getRedirectUri(): string {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return `http://localhost:3000/api/calendars/oauth/google/callback`;
  }
  return `http://smartdisplay.local/api/calendars/oauth/google/callback`;
}

interface AddBody {
  name: string;
  icsUrl: string;
  color?: string;
}

interface AddGoogleBody {
  googleCalendarId: string;
  name: string;
  color?: string;
}

interface CredentialsBody {
  clientId: string;
  clientSecret: string;
}

interface DeleteParams {
  id: string;
}

interface LocalEventBody {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

interface LocalColorBody {
  color: string;
}

export function createCalendarRoutes(calendars: CalendarService, bus: EventBus) {
  return async function calendarRoutes(app: FastifyInstance): Promise<void> {
    app.get('/calendars', async (_req, reply) => {
      return reply.send(calendars.list());
    });

    app.post<{ Body: AddBody }>('/calendars', {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'icsUrl'],
          properties: {
            name: { type: 'string', maxLength: 200 },
            icsUrl: { type: 'string', maxLength: 2048 },
            color: { type: 'string', maxLength: 7 },
          },
        },
      },
    }, async (req, reply) => {
      const { name, icsUrl, color = '#4a90e2' } = req.body;
      if (!name || !icsUrl) {
        return reply.status(400).send({ error: 'name and icsUrl are required' });
      }
      if (!COLOR_HEX_RE.test(color)) {
        return reply.status(400).send({ error: 'color must be a 6-digit hex color (e.g. #4a90e2)' });
      }
      try {
        const source = await calendars.add(name, icsUrl, color);
        return reply.status(201).send(source);
      } catch (err) {
        console.error('[calendars] add error:', err);
        return reply.status(400).send({ error: 'Invalid or unreachable ICS URL' });
      }
    });

    app.patch<{ Params: DeleteParams; Body: { enabled: boolean } }>('/calendars/:id', {
      schema: {
        body: {
          type: 'object',
          required: ['enabled'],
          properties: { enabled: { type: 'boolean' } },
        },
      },
    }, async (req, reply) => {
      const updated = calendars.setEnabled(req.params.id, req.body.enabled);
      if (!updated) return reply.status(404).send({ error: 'Calendar not found' });
      bus.emit('calendar:state', calendars.getState());
      return reply.send(updated);
    });

    app.delete<{ Params: DeleteParams }>('/calendars/:id', async (req, reply) => {
      try {
        calendars.remove(req.params.id);
        bus.emit('calendar:state', calendars.getState());
        return reply.status(204).send();
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        if (msg.includes('built-in')) return reply.status(403).send({ error: 'Built-in calendar cannot be removed' });
        console.error('[calendars] remove error:', err);
        return reply.status(404).send({ error: 'Calendar not found' });
      }
    });

    app.post<{ Params: DeleteParams }>('/calendars/:id/sync', async (req, reply) => {
      try {
        await calendars.sync(req.params.id);
        const state = calendars.getState();
        bus.emit('calendar:state', state);
        return reply.send(state);
      } catch (err) {
        console.error('[calendars] sync error:', err);
        return reply.status(404).send({ error: 'Calendar not found or sync failed' });
      }
    });

    // --- Google Calendar OAuth ---

    // Store Google OAuth client credentials
    app.post<{ Body: CredentialsBody }>('/calendars/oauth/google/credentials', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['clientId', 'clientSecret'],
          properties: {
            clientId: { type: 'string', maxLength: 256 },
            clientSecret: { type: 'string', maxLength: 256 },
          },
        },
      },
    }, async (req, reply) => {
      const { clientId, clientSecret } = req.body;
      if (!clientId.trim() || !clientSecret.trim()) {
        return reply.status(400).send({ error: 'clientId and clientSecret are required' });
      }
      calendars.setGoogleCredentials(clientId.trim(), clientSecret.trim());
      return reply.send({ ok: true });
    });

    // Initiate Google OAuth flow — returns the URL for the client to navigate to
    app.get('/calendars/oauth/google/start', {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (_req, reply) => {
      if (!calendars.hasGoogleCredentials()) {
        return reply.status(400).send({ error: 'Google OAuth credentials not configured' });
      }
      const clientId = calendars.getGoogleClientId();
      if (!clientId) return reply.status(400).send({ error: 'Google client_id not found' });

      const state = calendars.createOAuthState();
      const redirectUri = getRedirectUri();

      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', GOOGLE_SCOPE);
      url.searchParams.set('state', state);
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent'); // always get refresh_token

      // State is NOT returned to the client — it is round-tripped by Google in the redirect
      // and validated server-side. Sending it to the client would allow an XSS to replay it.
      return reply.send({ url: url.toString() });
    });

    // Handle Google OAuth callback — exchanges code for tokens, redirects to config UI
    // This route is NOT auth-protected (it's a redirect from Google)
    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
      '/calendars/oauth/google/callback',
      async (req, reply) => {
        const { code, state, error } = req.query;

        const uiBase = process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '';

        if (error || !code || !state) {
          // Allowlist error reasons — do not reflect Google's raw error param to avoid open-redirect-adjacent issues
          const reason = error === 'access_denied' ? 'access_denied' : 'missing_params';
          return reply.redirect(`${uiBase}/#google-oauth=error&reason=${reason}`);
        }

        // Validate state: constant-time is not critical here (state is random and one-time use),
        // but we still consume it atomically to prevent replay
        if (!calendars.consumeOAuthState(state)) {
          return reply.redirect(`${uiBase}/#google-oauth=error&reason=invalid_state`);
        }

        const redirectUri = getRedirectUri();
        try {
          const { accessToken, refreshToken } = await calendars.exchangeGoogleCode(code, redirectUri);
          calendars.storeGoogleTokens(accessToken, refreshToken);
          return reply.redirect(`${uiBase}/#google-oauth=success`);
        } catch (err) {
          console.error('[calendars] Google OAuth exchange error: HTTP exchange failed');
          req.log.warn({ err }, 'Google OAuth exchange failed');
          return reply.redirect(`${uiBase}/#google-oauth=error&reason=exchange_failed`);
        }
      },
    );

    // List the user's Google calendars (after OAuth flow)
    app.get('/calendars/oauth/google/list', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (_req, reply) => {
      if (!calendars.hasGoogleCredentials()) {
        return reply.status(400).send({ error: 'Google OAuth not configured' });
      }
      if (!calendars.hasGoogleRefreshToken()) {
        return reply.status(400).send({ error: 'Not connected to Google Calendar — complete OAuth flow first' });
      }
      try {
        const cals = await calendars.listGoogleCalendars();
        return reply.send(cals);
      } catch (err) {
        console.error('[calendars] Google list error:', err);
        return reply.status(502).send({ error: 'Failed to fetch calendars from Google' });
      }
    });

    // --- Local (manually-created) events ---

    app.get('/calendars/local/events', async (_req, reply) => {
      return reply.send(calendars.listLocalEvents());
    });

    app.get('/calendars/local/color', async (_req, reply) => {
      return reply.send({ color: calendars.getLocalCalendarColor() });
    });

    app.patch<{ Body: LocalColorBody }>('/calendars/local/color', {
      schema: {
        body: {
          type: 'object',
          required: ['color'],
          properties: { color: { type: 'string', maxLength: 7 } },
        },
      },
    }, async (req, reply) => {
      const { color } = req.body;
      if (!COLOR_HEX_RE.test(color)) {
        return reply.status(400).send({ error: 'color must be a 6-digit hex color' });
      }
      calendars.setLocalCalendarColor(color);
      bus.emit('calendar:state', calendars.getState());
      return reply.send({ color });
    });

    app.post<{ Body: LocalEventBody }>('/calendars/local/events', {
      schema: {
        body: {
          type: 'object',
          required: ['title', 'start', 'end', 'allDay'],
          properties: {
            title: { type: 'string', maxLength: 500 },
            start: { type: 'string', maxLength: 32 },
            end: { type: 'string', maxLength: 32 },
            allDay: { type: 'boolean' },
            location: { type: 'string', maxLength: 500 },
          },
        },
      },
    }, async (req, reply) => {
      const { title, start, end, allDay, location } = req.body;
      if (!title.trim()) return reply.status(400).send({ error: 'title is required' });
      try {
        const event = calendars.createLocalEvent({ title, start, end, allDay, location });
        bus.emit('calendar:state', calendars.getState());
        return reply.status(201).send(event);
      } catch (err) {
        console.error('[calendars] create local event error:', err);
        return reply.status(400).send({ error: 'Failed to create event' });
      }
    });

    app.patch<{ Params: DeleteParams; Body: Partial<LocalEventBody> }>(
      '/calendars/local/events/:id',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              title: { type: 'string', maxLength: 500 },
              start: { type: 'string', maxLength: 32 },
              end: { type: 'string', maxLength: 32 },
              allDay: { type: 'boolean' },
              location: { type: 'string', maxLength: 500 },
            },
          },
        },
      },
      async (req, reply) => {
        try {
          const event = calendars.updateLocalEvent(req.params.id, req.body);
          bus.emit('calendar:state', calendars.getState());
          return reply.send(event);
        } catch (err) {
          console.error('[calendars] update local event error:', err);
          return reply.status(404).send({ error: 'Event not found' });
        }
      },
    );

    app.delete<{ Params: DeleteParams }>('/calendars/local/events/:id', async (req, reply) => {
      try {
        calendars.deleteLocalEvent(req.params.id);
        bus.emit('calendar:state', calendars.getState());
        return reply.status(204).send();
      } catch (err) {
        console.error('[calendars] delete local event error:', err);
        return reply.status(404).send({ error: 'Event not found' });
      }
    });

    // Add a specific Google Calendar by ID
    app.post<{ Body: AddGoogleBody }>('/calendars/google', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['googleCalendarId', 'name'],
          properties: {
            googleCalendarId: { type: 'string', maxLength: 512 },
            name: { type: 'string', maxLength: 200 },
            color: { type: 'string', maxLength: 7 },
          },
        },
      },
    }, async (req, reply) => {
      const { googleCalendarId, name, color = '#4a90e2' } = req.body;
      if (!googleCalendarId.trim() || !name.trim()) {
        return reply.status(400).send({ error: 'googleCalendarId and name are required' });
      }
      if (!COLOR_HEX_RE.test(color)) {
        return reply.status(400).send({ error: 'color must be a 6-digit hex color' });
      }
      if (!calendars.hasGoogleRefreshToken()) {
        return reply.status(400).send({ error: 'Not connected to Google Calendar — complete OAuth flow first' });
      }
      try {
        const source = calendars.addGoogle(name.trim(), googleCalendarId.trim(), color);
        bus.emit('calendar:state', calendars.getState());
        return reply.status(201).send(source);
      } catch (err) {
        console.error('[calendars] add Google calendar error:', err);
        return reply.status(500).send({ error: 'Failed to add Google calendar' });
      }
    });
  };
}
