import { useEffect, useRef, useState } from 'react';

export function PreviewSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? el.clientWidth;
      setScale(w / 1920);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">Live Preview</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          A live view of your display. Changes to settings appear instantly.
        </p>
      </div>

      {/* Mobile fallback: no iframe on small screens */}
      <div className="md:hidden rounded-xl border border-slate-700 bg-slate-900 p-6 text-center space-y-3">
        <div className="flex justify-center">
          <svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
            <rect x="1" y="4" width="18" height="13" rx="2"/>
            <path d="M7 17h6M10 17v0"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-200">Your display is live at</p>
        <a href={`${window.location.origin}/display`} target="_blank" rel="noreferrer" className="text-base font-mono text-blue-400 hover:underline">{window.location.host}/display</a>
        <p className="text-xs text-slate-500">
          Changes appear on the display instantly. Open that address on any device on your network to see a preview.
        </p>
      </div>

      {/* Desktop: scaled iframe */}
      <div
        ref={containerRef}
        className="hidden md:block w-full rounded-xl overflow-hidden border border-slate-700 bg-black"
        style={{ height: `${1080 * scale}px` }}
      >
        <iframe
          src="/display/"
          title="Display preview"
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: '1920px',
            height: '1080px',
            border: 'none',
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            display: 'block',
          }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500 text-center hidden md:block">
        Live — updates automatically when you change settings.
      </p>
    </div>
  );
}
