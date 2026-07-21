import { useState, useEffect, useCallback } from 'react';
import type { CalendarSourcePublic, CreateLocalEventBody, EventSymbolRule, LocalEvent } from '@smart-display/shared';
import { getCalendars, addCalendar, patchCalendar, deleteCalendar, syncCalendar, startGoogleOAuth, listGoogleCalendars, addGoogleCalendar, patchSettings, getLocalEvents, createLocalEvent, updateLocalEvent, deleteLocalEvent, getLocalCalendarColor, patchLocalCalendarColor } from '../api.js';
import { useSettings } from '../hooks/useSettings.js';
import { WidgetsLink } from '../components/WidgetsLink.js';
import { useNavigate } from '../NavigationContext.js';

const PRESET_COLORS = [
  '#4a90e2', '#e74c3c', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
];

const COLOR_NAMES: Record<string, string> = {
  '#4a90e2': 'Blue',
  '#e74c3c': 'Red',
  '#2ecc71': 'Green',
  '#f39c12': 'Orange',
  '#9b59b6': 'Purple',
  '#1abc9c': 'Teal',
  '#e67e22': 'Coral',
  '#e91e63': 'Pink',
};

interface GoogleCal {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_SYMBOL_RULES: EventSymbolRule[] = [
  { keyword: 'birthday', symbol: '🎂' },
  { keyword: 'anniversary', symbol: '💍' },
  { keyword: 'wedding', symbol: '💒' },
  { keyword: 'graduation', symbol: '🎓' },
  { keyword: 'christmas', symbol: '🎄' },
  { keyword: 'thanksgiving', symbol: '🦃' },
  { keyword: 'halloween', symbol: '🎃' },
  { keyword: 'easter', symbol: '🐣' },
  { keyword: 'new year', symbol: '🥂' },
  { keyword: 'soccer', symbol: '⚽' },
  { keyword: 'football', symbol: '🏈' },
  { keyword: 'basketball', symbol: '🏀' },
  { keyword: 'baseball', symbol: '⚾' },
  { keyword: 'tennis', symbol: '🎾' },
  { keyword: 'golf', symbol: '⛳' },
  { keyword: 'swim', symbol: '🏊' },
  { keyword: 'gym', symbol: '💪' },
  { keyword: 'workout', symbol: '🏋️' },
  { keyword: 'yoga', symbol: '🧘' },
  { keyword: 'run', symbol: '🏃' },
  { keyword: 'hike', symbol: '🥾' },
  { keyword: 'doctor', symbol: '🩺' },
  { keyword: 'dentist', symbol: '🦷' },
  { keyword: 'hospital', symbol: '🏥' },
  { keyword: 'school', symbol: '🏫' },
  { keyword: 'class', symbol: '📚' },
  { keyword: 'meeting', symbol: '📅' },
  { keyword: 'interview', symbol: '💼' },
  { keyword: 'flight', symbol: '✈️' },
  { keyword: 'vacation', symbol: '🌴' },
  { keyword: 'trip', symbol: '🧳' },
  { keyword: 'concert', symbol: '🎵' },
  { keyword: 'movie', symbol: '🎬' },
  { keyword: 'dinner', symbol: '🍽️' },
  { keyword: 'date', symbol: '💕' },
  { keyword: 'party', symbol: '🎉' },
  { keyword: 'game', symbol: '🎮' },
];

const QUICK_SYMBOLS = [
  '🎂','💍','💒','🎓','🎄','🦃','🎃','🐣','🥂','⚽','🏈','🏀','⚾','🎾','⛳',
  '🏊','💪','🏋️','🧘','🏃','🥾','🩺','🦷','🏥','🏫','📚','📅','💼','✈️','🌴',
  '🧳','🎵','🎬','🍽️','💕','🎉','🎮','⭐','🔔','📌',
];

interface EventSymbolsPanelProps {
  rules: EventSymbolRule[];
  onSave: (rules: EventSymbolRule[]) => Promise<void>;
}

function EventSymbolsPanel({ rules, onSave }: EventSymbolsPanelProps) {
  const [open, setOpen] = useState(false);
  const [localRules, setLocalRules] = useState<EventSymbolRule[]>(rules);
  const [keyword, setKeyword] = useState('');
  const [symbol, setSymbol] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync if parent rules change (e.g. settings loaded after mount)
  useEffect(() => { setLocalRules(rules); }, [rules]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const kw = keyword.trim();
    const sym = symbol.trim();
    if (!kw || !sym) return;
    setLocalRules((prev) => [...prev, { keyword: kw, symbol: sym }]);
    setKeyword('');
    setSymbol('');
  }

  function handleRemove(index: number) {
    setLocalRules((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(localRules);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg bg-slate-800 border border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-200 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-base" aria-hidden="true">✨</span>
          Event symbols
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-700">
          <p className="pt-3 text-xs text-slate-400">
            Automatically add an emoji to events whose title contains a matching word.
            For example, "birthday" → 🎂 will turn "Dad&apos;s Birthday" into "🎂 Dad&apos;s Birthday" on the display.
          </p>

          {/* Rule list */}
          {localRules.length > 0 ? (
            <ul className="space-y-1.5">
              {localRules.map((rule, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-900">
                  <span className="text-lg w-7 text-center flex-shrink-0">{rule.symbol}</span>
                  <span className="flex-1 text-sm text-slate-200 truncate">{rule.keyword}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Remove rule for ${rule.keyword}`}
                  >×</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 italic">No rules yet — add one below or load the built-in defaults.</p>
          )}

          {/* Add rule form */}
          <form onSubmit={handleAdd} className="space-y-3 pt-1">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-slate-400 font-medium">Keyword</label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g. soccer"
                  className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="w-24 space-y-1">
                <label className="text-xs text-slate-400 font-medium">Symbol</label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="⚽"
                  className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-center text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {/* Quick-pick emoji grid */}
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Quick pick:</p>
              <div className="flex flex-wrap gap-1">
                {QUICK_SYMBOLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSymbol(s)}
                    className={`w-9 h-9 text-lg rounded-md transition-colors ${
                      symbol === s
                        ? 'bg-blue-600 ring-2 ring-blue-400'
                        : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                    aria-label={s}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!keyword.trim() || !symbol.trim()}
              className="px-3 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-medium text-white transition-colors"
            >
              Add rule
            </button>
          </form>

          {/* Save / defaults */}
          <div className="pt-1 border-t border-slate-700 flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => { void handleSave(); }}
              disabled={saving}
              className="px-4 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white transition-colors"
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => setLocalRules(DEFAULT_SYMBOL_RULES)}
              className="px-3 py-2.5 min-h-[44px] rounded-md bg-slate-700 hover:bg-slate-600 text-sm font-medium text-slate-300 transition-colors"
            >
              Load defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const COLOR_NAMES_LOCAL: Record<string, string> = {
  '#4a90e2': 'Blue', '#e74c3c': 'Red', '#2ecc71': 'Green', '#f39c12': 'Orange',
  '#9b59b6': 'Purple', '#1abc9c': 'Teal', '#e67e22': 'Coral', '#e91e63': 'Pink',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toLocalDatetimeInput(iso: string): string {
  if (iso.length === 10) return iso;
  try { return new Date(iso).toISOString().slice(0, 16); } catch { return iso.slice(0, 16); }
}

function fromDatetimeInput(val: string, allDay: boolean): string {
  if (allDay) return val.slice(0, 10);
  return new Date(val).toISOString();
}

interface EventFormState {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
}

function blankForm(): EventFormState {
  return { title: '', date: todayIso(), startTime: '09:00', endTime: '10:00', allDay: false, location: '' };
}

function eventToForm(ev: LocalEvent): EventFormState {
  const allDay = ev.allDay;
  const startIso = toLocalDatetimeInput(ev.start);
  const endIso = toLocalDatetimeInput(ev.end);
  return {
    title: ev.title,
    date: startIso.slice(0, 10),
    startTime: allDay ? '09:00' : startIso.slice(11, 16),
    endTime: allDay ? '10:00' : endIso.slice(11, 16),
    allDay,
    location: ev.location ?? '',
  };
}

function formToBody(f: EventFormState): CreateLocalEventBody {
  return {
    title: f.title,
    start: fromDatetimeInput(f.allDay ? f.date : `${f.date}T${f.startTime}`, f.allDay),
    end: fromDatetimeInput(f.allDay ? f.date : `${f.date}T${f.endTime}`, f.allDay),
    allDay: f.allDay,
    location: f.location.trim() || undefined,
  };
}

function MyEventsPanel() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [color, setColor] = useState('#4a90e2');
  const [loadingColor, setLoadingColor] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventFormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try { setEvents(await getLocalEvents()); } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadEvents();
    getLocalCalendarColor()
      .then((r) => setColor(r.color))
      .catch(() => {})
      .finally(() => setLoadingColor(false));
  }, [open, loadEvents]);

  function openAdd() {
    setEditingId(null);
    setForm(blankForm());
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(ev: LocalEvent) {
    setEditingId(ev.id);
    setForm(eventToForm(ev));
    setFormError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      const body = formToBody(form);
      if (editingId) {
        const updated = await updateLocalEvent(editingId, body);
        setEvents((prev) => prev.map((ev) => ev.id === editingId ? updated : ev));
      } else {
        const created = await createLocalEvent(body);
        setEvents((prev) => [...prev, created].sort((a, b) => a.start.localeCompare(b.start)));
      }
      cancelForm();
    } catch {
      setFormError('Could not save. Check the times and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    try {
      await deleteLocalEvent(id);
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
    } catch { /* non-fatal */ }
  }

  async function handleColorChange(c: string) {
    setColor(c);
    try { await patchLocalCalendarColor(c); } catch { /* non-fatal */ }
  }

  function formatEventDate(ev: LocalEvent): string {
    try {
      const d = new Date(ev.start);
      if (ev.allDay) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return ev.start; }
  }

  return (
    <div className="mt-4 rounded-lg bg-slate-800 border border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-200 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: color }}
            aria-hidden="true"
          />
          My Events
          {events.length > 0 && (
            <span className="text-xs font-normal text-slate-500">{events.length}</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-700">
          {/* Color row */}
          {!loadingColor && (
            <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-700">
              <span className="text-xs text-slate-400 font-medium">Color</span>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { void handleColorChange(c); }}
                    style={{ background: c }}
                    aria-label={COLOR_NAMES_LOCAL[c] ?? c}
                    className={`w-9 h-9 rounded-full transition-transform ${color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800 scale-110' : ''}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Event list */}
          <div className="px-4 py-3 space-y-1.5">
            {events.length === 0 && !showForm && (
              <p className="text-xs text-slate-500 italic py-1">No events yet. Add one to get started.</p>
            )}
            {events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-900"
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 truncate">{ev.title}</p>
                  <p className="text-xs text-slate-500">{formatEventDate(ev)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(ev)}
                  className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 min-h-[44px] transition-colors"
                >
                  Edit
                </button>
                {confirmDeleteId === ev.id ? (
                  <>
                    <button type="button" onClick={() => { void handleDelete(ev.id); }}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 min-h-[44px]">Confirm</button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 min-h-[44px]">Cancel</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteId(ev.id)}
                    className="text-slate-500 hover:text-red-400 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                    aria-label={`Delete ${ev.title}`}>×</button>
                )}
              </div>
            ))}
          </div>

          {/* Add / Edit form */}
          {showForm ? (
            <form onSubmit={(e) => { void handleSave(e); }} className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-3">
              <h3 className="text-sm font-semibold text-slate-200">
                {editingId ? 'Edit event' : 'New event'}
              </h3>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Soccer practice"
                  required
                  className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allDay"
                  checked={form.allDay}
                  onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="allDay" className="text-sm text-slate-300">All day</label>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {!form.allDay && (
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Start time</label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                      required
                      className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-slate-400 font-medium">End time</label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                      required
                      className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Location <span className="text-slate-600">(optional)</span></label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="123 Main St"
                  className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {formError && <p className="text-xs text-red-400">{formError}</p>}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="px-3 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white transition-colors">
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add event'}
                </button>
                <button type="button" onClick={cancelForm}
                  className="px-3 py-2.5 min-h-[44px] rounded-md bg-slate-700 hover:bg-slate-600 text-sm font-medium text-slate-200 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="px-4 pb-4">
              <button type="button" onClick={openAdd}
                className="px-3 py-2 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors">
                + Add event
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type WalkthroughProvider = 'google' | 'apple' | 'outlook';

const WALKTHROUGH: Record<WalkthroughProvider, { label: string; steps: string[] }> = {
  google: {
    label: 'Google Calendar',
    steps: [
      'Open Google Calendar on your computer at calendar.google.com.',
      'Click the ⚙️ gear icon (top right) and choose "Settings".',
      'In the left sidebar, click the name of the calendar you want to share.',
      'Scroll down to "Integrate calendar" and find "Secret address in iCal format".',
      'Click the copy icon next to that link, then paste it in the field below.',
    ],
  },
  apple: {
    label: 'Apple Calendar',
    steps: [
      'Open the Calendar app on your Mac.',
      'Right-click (or Control-click) the calendar name in the left sidebar.',
      'Choose "Share Calendar…" and tick "Public Calendar".',
      'Click the link that appears to copy it, then paste it in the field below.',
      'Note: on iPhone/iPad, you\'ll need to do this on a Mac or at icloud.com.',
    ],
  },
  outlook: {
    label: 'Outlook / Office 365',
    steps: [
      'Open Outlook on the web (outlook.live.com or your Office 365 address).',
      'Click the calendar icon in the left toolbar, then click the three-dot "…" menu next to your calendar.',
      'Choose "Sharing and permissions".',
      'Under "Publish a calendar", set the access level to "Can view all details" and click "Publish".',
      'Copy the ICS link that appears, then paste it in the field below.',
    ],
  },
};

function CalendarWalkthrough() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<WalkthroughProvider>('google');
  const current = WALKTHROUGH[provider];

  return (
    <div className="rounded-md bg-slate-900 border border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          How do I get a calendar link?
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-700">
          <div className="flex gap-1.5 pt-3 flex-wrap">
            {(Object.keys(WALKTHROUGH) as WalkthroughProvider[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  provider === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {WALKTHROUGH[p].label}
              </button>
            ))}
          </div>
          <ol className="space-y-2">
            {current.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-slate-300 leading-relaxed">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-700 text-white text-[10px] flex items-center justify-center font-bold mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-500">
            The link you copy is private — only people who have it can see your calendar events.
          </p>
        </div>
      )}
    </div>
  );
}

export function CalendarSection() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [sources, setSources] = useState<CalendarSourcePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formColor, setFormColor] = useState(PRESET_COLORS[0] ?? '#4a90e2');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Google OAuth state
  const [oauthStatus, setOauthStatus] = useState<string | null>(null);
  const [showGooglePicker, setShowGooglePicker] = useState(false);
  const [googleCals, setGoogleCals] = useState<GoogleCal[]>([]);
  const [googlePickerLoading, setGooglePickerLoading] = useState(false);
  const [googlePickerError, setGooglePickerError] = useState<string | null>(null);
  const [addingGoogleId, setAddingGoogleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setSources(await getCalendars());
      setError(null);
    } catch {
      setError('Failed to load calendars');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Check for OAuth callback result on mount (Google redirects back with #google-oauth=...)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('google-oauth=success')) {
      window.location.hash = '';
      setOauthStatus('success');
      void openGooglePicker();
    } else if (hash.includes('google-oauth=error')) {
      window.location.hash = '';
      setOauthStatus('error');
    }
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formUrl.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const source = await addCalendar(formName.trim(), formUrl.trim(), formColor);
      setSources((prev) => [...prev, source]);
      setShowForm(false);
      setFormName('');
      setFormUrl('');
      setFormColor(PRESET_COLORS[0] ?? '#4a90e2');
    } catch {
      setAddError('Failed to add calendar. Check the URL and try again.');
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const updated = await patchCalendar(id, enabled);
      setSources((prev) => prev.map((s) => s.id === id ? updated : s));
    } catch {
      // leave state unchanged on failure
    }
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    setSyncStatus((s) => ({ ...s, [id]: 'Syncing…' }));
    try {
      await syncCalendar(id);
      setSyncStatus((s) => ({ ...s, [id]: 'Synced' }));
      await load();
      setTimeout(() => setSyncStatus((s) => ({ ...s, [id]: '' })), 3000);
    } catch (e: unknown) {
      setSyncStatus((s) => ({ ...s, [id]: `error:${String(e)}` }));
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    setDeleteError(null);
    try {
      await deleteCalendar(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setDeleteError('Failed to remove calendar. Please try again.');
    }
  }

  async function handleConnectGoogle() {
    setOauthStatus(null);
    try {
      const { url } = await startGoogleOAuth();
      window.location.href = url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('credentials not configured')) {
        setOauthStatus('no-credentials');
      } else {
        setOauthStatus('error');
      }
    }
  }

  async function openGooglePicker() {
    setShowGooglePicker(true);
    setGooglePickerLoading(true);
    setGooglePickerError(null);
    try {
      const cals = await listGoogleCalendars();
      setGoogleCals(cals);
    } catch {
      setGooglePickerError('Failed to load your Google calendars.');
    } finally {
      setGooglePickerLoading(false);
    }
  }

  async function handleAddGoogleCal(cal: GoogleCal) {
    setAddingGoogleId(cal.id);
    try {
      const source = await addGoogleCalendar(cal.id, cal.name, cal.color);
      setSources((prev) => [...prev, source]);
      // Remove from picker list
      setGoogleCals((prev) => prev.filter((c) => c.id !== cal.id));
    } catch {
      setGooglePickerError(`Failed to add "${cal.name}".`);
    } finally {
      setAddingGoogleId(null);
    }
  }

  const hasGoogleCreds = Boolean(settings?.googleOAuthClientId);
  const existingGoogleIds = new Set(sources.filter((s) => s.provider === 'google').map((s) => s.id));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Calendars</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Subscribe to iCal feeds or connect Google Calendar.
          </p>
        </div>
        <div className="flex gap-2 mt-0 sm:mt-0">
          <button
            type="button"
            onClick={() => { void handleConnectGoogle(); }}
            className="px-3 py-2.5 min-h-[44px] rounded-md bg-slate-700 hover:bg-slate-600 text-sm font-medium text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Connect Google
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(true); setAddError(null); }}
            className="px-3 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
          >
            Add calendar link
          </button>
        </div>
      </div>

      {/* OAuth status messages */}
      {oauthStatus === 'success' && (
        <div className="mb-4 p-3 rounded-lg bg-green-950 border border-green-800 text-sm text-green-300">
          Connected to Google! Select the calendars below to add.
        </div>
      )}
      {oauthStatus === 'error' && (
        <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">
          Google sign-in failed. Please try again.
        </div>
      )}
      {oauthStatus === 'no-credentials' && (
        <div className="mb-4 p-3 rounded-lg bg-amber-950 border border-amber-800 text-sm text-amber-300">
          Set up your Google OAuth credentials in{' '}
          <button type="button" onClick={() => navigate('settings')} className="underline font-semibold hover:text-amber-200">
            Settings → Google Calendar
          </button>{' '}
          first, then try again.
        </div>
      )}

      {/* Google calendar picker */}
      {showGooglePicker && (
        <div className="mb-6 p-4 rounded-lg bg-slate-800 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">Your Google Calendars</h3>
            <button
              type="button"
              onClick={() => { setShowGooglePicker(false); setGoogleCals([]); }}
              className="text-slate-500 hover:text-slate-300 text-lg leading-none p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >×</button>
          </div>
          {googlePickerLoading && <p className="text-sm text-slate-400">Loading your calendars…</p>}
          {googlePickerError && <p className="text-sm text-red-400">{googlePickerError}</p>}
          {!googlePickerLoading && googleCals.length === 0 && !googlePickerError && (
            <p className="text-sm text-slate-500">No calendars found, or all already added.</p>
          )}
          <ul className="space-y-2">
            {googleCals
              .filter((c) => !existingGoogleIds.has(c.id))
              .map((cal) => (
                <li key={cal.id} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cal.color }} />
                  <span className="flex-1 text-sm text-slate-100 truncate">{cal.name}</span>
                  <button
                    type="button"
                    onClick={() => { void handleAddGoogleCal(cal); }}
                    disabled={addingGoogleId === cal.id}
                    className="px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
                  >
                    {addingGoogleId === cal.id ? 'Adding…' : 'Add'}
                  </button>
                </li>
              ))}
          </ul>
          {!hasGoogleCreds && (
            <p className="mt-2 text-xs text-amber-400">
              No Google credentials configured. Go to Settings to add them.
            </p>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Add calendar link form */}
      {showForm && (
        <form
          onSubmit={(e) => { void handleAdd(e); }}
          className="mb-6 p-4 rounded-lg bg-slate-800 border border-slate-700 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-200">Add calendar link</h3>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="My calendar"
              required
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Calendar link</label>
            <CalendarWalkthrough />
            <input
              type="url"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              required
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-xs text-slate-500">
              Both <code>https://</code> and <code>webcal://</code> links work. Your link is stored encrypted on your device.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFormColor(c)}
                  style={{ background: c }}
                  aria-label={COLOR_NAMES[c] ?? c}
                  className={`w-9 h-9 rounded-full transition-transform ${
                    formColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110' : ''
                  }`}
                />
              ))}
              <input
                type="color"
                value={formColor}
                onChange={(e) => setFormColor(e.target.value)}
                className="w-9 h-9 rounded-full cursor-pointer border-0 p-0 bg-transparent"
                title="Custom color"
                aria-label="Custom color"
              />
            </div>
          </div>

          {addError && <p className="text-xs text-red-400">{addError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={adding}
              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white transition-colors"
            >
              {adding ? 'Adding…' : 'Add calendar'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-sm font-medium text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Calendar list */}
      {deleteError && <p className="mb-4 text-sm text-red-400">{deleteError}</p>}

      {!loading && sources.length === 0 && !showForm && (
        <div className="py-8 text-slate-500">
          <div className="text-center mb-6">
            <p className="text-sm">No calendars yet.</p>
            <p className="text-xs mt-1">Connect Google Calendar or add a calendar link from Apple or Outlook.</p>
          </div>
          <div className="mb-6 max-w-md mx-auto">
            <CalendarWalkthrough />
          </div>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => { void handleConnectGoogle(); }}
              className="px-3 py-2.5 min-h-[44px] rounded-md bg-slate-700 hover:bg-slate-600 text-sm font-medium text-slate-200 transition-colors"
            >
              Connect Google
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(true); setAddError(null); }}
              className="px-3 py-2.5 min-h-[44px] rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
            >
              Add calendar link
            </button>
          </div>
        </div>
      )}

      <MyEventsPanel />

      <EventSymbolsPanel
        rules={settings?.eventSymbolRules ?? DEFAULT_SYMBOL_RULES}
        onSave={(rules) => patchSettings({ eventSymbolRules: rules }).then(() => {})}
      />

      <ul className="space-y-2 mt-4">
        {sources.map((src) => (
          <li
            key={src.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-slate-800 border border-slate-700"
          >
            {/* Color dot */}
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: src.color }}
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-100 truncate">{src.name}</p>
                {src.isBuiltin && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 flex-shrink-0">Built-in</span>
                )}
                {src.provider === 'google' && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 flex-shrink-0">Google</span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {src.lastSynced
                  ? `Last synced ${new Date(src.lastSynced).toLocaleString()}`
                  : 'Never synced'}
              </p>
              {syncStatus[src.id] && (() => {
                const status = syncStatus[src.id] ?? '';
                const isError = status.startsWith('error:');
                const rawMsg = isError ? status.slice(6) : status;
                const msg = isError
                  ? (src.isBuiltin
                    ? 'Could not refresh holiday calendar — last known data is shown. Check your internet connection.'
                    : 'Could not sync. Check your internet connection or the calendar link and try again.')
                  : rawMsg;
                return (
                  <p className={`text-xs mt-0.5 flex items-center gap-1 ${isError ? 'text-red-400' : 'text-blue-400'}`}>
                    {msg}
                    {isError && (
                      <button
                        type="button"
                        onClick={() => setSyncStatus((s) => ({ ...s, [src.id]: '' }))}
                        className="ml-1 text-red-500 hover:text-red-300 p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                        aria-label="Dismiss error"
                      >×</button>
                    )}
                  </p>
                );
              })()}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => { void handleToggle(src.id, !src.enabled); }}
                className={`px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium transition-colors ${
                  src.enabled
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-500'
                }`}
                aria-pressed={src.enabled}
              >
                {src.enabled ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => { void handleSync(src.id); }}
                disabled={syncingId === src.id || !src.enabled}
                className="px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 transition-colors"
              >
                {syncingId === src.id ? 'Syncing…' : 'Sync'}
              </button>
              {!src.isBuiltin && (confirmDeleteId === src.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => { void handleDelete(src.id); }}
                    className="px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium bg-red-700 hover:bg-red-600 text-white transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(src.id)}
                  className="px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium bg-slate-700 hover:bg-red-900 text-slate-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <WidgetsLink />
    </div>
  );
}
