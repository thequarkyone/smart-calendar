#!/usr/bin/env bash
# Bootstrap Smart Display on a fresh Raspberry Pi OS Lite 64-bit via SSH.
# Skips pi-gen entirely — for rapid hardware validation.
#
# Usage (from your laptop):
#   ssh pi@<pi-ip> 'bash -s' < deploy/bootstrap.sh
#
# The Pi must have internet access. Run as the default 'pi' user (has sudo).
set -euo pipefail

LOG="/var/log/smartdisplay-bootstrap.log"
exec > >(sudo tee -a "$LOG") 2>&1

echo "[bootstrap] $(date) — starting"

# ── 1. System packages ────────────────────────────────────────────────────────
echo "[bootstrap] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  avahi-daemon avahi-utils \
  dnsmasq \
  network-manager \
  chromium-browser \
  xserver-xorg \
  x11-xserver-utils \
  openbox \
  unclutter \
  curl ca-certificates git \
  sqlite3

# ── 2. Node.js 24 LTS via NodeSource ─────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version)" != v24* ]]; then
  echo "[bootstrap] Installing Node.js 24..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version

# ── 3. pnpm ───────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  echo "[bootstrap] Installing pnpm..."
  sudo npm install -g pnpm
fi
pnpm --version

# ── 4. System user + directories ─────────────────────────────────────────────
echo "[bootstrap] Creating smartdisplay user and directories..."
if ! id smartdisplay &>/dev/null; then
  sudo useradd -r -m -s /bin/false -G video,audio smartdisplay
fi
sudo install -d -o smartdisplay -g smartdisplay -m 750 /data
sudo install -d -o smartdisplay -g smartdisplay -m 750 /opt/smartdisplay/releases

# ── 5. Service files ──────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[bootstrap] Installing systemd service files..."
sudo install -m 644 "$REPO_DIR/deploy/systemd/smartdisplay.service" \
  /etc/systemd/system/smartdisplay.service
sudo install -m 644 "$REPO_DIR/deploy/systemd/smartdisplay-x11.service" \
  /etc/systemd/system/smartdisplay-x11.service
sudo install -m 644 "$REPO_DIR/deploy/systemd/smartdisplay-kiosk.service" \
  /etc/systemd/system/smartdisplay-kiosk.service

# Kiosk launcher
sudo install -m 755 "$REPO_DIR/deploy/systemd/smartdisplay-kiosk.sh" \
  /usr/local/bin/smartdisplay-kiosk.sh

# Avahi mDNS
sudo install -d /etc/avahi/services
sudo install -m 644 "$REPO_DIR/deploy/avahi/smartdisplay.service" \
  /etc/avahi/services/smartdisplay.service

sudo systemctl daemon-reload
sudo systemctl enable avahi-daemon smartdisplay-x11.service

# ── 6. Build and install the app ───────────────────────────────────────────────
# The image bundles the app at build time; bootstrap builds it from this checkout
# instead (firstboot no longer downloads anything). This runs natively on the Pi
# (arm64), so no cross-compilation is needed.
echo "[bootstrap] Building app (this can take several minutes on a Pi)..."
( cd "$REPO_DIR" && pnpm install --frozen-lockfile && pnpm build )

VERSION="$(node -p "require('$REPO_DIR/package.json').version")"
RELEASE_DIR="/opt/smartdisplay/releases/v${VERSION}"
echo "[bootstrap] Staging release v${VERSION} into ${RELEASE_DIR}..."
sudo rm -rf "$RELEASE_DIR"
sudo install -d -o smartdisplay -g smartdisplay "$RELEASE_DIR"

# Self-contained prod node_modules for the server (real files, arm64-native).
DEPLOY_TMP="$(mktemp -d)"
( cd "$REPO_DIR" && pnpm --filter @smart-display/server deploy --prod "$DEPLOY_TMP/server" )
# `pnpm deploy` follows npm-pack semantics, which can exclude gitignored dist/; copy it explicitly.
cp -r "$REPO_DIR/packages/server/dist" "$DEPLOY_TMP/server/dist"
sudo cp -r "$DEPLOY_TMP/server" "$RELEASE_DIR/packages/server" 2>/dev/null || {
  sudo install -d "$RELEASE_DIR/packages"; sudo cp -r "$DEPLOY_TMP/server" "$RELEASE_DIR/packages/server";
}
# Ensure the built @smart-display/shared package carries its compiled dist too.
if [ -d "$RELEASE_DIR/packages/server/node_modules/@smart-display/shared" ]; then
  sudo cp -r "$REPO_DIR/packages/shared/dist" \
    "$RELEASE_DIR/packages/server/node_modules/@smart-display/shared/dist"
fi
# Pre-built static web assets.
sudo install -d "$RELEASE_DIR/packages/web-config" "$RELEASE_DIR/packages/web-display"
sudo cp -r "$REPO_DIR/packages/web-config/dist" "$RELEASE_DIR/packages/web-config/dist"
sudo cp -r "$REPO_DIR/packages/web-display/dist" "$RELEASE_DIR/packages/web-display/dist"
rm -rf "$DEPLOY_TMP"

sudo ln -sfn "$RELEASE_DIR" /opt/smartdisplay/current
sudo chown -R smartdisplay:smartdisplay /opt/smartdisplay
sudo chown -h smartdisplay:smartdisplay /opt/smartdisplay/current

# ── 7. First-boot script (device secrets only — no network) ────────────────────
sudo install -m 755 \
  "$REPO_DIR/build/stage-smartdisplay/03-app/files/usr/local/bin/smartdisplay-firstboot.sh" \
  /usr/local/bin/smartdisplay-firstboot.sh

echo "[bootstrap] Running first-boot setup (generates device secrets)..."
sudo /usr/local/bin/smartdisplay-firstboot.sh

# ── 8. Enable and start services ───────────────────────────────────────────────
echo "[bootstrap] Starting services..."
sudo systemctl enable smartdisplay.service smartdisplay-kiosk.service
sudo systemctl start smartdisplay.service smartdisplay-x11.service smartdisplay-kiosk.service

echo ""
echo "═══════════════════════════════════════════════"
echo " Bootstrap complete!"
echo " Open http://smartdisplay.local in a browser"
echo " or http://$(hostname -I | awk '{print $1}')"
echo "═══════════════════════════════════════════════"
