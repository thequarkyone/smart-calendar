import { useState, useEffect } from 'react';
import { clearApiToken, getSettings, patchSettings } from '../api.js';

interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  notes: string | null;
  managed: boolean;
  applying: boolean;
  error: string | null;
}

async function fetchUpdateStatus(): Promise<UpdateStatus> {
  const res = await fetch('/api/update');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<UpdateStatus>;
}

async function checkForUpdate(): Promise<UpdateStatus> {
  const res = await fetch('/api/update/check', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<UpdateStatus>;
}

async function applyUpdate(): Promise<UpdateStatus> {
  const res = await fetch('/api/update/apply', { method: 'POST' });
  const body = await res.json() as UpdateStatus | { error: string };
  if (!res.ok) throw new Error('error' in body ? body.error ?? `HTTP ${res.status}` : `HTTP ${res.status}`);
  return body as UpdateStatus;
}

async function rollbackUpdate(): Promise<UpdateStatus> {
  const res = await fetch('/api/update/rollback', { method: 'POST' });
  const body = await res.json() as UpdateStatus | { error: string };
  if (!res.ok) throw new Error('error' in body ? body.error ?? `HTTP ${res.status}` : `HTTP ${res.status}`);
  return body as UpdateStatus;
}

type ResetStage = 'idle' | 'confirm-data' | 'confirm-factory' | 'confirm-rollback' | 'resetting' | 'done-data' | 'done-factory';
type ImportStage = 'idle' | 'confirming' | 'importing' | 'done' | 'error' | 'pin-required';
type RebootStage = 'idle' | 'confirm' | 'rebooting' | 'done';

async function postReset(path: string, pin: string): Promise<{ ok: boolean; rebooting?: boolean }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Incorrect PIN. Please try again.');
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; rebooting?: boolean }>;
}

async function postReboot(): Promise<{ ok: boolean; rebooting: boolean }> {
  const res = await fetch('/api/system/reboot', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ ok: boolean; rebooting: boolean }>;
}

export function SystemSection() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoUpdate, setAutoUpdate] = useState<boolean | null>(null);
  const [autoUpdateTime, setAutoUpdateTime] = useState<string>('');
  const [resetStage, setResetStage] = useState<ResetStage>('idle');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState('');
  const [rebootStage, setRebootStage] = useState<RebootStage>('idle');
  const [rebootError, setRebootError] = useState<string | null>(null);
  const [importStage, setImportStage] = useState<ImportStage>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<unknown>(null);
  const [importPin, setImportPin] = useState('');

  async function handleCheck() {
    setLoading(true);
    setError(null);
    try {
      setStatus(await checkForUpdate());
    } catch {
      setError('Could not check for updates. Make sure your display is connected to the internet.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    setLoading(true);
    setError(null);
    try {
      setStatus(await applyUpdate());
    } catch {
      setError('Update failed. Your display is unchanged — check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRollback() {
    setLoading(true);
    setError(null);
    try {
      setStatus(await rollbackUpdate());
    } catch {
      setError('Could not go back to the previous version. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoUpdateToggle(enabled: boolean) {
    setAutoUpdate(enabled);
    try {
      await patchSettings({ autoUpdate: enabled });
    } catch {
      setAutoUpdate(!enabled);
    }
  }

  async function handleAutoUpdateTime(time: string) {
    setAutoUpdateTime(time);
    try {
      await patchSettings({ autoUpdateTime: time || null });
    } catch {
      // best-effort; field will resync on next load
    }
  }

  async function handleResetData() {
    setResetStage('resetting');
    setResetError(null);
    try {
      await postReset('/api/reset/data', resetPin);
      clearApiToken();
      setResetPin('');
      setResetStage('done-data');
    } catch (e) {
      setResetPin('');
      setResetError(e instanceof Error ? e.message : String(e));
      setResetStage('confirm-data');
    }
  }

  async function handleFactoryReset() {
    setResetStage('resetting');
    setResetError(null);
    try {
      const result = await postReset('/api/reset/factory', resetPin);
      clearApiToken();
      setResetPin('');
      setResetStage(result.rebooting ? 'done-factory' : 'done-data');
    } catch (e) {
      setResetPin('');
      setResetError(e instanceof Error ? e.message : String(e));
      setResetStage('confirm-factory');
    }
  }

  async function handleReboot() {
    setRebootStage('rebooting');
    setRebootError(null);
    try {
      await postReboot();
      setRebootStage('done');
    } catch (e) {
      setRebootError(e instanceof Error ? e.message : String(e));
      setRebootStage('idle');
    }
  }

  function handleExport() {
    window.open('/api/backup/export', '_blank');
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data: unknown = JSON.parse(reader.result as string);
        setPendingImport(data);
        setImportStage('confirming');
        setImportError(null);
      } catch {
        setImportError('Could not read that file. Make sure you selected a Glance backup file.');
        setImportStage('error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleConfirmImport() {
    if (!pendingImport || !importPin) return;
    setImportStage('importing');
    setImportError(null);
    try {
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Spread the backup file FIRST so the user-entered PIN always wins — otherwise a backup
        // file containing its own top-level `pin` key would silently replace what the user typed
        // into the confirmation box.
        body: JSON.stringify({ ...(pendingImport as object), pin: importPin }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        if (res.status === 401) {
          setImportPin('');
          setImportStage('pin-required');
          setImportError('Incorrect PIN. Please try again.');
          return;
        }
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setImportStage('done');
      setPendingImport(null);
      setImportPin('');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Restore failed. Check your backup file and try again.');
      setImportStage('error');
    }
  }

  useEffect(() => {
    setLoading(true);
    void fetchUpdateStatus().then(setStatus).catch((e: unknown) => setError(String(e))).finally(() => setLoading(false));
    void getSettings().then((s) => {
      setAutoUpdate(s.autoUpdate);
      setAutoUpdateTime(s.autoUpdateTime ?? '');
    }).catch(() => {});
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">About &amp; Updates</h2>
        <p className="text-sm text-slate-400 mt-1">Software version and updates</p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Current version</span>
          <span className="text-sm font-mono text-slate-200">
            {status?.currentVersion ?? '—'}
          </span>
        </div>

        {status?.latestVersion && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Latest version</span>
            <span className="text-sm font-mono text-slate-200">{status.latestVersion}</span>
          </div>
        )}

        {status && !status.managed && (
          <p className="text-xs text-amber-400">
            Running in development mode — updates can only be applied when running on your Smart Display device.
          </p>
        )}

        {status?.updateAvailable && status.notes && (
          <div className="rounded bg-slate-800 px-3 py-2">
            <p className="text-xs text-slate-400 font-medium mb-1">Release notes</p>
            <p className="text-xs text-slate-300">{status.notes}</p>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3">
            <p className="text-xs text-red-400">{error}</p>
            <button type="button" onClick={() => { setError(null); void handleCheck(); }} className="text-xs text-red-400 hover:text-white underline flex-shrink-0">Try again</button>
          </div>
        )}

        <div className="border-t border-slate-800 pt-3 space-y-3">
          <div className="flex items-start gap-3">
            <label htmlFor="auto-update" className="flex items-start gap-3 cursor-pointer select-none p-2 -m-2">
            <input
              type="checkbox"
              id="auto-update"
              checked={autoUpdate ?? false}
              disabled={autoUpdate === null || !status?.managed}
              onChange={(e) => { void handleAutoUpdateToggle(e.target.checked); }}
              className="mt-0.5 w-4 h-4 flex-shrink-0"
            />
            <span className="text-sm text-slate-300">
              Automatically install updates
              <span className="block text-xs text-slate-500 mt-0.5">
                {status?.managed
                  ? 'Checks daily and applies any new release automatically.'
                  : 'Only available when running on your Smart Display device.'}
              </span>
            </span>
            </label>
          </div>

          {autoUpdate && status?.managed && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pl-7">
              <label htmlFor="auto-update-time" className="text-xs text-slate-400 w-24 flex-shrink-0">
                Update time
              </label>
              <input
                type="time"
                id="auto-update-time"
                value={autoUpdateTime}
                onChange={(e) => { void handleAutoUpdateTime(e.target.value); }}
                className="rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
              {autoUpdateTime ? (
                <span className="text-xs text-slate-500">Updates install at {autoUpdateTime} daily</span>
              ) : (
                <span className="text-xs text-slate-500">No time set — updates install as soon as found</span>
              )}
              {autoUpdateTime && (
                <button
                  type="button"
                  onClick={() => { void handleAutoUpdateTime(''); }}
                  className="text-xs text-slate-500 hover:text-slate-300 min-h-[44px] px-2"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={loading}
            className="w-full sm:w-auto rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {loading && !status?.applying ? 'Checking…' : 'Check for Updates'}
          </button>

          {status?.updateAvailable && status.managed && (
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={loading || status.applying}
              className="flex-1 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-2 text-sm font-medium text-white transition-colors"
            >
              {status.applying ? 'Updating…' : `Update to ${status.latestVersion ?? ''}`}
            </button>
          )}

          {status?.managed && !status.updateAvailable && status.latestVersion && resetStage !== 'confirm-rollback' && (
            <button
              type="button"
              onClick={() => setResetStage('confirm-rollback')}
              disabled={loading}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Go back to previous version
            </button>
          )}
          {resetStage === 'confirm-rollback' && (
            <div className="w-full rounded-md bg-amber-950 border border-amber-800 px-3 py-3 space-y-2">
              <p className="text-xs text-amber-300 font-medium">Go back to the previous version?</p>
              <p className="text-xs text-amber-400">Use this if the latest update caused a problem. Your display will restart.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setResetStage('idle'); void handleRollback(); }} disabled={loading} className="px-3 py-2 rounded-md bg-amber-700 hover:bg-amber-600 text-white text-xs font-medium disabled:opacity-50">Yes, go back</button>
                <button type="button" onClick={() => setResetStage('idle')} className="px-3 py-2 rounded-md border border-slate-600 text-slate-300 text-xs hover:bg-slate-800">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Backup & Restore */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Backup &amp; Restore</h3>
          <p className="text-xs text-slate-400 mt-1">
            Download a backup of your settings, calendars, feeds, tasks, and layout.
            Passwords and Home Assistant tokens are not included — you will need to re-enter them after restoring.
          </p>
        </div>

        {/* Export */}
        <button
          type="button"
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800 text-sm font-medium min-h-[44px]"
        >
          Download backup
        </button>

        {/* Import */}
        {importStage === 'done' && (
          <div className="rounded bg-green-900/30 border border-green-700 px-3 py-2 space-y-2">
            <p className="text-xs text-green-300 font-medium">Settings restored successfully.</p>
            <p className="text-xs text-green-400">Reload the page to see your restored configuration.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs text-white bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded"
            >
              Reload now
            </button>
          </div>
        )}

        {(importStage === 'confirming' || importStage === 'pin-required') && (
          <div className="rounded bg-amber-900/30 border border-amber-700 px-3 py-2 space-y-2">
            <p className="text-xs text-amber-300 font-medium">Replace all current settings with this backup?</p>
            <p className="text-xs text-amber-400">This will overwrite your calendars, feeds, tasks, and layout. You will need to re-enter passwords and tokens.</p>
            <div className="space-y-2 pt-1">
              <label className="block">
                <span className="text-xs text-slate-300">Enter your PIN to confirm</span>
                <input
                  type="password"
                  value={importPin}
                  onChange={(e) => setImportPin(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && importPin) void handleConfirmImport(); }}
                  autoComplete="current-password"
                  className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  placeholder="Your device PIN"
                />
              </label>
              {importError && <p className="text-xs text-red-400">{importError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void handleConfirmImport(); }}
                  disabled={!importPin}
                  className="px-3 py-2.5 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-medium min-h-[44px]"
                >
                  Yes, restore backup
                </button>
                <button
                  type="button"
                  onClick={() => { setImportStage('idle'); setPendingImport(null); setImportPin(''); setImportError(null); }}
                  className="px-3 py-2.5 rounded-md border border-slate-600 text-slate-300 text-xs hover:bg-slate-800 min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {importStage === 'importing' && (
          <p className="text-xs text-slate-400">Restoring…</p>
        )}

        {importStage === 'error' && importError && (
          <p role="alert" className="text-xs text-red-400">{importError}</p>
        )}

        {importStage !== 'done' && importStage !== 'confirming' && importStage !== 'pin-required' && importStage !== 'importing' && (
          <label className="block">
            <span className="sr-only">Choose backup file</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="block w-full text-xs text-slate-400 file:mr-3 file:py-2.5 file:min-h-[44px] file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 cursor-pointer"
            />
            <p className="text-xs text-slate-500 mt-1">Select a backup file to restore from</p>
          </label>
        )}
      </div>

      {/* Reset */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Reset</h3>
          <p className="text-xs text-slate-400 mt-1">
            Use these options if you're experiencing bugs or want to start fresh.
          </p>
        </div>

        {resetError && (
          <p className="text-xs text-red-400">{resetError}</p>
        )}

        {resetStage === 'done-data' && (
          <div className="rounded bg-green-900/30 border border-green-700 px-3 py-2 space-y-2">
            <p className="text-xs text-green-300 font-medium">All data cleared.</p>
            <p className="text-xs text-green-400">Reload this page to start onboarding again.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs text-white bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded"
            >
              Reload now
            </button>
          </div>
        )}

        {resetStage === 'done-factory' && (
          <div className="rounded bg-amber-900/30 border border-amber-700 px-3 py-2">
            <p className="text-xs text-amber-300 font-medium">Factory reset complete — device is rebooting.</p>
            <p className="text-xs text-amber-400 mt-0.5">The device will create a temporary WiFi network called SmartDisplay-Setup. Connect your phone or laptop to it to set up again.</p>
          </div>
        )}

        {(resetStage === 'idle' || resetStage === 'confirm-data' || resetStage === 'confirm-factory') && (
          <div className="space-y-3">
            {/* Soft reset */}
            <div className="rounded-md border border-slate-700 p-3 space-y-2">
              <div>
                <p className="text-sm font-medium text-slate-200">Reset all data</p>
                <p className="text-xs text-slate-400">
                  Wipes calendars, tasks, feeds, photos, Home Assistant, and all settings.
                  WiFi credentials and your PIN are kept. The device will re-enter setup.
                </p>
              </div>
              {resetStage === 'confirm-data' ? (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-xs text-slate-300">Enter your PIN to confirm</span>
                    <input
                      type="password"
                      value={resetPin}
                      onChange={(e) => setResetPin(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && resetPin) void handleResetData(); }}
                      autoComplete="current-password"
                      className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                      placeholder="Your device PIN"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { void handleResetData(); }}
                      disabled={!resetPin}
                      className="px-3 py-2.5 rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-medium"
                    >
                      Yes, reset all data
                    </button>
                    <button
                      type="button"
                      onClick={() => { setResetStage('idle'); setResetPin(''); setResetError(null); }}
                      className="px-3 py-2.5 rounded-md border border-slate-600 text-slate-300 text-xs hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setResetStage('confirm-data')}
                  disabled={resetStage === 'confirm-factory'}
                  className="px-3 py-2.5 rounded-md border border-red-800 text-red-400 hover:bg-red-900/20 text-xs disabled:opacity-30"
                >
                  Reset all data…
                </button>
              )}
            </div>

            {/* Factory reset */}
            <div className="rounded-md border border-slate-700 p-3 space-y-2">
              <div>
                <p className="text-sm font-medium text-slate-200">Factory reset</p>
                <p className="text-xs text-slate-400">
                  Everything above, plus wipes WiFi credentials and the device PIN.
                  On a Pi, the device reboots into AP setup mode.
                  <span className="text-amber-400"> Cannot be undone.</span>
                </p>
              </div>
              {resetStage === 'confirm-factory' ? (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-xs text-slate-300">Enter your PIN to confirm</span>
                    <input
                      type="password"
                      value={resetPin}
                      onChange={(e) => setResetPin(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && resetPin) void handleFactoryReset(); }}
                      autoComplete="current-password"
                      className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                      placeholder="Your device PIN"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { void handleFactoryReset(); }}
                      disabled={!resetPin}
                      className="px-3 py-2.5 rounded-md bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-medium"
                    >
                      Yes, factory reset
                    </button>
                    <button
                      type="button"
                      onClick={() => { setResetStage('idle'); setResetPin(''); setResetError(null); }}
                      className="px-3 py-2.5 rounded-md border border-slate-600 text-slate-300 text-xs hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setResetStage('confirm-factory')}
                  disabled={resetStage === 'confirm-data'}
                  className="px-3 py-2.5 rounded-md border border-red-800 text-red-400 hover:bg-red-900/20 text-xs disabled:opacity-30"
                >
                  Factory reset…
                </button>
              )}
            </div>
          </div>
        )}

        {resetStage === 'resetting' && (
          <p className="text-sm text-slate-400">Resetting…</p>
        )}
      </div>

      {/* Reboot */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Reboot</h3>
          <p className="text-xs text-slate-400 mt-1">
            Restarts the display. Use this if it seems stuck or unresponsive — no data is changed.
          </p>
        </div>

        {rebootError && (
          <p className="text-xs text-red-400">{rebootError}</p>
        )}

        {rebootStage === 'done' && (
          <p className="text-xs text-green-400">Rebooting now — the display will be back in about a minute.</p>
        )}

        {rebootStage === 'rebooting' && (
          <p className="text-sm text-slate-400">Rebooting…</p>
        )}

        {(rebootStage === 'idle' || rebootStage === 'confirm') && (
          rebootStage === 'confirm' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { void handleReboot(); }}
                className="px-3 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium min-h-[44px]"
              >
                Yes, reboot now
              </button>
              <button
                type="button"
                onClick={() => setRebootStage('idle')}
                className="px-3 py-2.5 rounded-md border border-slate-600 text-slate-300 text-xs hover:bg-slate-800 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRebootStage('confirm')}
              className="px-3 py-2.5 rounded-md border border-slate-600 text-slate-300 text-xs hover:bg-slate-800 min-h-[44px]"
            >
              Reboot device…
            </button>
          )
        )}
      </div>
    </div>
  );
}
