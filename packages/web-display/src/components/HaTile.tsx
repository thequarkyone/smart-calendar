import { useState, useCallback, useRef } from 'react';
import type { HaState } from '@smart-display/shared';

// Minimal inline SVG icons for common HA domains
function DomainIcon({ domain }: { domain: string }) {
  const s = { width: 14, height: 14, fill: 'currentColor', flexShrink: 0 } as const;
  switch (domain) {
    case 'light':
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M12 2a7 7 0 0 1 7 7c0 2.79-1.63 5.2-4 6.32V17a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1.68C6.63 14.2 5 11.79 5 9a7 7 0 0 1 7-7m-2 17h4v1a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1Z"/>
        </svg>
      );
    case 'switch':
    case 'input_boolean':
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <rect x="2" y="8" width="20" height="8" rx="4"/>
          <circle cx="16" cy="12" r="3" fill="var(--surface)"/>
        </svg>
      );
    case 'sensor':
    case 'binary_sensor':
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
      );
    case 'climate':
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M11 13.17V4h2v9.17l2.59-2.58L17 12l-5 5-5-5 1.41-1.41L11 13.17zM5 20h14v2H5z"/>
        </svg>
      );
    case 'cover':
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M3 11h2v9H3zm16 0h2v9h-2zM3 3l9-2 9 2v6H3V3zm2 2v2h14V5l-7-1.56L5 5z"/>
        </svg>
      );
    case 'lock':
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
        </svg>
      );
    case 'media_player':
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM8 15c0-1.66 1.34-3 3-3 .35 0 .69.07 1 .18V6h5v2h-3v7.03A3.003 3.003 0 0 1 11 18c-1.66 0-3-1.34-3-3z"/>
        </svg>
      );
    case 'person':
    case 'device_tracker':
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      );
    case 'weather':
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" {...s}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
      );
  }
}

function ClimateCard({ entity }: { entity: import('@smart-display/shared').HaEntity }) {
  const attrs = entity.attributes;
  const currentTemp = attrs.current_temperature as number | undefined;
  const targetTemp = attrs.temperature as number | undefined;
  const hvacAction = attrs.hvac_action as string | undefined;
  const hvacMode = (attrs.hvac_mode ?? entity.state) as string;

  const actionColor: Record<string, string> = {
    heating: 'var(--color-heating)',
    cooling: 'var(--color-cooling)',
    idle: 'var(--text-faint)',
    off: 'var(--text-faint)',
    fan: 'var(--color-success)',
  };
  const color = actionColor[hvacAction ?? ''] ?? 'var(--text-primary)';

  const modeLabel: Record<string, string> = {
    heat: 'Heat', cool: 'Cool', heat_cool: 'Auto',
    auto: 'Auto', fan_only: 'Fan', dry: 'Dry', off: 'Off',
  };

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${color}44`,
      borderRadius: '8px',
      padding: '0.4rem 0.55rem',
      minWidth: '100px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.2rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color }}>
        <DomainIcon domain="climate" />
        <span style={{ fontSize: 'calc(1rem * var(--tile-font-scale, 1))', fontWeight: 700 }}>
          {currentTemp != null ? `${currentTemp}°` : entity.state}
        </span>
        {targetTemp != null && (
          <span style={{ fontSize: 'calc(0.85rem * var(--tile-font-scale, 1))', color: 'var(--text-muted)' }}>→ {targetTemp}°</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
        {hvacAction && hvacAction !== 'off' && (
          <span style={{ fontSize: 'calc(1rem * var(--tile-font-scale, 1))', color, fontWeight: 600, textTransform: 'capitalize' }}>
            {hvacAction}
          </span>
        )}
        <span style={{ fontSize: 'calc(1rem * var(--tile-font-scale, 1))', color: 'var(--text-faint)' }}>
          {modeLabel[hvacMode] ?? hvacMode}
        </span>
      </div>
      <div style={{ fontSize: 'calc(1rem * var(--tile-font-scale, 1))', color: 'var(--text-faint)', lineHeight: 1.2 }}>
        {entity.name}
      </div>
    </div>
  );
}

function stateColor(domain: string, state: string): string {
  if (state === 'unavailable' || state === 'unknown') return 'var(--text-faint)';
  switch (domain) {
    case 'light':
    case 'switch':
    case 'input_boolean':
      return state === 'on' ? 'var(--accent)' : 'var(--text-faint)';
    case 'lock':
      return state === 'locked' ? 'var(--color-success)' : 'var(--color-danger)';
    case 'binary_sensor':
      return state === 'on' ? 'var(--accent)' : 'var(--text-faint)';
    case 'person':
    case 'device_tracker':
      return state === 'home' ? 'var(--color-success)' : 'var(--text-faint)';
    case 'cover':
      return state === 'open' ? 'var(--accent)' : 'var(--text-faint)';
    default:
      return 'var(--text-primary)';
  }
}

function formatState(domain: string, state: string, unit: string | null): string {
  if (state === 'unavailable') return '—';
  if (unit) return `${state} ${unit}`;
  // Human-readable booleans for common domains
  if (domain === 'lock') return state === 'locked' ? 'Locked' : 'Unlocked';
  if (domain === 'cover') {
    if (state === 'open') return 'Open';
    if (state === 'closed') return 'Closed';
    return state;
  }
  if (domain === 'person' || domain === 'device_tracker') {
    return state === 'home' ? 'Home' : 'Away';
  }
  if ((domain === 'light' || domain === 'switch' || domain === 'input_boolean')) {
    return state === 'on' ? 'On' : 'Off';
  }
  return state;
}

const TOGGLEABLE_DOMAINS = new Set(['light', 'switch', 'input_boolean', 'cover']);

function EntityCard({
  entity,
  touchscreenEnabled,
  toggling,
  onToggle,
}: {
  entity: import('@smart-display/shared').HaEntity;
  touchscreenEnabled: boolean;
  toggling: boolean;
  onToggle?: (entityId: string) => void;
}) {
  if (entity.domain === 'climate') return <ClimateCard entity={entity} />;

  const color = stateColor(entity.domain, entity.state);
  const displayState = formatState(entity.domain, entity.state, entity.unit);
  const isOff = entity.state === 'off' || entity.state === 'closed' || entity.state === 'locked' || entity.state === 'unavailable';
  const canToggle = touchscreenEnabled && TOGGLEABLE_DOMAINS.has(entity.domain);

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: `1px solid ${canToggle ? (isOff ? 'var(--border)' : color + '66') : (isOff ? 'var(--surface-2)' : color + '44')}`,
    borderRadius: '8px',
    padding: '0.75rem 0.55rem',
    minWidth: '88px',
    minHeight: '56px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    cursor: canToggle ? 'pointer' : undefined,
    outline: 'none',
    transition: 'opacity 0.15s, box-shadow 0.15s',
    opacity: toggling ? 0.5 : 1,
    WebkitTapHighlightColor: 'rgba(255,255,255,0.1)',
  };

  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color }}>
        <DomainIcon domain={entity.domain} />
        <span style={{ fontSize: 'calc(1rem * var(--tile-font-scale, 1))', fontWeight: 700, letterSpacing: '0.01em' }}>
          {displayState}
        </span>
      </div>
      <div style={{ fontSize: 'calc(1rem * var(--tile-font-scale, 1))', color: 'var(--text-muted)', lineHeight: 1.2 }}>
        {entity.name}
      </div>
    </>
  );

  if (canToggle) {
    return (
      <button
        type="button"
        onClick={() => onToggle?.(entity.entityId)}
        style={cardStyle}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 2px ${color}66`; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
      >
        {inner}
      </button>
    );
  }

  return <div style={cardStyle}>{inner}</div>;
}

export function HaTile({ state, touchscreenEnabled }: { state: HaState; touchscreenEnabled: boolean }) {
  const { entities, settings } = state;
  const [toggling, setToggling] = useState<string | null>(null);
  const togglingRef = useRef<string | null>(null);

  const handleToggle = useCallback(async (entityId: string) => {
    if (togglingRef.current) return;
    togglingRef.current = entityId;
    setToggling(entityId);
    try {
      // Auth is handled by the httpOnly sdToken cookie — no token in JS memory needed.
      await fetch(`/api/ha/entities/${encodeURIComponent(entityId)}/toggle`, {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // HA WS will push back the real state; nothing to do on error
    } finally {
      togglingRef.current = null;
      setToggling(null);
    }
  }, []);

  if (!settings.enabled) return null;

  if (entities.length === 0) {
    return (
      <div style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: 'calc(1rem * var(--tile-font-scale, 1))' }}>
        No HA entities configured
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', padding: '0.5rem 0' }}>
      {entities.map((entity) => (
        <EntityCard
          key={entity.entityId}
          entity={entity}
          touchscreenEnabled={touchscreenEnabled}
          toggling={toggling === entity.entityId}
          onToggle={(id) => void handleToggle(id)}
        />
      ))}
    </div>
  );
}
