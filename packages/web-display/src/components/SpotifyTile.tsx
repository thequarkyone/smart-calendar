import React from 'react';
import type { SpotifyState } from '@smart-display/shared';

function SpotifyLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

const ProgressBar = React.memo(function ProgressBar({ progressMs, durationMs }: { progressMs: number; durationMs: number }) {
  const scale = durationMs > 0 ? Math.min(1, progressMs / durationMs) : 0;
  return (
    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: '0.35rem' }}>
      <div style={{ height: '100%', width: '100%', background: 'var(--accent)', borderRadius: 2, transform: `scaleX(${scale})`, transformOrigin: 'left', transition: 'transform 1s linear' }} />
    </div>
  );
});

export const SpotifyTile = React.memo(function SpotifyTile({ state }: { state: SpotifyState | null }) {
  if (!state || !state.credentialsSet) {
    return (
      <div style={{ padding: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'calc(1.1rem * var(--tile-font-scale, 1))' }}>
        <SpotifyLogo />
        <span>Connect Spotify in Setup</span>
      </div>
    );
  }

  if (!state.connected) {
    return (
      <div style={{ padding: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'calc(1.1rem * var(--tile-font-scale, 1))' }}>
        <SpotifyLogo />
        <span>{state.error ?? 'Not connected'}</span>
      </div>
    );
  }

  if (!state.playing || !state.track) {
    return (
      <div style={{ padding: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'calc(1.1rem * var(--tile-font-scale, 1))' }}>
        <SpotifyLogo />
        <span>Nothing playing</span>
      </div>
    );
  }

  const { track } = state;
  return (
    <div style={{ padding: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
        {track.albumArt ? (
          <img
            src={track.albumArt}
            alt="Album art"
            width={64}
            height={64}
            style={{ borderRadius: 6, flexShrink: 0, objectFit: 'cover', width: 64, height: 64 }}
          />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 6, background: 'var(--surface-2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <SpotifyLogo />
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 'calc(1.25rem * var(--tile-font-scale, 1))',
            fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.25,
          }}>
            {track.title}
          </div>
          <div style={{
            fontSize: 'calc(1rem * var(--tile-font-scale, 1))',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: '0.15rem',
          }}>
            {track.artist}
          </div>
          <ProgressBar progressMs={track.progressMs} durationMs={track.durationMs} />
        </div>
      </div>
    </div>
  );
});
