# Exmentoring

Közös mosómedve-rulett (virtuális 🦝, nem valódi pénz). A nyitóoldal egy 3D kerék, a tétek a Mentoring szoba közös potjából mennek.

## Indítás
```bash
npm install
INGEST_TOKEN=valami-titkos npm start   # http://localhost:3000
npm test                               # kifizetés-logika tesztek
```
Ha nincs `INGEST_TOKEN`, a szerver kiír egy ideiglenes tokent.

## Szabályok
- Pot: 100 000 🦝 induláskor; aznapi első érkezéskor személyenként +10 000 🦝 (`POST /api/presence`).
- Szám 100 🦝 (max. 10), sor/oszlop 500 🦝, szín/páros-páratlan/magas-alacsony 1000 🦝.
- Az "ajtó" minden nyitáskor 1000 🦝-t tesz fel véletlen módon, és csukáskor megpörgeti a kereket.

## Gépről érkező jelek (Bearer token)
```bash
curl -X POST $URL/api/door     -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"state":"open"}'
curl -X POST $URL/api/presence -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"present":["Matyi","Ricsi"]}'
```
A Shelly ajtószenzor az irodai MacBookon fut, beállítása: https://hestencz-mac-mini.tail018e03.ts.net/ajto.html

## Üzemeltetés
- Állapot: `data/state.json` (pot, ranglista), a Mac minin `~/Exmentoring/data/state.json`.
- Env: `PORT`, `INGEST_TOKEN`, `DATA_DIR`.

## Card-Jitsu

A Loop City dojōja a `/jatek.html` oldalon érhető el. A szerveroldali szabálymotor és szobakezelő a `cardjitsu.js`; csak a `cardJitsu` statisztika kerül a `state.json` fájlba, aktív meccs és visszacsatlakozási token nem. Célzott gyors teszt: `node --test cardjitsu.test.js`; a teljes `npm test` a valódi websocketes Card-Jitsu integrációt is futtatja.
