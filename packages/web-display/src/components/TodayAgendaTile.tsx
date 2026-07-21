import { useMemo } from 'react';
import type { CalendarState } from '@smart-display/shared';

interface Props {
  state: CalendarState;
  timezone: string;
  now?: Date;
}

export function TodayAgendaTile({ state, timezone, now }: Props) {
  const nowDate = now ?? new Date();
  const todayDateKey = nowDate.toDateString();
  const todayStr = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(nowDate),
    [todayDateKey, timezone], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const todayEvents = useMemo(() => state.events
    .filter((e) => {
      if (e.allDay) return e.start.slice(0, 10) === todayStr;
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(e.start));
      return localDate === todayStr;
    })
    .sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.start.localeCompare(b.start);
    }),
    [state.events, todayStr, timezone],
  );

  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }),
    [timezone],
  );

  return (
    <div>
      <p
        style={{
          fontSize: 'calc(1rem * var(--tile-font-scale, 1))',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          margin: '0 0 0.5rem',
          fontWeight: 600,
        }}
      >
        Today
      </p>
      {todayEvents.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'calc(1rem * var(--tile-font-scale, 1))', margin: 0 }}>
          No events today
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {todayEvents.map((evt, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.5rem',
                borderLeft: `3px solid ${evt.color ?? 'var(--accent, #4a90e2)'}`,
                paddingLeft: '0.5rem',
              }}
            >
              <span
                style={{
                  fontSize: 'calc(1rem * var(--tile-font-scale, 1))',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  minWidth: '3.5rem',
                }}
              >
                {evt.allDay ? 'All day' : timeFormatter.format(new Date(evt.start))}
              </span>
              <span
                style={{
                  fontSize: 'calc(1rem * var(--tile-font-scale, 1))',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {evt.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
