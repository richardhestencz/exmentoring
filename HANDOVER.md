# Exmentoring – telepítés és üzemeltetés

**Az oldal:** https://hestencz-mac-mini.tail018e03.ts.net
**A kód:** https://github.com/richardhestencz/exmentoring

## Mi ez, egy bekezdésben

Az **Exmentoring** a Mentoring szoba közös rulettje: egy naplementés tisztás, középen egy 3D kerék, körülötte mosómedvék. A tétek egy közös, virtuális mosómedve-potból mennek, valódi pénz nincs benne. A golyót a szerver valódi fizikával szimulálja, így mindenki ugyanazt a pörgetést látja egyszerre. A kerék akkor indul, ha valaki tét után megnyomja a **Pörgetés** gombot, vagy ha becsukódik az ajtó. Nyitáskor az ajtó maga is feltesz 1000 mosómedvét, csukáskor pörög.

## Felállás

| Gép | Hol van | Mit csinál |
|---|---|---|
| **Mac mini** | otthon | A játékszerver és a weboldal. Tailscale Funnelen át fix címen érhető el. |
| **Irodai MacBook** | az irodában, az ajtótól max. kb. 10 méterre | Bluetooth-on figyeli a Shelly BLU ajtószenzort, és minden nyitásról és zárásról szól a szervernek az interneten át. Záráskor indul a pörgetés. |

## Mi van a repóban

| Mappa / fájl | Mire való |
|---|---|
| `server/` | Node.js játékszerver és a weboldal (`public/`), a golyófizika (`physics.js`), tesztek (`npm test`) |
| `server/public/ajto.html` | Útmutató az ajtófigyelő beállításához (az oldalon: Ajtó beállítása) |
| `server/public/exmentoring-ajto-claude.md` | Ugyanez Claude-nak: ha odaadod neki az irodai MacBookon, elvégzi a beállítást |
| `server/public/bent.html`, `server/public/itt.html`, `server/presence.js` | „Ki van bent?”: QR-kódos bejelentkezés az ajtónál (`/itt?k=<ajtókód>`), a becenév a telefonhoz kötve |
| `server/public/avatar.js`, `server/avatars.js`, `server/public/profil.html`, `server/public/img/spots/` | A tisztás helyei: aki bent van (QR), a jóváhagyott Gemini-kép (scene-v7) saját helyén jelenik meg (max 16 fő, 16 fix hely: blackjack, póker, rönkök, függőágy, sárkányrepülő, HO-horgászok, kenu). Minden hely mosómedvéje a v7-ből van kivágva (`img/spots/spot-N.png`, éjjel `-n`), a háttér ugyanaz a kép mosómedvék nélkül, így a nyitóoldal pixelre a v7. A helyet a Profil oldalon lehet választani (a fejléc mosómedvéje → menü → Profil). A kép-előállítás szkriptjei csak a Mac minin: `art/gen/pipeline/` |
| `server/profiles.js` | Tét-profilok a becenevekhez: a mostani tétek mentése névvel, felrakás egy kattintással, „minden körben” automatikus felrakás (amíg nyitva az oldal), és „Ismétlés” (az előző kör tétjei) |
| `server/public/cola.html`, `server/cola.js` | Kólakódok: bárki feltehet egy nem használt kódot, aki felhasználta, megjelöli (10 percig visszavonható, 30 nap után eltűnik) |
| `server/public/gyros.html`, `server/gyros.js` | Gyros Központ: a számozott gyrosnyugták gyűjtése és automatikus számolása (a Confluence-táblázat helyett) |
| `shelly-ajto/ajto.py` | A Bluetooth-figyelő, ami nyitáskor/záráskor jelez a szervernek |
| `iroda-macbook/install.sh` | Az ajtófigyelő telepítője az irodai MacBookra |
| `iroda-macbook/start-ajto.command` | Az ajtófigyelőt indítja egy Terminál-ablakban (bejelentkezéskor magától) |
| `mac-mini/install.sh` | A szerver telepítője a Mac minire: függőségek, `.env`, automatikus indulás |
| `mac-mini/run-server.sh` | A szervert indítja (a háttérben futó launchd hívja) |
| `mac-mini/update.sh` | Frissítés a GitHubról: naponta 04:00-kor, és a weboldal gombjával is |
| `.env.example` | Minta a szerver titkos beállításaihoz. A valódi `.env` soha nem kerül fel a GitHubra |

A repó nyilvános, ezért titok ne kerüljön bele: a token csak a Mac mini `.env` fájljában és az irodai MacBook `ajto.env` fájljában van.

## 1. A Mac mini (szerver)

Már be van állítva. Ha újra kell csinálni:

1. **Automatikus bejelentkezés** (Rendszerbeállítások › Felhasználók és csoportok), hogy újraindítás után minden elinduljon.
2. **Alvás kikapcsolása:** `sudo pmset -a sleep 0 disksleep 0 autorestart 1`
3. **Homebrew**, ha még nincs: [brew.sh](https://brew.sh)
4. **Telepítés:**

   ```bash
   git clone https://github.com/richardhestencz/exmentoring.git ~/Exmentoring
   ~/Exmentoring/mac-mini/install.sh
   ```

   Telepíti a Node-ot és a függőségeket, létrehozza a `.env`-et egy új, véletlen tokennel, beállítja, hogy a szerver mindig fusson (összeomlás után is), és a napi frissítést 04:00-ra.
5. **Tailscale Funnel**, a fix címhez:
   - Telepítsd és indítsd el a Tailscale appot, jelentkezz be.
   - `/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg 3000`
   - Az első alkalommal kiír egy linket, ahol a Funnelt engedélyezni kell. Utána futtasd újra.
   - A cím: `/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel status`. Újraindítás után is ugyanaz marad.

## 2. Az irodai MacBook (ajtófigyelő)

A részletes, lépésenkénti útmutató az oldalon van: https://hestencz-mac-mini.tail018e03.ts.net/ajto.html

Röviden: a MacBook Terminálában

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/richardhestencz/exmentoring/main/iroda-macbook/install.sh) https://hestencz-mac-mini.tail018e03.ts.net
```

Ez elkéri a tokent (a Mac minin: `grep INGEST_TOKEN ~/Exmentoring/.env`), kipróbálja, a `~/exmentoring-ajto` mappába telepít, és bejelentkezéskor elindítja az ajtófigyelőt egy Terminál-ablakban. A Terminálnak Bluetooth-engedély kell (Rendszerbeállítások › Adatvédelem és biztonság › Bluetooth).

Claude-dal is mehet: töltsd le az oldalról az `exmentoring-ajto-claude.md` fájlt, és add oda neki a MacBookon.

## 3. Beállítások

**Mac mini, `~/Exmentoring/.env`** (szerkesztés után: `launchctl kickstart -k gui/$(id -u)/hu.exmentoring.server`)

| Kulcs | Mit csinál |
|---|---|
| `PORT` | A szerver portja (3000) |
| `INGEST_TOKEN` | A titkos kulcs az ajtós jelzéshez. A telepítő generálja, ne add ki |
| `DOOR_CODE` | A „Ki van bent?” QR-kód titkos kódja. Ha kiszivárog: új kód, új QR-kód nyomtatása (a lap: `data/qr/ki-van-bent-qr-A5.pdf`, gitben nincs) |

**Irodai MacBook, `~/exmentoring-ajto/ajto.env`** (a telepítő írja, újrafuttatással módosítható)

| Kulcs | Mit csinál |
|---|---|
| `SZERVER` | Az oldal címe |
| `INGEST_TOKEN` | Ugyanaz a token, mint a Mac minin |
| `AJTO_NEV` | A szenzor nevének részlete (alapból `SBDW`) |

## 4. Ellenőrzés

- **Oldal:** https://hestencz-mac-mini.tail018e03.ts.net, két eszközön egyszerre: tét, Pörgetés, mindkettőn egyszerre pörög.
- **Ajtó:** nyisd ki, majd csukd be. Az irodai MacBook ajtófigyelő ablakában: „Az ajtó ki lett nyitva”, majd „Az ajtó be lett csukva”, mindkettő alatt „szerver: elküldve”. Nyitáskor nő az ajtószámláló, záráskor indul egy pörgetés.
- **Ajtó szenzor nélkül:**

  ```bash
  curl -X POST https://hestencz-mac-mini.tail018e03.ts.net/api/door -H "Authorization: Bearer <INGEST_TOKEN>" -H 'content-type: application/json' -d '{"state":"open"}'
  ```

- **Token és cím:** `curl -H "Authorization: Bearer <INGEST_TOKEN>" https://hestencz-mac-mini.tail018e03.ts.net/api/ping` → `{"ok":true}`

## Gyros Központ

Az oldal: https://hestencz-mac-mini.tail018e03.ts.net/gyros.html

A hozzájárulók teljes neve nem lehet a nyilvános repóban. A kezdő adat a Mac minin van: `~/Exmentoring/data/gyros-seed.json` (a `data/` mappa nincs a gitben). A szerver első induláskor ebből tölti be, utána minden a `data/state.json`-ban él. Újraimportálás: állítsd le a szervert, töröld a `gyros` kulcsot a `state.json`-ból, és indítsd újra.

## Tisztás és blackjack (skin nélküli változat)

- **Tisztás:** a jóváhagyott kép (`img/scene-wide.jpg`, éjjel `scene-night-wide.jpg`, mobilon `scene-tall.jpg`). Aki bent van, a saját helyén ül: a kép eredeti mosómedvéje (`img/spots/spot-N.png`, éjjel `-n`), fölötte a neve. Kalap, szemüveg és ruhaszín ebben a változatban nincs.
- **Hely:** a Profil oldalon csak a hely választható (16 hely). Ha valaki nem választ, az első szabad helyre kerül.
- **Blackjack:** csak az asztalra kattintva nyílik (a képen a piknikasztal). Saját kép jön be: szemben a mosómedve osztó, előtted az asztal 6 tétkörrel (`img/bj-view.jpg`, éjjel `bj-view-night.jpg`, 1376x768). A pontok helye a kép képpontjaiban az `index.html` elején, a `BJ_SCENE` objektumban (osztó lapjai, 6 hely, a posztó alja). Egy szabad helyre kattintva („Ülj ide”) leülsz a kiválasztott zsetonnal; a lapok a tétkör fölött, a név és a tét alatta. Vissza: „Vissza a rulettehez” gomb vagy Esc. Keskeny képernyőn a szélső helyek a panel listájában látszanak.
- **Kapcsoló:** `?demo`: mind a 16 hely benépesítve, becenév-kérés nélkül (bemutatóhoz).

## Napi üzemeltetés

| Teendő | Hogyan |
|---|---|
| Kód módosítása | GitHubon szerkeszted vagy pusholsz. A Mac mini 04:00-kor, vagy az oldal alján lévő „Frissítés a GitHubról” gombra frissít (10 percenként max. egyszer). Az irodai MacBook minden indulásnál frissít |
| Naplók (Mac mini) | `~/Exmentoring/logs/server.log`, `update.log` |
| Szerver újraindítása | `launchctl kickstart -k gui/$(id -u)/hu.exmentoring.server` |
| Ajtófigyelő újraindítása (MacBook) | Zárd be az ablakát, majd `open ~/exmentoring-ajto/iroda-macbook/start-ajto.command` |
| Mentés | A pot, a ranglista és a statisztikák: `~/Exmentoring/data/state.json` a Mac minin |
| Pot nullázása | Állítsd le a szervert, töröld a `data/state.json`-t, és indítsd újra (100 000 mosómedvéről indul) |

## Hibaelhárítás

- **Az oldal nem tölt be:** a Mac minin `logs/server.log`, és fut-e: `launchctl print gui/$(id -u)/hu.exmentoring.server | grep state`. Fut-e a Tailscale, és be van-e kapcsolva a Funnel (`funnel status`).
- **Piros „Nincs kapcsolat” csík:** a WebSocket nem jut át. Ellenőrizd a Funnelt.
- **Az ajtó nem jelez:** fut-e a MacBookon a Terminál-ablak, van-e Bluetooth-engedélye a Terminálnak (`Bluetooth device is turned off` hiba = nincs). Nyomd meg a szenzor gombját. Ellenőrizd a távolságot.
- **„szerver HIBA” az ajtófigyelőben:** a MacBook nem éri el az oldalt, vagy rossz a token. Futtasd újra a telepítőt.
- **A frissítés nem megy:** `logs/update.log`. Ha valaki kézzel módosított egy fájlt a Mac minin: `git status`, majd `git checkout -- .`

## Ami még nincs kész

- **„Ki van bent?”:** QR-kód az ajtón. Első beolvasáskor becenév (a telefonhoz kötve, HttpOnly süti, 400 nap), utána minden beolvasás bejelentkezés; az aznapi első +10 000 a potba; második beolvasás: „Elmegyek”; éjfélkor lejár. A céges hálózathoz nem nyúl (NIS2). A gazda a mester tokennel szabadít fel becenevet; 30 nap használat nélkül magától felszabadul.
- **Mosómedve-animáció:** ha a három figura külön, átlátszó hátterű PNG-ben is meglesz, megmozdíthatók.
