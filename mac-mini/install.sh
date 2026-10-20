#!/bin/bash
# Exmentoring telepítése a Mac minire. Többször is futtatható, a meglévő .env-et nem írja felül.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "Exmentoring telepítése ide: $ROOT"

if ! command -v brew >/dev/null; then echo "Előbb telepítsd a Homebrew-t: https://brew.sh (a HANDOVER.md 2. lépése)"; exit 1; fi
command -v node >/dev/null || brew install node
command -v git  >/dev/null || brew install git

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i '' "s/^INGEST_TOKEN=.*/INGEST_TOKEN=$(openssl rand -hex 16)/" .env
  echo "Létrehoztam a .env fájlt új titkos tokennel."
fi

echo "Függőségek telepítése…"
(cd server && npm ci --omit=dev)
chmod +x mac-mini/*.sh
mkdir -p logs data "$HOME/Library/LaunchAgents"

plist() { # név, program, extra kulcsok
  cat > "$HOME/Library/LaunchAgents/$1.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$2</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StandardOutPath</key><string>$ROOT/logs/$3.log</string>
  <key>StandardErrorPath</key><string>$ROOT/logs/$3.log</string>
  $4
</dict></plist>
PLIST
  launchctl bootout "gui/$(id -u)/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$1.plist"
}
plist hu.exmentoring.server "$ROOT/mac-mini/run-server.sh" server "<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>"
plist hu.exmentoring.update "$ROOT/mac-mini/update.sh" update-launchd "<key>StartCalendarInterval</key><dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>"
echo "A szerver fut és bejelentkezéskor magától indul. Napi frissítés: 04:00."

# Az ajtófigyelő nem itt fut, hanem az irodai MacBookon (iroda-macbook/, útmutató: /ajto.html).
# Egy korábbi telepítés itteni ajtófigyelőjét eltávolítjuk.
osascript -e 'tell application "System Events" to delete (every login item whose path contains "mac-mini/start-ajto.command")' >/dev/null 2>&1 || true
pkill -f "mac-mini/start-ajto.command" 2>/dev/null || true

sleep 2
if curl -fsS "http://localhost:$(grep '^PORT=' .env | cut -d= -f2)/" >/dev/null; then echo "A szerver válaszol: http://localhost:3000"; else echo "A szerver még nem válaszol, nézd meg: logs/server.log"; fi
echo "Következő lépés: Tailscale Funnel (HANDOVER.md 5. lépés), utána az ajtófigyelő az irodai MacBookon: <cím>/ajto.html"
