// Ki van bent: az ajtón lévő QR-kód (vagy NFC-matrica) az /itt oldalt nyitja meg az ajtókóddal.
// Első alkalommal a telefon becenevet választ, a becenév ehhez a telefonhoz kötődik (szerver által adott, HttpOnly süti).
// Utána minden beolvasás bejelentkezés. A céges hálózatot nem figyeljük: a telefon csak megnyit egy weboldalt.
// A telefon sütijéből csak a SHA-256 lenyomatot tároljuk.
const crypto = require('crypto');

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const RELEASE_MS = 30 * 24 * 3600 * 1000;           // 30 nap használat nélkül a becenév felszabadul
const empty = () => ({ people: {}, here: {} });      // people: becenév -> {dev, created, seen}; here: becenév -> {since, last, day}
const newDevice = () => crypto.randomBytes(16).toString('hex');
const validDevice = (d) => /^[0-9a-f]{32}$/.test(String(d || ''));

function nickOf(P, dev) {
  if (!validDevice(dev)) return null;
  const h = hash(dev);
  return Object.keys(P.people).find((n) => P.people[n].dev === h) || null;
}

// A becenevet ehhez a telefonhoz köti. Ha a telefonnak már volt beceneve, az felszabadul.
function claim(P, nick, dev, now = Date.now()) {
  if (!nick || nick.length < 2) return 'A becenév legalább 2 karakter.';
  if (!validDevice(dev)) return 'Hibás eszköz.';
  const h = hash(dev), p = P.people[nick];
  if (p && p.dev !== h && now - (p.seen || p.created) < RELEASE_MS)
    return 'Ezt a becenevet már egy másik telefon használja. Ha a tiéd, kérd meg a gazdát, hogy szabadítsa fel.';
  if (!p && Object.keys(P.people).length >= 100) return 'Túl sok telefon.';
  const old = nickOf(P, dev);
  if (old && old !== nick) { delete P.people[old]; delete P.here[old]; }
  P.people[nick] = { dev: h, created: p && p.dev === h ? p.created : now, seen: now };
  return null;
}

function release(P, nick) {
  if (!P.people[nick]) return 'Nincs ilyen becenév.';
  delete P.people[nick]; delete P.here[nick];
  return null;
}

// true, ha most érkezett (aznap még nem volt bent, vagy közben elment)
function checkin(P, nick, now, day) {
  const was = P.here[nick];
  const fresh = !was || was.day !== day;
  P.here[nick] = { since: fresh ? now : was.since, last: now, day };
  if (P.people[nick]) P.people[nick].seen = now;
  return fresh;
}

function checkout(P, nick) {
  const was = !!P.here[nick];
  delete P.here[nick];
  return was;
}

// a tegnapi bejelentkezések maguktól lejárnak
function prune(P, day) {
  for (const [n, v] of Object.entries(P.here)) if (v.day !== day) delete P.here[n];
}

// a nyilvános nézet: becenevek és érkezési idők, lenyomat nélkül
function view(P, day, now = Date.now()) {
  prune(P, day);
  return {
    people: Object.keys(P.people).sort((a, b) => a.localeCompare(b, 'hu')),
    free: Object.keys(P.people).filter((n) => now - (P.people[n].seen || P.people[n].created) >= RELEASE_MS),
    here: Object.entries(P.here).map(([nick, v]) => ({ nick, since: v.since })).sort((a, b) => a.since - b.since),
  };
}

module.exports = { hash, RELEASE_MS, empty, newDevice, validDevice, nickOf, claim, release, checkin, checkout, prune, view };
