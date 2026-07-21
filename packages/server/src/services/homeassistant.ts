import type Database from 'better-sqlite3';
import type { HaEntity, HaEntityBrowse, HaSettings, HaSettingsPublic, HaState } from '@smart-display/shared';
import type { SecretsService } from './secrets.js';
import { assertSafeFetchUrl, ENTITY_ID_RE } from '../util/url-guard.js';

interface HaRow {
  url: string | null;
  enabled: number;
  token_secret_id: string | null;
  entity_ids: string;
}

// HA WebSocket message shapes we care about
interface HaWsAuthRequired { type: 'auth_required' }
interface HaWsAuthOk { type: 'auth_ok' }
interface HaWsAuthInvalid { type: 'auth_invalid' }
interface HaWsResult { type: 'result'; id: number; success: boolean; result: unknown }
interface HaWsEvent {
  type: 'event';
  id: number;
  event: {
    event_type: string;
    data: { entity_id?: string; new_state?: HaRawState | null };
  };
}
type HaWsMessage = HaWsAuthRequired | HaWsAuthOk | HaWsAuthInvalid | HaWsResult | HaWsEvent;

interface HaRawState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    unit_of_measurement?: string;
    icon?: string;
  };
}

function rawToEntity(data: HaRawState): HaEntity {
  return {
    entityId: data.entity_id,
    name: (data.attributes.friendly_name ?? data.entity_id).slice(0, 200),
    state: data.state.slice(0, 200),
    unit: data.attributes.unit_of_measurement?.slice(0, 50) ?? null,
    icon: data.attributes.icon ?? null,
    domain: data.entity_id.split('.')[0] ?? data.entity_id,
    attributes: data.attributes,
  };
}

export class HaService {
  private error: string | null = null;
  private connectedAt: string | null = null;
  private entities: HaEntity[] = [];
  private ws: import('ws').WebSocket | null = null;
  private wsConnected = false;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private msgId = 1;
  private onStateChange: (() => void) | null = null;
  private connectEpoch = 0;

  constructor(
    private readonly db: Database.Database,
    private readonly secrets: SecretsService,
  ) {}

  /** Register a callback invoked whenever entity state changes via WS. */
  setOnStateChange(cb: () => void): void {
    this.onStateChange = cb;
  }

  private getRow(): HaRow {
    return this.db.prepare('SELECT * FROM ha_config WHERE id = 1').get() as HaRow;
  }

  private getHaSettingsInternal(): HaSettings {
    const row = this.getRow();
    const token = row.token_secret_id ? (this.secrets.get(row.token_secret_id) ?? null) : null;
    return { url: row.url, token, enabled: row.enabled === 1 };
  }

  getHaSettings(): HaSettingsPublic {
    const row = this.getRow();
    const tokenSet = row.token_secret_id != null && (this.secrets.get(row.token_secret_id) ?? '').length > 0;
    return { url: row.url, token: null, tokenSet, enabled: row.enabled === 1 };
  }

  async setHaSettings(url: string | null, token: string | null, enabled: boolean): Promise<void> {
    if (url) await assertSafeFetchUrl(url);
    const row = this.getRow();
    let tokenSecretId = row.token_secret_id;
    if (token === '') {
      if (tokenSecretId) {
        this.secrets.delete(tokenSecretId);
        tokenSecretId = null;
      }
    } else if (token !== null) {
      if (!tokenSecretId) tokenSecretId = 'ha-token';
      this.secrets.set(tokenSecretId, 'Home Assistant token', token);
    }
    this.db
      .prepare(`UPDATE ha_config SET url = ?, enabled = ?, token_secret_id = ?, updated_at = datetime('now') WHERE id = 1`)
      .run(url, enabled ? 1 : 0, tokenSecretId);

    // Reconnect WS with new settings
    this.disconnectWs();
    if (enabled && url) {
      this.connectWs();
    }
  }

  getEntityIds(): string[] {
    const row = this.getRow();
    try {
      return JSON.parse(row.entity_ids) as string[];
    } catch {
      return [];
    }
  }

  setEntityIds(ids: string[]): void {
    this.db.prepare(`UPDATE ha_config SET entity_ids = ?, updated_at = datetime('now') WHERE id = 1`).run(JSON.stringify(ids));
  }

  addEntityId(id: string): void {
    const ids = this.getEntityIds();
    if (!ids.includes(id)) {
      this.setEntityIds([...ids, id]);
    }
  }

  removeEntityId(id: string): void {
    this.setEntityIds(this.getEntityIds().filter((e) => e !== id));
  }

  // --- REST fetch (used for initial load & manual refresh) ---

  async fetchEntities(entityIds: string[]): Promise<HaEntity[]> {
    const { url, token } = this.getHaSettingsInternal();
    if (!url || !token) throw new Error('HA not configured');
    await assertSafeFetchUrl(url);

    const expectedHostname = new URL(url).hostname;
    const results: HaEntity[] = [];
    for (const entityId of entityIds) {
      if (!ENTITY_ID_RE.test(entityId)) continue;
      const entityUrl = `${url}/api/states/${encodeURIComponent(entityId)}`;
      // Guard against URL confusion after path appending (e.g. trailing slash tricks)
      if (new URL(entityUrl).hostname !== expectedHostname) continue;
      const res = await fetch(entityUrl, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      // 5 MB cap per entity — mirrors the cap in browseEntities()
      const MAX_BYTES = 5 * 1024 * 1024;
      const reader = res.body?.getReader();
      if (!reader) continue;
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      let tooLarge = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_BYTES) { await reader.cancel(); tooLarge = true; break; }
          chunks.push(value);
        }
      }
      if (tooLarge) continue;
      const data = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as HaRawState;
      results.push(rawToEntity(data));
    }
    this.entities = results;
    this.connectedAt = new Date().toISOString();
    this.error = null;
    return results;
  }

  /** Fetch all states from HA for the entity browser. */
  async browseEntities(): Promise<HaEntityBrowse[]> {
    const { url, token } = this.getHaSettingsInternal();
    if (!url || !token) throw new Error('HA not configured');
    await assertSafeFetchUrl(url);
    const res = await fetch(`${url}/api/states`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HA returned HTTP ${res.status}`);
    // Stream response with 5 MB cap — large HA installations can return MBs of entity data
    const MAX_BYTES = 5 * 1024 * 1024;
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BYTES) {
          await reader.cancel();
          throw new Error('HA response too large');
        }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks).toString('utf-8');
    const data = JSON.parse(text) as HaRawState[];
    return data
      .filter((d) => ENTITY_ID_RE.test(d.entity_id))
      .map((d) => ({
        entityId: d.entity_id,
        name: d.attributes.friendly_name ?? d.entity_id,
        state: d.state,
        unit: d.attributes.unit_of_measurement ?? null,
        domain: d.entity_id.split('.')[0] ?? d.entity_id,
      }))
      .sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
  }

  async test(): Promise<{ ok: boolean; error?: string }> {
    const { url, token } = this.getHaSettingsInternal();
    if (!url || !token) return { ok: false, error: 'Not configured' };
    try {
      await assertSafeFetchUrl(url);
      const res = await fetch(`${url}/api/`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
      try {
        if (res.ok) return { ok: true };
        return { ok: false, error: `HTTP ${res.status}` };
      } finally {
        await res.body?.cancel();
      }
    } catch {
      return { ok: false, error: 'Connection failed' };
    }
  }

  private static readonly TOGGLEABLE_DOMAINS = new Set(['light', 'switch', 'input_boolean', 'cover']);

  async toggleEntity(entityId: string): Promise<void> {
    if (!ENTITY_ID_RE.test(entityId)) throw new Error('Invalid entity ID');
    const domain = entityId.split('.')[0] ?? '';
    if (!HaService.TOGGLEABLE_DOMAINS.has(domain)) {
      const err = new Error(`Domain '${domain}' does not support toggle`);
      (err as NodeJS.ErrnoException).code = 'UNSUPPORTED_DOMAIN';
      throw err;
    }
    const { url, token } = this.getHaSettingsInternal();
    if (!url || !token) throw new Error('HA not configured');
    await assertSafeFetchUrl(url);
    const serviceUrl = `${url}/api/services/${domain}/toggle`;
    if (new URL(serviceUrl).hostname !== new URL(url).hostname) throw new Error('URL mismatch');
    const res = await fetch(serviceUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entityId }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HA returned HTTP ${res.status}`);
  }

  getState(): HaState {
    return {
      settings: this.getHaSettings(),
      entities: this.entities,
      connectedAt: this.connectedAt,
      error: this.error,
      wsConnected: this.wsConnected,
    };
  }

  // --- WebSocket subscription ---

  connectWs(): void {
    const { url, token, enabled } = this.getHaSettingsInternal();
    if (!url || !token || !enabled) return;

    // Capture epoch so a disconnectWs() racing the async SSRF check can abort this invocation
    const epoch = ++this.connectEpoch;

    // Build ws(s):// URL from http(s)://. Validate only — do NOT connect by resolved IP:
    // a HA instance behind an SNI-routed reverse proxy (Cloudflare Tunnel, Nginx Proxy
    // Manager, Traefik — all common HA setups) would get a wrong/self-signed cert if TLS SNI
    // doesn't carry the real hostname, exactly as confirmed against calendar/feed fetches
    // elsewhere in this codebase. Reopens a narrow DNS-rebinding TOCTOU window between
    // validation and connect — same accepted tradeoff as update.ts's manifest fetch.
    const wsUrlBase = url.replace(/^http/, 'ws') + '/api/websocket';

    assertSafeFetchUrl(wsUrlBase)
      .then(() => {
        if (this.connectEpoch !== epoch) return; // disconnectWs() called while resolving
        return import('ws').then(({ default: WS }) => {
          if (this.connectEpoch !== epoch) return; // disconnectWs() called during dynamic import
          const ws = new WS(wsUrlBase);
          this.ws = ws;

          ws.on('message', (raw: Buffer) => {
            let msg: HaWsMessage;
            try {
              msg = JSON.parse(raw.toString()) as HaWsMessage;
            } catch {
              return;
            }
            this.handleWsMessage(msg, token);
          });

          ws.on('close', () => {
            this.wsConnected = false;
            this.ws = null;
            this.wsReconnectTimer = setTimeout(() => {
              const s = this.getHaSettingsInternal();
              if (s.enabled && s.url) this.connectWs();
            }, 15_000);
          });

          ws.on('error', (err: Error) => {
            console.error('[ha] ws error:', err.message);
            this.error = err.message;
          });
        });
      })
      .catch((err: unknown) => {
        console.error('[ha] connectWs failed:', (err as Error).message ?? err);
        this.error = 'Connection failed';
      });
  }

  private handleWsMessage(msg: HaWsMessage, token: string): void {
    if (msg.type === 'auth_required') {
      this.wsSend({ type: 'auth', access_token: token });
    } else if (msg.type === 'auth_ok') {
      this.wsConnected = true;
      this.connectedAt = new Date().toISOString();
      this.error = null;
      const id = this.msgId++;
      // Subscribe to state_changed events
      this.wsSend({ id, type: 'subscribe_events', event_type: 'state_changed' });
      // Also do an initial REST fetch to populate entities immediately
      const entityIds = this.getEntityIds();
      if (entityIds.length > 0) {
        this.fetchEntities(entityIds)
          .then(() => this.onStateChange?.())
          .catch((err: unknown) => console.error('[ha] initial fetch error:', err));
      }
    } else if (msg.type === 'auth_invalid') {
      this.wsConnected = false;
      this.error = 'Invalid token';
      this.ws?.close();
    } else if (msg.type === 'event') {
      const event = msg.event;
      if (event.event_type !== 'state_changed') return;
      const { entity_id, new_state } = event.data;
      if (!entity_id || !new_state) return;
      const tracked = this.getEntityIds();
      if (!tracked.includes(entity_id)) return;
      // Update the specific entity in-place
      const updated = rawToEntity(new_state);
      const idx = this.entities.findIndex((e) => e.entityId === entity_id);
      if (idx >= 0) {
        this.entities[idx] = updated;
      } else {
        this.entities.push(updated);
      }
      this.onStateChange?.();
    }
  }

  private wsSend(data: unknown): void {
    if (this.ws?.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnectWs(): void {
    // Invalidate any in-flight connectWs() async chain
    this.connectEpoch++;
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.wsConnected = false;
  }
}
