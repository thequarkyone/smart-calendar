/** A read-only calendar subscribed via a secret iCal (.ics) URL. Internal use only — never send over wire. */
export interface CalendarSource {
  id: string;
  name: string;
  /** Secret iCal subscription URL (Google/iCloud/Outlook). Bearer secret. */
  icsUrl: string;
  /** Hex color used to render this calendar's events. */
  color: string;
  enabled: boolean;
  /** ISO timestamp of the last successful sync, or null if never. */
  lastSynced: string | null;
}

/** Public DTO for CalendarSource — icsUrl is omitted, replaced by icsUrlSet flag. Use on all API/WS paths. */
export interface CalendarSourcePublic {
  id: string;
  name: string;
  /** 'ics' for iCal subscriptions, 'google' for Google Calendar OAuth. */
  provider: 'ics' | 'google';
  icsUrlSet: boolean;
  color: string;
  enabled: boolean;
  lastSynced: string | null;
  /** True for the built-in holidays calendar — cannot be deleted, only toggled. */
  isBuiltin?: boolean;
}

/** A single calendar event, normalized across providers. */
export interface CalendarEvent {
  calendarId: string;
  uid: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location?: string;
  color: string;
}

/** Full calendar state pushed to the display over WebSocket. */
export interface CalendarState {
  sources: CalendarSourcePublic[];
  events: CalendarEvent[];
}

/** A manually-created event stored locally on the device. */
export interface LocalEvent {
  id: string;
  title: string;
  /** ISO date string (all-day) or ISO datetime string. */
  start: string;
  /** ISO date string (all-day) or ISO datetime string. */
  end: string;
  allDay: boolean;
  location?: string;
}

export interface CreateLocalEventBody {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

export type UpdateLocalEventBody = Partial<CreateLocalEventBody>;
