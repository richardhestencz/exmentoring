// Tiszta rulett-logika: tétfajták, kifizetés, ajtó-tét generálás.
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// Európai rulett kerék-sorrend (a kerék körül, óramutató járásával megegyezően)
const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const OUTSIDE = ['red', 'black', 'even', 'odd', 'low', 'high'];
const LINES = ['dozen:1', 'dozen:2', 'dozen:3', 'col:1', 'col:2', 'col:3'];
const CHIPS = [100, 500, 1000, 5000];

// Belső tétek: 'in:' + a lefedett számok növekvő sorrendben, kötőjellel (pl. in:17, in:1-2-4-5).
// Csak a valódi rulettasztalon megtehető kombinációk érvényesek.
const INSIDE = new Set();
const addIn = (...ns) => INSIDE.add('in:' + ns.sort((a, b) => a - b).join('-'));
for (let n = 0; n <= 36; n++) addIn(n);                                   // szám
for (let n = 1; n <= 33; n++) addIn(n, n + 3);                            // vízszintes split
for (let n = 1; n <= 36; n++) if (n % 3) addIn(n, n + 1);                 // függőleges split
addIn(0, 1); addIn(0, 2); addIn(0, 3);                                    // split a 0-val
for (let n = 1; n <= 34; n += 3) addIn(n, n + 1, n + 2);                  // sor (street)
addIn(0, 1, 2); addIn(0, 2, 3);                                           // trió
for (let n = 1; n <= 32; n++) if (n % 3) addIn(n, n + 1, n + 3, n + 4);   // sarok (corner)
addIn(0, 1, 2, 3);                                                        // első négy
for (let n = 1; n <= 31; n += 3) addIn(n, n + 1, n + 2, n + 3, n + 4, n + 5); // hatos sor

// régi mentésekből jöhet 'n:17' is: ezt 'in:17'-ként kezeljük
const norm = (kind) => (typeof kind === 'string' && /^n:\d{1,2}$/.test(kind) ? 'in:' + kind.slice(2) : kind);
const nums = (kind) => kind.slice(3).split('-').map(Number);

// kind -> {mult} (mult = teljes visszatérítés a tét szorzójaként nyeréskor)
function info(kind) {
  kind = norm(kind);
  if (typeof kind !== 'string') return null;
  if (INSIDE.has(kind)) return { mult: 36 / nums(kind).length };
  if (LINES.includes(kind)) return { mult: 3 };
  if (OUTSIDE.includes(kind)) return { mult: 2 };
  return null;
}

function wins(kind, n) {
  kind = norm(kind);
  if (kind.startsWith('in:')) return nums(kind).includes(n);
  if (n === 0) return false;
  const [k, v] = kind.split(':');
  switch (k) {
    case 'dozen': return Math.ceil(n / 12) === +v;
    case 'col': return ((n - 1) % 3) + 1 === +v;
    case 'red': return RED.has(n);
    case 'black': return !RED.has(n);
    case 'even': return n % 2 === 0;
    case 'odd': return n % 2 === 1;
    case 'low': return n <= 18;
    case 'high': return n >= 19;
  }
  return false;
}

// Összes visszatérítés egy tétre a megadott nyerőszámnál
function payout(kind, n, stake) {
  const i = info(kind);
  return i && wins(kind, n) ? Math.round(stake * i.mult) : 0;
}

function pick(arr, count, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

// Az ajtó 1000 🦝-t tesz fel, véletlen módon: szín/paritás/magas-alacsony, sor/oszlop vagy számok
function doorBet(rnd = Math.random) {
  const mode = Math.floor(rnd() * 3);
  if (mode === 0) return pick(OUTSIDE, 1, rnd).map((kind) => ({ kind, stake: 1000 }));
  if (mode === 1) return pick(LINES, 2, rnd).map((kind) => ({ kind, stake: 500 }));
  return pick(Array.from({ length: 37 }, (_, i) => `in:${i}`), 10, rnd).map((kind) => ({ kind, stake: 100 }));
}

module.exports = { ORDER, RED, OUTSIDE, LINES, INSIDE, CHIPS, norm, info, wins, payout, doorBet };
