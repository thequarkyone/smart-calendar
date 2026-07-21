interface Props {
  label: string;
  description?: string;
}

export function PlaceholderSection({ label, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 text-center p-8">
      <h2 className="text-xl font-semibold text-slate-300 mb-2">{label}</h2>
      <p className="text-sm text-slate-500">
        {description ?? 'Coming in a future phase.'}
      </p>
    </div>
  );
}
