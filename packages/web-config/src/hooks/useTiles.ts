import { useState, useEffect, useCallback } from 'react';
import type { Tile, WidgetStyle } from '@smart-display/shared';
import { getTiles, patchTile, patchTileStyle, patchTileConfig } from '../api.js';

export interface UseTilesReturn {
  tiles: Tile[];
  loading: boolean;
  error: string | null;
  toggle: (id: string, enabled: boolean) => Promise<void>;
  saveStyle: (id: string, style: WidgetStyle) => Promise<void>;
  saveConfig: (id: string, config: Record<string, unknown>) => Promise<void>;
}

export function useTiles(): UseTilesReturn {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTiles()
      .then((t) => { if (!cancelled) setTiles(t); })
      .catch((e: unknown) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));
    try {
      const updated = await patchTile(id, enabled);
      setTiles((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e: unknown) {
      setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !enabled } : t)));
      setError(String(e));
    }
  }, []);

  const saveStyle = useCallback(async (id: string, style: WidgetStyle) => {
    try {
      const updated = await patchTileStyle(id, style);
      setTiles((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e: unknown) {
      setError(String(e));
    }
  }, []);

  const saveConfig = useCallback(async (id: string, config: Record<string, unknown>) => {
    try {
      const updated = await patchTileConfig(id, config);
      setTiles((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e: unknown) {
      setError(String(e));
    }
  }, []);

  return { tiles, loading, error, toggle, saveStyle, saveConfig };
}
