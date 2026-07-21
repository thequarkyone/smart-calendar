import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(_execFile);

export class SystemService {
  /**
   * Reboots the device (Linux only — a no-op report on dev machines). Resolves once the reboot
   * has been scheduled; the short delay lets the HTTP response reach the client before the OS
   * actually goes down.
   */
  async reboot(): Promise<{ rebooting: boolean }> {
    if (process.platform !== 'linux') return { rebooting: false };
    setTimeout(() => {
      execFileAsync('systemctl', ['reboot']).catch((err: unknown) => {
        console.error('[system] reboot failed:', err);
      });
    }, 1000);
    return { rebooting: true };
  }
}
