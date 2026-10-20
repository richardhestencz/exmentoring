# Exmentoring

A Mentoring szoba közös mosómedve-rulettje (virtuális játék, valódi pénz nincs benne), és a Shelly BLU ajtószenzor figyelője.

**Az oldal:** https://hestencz-mac-mini.tail018e03.ts.net

- `server/`: Node.js játékszerver és weboldal (3D kerék, szerveroldali golyófizika, közös pot, ranglista). A Mac minin fut.
- `iroda-macbook/` és `shelly-ajto/`: az ajtófigyelő az irodai MacBookra, ami Bluetooth-on figyeli az ajtót, és jelez a szervernek
- `mac-mini/`: a szerver telepítő- és frissítőszkriptjei

A telepítés és az üzemeltetés leírása: [HANDOVER.md](HANDOVER.md). Az ajtófigyelő beállítása: [az oldalon](https://hestencz-mac-mini.tail018e03.ts.net/ajto.html).
