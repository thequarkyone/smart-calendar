import { useMemo } from 'react';
import type { Settings, WeatherState } from '@smart-display/shared';

function formatTemp(tempC: number, units: string): string {
  if (units === 'imperial') return `${Math.round(tempC * 9 / 5 + 32)}°`;
  return `${Math.round(tempC)}°`;
}

/** "8:45pm" / "8:45" style — lowercase, no space before am/pm, matching the reference design. */
function formatClockTimeCompact(iso: string, clockFormat: string, timezone: string): string {
  const raw = new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: clockFormat !== '24h',
    timeZone: timezone,
  });
  return raw.replace(/\s?([AP]M)$/i, (_m, ampm: string) => ampm.toLowerCase());
}

const MOON_PHASES = [
  'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
];

/** Approximate moon phase via days-since-known-new-moon — no API needed, pure date math. */
function moonPhaseName(date: Date): string {
  const SYNODIC_MONTH_DAYS = 29.53058867;
  const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14);
  const diffDays = (date.getTime() - KNOWN_NEW_MOON_UTC) / 86_400_000;
  const phase = ((diffDays % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  const idx = Math.round((phase / SYNODIC_MONTH_DAYS) * 8) % 8;
  return MOON_PHASES[idx]!;
}

// ── Thin-line icon set — every icon is stroke-only (currentColor), no fills, no hue accents,
// per spec: "All text white/off-white, no color accents on text or icons." ─────────────────────

interface IconProps { size: number }

function SunIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.5" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 12 + 7 * Math.cos(rad);
        const y1 = 12 + 7 * Math.sin(rad);
        const x2 = 12 + 9.5 * Math.cos(rad);
        const y2 = 12 + 9.5 * Math.sin(rad);
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
    </svg>
  );
}

function CloudPath() {
  return <path d="M6.5 18.5 Q4 18.5 4 16 Q4 13.5 6.5 13.5 Q7 10.5 10.5 10.5 Q14.5 10.5 15.3 13.6 Q18 13.8 18 16.3 Q18 18.5 15.5 18.5 Z" />;
}

function PartlyCloudyIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7.5" r="3" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 9 + 4.3 * Math.cos(rad);
        const y1 = 7.5 + 4.3 * Math.sin(rad);
        const x2 = 9 + 6 * Math.cos(rad);
        const y2 = 7.5 + 6 * Math.sin(rad);
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      <CloudPath />
    </svg>
  );
}

function CloudyIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <CloudPath />
    </svg>
  );
}

function FogIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {[7, 10.5, 14, 17.5].map((y) => (
        <line key={y} x1="3.5" y1={y} x2="20.5" y2={y} opacity={y === 10.5 || y === 14 ? 1 : 0.55} />
      ))}
    </svg>
  );
}

function RainIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <CloudPath />
      <line x1="8" y1="20" x2="7" y2="23" />
      <line x1="12" y1="20" x2="11" y2="23" />
      <line x1="16" y1="20" x2="15" y2="23" />
    </svg>
  );
}

function DrizzleIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <CloudPath />
      <line x1="9" y1="20" x2="8.4" y2="22" />
      <line x1="14" y1="20" x2="13.4" y2="22" />
    </svg>
  );
}

function SnowIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <CloudPath />
      {[8, 12, 16].map((x) => (
        <g key={x}>
          <line x1={x} y1="19.5" x2={x} y2="23" />
          <line x1={x - 1.4} y1="20.3" x2={x + 1.4} y2="22.2" />
          <line x1={x - 1.4} y1="22.2" x2={x + 1.4} y2="20.3" />
        </g>
      ))}
    </svg>
  );
}

function ThunderstormIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <CloudPath />
      <polyline points="12,19 9.5,22.5 12.5,22.5 10.5,26" />
    </svg>
  );
}

function WmoIcon({ code, size = 28 }: { code: number; size?: number }) {
  if (code === 0) return <SunIcon size={size} />;
  if (code <= 2) return <PartlyCloudyIcon size={size} />;
  if (code === 3) return <CloudyIcon size={size} />;
  if (code <= 48) return <FogIcon size={size} />;
  if (code <= 57) return <DrizzleIcon size={size} />;
  if (code <= 67) return <RainIcon size={size} />;
  if (code <= 77) return <SnowIcon size={size} />;
  if (code <= 82) return <RainIcon size={size} />;
  return <ThunderstormIcon size={size} />;
}

// Sunrise/sunset are differentiated two ways — full sun vs. half-dipped sun, AND a bold
// up/down arrow — not just arrow direction alone, which reads as near-identical at small sizes
// (confirmed earlier this session: a subtler arrow-only version was rejected as "too similar").
function SunriseIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <line x1="2" y1="19" x2="22" y2="19" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="19" r="5" fill="currentColor" stroke="none" />
      <line x1="12" y1="10" x2="12" y2="3" strokeWidth="2" strokeLinecap="round" />
      <polyline points="8.5,6.5 12,3 15.5,6.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SunsetIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <line x1="2" y1="19" x2="22" y2="19" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 19 A5 5 0 0 1 17 19 Z" fill="currentColor" stroke="none" />
      <line x1="12" y1="3" x2="12" y2="10" strokeWidth="2" strokeLinecap="round" />
      <polyline points="8.5,6.5 12,10 15.5,6.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoonIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.5 4.5 A8 8 0 1 0 15.5 19.5 A10 10 0 0 1 15.5 4.5 Z" />
    </svg>
  );
}

function DropletIcon({ size }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 C12 3 6 11 6 15.5 A6 6 0 0 0 18 15.5 C18 11 12 3 12 3 Z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function WeatherSkeleton() {
  return (
    <div style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: 'calc(0.9rem * var(--tile-font-scale, 1))' }}>
      Add a location in Weather
    </div>
  );
}

export function WeatherTile({ state, settings }: { state: WeatherState; settings: Settings }) {
  const { current, daily } = state;
  const units = settings.units;

  // Spec: 5 forecast columns are "Today, Tue, Wed, Thu, Fri" — today included, not skipped.
  const forecast = daily.slice(0, 5);

  const dayLabels = useMemo(
    () => forecast.map((day, i) => {
      if (i === 0) return 'Today';
      try { return new Date(day.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', timeZone: settings.timezone }); }
      catch { return new Date(day.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }); }
    }),
    [forecast, settings.timezone],
  );

  if (!current) return <WeatherSkeleton />;

  const today = daily[0];
  const cityName = settings.location?.label?.split(',')[0]?.trim();
  const moonPhase = moonPhaseName(new Date());

  // Off-white, not pure white — spec calls for "white/off-white" text/icons throughout.
  // Theme-aware, not hardcoded white — the spec's "white/off-white" reads correctly against a
  // dark background (and will against Phase 4's cycling photo background), but a fixed white
  // goes nearly invisible against the light theme's cream background. These vars already track
  // theme automatically elsewhere in the app.
  const fg = 'var(--text-primary)';
  const fgMuted = 'var(--text-secondary)';
  const fgFaint = 'var(--text-muted)';

  return (
    <div style={{ padding: '0.75rem 0', color: fg }}>
      {cityName && (
        <div style={{ fontSize: 'calc(1.1rem * var(--tile-font-scale, 1))', fontWeight: 400, color: fgMuted, marginBottom: '0.75rem' }}>
          Weather in {cityName}
        </div>
      )}

      {/* Top row: current conditions (left) + sun/moon info (right) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        {/* Left: big temp + condition icon, feels-like */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: 'calc(4.6rem * var(--tile-font-scale, 1))', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {formatTemp(current.tempC, units)}
            </span>
            <WmoIcon code={current.conditionCode} size={84} />
          </div>
          <div style={{ fontSize: 'calc(1.4rem * var(--tile-font-scale, 1))', fontWeight: 300, color: fgMuted, marginTop: '0.4rem' }}>
            Feels like {formatTemp(current.feelsLikeC, units)}
          </div>
        </div>

        {/* Right: sunrise / sunset / moon phase, stacked */}
        {today?.sunrise && today.sunset && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <SunriseIcon size={34} />
              <span style={{ fontSize: 'calc(1.2rem * var(--tile-font-scale, 1))', fontWeight: 300, color: fgMuted }}>
                {formatClockTimeCompact(today.sunrise, settings.clockFormat, settings.timezone)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <SunsetIcon size={34} />
              <span style={{ fontSize: 'calc(1.2rem * var(--tile-font-scale, 1))', fontWeight: 300, color: fgMuted }}>
                {formatClockTimeCompact(today.sunset, settings.clockFormat, settings.timezone)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MoonIcon size={34} />
              <span style={{ fontSize: 'calc(1.2rem * var(--tile-font-scale, 1))', fontWeight: 300, color: fgMuted }}>
                {moonPhase}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 5-day forecast row — equal-width flex columns with centered content, rather than
          content-width columns spread with space-between, which left the row looking anchored
          to the left edge instead of using the sidebar's full width evenly. */}
      {forecast.length > 0 && (
        <div style={{ display: 'flex', marginTop: '1.4rem' }}>
          {forecast.map((day, i) => (
            <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
              <span style={{ fontSize: 'calc(1.15rem * var(--tile-font-scale, 1))', fontWeight: 500, color: fg }}>
                {dayLabels[i]}
              </span>
              <WmoIcon code={day.conditionCode} size={56} />
              {day.precipitationProbabilityMax != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <DropletIcon size={16} />
                  <span style={{ fontSize: 'calc(1rem * var(--tile-font-scale, 1))', fontWeight: 300, color: fgFaint }}>
                    {Math.round(day.precipitationProbabilityMax)}%
                  </span>
                </div>
              )}
              <span style={{ fontSize: 'calc(1.1rem * var(--tile-font-scale, 1))', fontWeight: 500, color: fg, whiteSpace: 'nowrap' }}>
                {formatTemp(day.maxTempC, units)} <span style={{ fontWeight: 300, color: fgMuted }}>{formatTemp(day.minTempC, units)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
