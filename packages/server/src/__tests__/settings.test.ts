import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { openDb } from '../db/index.js';
import { SettingsService } from '../services/settings.js';
import { SecretsService } from '../services/secrets.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let service: SettingsService;

beforeEach(() => {
  db = openDb(':memory:');
  const secrets = new SecretsService(db, randomBytes(32));
  service = new SettingsService(db, secrets);
});

afterEach(() => {
  db.close();
});

describe('SettingsService', () => {
  it('returns default settings', () => {
    const s = service.get();
    expect(s.timezone).toBe('UTC');
    expect(s.units).toBe('metric');
    expect(s.clockFormat).toBe('12h');
    expect(s.theme).toBe('dark');
    expect(s.location).toBeNull();
    expect(s.screenSleep).toBeNull();
  });

  it('updates household name and timezone', () => {
    const updated = service.update({ householdName: 'Shead Family', timezone: 'America/New_York' });
    expect(updated.householdName).toBe('Shead Family');
    expect(updated.timezone).toBe('America/New_York');
  });

  it('persists a location', () => {
    service.update({
      location: { label: 'London', latitude: 51.5074, longitude: -0.1278 },
    });
    const s = service.get();
    expect(s.location).toEqual({ label: 'London', latitude: 51.5074, longitude: -0.1278 });
  });

  it('clears a location when set to null', () => {
    service.update({ location: { label: 'London', latitude: 51.5074, longitude: -0.1278 } });
    service.update({ location: null });
    expect(service.get().location).toBeNull();
  });

  it('persists screen sleep schedule', () => {
    service.update({ screenSleep: { start: '23:00', end: '07:00' } });
    expect(service.get().screenSleep).toEqual({ start: '23:00', end: '07:00' });
  });

  it('only updates supplied fields (partial patch)', () => {
    service.update({ householdName: 'Test Family' });
    service.update({ timezone: 'Europe/London' });
    const s = service.get();
    expect(s.householdName).toBe('Test Family');
    expect(s.timezone).toBe('Europe/London');
  });

  it('returns default Phase D fields', () => {
    const s = service.get();
    expect(s.bgType).toBe('solid');
    expect(s.bgColor).toBe('#0d1117');
    expect(s.bgGradientEnd).toBe('#1a1a2e');
    // sidebarWidth=380 after migration 014 upgrades the old 220 default
    expect(s.layoutConfig).toEqual({
      sidebarWidth: 380,
      photoStripHeight: 120,
      newsBandHeight: 48,
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
    });
  });

  it('persists background settings', () => {
    service.update({ bgType: 'gradient', bgColor: '#001122', bgGradientEnd: '#334455' });
    const s = service.get();
    expect(s.bgType).toBe('gradient');
    expect(s.bgColor).toBe('#001122');
    expect(s.bgGradientEnd).toBe('#334455');
  });

  it('persists layout config', () => {
    service.update({
      layoutConfig: {
        sidebarWidth: 280,
        photoStripHeight: 160,
        newsBandHeight: 64,
        showSidebar: false,
        sidebarWidgets: ['clock', 'weather'],
        mainWidgets: ['calendar'],
      },
    });
    const s = service.get();
    expect(s.layoutConfig).toEqual({
      sidebarWidth: 280,
      photoStripHeight: 160,
      newsBandHeight: 64,
      showSidebar: false,
      sidebarWidgets: ['clock', 'weather'],
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
    });
  });
});
