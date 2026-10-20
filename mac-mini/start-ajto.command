#!/bin/bash
# Az ajtófigyelő indítása a Terminálban. Bejelentkezési elemként fut, mert a Bluetooth-engedélyt a Terminál kapja meg.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f .env ] && . ./.env; set +a
ARGS=(--szerver "http://localhost:${PORT:-3000}" --token "$INGEST_TOKEN")
[ -n "$AJTO_NEV" ] && ARGS+=(--nev "$AJTO_NEV")
[ -n "$UZENET" ] && ARGS+=(--uzenet "$UZENET")
echo "Exmentoring ajtófigyelő. Ezt az ablakot hagyd nyitva (lekicsinyítheted)."
while true; do
  shelly-ajto/.venv/bin/python shelly-ajto/ajto.py "${ARGS[@]}"
  echo "Az ajtófigyelő leállt, újraindítás 10 másodperc múlva…"
  sleep 10
done
