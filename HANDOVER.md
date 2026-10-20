# Exmentoring – átadás és telepítés a Mac minire

Ez a mappa mindent tartalmaz, ami az Exmentoring futtatásához kell: a játékszervert és a weboldalt, az ajtószenzor figyelőjét, és a Mac minis telepítőt. A mappa egyben egy git-repó is, ezt kell feltölteni a GitHubra.

## Mi ez, egy bekezdésben

Az **Exmentoring** a Mentoring szoba közös rulettje: egy naplementés tisztás, középen egy 3D kerék, körülötte mosómedvék. A tétek egy közös, virtuális mosómedve-potból mennek, valódi pénz nincs benne. A golyót a szerver valódi fizikával szimulálja, így mindenki ugyanazt a pörgetést látja egyszerre. A kerék akkor indul, ha valaki tét után megnyomja a **Pörgetés** gombot, vagy ha kinyílik az ajtó. Az ajtót egy Shelly BLU Door/Window szenzor figyeli Bluetooth-on, ezért a szervernek az ajtó közelében lévő gépen (a Mac minin) kell futnia.

## Mi van a mappában

| Mappa / fájl | Mire való |
|---|---|
| `server/` | Node.js játékszerver és a weboldal (`public/`), a golyófizika (`physics.js`), tesztek (`npm test`) |
| `shelly-ajto/ajto.py` | Bluetooth-on figyeli az ajtót, és nyitáskor/záráskor jelez a szervernek; opcionálisan Mac-értesítés és iMessage |
| `mac-mini/install.sh` | Egyszeri telepítő: függőségek, `.env`, automatikus indulás |
| `mac-mini/run-server.sh` | A szervert indítja (a háttérben futó launchd hívja) |
| `mac-mini/start-ajto.command` | Az ajtófigyelőt indítja egy Terminál-ablakban (bejelentkezéskor magától) |
| `mac-mini/update.sh` | Frissítés a GitHubról: naponta 04:00-kor, és a weboldal gombjával is |
| `.env.example` | Minta a titkos beállításokhoz. A valódi `.env` soha nem kerül fel a GitHubra |

## 1. Feltöltés a GitHubra (a MacBookon)

A mappa már git-repó egy kész committal, csak fel kell tölteni. A `gh` be van jelentkezve a `richardhestencz` fiókkal.

```bash
cd ~/Exmentoring
gh repo create exmentoring --public --source . --push
```

Ezután a kód itt lesz: `https://github.com/richardhestencz/exmentoring`. Bárhonnan szerkesztheted a GitHub webes felületén is. A Mac mini naponta egyszer magától frissül, vagy amikor valaki megnyomja az oldalon a **Frissítés a GitHubról** gombot.

A repó nyilvános, ezért titok ne kerüljön bele: a token, a telefonszámok és a kollégák nevei csak a Mac mini `.env` fájljában vannak.

## 2. A Mac mini előkészítése (egyszer)

1. **Felhasználó és automatikus bejelentkezés:** Rendszerbeállítások › Felhasználók és csoportok › Automatikus bejelentkezés. Erre azért van szükség, mert az ajtófigyelő bejelentkezéskor indul.
2. **Alvás kikapcsolása:** Rendszerbeállítások › Energia: kapcsold be, hogy kikapcsolt kijelzőnél se aludjon el, és hogy áramszünet után magától induljon el. Terminálból ugyanez: `sudo pmset -a sleep 0 disksleep 0 autorestart 1`.
3. **Homebrew:** ha még nincs, telepítsd a [brew.sh](https://brew.sh) oldalon lévő paranccsal.
4. **Elhelyezés:** a Mac mini legyen az ajtótól legfeljebb kb. 10 méterre, falak nélkül, mert a Shelly szenzor Bluetooth-hatótávja ennyi.

## 3. Telepítés a Mac minin

```bash
git clone https://github.com/richardhestencz/exmentoring.git ~/exmentoring
~/exmentoring/mac-mini/install.sh
```

A telepítő a következőket csinálja:
- Telepíti a Node-ot (ha hiányzik), a szerver és a Python-szkript függőségeit.
- Létrehozza a `.env` fájlt egy új, véletlen tokennel.
- Beállítja, hogy a szerver mindig fusson, és összeomlás után magától újrainduljon.
- Beállítja a napi frissítést 04:00-ra.
- Felveszi az ajtófigyelőt a bejelentkezési elemek közé, és most el is indítja egy Terminál-ablakban.

**Az első induláskor a macOS engedélyeket kér. Mindet engedélyezd:**
- Bluetooth a Terminálnak (Adatvédelem › Bluetooth), különben az ajtófigyelő nem látja a szenzort.
- „System Events” vezérlése (a bejelentkezési elem miatt).
- Ha iMessage-et is kérsz: a Messages vezérlése (Adatvédelem › Automatizálás).

Ezután az oldal a Mac minin elérhető: `http://localhost:3000`.

## 4. Beállítások a `.env` fájlban (opcionális)

A fájl helye: `~/exmentoring/.env`. Szerkesztés után futtasd újra a `mac-mini/install.sh`-t, vagy indítsd újra a gépet.

| Kulcs | Mit csinál |
|---|---|
| `INGEST_TOKEN` | A titkos kulcs az ajtós jelzéshez. A telepítő generálja, ne add ki |
| `AJTO_NEV` | A szenzor nevének részlete (alapból `SBDW`) |
| `UZENET` | Ha kitöltöd egy telefonszámmal vagy Apple ID-val, minden nyitás/zárás iMessage-et küld oda. Üresen nincs üzenet |
| `EBED_NEVEK` | Vesszővel elválasztott nevek az ebédidős (11–13 óra) „ki ment ki” tipphez. Üresen nincs tipp |

## 5. Elérés kívülről, fix címen: Tailscale Funnel (ingyenes)

1. Telepítsd a Tailscale-t a Mac minire (`brew install --cask tailscale`, vagy az App Store-ból), indítsd el, és jelentkezz be egy ingyenes fiókkal.
2. A [Tailscale admin felületén](https://login.tailscale.com/admin/dns) kapcsold be a **MagicDNS**-t és a **HTTPS-tanúsítványokat**.
3. Terminálban:

   ```bash
   /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg 3000
   ```

   Az első alkalommal kiír egy linket, ahol engedélyezni kell a Funnelt a gépre. Ezt nyisd meg és engedélyezd, majd futtasd újra a parancsot.
4. A fix címet így látod: `/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel status`. Valami ilyesmi lesz: `https://mac-mini.tailXXXX.ts.net`. Ez újraindítás után is ugyanaz marad, ezt oszd meg a többiekkel.

**Ellenőrizd, hogy a kerék élőben működik ezen a címen:** nyisd meg két különböző eszközön (pl. telefonon mobilnetről és a MacBookon), tegyél tétet, nyomd meg a Pörgetés gombot, és nézd meg, hogy mindkettőn egyszerre pörög-e. Ha az oldal betölt, de a felső sáv alatt piros „Nincs kapcsolat” csík jelenik meg, akkor a Funnel nem engedi át a WebSocketet. Ebben az esetben tartalék megoldás az ngrok ingyenes fix címe (ott minden új látogató egyszer egy figyelmeztető oldalt lát).

## 6. Ellenőrzés: működik-e minden

- **Oldal:** `http://localhost:3000` a Mac minin, vagy a Funnel-cím bárhonnan.
- **Ajtó:** nyisd ki az ajtót. A Terminál-ablakban megjelenik a „Az ajtó ki lett nyitva” és a „szerver: elküldve” sor, az oldalon nő az ajtószámláló, és elindul egy pörgetés.
- **Ajtó szenzor nélkül:** a tokent a `~/exmentoring/.env` fájlban találod:

  ```bash
  curl -X POST http://localhost:3000/api/door -H "Authorization: Bearer <INGEST_TOKEN>" -H 'content-type: application/json' -d '{"state":"open"}'
  ```

- **Frissítés:** az oldal alján a „Frissítés a GitHubról” gomb. Tíz percenként legfeljebb egyszer indítható. Ha nincs új verzió, nem történik semmi; ha van, a szerver újraindul, és a megnyitott oldalak maguktól újratöltenek.

## Napi üzemeltetés

| Teendő | Hogyan |
|---|---|
| Kód módosítása | GitHubon szerkeszted vagy pusholsz. A Mac mini 04:00-kor, vagy a gombra frissít |
| Naplók | `~/exmentoring/logs/server.log`, `update.log` |
| Szerver kézi újraindítása | `launchctl kickstart -k gui/$(id -u)/hu.exmentoring.server` |
| Ajtófigyelő újraindítása | Zárd be a Terminál-ablakát, és indítsd el a `mac-mini/start-ajto.command`-ot |
| Mentés | A pot, a ranglista és a statisztikák a `~/exmentoring/data/state.json` fájlban vannak. Ezt érdemes néha lemásolni |
| Pot nullázása | Állítsd le a szervert, töröld a `data/state.json`-t, és indítsd újra (100 000 mosómedvéről indul) |

## Hibaelhárítás

- **Az oldal nem tölt be:** nézd meg a `logs/server.log`-ot. Fut-e: `launchctl print gui/$(id -u)/hu.exmentoring.server | grep state`.
- **Az ajtó nem jelez:** fut-e a Terminál-ablak, és van-e Bluetooth-engedélye a Terminálnak? Nyomd meg a szenzor gombját, hogy hirdessen. Ellenőrizd a távolságot is.
- **A frissítés nem megy:** a `logs/update.log`-ban látod az okot. Gyakori ok, hogy a Mac minin kézzel módosítottak egy fájlt: ilyenkor a `git status` megmutatja, a `git checkout -- .` pedig visszaállítja.
- **A Mac mini elaludt vagy újraindult:** automatikus bejelentkezéssel a szerver és az ajtófigyelő magától elindul. A Tailscale Funnel a `--bg` miatt megmarad.

## Ami még nincs kész

- **„Ki van bent” funkció:** a szerver már fogadja (`POST /api/presence`, `{"present":["Név"]}` a tokennel). Aki aznap először jelentkezik, +10 000 mosómedvét hoz a potba. Azt viszont még nem építettük meg, ami ezt automatikusan küldi. A Bluetooth-os telefonszámlálás erre nem megbízható. A javasolt megoldás egy NFC-matrica az ajtónál, plusz egy iPhone Parancsok automatizálás, ami ezt a végpontot hívja.
- **Mosómedve-animáció:** ha a három figura külön, átlátszó hátterű PNG-ben is meglesz, megmozdíthatók (a gitáros ringatózik stb.).
