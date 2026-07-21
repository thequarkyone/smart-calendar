import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Settings } from '@smart-display/shared';

interface Props {
  settings: Settings;
  devicePin: string | null;
  wifiMode: string | null;
  apPsk: string | null;
  deviceIp: string | null;
}

export function QrOverlay({ settings, devicePin, wifiMode, apPsk, deviceIp }: Props) {
  const [dataUrl, setDataUrl] = useState('');
  // smartdisplay.local relies on mDNS, which many phones (notably Android without
  // Bonjour) can't resolve — prefer the device's real LAN IP when we have one, so
  // scanning the code doesn't dead-end in DNS_PROBE_FINISHED_NXDOMAIN.
  const host = deviceIp ?? 'smartdisplay.local';
  // The server doesn't listen on the default HTTP port (80) — it's whatever this page itself
  // was loaded on (3000 unless overridden via PORT). Without this, the QR code silently sent
  // scanners to a dead http://host with nothing listening, even though the device was reachable.
  const port = window.location.port;
  const hostWithPort = port ? `${host}:${port}` : host;

  useEffect(() => {
    void QRCode.toDataURL(`http://${hostWithPort}`, {
      color: { dark: '#ffffff', light: '#00000000' },
      width: 120,
      margin: 1,
    }).then(setDataUrl);
  }, [hostWithPort]);

  if (!settings.showQrCode || !dataUrl) return null;

  const isAp = wifiMode === 'ap';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        background: 'rgba(0,0,0,0.80)',
        padding: 12,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        zIndex: 100,
        minWidth: 120,
      }}
    >
      <img src={dataUrl} width={96} height={96} alt="Scan to configure" />
      <span style={{ color: '#ffffff', fontSize: 10, fontFamily: 'monospace' }}>
        {hostWithPort}
      </span>
      {devicePin && (
        <div style={{ textAlign: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: 9, fontFamily: 'monospace', display: 'block' }}>
            CONFIG PIN
          </span>
          <span style={{ color: '#fbbf24', fontSize: 16, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.15em' }}>
            {devicePin}
          </span>
        </div>
      )}
      {isAp && apPsk && (
        <div style={{ textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 6, width: '100%' }}>
          <span style={{ color: '#94a3b8', fontSize: 9, fontFamily: 'monospace', display: 'block' }}>
            WIFI: SmartDisplay-Setup
          </span>
          <span style={{ color: '#34d399', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.1em' }}>
            {apPsk}
          </span>
        </div>
      )}
    </div>
  );
}
