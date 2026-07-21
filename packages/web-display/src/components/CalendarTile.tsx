import { useMemo } from 'react';
import type { CalendarEvent, CalendarState, EventSymbolRule } from '@smart-display/shared';

interface Props {
  state: CalendarState;
  /** Current date — passed in so this component stays a pure function of props */
  today: Date;
  timezone: string;
  weekStartsOn?: 'sun' | 'mon';
  /** 'month' (default) shows a fixed calendar month; 'rolling' shows a fixed number of weeks
   * centered on today, so a date near the end of the month doesn't hide the start of next month. */
  calendarViewMode?: 'month' | 'rolling';
  /** Total weeks shown in rolling mode, centered on today's week (default 4). Always produces
   * exactly this many grid rows, unlike a raw day-count-with-week-padding approach, which can
   * balloon unpredictably depending on where today falls in its week. */
  calendarRollingWeeks?: number;
  /** Keyword → emoji rules applied to event titles for the small icon shown in each pill chip. */
  eventSymbolRules?: EventSymbolRule[];
}

/** First matching emoji for a title, case-insensitive substring match — first rule wins. */
function matchEventSymbol(title: string, rules: EventSymbolRule[]): string | null {
  const lower = title.toLowerCase();
  for (const rule of rules) {
    if (rule.keyword && lower.includes(rule.keyword.toLowerCase())) return rule.symbol;
  }
  return null;
}

interface DayCell {
  dateStr: string;
  day: number;
  /** Short month name shown above the date number — set only on the 1st of a month when the
   * rolling grid spans a month boundary, so a continuous multi-month view stays legible without
   * cluttering the header. */
  monthLabel?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Start of the week (as a plain local calendar date) containing d. */
function startOfWeek(d: Date, weekStartsOn: 'sun' | 'mon'): Date {
  const dow = d.getDay();
  const diff = weekStartsOn === 'mon' ? (dow + 6) % 7 : dow;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}


const DAY_LABELS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isoDateStr(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Local calendar date (YYYY-MM-DD) for an event boundary. Timed events are stored as UTC ISO
 * instants (server calls .toISOString()), so we must convert them into the configured timezone
 * before comparing against a day cell — otherwise an evening event west of UTC serializes to the
 * next UTC day and renders one cell too late. All-day events carry a bare date with no meaningful
 * time-of-day, so we take it verbatim (converting through a timezone would shift it a day).
 */
function eventDateStr(iso: string, allDay: boolean, timezone: string): string {
  if (allDay) return iso.slice(0, 10);
  return isoDateStr(new Date(iso), timezone);
}

function eventsForDay(events: CalendarEvent[], dateStr: string, timezone: string): CalendarEvent[] {
  return events.filter((e) => {
    const start = eventDateStr(e.start, e.allDay, timezone);
    const end = eventDateStr(e.end, e.allDay, timezone);
    return start <= dateStr && dateStr <= end;
  });
}

/** Short event time for a day-cell row, e.g. "9:00 AM" — omitted entirely for all-day events. */
function shortEventTime(ev: CalendarEvent, timezone: string): string | null {
  if (ev.allDay) return null;
  return new Date(ev.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone });
}

const MAX_VISIBLE_EVENTS_PER_DAY = 3;

export function CalendarTile({
  state, today, timezone, weekStartsOn = 'sun',
  calendarViewMode = 'month', calendarRollingWeeks = 4,
  eventSymbolRules = [],
}: Props) {
  // Recomputed directly every render rather than memoized on today.toDateString() — that key
  // is derived from the *system's* local timezone, not the configured display timezone, so on
  // a device whose OS timezone differs from settings.timezone (e.g. Pi clock left on UTC/BST
  // while the display is configured for America/New_York) the "today" recalculation only
  // triggered on the system zone's midnight, not the display's — causing the today-highlight to
  // lag behind the real date by however many hours separate the two zones. The computation
  // itself (a single Intl.DateTimeFormat call) is cheap enough to run every render — this
  // component already re-renders every second via the ticking `now` clock upstream.
  const todayStr = isoDateStr(today, timezone);
  const parts = todayStr.split('-');
  const year = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10) - 1; // 0-based
  const dayOfMonth = parseInt(parts[2]!, 10);

  const dayLabels = weekStartsOn === 'mon' ? DAY_LABELS_MON : DAY_LABELS_SUN;

  const { cells, headerLabel } = useMemo(() => {
    if (calendarViewMode === 'rolling') {
      // A fixed number of full weeks centered on today's week — always produces exactly
      // calendarRollingWeeks rows, unlike a raw day-count-before/after-then-pad-to-week-
      // boundary approach, which balloons unpredictably depending on where today falls in its
      // own week (confirmed live: 15 days each side produced 6 ragged rows, not the ~4 expected).
      const weeks = Math.max(1, calendarRollingWeeks);
      const todayWeekStart = startOfWeek(new Date(year, month, dayOfMonth), weekStartsOn);
      const weeksBefore = Math.floor((weeks - 1) / 2);
      const gridStart = new Date(todayWeekStart.getFullYear(), todayWeekStart.getMonth(), todayWeekStart.getDate() - weeksBefore * 7);
      const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + weeks * 7 - 1);

      const result: DayCell[] = [];
      const cursor = new Date(gridStart);
      let isFirstCell = true;
      while (cursor <= gridEnd) {
        // Label the grid's very first cell (even if it doesn't start on the 1st) and every
        // subsequent 1st-of-month cell, so a rolling view spanning a boundary always shows which
        // month a stretch of days belongs to — matches the reference design.
        const showMonthLabel = isFirstCell || cursor.getDate() === 1;
        isFirstCell = false;
        result.push({
          dateStr: `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`,
          day: cursor.getDate(),
          monthLabel: showMonthLabel ? MONTH_NAMES[cursor.getMonth()]!.slice(0, 3) : undefined,
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      // Always label with today's own month, even though the grid spills into the neighboring
      // month at the edges — a two-month range label reads as confusing "which month is this"
      // noise when the vast majority of visible cells belong to the current month.
      const label = `${MONTH_NAMES[month]} ${year}`;
      return { cells: result, headerLabel: label };
    }

    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const rawDay = firstDayOfMonth.getDay(); // 0=Sun; getDay() returns 0=Sun..6=Sat
    const startOffset = weekStartsOn === 'mon' ? (rawDay + 6) % 7 : rawDay;

    const result: (DayCell | null)[] = [
      ...Array<null>(startOffset).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        return { dateStr: `${year}-${pad2(month + 1)}-${pad2(d)}`, day: d };
      }),
    ];
    while (result.length % 7 !== 0) result.push(null);
    return { cells: result, headerLabel: `${MONTH_NAMES[month]} ${year}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr, weekStartsOn, calendarViewMode, calendarRollingWeeks]);

  if (state.sources.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          color: 'var(--text-muted)',
        }}
      >
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span style={{ fontSize: 'clamp(1rem, 1.5vw, 1.25rem)', textAlign: 'center', maxWidth: '18rem', color: 'var(--text-secondary)' }}>
          Add a calendar at smartdisplay.local
        </span>
        <span style={{ fontSize: 'clamp(0.85rem, 1.2vw, 1rem)', textAlign: 'center', maxWidth: '18rem', color: 'var(--text-muted)' }}>
          Open the config app on your phone or laptop
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Month header */}
      <div
        style={{
          fontSize: 'clamp(1.75rem, 6.5cqw, 2.6rem)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginTop: '0.75rem',
          marginBottom: '0.75rem',
          letterSpacing: '0.02em',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {headerLabel}
      </div>

      {/* Day grid — cells are genuinely square (aspectRatio: '1', sized off column width), not
          stretched to fill the available height. This deliberately leaves blank space above/below
          the grid on view configurations with fewer rows — explicitly preferred by the user over
          rectangular cells that stretch to fill the screen. The wrapping flex container centers
          the (naturally-sized) grid vertically within the remaining space below the header. The
          weekday-label row lives inside this same centered block (not fixed under the header) so
          it always sits directly above the boxes, regardless of how much blank space centering
          leaves above the block. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, overflow: 'hidden' }}>
        {/* Day-of-week labels */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '2px',
            marginBottom: '4px',
            flexShrink: 0,
          }}
        >
          {dayLabels.map((d) => (
            <div
              key={d}
              style={{
                textAlign: 'center',
                fontSize: 'clamp(1rem, 1.8vw, 1.35rem)',
                color: 'var(--text-secondary)',
                fontWeight: 500,
                paddingBottom: '4px',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '8px',
          }}
        >
          {cells.map((cell, idx) => {
          if (cell === null) {
            return <div key={`empty-${idx}`} />;
          }
          const { dateStr, day, monthLabel } = cell;
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          const dayEvents = eventsForDay(state.events, dateStr, timezone);
          // All-day events are ordered first, ahead of timed events, in each day's event list.
          const allDayEvents = dayEvents.filter((e) => e.allDay);
          const timedEvents = dayEvents.filter((e) => !e.allDay);
          const orderedEvents = [...allDayEvents, ...timedEvents];

          const visibleEvents = orderedEvents.slice(0, MAX_VISIBLE_EVENTS_PER_DAY);
          const hiddenCount = orderedEvents.length - visibleEvents.length;

          return (
            <div
              key={dateStr}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                paddingTop: '3px',
                paddingBottom: '4px',
                paddingLeft: '2px',
                paddingRight: '2px',
                minHeight: 0,
                minWidth: 0,
                aspectRatio: '1',
                border: '1px solid var(--divider)',
                borderRadius: '8px',
                backgroundColor: 'var(--surface)',
                // Whole cell fades slightly for days already past — not just the box background,
                // the day number and events fade too, so the eye naturally settles on today and
                // what's ahead. Recomputed from todayStr every render, so this advances on its
                // own at midnight with no extra wiring.
                opacity: isPast ? 0.7 : 1,
              }}
            >
              {/* Month-boundary caption — only set on cells where a rolling grid crosses into a
                  new month, so a continuous multi-month view stays legible without a two-month
                  header label. */}
              {monthLabel && (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 'clamp(0.55rem, 0.9vw, 0.7rem)',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: 600,
                  }}
                >
                  {monthLabel}
                </div>
              )}

              {/* Day number with today pill — centered over the column independently of the
                  left-aligned event rows below (alignItems: stretch on the parent would
                  otherwise pull this to the left edge instead of centering it). */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem' }}>
                <div
                  style={{
                    width: 'clamp(3rem, 6vw, 4.2rem)',
                    height: 'clamp(3rem, 6vw, 4.2rem)',
                    borderRadius: '50%',
                    background: isToday ? 'var(--accent)' : 'transparent',
                    boxShadow: isToday ? '0 0 0 3px var(--accent)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 'clamp(1.8rem, 3.6vw, 2.6rem)',
                      fontWeight: isToday ? 700 : 400,
                      color: isToday ? '#ffffff' : 'var(--text-secondary)',
                      lineHeight: 1,
                      // Numerals have no descenders, so a line-height:1 box optically sits a
                      // touch high inside a flex-centered circle — nudge down half a pixel-ish
                      // to true up the visual (not just geometric) center.
                      transform: 'translateY(0.05em)',
                    }}
                  >
                    {day}
                  </span>
                </div>
              </div>

              {/* Event rows: same neutral pill + colored accent for every event, all-day or timed —
                  a distinct solid-bar treatment for all-day events was tried and rejected: the
                  user wanted one consistent look regardless of event type. */}
              {orderedEvents.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  {visibleEvents.map((ev, i) => {
                    const symbol = matchEventSymbol(ev.title, eventSymbolRules);
                    const color = ev.color || '#3b82f6';
                    const time = shortEventTime(ev, timezone);
                    return (
                      <div
                        key={i}
                        title={time ? `${time} ${ev.title}` : ev.title}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '3px',
                          minWidth: 0,
                          padding: '1px 4px',
                          borderRadius: '4px',
                          borderLeft: `3px solid ${color}`,
                          background: 'var(--surface-2)',
                        }}
                      >
                        {symbol && <span style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.7rem)', lineHeight: 1.3 }}>{symbol}</span>}
                        <span
                          style={{
                            fontSize: 'clamp(0.6rem, 0.85vw, 0.75rem)',
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            lineHeight: 1.3,
                          }}
                        >
                          {time && <span style={{ color: 'var(--text-muted)' }}>{time}{' '}</span>}
                          {ev.title}
                        </span>
                      </div>
                    );
                  })}
                  {hiddenCount > 0 && (
                    <span
                      style={{
                        fontSize: 'clamp(0.6rem, 0.85vw, 0.75rem)',
                        color: 'var(--text-muted)',
                        paddingLeft: '6px',
                      }}
                    >
                      +{hiddenCount} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );
          })}
        </div>
      </div>
    </div>
  );
}
