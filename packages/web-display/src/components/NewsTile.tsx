import { useMemo, memo } from 'react';
import type { FeedsState } from '@smart-display/shared';
import './NewsTile.css';

export const NewsTile = memo(function NewsTile({ state }: { state: FeedsState }) {
  const { items, sources } = state;

  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s.name])), [sources]);
  const allItems = useMemo(() => {
    const visible = items.slice(0, 12);
    return [...visible, ...visible];
  }, [items]);

  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 1rem', color: 'var(--text-faint)', fontSize: 'calc(1rem * var(--tile-font-scale, 1))', height: '100%' }}>
        No news feeds configured
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%', overflow: 'hidden' }}>
      {/* Separator bullet at left edge */}
      <div style={{ flexShrink: 0, fontSize: 'calc(0.9rem * var(--tile-font-scale, 1))', fontWeight: 700, color: 'var(--accent)', padding: '0 0.75rem', letterSpacing: '0.05em' }}>
        NEWS
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div className="news-track">
          {allItems.map((item, i) => (
            <div key={`${item.feedId}-${i}`} style={{ flexShrink: 0, maxWidth: 'clamp(240px, 28vw, 480px)', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: 'calc(1.5rem * var(--tile-font-scale, 1))', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 'clamp(200px, 24vw, 420px)' }}>
                {item.title}
              </span>
              <span style={{ flexShrink: 0, fontSize: 'calc(1rem * var(--tile-font-scale, 1))', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                {sourceMap.get(item.feedId) ?? 'News'}
              </span>
              {/* bullet separator between items */}
              <span style={{ flexShrink: 0, color: 'var(--separator)', fontSize: 'calc(1rem * var(--tile-font-scale, 1))', marginLeft: '1rem' }}>·</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
