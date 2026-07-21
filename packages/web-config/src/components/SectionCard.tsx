export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      </div>
      <div className="p-4 space-y-5">{children}</div>
    </div>
  );
}
