# Exmentoring

A Mentoring szoba közös mosómedve-rulettje (virtuális játék, valódi pénz nincs benne), és a Shelly BLU ajtószenzor figyelője.

- `server/`: Node.js játékszerver és weboldal (3D kerék, szerveroldali golyófizika, közös pot, ranglista)
- `shelly-ajto/`: Python szkript, ami Bluetooth-on figyeli az ajtót, és jelez a szervernek
- `mac-mini/`: telepítő és indítószkriptek a Mac minire

A telepítés és az üzemeltetés leírása: [HANDOVER.md](HANDOVER.md).
