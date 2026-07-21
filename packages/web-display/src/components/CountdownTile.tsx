import { useMemo } from 'react';
import type { Tile } from '@smart-display/shared';

interface CountdownEntry {
  label: string;
  date: string; // ISO date string YYYY-MM-DD
}

interface Props {
  tile: Tile;
  timezone: string;
}

export function CountdownTile({ tile, timezone }: Props) {
  const countdowns = (tile.config.countdowns as CountdownEntry[] | undefined) ?? [];
  const dayKey = Math.floor(Date.now() / 86_400_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayStr = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()), [dayKey, timezone]);

  const entries = countdowns
    .map((c) => {
      const diff = diffDays(todayStr, c.date);
      return { ...c, diff };
    })
    .filter((c) => c.diff >= 0)
    .sort((a, b) => a.diff - b.diff);

  if (entries.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {entries.map((c, i) => (
        <div key={i}>
          <div
            style={{
              fontSize: 'calc(1.8rem * var(--tile-font-scale, 1))',
              fontWeight: 700,
              color: 'var(--accent, #4a90e2)',
              lineHeight: 1,
            }}
          >
            {c.diff === 0 ? 'Today!' : `${c.diff}d`}
          </div>
          <div
            style={{
              fontSize: 'calc(1rem * var(--tile-font-scale, 1))',
              color: 'var(--text-muted)',
              marginTop: '0.15rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Returns days from dateA (YYYY-MM-DD) to dateB (YYYY-MM-DD). Negative if dateB is in the past. */
function diffDays(today: string, target: string): number {
  const ms = new Date(target).getTime() - new Date(today).getTime();
  return Math.round(ms / 86_400_000);
}
