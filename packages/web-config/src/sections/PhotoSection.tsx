import { useState, useEffect, useRef } from 'react';
import { getPhotos, addPhotoSource, deletePhotoSource, uploadPhoto } from '../api.js';
import type { PhotoState } from '@smart-display/shared';
import { WidgetsLink } from '../components/WidgetsLink.js';

export function PhotoSection() {
  const [state, setState] = useState<PhotoState | null>(null);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => getPhotos().then(setState).catch((e: unknown) => setError(String(e)));

  useEffect(() => { void load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAdding(true);
    try {
      const s = await addPhotoSource(name.trim(), path.trim());
      setState(s);
      setName('');
      setPath('');
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadPhoto(file);
      }
      await load();
    } catch (e: unknown) {
      setUploadError(String(e));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setConfirmDeleteId(null);
    try {
      const s = await deletePhotoSource(id);
      setState(s);
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold text-slate-100 mb-1">Photo Slideshow</h2>
      <p className="text-sm text-slate-400 mb-6">Add local directories to scan for photos. Photos rotate every 30 seconds.</p>

      {error && (
        <div role="alert" className="mb-4 rounded-md bg-red-900/30 border border-red-700 px-4 py-2 text-sm text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => { setError(null); void load(); }} className="text-red-300 hover:text-white text-xs underline flex-shrink-0">Try again</button>
        </div>
      )}

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleUpload(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        aria-label="Upload photos"
        className={`mb-6 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-950/20' : 'border-slate-700 hover:border-slate-500'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void handleUpload(e.target.files)}
        />
        {uploading ? (
          <p className="text-sm text-slate-400">Uploading…</p>
        ) : (
          <>
            <p className="text-sm text-slate-300 font-medium">Drop photos here or click to browse</p>
            <p className="text-xs text-slate-500 mt-1">JPEG, PNG, WebP · up to 20 MB each</p>
          </>
        )}
      </div>
      {uploadError && (
        <div role="alert" className="mb-4 rounded-md bg-red-900/30 border border-red-700 px-4 py-2 text-sm text-red-300">
          {uploadError}
        </div>
      )}

      <form onSubmit={(e) => { void handleAdd(e); }} className="mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex flex-col gap-1 sm:w-36">
            <label className="text-xs text-slate-400 font-medium">Name</label>
            <input
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              placeholder="Family Photos"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-slate-400 font-medium">Folder path</label>
            <input
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              placeholder="/path/to/photos"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col justify-end">
            <button type="submit" disabled={adding} className="px-4 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">{adding ? 'Adding…' : 'Add'}</button>
          </div>
        </div>
      </form>

      <div className="space-y-2">
        {state?.sources.map((source) => (
          <div key={source.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700">
            <div>
              <div className="text-sm font-medium text-slate-100">{source.name}</div>
              <div className="text-xs text-slate-500">{source.path}</div>
            </div>
            {confirmDeleteId === source.id ? (
              <div className="flex flex-col sm:flex-row gap-1">
                <button
                  type="button"
                  onClick={() => { void handleDelete(source.id); }}
                  className="text-xs text-white bg-red-600 hover:bg-red-500 px-2 py-1 rounded"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteId(source.id)}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {state?.sources.length === 0 && (
          <div className="text-sm text-slate-500">No photo sources added yet.</div>
        )}
      </div>

      {state && (
        <div className="mt-4 text-xs text-slate-500">{state.totalCount} photos found across all sources.</div>
      )}
      <WidgetsLink />
    </div>
  );
}
