import { useState, useEffect, type ReactNode } from 'react';
import { getSpotifyStatus, saveSpotifyCredentials, disconnectSpotify } from '../api.js';
import type { SpotifyState } from '@smart-display/shared';

function Step({ n, text }: { n: number; text: ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
      <span className="text-sm text-slate-300">{text}</span>
    </div>
  );
}

function ConnectedState({ state, onDisconnect }: { state: SpotifyState; onDisconnect: () => void }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
        <span className="text-sm font-medium text-slate-100">Connected to Spotify</span>
      </div>

      {state.track && (
        <div className="flex gap-3 items-center bg-slate-900/60 rounded-lg p-3">
          {state.track.albumArt ? (
            <img src={state.track.albumArt} alt="Album art" className="w-12 h-12 rounded object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded bg-slate-700 flex-shrink-0 flex items-center justify-center">
              <SpotifyMark className="text-slate-400" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-100 truncate">{state.track.title}</div>
            <div className="text-xs text-slate-400 truncate">{state.track.artist}</div>
            <div className="text-xs text-slate-500 mt-0.5">{state.playing ? 'Now playing' : 'Paused'}</div>
          </div>
        </div>
      )}

      {!state.playing && !state.track && (
        <p className="text-sm text-slate-400">Nothing is currently playing.</p>
      )}

      <button
        type="button"
        onClick={onDisconnect}
        className="text-sm text-red-400 hover:text-red-300 transition-colors min-h-[44px] flex items-center"
      >
        Disconnect Spotify
      </button>
    </div>
  );
}

function SpotifyMark({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

export function SpotifySection() {
  const [status, setStatus] = useState<SpotifyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    getSpotifyStatus()
      .then((s) => { setStatus(s); setLoading(false); })
      .catch(() => setLoading(false));

    // Poll for status updates (track changes from server push); pause when tab is hidden
    let interval: ReturnType<typeof setInterval> | null = setInterval(() => {
      getSpotifyStatus().then(setStatus).catch(() => undefined);
    }, 12_000);

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (interval) { clearInterval(interval); interval = null; }
      } else {
        if (!interval) {
          interval = setInterval(() => {
            getSpotifyStatus().then(setStatus).catch(() => undefined);
          }, 12_000);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Check for OAuth result in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyParam = params.get('spotify');
    if (spotifyParam === 'connected') {
      // Refresh status after OAuth
      getSpotifyStatus().then(setStatus).catch(() => undefined);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (spotifyParam === 'error') {
      const reason = params.get('reason') ?? 'unknown';
      const messages: Record<string, string> = {
        invalid_state: 'The connection request expired. Please try again.',
        token_exchange: 'Could not connect to Spotify. Check your credentials and try again.',
        missing_params: 'Something went wrong with the Spotify redirect. Please try again.',
      };
      setError(messages[reason] ?? 'Could not connect to Spotify. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Please enter both Client ID and Client Secret.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveSpotifyCredentials(clientId.trim(), clientSecret.trim());
      setStatus((s) => s ? { ...s, credentialsSet: true } : null);
      // Redirect browser to Spotify auth
      window.location.href = result.authUrl;
    } catch (_e: unknown) {
      setError('Could not save credentials. Check your internet connection and try again.');
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectSpotify();
      setStatus((s) => s ? { ...s, connected: false, playing: false, track: null, credentialsSet: false, error: null } : null);
      setClientId('');
      setClientSecret('');
    } catch {
      setError('Could not disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <span className="text-slate-500 text-sm">Loading&hellip;</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <SpotifyMark className="text-green-400" />
          <h2 className="text-base font-semibold text-slate-100">Spotify Now Playing</h2>
        </div>
        <p className="text-sm text-slate-400">Show the currently playing track on your display. You&apos;ll need a free Spotify developer account to set this up.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {status?.connected ? (
        <ConnectedState state={status} onDisconnect={handleDisconnect} />
      ) : (
        <>
          {/* Step 1 */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Step 1 — Create a free Spotify app</h3>
            <div className="space-y-2">
              <Step n={1} text={<>Go to <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">developer.spotify.com/dashboard</a> and log in with your Spotify account.</>} />
              <Step n={2} text='Click "Create app". Give it any name (e.g. "Smart Display").' />
              <Step n={3} text='Under "Redirect URIs", click "Add" and paste: http://smartdisplay.local/api/spotify/callback — then click "Save" at the bottom of the page.' />
              <Step n={4} text='On the app page, click "Settings" at the top right. Your Client ID is shown at the top. Click "View client secret" to reveal it. Copy both.' />
            </div>
          </div>

          {/* Credentials form */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">
              {status?.credentialsSet ? 'Update credentials' : 'Step 2 — Enter your credentials'}
            </h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="spotify-client-id" className="block text-sm text-slate-300 mb-1">Client ID</label>
                <input
                  id="spotify-client-id"
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Paste your Client ID here"
                  className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="spotify-client-secret" className="block text-sm text-slate-300 mb-1">Client Secret</label>
                <input
                  id="spotify-client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Paste your Client Secret here"
                  className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSaveCredentials()}
                disabled={saving || !clientId.trim() || !clientSecret.trim()}
                className="min-h-[44px] px-4 py-2.5 rounded-md bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
              >
                {saving ? 'Connecting…' : 'Save & Connect Spotify'}
              </button>
            </div>
          </div>

          {status?.credentialsSet && !status.connected && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">Step 3 — Connect your Spotify account</h3>
              <p className="text-sm text-slate-400">Credentials are saved. Click below to sign in to Spotify and allow access to your playback.</p>
              <a
                href="/api/spotify/connect"
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-md bg-green-600 hover:bg-green-500 text-sm font-medium text-white transition-colors"
              >
                <SpotifyMark />
                Connect Spotify account
              </a>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="block text-sm text-slate-400 hover:text-red-400 transition-colors mt-1 min-h-[44px]"
              >
                Remove credentials
              </button>
            </div>
          )}
        </>
      )}

      {/* Widget reminder */}
      <p className="text-xs text-slate-500">
        To show the tile on your display, go to <span className="text-slate-300">Widgets</span> and enable the Spotify widget.
      </p>
    </div>
  );
}
