import { randomBytes, randomUUID } from 'node:crypto';
import icalDefault from 'node-ical';
import type * as ical from 'node-ical';
import type Database from 'better-sqlite3';
import type { CalendarEvent, CalendarSourcePublic, CalendarState, CreateLocalEventBody, LocalEvent, UpdateLocalEventBody } from '@smart-display/shared';
import type { SecretsService } from './secrets.js';
import type { SettingsService } from './settings.js';
import { assertSafeFetchUrl } from '../util/url-guard.js';

/**
 * Re-expresses a Date's LOCAL calendar-day components as a UTC-midnight ISO string for that
 * exact day. Use only for node-ical's all-day (VALUE=DATE) events: iCal DATE values carry no
 * timezone, and node-ical constructs their JS Date using the server process's LOCAL clock —
 * extracting the day via .toISOString() (always UTC) silently shifts the date whenever the
 * server isn't running in UTC (e.g. BST is UTC+1 — midnight BST is 23:00 the previous day UTC,
 * corrupting every all-day event's stored date by a day). Reading the LOCAL components back
 * out undoes that shift regardless of the server's configured timezone.
 */
function localDateOnlyIso(d: Date): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
}

/** DTEND is exclusive for all-day iCal events per RFC 5545 — pull it back one day (in the same
 * local-component space localDateOnlyIso reads from) so a single-day event doesn't span two
 * calendar dates in the display's inclusive day-range check. node-ical-sourced Date only. */
function inclusiveAllDayEnd(d: Date): string {
  return localDateOnlyIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

/**
 * Google's Calendar API gives all-day dates as a bare "YYYY-MM-DD" string — unambiguous UTC by
 * spec, unlike node-ical's locally-constructed Dates above. Built directly from the string with
 * no Date-object round trip, so there's no server-timezone-dependent shift to undo here.
 */
function googleAllDayIso(dateOnlyStr: string): string {
  return `${dateOnlyStr}T00:00:00.000Z`;
}

/** end.date is exclusive per the Google Calendar API — pull it back one UTC day. */
function googleInclusiveAllDayEnd(dateOnlyStr: string): string {
  const d = new Date(googleAllDayIso(dateOnlyStr));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

// How far back/forward to expand recurring (and one-off) ICS events from "now" on each sync.
// Unbounded historical sync isn't useful for a display that only ever shows the current month
// + a short upcoming list, and would make recurring-event expansion unboundedly expensive for
// old daily/weekly series with no COUNT/UNTIL.
const ICS_SYNC_WINDOW_MONTHS_PAST = 6;
const ICS_SYNC_WINDOW_MONTHS_FUTURE = 24;

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

function googleEventsUrl(calId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`;
}

interface CalendarRow {
  id: string;
  name: string;
  ics_url_secret_id: string;
  color: string;
  enabled: number;
  last_synced: string | null;
  provider: 'ics' | 'google';
  refresh_token_secret_id: string | null;
  is_builtin: number;
}

const BUILTIN_HOLIDAYS_ID = 'builtin-holidays';
const BUILTIN_HOLIDAYS_COLOR = '#e74c3c';

/** Maps an IANA timezone string to a Google public holiday calendar ICS URL. */
function holidayIcsUrlForTimezone(tz: string): string {
  let locale = 'en.usa#holiday@group.v.calendar.google.com';

  if (tz.startsWith('Australia/')) {
    locale = 'en.australian#holiday@group.v.calendar.google.com';
  } else if (tz.startsWith('America/')) {
    const canadianZones = [
      'America/Toronto','America/Vancouver','America/Edmonton','America/Winnipeg',
      'America/Halifax','America/St_Johns','America/Regina','America/Whitehorse',
      'America/Yellowknife','America/Iqaluit','America/Glace_Bay','America/Moncton',
    ];
    const mexicanZones = [
      'America/Mexico_City','America/Monterrey','America/Merida','America/Cancun',
      'America/Mazatlan','America/Chihuahua','America/Hermosillo','America/Tijuana',
    ];
    if (canadianZones.includes(tz)) {
      locale = 'en.canadian#holiday@group.v.calendar.google.com';
    } else if (mexicanZones.includes(tz)) {
      locale = 'es.mexican#holiday@group.v.calendar.google.com';
    } else {
      locale = 'en.usa#holiday@group.v.calendar.google.com';
    }
  } else if (tz.startsWith('Europe/')) {
    const map: Record<string, string> = {
      'Europe/London':    'en.uk#holiday@group.v.calendar.google.com',
      'Europe/Dublin':    'en.irish#holiday@group.v.calendar.google.com',
      'Europe/Paris':     'fr.french#holiday@group.v.calendar.google.com',
      'Europe/Berlin':    'de.german#holiday@group.v.calendar.google.com',
      'Europe/Vienna':    'de.austrian#holiday@group.v.calendar.google.com',
      'Europe/Zurich':    'de.ch#holiday@group.v.calendar.google.com',
      'Europe/Madrid':    'es.spain#holiday@group.v.calendar.google.com',
      'Europe/Rome':      'it.italian#holiday@group.v.calendar.google.com',
      'Europe/Amsterdam': 'nl.dutch#holiday@group.v.calendar.google.com',
      'Europe/Brussels':  'nl.be#holiday@group.v.calendar.google.com',
      'Europe/Moscow':    'ru.russian#holiday@group.v.calendar.google.com',
      'Europe/Lisbon':    'pt.portuguese#holiday@group.v.calendar.google.com',
      'Europe/Warsaw':    'pl.polish#holiday@group.v.calendar.google.com',
      'Europe/Stockholm': 'sv.swedish#holiday@group.v.calendar.google.com',
      'Europe/Oslo':      'no.norwegian#holiday@group.v.calendar.google.com',
      'Europe/Copenhagen':'da.danish#holiday@group.v.calendar.google.com',
      'Europe/Helsinki':  'fi.finnish#holiday@group.v.calendar.google.com',
      'Europe/Athens':    'el.greek#holiday@group.v.calendar.google.com',
      'Europe/Bucharest': 'ro.romanian#holiday@group.v.calendar.google.com',
      'Europe/Budapest':  'hu.hungarian#holiday@group.v.calendar.google.com',
      'Europe/Prague':    'cs.czech#holiday@group.v.calendar.google.com',
    };
    locale = map[tz] ?? 'en.uk#holiday@group.v.calendar.google.com';
  } else if (tz.startsWith('Asia/')) {
    const map: Record<string, string> = {
      'Asia/Tokyo':        'ja.japanese#holiday@group.v.calendar.google.com',
      'Asia/Seoul':        'ko.south_korea#holiday@group.v.calendar.google.com',
      'Asia/Shanghai':     'zh.china#holiday@group.v.calendar.google.com',
      'Asia/Hong_Kong':    'zh.hk#holiday@group.v.calendar.google.com',
      'Asia/Taipei':       'zh.taiwan#holiday@group.v.calendar.google.com',
      'Asia/Singapore':    'en.singapore#holiday@group.v.calendar.google.com',
      'Asia/Kolkata':      'en.indian#holiday@group.v.calendar.google.com',
      'Asia/Jakarta':      'id.indonesia#holiday@group.v.calendar.google.com',
      'Asia/Bangkok':      'th.thai#holiday@group.v.calendar.google.com',
      'Asia/Manila':       'en.philippines#holiday@group.v.calendar.google.com',
      'Asia/Kuala_Lumpur': 'en.malaysia#holiday@group.v.calendar.google.com',
      'Asia/Dubai':        'ar.uae#holiday@group.v.calendar.google.com',
      'Asia/Riyadh':       'ar.saudi_arabia#holiday@group.v.calendar.google.com',
      'Asia/Karachi':      'en.pakistan#holiday@group.v.calendar.google.com',
      'Asia/Dhaka':        'en.bangladesh#holiday@group.v.calendar.google.com',
      'Asia/Colombo':      'en.srilanka#holiday@group.v.calendar.google.com',
    };
    locale = map[tz] ?? 'en.usa#holiday@group.v.calendar.google.com';
  } else if (tz.startsWith('Pacific/')) {
    const map: Record<string, string> = {
      'Pacific/Auckland':  'en.new_zealand#holiday@group.v.calendar.google.com',
      'Pacific/Honolulu':  'en.usa#holiday@group.v.calendar.google.com',
    };
    locale = map[tz] ?? 'en.usa#holiday@group.v.calendar.google.com';
  } else if (tz.startsWith('Africa/')) {
    locale = 'en.sa#holiday@group.v.calendar.google.com';
  }

  const encoded = locale.replace('#', '%23');
  return `https://calendar.google.com/calendar/ical/${encoded}/public/basic.ics`;
}

interface EventRow {
  id: string;
  calendar_id: string;
  uid: string;
  title: string;
  start: string;
  end: string;
  all_day: number;
  location: string | null;
  source: string;
}

interface GoogleCalendarListItem {
  id: string;
  summary: string;
  backgroundColor?: string;
  accessRole?: string;
}

interface GoogleEventItem {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
}

async function fetchWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise<void>((r) => setTimeout(r, baseDelayMs * (2 ** attempt)));
      }
    }
  }
  throw lastError;
}

function extractIcalString(field: unknown, fallback: string): string {
  if (typeof field === 'string') return field;
  if (field !== null && typeof field === 'object' && 'val' in field && typeof (field as Record<string, unknown>).val === 'string') {
    return (field as Record<string, unknown>).val as string;
  }
  return fallback;
}

function rowToSourcePublic(row: CalendarRow, icsUrl: string): CalendarSourcePublic {
  const result: CalendarSourcePublic = {
    id: row.id,
    name: row.name,
    provider: row.provider ?? 'ics',
    icsUrlSet: icsUrl.length > 0,
    color: row.color,
    enabled: row.enabled === 1,
    lastSynced: row.last_synced,
  };
  if (row.is_builtin === 1) result.isBuiltin = true;
  return result;
}

function rowToLocalEvent(row: EventRow): LocalEvent {
  return {
    id: row.id,
    title: row.title,
    start: row.start,
    end: row.end,
    allDay: row.all_day === 1,
    location: row.location ?? undefined,
  };
}

function rowToEvent(row: EventRow, color: string): CalendarEvent {
  return {
    calendarId: row.calendar_id,
    uid: row.uid,
    title: row.title,
    start: row.start,
    end: row.end,
    allDay: row.all_day === 1,
    location: row.location ?? undefined,
    color,
  };
}

export class CalendarService {
  private readonly syncInFlight = new Set<string>();
  // state token → expiry ms; one-time use, 10-min TTL
  private readonly oauthStates = new Map<string, number>();

  constructor(
    private readonly db: Database.Database,
    private readonly secrets: SecretsService,
    private readonly settings: SettingsService,
  ) {}

  list(): CalendarSourcePublic[] {
    const rows = this.db
      .prepare(`SELECT * FROM calendars WHERE id != 'local' ORDER BY created_at ASC`)
      .all() as CalendarRow[];
    return rows.map((row) => {
      const url = this.secrets.get(row.ics_url_secret_id) ?? '';
      return rowToSourcePublic(row, url);
    });
  }

  getLocalCalendarColor(): string {
    const row = this.db
      .prepare(`SELECT color FROM calendars WHERE id = 'local'`)
      .get() as { color: string } | undefined;
    return row?.color ?? '#4a90e2';
  }

  setLocalCalendarColor(color: string): void {
    this.db.prepare(`UPDATE calendars SET color = ? WHERE id = 'local'`).run(color);
  }

  listIcsForBackup(): Array<{ id: string; name: string; url: string; color: string; enabled: boolean }> {
    const rows = this.db
      .prepare(`SELECT * FROM calendars WHERE provider = 'ics' ORDER BY created_at ASC`)
      .all() as CalendarRow[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      url: this.secrets.get(r.ics_url_secret_id) ?? '',
      color: r.color,
      enabled: r.enabled === 1,
    }));
  }

  async add(name: string, icsUrl: string, color: string): Promise<CalendarSourcePublic> {
    await assertSafeFetchUrl(icsUrl);
    const id = randomUUID();
    const secretId = `calendar-ics-${id}`;
    this.secrets.set(secretId, `ICS URL for ${name}`, icsUrl);
    this.db
      .prepare(
        `INSERT INTO calendars (id, name, ics_url_secret_id, color, provider)
         VALUES (?, ?, ?, ?, 'ics')`,
      )
      .run(id, name, secretId, color);
    const row = this.db.prepare('SELECT * FROM calendars WHERE id = ?').get(id) as CalendarRow;
    return rowToSourcePublic(row, icsUrl);
  }

  addGoogle(name: string, googleCalendarId: string, color: string): CalendarSourcePublic {
    const id = randomUUID();
    // Reuse ics_url_secret_id slot to store the Google Calendar ID (encrypted)
    const secretId = `calendar-google-id-${id}`;
    this.secrets.set(secretId, `Google Calendar ID for ${name}`, googleCalendarId);
    this.db
      .prepare(
        `INSERT INTO calendars (id, name, ics_url_secret_id, color, provider, refresh_token_secret_id)
         VALUES (?, ?, ?, ?, 'google', 'google-oauth-refresh-token')`,
      )
      .run(id, name, secretId, color);
    const row = this.db.prepare('SELECT * FROM calendars WHERE id = ?').get(id) as CalendarRow;
    return rowToSourcePublic(row, googleCalendarId);
  }

  setEnabled(id: string, enabled: boolean): CalendarSourcePublic | null {
    const row = this.db.prepare('SELECT * FROM calendars WHERE id = ?').get(id) as CalendarRow | undefined;
    if (!row || id === 'local') return null;
    this.db
      .prepare(`UPDATE calendars SET enabled = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(enabled ? 1 : 0, id);
    const updated = this.db.prepare('SELECT * FROM calendars WHERE id = ?').get(id) as CalendarRow;
    const url = this.secrets.get(updated.ics_url_secret_id) ?? '';
    return rowToSourcePublic(updated, url);
  }

  remove(id: string): void {
    if (id === 'local') throw new Error('Cannot remove the local events calendar');
    if (id === BUILTIN_HOLIDAYS_ID) throw new Error('Cannot remove the built-in holidays calendar');
    const row = this.db
      .prepare('SELECT ics_url_secret_id, provider FROM calendars WHERE id = ?')
      .get(id) as Pick<CalendarRow, 'ics_url_secret_id' | 'provider'> | undefined;
    if (!row) throw new Error(`Calendar not found: ${id}`);
    this.db.prepare('DELETE FROM calendars WHERE id = ?').run(id);
    this.secrets.delete(row.ics_url_secret_id);
    // refresh_token_secret_id ('google-oauth-refresh-token') is shared; don't delete it here
  }

  /**
   * Ensures the built-in holidays calendar exists and points to the correct
   * ICS feed for the device's current timezone. Safe to call on every startup.
   */
  async seedBuiltinHolidaysCalendar(): Promise<void> {
    const tz = this.settings.get().timezone ?? 'UTC';
    const icsUrl = holidayIcsUrlForTimezone(tz);
    const secretId = `calendar-ics-${BUILTIN_HOLIDAYS_ID}`;

    const existing = this.db
      .prepare('SELECT * FROM calendars WHERE id = ?')
      .get(BUILTIN_HOLIDAYS_ID) as CalendarRow | undefined;

    if (!existing) {
      await assertSafeFetchUrl(icsUrl);
      this.secrets.set(secretId, 'ICS URL for Holidays', icsUrl);
      this.db
        .prepare(
          `INSERT INTO calendars (id, name, ics_url_secret_id, color, provider, is_builtin)
           VALUES (?, 'Holidays', ?, ?, 'ics', 1)`,
        )
        .run(BUILTIN_HOLIDAYS_ID, secretId, BUILTIN_HOLIDAYS_COLOR);
      return;
    }

    // If timezone changed locale, update the stored URL and reset last_synced
    const storedUrl = this.secrets.get(secretId) ?? '';
    if (storedUrl !== icsUrl) {
      await assertSafeFetchUrl(icsUrl);
      this.secrets.set(secretId, 'ICS URL for Holidays', icsUrl);
      this.db
        .prepare(`UPDATE calendars SET last_synced = NULL, updated_at = datetime('now') WHERE id = ?`)
        .run(BUILTIN_HOLIDAYS_ID);
    }
  }

  async sync(id: string): Promise<CalendarEvent[]> {
    if (id === 'local') throw new Error('Cannot sync the local events calendar');
    if (this.syncInFlight.has(id)) throw new Error(`Sync already in progress for calendar ${id}`);
    this.syncInFlight.add(id);
    try {
      const row = this.db.prepare('SELECT provider FROM calendars WHERE id = ?').get(id) as Pick<CalendarRow, 'provider'> | undefined;
      if (!row) throw new Error(`Calendar not found: ${id}`);
      if (row.provider === 'google') {
        return await this._syncGoogleInternal(id);
      }
      return await this._syncIcsInternal(id);
    } finally {
      this.syncInFlight.delete(id);
    }
  }

  private async _syncIcsInternal(id: string): Promise<CalendarEvent[]> {
    const row = this.db.prepare('SELECT * FROM calendars WHERE id = ?').get(id) as
      | CalendarRow
      | undefined;
    if (!row) throw new Error(`Calendar not found: ${id}`);

    const icsUrl = this.secrets.get(row.ics_url_secret_id);
    if (!icsUrl) throw new Error(`No ICS URL stored for calendar ${id}`);

    // Validate only — do NOT rewrite the hostname to its resolved IP. Connecting by raw IP
    // breaks TLS SNI, and providers that route HTTPS by hostname at the load balancer (Google,
    // Cloudflare-fronted hosts, etc. — i.e. most of them) respond with a generic self-signed
    // fallback cert instead of the real one, hard-failing every fetch with
    // DEPTH_ZERO_SELF_SIGNED_CERT. Confirmed live against a real Google Calendar ICS URL. This
    // reopens a narrow DNS-rebinding TOCTOU window (check now, fetch a moment later) — same
    // accepted tradeoff already made for update.ts's manifest fetch elsewhere in this codebase.
    await assertSafeFetchUrl(icsUrl);
    const rawEvents = await fetchWithRetry(async () => {
      const signal = AbortSignal.timeout(15_000);
      const res = await fetch(icsUrl, { signal, redirect: 'error' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let bytesRead = 0;
      const chunks: Uint8Array[] = [];
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > 10 * 1024 * 1024) {
          reader.cancel().catch(() => { /* ignore */ });
          throw new Error('ICS response too large');
        }
        chunks.push(value);
      }
      const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
      // `import * as ical` under Node's native ESM/CJS interop only exposes `default` (plus
      // whatever cjs-module-lexer manages to statically detect) — node-ical's actual functions
      // live on the default export at runtime, not directly on the namespace, and TypeScript's
      // types don't even agree with Node's runtime interop about that (a real TS-vs-runtime
      // divergence, not just a typo). This was never actually exercised until fetches started
      // succeeding for the first time this session — every prior sync attempt failed earlier,
      // at the network layer. Value comes from the default import; ical.VEvent below still
      // uses the type-only namespace import for its type reference.
      return icalDefault.parseICS(text);
    });

    const events: Array<{
      id: string;
      calendar_id: string;
      uid: string;
      title: string;
      start: string;
      end: string;
      all_day: number;
      location: string | null;
    }> = [];

    // Recurring events (RRULE) were previously stored as a single instance on their very first
    // occurrence only — every weekly/monthly/yearly series silently vanished from the display
    // after that first date. expandRecurringEvent() (built into node-ical) expands both
    // recurring AND plain one-off events into concrete instances within a bounded window,
    // handling EXDATE exclusions and RECURRENCE-ID overrides for us.
    const now = new Date();
    const windowFrom = new Date(now.getFullYear(), now.getMonth() - ICS_SYNC_WINDOW_MONTHS_PAST, now.getDate());
    const windowTo = new Date(now.getFullYear(), now.getMonth() + ICS_SYNC_WINDOW_MONTHS_FUTURE, now.getDate());

    for (const [, component] of Object.entries(rawEvents)) {
      if (component === undefined || component.type !== 'VEVENT') continue;
      const ev = component as ical.VEvent;
      if (!ev.start) continue;
      // RECURRENCE-ID override components are surfaced automatically when expanding their
      // master event (includeOverrides, on by default) — handling them again here as their own
      // top-level component would double them up.
      if (ev.recurrenceid) continue;

      let instances: ical.EventInstance[];
      try {
        instances = icalDefault.expandRecurringEvent(ev, { from: windowFrom, to: windowTo });
      } catch {
        continue; // malformed RRULE etc. — skip this one event rather than fail the whole sync
      }

      const uidBase = extractIcalString(ev.uid, randomUUID()).slice(0, 512);

      for (const inst of instances) {
        const srcEv = inst.event; // base event, or the override VEVENT for this specific date
        const title = extractIcalString(srcEv.summary, '(No title)').slice(0, 500);
        const locationStr = typeof srcEv.location !== 'undefined' && srcEv.location !== null
          ? extractIcalString(srcEv.location, '')
          : null;
        const location = locationStr === '' ? null : locationStr?.slice(0, 500) ?? null;

        const startDate = new Date(inst.start);
        const endDate = new Date(inst.end);
        const allDay = inst.isFullDay;

        events.push({
          id: randomUUID(),
          calendar_id: id,
          uid: inst.isRecurring ? `${uidBase}:${startDate.toISOString()}` : uidBase,
          title,
          start: allDay ? localDateOnlyIso(startDate) : startDate.toISOString(),
          end: allDay ? inclusiveAllDayEnd(endDate) : endDate.toISOString(),
          all_day: allDay ? 1 : 0,
          location,
        });
      }
    }

    const insertEvent = this.db.prepare(
      `INSERT INTO calendar_events (id, calendar_id, uid, title, start, end, all_day, location)
       VALUES (@id, @calendar_id, @uid, @title, @start, @end, @all_day, @location)`,
    );

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM calendar_events WHERE calendar_id = ?').run(id);
      for (const e of events) insertEvent.run(e);
      this.db
        .prepare(`UPDATE calendars SET last_synced = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .run(id);
    })();

    return events.map((e) => rowToEvent(e as EventRow, row.color));
  }

  private async _syncGoogleInternal(id: string): Promise<CalendarEvent[]> {
    const row = this.db.prepare('SELECT * FROM calendars WHERE id = ?').get(id) as CalendarRow | undefined;
    if (!row) throw new Error(`Calendar not found: ${id}`);

    const googleCalId = this.secrets.get(row.ics_url_secret_id);
    if (!googleCalId) throw new Error(`No Google calendar ID stored for calendar ${id}`);

    const accessToken = await this.refreshGoogleAccessToken();

    const url = new URL(googleEventsUrl(googleCalId));
    const now = new Date();
    url.searchParams.set('timeMin', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
    url.searchParams.set('timeMax', new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');

    await assertSafeFetchUrl(url.toString());
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Google Calendar API error: HTTP ${res.status}`);

    const data = await res.json() as { items?: GoogleEventItem[] };
    const items = data.items ?? [];

    const events: Array<{
      id: string;
      calendar_id: string;
      uid: string;
      title: string;
      start: string;
      end: string;
      all_day: number;
      location: string | null;
    }> = [];

    for (const item of items) {
      if (!item.start) continue;
      const allDay = Boolean(item.start.date && !item.start.dateTime);
      const startStr = item.start.dateTime ?? item.start.date;
      const endStr = item.end?.dateTime ?? item.end?.date ?? startStr;
      if (!startStr) continue;

      events.push({
        id: randomUUID(),
        calendar_id: id,
        uid: (item.id ?? randomUUID()).slice(0, 512),
        title: (item.summary ?? '(No title)').slice(0, 500),
        start: allDay ? googleAllDayIso(startStr) : new Date(startStr).toISOString(),
        end: allDay ? googleInclusiveAllDayEnd(endStr ?? startStr) : new Date(endStr ?? startStr).toISOString(),
        all_day: allDay ? 1 : 0,
        location: item.location ? item.location.slice(0, 500) : null,
      });
    }

    const insertEvent = this.db.prepare(
      `INSERT INTO calendar_events (id, calendar_id, uid, title, start, end, all_day, location)
       VALUES (@id, @calendar_id, @uid, @title, @start, @end, @all_day, @location)`,
    );

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM calendar_events WHERE calendar_id = ?').run(id);
      for (const e of events) insertEvent.run(e);
      this.db
        .prepare(`UPDATE calendars SET last_synced = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .run(id);
    })();

    return events.map((e) => rowToEvent(e as EventRow, row.color));
  }

  // --- Google OAuth helpers ---

  createOAuthState(): string {
    const state = randomBytes(32).toString('hex');
    const now = Date.now();
    // GC expired states
    for (const [s, exp] of this.oauthStates) {
      if (exp < now) this.oauthStates.delete(s);
    }
    this.oauthStates.set(state, now + 10 * 60 * 1000);
    return state;
  }

  consumeOAuthState(state: string): boolean {
    const expiry = this.oauthStates.get(state);
    this.oauthStates.delete(state); // one-time use regardless
    if (expiry === undefined) return false;
    return Date.now() <= expiry;
  }

  hasGoogleCredentials(): boolean {
    return this.secrets.has('google-oauth-client-id') && this.secrets.has('google-oauth-client-secret');
  }

  setGoogleCredentials(clientId: string, clientSecret: string): void {
    this.secrets.set('google-oauth-client-id', 'Google OAuth client_id', clientId);
    this.secrets.set('google-oauth-client-secret', 'Google OAuth client_secret', clientSecret);
  }

  getGoogleClientId(): string | null {
    return this.secrets.get('google-oauth-client-id');
  }

  hasGoogleRefreshToken(): boolean {
    return this.secrets.has('google-oauth-refresh-token');
  }

  async exchangeGoogleCode(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string }> {
    const clientId = this.secrets.get('google-oauth-client-id');
    const clientSecret = this.secrets.get('google-oauth-client-secret');
    if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');

    // Guard against a caller supplying an attacker-controlled redirect URI.
    // The only valid values are the two well-known callback paths for this app.
    const validRedirectUris = [
      'http://localhost:3000/api/calendars/oauth/google/callback',
      'http://smartdisplay.local/api/calendars/oauth/google/callback',
    ];
    if (!validRedirectUris.includes(redirectUri)) {
      throw new Error(`Invalid redirectUri: ${redirectUri}`);
    }

    await assertSafeFetchUrl(GOOGLE_TOKEN_URL);
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Google token exchange failed: HTTP ${res.status}`);
    }

    const data = await res.json() as { access_token?: string; refresh_token?: string };
    if (!data.access_token || !data.refresh_token) {
      throw new Error('Missing tokens in Google OAuth response');
    }
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
  }

  async refreshGoogleAccessToken(): Promise<string> {
    const refreshToken = this.secrets.get('google-oauth-refresh-token');
    const clientId = this.secrets.get('google-oauth-client-id');
    const clientSecret = this.secrets.get('google-oauth-client-secret');
    if (!refreshToken || !clientId || !clientSecret) throw new Error('Google OAuth not configured');

    await assertSafeFetchUrl(GOOGLE_TOKEN_URL);
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Google token refresh failed: HTTP ${res.status}`);
    const data = await res.json() as { access_token?: string };
    if (!data.access_token) throw new Error('No access_token in Google refresh response');
    return data.access_token;
  }

  storeGoogleTokens(accessToken: string, refreshToken: string): void {
    // Access token is temporary (used for listing calendars after OAuth callback)
    this.secrets.set('google-oauth-access-token-pending', 'Google OAuth pending access token', accessToken);
    this.secrets.set('google-oauth-refresh-token', 'Google OAuth refresh token', refreshToken);
  }

  async listGoogleCalendars(): Promise<Array<{ id: string; name: string; color: string }>> {
    // Use pending access token if available, otherwise get a fresh one via refresh token.
    // Clear the pending token after first use so short-lived credentials don't linger.
    const pendingToken = this.secrets.get('google-oauth-access-token-pending');
    let accessToken = pendingToken ?? await this.refreshGoogleAccessToken();

    await assertSafeFetchUrl(GOOGLE_CALENDAR_LIST_URL);
    let res = await fetch(GOOGLE_CALENDAR_LIST_URL, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok && res.status === 401 && pendingToken) {
      // Pending token expired; fall back to refresh token
      accessToken = await this.refreshGoogleAccessToken();
      res = await fetch(GOOGLE_CALENDAR_LIST_URL, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    }

    // Pending token consumed — remove it regardless of outcome
    if (pendingToken) this.secrets.delete('google-oauth-access-token-pending');

    if (!res.ok) throw new Error(`Google Calendar list failed: HTTP ${res.status}`);

    const data = await res.json() as { items?: GoogleCalendarListItem[] };
    return (data.items ?? []).map((c) => ({
      id: c.id,
      name: c.summary,
      color: c.backgroundColor ?? '#4a90e2',
    }));
  }

  listLocalEvents(): LocalEvent[] {
    const rows = this.db
      .prepare(`SELECT * FROM calendar_events WHERE source = 'local' ORDER BY start ASC`)
      .all() as EventRow[];
    return rows.map(rowToLocalEvent);
  }

  createLocalEvent(body: CreateLocalEventBody): LocalEvent {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO calendar_events (id, calendar_id, uid, title, start, end, all_day, location, source)
         VALUES (?, 'local', ?, ?, ?, ?, ?, ?, 'local')`,
      )
      .run(id, id, body.title.trim(), body.start, body.end, body.allDay ? 1 : 0, body.location?.trim() ?? null);
    return rowToLocalEvent(this.db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as EventRow);
  }

  updateLocalEvent(id: string, body: UpdateLocalEventBody): LocalEvent {
    const existing = this.db
      .prepare(`SELECT * FROM calendar_events WHERE id = ? AND source = 'local'`)
      .get(id) as EventRow | undefined;
    if (!existing) throw new Error(`Local event not found: ${id}`);
    this.db
      .prepare(
        `UPDATE calendar_events SET title = ?, start = ?, end = ?, all_day = ?, location = ?
         WHERE id = ? AND source = 'local'`,
      )
      .run(
        (body.title ?? existing.title).trim(),
        body.start ?? existing.start,
        body.end ?? existing.end,
        body.allDay !== undefined ? (body.allDay ? 1 : 0) : existing.all_day,
        body.location !== undefined ? (body.location?.trim() ?? null) : existing.location,
        id,
      );
    return rowToLocalEvent(this.db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as EventRow);
  }

  deleteLocalEvent(id: string): void {
    const result = this.db
      .prepare(`DELETE FROM calendar_events WHERE id = ? AND source = 'local'`)
      .run(id);
    if (result.changes === 0) throw new Error(`Local event not found: ${id}`);
  }

  getState(): CalendarState {
    const rows = this.db
      .prepare('SELECT * FROM calendars ORDER BY created_at ASC')
      .all() as CalendarRow[];

    const sources = rows.map((row) => {
      const url = this.secrets.get(row.ics_url_secret_id) ?? '';
      return rowToSourcePublic(row, url);
    });

    const colorMap = new Map(rows.map((r) => [r.id, r.color]));

    // Window widened from the original "-1 day / +45 days" (built for a since-removed rolling
    // upcoming-events list) to match the ICS sync window — the display is a full month grid now,
    // and the old window silently hid everything more than a day in the past, breaking any day
    // earlier in the current month the moment "today" moved past it.
    const eventRows = this.db
      .prepare(
        `SELECT e.* FROM calendar_events e
         JOIN calendars c ON c.id = e.calendar_id
         WHERE c.enabled = 1
           AND e.start >= datetime('now', '-6 months')
           AND e.start <= datetime('now', '+24 months')
         ORDER BY e.start ASC`,
      )
      .all() as EventRow[];

    const rules = this.settings.get().eventSymbolRules;
    const events = eventRows.map((e) => {
      const event = rowToEvent(e, colorMap.get(e.calendar_id) ?? '#4a90e2');
      if (rules.length > 0) {
        const lower = event.title.toLowerCase();
        const match = rules.find((r) => r.keyword && lower.includes(r.keyword.toLowerCase()));
        if (match) event.title = `${match.symbol} ${event.title}`;
      }
      return event;
    });

    return { sources, events };
  }
}
