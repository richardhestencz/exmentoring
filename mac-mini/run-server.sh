#!/bin/bash
# A játékszerver indítása a .env beállításaival. Ezt a launchd futtatja, és összeomlás után újraindítja.
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
set -a; [ -f .env ] && . ./.env; set +a
export DATA_DIR="${DATA_DIR:-$PWD/data}"
cd server && exec node server.js
