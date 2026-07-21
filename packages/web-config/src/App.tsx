import { useState, useEffect, useRef, forwardRef } from 'react';
import { NavigationContext } from './NavigationContext.js';
import { useSettings } from './hooks/useSettings.js';
import { loadApiToken, setUnauthorizedHandler } from './api.js';
import { PinGate } from './components/PinGate.js';
import { OnboardingWizard } from './sections/OnboardingWizard.js';
import { SettingsSection } from './sections/SettingsSection.js';
import { TilesSection } from './sections/TilesSection.js';
import { CalendarSection } from './sections/CalendarSection.js';
import { WeatherSection } from './sections/WeatherSection.js';
import { PhotoSection } from './sections/PhotoSection.js';
import { TasksSection } from './sections/TasksSection.js';
import { FeedsSection } from './sections/FeedsSection.js';
import { HaSection } from './sections/HaSection.js';
import { SpotifySection } from './sections/SpotifySection.js';
import { PlaceholderSection } from './sections/PlaceholderSection.js';
import { LayoutSection } from './sections/LayoutSection.js';
import { ThemeSection } from './sections/ThemeSection.js';
import { PreviewSection } from './sections/PreviewSection.js';
import { SystemSection } from './sections/SystemSection.js';
import { SupportSection } from './sections/SupportSection.js';

type SectionId =
  | 'screens' | 'calendars' | 'weather' | 'photos' | 'feeds' | 'ha' | 'spotify'
  | 'schedules' | 'displays' | 'templates' | 'todo' | 'tiles' | 'settings'
  | 'theme' | 'support' | 'preview' | 'system';

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

// Inline SVG icons (20×20 viewBox, stroke-based). aria-hidden — text labels in NavButton serve as accessible names.
const Icons = {
  eye: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/></svg>,
  calendar: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="14" rx="2"/><path d="M2 8h16M7 2v4M13 2v4"/></svg>,
  cloud: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 14H6a4 4 0 1 1 .5-7.97A5 5 0 1 1 16 14z"/></svg>,
  photo: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="13" rx="2"/><circle cx="7" cy="9" r="1.5"/><path d="M2 15l4-4 3 3 3-3 6 5"/></svg>,
  rss: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5a12 12 0 0 1 12 12M3 11a6 6 0 0 1 6 6"/><circle cx="3" cy="17" r="1.5" fill="currentColor"/></svg>,
  tasks: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h8M8 10h8M8 14h5"/><path d="M4 6l.01 0M4 10l.01 0M4 14l.01 0" strokeWidth="2" strokeLinecap="round"/></svg>,
  home: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M8 18v-6h4v6"/></svg>,
  layout: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M2 7h16M7 7v11"/></svg>,
  palette: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><circle cx="7" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="13" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="13" r="1.2" fill="currentColor" stroke="none"/></svg>,
  widgets: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>,
  settings: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/></svg>,
  info: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 7v.01"/></svg>,
  help: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><path d="M7.5 7.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2.5-2.5 4M10 15.5v.01"/></svg>,
};

const NAV_ITEMS: NavItem[] = [
  { id: 'calendars', label: 'Calendars',       icon: Icons.calendar },
  { id: 'weather',   label: 'Weather',          icon: Icons.cloud },
  { id: 'photos',    label: 'Photos',           icon: Icons.photo },
  { id: 'feeds',     label: 'News Feeds',       icon: Icons.rss },
  { id: 'ha',        label: 'Home Assistant',   icon: Icons.home },
  { id: 'spotify',   label: 'Spotify',          icon: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg> },
  { id: 'todo',      label: 'Tasks',            icon: Icons.tasks },
];

const DISPLAY_NAV_ITEMS: NavItem[] = [
  { id: 'tiles',     label: 'Widgets',          icon: Icons.widgets },
  { id: 'templates', label: 'Layout',           icon: Icons.layout },
  { id: 'theme',     label: 'Appearance',       icon: Icons.palette },
  { id: 'preview',   label: 'Preview',          icon: Icons.eye },
];

const SYSTEM_NAV_ITEMS: NavItem[] = [
  { id: 'settings',  label: 'Settings',         icon: Icons.settings },
  { id: 'system',    label: 'About & Updates',  icon: Icons.info },
  { id: 'support',   label: 'Support',          icon: Icons.help },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [...DISPLAY_NAV_ITEMS, ...SYSTEM_NAV_ITEMS];

const ALL_NAV = [...NAV_ITEMS, ...BOTTOM_NAV_ITEMS];

function renderSection(id: SectionId) {
  switch (id) {
    case 'settings':   return <SettingsSection />;
    case 'preview':    return <PreviewSection />;
    case 'tiles':      return <TilesSection />;
    case 'calendars':  return <CalendarSection />;
    case 'weather':    return <WeatherSection />;
    case 'photos':     return <PhotoSection />;
    case 'feeds':      return <FeedsSection />;
    case 'ha':         return <HaSection />;
    case 'spotify':    return <SpotifySection />;
    case 'todo':       return <TasksSection />;
    case 'screens':    return <PlaceholderSection label="Screens" description="Manage your display screens. Coming in Phase 2." />;
    case 'schedules':  return <PlaceholderSection label="Schedules" description="Set up display schedules. Coming in Phase 2." />;
    case 'displays':   return <PlaceholderSection label="Displays & Devices" description="Manage connected devices. Coming in Phase 3." />;
    case 'templates':  return <LayoutSection />;
    case 'theme':      return <ThemeSection />;
    case 'system':     return <SystemSection />;
    case 'support':    return <SupportSection />;
  }
}

const NavButton = forwardRef<HTMLButtonElement, { item: NavItem; active: boolean; onClick: () => void }>(
function NavButton({ item, active, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-r-md text-sm transition-colors border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
        active
          ? 'border-blue-500 bg-slate-800 text-slate-100 font-medium'
          : 'border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-slate-200'
      }`}
    >
      <span className={active ? 'text-blue-400' : 'text-slate-500'}>{item.icon}</span>
      {item.label}
    </button>
  );
});

const SECTION_STORAGE_KEY = 'sd-active-section';

function getInitialSection(): SectionId {
  const stored = localStorage.getItem(SECTION_STORAGE_KEY) as SectionId | null;
  const valid: SectionId[] = ['screens','calendars','weather','photos','feeds','ha','spotify','schedules','displays','templates','todo','tiles','settings','theme','support','preview','system'];
  return (stored && valid.includes(stored)) ? stored : 'preview';
}

export function App() {
  const [activeSection, setActiveSection] = useState<SectionId>(getInitialSection);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { settings, loading: settingsLoading, save } = useSettings();
  const firstNavButtonRef = useRef<HTMLButtonElement>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => { loadApiToken(); }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setNeedsAuth(true));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    firstNavButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // Must come after every hook above — an early return before all hooks are declared changes
  // the hook count/order between renders (fewer hooks on the needsAuth=true path), which React
  // treats as a Rules-of-Hooks violation and crashes the whole tree with no error boundary,
  // producing a silent blank page. Caught live: a 401 from a stale session triggered this
  // exact crash on the very first real-world test of the re-auth gate.
  if (needsAuth) {
    // Full reload rather than just clearing the flag — every hook in the tree (useSettings,
    // per-section state) fetched with the now-dead session and needs to start over clean.
    return <PinGate onSuccess={() => window.location.reload()} />;
  }

  if (settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <span role="status" className="text-slate-500 text-sm">Loading&hellip;</span>
      </div>
    );
  }
  if (settings && !settings.onboardingComplete) {
    return <OnboardingWizard settings={settings} save={save} />;
  }

  const navigate = (id: SectionId) => {
    setActiveSection(id);
    localStorage.setItem(SECTION_STORAGE_KEY, id);
    setSidebarOpen(false);
  };

  const activeLabel = ALL_NAV.find((n) => n.id === activeSection)?.label ?? '';

  return (
    <NavigationContext.Provider value={navigate}>
    <div className="flex h-full bg-slate-950">
      <h1 className="sr-only">Smart Display Configuration</h1>
      {sidebarOpen && (
        <div aria-hidden="true" className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside aria-label="Navigation" aria-modal={sidebarOpen || undefined} className={`fixed inset-y-0 left-0 z-30 flex w-56 flex-col bg-slate-900 border-r border-slate-800 transition-transform md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center px-4 border-b border-slate-800 shrink-0">
          <span className="text-sm font-semibold text-slate-100 tracking-wide">Smart Display</span>
        </div>

        <nav aria-label="Sidebar navigation" className="flex flex-1 flex-col gap-1 overflow-y-auto py-2 pr-2">
          <div className="flex-1 space-y-0.5">
            <p className="px-3 pt-1 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider" aria-hidden="true">Content</p>
            {NAV_ITEMS.map((item, i) => (
              <NavButton key={item.id} item={item} active={activeSection === item.id} onClick={() => navigate(item.id)} ref={i === 0 ? firstNavButtonRef : undefined} />
            ))}
          </div>
          <div className="border-t border-slate-800 pt-2 space-y-0.5">
            <p className="px-3 pt-1 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider" aria-hidden="true">Display</p>
            {DISPLAY_NAV_ITEMS.map((item) => (
              <NavButton key={item.id} item={item} active={activeSection === item.id} onClick={() => navigate(item.id)} />
            ))}
          </div>
          <div className="border-t border-slate-800 pt-2 space-y-0.5">
            <p className="px-3 pt-1 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider" aria-hidden="true">System</p>
            {SYSTEM_NAV_ITEMS.map((item) => (
              <NavButton key={item.id} item={item} active={activeSection === item.id} onClick={() => navigate(item.id)} />
            ))}
          </div>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 items-center gap-3 border-b border-slate-800 px-4 md:hidden shrink-0">
          <button type="button" onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-slate-100 p-2.5 -ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-100">Smart Display</span>
          {activeLabel && (
            <span className="ml-auto text-sm text-slate-400">{activeLabel}</span>
          )}
        </header>
        <main className="flex-1 overflow-y-auto">
          {renderSection(activeSection)}
        </main>
      </div>
    </div>
    </NavigationContext.Provider>
  );
}
