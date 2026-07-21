import { randomBytes } from 'node:crypto';
import type { SpotifyState, SpotifyTrack } from '@smart-display/shared';
import type { SecretsService } from './secrets.js';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_PLAYER_URL = 'https://api.spotify.com/v1/me/player/currently-playing';
const SPOTIFY_SCOPES = ['user-read-playback-state', 'user-read-currently-playing'];

// Pending OAuth state tokens: random hex → expiry ms
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const pendingOAuthStates = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [s, exp] of pendingOAuthStates) {
    if (exp < now) pendingOAuthStates.delete(s);
  }
}, 60 * 60 * 1000).unref();

interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number;
  item?: {
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
    album: { images: Array<{ url: string; width: number }> };
  };
}

export class SpotifyService {
  private state: SpotifyState;
  private onStateChange: (() => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private wsClientCount = 0;
  private spotifyTileEnabled = false;

  constructor(private readonly secrets: SecretsService) {
    const credentialsSet = secrets.has('spotify_client_id') && secrets.has('spotify_client_secret');
    const connected = secrets.has('spotify_access_token');
    this.state = { credentialsSet, connected, playing: false, track: null, error: null };
  }

  notifyClientConnected(spotifyTileEnabled: boolean): void {
    this.wsClientCount++;
    this.spotifyTileEnabled = spotifyTileEnabled;
    this.reconsiderPolling();
  }

  notifyClientDisconnected(): void {
    this.wsClientCount = Math.max(0, this.wsClientCount - 1);
    this.reconsiderPolling();
  }

  setSpotifyTileEnabled(enabled: boolean): void {
    this.spotifyTileEnabled = enabled;
    this.reconsiderPolling();
  }

  private reconsiderPolling(): void {
    if (this.wsClientCount > 0 && this.spotifyTileEnabled && this.state.credentialsSet) {
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }

  getState(): SpotifyState {
    return this.state;
  }

  setOnStateChange(cb: () => void): void {
    this.onStateChange = cb;
  }

  private emit(): void {
    this.onStateChange?.();
  }

  private setState(patch: Partial<SpotifyState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  setCredentials(clientId: string, clientSecret: string): void {
    this.secrets.set('spotify_client_id', 'Spotify client ID', clientId);
    this.secrets.set('spotify_client_secret', 'Spotify client secret', clientSecret);
    this.setState({ credentialsSet: true, error: null });
    this.reconsiderPolling();
  }

  getAuthUrl(redirectUri: string): string {
    const stateToken = randomBytes(16).toString('hex');
    pendingOAuthStates.set(stateToken, Date.now() + OAUTH_STATE_TTL_MS);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.secrets.get('spotify_client_id') ?? '',
      scope: SPOTIFY_SCOPES.join(' '),
      redirect_uri: redirectUri,
      state: stateToken,
    });
    return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
  }

  validateState(state: string): boolean {
    const expiry = pendingOAuthStates.get(state);
    if (!expiry) return false;
    pendingOAuthStates.delete(state);
    return Date.now() <= expiry;
  }

  async handleCallback(code: string, redirectUri: string): Promise<void> {
    const clientId = this.secrets.get('spotify_client_id');
    const clientSecret = this.secrets.get('spotify_client_secret');
    if (!clientId || !clientSecret) throw new Error('Spotify credentials not configured');

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // Cap the error body to avoid logging attacker-influenced data verbatim
      const text = (await res.text()).slice(0, 200);
      throw new Error(`Token exchange failed (${res.status}): ${text}`);
    }
    const data = await res.json() as SpotifyTokenResponse;
    if (data.error) throw new Error(data.error_description ?? data.error);

    const expiresAt = Date.now() + data.expires_in * 1000;
    this.secrets.set('spotify_access_token', 'Spotify access token', data.access_token);
    if (data.refresh_token) {
      this.secrets.set('spotify_refresh_token', 'Spotify refresh token', data.refresh_token);
    }
    this.secrets.set('spotify_expires_at', 'Spotify token expiry', String(expiresAt));
    this.setState({ connected: true, error: null });
    this.reconsiderPolling();
    void this.pollCurrentTrack();
  }

  private async refreshAccessToken(): Promise<boolean> {
    const clientId = this.secrets.get('spotify_client_id');
    const clientSecret = this.secrets.get('spotify_client_secret');
    const refreshToken = this.secrets.get('spotify_refresh_token');
    if (!clientId || !clientSecret || !refreshToken) return false;

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    try {
      const res = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return false;
      const data = await res.json() as SpotifyTokenResponse;
      if (data.error) return false;

      const expiresAt = Date.now() + data.expires_in * 1000;
      this.secrets.set('spotify_access_token', 'Spotify access token', data.access_token);
      if (data.refresh_token) {
        this.secrets.set('spotify_refresh_token', 'Spotify refresh token', data.refresh_token);
      }
      this.secrets.set('spotify_expires_at', 'Spotify token expiry', String(expiresAt));
      return true;
    } catch {
      return false;
    }
  }

  private async getValidToken(): Promise<string | null> {
    const token = this.secrets.get('spotify_access_token');
    if (!token) return null;
    const expiresAtStr = this.secrets.get('spotify_expires_at');
    const expiresAt = expiresAtStr ? Number(expiresAtStr) : 0;
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) return null;
      return this.secrets.get('spotify_access_token');
    }
    return token;
  }

  async pollCurrentTrack(): Promise<void> {
    if (!this.state.credentialsSet) return;
    const token = await this.getValidToken();
    if (!token) {
      if (this.state.connected) {
        this.setState({ connected: false, playing: false, track: null, error: 'Reconnect your Spotify account' });
      }
      return;
    }

    try {
      const res = await fetch(SPOTIFY_PLAYER_URL, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 204) {
        this.setState({ connected: true, playing: false, track: null, error: null });
        return;
      }
      if (res.status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (!refreshed) {
          this.setState({ connected: false, playing: false, track: null, error: 'Reconnect your Spotify account' });
        }
        return;
      }
      if (!res.ok) return;

      const text = await res.text();
      if (text.length > 65_536) throw new Error('Spotify response too large');
      const data = JSON.parse(text) as SpotifyCurrentlyPlaying;
      if (!data.item) {
        this.setState({ connected: true, playing: false, track: null, error: null });
        return;
      }

      const images = data.item.album.images;
      // Prefer the 64px thumbnail; fall back to smallest available
      const rawAlbumArt = images.length > 0
        ? (images.find((img) => img.width <= 64) ?? images[images.length - 1])?.url ?? null
        : null;
      // Validate album art URL origin — only accept Spotify's own CDN
      const albumArt = rawAlbumArt?.startsWith('https://i.scdn.co/') ? rawAlbumArt : null;

      const track: SpotifyTrack = {
        title: data.item.name,
        artist: data.item.artists.map((a) => a.name).join(', '),
        albumArt,
        progressMs: data.progress_ms,
        durationMs: data.item.duration_ms,
        isPlaying: data.is_playing,
      };
      this.setState({ connected: true, playing: data.is_playing, track, error: null });
    } catch (err) {
      console.error('[spotify] poll error:', (err as Error).message);
    }
  }

  startPolling(): void {
    if (this.pollTimer) return;
    void this.pollCurrentTrack();
    this.pollTimer = setInterval(() => { void this.pollCurrentTrack(); }, 10_000);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  disconnect(): void {
    this.secrets.delete('spotify_access_token');
    this.secrets.delete('spotify_refresh_token');
    this.secrets.delete('spotify_expires_at');
    this.setState({ connected: false, playing: false, track: null, error: null });
    this.reconsiderPolling();
  }

  clearCredentials(): void {
    this.disconnect();
    this.secrets.delete('spotify_client_id');
    this.secrets.delete('spotify_client_secret');
    this.setState({ credentialsSet: false });
    this.reconsiderPolling();
  }
}
