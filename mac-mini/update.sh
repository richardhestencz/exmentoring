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
  launchctl kickstart -k "gui/$(id -u)/hu.exmentoring.server"
  echo "Kész, a szerver újraindult."
} >> logs/update.log 2>&1
