#!/usr/bin/env bash
# Kiosk launcher — runs as smartdisplay user inside X11 (:0)
set -e

# Disable screen blanking and DPMS power saving
xset s off
xset -dpms
xset s noblank

# Start openbox window manager (background; provides focus/WM for Chromium)
openbox &

# Hide idle mouse cursor
unclutter -idle 0.5 -root &

# Wait for the app server to accept connections before launching Chromium. Without this, a slow
# server start (first boot, post-update) leaves Chromium on a "connection refused" error page that
# kiosk mode never reloads — the process stays alive so systemd's Restart never fires. Poll up to
# ~60s; then launch regardless so a genuinely-down server still shows Chromium's own error rather
# than a black screen.
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null http://localhost:3000/; then break; fi
  sleep 1
done

# Launch Chromium in kiosk mode. Flags below reduce memory footprint for the
# 2GB Pi 4 floor tier: cap V8 heap per renderer, avoid tmpfs (/dev/shm) growth
# for large shared-memory buffers, and limit renderer process count.
exec /usr/bin/chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --disable-dev-shm-usage \
  --renderer-process-limit=1 \
  --js-flags="--max-old-space-size=256" \
  http://localhost:3000/display/
