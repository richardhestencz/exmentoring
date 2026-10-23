// Blackjack-motor: tiszta logika, a szerver hívja (a pot kezelése a szerveré).
// Szabályok: 6 pakli, az osztó minden 17-nél megáll (soft 17 is), a blackjack 3:2-t fizet, duplázni az első két lapra lehet,
// az osztó blackjackjét azonnal megnézzük (peek). Splitet és biztosítást nem kínálunk.
const crypto = require('crypto');

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const MAX_SEATS = 6, MAX_BET = 10000, DECKS = 6, RESHUFFLE_AT = 60;
const rnd = () => crypto.randomBytes(4).readUInt32LE(0) / 4294967296;

function newShoe(rng = rnd, decks = DECKS) {
  const s = [];
  for (let d = 0; d < decks; d++) for (const su of SUITS) for (const r of RANKS) s.push(r + su);
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
  return s;
}
const rank = (c) => c.slice(0, -1);
function value(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { const r = rank(c); if (r === 'A') { aces++; total += 11; } else total += ['J', 'Q', 'K'].includes(r) ? 10 : +r; }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
const isBJ = (cards) => cards.length === 2 && value(cards).total === 21;

function empty() { return { phase: 'betting', shoe: [], seats: [], dealer: [], turn: -1, round: 0 }; }
function draw(G, rng) { if (G.shoe.length < RESHUFFLE_AT) G.shoe = newShoe(rng); return G.shoe.pop(); }

// tét: a fogadási szakaszban; visszatér a hibával vagy null-lal
// seat: a választott hely (0..5) az asztalnál; ha nincs megadva, az első szabad hely
function bet(G, nick, amount, seat) {
  if (G.phase !== 'betting') return 'Most nem lehet tétet tenni, várd meg a kör végét.';
  let s = G.seats.find((x) => x.nick === nick);
  if (!s) {
    if (G.seats.length >= MAX_SEATS) return 'Az asztal megtelt (6 hely).';
    const taken = new Set(G.seats.map((x) => x.seat));
    if (seat !== undefined && seat !== null) {
      if (!(Number.isInteger(seat) && seat >= 0 && seat < MAX_SEATS)) return 'Ismeretlen hely az asztalnál.';
      if (taken.has(seat)) return 'Ezen a helyen már ül valaki.';
    } else { seat = 0; while (taken.has(seat)) seat++; }
    s = { nick, seat, stake: 0, cards: [], done: false, doubled: false, result: '', back: 0 };
    // a játék sorrendje a helyek sorrendje (balról jobbra)
    G.seats.push(s); G.seats.sort((a, b) => a.seat - b.seat);
  }
  if (s.stake + amount > MAX_BET) return `Egy kézre legfeljebb ${MAX_BET.toLocaleString('hu-HU')} lehet.`;
  s.stake += amount;
  return null;
}
// a tét visszavonása: visszaadja a visszajáró összeget
function unbet(G, nick) {
  if (G.phase !== 'betting') return 0;
  const i = G.seats.findIndex((x) => x.nick === nick);
  if (i < 0) return 0;
  const back = G.seats[i].stake; G.seats.splice(i, 1); return back;
}

function deal(G, rng = rnd) {
  if (G.phase !== 'betting') return 'A kör már megy.';
  if (!G.seats.length) return 'Előbb tegyen fel valaki tétet.';
  G.round++; G.dealer = []; G.phase = 'play';
  for (const s of G.seats) { s.cards = []; s.done = false; s.doubled = false; s.result = ''; s.back = 0; }
  for (let k = 0; k < 2; k++) { for (const s of G.seats) s.cards.push(draw(G, rng)); G.dealer.push(draw(G, rng)); }
  for (const s of G.seats) if (isBJ(s.cards)) s.done = true;
  if (isBJ(G.dealer)) { for (const s of G.seats) s.done = true; return finish(G, rng); }   // az osztónak blackjackje van
  G.turn = -1;
  return next(G, rng);
}
// a következő játékos, aki még dönt; ha nincs több, az osztó jön
function next(G, rng) {
  const i = G.seats.findIndex((s) => !s.done);
  if (i < 0) return finish(G, rng);
  G.turn = i; return null;
}
function current(G, nick) {
  if (G.phase !== 'play' || G.turn < 0) return [null, 'Most nem te jössz.'];
  const s = G.seats[G.turn];
  if (!s || s.nick !== nick) return [null, `Most ${s ? s.nick : 'senki'} jön.`];
  return [s, null];
}
function hit(G, nick, rng = rnd) {
  const [s, e] = current(G, nick); if (e) return e;
  s.cards.push(draw(G, rng));
  if (value(s.cards).total >= 21) { s.done = true; return next(G, rng); }
  return null;
}
function stand(G, nick, rng = rnd) {
  const [s, e] = current(G, nick); if (e) return e;
  s.done = true; return next(G, rng);
}
// duplázás: a tétet a szerver veszi el a potból (a többlet = a jelenlegi tét)
function canDouble(G, nick) { const [s, e] = current(G, nick); if (e) return e; if (s.cards.length !== 2) return 'Duplázni csak az első két lapra lehet.'; return null; }
function double(G, nick, rng = rnd) {
  const e = canDouble(G, nick); if (e) return e;
  const s = G.seats[G.turn];
  s.stake *= 2; s.doubled = true; s.cards.push(draw(G, rng)); s.done = true;
  return next(G, rng);
}
// az osztó húz 17-ig, majd elszámolás: s.back = a visszajáró összeg (tét + nyeremény)
function finish(G, rng = rnd) {
  G.turn = -1;
  const live = G.seats.some((s) => value(s.cards).total <= 21 && !isBJ(s.cards));
  if (live && !isBJ(G.dealer)) while (value(G.dealer).total < 17) G.dealer.push(draw(G, rng));
  const d = value(G.dealer).total, dBJ = isBJ(G.dealer);
  for (const s of G.seats) {
    const p = value(s.cards).total, pBJ = isBJ(s.cards);
    if (pBJ && dBJ) { s.result = 'push'; s.back = s.stake; }
    else if (pBJ) { s.result = 'blackjack'; s.back = Math.round(s.stake * 2.5); }
    else if (dBJ) { s.result = 'lose'; s.back = 0; }
    else if (p > 21) { s.result = 'bust'; s.back = 0; }
    else if (d > 21 || p > d) { s.result = 'win'; s.back = s.stake * 2; }
    else if (p === d) { s.result = 'push'; s.back = s.stake; }
    else { s.result = 'lose'; s.back = 0; }
  }
  G.phase = 'result';
  return null;
}
// új kör: a helyek kiürülnek (mindenki újra tesz)
function reset(G) { G.phase = 'betting'; G.seats = []; G.dealer = []; G.turn = -1; }

// a nyilvános nézet: játék közben az osztó második lapja rejtett
function view(G) {
  const hide = G.phase === 'play';
  const dealer = hide ? [G.dealer[0], '??'].filter(Boolean) : G.dealer;
  return {
    phase: G.phase, round: G.round, turn: G.turn,
    dealer, dealerValue: hide ? (G.dealer[0] ? value([G.dealer[0]]).total : 0) : value(G.dealer).total,
    seats: G.seats.map((s) => ({ nick: s.nick, seat: s.seat, stake: s.stake, cards: s.cards, value: value(s.cards).total, done: s.done, doubled: s.doubled, result: s.result, back: s.back, bj: isBJ(s.cards) })),
    shoe: G.shoe.length,
  };
}

module.exports = { SUITS, RANKS, MAX_SEATS, MAX_BET, newShoe, value, isBJ, empty, bet, unbet, deal, hit, stand, canDouble, double, finish, reset, view };
