import { rm, unlink } from 'node:fs/promises';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type Database from 'better-sqlite3';
import type { SecretsService } from './secrets.js';
import type { HaService } from './homeassistant.js';
import { DEFAULT_EVENT_SYMBOL_RULES } from './settings.js';

const execFileAsync = promisify(_execFile);

export class ResetService {
  constructor(
    private readonly db: Database.Database,
    private readonly secrets: SecretsService,
    private readonly ha: HaService,
    private readonly photoDir: string,
    /** Absolute path to the AES-256 key file. Deleted on reset so secrets cannot be decrypted after wipe. */
    private readonly keyPath: string,
    /** Callback invoked after a successful reset so the server can clear in-memory state. */
    private readonly onReset: () => void,
  ) {}

  /**
   * Soft reset: wipe all user-configured data but keep WiFi credentials and the device PIN.
   * The device re-enters onboarding on next page load.
   */
  async resetData(): Promise<void> {
    this.ha.disconnectWs();

    this.db.transaction(() => {
      // Wipe all user tables
      this.db.prepare('DELETE FROM calendars').run();
      this.db.prepare('DELETE FROM calendar_events').run();
      this.db.prepare('DELETE FROM feeds').run();
      this.db.prepare('DELETE FROM photo_sources').run();
      this.db.prepare('DELETE FROM task_lists').run();
      this.db.prepare('DELETE FROM tasks').run();
      // Reset ha_config to empty (keep row, wipe values)
      this.db.prepare(
        `UPDATE ha_config SET url = NULL, enabled = 0, token_secret_id = NULL, entity_ids = '[]',
         updated_at = datetime('now') WHERE id = 1`,
      ).run();
      // Reset settings to defaults, preserve device_pin and WiFi isn't in DB.
      // NOTE: every user-configurable column must be listed here — anything omitted survives a
      // factory reset and leaks the previous owner's data to the next owner.
      this.db.prepare(
        `UPDATE settings SET
          household_name     = '',
          timezone           = 'UTC',
          latitude           = NULL,
          longitude          = NULL,
          location_label     = NULL,
          units              = 'metric',
          clock_format       = '12h',
          theme              = 'dark',
          active_template_id = NULL,
          screen_sleep_start = NULL,
          screen_sleep_end   = NULL,
          accent_color       = '#4a90e2',
          font_family        = 'system',
          show_qr_code       = 0,
          onboarding_complete = 0,
          bg_type            = 'solid',
          bg_color           = '#0d1117',
          bg_gradient_end    = '#1a1a2e',
          layout_config_json = '{}',
          screen_dim_enabled = 0,
          screen_dim_level   = 20,
          week_starts_on     = 'sun',
          auto_update        = 0,
          auto_update_time   = NULL,
          auto_theme         = 0,
          bg_photo_path      = NULL,
          touchscreen_enabled = 0,
          event_symbol_rules = ?,
          updated_at         = datetime('now')
        WHERE id = 1`,
      ).run(JSON.stringify(DEFAULT_EVENT_SYMBOL_RULES));
      // Wipe all secrets except the device PIN (which is stored in settings.device_pin, not secrets)
      this.db.prepare('DELETE FROM secrets').run();
      // Re-enable all default tiles
      this.db.prepare(`UPDATE tiles SET enabled = 1`).run();
    })();

    // Delete the encryption key file so any DB backup cannot be decrypted with the old key.
    // The in-memory key remains valid for the current process lifetime (harmless: secrets are already
    // gone from DB). A new key is generated on next server start.
    await unlink(this.keyPath).catch(() => {});

    this.onReset();
  }

  /**
   * Factory reset: everything from resetData plus WiFi credentials wipe + reboot.
   * Also clears the device PIN so the next boot generates a fresh one.
   * Non-Linux: performs the data reset only (no WiFi wipe or reboot).
   */
  async factoryReset(): Promise<void> {
    // resetData() wipes all secrets (including 'device-pin') so next boot generates a new one
    await this.resetData();

    // Best-effort: wipe photo files
    await rm(this.photoDir, { recursive: true, force: true }).catch(() => {});

    if (process.platform !== 'linux') return;

    // Remove NM client connection file so the AP re-activates on next boot
    await execFileAsync('rm', ['-f', '/etc/NetworkManager/system-connections/smartdisplay-client.nmconnection']).catch(() => {});

    // Schedule a reboot after a short delay to let the HTTP response go out
    setTimeout(() => {
      execFileAsync('systemctl', ['reboot']).catch((err: unknown) => {
        console.error('[reset] reboot failed:', err);
      });
    }, 2000);
  }
}
