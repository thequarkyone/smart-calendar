import type { FastifyInstance } from 'fastify';
import type { Settings } from '@smart-display/shared';
import type { SettingsService } from '../services/settings.js';
import type { EventBus } from '../event-bus.js';

const COLOR_HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HH_MM_RE = /^\d{2}:\d{2}$/;
const TIMEZONE_RE = /^[A-Za-z][A-Za-z0-9_\-+]*(\/[A-Za-z0-9_\-+]+)*$/;

const VALID_UNITS = new Set(['metric', 'imperial']);
const VALID_CLOCK_FORMAT = new Set(['12h', '24h']);
const VALID_THEME = new Set(['dark', 'light']);
const VALID_FONT_FAMILY = new Set(['system', 'rounded', 'mono']);
const VALID_BG_TYPE = new Set(['solid', 'gradient', 'photo', 'transparent']);
const VALID_WEEK_STARTS_ON = new Set(['sun', 'mon']);
const VALID_TEMPLATE_IDS = new Set(['classic', 'minimal', 'photo-focus', null]);
const VALID_TILE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const VALID_CALENDAR_SIZE = new Set(['full', 'large', 'medium', 'small']);
const VALID_CALENDAR_VIEW_MODE = new Set(['month', 'rolling']);
const VALID_BG_CYCLING_SOURCE = new Set(['nasa', 'unsplash', 'pexels']);

export function validateSettingsPatch(patch: Partial<Settings>): string | null {
  if (patch.units !== undefined && !VALID_UNITS.has(patch.units)) return `Invalid units: ${patch.units}`;
  if (patch.clockFormat !== undefined && !VALID_CLOCK_FORMAT.has(patch.clockFormat)) return `Invalid clockFormat: ${patch.clockFormat}`;
  if (patch.theme !== undefined && !VALID_THEME.has(patch.theme)) return `Invalid theme: ${patch.theme}`;
  if (patch.fontFamily !== undefined && !VALID_FONT_FAMILY.has(patch.fontFamily)) return `Invalid fontFamily: ${patch.fontFamily}`;
  if (patch.bgType !== undefined && !VALID_BG_TYPE.has(patch.bgType)) return `Invalid bgType: ${patch.bgType}`;
  if (patch.weekStartsOn !== undefined && !VALID_WEEK_STARTS_ON.has(patch.weekStartsOn)) return `Invalid weekStartsOn: ${patch.weekStartsOn}`;
  if (patch.bgCyclingSource !== undefined && !VALID_BG_CYCLING_SOURCE.has(patch.bgCyclingSource)) return `Invalid bgCyclingSource: ${patch.bgCyclingSource}`;
  if (patch.accentColor !== undefined && !COLOR_HEX_RE.test(patch.accentColor)) return 'accentColor must be a 6-digit hex color';
  if (patch.bgColor !== undefined && !COLOR_HEX_RE.test(patch.bgColor)) return 'bgColor must be a 6-digit hex color';
  if (patch.bgGradientEnd !== undefined && !COLOR_HEX_RE.test(patch.bgGradientEnd)) return 'bgGradientEnd must be a 6-digit hex color';
  if (patch.screenDimLevel !== undefined) {
    if (typeof patch.screenDimLevel !== 'number' || !Number.isFinite(patch.screenDimLevel) || patch.screenDimLevel < 0 || patch.screenDimLevel > 100) {
      return 'screenDimLevel must be 0–100';
    }
  }
  if (patch.autoUpdateTime !== undefined && patch.autoUpdateTime !== null && !HH_MM_RE.test(patch.autoUpdateTime)) {
    return 'autoUpdateTime must be HH:MM';
  }
  if (patch.householdName !== undefined && patch.householdName.length > 200) return 'householdName too long';
  if (patch.timezone !== undefined) {
    if (typeof patch.timezone !== 'string' || patch.timezone.length > 100 || !TIMEZONE_RE.test(patch.timezone)) {
      return 'Invalid timezone';
    }
  }
  if (patch.activeTemplateId !== undefined && !VALID_TEMPLATE_IDS.has(patch.activeTemplateId)) {
    return `Invalid activeTemplateId: ${patch.activeTemplateId}`;
  }
  if (patch.location !== undefined && patch.location !== null) {
    const { latitude, longitude, label } = patch.location;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return 'location.latitude must be a finite number between -90 and 90';
    }
    if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return 'location.longitude must be a finite number between -180 and 180';
    }
    if (typeof label !== 'string' || label.length > 200) return 'location.label must be a string of 200 chars or fewer';
  }
  if (patch.screenSleep !== undefined && patch.screenSleep !== null) {
    if (!HH_MM_RE.test(patch.screenSleep.start)) return 'screenSleep.start must be HH:MM';
    if (!HH_MM_RE.test(patch.screenSleep.end)) return 'screenSleep.end must be HH:MM';
  }
  if (patch.autoTheme !== undefined && typeof patch.autoTheme !== 'boolean') {
    return 'autoTheme must be a boolean';
  }
  if (patch.touchscreenEnabled !== undefined && typeof patch.touchscreenEnabled !== 'boolean') {
    return 'touchscreenEnabled must be a boolean';
  }
  if (patch.layoutConfig !== undefined) {
    const lc = patch.layoutConfig;
    if (typeof lc.sidebarWidth !== 'number' || !Number.isFinite(lc.sidebarWidth) || lc.sidebarWidth < 100 || lc.sidebarWidth > 1000) {
      return 'layoutConfig.sidebarWidth must be 100–1000';
    }
    if (typeof lc.photoStripHeight !== 'number' || !Number.isFinite(lc.photoStripHeight) || lc.photoStripHeight < 40 || lc.photoStripHeight > 400) {
      return 'layoutConfig.photoStripHeight must be 40–400';
    }
    if (typeof lc.newsBandHeight !== 'number' || !Number.isFinite(lc.newsBandHeight) || lc.newsBandHeight < 24 || lc.newsBandHeight > 200) {
      return 'layoutConfig.newsBandHeight must be 24–200';
    }
    if (typeof lc.showSidebar !== 'boolean') return 'layoutConfig.showSidebar must be a boolean';
    if (!Array.isArray(lc.sidebarWidgets) || lc.sidebarWidgets.length > 20 || lc.sidebarWidgets.some((id) => !VALID_TILE_ID_RE.test(id))) {
      return 'layoutConfig.sidebarWidgets must be an array of up to 20 valid tile IDs';
    }
    if (!Array.isArray(lc.mainWidgets) || lc.mainWidgets.length > 20 || lc.mainWidgets.some((id) => !VALID_TILE_ID_RE.test(id))) {
      return 'layoutConfig.mainWidgets must be an array of up to 20 valid tile IDs';
    }
    if (lc.rightBarWidgets !== undefined) {
      if (!Array.isArray(lc.rightBarWidgets) || lc.rightBarWidgets.length > 20 || lc.rightBarWidgets.some((id) => !VALID_TILE_ID_RE.test(id))) {
        return 'layoutConfig.rightBarWidgets must be an array of up to 20 valid tile IDs';
      }
    }
    if (lc.rightBarWidth !== undefined) {
      if (typeof lc.rightBarWidth !== 'number' || !Number.isFinite(lc.rightBarWidth) || lc.rightBarWidth < 100 || lc.rightBarWidth > 1000) {
        return 'layoutConfig.rightBarWidth must be 100–1000';
      }
    }
    if (lc.topBarWidgets !== undefined) {
      if (!Array.isArray(lc.topBarWidgets) || lc.topBarWidgets.length > 20 || lc.topBarWidgets.some((id) => !VALID_TILE_ID_RE.test(id))) {
        return 'layoutConfig.topBarWidgets must be an array of up to 20 valid tile IDs';
      }
    }
    if (lc.topBarHeight !== undefined) {
      if (typeof lc.topBarHeight !== 'number' || !Number.isFinite(lc.topBarHeight) || lc.topBarHeight < 40 || lc.topBarHeight > 300) {
        return 'layoutConfig.topBarHeight must be 40–300';
      }
    }
    if (lc.bottomBarWidgets !== undefined) {
      if (!Array.isArray(lc.bottomBarWidgets) || lc.bottomBarWidgets.length > 20 || lc.bottomBarWidgets.some((id) => !VALID_TILE_ID_RE.test(id))) {
        return 'layoutConfig.bottomBarWidgets must be an array of up to 20 valid tile IDs';
      }
    }
    if (lc.bottomBarHeight !== undefined) {
      if (typeof lc.bottomBarHeight !== 'number' || !Number.isFinite(lc.bottomBarHeight) || lc.bottomBarHeight < 40 || lc.bottomBarHeight > 300) {
        return 'layoutConfig.bottomBarHeight must be 40–300';
      }
    }
    if (lc.calendarSize !== undefined && !VALID_CALENDAR_SIZE.has(lc.calendarSize)) {
      return `layoutConfig.calendarSize must be one of: full, large, medium, small`;
    }
    if (lc.calendarViewMode !== undefined && !VALID_CALENDAR_VIEW_MODE.has(lc.calendarViewMode)) {
      return `layoutConfig.calendarViewMode must be one of: month, rolling`;
    }
    if (lc.calendarRollingWeeks !== undefined) {
      if (typeof lc.calendarRollingWeeks !== 'number' || !Number.isFinite(lc.calendarRollingWeeks) || lc.calendarRollingWeeks < 1 || lc.calendarRollingWeeks > 12) {
        return 'layoutConfig.calendarRollingWeeks must be 1–12';
      }
    }
  }
  return null;
}

export function createSettingsRoutes(settingsService: SettingsService, bus: EventBus) {
  return async function settingsRoutes(app: FastifyInstance): Promise<void> {
    app.get('/settings', async () => settingsService.get());

    app.patch<{ Body: Partial<Settings> }>(
      '/settings',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              householdName: { type: 'string', maxLength: 200 },
              timezone: { type: 'string', maxLength: 100 },
              location: { type: ['object', 'null'] },
              units: { type: 'string', maxLength: 20 },
              clockFormat: { type: 'string', maxLength: 10 },
              theme: { type: 'string', maxLength: 20 },
              activeTemplateId: { type: ['string', 'null'], maxLength: 64 },
              screenSleep: { type: ['object', 'null'] },
              accentColor: { type: 'string', maxLength: 7 },
              fontFamily: { type: 'string', maxLength: 32 },
              showQrCode: { type: 'boolean' },
              onboardingComplete: { type: 'boolean' },
              screenDimLevel: { type: 'number', minimum: 0, maximum: 100 },
              screenDimEnabled: { type: 'boolean' },
              bgType: { type: 'string', maxLength: 20 },
              bgColor: { type: 'string', maxLength: 7 },
              bgGradientEnd: { type: 'string', maxLength: 7 },
              layoutConfig: { type: 'object' },
              weekStartsOn: { type: 'string', maxLength: 3 },
              autoUpdate: { type: 'boolean' },
              autoUpdateTime: { type: ['string', 'null'], maxLength: 5 },
              autoTheme: { type: 'boolean' },
              bgPhotoPath: { type: ['string', 'null'], maxLength: 512, pattern: '^(/data/photos/|$)' },
              touchscreenEnabled: { type: 'boolean' },
              bgCyclingEnabled: { type: 'boolean' },
              bgCyclingSource: { type: 'string', maxLength: 20 },
            },
          },
        },
      },
      async (request, reply) => {
        // Prevent rolling back onboarding status via the API
        if (request.body.onboardingComplete === false) {
          return reply.status(400).send({ error: 'Cannot reset onboardingComplete via API' });
        }
        const validationError = validateSettingsPatch(request.body);
        if (validationError) {
          return reply.status(400).send({ error: validationError });
        }
        const updated = settingsService.update(request.body);
        bus.emit('settings:changed', updated);
        return updated;
      },
    );
  };
}
