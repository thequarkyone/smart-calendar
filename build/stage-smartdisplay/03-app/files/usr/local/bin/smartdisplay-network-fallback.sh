#!/usr/bin/env bash
# Brings up the SmartDisplay-Setup AP if the device has no other working
# connectivity at boot (no ethernet, no pre-seeded/previously-joined WiFi).
# Nothing else on the device ever activates the smartdisplay-ap NetworkManager
# connection — WifiService only reverts to it on a failed client connect
# attempt (see packages/server/src/services/wifi.ts) — so without this, a
# cold device with zero pre-existing network never broadcasts the AP, and
# the "no terminal, no IP typing" onboarding promise silently fails.
set -uo pipefail

LOG="/var/log/smartdisplay-network-fallback.log"
exec > >(tee -a "$LOG") 2>&1

echo "[network-fallback] $(date) — checking connectivity"

WAIT_SECS=20
elapsed=0
while [ "$elapsed" -lt "$WAIT_SECS" ]; do
  # Any active connection other than the AP itself or loopback counts as "has network"
  # (ethernet, or a WiFi network pre-seeded via Raspberry Pi Imager / already joined).
  # NetworkManager always lists "lo" as an active connection even with zero real
  # connectivity, so it must be excluded or this check would never fall through to AP.
  active="$(nmcli -t -f NAME connection show --active 2>/dev/null || true)"
  if echo "$active" | grep -v -e '^smartdisplay-ap$' -e '^lo$' | grep -q .; then
    echo "[network-fallback] connectivity present ($active) — not starting AP"
    exit 0
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

echo "[network-fallback] no connectivity after ${WAIT_SECS}s — starting AP"
nmcli connection up smartdisplay-ap || echo "[network-fallback] failed to start AP"
