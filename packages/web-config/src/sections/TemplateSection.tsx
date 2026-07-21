import { useState, useEffect } from 'react';
import type { Template } from '@smart-display/shared';
import { getTemplates, patchSettings } from '../api.js';
import { useSettings } from '../hooks/useSettings.js';

const CAPABILITY_TAGS: Record<string, string[]> = {
  'classic':     ['Sidebar', 'Calendar', 'Photo strip', 'News'],
  'minimal':     ['Clock', 'Calendar'],
  'photo-focus': ['Full-bleed photo', 'Clock overlay'],
};

export function TemplateSection() {
  const { settings, loading: settingsLoading } = useSettings();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTemplates()
      .then(setTemplates)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setTemplatesLoading(false));
  }, []);

  const activeId = settings?.activeTemplateId ?? 'classic';

  const handleSelect = async (id: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await patchSettings({ activeTemplateId: id });
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (settingsLoading || templatesLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">Loading templates…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-100 mb-1">Layout</h2>
      <p className="text-sm text-slate-400 mb-6">Choose a layout for your display.</p>

      {error && (
        <div className="mb-4 rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((tpl) => {
          const isActive = activeId === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              disabled={saving}
              onClick={() => void handleSelect(tpl.id)}
              className={`text-left rounded-lg border-2 p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive
                  ? 'border-blue-500 bg-blue-950/40'
                  : 'border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-100">{tpl.name}</span>
                {isActive && (
                  <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{tpl.description}</p>
              {CAPABILITY_TAGS[tpl.id] != null && (
                <div className="flex flex-wrap gap-1">
                  {(CAPABILITY_TAGS[tpl.id] ?? []).map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{tag}</span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
