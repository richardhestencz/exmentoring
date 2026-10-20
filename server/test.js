const test = require('node:test');
const assert = require('node:assert');
const g = require('./game');

test('kifizetések', () => {
  assert.strictEqual(g.payout('n:17', 17), 3600);
  assert.strictEqual(g.payout('n:17', 18), 0);
  assert.strictEqual(g.payout('red', 1), 2000);
  assert.strictEqual(g.payout('black', 2), 2000);
  assert.strictEqual(g.payout('dozen:2', 13), 1500);
  assert.strictEqual(g.payout('col:1', 34), 1500);
  assert.strictEqual(g.payout('col:3', 3), 1500);
});
test('0-nál a külső tétek vesztenek', () => {
  for (const k of [...g.OUTSIDE, ...g.LINES]) assert.strictEqual(g.payout(k, 0), 0, k);
  assert.strictEqual(g.payout('n:0', 0), 3600);
});
test('ismeretlen tét', () => {
  assert.strictEqual(g.info('n:37'), null);
  assert.strictEqual(g.info('foo'), null);
});
test('ajtó-tét mindig 1000', () => {
  for (let i = 0; i < 300; i++) {
    const total = g.doorBet().reduce((s, k) => s + g.info(k).stake, 0);
    assert.strictEqual(total, 1000);
  }
});
test('visszatérülés ~ 97,3%', () => {
  const kinds = ['red', 'dozen:1', 'col:2', 'n:7', 'odd', 'high'];
  for (const k of kinds) {
    let back = 0, stake = g.info(k).stake;
    for (let n = 0; n <= 36; n++) back += g.payout(k, n);
    assert.ok(Math.abs(back / (37 * stake) - 36 / 37) < 1e-9, k);
  }
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
