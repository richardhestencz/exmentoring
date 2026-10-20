const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const g = require('./game');

test('kifizetések', () => {
  assert.strictEqual(g.payout('in:17', 17, 100), 3600);
  assert.strictEqual(g.payout('in:17', 18, 100), 0);
  assert.strictEqual(g.payout('n:17', 17, 100), 3600, 'régi mentés formátuma');
  assert.strictEqual(g.payout('in:16-17', 17, 100), 1800);
  assert.strictEqual(g.payout('in:16-17-18', 16, 500), 6000);
  assert.strictEqual(g.payout('in:14-15-17-18', 18, 100), 900);
  assert.strictEqual(g.payout('in:0-1-2-3', 0, 100), 900);
  assert.strictEqual(g.payout('in:1-2-3-4-5-6', 6, 1000), 6000);
  assert.strictEqual(g.payout('red', 1, 1000), 2000);
  assert.strictEqual(g.payout('black', 2, 500), 1000);
  assert.strictEqual(g.payout('dozen:2', 13, 500), 1500);
  assert.strictEqual(g.payout('col:3', 3, 500), 1500);
});
test('0-nál a külső tétek vesztenek', () => {
  for (const k of [...g.OUTSIDE, ...g.LINES]) assert.strictEqual(g.payout(k, 0, 100), 0, k);
  assert.strictEqual(g.payout('in:0', 0, 100), 3600);
});
test('csak valódi asztali kombinációk érvényesek', () => {
  assert.strictEqual(g.INSIDE.size, 37 + 60 + 12 + 2 + 22 + 1 + 11);
  for (const k of ['in:37', 'in:1-3', 'in:3-4', 'in:1-5', 'in:2-3-4', 'in:3-4-6-7', 'in:0-4', 'in:17-17', 'foo', 'n:37'])
    assert.strictEqual(g.info(k), null, k);
});
test('ajtó-tét mindig 1000', () => {
  for (let i = 0; i < 300; i++) {
    const bets = g.doorBet();
    assert.strictEqual(bets.reduce((s, b) => s + b.stake, 0), 1000);
    for (const b of bets) assert.ok(g.info(b.kind) && g.CHIPS.includes(b.stake), b.kind);
  }
});
test('visszatérülés ~ 97,3% minden tétfajtánál', () => {
  for (const k of [...g.INSIDE, ...g.OUTSIDE, ...g.LINES]) {
    let back = 0;
    for (let n = 0; n <= 36; n++) back += g.payout(k, n, 100);
    assert.ok(Math.abs(back / (37 * 100) - 36 / 37) < 1e-9, k);
  }
});
test('a tétasztal minden kattintási pontja érvényes tétet ad', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const src = html.slice(html.indexOf('const inKind='), html.indexOf('function numPick'));
  const kindAt = new Function(src + 'return kindAt;')();
  const seen = new Set();
  for (let n = 0; n <= 36; n++)
    for (let fx = 0.01; fx < 1; fx += 0.07)
      for (let fy = 0.01; fy < 1; fy += 0.07) {
        const k = kindAt(n, fx, fy);
        assert.ok(g.INSIDE.has(k), `${n} @ ${fx.toFixed(2)},${fy.toFixed(2)} -> ${k}`);
        seen.add(k);
      }
  assert.strictEqual(seen.size, g.INSIDE.size, 'minden belső tét elérhető kattintással');
});

test('fizikai szimuláció: megáll, érvényes szám, a pálya véges', () => {
  const { simulate, DEFAULT_REST } = require('./physics');
  let rest = DEFAULT_REST;
  for (let i = 0; i < 40; i++) {
    const s = simulate(rest);
    rest = s.rest;
    assert.ok(s.settled, 'a golyó megállt');
    assert.ok(s.result >= 0 && s.result <= 36);
    assert.ok(s.track.every(Number.isFinite));
    assert.ok(s.track.length / 3 >= 600 && s.durationMs <= 30000);
  }
});
test('fizikai szimuláció: az eredmények nagyjából egyenletesek', () => {
  const { simulate, DEFAULT_REST } = require('./physics');
  const N = 740, hist = Array(37).fill(0);
  let rest = DEFAULT_REST;
  for (let i = 0; i < N; i++) { const s = simulate(rest); rest = s.rest; hist[s.result]++; }
  const exp = N / 37, chi = hist.reduce((a, c) => a + (c - exp) ** 2 / exp, 0);
  assert.ok(chi < 70, `khí-négyzet ${chi.toFixed(1)}`);
});
