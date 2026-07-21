import { useState, useEffect, useCallback } from 'react';

interface VersionInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
}

export function SupportSection() {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [versionError, setVersionError] = useState(false);

  const fetchVersion = useCallback(() => {
    setVersionError(false);
    fetch('/api/update')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setVersion(data as VersionInfo))
      .catch(() => setVersionError(true));
  }, []);

  useEffect(() => { fetchVersion(); }, [fetchVersion]);

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-0.5">Support</h2>
        <p className="text-sm text-slate-400">Diagnostics and help resources.</p>
      </div>

      {/* Version */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-300">Software Version</h3>
        {versionError ? (
          <div role="alert" className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Could not fetch version info.</p>
            <button type="button" onClick={fetchVersion} className="text-xs text-blue-400 hover:text-blue-300 underline">Try again</button>
          </div>
        ) : !version ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-mono text-slate-300">{version.currentVersion}</p>
            {version.updateAvailable && version.latestVersion && (
              <p className="text-xs text-amber-400">
                Update available: {version.latestVersion} — go to About &amp; Updates to apply.
              </p>
            )}
            {!version.updateAvailable && (
              <p className="text-xs text-green-500">Up to date</p>
            )}
          </div>
        )}
      </div>

      {/* Access */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-300">Access Your Display</h3>
        <p className="text-sm text-slate-400">
          Open the config app from any device on the same network:
        </p>
        <p className="text-sm font-mono text-blue-400">http://smartdisplay.local</p>
      </div>

      {/* GitHub */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Help &amp; Feedback</h3>
        <p className="text-sm text-slate-400">
          Found a bug or have a suggestion? Open an issue on GitHub — it's the best way to get it tracked and fixed.
        </p>
        <a
          href="https://github.com/thequarkyone/smart-calendar/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-slate-600 hover:text-white transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 10 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.92.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 20 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
          </svg>
          Open an issue on GitHub
        </a>
      </div>
    </div>
  );
}
