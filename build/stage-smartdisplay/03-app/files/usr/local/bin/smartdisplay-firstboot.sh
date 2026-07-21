#!/usr/bin/env bash
# First-boot setup: generate device secrets, start services.
# The app itself is bundled into the image at build time (see build/build.sh
# and 03-app/00-run.sh) — this script does NOT touch the network, so
# onboarding (including AP-mode WiFi setup) works with zero pre-existing
# connectivity.
set -euo pipefail

LOG="/var/log/smartdisplay-firstboot.log"
exec > >(tee -a "$LOG") 2>&1

echo "[firstboot] $(date) — starting first-boot setup"

# Create data directory if absent
install -d -o smartdisplay -g smartdisplay -m 750 /data

# Generate a random AP PSK if not already set (12 alphanumeric chars)
AP_PSK_FILE="/data/ap-psk"
if [ ! -f "$AP_PSK_FILE" ]; then
  # tr reads /dev/urandom directly (no `cat` piping in) and head -c cuts it to size —
  # avoids a cat|tr|fold|head pipeline that can spin burning CPU indefinitely when its
  # stdout is a socket (as under systemd/journald) rather than a tty/pipe.
  # head closing early after 12 bytes sends tr a SIGPIPE; under `set -o pipefail` that
  # nonzero exit fails the whole pipeline (and the script, under set -e) even though
  # AP_PSK was captured correctly — disable pipefail for just this one substitution.
  AP_PSK=$(set +o pipefail; tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 12)
  echo "$AP_PSK" > "$AP_PSK_FILE"
  chmod 640 "$AP_PSK_FILE"
  chown smartdisplay:smartdisplay "$AP_PSK_FILE"
  # Patch the NM AP connection file with the generated PSK
  # Use python3 to avoid PSK being visible in ps aux (sed passes args as process argv)
  NM_AP_CONN="/etc/NetworkManager/system-connections/smartdisplay-ap.nmconnection"
  if [ -f "$NM_AP_CONN" ]; then
    AP_PSK="$AP_PSK" python3 -c "
import os, re
path = '$NM_AP_CONN'
psk = os.environ['AP_PSK']
content = open(path).read()
content = re.sub(r'^psk=.*', 'psk=' + psk, content, flags=re.MULTILINE)
open(path, 'w').write(content)
"
    nmcli connection reload 2>/dev/null || true
  fi
  echo "[firstboot] Generated AP PSK and updated NM connection"
fi

# Mark first boot complete
touch /data/.firstboot-done

echo "[firstboot] Done"
