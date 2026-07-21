import { useState, useEffect, useRef, useCallback } from 'react';
import type { Settings } from '@smart-display/shared';
import { useSettings } from '../hooks/useSettings.js';
import { setGoogleOAuthCredentials, geocodeLocation, type GeocodeResult } from '../api.js';

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Helsinki',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
];

type FormState = Pick<Settings, 'householdName' | 'timezone' | 'clockFormat' | 'units' | 'theme' | 'touchscreenEnabled'>;

function toFormState(s: Settings): FormState {
  return {
    householdName: s.householdName,
    timezone: s.timezone,
    clockFormat: s.clockFormat,
    units: s.units,
    theme: s.theme,
    touchscreenEnabled: s.touchscreenEnabled,
  };
}

export function SettingsSection() {
  const { settings, loading, error, save } = useSettings();
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(toFormState(settings));
  }, [settings, form]);

  const autoSave = useCallback((patch: Partial<FormState>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void save(patch).then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
    }, 600);
  }, [save]);

  if (!loading && !form && error) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-red-400">{error}</p>
        <button type="button" onClick={() => window.location.reload()} className="text-sm text-blue-400 hover:underline">Retry</button>
      </div>
    );
  }

  if (loading || !form) {
    return (
      <div className="p-6">
        <p role="status" className="text-sm text-slate-500">Loading settings&hellip;</p>
      </div>
    );
  }

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    const patch = { [key]: value } as Pick<FormState, K>;
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    autoSave(patch);
  }

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-lg font-semibold text-slate-100 mb-1">Settings</h2>
      <p className="text-sm text-slate-400 mb-6">Global display configuration. Changes save automatically.</p>

      {error && (
        <div className="mb-4 rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Household Name
          </label>
          <input
            type="text"
            value={form.householdName}
            onChange={(e) => field('householdName', e.target.value)}
            placeholder="e.g. Shead Family"
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Timezone
          </label>
          <select
            value={form.timezone}
            onChange={(e) => field('timezone', e.target.value)}
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
            {!COMMON_TIMEZONES.includes(form.timezone) && (
              <option value={form.timezone}>{form.timezone}</option>
            )}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Clock Format
            </label>
            <select
              value={form.clockFormat}
              onChange={(e) => field('clockFormat', e.target.value as Settings['clockFormat'])}
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2.5 min-h-[44px] text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="12h">12-hour</option>
              <option value="24h">24-hour</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Units
            </label>
            <select
              value={form.units}
              onChange={(e) => field('units', e.target.value as Settings['units'])}
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2.5 min-h-[44px] text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Theme
          </label>
          <select
            value={form.theme}
            onChange={(e) => field('theme', e.target.value as Settings['theme'])}
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Touchscreen display
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={form.touchscreenEnabled}
                onChange={(e) => field('touchscreenEnabled', e.target.checked)}
              />
              <div className={`w-10 h-6 rounded-full transition-colors ${form.touchscreenEnabled ? 'bg-blue-600' : 'bg-slate-700'}`} />
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${form.touchscreenEnabled ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-slate-400">
              {form.touchscreenEnabled ? 'Enabled — tap-to-toggle Home Assistant controls' : 'Disabled'}
            </span>
          </label>
        </div>

        {saved && (
          <p className="text-sm text-green-400">Saved &#10003;</p>
        )}

        <LocationCard location={settings?.location ?? null} onSave={(loc) => { void save({ location: loc }); }} />

        <GoogleCredentialsCard currentClientId={settings?.googleOAuthClientId ?? null} />
      </div>
    </div>
  );
}

function LocationCard({ location, onSave }: { location: Settings['location']; onSave: (loc: Settings['location']) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setResults([]);
    try {
      const { results } = await geocodeLocation(query.trim());
      if (results.length === 0) setError('No matches found — try a different spelling.');
      setResults(results);
    } catch {
      setError('Location lookup failed.');
    } finally {
      setSearching(false);
    }
  }

  function pick(r: GeocodeResult) {
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
    onSave({ label, latitude: r.latitude, longitude: r.longitude });
    setResults([]);
    setQuery('');
  }

  return (
    <div className="pt-4 border-t border-slate-700">
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Location</h3>
      <p className="text-xs text-slate-400 mb-2">Used for weather and (optionally) automatic day/night theme.</p>

      {location ? (
        <div className="flex items-center justify-between gap-3 mb-3 rounded-md bg-slate-800/60 border border-slate-700 px-3 py-2">
          <span className="text-sm text-slate-200">{location.label || `${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`}</span>
          <button type="button" onClick={() => onSave(null)} className="text-xs text-red-400 hover:text-red-300 underline flex-shrink-0">Clear</button>
        </div>
      ) : (
        <p className="text-xs text-amber-400 mb-3">No location set — weather won't work until one is chosen.</p>
      )}

      <form onSubmit={(e) => { void handleSearch(e); }} className="flex gap-2 mb-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="City name, e.g. Charlotte, NC"
          className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2.5 min-h-[44px] text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="px-4 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {results.length > 0 && (
        <ul className="space-y-1.5">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="w-full text-left px-3 py-2 min-h-[44px] rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-200"
              >
                {[r.name, r.admin1, r.country].filter(Boolean).join(', ')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoogleCredentialsCard({ currentClientId }: { currentClientId: string | null }) {
  const [clientId, setClientId] = useState(currentClientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (currentClientId && !clientId) setClientId(currentClientId);
  }, [currentClientId, clientId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true);
    setStatus('idle');
    try {
      await setGoogleOAuthCredentials(clientId.trim(), clientSecret.trim());
      setClientSecret('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pt-4 border-t border-slate-700">
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Google Calendar access</h3>
      <p className="text-xs text-slate-400 mb-2">Follow these steps once to let your display read your Google Calendar:</p>
      <ol className="space-y-1.5 text-xs text-slate-400 mb-3 list-decimal list-inside">
        <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">console.cloud.google.com</a> and create a new project (any name).</li>
        <li>In the left menu, click <strong>APIs &amp; Services → Library</strong>. Search for "Google Calendar API" and click <strong>Enable</strong>.</li>
        <li>Go to <strong>APIs &amp; Services → Credentials</strong>. Click <strong>Create Credentials → OAuth client ID</strong>.</li>
        <li>Choose <strong>Web application</strong>. Under "Authorized redirect URIs", click <strong>Add URI</strong> and paste: <code className="bg-slate-800 px-1 rounded">http://smartdisplay.local/api/calendars/oauth/google/callback</code>. Click <strong>Save</strong>.</li>
        <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> and paste them below.</li>
      </ol>
      <form onSubmit={(e) => { void handleSave(e); }} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="123456789-abc.apps.googleusercontent.com"
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Client Secret {currentClientId && <span className="text-green-500 ml-1">&#10003; already set</span>}
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={currentClientId ? '••••••••  (enter new value to update)' : 'Paste your client secret'}
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        {status === 'saved' && <p className="text-xs text-green-400">Credentials saved &#10003;</p>}
        {status === 'error' && <p className="text-xs text-red-400">Failed to save credentials.</p>}
        <button
          type="submit"
          disabled={saving || !clientId.trim() || !clientSecret.trim()}
          className="px-3 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white transition-colors"
        >
          {saving ? 'Saving…' : 'Save credentials'}
        </button>
      </form>
    </div>
  );
}

