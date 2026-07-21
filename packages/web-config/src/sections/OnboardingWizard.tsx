import { useState, useEffect } from 'react';
import type { Settings } from '@smart-display/shared';
import { addCalendar, verifyPin, patchSettings } from '../api.js';
import { LAYOUT_PRESETS } from '../data/layoutPresets.js';

const PRESET_COLORS = ['#4a90e2', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
const COLOR_NAMES: Record<string, string> = {
  '#4a90e2': 'Blue', '#e74c3c': 'Red', '#2ecc71': 'Green',
  '#f39c12': 'Orange', '#9b59b6': 'Purple', '#1abc9c': 'Teal',
};

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Helsinki',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
];

interface Props {
  settings: Settings;
  save: (patch: Partial<Settings>) => Promise<void>;
}

export function OnboardingWizard({ settings, save }: Props) {
  const [wifiMode, setWifiMode] = useState<'ap' | 'client' | 'unknown' | null>(null);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [wifiConnecting, setWifiConnecting] = useState(false);
  const [wifiConnected, setWifiConnected] = useState(false);
  const [step, setStep] = useState(1);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [householdName, setHouseholdName] = useState(settings.householdName);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [calName, setCalName] = useState('');
  const [calUrl, setCalUrl] = useState('');
  const [calColor, setCalColor] = useState(PRESET_COLORS[0] ?? '#4a90e2');
  const [saving, setSaving] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [presetApplying, setPresetApplying] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/wifi/status')
      .then((r) => r.json() as Promise<{ mode: 'ap' | 'client' | 'unknown'; managed: boolean }>)
      .then((s) => {
        setWifiMode(s.mode);
        if (s.mode === 'ap') setStep(0);
      })
      .catch(() => setWifiMode('unknown'));
  }, []);

  async function handleWifiConnect() {
    if (!wifiSsid.trim()) return;
    setWifiConnecting(true);
    setWifiError(null);
    try {
      const res = await fetch('/api/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: wifiSsid.trim(), password: wifiPassword }),
      });
      if (!res.ok) {
        // A real HTTP error response only ever happens for validation failures (bad SSID/
        // password format) — those are reported before the device touches its radio, so this
        // response reliably arrives. Genuine join failures (wrong password, weak signal) are
        // detected later, asynchronously, after the AP has already dropped — there is no
        // synchronous signal for those; see the catch block below.
        const body = await res.json() as { error?: string };
        setWifiError(body.error ?? 'Could not connect to WiFi. Check the network name and password.');
        return;
      }
      setWifiConnected(true);
    } catch {
      // The device only has one WiFi radio: the instant it starts actually joining your
      // network, it drops the setup AP your phone is connected through — so this request
      // failing to complete is the *expected* outcome of a successful attempt, not evidence
      // of a wrong password. We can't tell success from failure from here; show the
      // reconnect prompt either way and let the PIN step (once you're back on the device's
      // real network) be the actual confirmation.
      setWifiConnected(true);
    } finally {
      setWifiConnecting(false);
    }
  }

  async function handlePinVerify() {
    if (!pin.trim()) return;
    setPinVerifying(true);
    setPinError(null);
    try {
      const result = await verifyPin(pin.trim());
      if (result.ok) {
        // verifyPin stores the returned session token automatically
        setStep(3);
      } else {
        setPinError('Incorrect PIN. Check the display and try again.');
      }
    } catch {
      setPinError('Could not verify PIN. Make sure you are connected to the device.');
    } finally {
      setPinVerifying(false);
    }
  }

  async function handleSetup() {
    setSaving(true);
    await save({ householdName: householdName.trim() || settings.householdName, timezone });
    setSaving(false);
    setStep(4);
  }

  async function handleTouchscreen(enabled: boolean) {
    setSaving(true);
    await save({ touchscreenEnabled: enabled });
    setSaving(false);
    setStep(5);
  }

  async function handleCalendar() {
    if (!calName.trim() || !calUrl.trim()) { setStep(6); return; }
    setSaving(true);
    setCalError(null);
    try {
      await addCalendar(calName.trim(), calUrl.trim(), calColor);
      setStep(6);
    } catch {
      setCalError('Could not connect calendar. Check the URL and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyPreset(presetId: string) {
    const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setPresetApplying(presetId);
    try {
      await patchSettings({
        activeTemplateId: preset.patch.activeTemplateId,
        layoutConfig: { ...settings.layoutConfig, ...preset.patch.layoutConfig },
      });
    } catch {
      // non-fatal — user can adjust in Layout section
    } finally {
      setPresetApplying(null);
      setStep(7);
    }
  }

  async function handleComplete() {
    setSaving(true);
    await save({ onboardingComplete: true });
    setSaving(false);
  }

  const steps = wifiMode === 'ap' ? [0, 1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7];
  const stepIndex = steps.indexOf(step);
  const totalSteps = steps.length;
  const canGoBack = step > 1 && step < 7;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-800 p-8 space-y-6">
        {/* Progress dots + step counter */}
        <div className="space-y-2">
          <div
            className="flex justify-center gap-2"
            role="list"
            aria-label="Setup progress"
          >
            {steps.map((s, i) => (
              <div
                key={s}
                role="listitem"
                aria-label={`Step ${i + 1}${s === step ? ' (current)' : s < step ? ' (complete)' : ''}`}
                className={`h-2 w-2 rounded-full transition-colors ${s <= step ? 'bg-blue-500' : 'bg-slate-700'}`}
              />
            ))}
          </div>
          <p className="text-center text-xs text-slate-500">
            {['Connect to WiFi','Welcome','Enter your PIN','Your household','Display type','Add a calendar','Choose a layout','Done'][step] ?? `Step ${stepIndex + 1}`}
            {' '}· Step {stepIndex + 1} of {totalSteps}
          </p>
        </div>

        {step === 0 && !wifiConnected && (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Connect to WiFi</h2>
              <p className="text-slate-400 text-sm">
                Enter your home WiFi network details. The display will connect and restart.
              </p>
              <p className="text-amber-400 text-xs mt-2 p-2 rounded bg-amber-950 border border-amber-800">
                Your phone will briefly disconnect from this network. Reconnect to your home WiFi and visit <strong>smartdisplay.local</strong> to continue.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="wifi-ssid" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  WiFi network name
                </label>
                <input
                  id="wifi-ssid"
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  placeholder="My Home WiFi"
                  autoComplete="username"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="wifi-password" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Password
                </label>
                <input
                  id="wifi-password"
                  type="password"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {wifiError && <p className="text-xs text-red-400">{wifiError}</p>}
            </div>
            <button
              type="button"
              onClick={() => void handleWifiConnect()}
              disabled={wifiConnecting || !wifiSsid.trim()}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors"
            >
              {wifiConnecting ? 'Connecting…' : 'Connect'}
            </button>
          </>
        )}

        {step === 0 && wifiConnected && (
          <>
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-100">Almost there!</h2>
              <p className="text-slate-400 text-sm">
                Your display is switching to <strong>{wifiSsid.trim() || 'your'}</strong> network now. This
                page can&apos;t follow it there — this exact browser tab won&apos;t work anymore, even if you
                tap a button below, because it&apos;s still talking to the setup WiFi that just turned off.
              </p>
              <p className="text-amber-400 text-xs mt-2 p-2 rounded bg-amber-950 border border-amber-800">
                Look at your display screen. It will show a new QR code — scan it with your phone&apos;s
                camera to open the next step. (Make sure your phone has left the &quot;SmartDisplay-Setup&quot;
                WiFi network first — most phones do this automatically once it disappears.)
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setWifiConnected(false); setWifiError(null); }}
              className="w-full text-xs text-slate-500 hover:text-slate-400 transition-colors"
            >
              Didn&apos;t work? Tap here to try a different network
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-100">Welcome to Smart Display</h1>
              <p className="text-slate-400 text-sm">
                A glanceable dashboard for your home. Let's get you set up in a minute.
              </p>
            </div>
            <ol className="space-y-1.5 text-sm text-slate-400">
              <li className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-300">1</span> Enter the PIN shown on your screen</li>
              <li className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-300">2</span> Name your household &amp; set timezone</li>
              <li className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-300">3</span> Tell us if you have a touchscreen</li>
              <li className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-300">4</span> Add your first calendar (optional)</li>
              <li className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-300">5</span> Pick a starting layout</li>
            </ol>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition-colors"
            >
              Get Started
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Enter your display PIN</h2>
              <p className="text-slate-400 text-sm">
                Look at your display screen — an 8-character PIN is shown in the bottom-right corner.
                Enter it below to pair this device.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="device-pin" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                PIN
              </label>
              <input
                id="device-pin"
                type="text"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.toUpperCase())}
                placeholder="A2B3C4D5"
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg"
              />
            </div>
            {pinError && <p className="text-xs text-red-400">{pinError}</p>}
            <div className="flex items-center gap-3">
              {canGoBack && <button type="button" aria-label="Go back" onClick={() => setStep((s) => s - 1)} className="px-3 py-2 min-h-[44px] flex items-center text-sm text-slate-400 hover:text-slate-200">&#x2190; Back</button>}
              <button
                type="button"
                onClick={() => void handlePinVerify()}
                disabled={pinVerifying || pin.length !== 8}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors"
              >
                {pinVerifying ? 'Verifying…' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Your household</h2>
              <p className="text-slate-400 text-sm">What should we call this display?</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="household-name" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Household name
                </label>
                <input
                  id="household-name"
                  type="text"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="The Smiths"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="household-timezone" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Timezone
                </label>
                <select
                  id="household-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {canGoBack && <button type="button" aria-label="Go back" onClick={() => setStep((s) => s - 1)} className="px-3 py-2 min-h-[44px] flex items-center text-sm text-slate-400 hover:text-slate-200">&#x2190; Back</button>}
              <button
                type="button"
                onClick={() => void handleSetup()}
                disabled={saving}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors"
              >
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Display type</h2>
              <p className="text-slate-400 text-sm">Is your display a touchscreen?</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleTouchscreen(false)}
                className="text-left rounded-lg border border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800 p-4 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-slate-100">No, regular monitor</span>
                </div>
                <p className="text-xs text-slate-400">Standard TV or monitor — display only, no touch input.</p>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleTouchscreen(true)}
                className="text-left rounded-lg border border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800 p-4 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-slate-100">Yes, touchscreen</span>
                </div>
                <p className="text-xs text-slate-400">Enables tap-to-toggle for Home Assistant controls.</p>
              </button>
            </div>
            <div className="flex items-center gap-3">
              {canGoBack && <button type="button" aria-label="Go back" onClick={() => setStep((s) => s - 1)} className="px-3 py-2 min-h-[44px] flex items-center text-sm text-slate-400 hover:text-slate-200">&#x2190; Back</button>}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Add a calendar</h2>
              <p className="text-slate-400 text-sm">
                Paste a calendar link from Google, iCloud, or Outlook to show your events on the display.
                You can skip this and add calendars later.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="cal-name" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Calendar name
                </label>
                <input
                  id="cal-name"
                  type="text"
                  value={calName}
                  onChange={(e) => setCalName(e.target.value)}
                  placeholder="Family Calendar"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cal-url" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Calendar link
                </label>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <p><strong className="text-slate-400">Google:</strong> Open Google Calendar → Settings → choose a calendar → scroll to "Secret address in iCal format" → copy the link.</p>
                  <p><strong className="text-slate-400">Apple iCloud:</strong> Open Calendar → right-click a calendar → Share → Copy Link.</p>
                  <p><strong className="text-slate-400">Outlook:</strong> Calendar settings → Shared calendars → Publish → copy the ICS link.</p>
                </div>
                <input
                  id="cal-url"
                  type="url"
                  value={calUrl}
                  onChange={(e) => setCalUrl(e.target.value)}
                  placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Color
                </label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCalColor(c)}
                      className={`h-9 w-9 rounded-full border-2 transition-all ${calColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ background: c }}
                      aria-label={COLOR_NAMES[c] ?? c}
                    />
                  ))}
                </div>
              </div>
              {calError && <p className="text-xs text-red-400">{calError}</p>}
            </div>
            <div className="flex items-center gap-3">
              {canGoBack && <button type="button" aria-label="Go back" onClick={() => setStep((s) => s - 1)} className="px-3 py-2 min-h-[44px] flex items-center text-sm text-slate-400 hover:text-slate-200">&#x2190; Back</button>}
              <button
                type="button"
                onClick={() => setStep(6)}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => void handleCalendar()}
                disabled={saving || !calName.trim() || !calUrl.trim()}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors"
              >
                {saving ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Choose a starting layout</h2>
              <p className="text-slate-400 text-sm">
                Pick one of these curated layouts as your starting point. Everything can be tweaked later.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {LAYOUT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={presetApplying !== null}
                  onClick={() => void handleApplyPreset(preset.id)}
                  className="text-left rounded-lg border border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800 p-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-700">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d={preset.icon} />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-slate-100">
                      {presetApplying === preset.id ? 'Applying…' : preset.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">{preset.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {preset.capabilities.map((cap) => (
                      <span key={cap} className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{cap}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {canGoBack && <button type="button" aria-label="Go back" onClick={() => setStep((s) => s - 1)} className="px-3 py-2 min-h-[44px] flex items-center text-sm text-slate-400 hover:text-slate-200">&#x2190; Back</button>}
              <button
                type="button"
                onClick={() => setStep(7)}
                disabled={presetApplying !== null}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-50 transition-colors"
              >
                Skip for now
              </button>
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12l3 3 5-5" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-100">You're all set!</h2>
              <p className="text-slate-400 text-sm">
                Your display is configured. You can always adjust settings from the sidebar.
              </p>
              <p className="text-slate-500 text-sm">
                Visit <strong className="text-slate-400">smartdisplay.local</strong> from any browser on your network to come back here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleComplete()}
              disabled={saving}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors"
            >
              {saving ? 'Opening…' : 'Open Dashboard'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
