// Tiszta rulett-logika: tétfajták, kifizetés, ajtó-tét generálás.
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// Európai rulett kerék-sorrend (a kerék körül, óramutató járásával megegyezően)
const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const OUTSIDE = ['red', 'black', 'even', 'odd', 'low', 'high'];
const LINES = ['dozen:1', 'dozen:2', 'dozen:3', 'col:1', 'col:2', 'col:3'];

// kind -> {stake, mult} (mult = teljes visszatérítés a nyeréskor, tét nélkül nem külön)
function info(kind) {
  if (typeof kind !== 'string') return null;
  const m = /^n:(\d{1,2})$/.exec(kind);
  if (m) return +m[1] <= 36 ? { stake: 100, mult: 36 } : null;
  if (LINES.includes(kind)) return { stake: 500, mult: 3 };
  if (OUTSIDE.includes(kind)) return { stake: 1000, mult: 2 };
  return null;
}

function wins(kind, n) {
  if (kind.startsWith('n:')) return n === +kind.slice(2);
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
function payout(kind, n) {
  const i = info(kind);
  return i && wins(kind, n) ? i.stake * i.mult : 0;
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
  if (mode === 0) return pick(OUTSIDE, 1, rnd);
  if (mode === 1) return pick(LINES, 2, rnd);
  return pick(Array.from({ length: 37 }, (_, i) => `n:${i}`), 10, rnd);
}

module.exports = { ORDER, RED, OUTSIDE, LINES, info, wins, payout, doorBet };
