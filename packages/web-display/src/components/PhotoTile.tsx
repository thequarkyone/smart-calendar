import { useEffect, useState } from 'react';
import type { PhotoState } from '@smart-display/shared';

export function PhotoTile({ state }: { state: PhotoState }) {
  const [displayed, setDisplayed] = useState<{ src: string; key: number } | null>(null);
  const [next, setNext] = useState<{ src: string; key: number } | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!state.currentPhoto) return;
    const newEntry = { src: `${state.currentPhoto}?t=${Date.now()}`, key: Date.now() };
    if (!displayed) {
      setDisplayed(newEntry);
      return;
    }
    setNext(newEntry);
    setFading(true);
    const t = setTimeout(() => {
      setDisplayed(newEntry);
      setNext(null);
      setFading(false);
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPhoto]);

  if (!state.currentPhoto || state.totalCount === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', fontSize: '0.75rem' }}>
        No photos configured
      </div>
    );
  }

  const imgStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    transition: 'opacity 800ms ease-in-out',
  };

  return (
    <div style={{ height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
      {displayed && (
        <img
          key={displayed.key}
          src={displayed.src}
          alt="Photo slideshow"
          style={{ ...imgStyle, opacity: fading ? 0 : 1 }}
        />
      )}
      {next && (
        <img
          key={next.key}
          src={next.src}
          alt="Photo slideshow"
          style={{ ...imgStyle, opacity: fading ? 1 : 0 }}
        />
      )}
    </div>
  );
}
