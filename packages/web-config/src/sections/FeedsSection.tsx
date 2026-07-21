import { useState, useEffect } from 'react';
import { getFeeds, addFeed, deleteFeed, syncFeed } from '../api.js';
import type { FeedsState } from '@smart-display/shared';
import { WidgetsLink } from '../components/WidgetsLink.js';

export function FeedsSection() {
  const [state, setState] = useState<FeedsState | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [maxItems, setMaxItems] = useState('5');
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    getFeeds().then(setState).catch((e: unknown) => setError(String(e)));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setState(await addFeed(name.trim(), url.trim(), parseInt(maxItems, 10) || 5));
      setName(''); setUrl(''); setMaxItems('5');
    } catch { setError('Could not add feed. Check the URL and try again.'); }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    try { setState(await deleteFeed(id)); } catch { setError('Could not remove feed. Please try again.'); }
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    try { setState(await syncFeed(id)); } catch { setError('Could not sync feed. Check your internet connection and try again.'); }
    finally { setSyncing(null); }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold text-slate-100 mb-1">News Feeds</h2>
      <p className="text-sm text-slate-400 mb-6">Add news sources to show headlines on the display. Paste a link from any news website. Refreshed every 15 minutes.</p>

      {error && <div className="mb-4 rounded-md bg-red-900/30 border border-red-700 px-4 py-2 text-sm text-red-300">{error}</div>}

      <form onSubmit={(e) => { void handleAdd(e); }} className="mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex flex-col gap-1 sm:w-36">
            <label className="text-xs text-slate-400 font-medium">Name</label>
            <input className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" placeholder="BBC News" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-slate-400 font-medium">Feed URL</label>
            <input className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" type="url" placeholder="https://example.com/feed.xml" value={url} onChange={(e) => setUrl(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1 sm:w-20">
            <label className="text-xs text-slate-400 font-medium">Max items</label>
            <input className="w-full max-w-[80px] rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" type="number" min="1" max="20" value={maxItems} onChange={(e) => setMaxItems(e.target.value)} />
          </div>
          <div className="flex flex-col justify-end">
            <button type="submit" className="px-4 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">Add</button>
          </div>
        </div>
      </form>

      <div className="space-y-2">
        {state?.sources.map((source) => {
          const itemCount = state.items.filter((i) => i.feedId === source.id).length;
          return (
            <div key={source.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700">
              <div>
                <div className="text-sm font-medium text-slate-100">{source.name}</div>
                <div className="text-xs text-slate-500 truncate max-w-xs">{source.urlSet ? 'URL configured' : 'No URL set'}</div>
                <div className="text-xs text-slate-600">{itemCount} items loaded</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { void handleSync(source.id); }} disabled={syncing === source.id} className="text-xs text-blue-400 hover:text-blue-300 px-3 py-2 min-h-[44px] rounded hover:bg-blue-900/20 disabled:opacity-50">{syncing === source.id ? 'Syncing…' : 'Sync'}</button>
                {confirmDeleteId === source.id ? (
                  <>
                    <button type="button" onClick={() => { void handleDelete(source.id); }} className="text-xs text-red-400 hover:text-red-300 px-3 py-2 min-h-[44px] rounded bg-red-900/20">Confirm</button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400 hover:text-slate-300 px-3 py-2 min-h-[44px] rounded">Cancel</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteId(source.id)} className="text-xs text-red-400 hover:text-red-300 px-3 py-2 min-h-[44px] rounded hover:bg-red-900/20">Remove</button>
                )}
              </div>
            </div>
          );
        })}
        {state?.sources.length === 0 && <div className="text-sm text-slate-500">No feeds yet.</div>}
      </div>
      <WidgetsLink />
    </div>
  );
}
