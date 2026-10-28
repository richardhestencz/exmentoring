// Olümposz-nyerőgép: tiszta logika, a szerver hívja (a pot kezelése a szerveré).
// 6x5 rács, nyerés bárhol (8+ egyforma), pörgő-leomló nyeremények (tumble), szorzó-gömbök, ingyenes pörgetések, vétel.
// cols[c][r]: c 0..5 balról jobbra, r 0..4 fentről lefelé. A kifizetések a tét szorzói.
const crypto = require('crypto');

const SYMBOLS = ['crown', 'hourglass', 'ring', 'chalice', 'red', 'purple', 'yellow', 'green', 'blue'];
const SCATTER = 'zeus';
// kifizetés (a tét szorzója) 8-9 / 10-11 / 12+ egyformára
const PAYS = {
  crown: [10, 25, 50], hourglass: [2.5, 10, 25], ring: [2, 5, 15], chalice: [1.5, 2, 12], red: [1, 1.5, 10],
  purple: [0.8, 1.2, 8], yellow: [0.5, 1, 5], green: [0.4, 0.9, 4], blue: [0.25, 0.75, 2],
};
const SCATTER_PAYS = { 4: 3, 5: 5, 6: 100 };   // 6+ is 100x
const BETS = [20, 50, 100, 200, 500];
const BUY_MULT = 100, MAX_WIN = 5000, COOLDOWN_MS = 1000;
const COLS = 6, ROWS = 5, FREE_AWARD = 15, RETRIGGER = 5;
const ORB_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500];

// hangolt súlyok (a Monte Carlo szkript állítja be, lásd a jelentést)
const CFG = {
  w: [1, 1.4, 1.8, 2.2, 2.6, 3, 3.4, 3.8, 4.2],            // jelsúlyok a SYMBOLS sorrendjében
  scBase: 0.0185, scFree: 0.02,                // scatter esély cellánként (alap / ingyenes)
  orbBase: 0.0064, orbFree: 0.03,               // gömb esély cellánként
  orbW: [30, 22, 16, 12, 9, 7, 5, 4, 3, 2, 1.5, 1, 0.3, 0.1, 0.03],   // gömbértékek súlya
  buy5: 0.15,                                  // vételnél 5 scatter esélye (különben 4)
};

const rnd = () => crypto.randomBytes(4).readUInt32LE(0) / 4294967296;
const orbId = (v) => 'x' + v;
const isOrb = (s) => s.charCodeAt(0) === 120 && s.length > 1;   // 'x..'
const sum = (a) => a.reduce((x, y) => x + y, 0);

function wpick(ws, vals, rng) {
  let r = rng() * sum(ws);
  for (let i = 0; i < ws.length; i++) { if ((r -= ws[i]) < 0) return vals[i]; }
  return vals[vals.length - 1];
}
// egy új cella: scatter, gömb vagy sima jel
function cell(rng, free) {
  const r = rng(), sc = free ? CFG.scFree : CFG.scBase, ob = free ? CFG.orbFree : CFG.orbBase;
  if (r < sc) return SCATTER;
  if (r < sc + ob) return orbId(wpick(CFG.orbW, ORB_VALUES, rng));
  return wpick(CFG.w, SYMBOLS, rng);
}
const tier = (n) => (n >= 12 ? 2 : n >= 10 ? 1 : 0);
// a rács sima nyerései (a tét szorzójában): [{ s, n, pay, cells }]
function evaluate(grid) {
  const by = {};
  grid.forEach((col, c) => col.forEach((s, r) => { if (PAYS[s]) (by[s] = by[s] || []).push([c, r]); }));
  const out = [];
  for (const s of SYMBOLS) if (by[s] && by[s].length >= 8) out.push({ s, n: by[s].length, pay: PAYS[s][tier(by[s].length)], cells: by[s] });
  return out;
}
const scatterPay = (n) => (n >= 6 ? SCATTER_PAYS[6] : SCATTER_PAYS[n] || 0);

// egy pörgetés: kezdő rács, leomlások, gömbök; accum: az ingyenes pörgetések gyűjtött szorzója (null = alapjáték)
function spin(stake, rng, { free = false, accum = 0, forceScatters = 0 } = {}) {
  let grid = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => cell(rng, free)));
  if (forceScatters) {
    const idx = Array.from({ length: COLS * ROWS }, (_, i) => i);
    for (let k = 0; k < forceScatters; k++) {
      const j = k + Math.floor(rng() * (idx.length - k));
      [idx[k], idx[j]] = [idx[j], idx[k]];
      grid[idx[k] % COLS][Math.floor(idx[k] / COLS)] = SCATTER;
    }
  }
  const start = grid.map((c) => c.slice());
  const cascades = [];
  let win = 0;
  for (let guard = 0; guard < 60; guard++) {
    const ws = evaluate(grid);
    if (!ws.length) break;
    const gone = new Set();
    ws.forEach((w) => w.cells.forEach(([c, r]) => gone.add(c * ROWS + r)));
    const fill = [];
    grid = grid.map((col, c) => {
      const keep = col.filter((_, r) => !gone.has(c * ROWS + r));
      const add = Array.from({ length: ROWS - keep.length }, () => cell(rng, free));
      fill.push(add);
      return add.concat(keep);
    });
    const wins = ws.map((w) => ({ s: w.s, n: w.n, pay: w.pay * stake, cells: w.cells }));
    win += sum(wins.map((w) => w.pay));
    cascades.push({ wins, fill, grid: grid.map((c) => c.slice()) });
  }
  const orbs = [];
  let scatters = 0;
  grid.forEach((col, c) => col.forEach((s, r) => {
    if (isOrb(s)) orbs.push({ c, r, v: +s.slice(1) });
    else if (s === SCATTER) scatters++;
  }));
  const orbSum = sum(orbs.map((o) => o.v));
  let applied = 1, acc = accum;
  if (free) {
    if (win > 0 && orbSum > 0) { acc += orbSum; applied = Math.max(1, acc); }
  } else if (win > 0 && orbSum > 0) applied = orbSum;
  const sp = scatterPay(scatters) * stake;
  const awarded = free ? (scatters >= 3 ? RETRIGGER : 0) : (scatters >= 4 ? FREE_AWARD : 0);
  const out = { grid: start, cascades, orbs, win, orbSum, applied, scatters, scatterPay: sp, total: win * applied + sp, awarded };
  if (free) out.accum = acc;
  return out;
}

// egy játék: alap pörgetés (vagy vétel), esetleg ingyenes pörgetések; a visszajáró a tét többszöröse, MAX_WIN-nel lefogva
function play(stake, { buy = false, rng = rnd } = {}) {
  const cap = MAX_WIN * stake;
  const base = spin(stake, rng, { forceScatters: buy ? (rng() < CFG.buy5 ? 5 : 4) : 0 });
  let total = base.total, capped = total >= cap, free = null;
  if (base.awarded) {
    free = { awarded: base.awarded, spins: [], totalMult: 0 };
    let left = base.awarded, accum = 0;
    while (left > 0 && !capped && free.spins.length < 500) {
      left--;
      const s = spin(stake, rng, { free: true, accum });
      accum = s.accum; left += s.awarded; free.awarded += s.awarded;
      free.spins.push(s);
      total += s.total;
      if (total >= cap) capped = true;
    }
    free.totalMult = accum;
  }
  const back = Math.round(Math.min(total, cap));
  return { stake, buy, cost: buy ? stake * BUY_MULT : stake, back, mult: Math.round((back / stake) * 100) / 100, capped, base, free };
}
// a nyilvános leírás (kifizetési tábla a UI-nak)
function view() {
  return { bets: BETS, buy: BUY_MULT, max: MAX_WIN, pays: PAYS, scatter: { 4: 3, 5: 5, 6: 100 }, cooldown: COOLDOWN_MS };
}

module.exports = { SYMBOLS, PAYS, BETS, BUY_MULT, MAX_WIN, COOLDOWN_MS, play, view, evaluate, CFG };
