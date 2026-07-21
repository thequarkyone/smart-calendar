import type { BackgroundSource, BackgroundState, CalendarSourcePublic, CalendarState, CreateLocalEventBody, FeedsState, HaEntityBrowse, HaState, LocalEvent, PhotoState, Settings, SpotifyState, TasksState, Template, Tile, UpdateLocalEventBody, WeatherState, WidgetStyle } from '@smart-display/shared';

// Auth is carried by an HttpOnly `sdToken` cookie set by POST /api/auth/verify — never in
// localStorage (XSS-readable). The server no longer returns the token in the response body, so
// `_token` is normally null and same-origin fetch sends the cookie automatically. The in-memory
// token + Authorization-header path below is a dormant fallback for a hypothetical cross-origin
// deployment; it is not exercised in the current same-origin architecture.
// The raw PIN is never stored or re-sent after the initial verify call.
let _token: string | null = null;

// Fires whenever any request comes back 401 — the session cookie/token is dead (expired, or
// the server restarted and wiped its in-memory session map). There is no other path back to a
// PIN prompt once onboarding is complete (OnboardingWizard, the only place that calls
// verifyPin(), stops rendering forever after onboardingComplete flips true) — so without this,
// a session going stale post-onboarding permanently strands the user with silently-failing
// requests and no way to re-authenticate through the UI.
let _onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  _onUnauthorized = fn;
}

export function setApiToken(token: string): void {
  _token = token;
}

export function loadApiToken(): void {
  // In production the httpOnly cookie handles auth automatically.
  // In development the in-memory token is populated after a successful verifyPin().
}

export function clearApiToken(): void {
  if (_token) {
    // Best-effort server revocation; server also clears the httpOnly cookie.
    fetch('/api/auth/session', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${_token}` },
    }).catch(() => undefined);
  }
  _token = null;
}

export async function verifyPin(pin: string): Promise<{ ok: boolean }> {
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) return { ok: false };
  const data = await res.json() as { ok: boolean; token?: string };
  if (data.ok && data.token) {
    setApiToken(data.token);
  }
  return { ok: data.ok };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out — is the device on?');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 429) throw new Error('Too many requests — please wait a moment and try again.');
  if (res.status === 401) {
    _onUnauthorized?.();
    throw new Error('Your session expired — please re-enter your PIN.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function getSettings(): Promise<Settings> {
  return request<Settings>('/api/settings');
}

export function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  return request<Settings>('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function getTiles(): Promise<Tile[]> {
  return request<Tile[]>('/api/tiles');
}

export function patchTile(id: string, enabled: boolean): Promise<Tile> {
  return request<Tile>(`/api/tiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export function patchTileStyle(id: string, style: WidgetStyle): Promise<Tile> {
  return request<Tile>(`/api/tiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style }),
  });
}

export function patchTileConfig(id: string, config: Record<string, unknown>): Promise<Tile> {
  return request<Tile>(`/api/tiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
}

export function uploadPhoto(file: File): Promise<{ filename: string }> {
  const form = new FormData();
  form.append('file', file);
  return request<{ filename: string }>('/api/photos/upload', { method: 'POST', body: form });
}

export function getCalendars(): Promise<CalendarSourcePublic[]> {
  return request<CalendarSourcePublic[]>('/api/calendars');
}

export function addCalendar(name: string, icsUrl: string, color: string): Promise<CalendarSourcePublic> {
  return request<CalendarSourcePublic>('/api/calendars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, icsUrl, color }),
  });
}

export function patchCalendar(id: string, enabled: boolean): Promise<CalendarSourcePublic> {
  return request<CalendarSourcePublic>(`/api/calendars/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export function deleteCalendar(id: string): Promise<void> {
  return request<void>(`/api/calendars/${id}`, { method: 'DELETE' });
}

export function syncCalendar(id: string): Promise<CalendarState> {
  return request<CalendarState>(`/api/calendars/${id}/sync`, { method: 'POST' });
}

// Weather
export function getWeather(): Promise<WeatherState> {
  return request<WeatherState>('/api/weather');
}

export function refreshWeather(): Promise<WeatherState> {
  return request<WeatherState>('/api/weather/refresh', { method: 'POST' });
}

export interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export function geocodeLocation(query: string): Promise<{ results: GeocodeResult[] }> {
  return request<{ results: GeocodeResult[] }>(`/api/weather/geocode?q=${encodeURIComponent(query)}`);
}

// Photos
export function getPhotos(): Promise<PhotoState> {
  return request<PhotoState>('/api/photos');
}

export function addPhotoSource(name: string, path: string): Promise<PhotoState> {
  return request<PhotoState>('/api/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path }),
  });
}

export function deletePhotoSource(id: string): Promise<PhotoState> {
  return request<PhotoState>(`/api/photos/${id}`, { method: 'DELETE' });
}

export function nextPhoto(): Promise<PhotoState> {
  return request<PhotoState>('/api/photos/next', { method: 'POST' });
}

// Tasks
export function getTasks(): Promise<TasksState> {
  return request<TasksState>('/api/tasks');
}

export function addTaskList(name: string, color: string): Promise<TasksState> {
  return request<TasksState>('/api/tasks/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
}

export function deleteTaskList(id: string): Promise<TasksState> {
  return request<TasksState>(`/api/tasks/lists/${id}`, { method: 'DELETE' });
}

export function addTask(listId: string, title: string, dueDate?: string): Promise<TasksState> {
  return request<TasksState>(`/api/tasks/lists/${listId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, dueDate }),
  });
}

export function toggleTask(id: string): Promise<TasksState> {
  return request<TasksState>(`/api/tasks/tasks/${id}/toggle`, { method: 'PATCH' });
}

export function updateTask(id: string, patch: { title?: string; dueDate?: string | null }): Promise<TasksState> {
  return request<TasksState>(`/api/tasks/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function deleteTask(id: string): Promise<TasksState> {
  return request<TasksState>(`/api/tasks/tasks/${id}`, { method: 'DELETE' });
}

// Feeds
export function getFeeds(): Promise<FeedsState> {
  return request<FeedsState>('/api/feeds');
}

export function addFeed(name: string, url: string, maxItems?: number): Promise<FeedsState> {
  return request<FeedsState>('/api/feeds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, url, maxItems }),
  });
}

export function deleteFeed(id: string): Promise<FeedsState> {
  return request<FeedsState>(`/api/feeds/${id}`, { method: 'DELETE' });
}

export function syncFeed(id: string): Promise<FeedsState> {
  return request<FeedsState>(`/api/feeds/${id}/sync`, { method: 'POST' });
}

// Home Assistant
export function getHa(): Promise<HaState> {
  return request<HaState>('/api/ha');
}

export function patchHaSettings(patch: { url?: string; token?: string; enabled?: boolean }): Promise<HaState> {
  return request<HaState>('/api/ha/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function testHaConnection(): Promise<{ ok: boolean; error?: string }> {
  return request<{ ok: boolean; error?: string }>('/api/ha/test', { method: 'POST' });
}

export function refreshHa(): Promise<HaState> {
  return request<HaState>('/api/ha/refresh', { method: 'POST' });
}

export function browseHaEntities(): Promise<HaEntityBrowse[]> {
  return request<HaEntityBrowse[]>('/api/ha/browse');
}

export function addHaEntity(entityId: string): Promise<HaState> {
  return request<HaState>('/api/ha/entities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityId }),
  });
}

export function deleteHaEntity(entityId: string): Promise<HaState> {
  return request<HaState>(`/api/ha/entities/${entityId}`, { method: 'DELETE' });
}

// Templates
export function getTemplates(): Promise<Template[]> {
  return request<Template[]>('/api/templates');
}

// Local (manual) events
export function getLocalEvents(): Promise<LocalEvent[]> {
  return request<LocalEvent[]>('/api/calendars/local/events');
}

export function createLocalEvent(body: CreateLocalEventBody): Promise<LocalEvent> {
  return request<LocalEvent>('/api/calendars/local/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateLocalEvent(id: string, body: UpdateLocalEventBody): Promise<LocalEvent> {
  return request<LocalEvent>(`/api/calendars/local/events/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteLocalEvent(id: string): Promise<void> {
  return request<void>(`/api/calendars/local/events/${id}`, { method: 'DELETE' });
}

export function getLocalCalendarColor(): Promise<{ color: string }> {
  return request<{ color: string }>('/api/calendars/local/color');
}

export function patchLocalCalendarColor(color: string): Promise<{ color: string }> {
  return request<{ color: string }>('/api/calendars/local/color', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color }),
  });
}

// Google Calendar OAuth
export function setGoogleOAuthCredentials(clientId: string, clientSecret: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/calendars/oauth/google/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
}

export function startGoogleOAuth(): Promise<{ url: string }> {
  return request<{ url: string }>('/api/calendars/oauth/google/start');
}

export function listGoogleCalendars(): Promise<Array<{ id: string; name: string; color: string }>> {
  return request<Array<{ id: string; name: string; color: string }>>('/api/calendars/oauth/google/list');
}

export function addGoogleCalendar(googleCalendarId: string, name: string, color: string): Promise<CalendarSourcePublic> {
  return request<CalendarSourcePublic>('/api/calendars/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ googleCalendarId, name, color }),
  });
}

export function getSpotifyStatus(): Promise<SpotifyState> {
  return request<SpotifyState>('/api/spotify/status');
}

export function saveSpotifyCredentials(clientId: string, clientSecret: string): Promise<{ ok: boolean; authUrl: string }> {
  return request<{ ok: boolean; authUrl: string }>('/api/spotify/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
}

export function disconnectSpotify(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/spotify/disconnect', { method: 'DELETE' });
}

export function getBackgroundState(): Promise<BackgroundState> {
  return request<BackgroundState>('/api/background');
}

export function refreshBackground(): Promise<BackgroundState> {
  return request<BackgroundState>('/api/background/refresh', { method: 'POST' });
}

export function saveBackgroundKey(source: BackgroundSource, apiKey: string): Promise<{ ok: boolean; settings: Settings }> {
  return request<{ ok: boolean; settings: Settings }>('/api/background/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, apiKey }),
  });
}

export function deleteBackgroundKey(source: BackgroundSource): Promise<{ ok: boolean; settings: Settings }> {
  return request<{ ok: boolean; settings: Settings }>(`/api/background/keys/${source}`, { method: 'DELETE' });
}
