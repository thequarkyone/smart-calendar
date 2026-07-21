import { useMemo } from 'react';
import type { Settings } from '@smart-display/shared';

interface Props {
  settings: Settings;
  now: Date;
}

export function ClockTile({ settings, now }: Props) {
  // Re-compute time string every second, but date string and next-event only on minute boundaries
  const minuteKey = Math.floor(now.getTime() / 60_000);

  const timeStr = new Intl.DateTimeFormat(undefined, {
    timeZone: settings.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: settings.clockFormat === '12h',
  }).format(now);

  const dateStr = useMemo(() => new Intl.DateTimeFormat(undefined, {
    timeZone: settings.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now), [minuteKey, settings.timezone]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      {settings.householdName && (
        <p
          style={{
            margin: '0 0 0.5rem',
            fontSize: 'calc(1.25rem * var(--tile-font-scale, 1))',
            fontWeight: 500,
            letterSpacing: '0.05em',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
          }}
        >
          {settings.householdName}
        </p>
      )}
      <p
        style={{
          margin: 0,
          fontSize: 'clamp(3rem, 8vw, 8rem)',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: 'var(--text-primary)',
        }}
        className="clock-time"
      >
        {timeStr}
      </p>
      <p
        style={{
          margin: '0.75rem 0 0',
          fontSize: 'clamp(1.1rem, 6cqw, 2rem)',
          fontWeight: 400,
          color: 'var(--text-secondary)',
          letterSpacing: '0.02em',
        }}
      >
        {dateStr}
      </p>
    </div>
  );
}
