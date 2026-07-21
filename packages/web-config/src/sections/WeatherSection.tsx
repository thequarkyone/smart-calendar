import { useState, useEffect } from 'react';
import { getWeather, refreshWeather } from '../api.js';
import type { WeatherState } from '@smart-display/shared';
import { WidgetsLink } from '../components/WidgetsLink.js';

export function WeatherSection() {
  const [state, setState] = useState<WeatherState | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    getWeather()
      .then(setState)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setInitialLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    setRefreshed(false);
    try {
      setState(await refreshWeather());
      setRefreshed(true);
      setTimeout(() => setRefreshed(false), 3000);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold text-slate-100 mb-1">Weather</h2>
      <p className="text-sm text-slate-400 mb-6">Current conditions from Open-Meteo (no API key required). Location is configured in Settings.</p>

      {error && (
        <div role="alert" className="mb-4 rounded-md bg-red-900/30 border border-red-700 px-4 py-2 text-sm text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => { void handleRefresh(); }} className="text-red-300 hover:text-white text-xs underline flex-shrink-0">Try again</button>
        </div>
      )}

      {initialLoading ? (
        <div className="mb-6 text-sm text-slate-500">Loading weather data…</div>
      ) : state ? (
        <div className="mb-6 p-4 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-slate-300 space-y-1">
          <div><span className="text-slate-500">Last updated:</span> {state.updatedAt ? new Date(state.updatedAt).toLocaleString() : 'Never'}</div>
          {state.current && (
            <>
              <div><span className="text-slate-500">Temperature:</span> {state.current.tempC.toFixed(1)}°C</div>
              <div><span className="text-slate-500">Humidity:</span> {state.current.humidity}%</div>
            </>
          )}
        </div>
      ) : (
        <div className="mb-6 text-sm text-slate-500">No data yet. Configure location in Settings then refresh.</div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { void handleRefresh(); }}
          disabled={refreshing}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh Now'}
        </button>
        {refreshed && <span className="text-sm text-green-400">Updated ✓</span>}
      </div>
      <WidgetsLink />
    </div>
  );
}
