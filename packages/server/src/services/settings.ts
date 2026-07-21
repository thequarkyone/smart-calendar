import { randomInt } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { EventSymbolRule, LayoutConfig, Settings } from '@smart-display/shared';
import type { SecretsService } from './secrets.js';

export const DEFAULT_EVENT_SYMBOL_RULES: EventSymbolRule[] = [
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

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  sidebarWidth: 380,
  photoStripHeight: 120,
  newsBandHeight: 56,
  showSidebar: true,
  sidebarWidgets: ['clock', 'weather', 'tasks', 'home_assistant'],
  mainWidgets: ['calendar'],
  rightBarWidgets: [],
  rightBarWidth: 320,
  topBarWidgets: [],
  topBarHeight: 80,
  bottomBarWidgets: [],
  bottomBarHeight: 80,
  calendarSize: 'large',
  calendarViewMode: 'month',
  calendarRollingWeeks: 4,
};

interface SettingsRow {
  household_name: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  units: string;
  clock_format: string;
  theme: string;
  active_template_id: string | null;
  screen_sleep_start: string | null;
  screen_sleep_end: string | null;
  accent_color: string;
  font_family: string;
  show_qr_code: number;
  onboarding_complete: number;
  bg_type: string;
  bg_color: string;
  bg_gradient_end: string;
  layout_config_json: string;
  screen_dim_enabled: number;
  screen_dim_level: number;
  week_starts_on: string;
  auto_update: number;
  auto_update_time: string | null;
  auto_theme: number;
  bg_photo_path: string | null;
  touchscreen_enabled: number;
  event_symbol_rules: string;
  bg_cycling_enabled: number;
  bg_cycling_source: string;
}

function rowToSettings(row: SettingsRow): Settings {
  return {
    householdName: row.household_name,
    timezone: row.timezone,
    location:
      row.latitude != null && row.longitude != null
        ? { label: row.location_label ?? '', latitude: row.latitude, longitude: row.longitude }
        : null,
    units: row.units as Settings['units'],
    clockFormat: row.clock_format as Settings['clockFormat'],
    theme: row.theme as Settings['theme'],
    activeTemplateId: row.active_template_id,
    screenSleep:
      row.screen_sleep_start != null && row.screen_sleep_end != null
        ? { start: row.screen_sleep_start, end: row.screen_sleep_end }
        : null,
    accentColor: row.accent_color,
    fontFamily: row.font_family as Settings['fontFamily'],
    showQrCode: row.show_qr_code === 1,
    onboardingComplete: row.onboarding_complete === 1,
    bgType: (row.bg_type ?? 'solid') as Settings['bgType'],
    bgColor: row.bg_color ?? '#0d1117',
    bgGradientEnd: row.bg_gradient_end ?? '#1a1a2e',
    screenDimEnabled: row.screen_dim_enabled === 1,
    screenDimLevel: row.screen_dim_level ?? 20,
    weekStartsOn: (row.week_starts_on ?? 'sun') as Settings['weekStartsOn'],
    autoUpdate: row.auto_update === 1,
    autoUpdateTime: row.auto_update_time ?? null,
    autoTheme: row.auto_theme === 1,
    bgPhotoPath: row.bg_photo_path ?? null,
    touchscreenEnabled: row.touchscreen_enabled === 1,
    googleOAuthClientId: null, // populated after construction via secrets
    bgCyclingEnabled: row.bg_cycling_enabled === 1,
    bgCyclingSource: (row.bg_cycling_source ?? 'nasa') as Settings['bgCyclingSource'],
    unsplashApiKeySet: false, // populated after construction via secrets
    pexelsApiKeySet: false, // populated after construction via secrets
    eventSymbolRules: (() => {
      try {
        return (JSON.parse(row.event_symbol_rules ?? '[]') as EventSymbolRule[]);
      } catch {
        return DEFAULT_EVENT_SYMBOL_RULES;
      }
    })(),
    layoutConfig: (() => {
      if (!row.layout_config_json) return DEFAULT_LAYOUT_CONFIG;
      try {
        return { ...DEFAULT_LAYOUT_CONFIG, ...(JSON.parse(row.layout_config_json) as Partial<LayoutConfig>) };
      } catch {
        return DEFAULT_LAYOUT_CONFIG;
      }
    })(),
  };
}

export class SettingsService {
  constructor(
    private readonly db: Database.Database,
    private readonly secrets: SecretsService,
  ) {}

  get(): Settings {
    const row = this.db
      .prepare('SELECT * FROM settings WHERE id = 1')
      .get() as SettingsRow;
    const settings = rowToSettings(row);
    settings.googleOAuthClientId = this.secrets.get('google-oauth-client-id');
    settings.unsplashApiKeySet = this.secrets.has('unsplash_api_key');
    settings.pexelsApiKeySet = this.secrets.has('pexels_api_key');
    return settings;
  }

  update(patch: Partial<Settings>): Settings {
    const current = this.get();
    const next: Settings = { ...current, ...patch };

    this.db
      .prepare(
        `UPDATE settings SET
          household_name     = ?,
          timezone           = ?,
          latitude           = ?,
          longitude          = ?,
          location_label     = ?,
          units              = ?,
          clock_format       = ?,
          theme              = ?,
          active_template_id = ?,
          screen_sleep_start = ?,
          screen_sleep_end   = ?,
          accent_color       = ?,
          font_family        = ?,
          show_qr_code       = ?,
          onboarding_complete = ?,
          bg_type            = ?,
          bg_color           = ?,
          bg_gradient_end    = ?,
          layout_config_json = ?,
          screen_dim_enabled = ?,
          screen_dim_level   = ?,
          week_starts_on     = ?,
          auto_update        = ?,
          auto_update_time   = ?,
          auto_theme         = ?,
          bg_photo_path      = ?,
          touchscreen_enabled = ?,
          event_symbol_rules  = ?,
          bg_cycling_enabled = ?,
          bg_cycling_source  = ?,
          updated_at         = datetime('now')
        WHERE id = 1`,
      )
      .run(
        next.householdName,
        next.timezone,
        next.location?.latitude ?? null,
        next.location?.longitude ?? null,
        next.location?.label ?? null,
        next.units,
        next.clockFormat,
        next.theme,
        next.activeTemplateId,
        next.screenSleep?.start ?? null,
        next.screenSleep?.end ?? null,
        next.accentColor,
        next.fontFamily,
        next.showQrCode ? 1 : 0,
        next.onboardingComplete ? 1 : 0,
        next.bgType,
        next.bgColor,
        next.bgGradientEnd,
        JSON.stringify(next.layoutConfig),
        next.screenDimEnabled ? 1 : 0,
        next.screenDimLevel,
        next.weekStartsOn ?? 'sun',
        next.autoUpdate ? 1 : 0,
        next.autoUpdateTime ?? null,
        next.autoTheme ? 1 : 0,
        next.bgPhotoPath ?? null,
        next.touchscreenEnabled ? 1 : 0,
        JSON.stringify(next.eventSymbolRules ?? DEFAULT_EVENT_SYMBOL_RULES),
        next.bgCyclingEnabled ? 1 : 0,
        next.bgCyclingSource ?? 'nasa',
      );

    return this.get();
  }

  getDevicePin(): string {
    const stored = this.secrets.get('device-pin');
    if (stored) return stored;
    // 8-char alphanumeric (uppercase + digits), ~47 bits of entropy
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous: no 0/O/1/I
    let pin = '';
    for (let i = 0; i < 8; i++) pin += CHARS[randomInt(0, CHARS.length)];
    this.secrets.set('device-pin', 'Device PIN', pin);
    return pin;
  }
}
