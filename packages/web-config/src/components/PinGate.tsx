import { useState } from 'react';
import { verifyPin } from '../api.js';

interface Props {
  onSuccess: () => void;
}

export function PinGate({ onSuccess }: Props) {
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setVerifying(true);
    setError(null);
    try {
      const result = await verifyPin(pin.trim());
      if (result.ok) {
        onSuccess();
      } else {
        setError('Incorrect PIN. Check the display and try again.');
      }
    } catch {
      setError('Could not verify PIN. Make sure you are connected to the device.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-800 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-100">Session expired</h1>
          <p className="text-slate-400 text-sm">
            Enter your display PIN to sign back in. Check the QR code on the display screen if
            you don&apos;t remember it.
          </p>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <input
            type="text"
            autoComplete="one-time-code"
            maxLength={8}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.toUpperCase())}
            placeholder="A2B3C4D5"
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-3 text-center text-lg tracking-widest text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          <button
            type="submit"
            disabled={verifying || !pin.trim()}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors"
          >
            {verifying ? 'Verifying…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
