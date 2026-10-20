#!/bin/bash
# Az Exmentoring ajtófigyelőjének telepítése az irodai MacBookra (az ajtó közelébe, ahol a Shelly szenzor van).
# Futtatás a Terminálban:
#   bash <(curl -fsSL https://raw.githubusercontent.com/richardhestencz/exmentoring/main/iroda-macbook/install.sh) https://hestencz-mac-mini.tail018e03.ts.net
# Többször is futtatható: frissít, a meglévő beállításokat Enterrel meg lehet tartani.
set -euo pipefail
REPO="https://github.com/richardhestencz/exmentoring.git"
DIR="${EXM_AJTO_DIR:-$HOME/exmentoring-ajto}"
echo "Exmentoring ajtófigyelő telepítése ide: $DIR"

# 1. Apple fejlesztői eszközök (ebben van a git és a python3)
if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1 || true
  echo "Felugrott egy ablak az Apple fejlesztői eszközökhöz. Kattints a Telepítés gombra, várd meg a végét, majd futtasd újra ugyanezt a parancsot."
  exit 1
fi

# 2. A kód letöltése vagy frissítése
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only -q || echo "FIGYELEM: a frissítés nem sikerült, a meglévő kóddal megyek tovább."
else
  git clone -q "$REPO" "$DIR"
fi
cd "$DIR"

# 3. Beállítások (ajto.env, csak ezen a gépen, a GitHubra nem kerül fel)
# Kérdés nélkül is fut, ha a token az INGEST_TOKEN környezeti változóban van (pl. Claude futtatja).
CONF="$DIR/ajto.env"
ENV_TOKEN="${INGEST_TOKEN:-}"
SZERVER="" INGEST_TOKEN="" AJTO_NEV=""
[ -f "$CONF" ] && . "$CONF"
TTY=0; { : </dev/tty; } 2>/dev/null && TTY=1
ask() { local v=""; [ $TTY = 1 ] && read -r -p "$1${2:+ [$2]}: " v </dev/tty; printf '%s' "${v:-$2}"; }

if [ -n "${1:-}" ]; then SZERVER="$1"; else SZERVER=$(ask "A játék oldalának címe" "$SZERVER"); fi
SZERVER="${SZERVER%/}"
[ -n "$SZERVER" ] || { echo "A cím kötelező (https://hestencz-mac-mini.tail018e03.ts.net)."; exit 1; }
if [ -n "$ENV_TOKEN" ]; then
  INGEST_TOKEN="$ENV_TOKEN"
elif [ $TTY = 1 ]; then
  if [ -n "$INGEST_TOKEN" ]; then read -r -s -p "Titkos token (Enter: a meglévő marad): " t </dev/tty
  else read -r -s -p "Titkos token (az oldal gazdájától kapod): " t </dev/tty; fi
  echo; INGEST_TOKEN="${t:-$INGEST_TOKEN}"
fi
[ -n "$INGEST_TOKEN" ] || { echo "A token kötelező."; exit 1; }

code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -H "Authorization: Bearer $INGEST_TOKEN" "$SZERVER/api/ping" || true)
case "$code" in
  200) echo "A szerver elérhető, a token jó." ;;
  401) echo "A szerver elérhető, de a token hibás. Kérd el újra, és futtasd újra a parancsot."; exit 1 ;;
  *)   echo "FIGYELEM: a szervert most nem értem el ($SZERVER, kód: ${code:-nincs}). A beállítást elmentem, az ajtófigyelő később újrapróbálja." ;;
esac

AJTO_NEV=$(ask "Az ajtószenzor nevének részlete" "${AJTO_NEV:-SBDW}")
umask 077
{
  printf 'SZERVER=%q\n' "$SZERVER"
  printf 'INGEST_TOKEN=%q\n' "$INGEST_TOKEN"
  printf 'AJTO_NEV=%q\n' "$AJTO_NEV"
} > "$CONF"
umask 022
echo "Beállítások elmentve: $CONF"

# 4. Python-környezet a Bluetooth-figyelőhöz
[ -d shelly-ajto/.venv ] || /usr/bin/python3 -m venv shelly-ajto/.venv
shelly-ajto/.venv/bin/pip install -q --upgrade pip
shelly-ajto/.venv/bin/pip install -q -r shelly-ajto/requirements.txt
chmod +x iroda-macbook/*.command

# 5. Indulás bejelentkezéskor, egy Terminál-ablakban (a Bluetooth-engedélyt a Terminál kapja meg)
[ "${EXM_AJTO_NO_START:-}" = 1 ] && { echo "Kész (indítás kihagyva)."; exit 0; }
START="$DIR/iroda-macbook/start-ajto.command"
if osascript -e 'tell application "System Events" to get the path of every login item' 2>/dev/null | grep -q "start-ajto.command"; then
  echo "Az ajtófigyelő már a bejelentkezési elemek között van."
elif osascript -e "tell application \"System Events\" to make login item at end with properties {path:\"$START\", hidden:false}" >/dev/null 2>&1; then
  echo "Az ajtófigyelő bejelentkezéskor magától elindul."
else
  echo "FIGYELEM: a bejelentkezési elemet nem tudtam hozzáadni. Add hozzá kézzel: Rendszerbeállítások > Általános > Bejelentkezési elemek > + > $START"
fi
pkill -f "iroda-macbook/start-ajto.command" 2>/dev/null || true
pkill -f "shelly-ajto/ajto.py" 2>/dev/null || true
open "$START"
echo
echo "Kész. Megnyílt egy új Terminál-ablak, abban fut az ajtófigyelő. Hagyd nyitva (lekicsinyítheted)."
echo "Ha a macOS Bluetooth-engedélyt kér a Terminálnak, engedélyezd, majd zárd be és nyisd meg újra: $START"
