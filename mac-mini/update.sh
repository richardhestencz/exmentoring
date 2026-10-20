#!/bin/bash
# Frissítés a GitHubról. Naponta egyszer (04:00) a launchd futtatja, és a weboldal „Frissítés a GitHubról” gombja is ezt indítja.
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p logs
{
  echo "=== $(date '+%F %T') frissítés"
  old=$(git rev-parse HEAD)
  if ! git pull --ff-only; then echo "A git pull nem sikerült (helyi módosítás vagy hálózati hiba)."; exit 1; fi
  new=$(git rev-parse HEAD)
  if [ "$old" = "$new" ]; then echo "Nincs új verzió."; exit 0; fi
  echo "Új verzió: ${old:0:7} -> ${new:0:7}"
  (cd server && npm ci --omit=dev)
  shelly-ajto/.venv/bin/pip install -q -r shelly-ajto/requirements.txt
  pkill -f "shelly-ajto/ajto.py" || true            # a Terminálban futó ciklus 10 mp múlva az új kóddal indítja újra
  launchctl kickstart -k "gui/$(id -u)/hu.exmentoring.server"
  echo "Kész, a szerver és az ajtófigyelő újraindult."
} >> logs/update.log 2>&1
