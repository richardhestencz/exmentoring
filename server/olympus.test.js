const test = require('node:test');
const assert = require('node:assert');
const O = require('./olympus');

// kis, magvas PRNG a determinisztikus teszthez
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const isOrb = (s) => /^x\d+$/.test(s);
// rács: 30 cella, a megadott jelekkel elöl, a többi töltő (mindegyik oszlop más jel, hogy ne nyerjen)
const FILL = ['hourglass', 'ring', 'chalice', 'red', 'purple', 'yellow', 'green'];
function mk(list) {
  const flat = list.slice();
  for (let i = 0; flat.length < 30; i++) flat.push(FILL[i % FILL.length]);
  return Array.from({ length: 6 }, (_, c) => flat.slice(c * 5, c * 5 + 5));
}

test('olümposz: evaluate kézi rácsokon', () => {
  const w8 = O.evaluate(mk(Array(8).fill('crown')));
  assert.strictEqual(w8.length, 1);
  assert.strictEqual(w8[0].pay, 10);
  assert.strictEqual(w8[0].n, 8);
  assert.strictEqual(w8[0].cells.length, 8);
  assert.strictEqual(O.evaluate(mk(Array(12).fill('blue')))[0].pay, 2);
  assert.strictEqual(O.evaluate(mk(Array(10).fill('crown')))[0].pay, 25);
  assert.deepStrictEqual(O.evaluate(mk(Array(7).fill('crown'))), []);
  // több jel egyszerre: 8 korona + 9 kék
  const two = O.evaluate(mk([...Array(8).fill('crown'), ...Array(9).fill('blue')]));
  assert.deepStrictEqual(two.map((w) => [w.s, w.pay]), [['crown', 10], ['blue', 0.25]]);
  // gömb és scatter nem számít jelnek
  assert.deepStrictEqual(O.evaluate(mk([...Array(7).fill('crown'), 'zeus', 'x5'])), []);
});

test('olümposz: view és konstansok', () => {
  const v = O.view();
  assert.deepStrictEqual(v.bets, [20, 50, 100, 200, 500]);
  assert.strictEqual(v.buy, 100);
  assert.strictEqual(v.max, 5000);
  assert.strictEqual(v.cooldown, 1000);
  assert.deepStrictEqual(v.scatter, { 4: 3, 5: 5, 6: 100 });
  assert.strictEqual(v.pays.crown[2], 50);
});

// újrajátszás: a nyerő cellák kiesnek, a maradék leesik, a fill kerül felülre
function checkSpin(sp) {
  let g = sp.grid.map((c) => c.slice());
  assert.strictEqual(g.length, 6);
  g.forEach((c) => assert.strictEqual(c.length, 5));
  for (const cas of sp.cascades) {
    const gone = new Set();
    cas.wins.forEach((w) => w.cells.forEach(([c, r]) => { assert.ok(!isOrb(g[c][r]) && g[c][r] !== 'zeus'); gone.add(c * 5 + r); }));
    g = g.map((col, c) => {
      const keep = col.filter((_, r) => !gone.has(c * 5 + r));
      assert.strictEqual(cas.fill[c].length, 5 - keep.length);
      return cas.fill[c].concat(keep);
    });
    assert.deepStrictEqual(g, cas.grid);
  }
  assert.deepStrictEqual(O.evaluate(g), []);   // a végén már nincs nyerés
  const orbs = [];
  g.forEach((col, c) => col.forEach((s, r) => { if (isOrb(s)) orbs.push({ c, r, v: +s.slice(1) }); }));
  assert.deepStrictEqual(sp.orbs, orbs);
  assert.strictEqual(sp.scatters, g.flat().filter((s) => s === 'zeus').length);
  assert.strictEqual(sp.orbSum, orbs.reduce((a, o) => a + o.v, 0));
  assert.ok(Math.abs(sp.total - (sp.win * sp.applied + sp.scatterPay)) < 1e-6);
}

test('olümposz: leomlás és összegek egyeznek', () => {
  const rng = mulberry32(42);
  let withCascade = 0, withOrbs = 0;
  for (let i = 0; i < 400; i++) {
    const p = O.play(100, { rng });
    checkSpin(p.base);
    if (p.base.cascades.length) withCascade++;
    if (p.base.orbs.length) withOrbs++;
    let sum = p.base.total;
    if (p.free) { p.free.spins.forEach(checkSpin); sum += p.free.spins.reduce((a, s) => a + s.total, 0); }
    if (!p.capped) assert.strictEqual(p.back, Math.round(sum));
    assert.strictEqual(p.cost, 100);
    assert.strictEqual(p.mult, Math.round((p.back / 100) * 100) / 100);
  }
  assert.ok(withCascade > 20 && withOrbs > 20, `${withCascade} ${withOrbs}`);
});

test('olümposz: vétel garantál ingyenes pörgetést, a költség 100x', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 60; i++) {
    const p = O.play(50, { buy: true, rng });
    assert.strictEqual(p.buy, true);
    assert.strictEqual(p.cost, 5000);
    assert.ok(p.base.scatters >= 4 && p.base.awarded === 15);
    assert.ok(p.free && p.free.awarded >= 15 && p.free.spins.length >= 1);
    assert.ok(p.back <= 5000 * 50);
    // az ingyenes pörgetésekben a gyűjtött szorzó nem csökken
    let prev = 0;
    p.free.spins.forEach((s) => { assert.ok(s.accum >= prev); prev = s.accum; });
    assert.strictEqual(p.free.totalMult, prev);
  }
});

test('olümposz: a nyereményplafon', () => {
  // csupa korona + gömb + scatter nélkül: a plafont a rng-vel nem érjük el, ezért a tétet nézzük extrém rng-vel
  const hi = O.play(20, { rng: () => 0 });   // mindig a legelső jel (korona), minden töltés is korona -> végtelen leomlás helyett a guard megáll
  assert.ok(hi.back <= 5000 * 20);
  let capped = 0;
  const rng = mulberry32(99);
  for (let i = 0; i < 300; i++) { const p = O.play(20, { buy: true, rng }); assert.ok(p.back <= 100000); if (p.capped) { capped++; assert.strictEqual(p.back, 100000); } }
});

test('olümposz: 30k játék visszafizetési arány (laza határok)', () => {
  const rng = mulberry32(2026);
  let back = 0, hit = 0;
  const N = 30000;
  for (let i = 0; i < N; i++) { const p = O.play(100, { rng }); back += p.back; if (p.back > 0) hit++; }
  const rtp = back / (N * 100);
  assert.ok(rtp > 0.75 && rtp < 1.2, `RTP: ${rtp}`);
  assert.ok(hit / N > 0.12 && hit / N < 0.4, `találati arány: ${hit / N}`);
});
