import { useState } from 'react';
import type { Tile, TileType, WidgetStyle } from '@smart-display/shared';
import { Toggle } from '../components/Toggle.js';
import { useTiles } from '../hooks/useTiles.js';
import { useSettings } from '../hooks/useSettings.js';
import { useNavigate } from '../NavigationContext.js';

const TILE_LABELS: Record<TileType, string> = {
  clock: 'Clock',
  calendar: 'Calendar',
  weather: 'Weather',
  photos: 'Photos',
  tasks: 'Tasks',
  rss: 'News',
  home_assistant: 'Home Assistant',
  today_agenda: 'Today Agenda',
  countdown: 'Countdown',
  motd: 'Message of the Day',
  spotify: 'Spotify Now Playing',
  custom_text: 'Custom Text',
};

const TILE_DESCRIPTIONS: Record<TileType, string> = {
  clock: 'Large clock and date display',
  calendar: 'Color-coded monthly calendar grid',
  weather: 'Current conditions and forecast',
  photos: 'Photo slideshow strip',
  tasks: 'Local to-do list',
  rss: 'Latest news headlines',
  home_assistant: 'Home Assistant entity states',
  today_agenda: "Today's events from your calendars",
  countdown: 'Days until upcoming events',
  motd: 'Display a message via quick-capture page',
  spotify: 'Currently playing track from Spotify',
  custom_text: 'A heading and/or body text you write yourself',
};

interface CountdownEntry { label: string; date: string }

function CountdownConfig({ tile, onSave }: { tile: Tile; onSave: (config: Record<string, unknown>) => Promise<void> }) {
  const initial = (tile.config.countdowns as CountdownEntry[] | undefined) ?? [];
  const [entries, setEntries] = useState<CountdownEntry[]>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const add = () => setEntries((e) => [...e, { label: '', date: '' }]);
  const remove = (i: number) => setEntries((e) => e.filter((_, j) => j !== i));
  const update = (i: number, field: keyof CountdownEntry, value: string) =>
    setEntries((e) => e.map((x, j) => j === i ? { ...x, [field]: value } : x));

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await onSave({ countdowns: entries.filter((e) => e.label && e.date) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) { setError(String(e)); } finally { setSaving(false); }
  };

  return (
    <div className="px-4 pb-4 pt-2 bg-slate-950 border-t border-slate-800 space-y-3">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <input
              type="text"
              placeholder="Label"
              value={entry.label}
              onChange={(e) => update(i, 'label', e.target.value)}
              maxLength={60}
              className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="date"
              value={entry.date}
              onChange={(e) => update(i, 'date', e.target.value)}
              className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Remove entry"
            className="text-slate-500 hover:text-red-400 px-2 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg leading-none"
          >×</button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs text-blue-400 hover:underline min-h-[44px] flex items-center"
      >+ Add countdown</button>
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-2.5 min-h-[44px] text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >{saving ? 'Saving…' : 'Save'}</button>
        <span role="status" aria-live="polite" className="text-xs">
          {saved && <span className="text-green-400">Saved ✓</span>}
          {error && <span className="text-red-400">{error}</span>}
        </span>
      </div>
    </div>
  );
}

function MotdConfig({ tile, onSave }: { tile: Tile; onSave: (config: Record<string, unknown>) => Promise<void> }) {
  const [message, setMessage] = useState((tile.config.message as string | undefined) ?? '');
  const [expiresAt, setExpiresAt] = useState((tile.config.expiresAt as string | null | undefined) ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await onSave({ message, expiresAt: expiresAt || null });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) { setError(String(e)); } finally { setSaving(false); }
  };

  return (
    <div className="px-4 pb-4 pt-2 bg-slate-950 border-t border-slate-800 space-y-3">
      <div className="space-y-1">
        <label className="text-xs text-slate-400">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Type a message to show on the display…"
          className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none font-sans"
        />
        <p className="text-xs text-slate-600">{message.length}/500</p>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-slate-400">Expires (optional)</label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
        />
      </div>
      <p className="text-xs text-slate-600">
        Or use the quick-capture page at <span className="font-mono text-slate-500">/motd</span> from any device on the network.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >{saving ? 'Saving…' : 'Save'}</button>
        <span role="status" aria-live="polite" className="text-xs">
          {saved && <span className="text-green-400">Saved ✓</span>}
          {error && <span className="text-red-400">{error}</span>}
        </span>
      </div>
    </div>
  );
}

function CustomTextConfig({ tile, onSave }: { tile: Tile; onSave: (config: Record<string, unknown>) => Promise<void> }) {
  const [heading, setHeading] = useState((tile.config.heading as string | undefined) ?? '');
  const [body, setBody] = useState((tile.config.body as string | undefined) ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await onSave({ heading, body });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) { setError(String(e)); } finally { setSaving(false); }
  };

  return (
    <div className="px-4 pb-4 pt-2 bg-slate-950 border-t border-slate-800 space-y-3">
      <div className="space-y-1">
        <label className="text-xs text-slate-400">Heading (optional)</label>
        <input
          type="text"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          maxLength={100}
          placeholder="e.g. Family Calendar"
          className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-slate-400">Body text (optional)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Any text you want to show on the display…"
          className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none font-sans"
        />
        <p className="text-xs text-slate-600">{body.length}/500</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-2.5 min-h-[44px] text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >{saving ? 'Saving…' : 'Save'}</button>
        <span role="status" aria-live="polite" className="text-xs">
          {saved && <span className="text-green-400">Saved ✓</span>}
          {error && <span className="text-red-400">{error}</span>}
        </span>
      </div>
    </div>
  );
}

function StyleDrawer({ id, tile, onSave, saving }: { id: string; tile: Tile; onSave: (style: WidgetStyle) => Promise<void>; saving: boolean }) {
  const s = tile.style;
  const [bgColor, setBgColor] = useState(s.bgColor ?? '#161b22');
  const [bgEnabled, setBgEnabled] = useState(s.bgColor !== undefined);
  const [bgOpacity, setBgOpacity] = useState(s.bgOpacity ?? 1);
  const [borderRadius, setBorderRadius] = useState(s.borderRadius ?? 8);
  const [borderEnabled, setBorderEnabled] = useState(s.borderColor !== undefined);
  const [borderColor, setBorderColor] = useState(s.borderColor ?? '#21262d');
  const [fontScale, setFontScale] = useState(s.fontScale ?? 1);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveError(null);
    const style: WidgetStyle = {};
    if (bgEnabled) { style.bgColor = bgColor; style.bgOpacity = bgOpacity; }
    if (borderEnabled) style.borderColor = borderColor;
    style.borderRadius = borderRadius;
    if (fontScale !== 1) style.fontScale = fontScale;
    try {
      await onSave(style);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setSaveError(String(e));
    }
  };

  return (
    <div id={id} className="px-4 pb-4 pt-2 bg-slate-950 border-t border-slate-800 space-y-4">
      {/* Background */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">Custom background</span>
          <Toggle enabled={bgEnabled} onChange={setBgEnabled} label="Custom background" />
        </div>
        {bgEnabled && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pl-1">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="h-11 w-14 cursor-pointer rounded border border-slate-700 bg-slate-800 p-0.5"
            />
            <span className="text-xs text-slate-500">Opacity</span>
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={bgOpacity}
              onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
              aria-label="Background opacity"
              aria-valuetext={`${Math.round(bgOpacity * 100)}%`}
              className="w-full accent-blue-500"
            />
            <span className="text-xs text-slate-400 font-mono w-8">{Math.round(bgOpacity * 100)}%</span>
          </div>
        )}
      </div>

      {/* Border */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">Custom border</span>
          <Toggle enabled={borderEnabled} onChange={setBorderEnabled} label="Custom border" />
        </div>
        {borderEnabled && (
          <div className="pl-1">
            <input
              type="color"
              value={borderColor}
              onChange={(e) => setBorderColor(e.target.value)}
              className="h-11 w-14 cursor-pointer rounded border border-slate-700 bg-slate-800 p-0.5"
            />
          </div>
        )}
      </div>

      {/* Border radius — always visible */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-24 shrink-0">Corner radius</span>
        <input
          type="range"
          min="0" max="24" step="1"
          value={borderRadius}
          onChange={(e) => setBorderRadius(parseInt(e.target.value, 10))}
          aria-label="Corner radius"
          aria-valuetext={`${borderRadius}px`}
          className="w-full accent-blue-500"
        />
        <span className="text-xs text-slate-400 font-mono w-8">{borderRadius}px</span>
      </div>

      {/* Font scale */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-24 shrink-0">Font scale</span>
        <input
          type="range"
          min="0.75" max="1.5" step="0.05"
          value={fontScale}
          onChange={(e) => setFontScale(parseFloat(e.target.value))}
          aria-label="Font scale"
          aria-valuetext={`${fontScale.toFixed(2)}×`}
          className="w-full accent-blue-500"
        />
        <span className="text-xs text-slate-400 font-mono w-8">{fontScale.toFixed(2)}×</span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span role="status" aria-live="polite" className="text-xs">
          {saved && <span className="text-green-400">Saved &#x2713;</span>}
          {saveError && <span className="text-red-400">{saveError}</span>}
        </span>
      </div>
    </div>
  );
}

const LAYOUT_AWARE_TILES: TileType[] = ['clock', 'weather', 'calendar', 'tasks', 'home_assistant', 'today_agenda', 'countdown', 'motd', 'custom_text'];
const MINIMAL_TILES: TileType[] = ['clock', 'calendar'];
const PHOTO_FOCUS_TILES: TileType[] = ['clock', 'weather', 'photos'];

type NotInLayoutReason = 'sidebar' | 'template' | null;

function TileRow({ tile, onToggle, onSaveStyle, onSaveConfig, notInLayout, notInLayoutReason, templateName }: { tile: Tile; onToggle: (enabled: boolean) => Promise<void>; onSaveStyle: (style: WidgetStyle) => Promise<void>; onSaveConfig?: (config: Record<string, unknown>) => Promise<void>; notInLayout?: boolean; notInLayoutReason?: NotInLayoutReason; templateName?: string }) {
  const [open, setOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [toggleSaved, setToggleSaved] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const handleSave = async (style: WidgetStyle) => {
    setSaving(true);
    try {
      await onSaveStyle(style);
      setStyleVersion((v) => v + 1);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (v: boolean) => {
    setToggleError(null);
    try {
      await onToggle(v);
      setToggleSaved(true);
      setTimeout(() => setToggleSaved(false), 2000);
    } catch {
      setToggleError('Failed to save');
    }
  };

  const hasStyle = Object.keys(tile.style).length > 0;

  return (
    <li className="bg-slate-900">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0 mr-4">
          <p className="text-sm font-medium text-slate-100">{TILE_LABELS[tile.type]}</p>
          <p className="text-xs text-slate-500 mt-0.5">{TILE_DESCRIPTIONS[tile.type]}</p>
          {toggleError && <p className="text-xs text-red-400 mt-0.5">{toggleError}</p>}
          {tile.enabled && notInLayout && notInLayoutReason === 'template' && (
            <p className="text-xs text-amber-500 mt-0.5">Not shown in {templateName} template</p>
          )}
          {tile.enabled && notInLayout && notInLayoutReason === 'sidebar' && (
            <p className="text-xs text-amber-500 mt-0.5">Enabled but not in sidebar layout — add it in Layout →</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span role="status" aria-live="polite" className="text-xs text-green-400">{toggleSaved ? 'Saved ✓' : ''}</span>
          {onSaveConfig && (
            <button
              onClick={() => setConfigOpen((v) => !v)}
              aria-expanded={configOpen}
              aria-label={`Configure ${TILE_LABELS[tile.type]}`}
              className="flex items-center gap-1 text-xs px-2 py-2 min-h-[44px] rounded border border-slate-700 text-slate-400 hover:border-slate-600 transition-colors"
            >
              Config
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: configOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
              >
                <path d="M2 4l4 4 4-4" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={`style-drawer-${tile.id}`}
            aria-label={`Customize ${TILE_LABELS[tile.type]} style`}
            className={`flex items-center gap-1.5 text-xs px-2 py-2 min-h-[44px] rounded border transition-colors ${hasStyle ? 'border-blue-700 text-blue-400 bg-blue-950' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="8"/><circle cx="7" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="13" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="13" r="1.2" fill="currentColor" stroke="none"/>
            </svg>
            Style
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
            >
              <path d="M2 4l4 4 4-4" />
            </svg>
          </button>
          <Toggle
            enabled={tile.enabled}
            onChange={(v) => void handleToggle(v)}
            label={`Toggle ${TILE_LABELS[tile.type]}`}
          />
        </div>
      </div>
      {configOpen && onSaveConfig && tile.type === 'countdown' && (
        <CountdownConfig tile={tile} onSave={onSaveConfig} />
      )}
      {configOpen && onSaveConfig && tile.type === 'motd' && (
        <MotdConfig tile={tile} onSave={onSaveConfig} />
      )}
      {configOpen && onSaveConfig && tile.type === 'custom_text' && (
        <CustomTextConfig tile={tile} onSave={onSaveConfig} />
      )}
      {open && <StyleDrawer key={styleVersion} id={`style-drawer-${tile.id}`} tile={tile} onSave={handleSave} saving={saving} />}
    </li>
  );
}

export function TilesSection() {
  const { tiles, loading, error, toggle, saveStyle, saveConfig } = useTiles();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const sidebarWidgets: string[] = settings?.layoutConfig?.sidebarWidgets ?? [];
  const templateId = settings?.activeTemplateId ?? 'classic';
  const templateName = templateId === 'minimal' ? 'Minimal' : templateId === 'photo-focus' ? 'Photo Focus' : 'Classic';

  function getNotInLayout(type: TileType): { notInLayout: boolean; reason: NotInLayoutReason } {
    if (templateId === 'minimal') {
      return { notInLayout: !MINIMAL_TILES.includes(type), reason: 'template' };
    }
    if (templateId === 'photo-focus') {
      return { notInLayout: !PHOTO_FOCUS_TILES.includes(type), reason: 'template' };
    }
    if (LAYOUT_AWARE_TILES.includes(type)) {
      return { notInLayout: !sidebarWidgets.includes(type), reason: 'sidebar' };
    }
    return { notInLayout: false, reason: null };
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">Loading tiles…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-lg font-semibold text-slate-100 mb-1">Widgets</h2>
      <p className="text-sm text-slate-400 mb-6">
        Enable or disable widgets and customize each one's appearance.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 overflow-hidden">
        {tiles.map((tile) => {
          const { notInLayout, reason } = getNotInLayout(tile.type);
          return (
            <TileRow
              key={tile.id}
              tile={tile}
              onToggle={(v) => toggle(tile.id, v)}
              onSaveStyle={(style) => saveStyle(tile.id, style)}
              onSaveConfig={(tile.type === 'countdown' || tile.type === 'motd' || tile.type === 'custom_text') ? (config) => saveConfig(tile.id, config) : undefined}
              notInLayout={notInLayout}
              notInLayoutReason={reason}
              templateName={templateName}
            />
          );
        })}
      </ul>
      {templateId === 'classic' && tiles.some((t) => t.enabled && LAYOUT_AWARE_TILES.includes(t.type) && !sidebarWidgets.includes(t.type)) && (
        <p className="mt-3 text-xs text-slate-500">
          <button
            type="button"
            className="text-blue-400 hover:underline"
            onClick={() => navigate('templates')}
          >
            Go to Layout →
          </button>{' '}
          to add widgets to your sidebar.
        </p>
      )}
    </div>
  );
}
