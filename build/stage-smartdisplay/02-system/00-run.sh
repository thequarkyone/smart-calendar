#!/bin/bash -e
# Chroot-side: install log2ram (not in Debian/RPi repos — add the azlux repo),
# create the system user + directories, and enable avahi.
on_chroot << 'EOF'
curl -fsSL https://azlux.fr/repo.gpg -o /usr/share/keyrings/azlux-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/azlux-archive-keyring.gpg] http://packages.azlux.fr/debian/ stable main" \
  > /etc/apt/sources.list.d/azlux.list
apt-get update
apt-get install -y log2ram
useradd --system --create-home --shell /bin/bash \
  --home-dir /home/smartdisplay smartdisplay || true
install -d -o smartdisplay -g smartdisplay -m 750 /data
install -d -o smartdisplay -g smartdisplay -m 755 /opt/smartdisplay
install -d -o smartdisplay -g smartdisplay -m 755 /opt/smartdisplay/releases
usermod -aG video smartdisplay
# Chromium is launched with --enable-gpu-rasterization --use-angle=gles, which needs
# /dev/dri/renderD128 — that device is owned by group `render`, not `video`. Without this,
# GPU init silently fails (falls back, or on some hardware just renders a black screen) and
# every kiosk boot logs "failed to open /dev/dri/renderD128: Permission denied".
usermod -aG render smartdisplay || true
systemctl enable avahi-daemon
EOF

# Overwrite log2ram's default config with our tuned version (after the package
# install so dpkg doesn't clobber it).
install -m 644 files/etc/log2ram.conf "${ROOTFS_DIR}/etc/log2ram.conf"
