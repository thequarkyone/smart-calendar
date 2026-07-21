import React from 'react';
import type { Settings, CalendarState, WeatherState, PhotoState, TasksState, FeedsState, HaState, Tile, WidgetStyle, LayoutConfig } from '@smart-display/shared';
import { ZoneBar } from './components/ZoneBar.js';
import { useDisplayWs } from './hooks/useDisplayWs.js';
import { useTime } from './hooks/useTime.js';
import { ClockTile } from './components/ClockTile.js';
import { CalendarTile } from './components/CalendarTile.js';
import { WeatherTile } from './components/WeatherTile.js';
import { PhotoTile } from './components/PhotoTile.js';
import { TasksTile } from './components/TasksTile.js';
import { NewsTile } from './components/NewsTile.js';
import { HaTile } from './components/HaTile.js';
import { TodayAgendaTile } from './components/TodayAgendaTile.js';
import { CountdownTile } from './components/CountdownTile.js';
import { MotdTile } from './components/MotdTile.js';
import { SpotifyTile } from './components/SpotifyTile.js';
import { CustomTextTile } from './components/CustomTextTile.js';
import { QrOverlay } from './components/QrOverlay.js';

type TemplateId = 'classic' | 'minimal' | 'photo-focus';

/** Build inline CSS from a WidgetStyle override. Returns undefined when no overrides set. */
function widgetStyleToCss(style: WidgetStyle): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.bgColor !== undefined) {
    const opacity = style.bgOpacity ?? 1;
    // Parse hex and apply opacity via rgba
    const hex = style.bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    css.background = `rgba(${r},${g},${b},${opacity})`;
  }
  if (style.borderRadius !== undefined) css.borderRadius = `${style.borderRadius}px`;
  if (style.borderColor !== undefined) css.border = `1px solid ${style.borderColor}`;
  if (style.fontScale !== undefined) {
    css.fontSize = `calc(1rem * ${style.fontScale})`;
    // CSS custom property so descendant elements using var(--tile-font-scale, 1) inherit the scale
    (css as Record<string, string>)['--tile-font-scale'] = String(style.fontScale);
  }
  return css;
}

/** Wrapper that applies per-widget visual overrides from tile.style. */
function TileWrapper({ tile, children, extraStyle }: { tile: Tile; children: React.ReactNode; extraStyle?: React.CSSProperties }) {
  const overrides = React.useMemo(() => widgetStyleToCss(tile.style), [tile.style]);
  const hasOverrides = Object.keys(overrides).length > 0;
  if (!hasOverrides && !extraStyle) return <>{children}</>;
  return (
    <div style={{ ...extraStyle, ...overrides, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

function tileById(tiles: Tile[], id: string): Tile {
  return tiles.find((t) => t.id === id) ?? { id, type: 'clock', slot: '', enabled: true, config: {}, style: {} };
}

function getTile(map: Map<string, Tile>, id: string): Tile {
  return map.get(id) ?? { id, type: 'clock', slot: '', enabled: true, config: {}, style: {} };
}

function renderTemplate(
  id: string | null,
  settings: Settings,
  tiles: Tile[],
  calendar: CalendarState | null,
  weather: WeatherState | null,
  photos: PhotoState | null,
  tasks: TasksState | null,
  feeds: FeedsState | null,
  ha: HaState | null,
  spotify: import('@smart-display/shared').SpotifyState | null,
  now: Date,
) {
  const templateId: TemplateId =
    id === 'minimal' || id === 'photo-focus' ? id : 'classic';
  switch (templateId) {
    case 'minimal':
      return <MinimalLayout settings={settings} tiles={tiles} calendar={calendar} now={now} />;
    case 'photo-focus':
      return <PhotoFocusLayout settings={settings} tiles={tiles} photos={photos} weather={weather} calendar={calendar} now={now} />;
    case 'classic':
      return (
        <ClassicLayout
          settings={settings}
          tiles={tiles}
          calendar={calendar}
          weather={weather}
          photos={photos}
          tasks={tasks}
          feeds={feeds}
          ha={ha}
          spotify={spotify}
          now={now}
        />
      );
  }
}

const FONT_STACKS: Record<string, string> = {
  system: 'system-ui, sans-serif',
  rounded: '"Nunito", "Varela Round", system-ui, sans-serif',
  mono: '"JetBrains Mono", "Fira Mono", ui-monospace, monospace',
};

function buildBackground(settings: Settings): string {
  if (settings.bgType === 'gradient') {
    return `linear-gradient(135deg, ${settings.bgColor}, ${settings.bgGradientEnd})`;
  }
  if (settings.bgType === 'photo') {
    return 'transparent'; // PhotoTile renders as fixed fullscreen background layer
  }
  return settings.bgColor;
}

const DEFAULT_LAYOUT: LayoutConfig = {
  sidebarWidth: 380,
  photoStripHeight: 120,
  newsBandHeight: 88,
  showSidebar: true,
  sidebarWidgets: ['clock', 'weather', 'tasks', 'home_assistant'],
  mainWidgets: ['calendar'],
  rightBarWidgets: [],
  rightBarWidth: 320,
  topBarWidgets: [],
  topBarHeight: 80,
  bottomBarWidgets: [],
  bottomBarHeight: 80,
  calendarSize: 'large',
  calendarViewMode: 'month',
  calendarRollingWeeks: 4,
};

export function App() {
  const { settings, tiles, calendar, weather, photos, tasks, feeds, ha, spotify, background: bgPhoto, connected, sleeping, dimLevel, wifiMode, apPsk, deviceIp, devicePin } = useDisplayWs();
  const now = useTime();
  const [connectingLong, setConnectingLong] = React.useState(false);
  React.useEffect(() => {
    if (settings !== null) { setConnectingLong(false); return; }
    const t = setTimeout(() => setConnectingLong(true), 30_000);
    return () => clearTimeout(t);
  }, [settings]);

  const accentColor = settings?.accentColor ?? '#4a90e2';
  const fontFamily = FONT_STACKS[settings?.fontFamily ?? 'system'] ?? FONT_STACKS['system'];
  const templateId = settings?.activeTemplateId ?? 'classic';
  const background = React.useMemo(() => {
    if (!settings) return '#0d1117';
    // When light theme is active and the user hasn't changed the dark default bg, swap to a light default
    if (settings.theme === 'light' && settings.bgType === 'solid' && settings.bgColor === '#0d1117') {
      return '#f5f5f0';
    }
    return buildBackground(settings);
  }, [settings?.bgType, settings?.bgColor, settings?.bgGradientEnd, settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDimTap = React.useCallback(async () => {
    if (dimLevel === null) return;
    try {
      await fetch('/api/screen/wake', { method: 'POST' });
    } catch { /* ignore */ }
  }, [dimLevel]);

  // Dim overlay: rendered over the display content when in dim mode
  // dimLevel is "overlay darkness" 0–100; cap at 0.75 so even full setting isn't pitch black
  const dimOverlay = dimLevel !== null ? (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: '#000000',
          opacity: Math.min(dimLevel / 100, 0.75),
          pointerEvents: 'none',
        }}
      />
      {/* invisible tap target above dim overlay to wake the screen */}
      <div
        onClick={handleDimTap}
        style={{ position: 'fixed', inset: 0, zIndex: 10000, cursor: 'pointer' }}
        aria-label="Tap to wake"
      />
    </>
  ) : null;

  const handleSleepTap = React.useCallback(async () => {
    if (!sleeping) return;
    try {
      await fetch('/api/screen/wake', { method: 'POST' });
    } catch { /* ignore */ }
  }, [sleeping]);

  // Sleep overlay: fades in/out instead of hard-cutting
  const sleepOverlay = (
    <div
      onClick={handleSleepTap}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: '#000000',
        opacity: sleeping ? 1 : 0,
        pointerEvents: sleeping ? 'auto' : 'none',
        transition: 'opacity 500ms ease-in-out',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {sleeping && (
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '1.25rem', userSelect: 'none' }}>
          Tap to wake
        </span>
      )}
    </div>
  );

  return (
    <div
      data-theme={settings?.theme ?? 'dark'}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily,
        color: 'var(--text-primary)',
        position: 'relative',
        background,
        overflow: 'hidden',
        '--accent': accentColor,
      } as React.CSSProperties}
    >
      {/* Photo background layer for bgType='photo' */}
      {settings?.bgType === 'photo' && photos && photos.totalCount > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
          <PhotoTile state={photos} />
        </div>
      )}

      {/* Cycling nature/space background photo — independent of bgType, a faint full-screen
          backdrop behind everything else so the calendar/sidebar content stays legible on top. */}
      {settings?.bgCyclingEnabled && bgPhoto?.imageUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            backgroundImage: `url(${bgPhoto.imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: settings.theme === 'light' ? 0.35 : 0.28,
          }}
        />
      )}

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {settings ? (
          <>
            {renderTemplate(templateId, settings, tiles, calendar, weather, photos, tasks, feeds, ha, spotify, now)}
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p role="status" aria-live="polite" style={{ fontSize: '1.5rem', color: 'var(--text-secondary)', margin: 0 }}>
              {connectingLong
                ? 'Display server not responding — check device is powered on.'
                : 'Connecting to display server…'}
            </p>
          </div>
        )}

        {!connected && settings !== null && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute',
              bottom: '1.5rem',
              right: '1.5rem',
              fontSize: '1rem',
              color: 'var(--text-primary)',
              background: 'var(--overlay-bg)',
              padding: '0.35rem 0.85rem',
              borderRadius: '999px',
              userSelect: 'none',
            }}
          >
            Reconnecting&hellip;
          </div>
        )}
        {settings && <QrOverlay settings={settings} devicePin={devicePin} wifiMode={wifiMode} apPsk={apPsk} deviceIp={deviceIp} />}
      </div>
      {dimOverlay}
      {sleepOverlay}
    </div>
  );
}

const DIVIDER_STYLE = { borderTop: '1px solid var(--divider)', paddingTop: '0.5rem', marginTop: '0.5rem' } as const;
const EMPTY_STYLE = {} as const;

/** Render a single sidebar widget by tile ID. Returns null if not applicable. */
function SidebarWidget({
  widgetId,
  tileMap,
  settings,
  calendar,
  weather,
  tasks,
  ha,
  spotify,
  now,
  first,
}: {
  widgetId: string;
  tileMap: Map<string, Tile>;
  settings: Settings;
  calendar: CalendarState | null;
  weather: WeatherState | null;
  tasks: TasksState | null;
  ha: HaState | null;
  spotify: import('@smart-display/shared').SpotifyState | null;
  now: Date;
  first: boolean;
}) {
  const divider = !first ? DIVIDER_STYLE : EMPTY_STYLE;
  switch (widgetId) {
    case 'clock':
      return (
        <div style={first ? {} : divider}>
          <TileWrapper tile={getTile(tileMap, 'clock')}>
            <ClockTile settings={settings} now={now} />
          </TileWrapper>
        </div>
      );
    case 'weather':
      return weather ? (
        <div style={divider}>
          <TileWrapper tile={getTile(tileMap, 'weather')}>
            <WeatherTile state={weather} settings={settings} />
          </TileWrapper>
        </div>
      ) : null;
    case 'tasks':
      return tasks && tasks.lists.length > 0 ? (
        <div style={divider}>
          <TileWrapper tile={getTile(tileMap, 'tasks')}>
            <TasksTile state={tasks} />
          </TileWrapper>
        </div>
      ) : null;
    case 'home_assistant':
      return ha && ha.settings.enabled && ha.entities.length > 0 ? (
        <div style={divider}>
          <TileWrapper tile={getTile(tileMap, 'home_assistant')}>
            <HaTile state={ha} touchscreenEnabled={settings.touchscreenEnabled} />
          </TileWrapper>
        </div>
      ) : null;
    case 'today_agenda': {
      if (!calendar) return null;
      const agendaTile = getTile(tileMap, 'today_agenda');
      return (
        <div style={divider}>
          <TileWrapper tile={agendaTile}>
            <TodayAgendaTile state={calendar} timezone={settings.timezone} />
          </TileWrapper>
        </div>
      );
    }
    case 'countdown': {
      const cdTile = getTile(tileMap, 'countdown');
      return (
        <div style={divider}>
          <TileWrapper tile={cdTile}>
            <CountdownTile tile={cdTile} timezone={settings.timezone} />
          </TileWrapper>
        </div>
      );
    }
    case 'motd': {
      const motdTile = getTile(tileMap, 'motd');
      return (
        <div style={divider}>
          <TileWrapper tile={motdTile}>
            <MotdTile tile={motdTile} />
          </TileWrapper>
        </div>
      );
    }
    case 'spotify': {
      const spotifyTile = getTile(tileMap, 'spotify');
      return (
        <div style={divider}>
          <TileWrapper tile={spotifyTile}>
            <SpotifyTile state={spotify} />
          </TileWrapper>
        </div>
      );
    }
    case 'custom_text': {
      const ctTile = getTile(tileMap, 'custom_text');
      return (
        <div style={divider}>
          <TileWrapper tile={ctTile}>
            <CustomTextTile tile={ctTile} />
          </TileWrapper>
        </div>
      );
    }
    default:
      return null;
  }
}

/** Returns the calendar wrapper style based on calendarSize. */
function calendarSizeStyle(size: LayoutConfig['calendarSize']): React.CSSProperties {
  switch (size) {
    case 'full':   return { flex: 1, minWidth: 0 };
    case 'large':  return { flex: 1, minWidth: 0 };
    case 'medium': return { flex: '0 0 auto', width: 'min(600px, 100%)' };
    case 'small':  return { flex: '0 0 auto', width: 'min(400px, 100%)' };
    default:       return { flex: 1, minWidth: 0 };
  }
}

function ClassicLayout({
  settings,
  tiles,
  calendar,
  weather,
  photos,
  tasks,
  feeds,
  ha,
  spotify,
  now,
}: {
  settings: Settings;
  tiles: Tile[];
  calendar: CalendarState | null;
  weather: WeatherState | null;
  photos: PhotoState | null;
  tasks: TasksState | null;
  feeds: FeedsState | null;
  ha: HaState | null;
  spotify: import('@smart-display/shared').SpotifyState | null;
  now: Date;
}) {
  const lc: LayoutConfig = { ...DEFAULT_LAYOUT, ...(settings.layoutConfig ?? {}) };
  const showPhotoInStrip = settings.bgType !== 'photo';
  const leftWidgets = lc.showSidebar !== false && lc.sidebarWidgets?.length ? lc.sidebarWidgets : (lc.showSidebar !== false ? DEFAULT_LAYOUT.sidebarWidgets : []);
  const rightWidgets = lc.rightBarWidgets ?? [];
  const topWidgets = lc.topBarWidgets ?? [];
  const bottomWidgets = lc.bottomBarWidgets ?? [];
  const calSize = lc.calendarSize ?? 'large';
  const tileMap = React.useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);

  /** Renders a single widget — shared by all zone bars. */
  const renderWidget = React.useCallback((widgetId: string, first: boolean) => (
    <SidebarWidget
      widgetId={widgetId}
      tileMap={tileMap}
      settings={settings}
      calendar={calendar}
      weather={weather}
      tasks={tasks}
      ha={ha}
      spotify={spotify}
      now={now}
      first={first}
    />
  ), [tileMap, settings, calendar, weather, tasks, ha, spotify, now]);

  const calendarArea = (
    <div style={{ ...calendarSizeStyle(calSize), display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {calendar ? (
          <TileWrapper tile={tileById(tiles, 'calendar')} extraStyle={{ height: '100%' }}>
            <CalendarTile
              state={calendar}
              today={now}
              timezone={settings.timezone}
              weekStartsOn={settings.weekStartsOn}
              calendarViewMode={lc.calendarViewMode}
              calendarRollingWeeks={lc.calendarRollingWeeks}
              eventSymbolRules={settings.eventSymbolRules}
            />
          </TileWrapper>
        ) : (
          <div
            style={{
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
            <span style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', textAlign: 'center' }}>No calendars configured</span>
            <span style={{ fontSize: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>Add one at smartdisplay.local</span>
          </div>
        )}
      </div>
      {showPhotoInStrip && (() => {
        const photoTile = tileById(tiles, 'photos');
        if (!photoTile.enabled) return null;
        if (photos && photos.totalCount > 0) {
          return (
            <div style={{ height: `${lc.photoStripHeight}px`, borderTop: '1px solid var(--divider)', flexShrink: 0 }}>
              <TileWrapper tile={photoTile} extraStyle={{ height: '100%' }}>
                <PhotoTile state={photos} />
              </TileWrapper>
            </div>
          );
        }
        return (
          <div
            style={{
              height: `${lc.photoStripHeight}px`,
              borderTop: '1px solid var(--divider)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: '1rem',
            }}
          >
            Add Photos in config to show a slideshow here
          </div>
        );
      })()}
    </div>
  );

  const newsStrip = (() => {
    const newsTile = tileById(tiles, 'rss');
    if (!newsTile.enabled) return null;
    if (feeds && feeds.items.length > 0) {
      return (
        <div style={{ height: `${lc.newsBandHeight}px`, borderTop: '1px solid var(--divider)', flexShrink: 0, background: 'var(--news-bg)' }}>
          <TileWrapper tile={newsTile} extraStyle={{ height: '100%' }}>
            <NewsTile state={feeds} />
          </TileWrapper>
        </div>
      );
    }
    return (
      <div
        style={{
          height: `${lc.newsBandHeight}px`,
          borderTop: '1px solid var(--divider)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: '1rem',
          background: 'var(--news-bg)',
        }}
      >
        No feeds — add one in News Feeds
      </div>
    );
  })();

  return (
    <>
      {/* Top bar */}
      {topWidgets.length > 0 && (
        <ZoneBar
          direction="row"
          widgets={topWidgets}
          height={lc.topBarHeight}
          renderWidget={renderWidget}
          borderStyle={{ borderBottom: '1px solid var(--divider)' }}
        />
      )}

      {/* Main row: left bar | calendar | right bar */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        {leftWidgets.length > 0 && (
          <ZoneBar
            direction="column"
            widgets={leftWidgets}
            width={lc.sidebarWidth}
            renderWidget={renderWidget}
            borderStyle={{ borderRight: '1px solid var(--divider)' }}
          />
        )}
        {calendarArea}
        {rightWidgets.length > 0 && (
          <ZoneBar
            direction="column"
            widgets={rightWidgets}
            width={lc.rightBarWidth}
            renderWidget={renderWidget}
            borderStyle={{ borderLeft: '1px solid var(--divider)' }}
          />
        )}
      </div>

      {/* Bottom bar */}
      {bottomWidgets.length > 0 && (
        <ZoneBar
          direction="row"
          widgets={bottomWidgets}
          height={lc.bottomBarHeight}
          renderWidget={renderWidget}
          borderStyle={{ borderTop: '1px solid var(--divider)' }}
        />
      )}

      {/* News strip — always at very bottom */}
      {newsStrip}
    </>
  );
}

function MinimalLayout({
  settings,
  tiles,
  calendar,
  now,
}: {
  settings: Settings;
  tiles: Tile[];
  calendar: CalendarState | null;
  now: Date;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          padding: '1.5rem 1rem',
          borderBottom: '1px solid var(--divider)',
          flexShrink: 0,
        }}
      >
        <TileWrapper tile={tileById(tiles, 'clock')}>
          <ClockTile settings={settings} now={now} />
        </TileWrapper>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {calendar ? (
          <TileWrapper tile={tileById(tiles, 'calendar')} extraStyle={{ height: '100%' }}>
            <CalendarTile
              state={calendar}
              today={now}
              timezone={settings.timezone}
              weekStartsOn={settings.weekStartsOn}
              calendarViewMode={settings.layoutConfig?.calendarViewMode}
              calendarRollingWeeks={settings.layoutConfig?.calendarRollingWeeks}
              eventSymbolRules={settings.eventSymbolRules}
            />
          </TileWrapper>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: '1.25rem',
            }}
          >
            No calendars configured
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoFocusLayout({
  settings,
  tiles,
  photos,
  weather,
  calendar,
  now,
}: {
  settings: Settings;
  tiles: Tile[];
  photos: PhotoState | null;
  weather: WeatherState | null;
  calendar: CalendarState | null;
  now: Date;
}) {
  const hasPhoto = photos && photos.totalCount > 0;
  const minuteKey = Math.floor(now.getTime() / 60_000);

  const todayStr = React.useMemo(() => new Intl.DateTimeFormat(undefined, {
    timeZone: settings.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }).format(now), [minuteKey, settings.timezone]);

  const tempStr = weather?.current
    ? `${Math.round(weather.current.tempC)}°`
    : null;

  const nextEventStr = React.useMemo(() => {
    const todayDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone }).format(now);
    const nextEvent = calendar?.events
      .filter((e) => e.start.slice(0, 10) >= todayDateStr)
      .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
    if (!nextEvent || nextEvent.allDay) return null;
    const start = new Date(nextEvent.start);
    const timeStr = new Intl.DateTimeFormat(undefined, {
      timeZone: settings.timezone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(start);
    return `${nextEvent.title} · ${timeStr}`;
  }, [minuteKey, calendar?.events, settings.timezone]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {hasPhoto && settings.bgType !== 'photo' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
          <PhotoTile state={photos} />
        </div>
      )}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          background: hasPhoto ? 'rgba(0,0,0,0.35)' : undefined,
          containerType: 'inline-size',
        }}
      >
        <div style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9)' }}>
          <TileWrapper tile={tileById(tiles, 'clock')}>
            <ClockTile settings={settings} now={now} />
          </TileWrapper>
        </div>
        {!hasPhoto && (
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            No photos configured — add photos in the config app
          </p>
        )}
      </div>

      {/* Bottom info strip — only when photos are showing */}
      {hasPhoto && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            background: 'rgba(0,0,0,0.55)',
            padding: '0.5rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 'clamp(1rem, 1.5vw, 1.25rem)',
              color: '#c9d1d9',
              fontWeight: 500,
            }}
          >
            {todayStr}
          </span>
          {nextEventStr && (
            <span
              style={{
                fontSize: 'clamp(1rem, 1.5vw, 1.25rem)',
                color: '#c9d1d9',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '40%',
              }}
            >
              {nextEventStr}
            </span>
          )}
          {tempStr && (
            <span
              style={{
                fontSize: 'clamp(1rem, 1.5vw, 1.25rem)',
                color: '#c9d1d9',
                marginLeft: 'auto',
              }}
            >
              {tempStr}
            </span>
          )}
        </div>
      )}
    </>
  );
}
