import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '@smart-display/shared';
import { getSettings, patchSettings } from '../api.js';

export interface UseSettingsReturn {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  save: (patch: Partial<Settings>) => Promise<void>;
  saving: boolean;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => { if (!cancelled) setSettings(s); })
      .catch((e: unknown) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (patch: Partial<Settings>) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await patchSettings(patch);
      setSettings(updated);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, error, save, saving };
}
