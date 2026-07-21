import { useState, useEffect, useRef } from 'react';
import type { BackgroundSource, BackgroundState, BgType, LayoutConfig, Settings } from '@smart-display/shared';
import { useSettings } from '../hooks/useSettings.js';
import { Toggle } from '../components/Toggle.js';
import { SectionCard } from '../components/SectionCard.js';
import { getBackgroundState, refreshBackground, saveBackgroundKey, deleteBackgroundKey } from '../api.js';

type ThemeForm = {
  theme: Settings['theme'];
  accentColor: string;
  fontFamily: Settings['fontFamily'];
  screenSleepEnabled: boolean;
  screenSleepStart: string;
  screenSleepEnd: string;
  screenDimEnabled: boolean;
  screenDimLevel: number;
  showQrCode: boolean;
  autoTheme: boolean;
  bgType: BgType;
  bgColor: string;
  bgGradientEnd: string;
  sidebarWidth: number;
  photoStripHeight: number;
  newsBandHeight: number;
  bgCyclingEnabled: boolean;
  bgCyclingSource: BackgroundSource;
};

function toForm(s: Settings): ThemeForm {
  return {
    theme: s.theme,
    accentColor: s.accentColor,
    fontFamily: s.fontFamily,
    screenSleepEnabled: s.screenSleep !== null,
    screenSleepStart: s.screenSleep?.start ?? '22:00',
    screenSleepEnd: s.screenSleep?.end ?? '07:00',
    screenDimEnabled: s.screenDimEnabled ?? false,
    screenDimLevel: s.screenDimLevel ?? 20,
    showQrCode: s.showQrCode,
    autoTheme: s.autoTheme ?? false,
    bgType: s.bgType ?? 'solid',
    bgColor: s.bgColor ?? '#0d1117',
    bgGradientEnd: s.bgGradientEnd ?? '#1a1a2e',
    sidebarWidth: s.layoutConfig?.sidebarWidth ?? 380,
    photoStripHeight: s.layoutConfig?.photoStripHeight ?? 120,
    newsBandHeight: s.layoutConfig?.newsBandHeight ?? 56,
    bgCyclingEnabled: s.bgCyclingEnabled ?? false,
    bgCyclingSource: s.bgCyclingSource ?? 'nasa',
  };
}

const BACKGROUND_SOURCES: { value: BackgroundSource; label: string; needsKey: boolean; blurb: string; signupUrl?: string }[] = [
  { value: 'nasa', label: 'NASA Astronomy Picture of the Day', needsKey: false, blurb: 'Space imagery, works immediately — no signup needed.' },
  { value: 'unsplash', label: 'Unsplash (nature photos)', needsKey: true, blurb: 'Real nature/landscape photography. Requires your own free Unsplash API key.', signupUrl: 'https://unsplash.com/developers' },
  { value: 'pexels', label: 'Pexels (nature photos)', needsKey: true, blurb: 'Real nature/landscape photography. Requires your own free Pexels API key.', signupUrl: 'https://www.pexels.com/api/' },
];

const BG_TYPE_OPTIONS: { value: BgType; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'photo', label: 'Photo' },
];

// Sidebar width presets
const SIDEBAR_PRESETS = [
  { label: 'Narrow', px: 280 },
  { label: 'Medium', px: 380 },
  { label: 'Wide',   px: 480 },
];
// Photo strip height presets
const PHOTO_PRESETS = [
  { label: 'Slim',     px: 80 },
  { label: 'Standard', px: 120 },
  { label: 'Tall',     px: 200 },
];
// News band height presets
const NEWS_PRESETS = [
  { label: 'Slim',     px: 36 },
  { label: 'Standard', px: 48 },
  { label: 'Tall',     px: 72 },
];

// Font stacks mirroring what the display actually uses
const FONT_OPTIONS: { value: Settings['fontFamily']; label: string; stack: string; note?: string }[] = [
  { value: 'system',  label: 'System',  stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { value: 'rounded', label: 'Rounded', stack: 'ui-rounded, "Nunito", sans-serif', note: 'Coming soon' },
  { value: 'mono',    label: 'Mono',    stack: '"JetBrains Mono", "Fira Mono", "Menlo", monospace' },
];


export function ThemeSection() {
  const { settings, loading, error, save, saving } = useSettings();
  const [form, setForm] = useState<ThemeForm | null>(null);
  const [timeSaved, setTimeSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [waking, setWaking] = useState(false);
  const [wakeSent, setWakeSent] = useState(false);

  const [bgState, setBgState] = useState<BackgroundState | null>(null);
  const [unsplashKeyInput, setUnsplashKeyInput] = useState('');
  const [pexelsKeyInput, setPexelsKeyInput] = useState('');
  const [bgKeySaving, setBgKeySaving] = useState<BackgroundSource | null>(null);
  const [bgKeyError, setBgKeyError] = useState<string | null>(null);
  const [bgRefreshing, setBgRefreshing] = useState(false);
  const [bgRefreshError, setBgRefreshError] = useState<string | null>(null);
  const [keysSet, setKeysSet] = useState<{ unsplash: boolean; pexels: boolean }>({ unsplash: false, pexels: false });

  useEffect(() => {
    getBackgroundState().then(setBgState).catch(() => {});
  }, []);

  useEffect(() => {
    if (settings) setKeysSet({ unsplash: settings.unsplashApiKeySet, pexels: settings.pexelsApiKeySet });
  }, [settings]);

  async function handleSaveBgKey(source: 'unsplash' | 'pexels', key: string) {
    if (!key.trim()) return;
    setBgKeySaving(source);
    setBgKeyError(null);
    try {
      await saveBackgroundKey(source, key.trim());
      if (source === 'unsplash') setUnsplashKeyInput('');
      if (source === 'pexels') setPexelsKeyInput('');
      setKeysSet((prev) => ({ ...prev, [source]: true }));
    } catch (err) {
      setBgKeyError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setBgKeySaving(null);
    }
  }

  async function handleDeleteBgKey(source: 'unsplash' | 'pexels') {
    setBgKeySaving(source);
    setBgKeyError(null);
    try {
      await deleteBackgroundKey(source);
      setKeysSet((prev) => ({ ...prev, [source]: false }));
    } catch (err) {
      setBgKeyError(err instanceof Error ? err.message : 'Failed to remove key');
    } finally {
      setBgKeySaving(null);
    }
  }

  async function handleRefreshBg() {
    setBgRefreshing(true);
    setBgRefreshError(null);
    try {
      const state = await refreshBackground();
      setBgState(state);
    } catch (err) {
      setBgRefreshError(err instanceof Error ? err.message : 'Failed to fetch a new photo');
    } finally {
      setBgRefreshing(false);
    }
  }

  async function wakeDisplay() {
    setWaking(true);
    setWakeSent(false);
    try {
      // Auth-exempt on purpose (kiosk-local touch-to-wake reuses this same route) — safe to
      // call from the config app too, it only wakes the screen, no data exposure.
      await fetch('/api/screen/wake', { method: 'POST' });
      setWakeSent(true);
    } catch { /* ignore — worst case the schedule still wakes it on its own */ }
    finally { setWaking(false); }
  }

  useEffect(() => {
    if (settings && !form) setForm(toForm(settings));
  }, [settings, form]);

  if (!loading && !form && error) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-red-400">{error}</p>
        <button type="button" onClick={() => window.location.reload()} className="text-sm text-blue-400 hover:underline">Retry</button>
      </div>
    );
  }

  if (loading || !form || !settings) {
    return <div className="p-6"><p role="status" className="text-sm text-slate-500">Loading&hellip;</p></div>;
  }

  const set = <K extends keyof ThemeForm>(key: K, value: ThemeForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  // Auto-save helper for toggles + color pickers (fires after debounce)
  const autoSave = (patch: Partial<ThemeForm>) => {
    const next = form ? { ...form, ...patch } : form;
    if (!next) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setForm(next);
    autoSaveTimer.current = setTimeout(() => {
      setAutoSaved(false);
      const layoutConfig: LayoutConfig = {
        ...(settings?.layoutConfig ?? {}),
        sidebarWidth: next.sidebarWidth,
        photoStripHeight: next.photoStripHeight,
        newsBandHeight: next.newsBandHeight,
      } as LayoutConfig;
      void save({
        theme: next.theme,
        accentColor: next.accentColor,
        fontFamily: next.fontFamily,
        screenSleep: next.screenSleepEnabled ? { start: next.screenSleepStart, end: next.screenSleepEnd } : null,
        screenDimEnabled: next.screenDimEnabled,
        screenDimLevel: next.screenDimLevel,
        showQrCode: next.showQrCode,
        autoTheme: next.autoTheme,
        bgType: next.bgType,
        bgColor: next.bgColor,
        bgGradientEnd: next.bgGradientEnd,
        layoutConfig,
        bgCyclingEnabled: next.bgCyclingEnabled,
        bgCyclingSource: next.bgCyclingSource,
      }).then(() => {
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 2000);
      });
    }, 600);
  };

  // Save for validated time/number inputs
  const handleTimeSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTimeError(null);
    if (form.screenSleepEnabled && !form.screenSleepStart.match(/^\d{2}:\d{2}$/)) {
      setTimeError('Invalid time format'); return;
    }
    const layoutConfig: LayoutConfig = {
      ...(settings?.layoutConfig ?? {}),
      sidebarWidth: form.sidebarWidth,
      photoStripHeight: form.photoStripHeight,
      newsBandHeight: form.newsBandHeight,
    } as LayoutConfig;
    await save({
      theme: form.theme,
      accentColor: form.accentColor,
      fontFamily: form.fontFamily,
      screenSleep: form.screenSleepEnabled ? { start: form.screenSleepStart, end: form.screenSleepEnd } : null,
      screenDimEnabled: form.screenDimEnabled,
      screenDimLevel: form.screenDimLevel,
      showQrCode: form.showQrCode,
      autoTheme: form.autoTheme,
      bgType: form.bgType,
      bgColor: form.bgColor,
      bgGradientEnd: form.bgGradientEnd,
      layoutConfig,
    });
    setTimeSaved(true);
    setTimeout(() => setTimeSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-lg space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-0.5">Appearance</h2>
        <p className="text-sm text-slate-400">Colors, fonts, layout, and sleep schedule.</p>
      </div>

      {error && (
        <div className="rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* ── Appearance card ── */}
      <SectionCard title="Appearance">
        {/* Background */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Background</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {BG_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => autoSave({ bgType: opt.value })}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${form.bgType === opt.value ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {form.bgType !== 'photo' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">{form.bgType === 'gradient' ? 'Start' : 'Color'}</label>
                <input type="color" value={form.bgColor} onChange={(e) => autoSave({ bgColor: e.target.value })}
                  className="h-11 w-14 cursor-pointer rounded border border-slate-700 bg-slate-800 p-0.5" />
                <input type="text" value={form.bgColor}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) autoSave({ bgColor: e.target.value }); else setForm((p) => p ? { ...p, bgColor: e.target.value } : p); }}
                  className="w-24 px-2 py-1 rounded border border-slate-700 bg-slate-800 text-xs text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  maxLength={7} />
              </div>
              {form.bgType === 'gradient' && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400">End</label>
                  <input type="color" value={form.bgGradientEnd} onChange={(e) => autoSave({ bgGradientEnd: e.target.value })}
                    className="h-11 w-14 cursor-pointer rounded border border-slate-700 bg-slate-800 p-0.5" />
                  <input type="text" value={form.bgGradientEnd}
                    onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) autoSave({ bgGradientEnd: e.target.value }); else setForm((p) => p ? { ...p, bgGradientEnd: e.target.value } : p); }}
                    className="w-24 px-2 py-1 rounded border border-slate-700 bg-slate-800 text-xs text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    maxLength={7} />
                </div>
              )}
            </div>
          )}
          {form.bgType === 'photo' && (
            <p className="text-xs text-slate-500">The current photo slideshow fills the display background.</p>
          )}
        </div>

        {/* Accent color */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Accent Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={form.accentColor} onChange={(e) => autoSave({ accentColor: e.target.value })}
              className="h-11 w-14 cursor-pointer rounded border border-slate-700 bg-slate-800 p-0.5" />
            <input type="text" value={form.accentColor}
              onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) autoSave({ accentColor: e.target.value }); else setForm((p) => p ? { ...p, accentColor: e.target.value } : p); }}
              className="w-24 px-2 py-1 rounded border border-slate-700 bg-slate-800 text-xs text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              maxLength={7} />
          </div>
        </div>

        {/* Font family */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-3">Font</label>
          <div className="space-y-2">
            {FONT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${form.fontFamily === opt.value ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'} ${opt.note ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name="fontFamily"
                  value={opt.value}
                  checked={form.fontFamily === opt.value}
                  disabled={!!opt.note}
                  onChange={() => { if (!opt.note) autoSave({ fontFamily: opt.value }); }}
                  className="accent-blue-500 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{opt.label}</span>
                    {opt.note && <span className="text-xs text-slate-500">({opt.note})</span>}
                  </div>
                  <span
                    className="text-sm text-slate-400 block mt-0.5"
                    style={{ fontFamily: opt.stack }}
                  >
                    12:30 — Wednesday
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* QR code */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">Show QR code on display</p>
            <p className="text-xs text-slate-500 mt-0.5">Scannable QR so guests can open the config.</p>
          </div>
          <Toggle
            enabled={form.showQrCode}
            onChange={(v) => autoSave({ showQrCode: v })}
            label="Show QR code on display"
          />
        </div>

        {/* Manual theme — lives right next to auto-theme since this is where people look for it
            (a "Theme" dropdown used to live only on the separate Settings page, which meant
            turning auto-theme off left you stuck on whatever theme it last picked, with no
            obvious quick way back). Disabled while auto-theme is on since it would win anyway. */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">Theme</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {form.autoTheme ? 'Controlled by auto sunrise/sunset theme below.' : 'Dark or light display theme.'}
            </p>
          </div>
          <div className="inline-flex rounded-md border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => autoSave({ theme: 'dark' })}
              disabled={form.autoTheme}
              className={`px-3 py-2 min-h-[44px] text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                form.theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => autoSave({ theme: 'light' })}
              disabled={form.autoTheme}
              className={`px-3 py-2 min-h-[44px] text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-l border-slate-700 ${
                form.theme === 'light' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Light
            </button>
          </div>
        </div>

        {/* Auto theme */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">Auto sunrise/sunset theme</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Switches to light at sunrise, dark at sunset. Requires location to be set.
            </p>
          </div>
          <Toggle
            enabled={form.autoTheme}
            onChange={(v) => autoSave({ autoTheme: v })}
            label="Auto sunrise/sunset theme"
          />
        </div>
      </SectionCard>

      {/* ── Cycling Background card ── */}
      <SectionCard title="Cycling Background Photo">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">Daily cycling background</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Fetches a new nature or space photo once a day to display behind the sidebar.
            </p>
          </div>
          <Toggle
            enabled={form.bgCyclingEnabled}
            onChange={(v) => autoSave({ bgCyclingEnabled: v })}
            label="Daily cycling background"
          />
        </div>

        {form.bgCyclingEnabled && (
          <>
            <div className="space-y-2">
              {BACKGROUND_SOURCES.map((opt) => {
                const keySet = opt.value === 'unsplash' ? keysSet.unsplash : opt.value === 'pexels' ? keysSet.pexels : true;
                return (
                  <label
                    key={opt.value}
                    className={`block rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${form.bgCyclingSource === opt.value ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'}`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="bgCyclingSource"
                        value={opt.value}
                        checked={form.bgCyclingSource === opt.value}
                        onChange={() => autoSave({ bgCyclingSource: opt.value })}
                        className="accent-blue-500 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{opt.label}</span>
                          {opt.needsKey && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${keySet ? 'bg-green-950 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                              {keySet ? 'Key set' : 'Key needed'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.blurb}</p>
                      </div>
                    </div>

                    {opt.needsKey && form.bgCyclingSource === opt.value && (
                      <div className="mt-3 ml-7 flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                        <input
                          type="password"
                          placeholder={keySet ? 'Replace key…' : 'Paste your free API key'}
                          value={opt.value === 'unsplash' ? unsplashKeyInput : pexelsKeyInput}
                          onChange={(e) => (opt.value === 'unsplash' ? setUnsplashKeyInput(e.target.value) : setPexelsKeyInput(e.target.value))}
                          className="flex-1 min-w-0 rounded-md bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveBgKey(opt.value as 'unsplash' | 'pexels', opt.value === 'unsplash' ? unsplashKeyInput : pexelsKeyInput)}
                          disabled={bgKeySaving === opt.value}
                          className="min-h-[44px] px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors shrink-0"
                        >
                          Save
                        </button>
                        {keySet && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteBgKey(opt.value as 'unsplash' | 'pexels')}
                            disabled={bgKeySaving === opt.value}
                            className="min-h-[44px] px-3 py-2 rounded-md border border-slate-700 hover:border-red-700 hover:text-red-400 disabled:opacity-50 text-xs text-slate-400 transition-colors shrink-0"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                    {opt.needsKey && form.bgCyclingSource === opt.value && opt.signupUrl && (
                      <p className="mt-1.5 ml-7 text-xs text-slate-500">
                        Get a free key at{' '}
                        <a href={opt.signupUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{opt.signupUrl.replace('https://', '')}</a>.
                      </p>
                    )}
                  </label>
                );
              })}
            </div>
            {bgKeyError && <p className="text-xs text-red-400">{bgKeyError}</p>}

            <div className="rounded-md border border-slate-700 bg-slate-800/40 p-3 space-y-2">
              {bgState?.imageUrl ? (
                <div className="flex items-center gap-3">
                  <img src={`${bgState.imageUrl}?t=${bgState.updatedAt ?? ''}`} alt="Current cycling background" className="h-16 w-24 object-cover rounded border border-slate-700" />
                  <div className="min-w-0">
                    {bgState.attribution && <p className="text-xs text-slate-400 truncate">{bgState.attribution}</p>}
                    {bgState.updatedAt && <p className="text-xs text-slate-600">Fetched {new Date(bgState.updatedAt).toLocaleString()}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">No photo fetched yet.</p>
              )}
              <button
                type="button"
                onClick={() => void handleRefreshBg()}
                disabled={bgRefreshing}
                className="rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
              >
                {bgRefreshing ? 'Fetching…' : 'Get a new photo now'}
              </button>
              {bgRefreshError && <p className="text-xs text-red-400">{bgRefreshError}</p>}
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Layout Sizes card — only shown for Classic template ── */}
      {(settings?.activeTemplateId ?? 'classic') === 'classic' && <SectionCard title="Layout Sizes">
        <p className="text-xs text-slate-500 -mt-2">Adjust slot dimensions for the Classic template.</p>

        {/* Sidebar width */}
        <SliderField
          label="Sidebar width"
          value={form.sidebarWidth}
          min={200} max={560} step={10}
          presets={SIDEBAR_PRESETS}
          onChange={(v) => autoSave({ sidebarWidth: v })}
        />

        {/* Photo strip height */}
        <SliderField
          label="Photo strip height"
          value={form.photoStripHeight}
          min={60} max={300} step={10}
          presets={PHOTO_PRESETS}
          onChange={(v) => autoSave({ photoStripHeight: v })}
        />

        {/* News band height */}
        <SliderField
          label="News band height"
          value={form.newsBandHeight}
          min={32} max={96} step={4}
          presets={NEWS_PRESETS}
          onChange={(v) => autoSave({ newsBandHeight: v })}
        />

        {autoSaved && <span className="text-sm text-green-400">Saved ✓</span>}
      </SectionCard>}

      {/* ── Sleep Schedule card ── */}
      <SectionCard title="Sleep Schedule">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">Screen sleep</p>
            <p className="text-xs text-slate-500 mt-0.5">Turn the display off on a schedule.</p>
          </div>
          <Toggle
            enabled={form.screenSleepEnabled}
            onChange={(v) => autoSave({ screenSleepEnabled: v })}
            label="Screen sleep"
          />
        </div>

        {form.screenSleepEnabled && !settings.touchscreenEnabled && !form.screenDimEnabled && (
          <div className="rounded-md border border-amber-800 bg-amber-950 p-3 space-y-2">
            <p className="text-xs text-amber-400">
              Your display isn&apos;t a touchscreen, so it can&apos;t be woken by tapping it once
              asleep. If a schedule mistake leaves it dark, use the button below from any device
              to wake it instantly instead of waiting for the schedule (or a reboot).
            </p>
            <button
              type="button"
              onClick={() => void wakeDisplay()}
              disabled={waking}
              className="rounded-md bg-amber-700 hover:bg-amber-600 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              {waking ? 'Waking…' : 'Wake display now'}
            </button>
            {wakeSent && <span className="ml-2 text-xs text-green-400">Sent</span>}
          </div>
        )}

        {form.screenSleepEnabled && (
          <form onSubmit={(e) => void handleTimeSave(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Sleep at</label>
                <input type="time" value={form.screenSleepStart}
                  onChange={(e) => set('screenSleepStart', e.target.value)}
                  className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Wake at</label>
                <input type="time" value={form.screenSleepEnd}
                  onChange={(e) => set('screenSleepEnd', e.target.value)}
                  className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>

            {/* Dim instead of off */}
            <div className="rounded-md border border-slate-700 bg-slate-800/40 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-300">Dim instead of off</p>
                  <p className="text-xs text-slate-500 mt-0.5">Reduce brightness rather than going fully black.</p>
                </div>
                <Toggle
                  enabled={form.screenDimEnabled}
                  onChange={(v) => autoSave({ screenDimEnabled: v })}
                  label="Dim instead of off"
                />
              </div>

              {form.screenDimEnabled && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">Dimming level</label>
                    <div className="flex items-center gap-2">
                      {/* Preview swatch */}
                      <div
                        style={{
                          width: '2rem',
                          height: '1rem',
                          borderRadius: '0.25rem',
                          background: `rgba(0,0,0,${Math.min(form.screenDimLevel / 100, 0.75)})`,
                          border: '1px solid #374151',
                        }}
                      />
                      <span className="text-xs text-slate-500 font-mono w-8 text-right">{form.screenDimLevel}%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={5} max={80} step={5}
                    value={form.screenDimLevel}
                    onChange={(e) => autoSave({ screenDimLevel: parseInt(e.target.value, 10) })}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-slate-600 mt-0.5">
                    <span>Slightly dim</span>
                    <span>Very dark</span>
                  </div>
                </div>
              )}
            </div>

            {timeError && <p className="text-xs text-red-400">{timeError}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
              {timeSaved && <span className="text-sm text-green-400">Saved</span>}
            </div>
          </form>
        )}

        {!form.screenSleepEnabled && (
          <p className="text-xs text-slate-500">Display stays on at all times.</p>
        )}
      </SectionCard>
    </div>
  );
}

function SliderField({
  label, value, min, max, step, presets, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  presets: { label: string; px: number }[];
  onChange: (v: number) => void;
}) {
  const activePreset = presets.find((p) => p.px === value)?.label;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm text-slate-300">{label}</label>
        <span className="text-xs text-slate-500 font-mono">{value}px{activePreset ? ` · ${activePreset}` : ''}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-blue-500"
      />
      <div className="flex gap-2 mt-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.px)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${value === p.px ? 'border-blue-500 bg-blue-950 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
