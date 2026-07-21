import { networkInterfaces } from 'node:os';

/**
 * Best-effort LAN IPv4 address for this device, for the onboarding QR code.
 * mDNS (smartdisplay.local) isn't resolvable by every phone (notably many
 * Android devices without Bonjour support), so the QR/overlay fall back to
 * a raw IP that always resolves on the same network.
 */
export function getLanIp(): string | null {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      // 169.254.0.0/16 is a self-assigned link-local address (e.g. an unplugged eth0
      // that never got a DHCP lease) — not `internal`, but useless to a phone on the
      // real LAN, so skip it and keep looking for a genuine DHCP/static address.
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        return iface.address;
      }
    }
  }
  return null;
}
