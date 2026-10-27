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
| `server/public/bent.html` | „Ki van bent?”: a mai belépések (helyben / home office), a belépés ideje (átüléskor nem változik) és a hely; „Kilépek mára” gomb. Az adat a `seats.js`-ből jön. A régi QR-kódos bejelentkezés (`itt.html`, `presence.js`) a kódban maradt, de már nem kell |
| `server/public/avatar.js`, `server/seats.js`, `server/public/img/spots/` | A tisztás helyei: belépéskor mindenki megmondja, hogy helyben vagy home office-ból (HO) van, aztán a képen a „+” jelekkel leül egy szabad helyre (16 fix hely; HO-ból csak a 4 horgász és a kenu, helyben a többi). A saját neve mellett (egérrel ráállva, telefonon mindig) a ✕-szel feláll, és máshova ülhet. Éjfélkor minden hely felszabadul, másnap újra kérdez. Minden hely mosómedvéje a jóváhagyott Gemini-képből (scene-v7) van kivágva (`img/spots/spot-N.png`, éjjel `-n`). A kép-előállítás szkriptjei csak a Mac minin: `art/gen/pipeline/` |
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

## Tisztás és blackjack

- **Tisztás:** a jóváhagyott kép (`img/scene-wide.jpg`, éjjel `scene-night-wide.jpg`, mobilon `scene-tall.jpg`), mindig teljes szélességében; ha nem fér ki a magasságba, kicsinyítve (legfeljebb 72%-ig), a széle elhalványul. Aki leült, a saját helyén ül: a kép eredeti mosómedvéje (`img/spots/spot-N.png`, éjjel `-n`), fölötte a neve. Skin (kalap, szemüveg, ruha) nincs.
- **Belépés és hely:** becenév, aztán „Helyben” vagy „Home office” (minden nap újra). Utána a képen „+” jelek mutatják a szabad helyeket (HO: 4 horgász és a kenu; helyben a többi 11); helyválasztás közben a felső panelek elhalványulnak. A saját neved melletti ✕-szel felállsz; a „Kilépek” gombbal (a nevednél, vagy a Ki van bent? oldalon) végeztél mára, és eltűnsz a listából (ugyanaznap a „Belépek” gombbal jöhetsz vissza, új időponttal). Szerver: `seats.js` (`where`, `seat`, `stand` üzenetek), éjfélkor lejár. QR-kód ehhez nem kell.
- **Blackjack:** csak az asztalra kattintva nyílik (a képen a piknikasztal). Saját kép jön be: szemben a mosómedve osztó, előtted az asztal 6 tétkörrel (`img/bj-view.jpg`, éjjel `bj-view-night.jpg`, 1376x768). A pontok helye a kép képpontjaiban az `index.html` elején, a `BJ_SCENE` objektumban (osztó lapjai, 6 hely, a posztó alja). Egy szabad helyre kattintva („Ülj ide”) leülsz a kiválasztott zsetonnal; a lapok a tétkör fölött, a név és a tét alatta. Vissza: „Vissza a rulettehez” gomb vagy Esc. Keskeny képernyőn a szélső helyek a panel listájában látszanak.
- **Kapcsoló:** `?demo`: mind a 16 hely benépesítve, becenév-kérés nélkül (bemutatóhoz).

## Közös zene

Egy **YouTube-lejátszási lista van bekötve** (lehetőleg közös szerkesztésű: a YouTube-on Megosztás / Közreműködés, a meghívó linkkel bárki hozzáadhat). Amit az emberek a YouTube-on a listába tesznek, kb. egy percen belül megjelenik az oldalon, és a lista sorban, magától szól (a végén újrakezdi). A fejléc **🎵 Zene** gombja egy jobb oldali panelt nyit (telefonon teljes szélességben, mindennél felül, bezárva is szól): lejátszó, ⏮ ⏸ ⏭ (mindenkinek közös), helyi hangerő, a lista linkje (megnyitás, másolás, ↻ frissítés), a számok listája (kattintásra indul).
- **Bekötés:** első alkalommal a panelben a lista linkjét kell beilleszteni (a `jct=` meghívó kód megmarad a megosztott linkben); később „Másik lista bekötése”. Alapértelmezés a Mac mini `.env`-jéből is jöhet: `MUSIC_PLAYLIST=<link>`. A lista legyen nyilvános vagy nem listázott (privátot a szerver nem lát).
- **Szerver:** `server/music.js`. A lista tartalmát API-kulcs nélkül a YouTube lejátszásilista-oldaláról olvassa (`fetchList`: ytInitialData, `lockupViewModel` / `playlistVideoRenderer`, folytatás-oldalak a `youtubei/v1/browse`-on), percenként, bekötéskor és ↻-re. Ha a YouTube megváltoztatja az oldal szerkezetét, itt kell igazítani (a teszt mutatja a várt formát). Állapot a `state.json` `music` kulcsában: `list`, `link`, `title`, `items` [{v, title}], `cur`, `startedAt`, `paused`, `pos`, `rev`. WS: `music-list`, `music-refresh`, `music-play` (i), `music-skip`, `music-pause`, `music-ended` (a `rev` szűri a dupla jelentést). Ami épp szól, frissítéskor szól tovább; ha kikerült a listából, a helyén lévő indul. Tesztben `MUSIC_FETCH=0`.
- **Kliens:** `server/public/zene.js` (YouTube IFrame Player; nem beágyazható számot átugor). **Szinkron:** pontos óra oda-vissza időméréssel (`music-ping` / `music-pong`, a legkisebb késésű mérés, a késés felét beszámítva); 2 s-onként, és minden indulás, puffer, reklám után azonnal a közös helyre igazít, ha 0,35 s-nál többet csúszott (0,1 s ráhagyással a tekerés miatt). Mérve két böngészőben: egymáshoz képest ~0,02 s. Oldalbetöltés után egy kattintás kell a „Zene bekapcsolása” gombra (böngésző-szabály).
- **Ajtó:** `/api/door` nyitásra `music-duck`: mindenkinél 15%-ra halkul, legalább 15 s-ig és amíg nyitva; csukás után 2 s alatt vissza; 5 perc után magától feloldódik.
- Korlátok: YouTube-hirdetések megjelenhetnek, Premium nem érvényes; legfeljebb 300 szám.

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

## Chapter esemény (időpont-szavazás)

`/chapter.html`: „Mikor legyen az AI chapter nagyba?” Naptár (egyelőre csak november: 2026-11-01 – 2026-11-30, akárhány nap jelölhető; `server/chapter.js`, `QUESTION`, `FROM`, `TO`), mindenki bejelöli az összes napot, ami jó neki (koppintásra azonnal mentődik, WS `chapter-set`). Alatta oszlopdiagram naponként (a vezető nap piros, 👑 a naptárban), top 5 a nevekkel, és kik vannak ma bent, de még nem jelöltek. A főoldal fejlécében villogó piros „📅 Jelöld be” gomb, amíg az adott becenévvel nincs jelölés. Az állapot a `state` üzenetben megy (`chapter`), a hírfolyamba első jelöléskor kerül üzenet.

## 3D tisztás (BÉTA, élesben)

A főoldal fejlécében a **BÉTA** felirat (`#beta`) fehér áttűnéssel a **`/beta.html`** oldalra visz. Ez **ugyanaz az `index.html`** (a szerver `/beta`, `/beta.html` útvonalon is azt adja), csak béta módban (`BETA`, `html.beta3d`): a festett háttérkép helyett az élő 3D tisztás látszik egy iframe-ben (`/tisztas3d.html?embed=1`), a rulett, a blackjack, a ranglista, az üzenetek és minden más ugyanúgy működik. A főoldal változásai így a bétára is érvényesek.
- **Háttér:** az iframe kitölti a színpadot. A főoldal minden változáskor elküldi a kerékkamerája helyzetét (`cam`: pozíció a kerék egységeiben, fov, nézet-eltolás, méret), a 3D kamera ezt követi a kerék méretarányával (`WK`) a 3D kerék köré (`embedCam`): így a pörgéskori billenés és közelítés is pontosan együtt mozog (a sima síkbeli nagyítás pörgés után elcsúszott). Az elmosás CSS-szűrő marad. Beágyazva a 3D kerék rejtve (a főoldalé látszik ugyanott); a piknikasztalra kattintva nyílik a blackjack.
- **🦝 Belépés a tisztásra** (a név melletti gomb): az iframe kitölti a képernyőt (`.stage.playing3d`), indul a belépő. **T: menü** (látszik az egér; Folytatás, látószög-csúszka 40–100°, alapból 70°, Kilépés a tisztásról; a főoldalon nyomott T is ezt nyitja; mobilon ☰ Menü gomb). Az Esc-et a böngésző foglalja: csak elengedi az egeret, vagy a Kilépés gomb; a mosómedve ott marad.
- **Ugrás a játékba:** a kerékre célozva „E Rulett” (vissza a rulett-nézetbe), a piknikasztalra „E Blackjack” (kinyílik a blackjack). Önálló 3D oldalon ezek a `/beta.html` (illetve `#blackjack`) címre visznek. Szóköz: ugrás.
- **A kerék a 3D-ben:** a kőkör kövein áll (a tűzifa a kőkör közepén nem rajzolódik ki, `clipCenter`), a szerver `state` üzeneteiből ugyanazt a golyópályát játssza vissza, mint a főoldal; játék közben a kerék fölött „🎡 Pörög a kerék!”, majd a nyerőszám.
- Üzenetek (postMessage, csak azonos originről): főoldal -> iframe `layout`, `cam`, `play`, `pause` (T), `night`; iframe -> főoldal `ready`, `exit` (why: roulette / bj), `bj`, `need-nick`.

A fejlesztés a `vilag3d` ágon folyik, élesbe fast-forwarddal vagy squash-merge-dzsel kerül.

`/tisztas3d.html`: a tisztás valódi 3D-ben, Tripo AI-jal generált modellekből (ingyenes csomag, CC BY 4.0, a forrás az oldalon feltüntetve). Be lehet lépni, és a saját mosómedvével járkálni.
- **Belépés:** becenév, majd az Assassin's Creed-szerű belépő: fehér „Animus”-tér szürke szilánkokkal („SZINKRONIZÁLÁS”), fehér villanás, a világ ködből, a mosómedvénktől kifelé hullámzó sorrendben bukkan elő, a kamera sasszemből leereszkedik a mosómedve mögé.
- **Irányítás:** WASD / nyilak, Shift futás, W/S előre-hátra, A/D és az egér vízszintesen a mosómedvét fordítja (a kamera mindig mögötte marad, ülve körbe lehet nézni), Szóköz ugrás, T menü, kattintás után az egér forgatja a kamerát (pointer lock, Esc elengedi), görgő közelítés, E leülés / felállás. A kamera a jobb váll mögül néz, középen **célzó**: a célzott szabad hely narancs gyűrűt kap, a célzó kivilágosodik. Mobilon joystick bal lent, Futás és cselekvés gomb jobb lent. A kamera nem megy be a fákba, tárgyakba (sugárvetés).
- **Fizika, mint egy játékban:** induláskor a tárgyak (rönkök, piknikasztal, kocsmaasztal és sámlik, függőágy, kőkör, rulettkerék, kenu) tetejéről 8 cm-es magassági térkép készül (three-mesh-bvh gyors sugárvetéssel, `buildObstacles`, simított `hAt`, `groundAt`). Ami a talpnál magasabb, az fal, a mentén csúszik (`moveBy` elforgatott próbái). Járva csak 6 cm-t lép fel, és az alapszint (`me.base`) csak ugrással emelkedhet, így apránként nem kúszik fel semmire; Szóköz: ugrás (kb. 0,95 m), rá lehet állni, sétálni rajta, leesni róla. A kocsmaasztalra a sámliról lehet felugrani. A fák, a tó (a kenu kivétel) és a tisztás széle külön ütközés. A magasság (`y`) a szerveren is mentődik, a többiek is látják.
- **Helyek:** a 16 hely a tárgyakból mérve (`buildSpots`, sugárvetés a tárgyak tetejére); ha a célzó a helyre mutat és a mosómedve 2,4 m-en belül áll (`aimSpot`): „E Leülés a rönkre” stb. Ütközés: fák, tűz, asztalok, rönkök, függőágy-oszlopok, a tó és a tisztás széle (`OBST`, `collide`).
- **Közös állapot:** `server/world.js` (becenév -> x, z, irány, mozgás, hely, bent van-e), WS: `w-watch`, `w-join`, `w-move` (5/s), `w-sit`, `w-leave`, a szerver legfeljebb 10/s küld `world` üzenetet. **Kilépés után a mosómedve ott marad**, ahol hagyták (💤 a neve mellett); visszalépve onnan folytatja.
- **Statiszták:** `?demo` esetén a páratlan helyeken mosómedve-statiszták ülnek (ezekre nem lehet leülni); alapból csak a valódi játékosok.
- `img/m3d/raccoon-poses.glb`: a mosómedve zárt hálóval (a Tripo-varratok összehegesztve, a súlyok zárt voxel-proxyról), pózok (stand, sit, sit_ground, lie, paddle, fish) és ciklusok (idle, walk, run). Újraépítés: `tools3d/rebuild.py`, majd `tools3d/poses.py`.
- `img/m3d/picnic.glb`, `pub.glb`, `log.glb`, `firering.glb`, `hammock.glb`, `canoe.glb`, `pine.glb`: a tárgyak (textúra 1024 px, Draco). A nyers Tripo-fájlok: `art3d/` (nincs a repóban).
