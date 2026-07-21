#!/bin/bash -e
# Host-side file copies into ${ROOTFS_DIR}.
install -m 755 -d "${ROOTFS_DIR}/etc/systemd/system"
install -m 644 files/etc/systemd/system/smartdisplay.service \
  "${ROOTFS_DIR}/etc/systemd/system/smartdisplay.service"
install -m 644 files/etc/systemd/system/smartdisplay-x11.service \
  "${ROOTFS_DIR}/etc/systemd/system/smartdisplay-x11.service"
install -m 644 files/etc/systemd/system/smartdisplay-kiosk.service \
  "${ROOTFS_DIR}/etc/systemd/system/smartdisplay-kiosk.service"
install -m 644 files/etc/systemd/system/smartdisplay-firstboot.service \
  "${ROOTFS_DIR}/etc/systemd/system/smartdisplay-firstboot.service"
install -m 644 files/etc/systemd/system/smartdisplay-network-fallback.service \
  "${ROOTFS_DIR}/etc/systemd/system/smartdisplay-network-fallback.service"

install -m 755 -d "${ROOTFS_DIR}/usr/local/bin"
install -m 755 files/usr/local/bin/smartdisplay-firstboot.sh \
  "${ROOTFS_DIR}/usr/local/bin/smartdisplay-firstboot.sh"
install -m 755 files/usr/local/bin/smartdisplay-network-fallback.sh \
  "${ROOTFS_DIR}/usr/local/bin/smartdisplay-network-fallback.sh"
install -m 755 files/usr/local/bin/smartdisplay-kiosk.sh \
  "${ROOTFS_DIR}/usr/local/bin/smartdisplay-kiosk.sh"

install -m 755 -d "${ROOTFS_DIR}/etc/avahi/services"
install -m 644 files/etc/avahi/services/smartdisplay.service \
  "${ROOTFS_DIR}/etc/avahi/services/smartdisplay.service"

# AP-mode fallback: the NetworkManager connection profile + its captive-portal DNS
# redirect. Previously never staged into the image at all — smartdisplay-network-fallback.sh
# would find no "smartdisplay-ap" connection to activate on a cold, no-network boot.
# 700, matching NetworkManager's own default for this directory: profile filenames/SSIDs
# are readable via directory listing even when each file's contents are individually 600.
install -m 700 -d "${ROOTFS_DIR}/etc/NetworkManager/system-connections"
# NetworkManager refuses to load a connection profile that isn't 600 — it contains
# (a placeholder for) the AP PSK, and NM enforces owner-only permissions on secrets.
install -m 600 ../../../deploy/nm/smartdisplay-ap.nmconnection \
  "${ROOTFS_DIR}/etc/NetworkManager/system-connections/smartdisplay-ap.nmconnection"
install -m 755 -d "${ROOTFS_DIR}/etc/NetworkManager/dnsmasq-shared.d"
install -m 644 ../../../deploy/dnsmasq/smartdisplay-ap.conf \
  "${ROOTFS_DIR}/etc/NetworkManager/dnsmasq-shared.d/smartdisplay-ap.conf"

# Without this, the smartdisplay app user has no polkit authorization to manage
# NetworkManager connections at all — WifiService.connect() (the wizard's WiFi step) fails
# with "Not authorized to control networking" for every real network, not just a specific one.
install -m 755 -d "${ROOTFS_DIR}/etc/polkit-1/rules.d"
install -m 644 files/etc/polkit-1/rules.d/50-smartdisplay-network.rules \
  "${ROOTFS_DIR}/etc/polkit-1/rules.d/50-smartdisplay-network.rules"

install -m 755 -d "${ROOTFS_DIR}/opt/smartdisplay/releases"

# Bundle the app release into the image at build time. image.yml stages the
# downloaded-and-verified release tarball into files/opt/smartdisplay/releases/vX.Y.Z/
# and drops the version string into files/opt/smartdisplay/version before invoking
# build.sh — see .github/workflows/image.yml. This is required so onboarding
# (including AP-mode WiFi setup, which the app itself serves) works with zero
# pre-existing network; a first-boot download would create a chicken-and-egg
# problem where the device can never reach the network it needs onboarding to set up.
STAGED_VERSION_FILE="files/opt/smartdisplay/version"
if [[ -f "$STAGED_VERSION_FILE" ]]; then
  STAGED_VERSION="$(cat "$STAGED_VERSION_FILE")"
  STAGED_RELEASE_DIR="files/opt/smartdisplay/releases/v${STAGED_VERSION}"
  if [[ ! -d "$STAGED_RELEASE_DIR" ]]; then
    echo "[00-run] ERROR: version file says v${STAGED_VERSION} but $STAGED_RELEASE_DIR is missing" >&2
    exit 1
  fi
  install -m 755 -d "${ROOTFS_DIR}/opt/smartdisplay/releases/v${STAGED_VERSION}"
  cp -r "$STAGED_RELEASE_DIR/." "${ROOTFS_DIR}/opt/smartdisplay/releases/v${STAGED_VERSION}/"
else
  echo "[00-run] WARNING: no staged app release found (files/opt/smartdisplay/version missing)." >&2
  echo "[00-run] Building an image with no bundled app — only expected for local pi-gen iteration." >&2
fi

# Chroot-side: fix ownership, symlink the bundled release, enable services.
on_chroot << EOF
chown -R smartdisplay:smartdisplay /opt/smartdisplay
systemctl enable smartdisplay-x11.service
systemctl enable smartdisplay-firstboot.service
systemctl enable smartdisplay-network-fallback.service

# Raspberry Pi OS ships the WiFi radio rfkill-soft-blocked until a regulatory
# country is set (normally done by Raspberry Pi Imager's own customization step,
# or manually via raspi-config) — without this, NetworkManager reports wlan0 as
# permanently "unavailable" and neither client WiFi nor the AP-mode fallback can
# ever come up on a device that skipped Imager's WiFi customization. US is a
# conservative default (2.4GHz channels 1-11 are legal nearly everywhere) — the
# onboarding wizard's WiFi step lets a user pick their real network regardless
# of this value; it only unblocks the radio, not restrict which network to join.
raspi-config nonint do_wifi_country US

# The dnsmasq *package* is required so NetworkManager's own internal AP helper
# (dnsmasq-shared, used for the smartdisplay-ap hotspot's DHCP/DNS) has the
# dnsmasq binary available — but installing it via apt also enables a
# standalone system-wide dnsmasq.service, which binds the same port and makes
# NM's own instance fail with "Address already in use" the moment the AP tries
# to start. We only want the binary, not a second competing daemon.
systemctl disable --now dnsmasq.service || true

if [[ -n "${STAGED_VERSION:-}" ]]; then
  ln -sfn "/opt/smartdisplay/releases/v${STAGED_VERSION}" /opt/smartdisplay/current
  chown -h smartdisplay:smartdisplay /opt/smartdisplay/current
  systemctl enable smartdisplay.service smartdisplay-kiosk.service
fi

# Disable console autologin (raspi-config B1 = console, login required).
# userconfig.service is left enabled — it is NOT an interactive wizard, it's
# the non-interactive first-boot step that reads Raspberry Pi Imager's saved
# username/password from /boot/firmware/userconf.txt and applies it to the
# account. Disabling it (as a prior version of this script mistakenly did)
# leaves the pi account with no usable password at all, since that's the only
# mechanism that ever sets one — locking out physical console access entirely,
# including for legitimate debugging. Autologin alone is sufficient to close
# the "unauthenticated root shell on tty1" gap: with it off, a real password
# (the one from Imager) is required for console access; the kiosk never
# depends on this either way — Xorg/Chromium run as standalone systemd units
# (User=smartdisplay), not a login session.
# raspi-config's own live-reload step may warn in a chroot (no running
# systemd/dbus) — harmless, only the persisted file state matters here, so we
# also clear the autologin dropin directly as a guaranteed backstop.
raspi-config nonint do_boot_behaviour B1 || true
rm -f /etc/systemd/system/getty@tty1.service.d/autologin.conf
EOF
