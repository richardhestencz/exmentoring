# Feladat Claude-nak: az Exmentoring ajtófigyelő beállítása ezen a MacBookon

Ezt a fájlt a felhasználó adta át. Ezen a gépen (az irodai MacBookon, az ajtó közelében) kell beállítani az Exmentoring ajtófigyelőt. Kövesd pontosan a lépéseket, és minden lépés végén ellenőrizd az eredményt.

## Háttér

- Az Exmentoring a Mentoring szoba közös mosómedve-rulettje (virtuális játék, valódi pénz nincs benne).
- Az oldal: https://hestencz-mac-mini.tail018e03.ts.net (egy otthoni Mac minin fut, Tailscale Funnelen át érhető el).
- A kód: https://github.com/richardhestencz/exmentoring (nyilvános repó).
- Az ajtón egy Shelly BLU Door/Window szenzor van, ami Bluetooth-on (BTHome v2) hirdeti a nyitást és a zárást. A Bluetooth csak kb. 10 méterig ér, ezért ez a MacBook figyeli a szenzort, és minden nyitásról és zárásról HTTP-kérést küld az oldalnak (`POST /api/door`, Bearer tokennel).
- A telepítő: `iroda-macbook/install.sh` a repóban. A `~/exmentoring-ajto` mappába telepít, a beállításokat a `~/exmentoring-ajto/ajto.env` fájlba menti (jogosultság 600), és bejelentkezési elemként indítja a `iroda-macbook/start-ajto.command` szkriptet egy Terminál-ablakban.

## Szabályok

- A titkos tokent a felhasználótól kérd el. Soha ne írd ki a válaszaidba, ne tedd parancssori argumentumba, ne commitold, és ne mentsd máshová, mint amit a telepítő csinál.
- Ne kérj és ne írj be jelszót. Ha valami rendszergazdai jelszót kér (például `sudo`), add át a parancsot a felhasználónak, hogy ő futtassa.
- A rendszerbeállításokat (Bluetooth-engedély, energiatakarékosság) a felhasználó kapcsolja át, te csak mondd meg neki, hol.
- A repóban ne módosíts semmit, és ne pusholj.

## 1. Előfeltételek ellenőrzése

```bash
xcode-select -p && git --version && /usr/bin/python3 --version
```

Ha az `xcode-select -p` hibát ad, futtasd: `xcode-select --install`. Kérd meg a felhasználót, hogy a felugró ablakban kattintson a Telepítés gombra, és várja meg a végét. Utána ellenőrizd újra.

Nézd meg, hogy az oldal elérhető-e erről a gépről:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://hestencz-mac-mini.tail018e03.ts.net/
```

A várt eredmény: `200`. Ha nem ez, szólj a felhasználónak, hogy az oldal (a Mac mini) nem érhető el, és állj meg.

## 2. A token

Kérd el a felhasználótól az `INGEST_TOKEN` értékét. A Mac minin így nézhető meg: `grep INGEST_TOKEN ~/Exmentoring/.env`. Ha megkaptad, ellenőrizd, de ne írd vissza a válaszodba:

```bash
INGEST_TOKEN='<a token>' sh -c 'curl -s -H "Authorization: Bearer $INGEST_TOKEN" https://hestencz-mac-mini.tail018e03.ts.net/api/ping'
```

Várt válasz: `{"ok":true}`. Ha `{"error":"hibás token"}` jön, kérd el újra.

## 3. Telepítés

A telepítő kérdés nélkül fut, ha a token környezeti változóban van, és nincs terminál a bemenetén:

```bash
INGEST_TOKEN='<a token>' bash <(curl -fsSL https://raw.githubusercontent.com/richardhestencz/exmentoring/main/iroda-macbook/install.sh) https://hestencz-mac-mini.tail018e03.ts.net </dev/null
```

Várt kimenet többek között:
- `A szerver elérhető, a token jó.`
- `Beállítások elmentve: /Users/<felhasználó>/exmentoring-ajto/ajto.env`
- `Kész. Megnyílt egy új Terminál-ablak, abban fut az ajtófigyelő.`

Ha azt írja, hogy a bejelentkezési elemet nem tudta hozzáadni, kérd meg a felhasználót, hogy engedélyezze a „System Events” vezérlését (Rendszerbeállítások › Adatvédelem és biztonság › Automatizálás), majd futtasd újra a telepítőt.

## 4. Bluetooth-engedély a Terminálnak

Az ajtófigyelő a Terminálban fut, ezért a Terminálnak kell Bluetooth-engedély. Ellenőrizd az ajtófigyelő ablakát:

```bash
osascript -e 'tell application "Terminal" to get contents of selected tab of front window' | tail -20
```

- Ha ezt látod: `Bluetooth device is turned off`, akkor vagy ki van kapcsolva a Bluetooth, vagy a Terminálnak nincs engedélye. Ellenőrizd: `system_profiler SPBluetoothDataType | grep State`. Ha `On`, kérd meg a felhasználót: Rendszerbeállítások › Adatvédelem és biztonság › Bluetooth › kapcsolja be a Terminált (ha nincs a listán, a + gombbal adja hozzá: Alkalmazások › Segédprogramok › Terminál). Megnyithatod neki: `open "x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth"`
- Az engedély után indítsd újra az ajtófigyelőt:

```bash
pkill -f "iroda-macbook/start-ajto.command"; pkill -f "shelly-ajto/ajto.py"; open ~/exmentoring-ajto/iroda-macbook/start-ajto.command
```

Jó állapot: az ablakban `Figyelés...` áll, és nem jön újra hiba.

## 5. Ne aludjon el a MacBook

Kérd meg a felhasználót, hogy tartsa töltőn és nyitott fedéllel, és futtassa (jelszót kér):

```bash
sudo pmset -c sleep 0 disksleep 0
```

Ellenőrzés: `pmset -g | grep -E ' sleep'` (töltőn `0` legyen).

## 6. Végső ellenőrzés

1. Kérd meg a felhasználót, hogy nyissa ki, majd csukja be az ajtót.
2. Az ajtófigyelő ablakában meg kell jelennie: `Az ajtó ki lett nyitva`, majd `Az ajtó be lett csukva`, mindkettő alatt: `szerver: elküldve`.
3. Az oldalon (https://hestencz-mac-mini.tail018e03.ts.net) nyitáskor nő az ajtószámláló, záráskor elindul egy pörgetés.

Ha nem jelez: a szenzor legyen 10 méteren belül; a hirdetéseket így lehet nézni: `cd ~/exmentoring-ajto && set -a && . ./ajto.env && set +a && shelly-ajto/.venv/bin/python shelly-ajto/ajto.py --debug` (előtte állítsd le a futó példányt, és utána indítsd újra a 4. lépés parancsával).

## Kész állapot

Számolj be a felhasználónak checklistben: előfeltételek, token jó, telepítés kész, Bluetooth-engedély, alvás kikapcsolva, ajtózárás elindította a kereket. Ami nem sikerült, azt jelöld meg, és írd le, mit kell még tennie.
