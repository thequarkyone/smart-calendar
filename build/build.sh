#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

# pi-gen source (cloned if absent).
# Use the bookworm-arm64 branch: 64-bit, Debian bookworm (matches current
# stable Raspberry Pi OS Lite). The plain `arm64` branch now targets trixie
# and uses deb822 .sources with Signed-By a .pgp keyring that the runner's
# debootstrap doesn't seed, causing NO_PUBKEY failures.
PIGEN_DIR="$BUILD_DIR/.pi-gen"
PIGEN_REPO="https://github.com/RPi-Distro/pi-gen.git"
PIGEN_BRANCH="bookworm-arm64"

if [[ ! -d "$PIGEN_DIR" ]]; then
  echo "[build] Cloning pi-gen ($PIGEN_BRANCH)..."
  git clone --depth=1 --branch "$PIGEN_BRANCH" "$PIGEN_REPO" "$PIGEN_DIR"
else
  # image.yml restores $PIGEN_DIR (scripts + pi-gen's own work/ output) from an
  # Actions cache to skip re-running debootstrap/stage0/1/2 (~25+ min) on every
  # iteration of our own stage-smartdisplay. Always wipe just our stage's prior
  # work dir so we start fresh on top of the cached, known-good stage2 rootfs —
  # never reuse a partially-built stage-smartdisplay from a previous failure.
  echo "[build] Reusing cached pi-gen clone; discarding prior stage-smartdisplay work dir"
  rm -rf "$PIGEN_DIR/work/smartdisplay/stage-smartdisplay"
fi

# Suppress stage2's own image export so we only produce the final smartdisplay image.
touch "$PIGEN_DIR/stage2/SKIP_IMAGES"

# Write pi-gen config.
# STAGE_LIST overrides the default stage* glob; we build stage0→1→2 (Raspberry Pi OS Lite
# base), then our own customisation stage. Stages 3–5 (desktop + full) are not listed.
# DEPLOY_COMPRESSION=none leaves a raw .img so our image.yml step can apply its own xz.
cat > "$PIGEN_DIR/config" <<EOF
IMG_NAME='smartdisplay'
RELEASE='bookworm'
DEPLOY_DIR='$BUILD_DIR/dist'
STAGE_LIST='stage0 stage1 stage2 $BUILD_DIR/stage-smartdisplay'
LOCALE_DEFAULT='en_US.UTF-8'
TARGET_HOSTNAME='smartdisplay'
ENABLE_SSH=0
FIRST_USER_NAME='pi'
DEPLOY_COMPRESSION='none'
EOF

cd "$PIGEN_DIR"
sudo ./build.sh

# pi-gen names the image ${IMG_DATE}-smartdisplay.img; normalise to smartdisplay.img
# so the image.yml workflow can xz and rename it predictably.
IMG_OUT="$(find "$BUILD_DIR/dist" -maxdepth 1 -name '*.img' | head -1)"
if [[ -z "$IMG_OUT" ]]; then
  echo "[build] ERROR: No .img found in $BUILD_DIR/dist after build"
  exit 1
fi
if [[ "$IMG_OUT" != "$BUILD_DIR/dist/smartdisplay.img" ]]; then
  mv "$IMG_OUT" "$BUILD_DIR/dist/smartdisplay.img"
fi

echo "[build] Image built: $BUILD_DIR/dist/smartdisplay.img"
