#!/bin/sh
# Snack Quest Machine Agent installer — for a Raspberry Pi (Raspberry Pi OS
# Bookworm) or any Debian-based Linux computer inside a vending machine.
#
#   curl -fsSL https://www.snackquests.shop/machine-agent/install.sh | sudo sh
#   curl -fsSL https://www.snackquests.shop/machine-agent/install.sh | sudo sh -s -- --kiosk SQ0001
#
# Safe to run again: it upgrades the agent to the site's current release
# and never overwrites an existing config or secret.
#
# What it sets up:
#   /opt/snack-quest-agent/releases/<release>/agent.mjs  the agent (one file)
#   /opt/snack-quest-agent/current                      the release in use
#   /etc/snack-quest-agent/config.json                  this machine's settings (template on first run)
#   /etc/snack-quest-agent/secret                       the API secret (you paste it; mode 0600)
#   /var/lib/snack-quest-agent/                         journal and cooling range
#   snack-quest-agent.service                           starts at boot, restarts on crash and after updates
#   snack-quest-kiosk.service (with --kiosk)            the customer screen, full screen
set -eu

SITE="https://www.snackquests.shop"
KIOSK_MACHINE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --site) SITE="$2"; shift 2 ;;
    --kiosk) KIOSK_MACHINE="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

HOME_DIR=/opt/snack-quest-agent
CONFIG_DIR=/etc/snack-quest-agent
DATA_DIR=/var/lib/snack-quest-agent
SERVICE_USER=snackquest

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }

say "Checking Node.js"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  apt-get update -q
  apt-get install -y -q nodejs
fi
node -e 'if (+process.versions.node.split(".")[0] < 18) { console.error("Node 18 or newer is needed"); process.exit(1) }'
command -v curl >/dev/null 2>&1 || apt-get install -y -q curl
command -v sha256sum >/dev/null 2>&1 || apt-get install -y -q coreutils

say "Creating the $SERVICE_USER user (serial port access via the dialout group)"
id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
usermod -a -G dialout "$SERVICE_USER"
mkdir -p "$HOME_DIR/releases" "$CONFIG_DIR" "$DATA_DIR"

say "Downloading the agent from $SITE"
MANIFEST=$(curl -fsSL "$SITE/machine-agent/manifest.json")
RELEASE=$(printf '%s' "$MANIFEST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).release))')
FILE=$(printf '%s' "$MANIFEST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).file))')
SHA=$(printf '%s' "$MANIFEST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).sha256))')
mkdir -p "$HOME_DIR/releases/$RELEASE"
curl -fsSL "$SITE/machine-agent/$FILE" -o "$HOME_DIR/releases/$RELEASE/agent.mjs.download"
echo "$SHA  $HOME_DIR/releases/$RELEASE/agent.mjs.download" | sha256sum -c --quiet
mv "$HOME_DIR/releases/$RELEASE/agent.mjs.download" "$HOME_DIR/releases/$RELEASE/agent.mjs"
ln -sfn "releases/$RELEASE" "$HOME_DIR/current.next" && mv -T "$HOME_DIR/current.next" "$HOME_DIR/current"
say "Agent $RELEASE installed"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
  cat > "$CONFIG_DIR/config.json" <<JSON
{
  "snackQuest": { "baseUrl": "$SITE", "keyId": "sqk_test_REPLACE_ME", "secretFile": "secret" },
  "manufacturerMachineId": "REPLACE_ME",
  "transport": { "kind": "serial", "device": "/dev/ttyUSB0", "baud": 9600 },
  "slots": [
    { "slotId": "b1-m00", "motorType": 3, "curtainMode": 2 }
  ],
  "acceptanceRecordFile": null,
  "dataDir": "$DATA_DIR"
}
JSON
  say "Wrote a template config to $CONFIG_DIR/config.json"
fi
if [ ! -f "$CONFIG_DIR/secret" ]; then
  : > "$CONFIG_DIR/secret"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$HOME_DIR" "$DATA_DIR"
chown root:"$SERVICE_USER" "$CONFIG_DIR" "$CONFIG_DIR/config.json" "$CONFIG_DIR/secret"
chmod 0750 "$CONFIG_DIR"
chmod 0640 "$CONFIG_DIR/config.json" "$CONFIG_DIR/secret"

cat > /etc/systemd/system/snack-quest-agent.service <<UNIT
[Unit]
Description=Snack Quest Machine Agent
After=network-online.target
Wants=network-online.target

[Service]
User=$SERVICE_USER
Environment=SNACK_QUEST_AGENT_HOME=$HOME_DIR
ExecStart=/usr/bin/env node $HOME_DIR/current/agent.mjs --config $CONFIG_DIR/config.json
# Restarts after a crash and after an update (exit 0). Exit 78 means the
# config, acceptance record or journal needs a person: no restart loop.
Restart=always
RestartSec=5
RestartPreventExitStatus=78
# The agent pings the watchdog every cycle; a hung agent is restarted.
WatchdogSec=180
NotifyAccess=all
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable snack-quest-agent.service >/dev/null

if [ -n "$KIOSK_MACHINE" ]; then
  say "Setting up the customer screen for $KIOSK_MACHINE"
  apt-get install -y -q cage chromium >/dev/null 2>&1 || apt-get install -y -q cage chromium-browser
  BROWSER=$(command -v chromium || command -v chromium-browser)
  id snackkiosk >/dev/null 2>&1 || useradd --create-home --shell /usr/sbin/nologin snackkiosk
  usermod -a -G video,input,render snackkiosk 2>/dev/null || true
  cat > /etc/systemd/system/snack-quest-kiosk.service <<UNIT
[Unit]
Description=Snack Quest customer screen
After=systemd-user-sessions.service network-online.target
Wants=network-online.target

[Service]
User=snackkiosk
PAMName=login
TTYPath=/dev/tty1
Environment=XDG_RUNTIME_DIR=/run/user/%U
ExecStart=/usr/bin/cage -s -- $BROWSER --kiosk --noerrdialogs --disable-infobars --disable-translate --no-first-run --disable-pinch --overscroll-history-navigation=0 --check-for-update-interval=31536000 $SITE/machine/$KIOSK_MACHINE
Restart=always
RestartSec=3

[Install]
WantedBy=graphical.target
UNIT
  systemctl daemon-reload
  systemctl enable snack-quest-kiosk.service >/dev/null
  say "The screen opens $SITE/machine/$KIOSK_MACHINE at boot; pair it with a screen key from the machine's Setup page"
fi

if grep -q REPLACE_ME "$CONFIG_DIR/config.json" || [ ! -s "$CONFIG_DIR/secret" ]; then
  say "Almost done. Next:"
  echo "  1. Edit $CONFIG_DIR/config.json: keyId, manufacturerMachineId, serial device, slots."
  echo "  2. Paste the API secret into $CONFIG_DIR/secret (one line)."
  echo "  3. Check it:  sudo -u $SERVICE_USER node $HOME_DIR/current/agent.mjs --config $CONFIG_DIR/config.json --check"
  echo "  4. Start it:  sudo systemctl start snack-quest-agent   (logs: journalctl -u snack-quest-agent -f)"
else
  systemctl restart snack-quest-agent.service
  say "Agent running. Logs: journalctl -u snack-quest-agent -f"
fi
