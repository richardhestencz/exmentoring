// Ki van bent: a telefonok maguk jelentkeznek be egy személyes linkkel (iPhone Parancsok / Android automatizálás),
// amikor csatlakoznak az irodai Wi-Fihez vagy megérkeznek az irodához. A céges hálózatot nem figyeljük és nem pásztázzuk.
// A személyes tokenből csak a SHA-256 lenyomatot tároljuk.
const crypto = require('crypto');

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const empty = () => ({ people: {}, here: {} });   // people: becenév -> {h, created}; here: becenév -> {since, last, day}

function addPerson(P, nick, now = Date.now()) {
  if (!nick || nick.length < 2) return { error: 'A becenév legalább 2 karakter.' };
  if (P.people[nick]) return { error: 'Ez a becenév már fel van véve. Előbb töröld, ha új linket akarsz.' };
  if (Object.keys(P.people).length >= 100) return { error: 'Túl sok telefon.' };
  const token = crypto.randomBytes(16).toString('hex');
  P.people[nick] = { h: hash(token), created: now };
  return { token };
}

function removePerson(P, nick) {
  if (!P.people[nick]) return 'Nincs ilyen becenév.';
  delete P.people[nick]; delete P.here[nick];
  return null;
}

function byToken(P, token) {
  if (!/^[0-9a-f]{32}$/.test(String(token))) return null;
  const h = hash(token);
  return Object.keys(P.people).find((n) => P.people[n].h === h) || null;
}

// true, ha most érkezett (aznap még nem volt bent, vagy közben elment)
function checkin(P, nick, now, day) {
  const was = P.here[nick];
  const fresh = !was || was.day !== day;
  P.here[nick] = { since: fresh ? now : was.since, last: now, day };
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

function view(P, day) {
  prune(P, day);
  return {
    people: Object.keys(P.people).sort((a, b) => a.localeCompare(b, 'hu')),
    here: Object.entries(P.here).map(([nick, v]) => ({ nick, since: v.since })).sort((a, b) => a.since - b.since),
  };
}

module.exports = { hash, empty, addPerson, removePerson, byToken, checkin, checkout, prune, view };
