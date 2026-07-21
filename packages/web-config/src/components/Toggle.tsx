interface ToggleProps {
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Toggle({ enabled, onChange, disabled, label }: ToggleProps) {
  return (
    <div className="flex items-center min-h-[44px]">
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled ? 'bg-blue-500' : 'bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
    </div>
  );
}
