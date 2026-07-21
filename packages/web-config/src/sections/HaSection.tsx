import { useState, useEffect, useRef, useCallback } from 'react';
import { getHa, patchHaSettings, testHaConnection, refreshHa, addHaEntity, deleteHaEntity, browseHaEntities } from '../api.js';
import type { HaState, HaEntityBrowse } from '@smart-display/shared';
import { WidgetsLink } from '../components/WidgetsLink.js';
import { Toggle } from '../components/Toggle.js';

const DOMAIN_LABELS: Record<string, string> = {
  binary_sensor: 'Binary Sensor',
  climate: 'Climate',
  cover: 'Cover',
  device_tracker: 'Device Tracker',
  input_boolean: 'Input Boolean',
  light: 'Light',
  lock: 'Lock',
  media_player: 'Media Player',
  person: 'Person',
  sensor: 'Sensor',
  switch: 'Switch',
  weather: 'Weather',
};

function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function EntityBrowser({
  onAdd,
  onClose,
  existingIds,
}: {
  onAdd: (entityId: string) => Promise<void>;
  onClose: () => void;
  existingIds: string[];
}) {
  const [entities, setEntities] = useState<HaEntityBrowse[] | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    browseHaEntities()
      .then((data) => { setEntities(data); setLoading(false); })
      .catch((e: unknown) => {
        const msg = String(e);
        setError(
          msg.includes('401') || msg.includes('Unauthorized')
            ? 'Authentication failed. Check your access token.'
            : msg.includes('ECONNREFUSED') || msg.includes('connection refused')
              ? 'Could not reach Home Assistant. Make sure it is powered on and the URL is correct.'
              : 'Could not load devices. Check your internet connection and try again.',
        );
        setLoading(false);
      });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const filtered = (entities ?? []).filter((e) => {
    const q = filter.toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.entityId.toLowerCase().includes(q) || e.domain.includes(q);
  });

  // Group by domain
  const grouped: Record<string, HaEntityBrowse[]> = {};
  for (const e of filtered) {
    (grouped[e.domain] ??= []).push(e);
  }

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-browser-title"
        onKeyDown={handleKeyDown}
        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg flex flex-col"
        style={{ maxHeight: 'min(80vh, calc(100dvh - 2rem))' }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 id="entity-browser-title" className="text-sm font-semibold text-slate-100">Choose devices to show</h3>
          <button type="button" onClick={onClose} aria-label="Close entity browser" className="text-slate-500 hover:text-slate-300 text-lg leading-none p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">&#x2715;</button>
        </div>
        <div className="px-4 pb-2">
          <input
            ref={inputRef}
            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            placeholder="Search by device name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-4">
          {loading && <div className="text-sm text-slate-400 py-4 text-center">Loading entities from Home Assistant…</div>}
          {error && <div className="text-sm text-red-400 py-4">{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-sm text-slate-500 py-4 text-center">No entities match your filter.</div>
          )}
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([domain, items]) => (
            <div key={domain} className="mb-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{domainLabel(domain)}</div>
              <div className="space-y-1">
                {items.map((e) => {
                  const added = existingIds.includes(e.entityId);
                  return (
                    <div
                      key={e.entityId}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-slate-100 truncate">{e.name}</div>
                        <div className="text-xs text-slate-500 truncate" title={e.entityId}>{e.state}{e.unit ? ` ${e.unit}` : ''}</div>
                      </div>
                      <button
                        type="button"
                        disabled={added}
                        onClick={() => { void onAdd(e.entityId); }}
                        className={`ml-3 text-xs px-3 py-1 rounded-md font-medium flex-shrink-0 ${
                          added
                            ? 'bg-slate-700 text-slate-500 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {added ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HaSection() {
  const [state, setState] = useState<HaState | null>(null);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showBrowser, setShowBrowser] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () => getHa().then((s) => {
    setState(s);
    setUrl(s.settings.url ?? '');
    setEnabled(s.settings.enabled);
  }).catch((e: unknown) => {
    const msg = String(e);
    setError(
      msg.includes('401') || msg.includes('Unauthorized')
        ? 'Authentication failed. Check your access token.'
        : msg.includes('ECONNREFUSED') || msg.includes('connection refused')
          ? 'Could not reach Home Assistant. Make sure it is powered on and the URL is correct.'
          : 'Could not load Home Assistant settings. Check your connection and try again.',
    );
  });

  useEffect(() => {
    void load().finally(() => setInitialLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setTestResult(null);
    try {
      const patch: { url?: string; token?: string; enabled?: boolean } = { url: url.trim(), enabled };
      if (token.trim()) patch.token = token.trim();
      setState(await patchHaSettings(patch));
      setToken('');
    } catch (e: unknown) {
      const msg = String(e);
      setError(
        msg.includes('401') || msg.includes('Unauthorized')
          ? 'Authentication failed. Check your access token.'
          : 'Could not save settings. Please try again.',
      );
    }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTestResult(null);
    setTesting(true);
    try {
      const r = await testHaConnection();
      if (r.ok) {
        setTestResult('✓ Connected successfully');
      } else {
        const msg = r.error ?? '';
        setTestResult(`✗ ${
          msg.includes('401') || msg.includes('Unauthorized')
            ? 'Authentication failed — check your token.'
            : msg.includes('ECONNREFUSED') || msg.includes('connection refused')
              ? 'Could not reach Home Assistant — check the URL.'
              : 'Connection failed. Check your URL and token.'
        }`);
      }
    } catch { setTestResult('✗ Could not connect. Check your URL and internet connection.'); }
    finally { setTesting(false); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try { setState(await refreshHa()); } catch (e: unknown) { setError(String(e)); }
    finally { setRefreshing(false); }
  };

  const handleAddEntity = async (entityId: string) => {
    try {
      setState(await addHaEntity(entityId));
    } catch (e: unknown) { setError(String(e)); }
  };

  const handleDeleteEntity = async (entityId: string) => {
    try {
      setState(await deleteHaEntity(entityId));
      setConfirmDelete(null);
    } catch (e: unknown) { setError(String(e)); }
  };

  const existingIds = state?.entities.map((e) => e.entityId) ?? [];

  return (
    <div className="p-6 max-w-2xl">
      {showBrowser && (
        <EntityBrowser
          existingIds={existingIds}
          onAdd={async (id) => { await handleAddEntity(id); }}
          onClose={() => setShowBrowser(false)}
        />
      )}

      <h2 className="text-xl font-semibold text-slate-100 mb-1">Home Assistant</h2>
      <p className="text-sm text-slate-400 mb-6">Connect to your Home Assistant to show lights, sensors, and switches on the display.</p>

      {initialLoading && !error && (
        <div className="mb-4 text-sm text-slate-500">Loading…</div>
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-md bg-red-900/30 border border-red-700 px-4 py-2 text-sm text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => { setError(null); void load(); }} className="text-red-300 hover:text-white text-xs underline flex-shrink-0">Try again</button>
        </div>
      )}

      <form onSubmit={(e) => { void handleSave(e); }} className="mb-6 space-y-3">
        <div>
          <label htmlFor="ha-url" className="block text-xs text-slate-400 mb-1">Home Assistant URL</label>
          <input id="ha-url" type="url" className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" placeholder="http://homeassistant.local:8123" value={url} onChange={(e) => setUrl(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">This is the same address you type in your browser to open Home Assistant, usually ending in :8123.</p>
        </div>
        <div>
          <label htmlFor="ha-token" className="block text-xs text-slate-400 mb-1">Home Assistant token {state?.settings.tokenSet && <span className="text-green-500">&#x2713; stored</span>}</label>
          <input id="ha-token" type="password" className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" placeholder={state?.settings.tokenSet ? 'Leave blank to keep existing token' : 'Paste your token here'} value={token} onChange={(e) => setToken(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">
            In Home Assistant: click your profile picture (bottom-left) → Security → scroll to Long-Lived Access Tokens → Create token → Copy and paste here.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Enable Home Assistant integration</span>
          <Toggle enabled={enabled} onChange={setEnabled} label="Enable Home Assistant integration" />
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <button type="submit" disabled={saving} className="px-4 py-2 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => { void handleTest(); }} disabled={testing} className="px-4 py-2 min-h-[44px] rounded-md bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium disabled:opacity-50">{testing ? 'Testing…' : 'Test Connection'}</button>
        </div>
        {testResult && <div role="alert" className={`text-sm ${testResult.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{testResult}</div>}
      </form>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Devices on display</h3>
        <div className="flex gap-2">
          {state?.settings.tokenSet && (
            <button
              type="button"
              onClick={() => setShowBrowser(true)}
              className="px-3 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
            >
              Browse…
            </button>
          )}
          <button type="button" onClick={() => { void handleRefresh(); }} disabled={refreshing} className="px-3 py-2.5 min-h-[44px] rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {state?.wsConnected && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-green-500">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
          Connected to Home Assistant
        </div>
      )}

      <div className="space-y-2 mb-4">
        {state?.entities.map((entity) => (
          <div key={entity.entityId} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700">
            <div>
              <div className="text-sm font-medium text-slate-100">{entity.name}</div>
              <div className="text-xs text-slate-500" title={entity.entityId}>{entity.state}{entity.unit ? ` ${entity.unit}` : ''}</div>
            </div>
            {confirmDelete === entity.entityId ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => { void handleDeleteEntity(entity.entityId); }} className="text-xs text-red-400 hover:text-red-300 px-3 py-2 min-h-[44px] rounded hover:bg-red-900/20">Confirm</button>
                <button type="button" onClick={() => setConfirmDelete(null)} className="text-xs text-slate-400 hover:text-slate-300 px-3 py-2 min-h-[44px]">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(entity.entityId)} className="text-xs text-slate-500 hover:text-red-400 px-3 py-2 min-h-[44px] rounded">Remove</button>
            )}
          </div>
        ))}
        {(state?.entities.length ?? 0) === 0 && (
          <div className="text-sm text-slate-500">
            No devices added yet.{' '}
            {state?.settings.tokenSet && (
              <button type="button" onClick={() => setShowBrowser(true)} className="text-blue-400 hover:text-blue-300 underline">Use Browse above to choose lights, sensors, or switches to show.</button>
            )}
          </div>
        )}
      </div>

      {state?.error && (
        <div className="text-xs text-red-400">
          {state.error.includes('connection refused') || state.error.includes('ECONNREFUSED')
            ? 'Could not reach Home Assistant. Check that it is powered on and the URL is correct.'
            : state.error.includes('401') || state.error.includes('Unauthorized')
              ? 'Authentication failed. Check that your access token is correct.'
              : 'Connection error — check your Home Assistant URL and token.'}
        </div>
      )}
      <WidgetsLink />
    </div>
  );
}
