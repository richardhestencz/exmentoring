#!/bin/bash
# Az ajtófigyelő az irodai MacBookon. Bejelentkezéskor indul a Terminálban, mert a Bluetooth-engedélyt a Terminál kapja meg.
cd "$(dirname "$0")/.." || exit 1
echo "Exmentoring ajtófigyelő. Ezt az ablakot hagyd nyitva (lekicsinyítheted)."
if git pull --ff-only -q 2>/dev/null; then shelly-ajto/.venv/bin/pip install -q -r shelly-ajto/requirements.txt 2>/dev/null; fi
[ -f ajto.env ] || { echo "Nincs ajto.env. Futtasd le a telepítőt (az oldal Ajtó útmutatója)."; exit 1; }
set -a; . ./ajto.env; set +a   # a token környezeti változóként megy át, nem látszik a folyamatlistában
while true; do
  shelly-ajto/.venv/bin/python shelly-ajto/ajto.py
  echo "Az ajtófigyelő leállt, újraindítás 10 másodperc múlva…"
  sleep 10
done
