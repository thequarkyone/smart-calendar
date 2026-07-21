import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Tile } from '@smart-display/shared';
import type { AppContext } from '../app.js';
import { assertSafeFetchUrl } from '../util/url-guard.js';
import { validateSettingsPatch } from './settings.js';
import type { Settings } from '@smart-display/shared';

interface BackupCalendar {
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

interface BackupFeed {
  name: string;
  url: string;
  enabled: boolean;
  maxItems: number;
}

interface BackupTaskItem {
  title: string;
  dueDate: string | null;
  done: boolean;
}

interface BackupTaskList {
  name: string;
  color: string;
  tasks: BackupTaskItem[];
}

export interface BackupFile {
  version: 1;
  exportedAt: string;
  settings: Record<string, unknown>;
  tiles: Tile[];
  calendars: BackupCalendar[];
  feeds: BackupFeed[];
  taskLists: BackupTaskList[];
  ha: { url: string | null; enabled: boolean };
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

const KNOWN_TILE_TYPES = new Set([
  'clock', 'weather', 'calendar', 'tasks', 'news', 'photos', 'ha', 'spotify',
  'custom_text', 'motd', 'countdown', 'today_agenda',
]);
const VALID_TILE_SLOT_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const VALID_TILE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_TILES = 50;
const MAX_TILE_CONFIG_BYTES = 65536; // 64 KB
const MAX_NAME_LEN = 200;
const MAX_TASK_TITLE_LEN = 200;
const MAX_SYMBOL_RULES = 50;
const MAX_RULE_KEYWORD_LEN = 100;
const MAX_RULE_SYMBOL_LEN = 10;

function pinValid(provided: string | undefined, correct: string): boolean {
  const p = typeof provided === 'string' ? provided : '';
  if (p.length > 64) return false;
  const maxLen = Math.max(p.length, correct.length);
  return (
    timingSafeEqual(Buffer.from(p.padEnd(maxLen, '\0')), Buffer.from(correct.padEnd(maxLen, '\0'))) &&
    p.length === correct.length
  );
}

function validateBackup(data: unknown): BackupFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d['version'] !== 1) return null;
  if (!isString(d['exportedAt'])) return null;
  if (typeof d['settings'] !== 'object' || d['settings'] === null) return null;
  if (!Array.isArray(d['tiles'])) return null;
  if (!Array.isArray(d['calendars'])) return null;
  if (!Array.isArray(d['feeds'])) return null;
  if (!Array.isArray(d['taskLists'])) return null;
  if (typeof d['ha'] !== 'object' || d['ha'] === null) return null;
  // Validate tile array: id format, known type, slot format, config size
  if (d['tiles'].length > MAX_TILES) return null;
  for (const tile of d['tiles'] as unknown[]) {
    if (typeof tile !== 'object' || tile === null) return null;
    const t = tile as Record<string, unknown>;
    if (!isString(t['id']) || !VALID_TILE_ID_RE.test(t['id'])) return null;
    if (!isString(t['type']) || !KNOWN_TILE_TYPES.has(t['type'])) return null;
    if (t['slot'] !== null && t['slot'] !== undefined && (!isString(t['slot']) || !VALID_TILE_SLOT_RE.test(t['slot']))) return null;
    const configJson = JSON.stringify(t['config'] ?? {});
    if (configJson.length > MAX_TILE_CONFIG_BYTES) return null;
  }
  // Validate eventSymbolRules if present in settings
  const settings = d['settings'] as Record<string, unknown>;
  if (settings['eventSymbolRules'] !== undefined) {
    if (!Array.isArray(settings['eventSymbolRules'])) return null;
    if (settings['eventSymbolRules'].length > MAX_SYMBOL_RULES) return null;
    for (const rule of settings['eventSymbolRules'] as unknown[]) {
      if (typeof rule !== 'object' || rule === null) return null;
      const r = rule as Record<string, unknown>;
      if (!isString(r['keyword']) || r['keyword'].length > MAX_RULE_KEYWORD_LEN) return null;
      if (!isString(r['symbol']) || r['symbol'].length > MAX_RULE_SYMBOL_LEN) return null;
    }
  }
  return d as unknown as BackupFile;
}

export function createBackupRoutes(ctx: AppContext) {
  return async function backupRoutes(app: FastifyInstance): Promise<void> {
    app.get('/backup/export', async (_, reply) => {
      const settings = ctx.settings.get();
      const { bgPhotoPath: _bgPhotoPath, ...exportableSettings } = settings;
      void _bgPhotoPath;

      const tasksState = ctx.tasks.getState();
      const _taskListsById = new Map(tasksState.lists.map((l) => [l.id, l]));
      const tasksByList = new Map<string, typeof tasksState.tasks>(
        tasksState.lists.map((l) => [l.id, []]),
      );
      for (const task of tasksState.tasks) {
        tasksByList.get(task.listId)?.push(task);
      }

      const haSettings = ctx.ha.getHaSettings();

      const backup: BackupFile = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: exportableSettings as unknown as Record<string, unknown>,
        tiles: ctx.tiles.list(),
        calendars: ctx.calendars.listIcsForBackup(),
        feeds: ctx.feeds.listForBackup(),
        taskLists: tasksState.lists.map((list) => ({
          name: list.name,
          color: list.color,
          tasks: (tasksByList.get(list.id) ?? []).map((t) => ({
            title: t.title,
            dueDate: t.dueDate ?? null,
            done: t.done,
          })),
        })),
        ha: { url: haSettings.url, enabled: haSettings.enabled },
      };

      const name = (settings.householdName || 'glance').replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const date = new Date().toISOString().slice(0, 10);
      void reply.header('Content-Disposition', `attachment; filename="${name}-backup-${date}.json"`);
      void reply.header('Content-Type', 'application/json');
      return JSON.stringify(backup, null, 2);
    });

    app.post<{ Body: unknown }>(
      '/backup/import',
      {
        // Allow up to 512 KB — a real backup with many tasks/calendars/feeds can exceed the
        // default 4096-byte global limit. This is still a small fraction of available Pi memory.
        bodyLimit: 512 * 1024,
        schema: {
          body: {
            type: 'object',
            required: ['pin'],
            properties: {
              pin: { type: 'string', maxLength: 64 },
              // The remaining backup fields are validated by validateBackup() below
            },
          },
        },
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      },
      async (request, reply) => {
        // Require PIN re-verification — backup import is a full data replacement, not just
        // a settings change. A stolen session token alone should not be enough to wipe data.
        const body = request.body as Record<string, unknown>;
        if (!pinValid(body['pin'] as string | undefined, ctx.settings.getDevicePin())) {
          return reply.status(401).send({ error: 'Invalid PIN' });
        }
        // Validate backup — `pin` is stripped so it doesn't interfere with the schema check
        const { pin: _pin, ...backupPayload } = body;
        void _pin;
        const backup = validateBackup(backupPayload);
        if (!backup) {
          request.log.warn({ ip: request.ip }, 'backup import: invalid format');
          return reply.status(400).send({ error: 'Invalid backup file format.' });
        }

        // --- Settings ---
        const { onboardingComplete: _oc, bgPhotoPath: _bp, ...settingsPatch } = backup.settings as Record<string, unknown>;
        void _oc; void _bp;
        // Validate imported settings the same way PATCH /api/settings does — a backup file is
        // untrusted input (only PIN-gated), so invalid enum/range/regex values must not reach the DB.
        const settingsError = validateSettingsPatch(settingsPatch as Partial<Settings>);
        if (settingsError) {
          request.log.warn({ ip: request.ip, err: settingsError }, 'backup import: invalid settings');
          return reply.status(400).send({ error: `Invalid backup settings: ${settingsError}` });
        }
        try {
          ctx.settings.update(settingsPatch as Parameters<typeof ctx.settings.update>[0]);
        } catch {
          // Non-fatal: best-effort settings restore
        }

        // --- Tiles ---
        ctx.db.prepare('DELETE FROM tiles').run();
        const insertTile = ctx.db.prepare(
          `INSERT OR IGNORE INTO tiles (id, type, slot, enabled, config, sort_order)
           VALUES (@id, @type, @slot, @enabled, @config, @sort_order)`,
        );
        ctx.db.transaction(() => {
          for (const tile of backup.tiles) {
            const config = JSON.stringify({ ...tile.config, style: tile.style });
            insertTile.run({
              id: tile.id,
              type: tile.type,
              slot: tile.slot,
              enabled: tile.enabled ? 1 : 0,
              config,
              sort_order: 0,
            });
          }
        })();

        // --- Calendars (ICS only) ---
        for (const existing of ctx.calendars.list()) {
          try { ctx.calendars.remove(existing.id); } catch { /* ignore */ }
        }
        for (const cal of backup.calendars) {
          if (!isString(cal.name) || !isString(cal.url) || !cal.url.startsWith('http')) continue;
          try { await assertSafeFetchUrl(cal.url); } catch {
            request.log.warn({ url: cal.url }, 'backup import: skipping calendar with blocked URL');
            continue;
          }
          const safeName = cal.name.slice(0, MAX_NAME_LEN);
          try {
            await ctx.calendars.add(safeName, cal.url, cal.color ?? '#4a90e2');
          } catch { /* skip invalid URLs */ }
        }

        // --- Feeds ---
        for (const existing of ctx.feeds.list()) {
          try { ctx.feeds.remove(existing.id); } catch { /* ignore */ }
        }
        for (const feed of backup.feeds) {
          if (!isString(feed.name) || !isString(feed.url) || !feed.url.startsWith('http')) continue;
          try { await assertSafeFetchUrl(feed.url); } catch {
            request.log.warn({ url: feed.url }, 'backup import: skipping feed with blocked URL');
            continue;
          }
          const safeName = feed.name.slice(0, MAX_NAME_LEN);
          try {
            await ctx.feeds.add(safeName, feed.url, feed.maxItems ?? 5);
          } catch { /* skip invalid URLs */ }
        }

        // --- Tasks ---
        // Wrap the wipe + repopulate in a single transaction: task list/task creation is fully
        // synchronous, so a crash or power-loss mid-import must not leave the device with the old
        // tasks deleted and the new ones only half-inserted.
        ctx.db.transaction(() => {
          ctx.db.prepare('DELETE FROM tasks').run();
          ctx.db.prepare('DELETE FROM task_lists').run();
          for (const list of backup.taskLists) {
            if (!isString(list.name)) continue;
            const created = ctx.tasks.addList(list.name.slice(0, MAX_NAME_LEN), list.color ?? '#4a90e2');
            for (const task of list.tasks ?? []) {
              if (!isString(task.title)) continue;
              const t = ctx.tasks.addTask(created.id, task.title.slice(0, MAX_TASK_TITLE_LEN), task.dueDate ?? undefined);
              if (task.done) {
                ctx.db.prepare(`UPDATE tasks SET done = 1, updated_at = datetime('now') WHERE id = ?`).run(t.id);
              }
            }
          }
        })();

        // --- HA (URL + enabled; token not restored) ---
        const ha = backup.ha as { url?: unknown; enabled?: unknown };
        if (ha && (isString(ha.url) || ha.url === null)) {
          try {
            await ctx.ha.setHaSettings(
              isString(ha.url) ? ha.url : null,
              null,
              ha.enabled === true,
            );
          } catch { /* ignore invalid HA URL */ }
        }

        // Emit events so the display picks up the restored state
        ctx.bus.emit('settings:changed', ctx.settings.get());
        ctx.bus.emit('tiles:changed', ctx.tiles.list());
        ctx.bus.emit('tasks:state', ctx.tasks.getState());
        ctx.bus.emit('feeds:state', ctx.feeds.getState());

        return { ok: true };
      },
    );
  };
}
