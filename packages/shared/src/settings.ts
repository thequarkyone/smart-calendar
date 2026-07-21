export type Units = 'metric' | 'imperial';

/** A keyword → emoji mapping rule applied to calendar event titles. */
export interface EventSymbolRule {
  /** Case-insensitive substring to match in the event title. */
  keyword: string;
  /** Emoji or short symbol to prepend to matching titles. */
  symbol: string;
}
export type ClockFormat = '12h' | '24h';
export type ThemeMode = 'dark' | 'light';
export type BgType = 'solid' | 'gradient' | 'photo';
export type BackgroundSource = 'nasa' | 'unsplash' | 'pexels';

/** Latest fetched cycling-background photo, pushed over WS as 'background:state'. */
export interface BackgroundState {
  /** Server-relative URL to the cached image, or null if none fetched yet / feature off. */
  imageUrl: string | null;
  source: BackgroundSource | null;
  /** Human-readable credit line (photographer/mission), or null if not applicable. */
  attribution: string | null;
  updatedAt: string | null;
}

/** Numeric overrides for Classic layout slot dimensions (D2) and widget composition (UX5). */
export interface LayoutConfig {
  /** Sidebar width in pixels (default 380). */
  sidebarWidth: number;
  /** Photo strip height in pixels (default 120). */
  photoStripHeight: number;
  /** News band height in pixels (default 48). */
  newsBandHeight: number;
  /** Whether to show the left sidebar (default true). */
  showSidebar: boolean;
  /** Ordered tile IDs shown in the sidebar (default order). */
  sidebarWidgets: string[];
  /** Ordered tile IDs shown in the main center area (default order). */
  mainWidgets: string[];
  /** Ordered tile IDs shown in the right sidebar (default []). */
  rightBarWidgets: string[];
  /** Right sidebar width in pixels (default 320). */
  rightBarWidth: number;
  /** Ordered tile IDs shown in the top bar (default []). */
  topBarWidgets: string[];
  /** Top bar height in pixels (default 80). */
  topBarHeight: number;
  /** Ordered tile IDs shown in the bottom bar (default []). */
  bottomBarWidgets: string[];
  /** Bottom bar height in pixels (default 80). */
  bottomBarHeight: number;
  /** How much space the calendar takes relative to widget zones (default 'large'). */
  calendarSize: 'full' | 'large' | 'medium' | 'small';
  /** 'month' shows a fixed calendar month (default); 'rolling' shows a fixed number of weeks
   * centered on today, so e.g. the 31st doesn't hide what's happening on the 1st of next month. */
  calendarViewMode: 'month' | 'rolling';
  /** Total weeks shown when calendarViewMode is 'rolling', centered on today's week (default 4). */
  calendarRollingWeeks: number;
}

export interface GeoLocation {
  label: string;
  latitude: number;
  longitude: number;
}

/** Global, device-wide settings. */
export interface Settings {
  /** Shown on the display, e.g. "Shead Family". */
  householdName: string;
  /** IANA timezone, e.g. "America/New_York". */
  timezone: string;
  location: GeoLocation | null;
  units: Units;
  clockFormat: ClockFormat;
  theme: ThemeMode;
  /** id of the active layout template. */
  activeTemplateId: string | null;
  /** Optional daily screen-sleep window in 24h "HH:mm"; null = always on. */
  screenSleep: { start: string; end: string } | null;
  /** Accent color as a CSS hex string, e.g. '#4a90e2'. */
  accentColor: string;
  /** Display font family. */
  fontFamily: 'system' | 'rounded' | 'mono';
  /** Whether to show a QR code overlay on the display. */
  showQrCode: boolean;
  /** Whether the config UI onboarding wizard has been completed. */
  onboardingComplete: boolean;
  /** Dim the display instead of turning it off during the sleep window (0–100, 0 = off / use sleep). */
  screenDimLevel: number;
  /** When true, use screenDimLevel instead of full black during the sleep window. */
  screenDimEnabled: boolean;
  /** Background type for the display (D3). */
  bgType: BgType;
  /** Primary background color as CSS hex (used for solid and gradient start). */
  bgColor: string;
  /** Gradient end color as CSS hex (only used when bgType = 'gradient'). */
  bgGradientEnd: string;
  /** Classic-layout slot dimension overrides (D2). */
  layoutConfig: LayoutConfig;
  /** Which day the calendar week starts on (default 'mon'). */
  weekStartsOn: 'sun' | 'mon';
  /** Automatically download and apply updates when a new version is available. */
  autoUpdate: boolean;
  /** Time of day to apply auto-updates in 24h "HH:mm" format; null = apply as soon as update is found. */
  autoUpdateTime: string | null;
  /** Automatically switch theme to light at sunrise and dark at sunset (requires location). */
  autoTheme: boolean;
  /** Absolute path to a dedicated background photo on disk; null = use slideshow. */
  bgPhotoPath: string | null;
  /** Whether the connected display is a touchscreen (enables tap-to-toggle HA controls). */
  touchscreenEnabled: boolean;
  /** Google OAuth client_id stored in secrets; null if not configured. */
  googleOAuthClientId: string | null;
  /** Keyword → emoji rules applied to calendar event titles before display. */
  eventSymbolRules: EventSymbolRule[];
  /** Whether the daily cycling nature/space background photo feature is on. */
  bgCyclingEnabled: boolean;
  /** Which free image API to pull the daily cycling background from. */
  bgCyclingSource: BackgroundSource;
  /** Whether a user-supplied Unsplash API key is stored in secrets (key itself never sent to client). */
  unsplashApiKeySet: boolean;
  /** Whether a user-supplied Pexels API key is stored in secrets (key itself never sent to client). */
  pexelsApiKeySet: boolean;
}
