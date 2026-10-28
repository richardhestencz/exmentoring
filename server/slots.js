// Félkarú rabló: tiszta logika, a szerver hívja (a pot kezelése a szerveré).
// 3 tárcsa, egy nyerővonal (a középső sor). Minden tárcsán ugyanaz a súlyozott jelkészlet.
// Nyeremény (a tét szorzója, a tétet is beleértve): három egyforma a táblázat szerint, két 🦝 bárhol 5x, két 🍒 bárhol 2x.
// Elméleti visszafizetés ~94% (a teszt ellenőrzi), a pörgetés azonnal elszámolódik.
const crypto = require('crypto');

const SYMBOLS = [
  { s: '🍒', w: 8, three: 6 },
  { s: '🍋', w: 7, three: 10 },
  { s: '🍇', w: 6, three: 15 },
  { s: '🔔', w: 4, three: 30 },
  { s: '⭐', w: 3, three: 60 },
  { s: '🦝', w: 2, three: 250 },
];
const PAIRS = { '🦝': 5, '🍒': 2 };   // két egyforma bárhol a vonalon
const BETS = [100, 500, 1000, 5000];
const REELS = 3, COOLDOWN_MS = 1500;
const TOTAL_W = SYMBOLS.reduce((a, x) => a + x.w, 0);
const rnd = () => crypto.randomBytes(4).readUInt32LE(0) / 4294967296;

function pick(rng) {
  let r = rng() * TOTAL_W;
  for (const x of SYMBOLS) { if ((r -= x.w) < 0) return x.s; }
  return SYMBOLS[SYMBOLS.length - 1].s;
}
// a vonal szorzója és a nyerés fajtája ('three' | 'pair' | '')
function evaluate(line) {
  if (line.every((c) => c === line[0])) return { mult: SYMBOLS.find((x) => x.s === line[0]).three, kind: 'three' };
  for (const [s, m] of Object.entries(PAIRS)) if (line.filter((c) => c === s).length === 2) return { mult: m, kind: 'pair' };
  return { mult: 0, kind: '' };
}
// pörgetés: a tárcsák (a vonal mellett a fölötte és alatta látszó jel is, a UI-nak), a szorzó és a visszajáró összeg
function spin(stake, rng = rnd) {
  const reels = Array.from({ length: REELS }, () => [pick(rng), pick(rng), pick(rng)]);
  const line = reels.map((r) => r[1]);
  const { mult, kind } = evaluate(line);
  return { reels, line, mult, kind, back: stake * mult };
}
// az elméleti visszafizetési arány (az összes kombináció a súlyokkal)
function rtp() {
  let sum = 0;
  const go = (line, p) => {
    if (line.length === REELS) { sum += p * evaluate(line).mult; return; }
    for (const x of SYMBOLS) go([...line, x.s], p * x.w / TOTAL_W);
  };
  go([], 1);
  return sum;
}
// a nyilvános leírás (kifizetési tábla a UI-nak)
function view() {
  return { bets: BETS, symbols: SYMBOLS.map((x) => ({ s: x.s, three: x.three })), pairs: PAIRS, cooldown: COOLDOWN_MS };
}

module.exports = { SYMBOLS, PAIRS, BETS, REELS, COOLDOWN_MS, evaluate, spin, rtp, view };
