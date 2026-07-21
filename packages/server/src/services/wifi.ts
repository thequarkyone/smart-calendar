import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(_execFile);

export interface WifiStatus {
  mode: 'ap' | 'client' | 'unknown';
  managed: boolean;
}

const STATUS_CACHE_TTL_MS = 5_000;

export class WifiService {
  private _cachedStatus: WifiStatus = { mode: 'unknown', managed: false };
  private _cacheTime = 0;
  private _refreshing = false;

  private isLinux(): boolean {
    return process.platform === 'linux';
  }

  private async _fetchStatus(): Promise<WifiStatus> {
    if (!this.isLinux()) return { mode: 'unknown', managed: false };
    try {
      const { stdout } = await execFileAsync(
        'nmcli',
        ['-t', '-f', 'NAME,TYPE', 'connection', 'show', '--active'],
        { timeout: 5000 },
      );
      const lines = stdout.split('\n').filter(Boolean);
      const isAp = lines.some((l) => l.startsWith('smartdisplay-ap:'));
      return { mode: isAp ? 'ap' : 'client', managed: true };
    } catch {
      return { mode: 'unknown', managed: false };
    }
  }

  /** Returns cached WiFi status; triggers a background refresh if the cache is stale. */
  getStatus(): WifiStatus {
    const age = Date.now() - this._cacheTime;
    if (age > STATUS_CACHE_TTL_MS && !this._refreshing) {
      this._refreshing = true;
      this._fetchStatus()
        .then((s) => { this._cachedStatus = s; this._cacheTime = Date.now(); })
        .catch(() => {})
        .finally(() => { this._refreshing = false; });
    }
    return this._cachedStatus;
  }

  private validateSsid(ssid: string): void {
    if (ssid.length === 0 || ssid.length > 32) throw new Error('SSID must be 1–32 characters');
    // \n \r = are NM config injection chars; # and [ are INI metacharacters
    if (/[\n\r=#[\]]/.test(ssid)) throw new Error('SSID contains invalid characters');
  }

  private validatePsk(psk: string): void {
    if (psk.length < 8 || psk.length > 63) throw new Error('Password must be 8–63 characters');
    // Only printable ASCII allowed (0x20–0x7E), no newlines
    if (/[^\x20-\x7E]/.test(psk)) throw new Error('Password contains invalid characters');
  }

  // connect() used to do validation, profile creation, AND activation in one awaited call —
  // but on single-radio hardware, activation (nmcli connection up) switches wlan0 away from
  // the AP as a side effect the instant it's issued, regardless of whether the client
  // connection goes on to succeed. Any caller reached over the AP (the onboarding wizard,
  // always) loses its network before the HTTP response confirming success/failure can ever
  // arrive — the request looks like a generic network failure no matter what really happened.
  // Split into two phases so the caller can respond to the client BEFORE triggering the
  // radio switch: prepareConnection() (fast, safe to await + report synchronously — doesn't
  // touch the active connection) and activateConnection() (the actual switch, meant to be
  // kicked off only after the HTTP response has already been sent).

  /** Validates credentials and stages the connection profile. Does not touch the active link. */
  async prepareConnection(ssid: string, password: string): Promise<void> {
    if (!this.isLinux()) throw new Error('WiFi connect is only supported on Linux');
    this.validateSsid(ssid);
    this.validatePsk(password);

    // Create the client connection via `nmcli connection add`, not a direct file write.
    // The server runs as the unprivileged `smartdisplay` user with no filesystem access to
    // /etc/NetworkManager/system-connections (root-owned, mode 700, matching NetworkManager's
    // own default) — writing the .nmconnection file directly always failed with EACCES.
    // `connection add` instead goes through NetworkManager's D-Bus API, which creates and
    // writes the file itself as root; the smartdisplay user only needs polkit authorization
    // for NetworkManager actions (granted via /etc/polkit-1/rules.d/50-smartdisplay-network.rules),
    // not filesystem write access to a directory that must stay locked down.
    await execFileAsync('nmcli', ['connection', 'delete', 'smartdisplay-client']).catch(() => {});
    try {
      await execFileAsync('nmcli', [
        'connection', 'add',
        'type', 'wifi',
        'con-name', 'smartdisplay-client',
        'ifname', 'wlan0',
        'ssid', ssid,
        'wifi-sec.key-mgmt', 'wpa-psk',
        'wifi-sec.psk', password,
        'connection.autoconnect', 'yes',
        'connection.autoconnect-priority', '10',
      ]);
    } catch (err) {
      // Do NOT interpolate err.message here: Node's execFile embeds the full argv (including
      // the plaintext PSK, passed as `wifi-sec.psk <password>`) into its own error message on
      // any non-zero exit. Surfacing that would leak the WiFi password into the HTTP error path
      // and (via routes/wifi.ts's req.log.error) into the server log on every failed attempt.
      throw new Error(`Failed to save network profile (${(err as NodeJS.ErrnoException).code ?? 'unknown error'})`);
    }
  }

  /**
   * Actually switches wlan0 onto the prepared connection. Call only after the HTTP response
   * for the request that called prepareConnection() has been sent — this is what disconnects
   * any AP-connected caller, so the response must already be in flight before we run it.
   * On failure, restores the AP so the device doesn't end up with neither AP nor client link.
   */
  async activateConnection(): Promise<void> {
    try {
      await execFileAsync('nmcli', ['connection', 'up', 'smartdisplay-client']);
    } catch (err) {
      await execFileAsync('nmcli', ['connection', 'up', 'smartdisplay-ap']).catch(() => {});
      throw new Error(`Failed to connect to network: ${(err as NodeJS.ErrnoException).message}`);
    }

    // Verify the client interface actually obtained connectivity before dropping AP
    try {
      await execFileAsync('nmcli', ['-t', '-f', 'NAME,STATE', 'connection', 'show', '--active']);
    } catch {
      // nmcli check failed — revert to AP and surface error
      await execFileAsync('nmcli', ['connection', 'up', 'smartdisplay-ap']).catch(() => {});
      throw new Error('Network connection did not become active; AP restored');
    }

    // Disable AP now that client mode is confirmed
    await execFileAsync('nmcli', ['connection', 'down', 'smartdisplay-ap']).catch(() => {});

    // Immediately update the cached status so the auth-exempt check reflects the mode change
    this._cachedStatus = { mode: 'client', managed: true };
    this._cacheTime = Date.now();
  }
}
