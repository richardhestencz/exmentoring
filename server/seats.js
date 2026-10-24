// Ki ül hol a tisztáson: belépéskor mindenki megmondja, hogy home office-ból (HO) vagy helyben van, és utána a képen
// a „+” jelekkel választ helyet. HO-ból csak a tó melletti helyek (horgászok, kenu) választhatók, helyben a többi.
// Minden reggel tiszta lap: a tegnapi bejelentkezések és helyek lejárnak.
const A = require('./public/avatar.js');

const empty = () => ({});            // becenév -> { mode: 'ho' | 'bent', spot: szám vagy null, day, since: az aznapi belépés ideje }
const MODES = ['ho', 'bent'];

function prune(S, day) {
  for (const [n, v] of Object.entries(S)) if (v.day !== day) delete S[n];
}

function where(S, nick, mode, day, now = Date.now()) {
  if (!nick) return 'Előbb add meg a beceneved.';
  if (!MODES.includes(mode)) return 'Válaszd ki, hogy home office-ból vagy helyben vagy.';
  prune(S, day);
  if (!S[nick] && Object.keys(S).length >= 200) return 'Túl sokan vannak bent.';
  const was = S[nick];
  // ha másik módra vált, a helye felszabadul (HO-ból nem ülhet az irodai helyen, és fordítva); a belépés ideje marad
  S[nick] = { mode, spot: was && was.mode === mode ? was.spot : null, day, since: was ? was.since : now };
  return null;
}

function sit(S, nick, spot, day) {
  prune(S, day);
  const me = S[nick];
  if (!me) return 'Előbb válaszd ki, hogy home office-ból vagy helyben vagy.';
  if (!(Number.isInteger(spot) && spot >= 0 && spot < A.MAX)) return 'Ismeretlen hely.';
  if (!A.allowed(me.mode, spot)) return me.mode === 'ho' ? 'Home office-ból a tó mellett ülhetsz: horgász vagy kenu.' : 'Ez a hely a home office-osoké.';
  const other = Object.keys(S).find((n) => n !== nick && S[n].spot === spot);
  if (other) return `Ezen a helyen már ${other} ül.`;
  me.spot = spot;
  return null;
}

function stand(S, nick, day) {
  prune(S, day);
  if (!S[nick] || S[nick].spot === null) return 'Most nem ülsz sehol.';
  S[nick].spot = null;
  return null;
}

// kilépés: aki végzett, eltűnik a tisztásról és a „Ki van bent?” listából (ha aznap visszajön, új belépés)
function leave(S, nick, day) {
  prune(S, day);
  if (!S[nick]) return 'Most nem vagy bejelentkezve.';
  delete S[nick];
  return null;
}

// a nyilvános nézet: csak a mai bejelentkezések
function view(S, day) {
  prune(S, day);
  return Object.fromEntries(Object.entries(S).map(([n, v]) => [n, { mode: v.mode, spot: v.spot, since: v.since || 0 }]));
}

module.exports = { empty, where, sit, stand, leave, view };
