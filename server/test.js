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
test('a tétasztal: mező = szám, rés = 2 szám, kereszteződés = sarok, minden pont érvényes', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const src = html.slice(html.indexOf('const inKind='), html.indexOf('function geom'));
  const zoneKind = new Function(src + 'return zoneKind;')();
  // egy 50×36 képpontos mezőkből, 3 képpontos résekkel felépített asztal (a 0 mező 0..55 között)
  const W = 50, H = 36, GAP = 3, X0 = 58, Y0 = 0;
  const left = (c) => X0 + c * (W + GAP), top = (r) => Y0 + r * (H + GAP);
  const G = { bx: [], by: [0], top: Y0, right: left(11) + W, tol: 6 };
  G.bx.push(X0 - GAP / 2); for (let c = 1; c < 12; c++) G.bx.push(left(c) - GAP / 2);
  for (let r = 1; r <= 3; r++) G.by.push(top(r) - GAP / 2);
  const at = (x, y) => zoneKind(x, y, G);
  assert.strictEqual(at(left(5) + 25, top(1) + 18), 'in:17', 'mező közepe');
  assert.strictEqual(at(left(5) + 40, top(1) + 18), 'in:17', 'mező széle is még a szám');
  assert.strictEqual(at(G.bx[6], top(1) + 18), 'in:17-20', 'rés két oszlop között');
  assert.strictEqual(at(left(5) + 25, G.by[1]), 'in:17-18', 'rés két sor között');
  assert.strictEqual(at(G.bx[6], G.by[1]), 'in:17-18-20-21', 'négy mező találkozása');
  assert.strictEqual(at(left(0) + 25, G.by[3]), 'in:1-2-3', 'alsó vonal: sor');
  assert.strictEqual(at(G.bx[1], G.by[3]), 'in:1-2-3-4-5-6', 'alsó kereszteződés: hatos sor');
  assert.strictEqual(at(G.bx[0], top(2) + 18), 'in:0-1', 'rés a 0 mellett');
  assert.strictEqual(at(G.bx[0], G.by[2]), 'in:0-1-2', 'trió');
  assert.strictEqual(at(G.bx[0], G.by[3]), 'in:0-1-2-3', 'első négy');
  assert.strictEqual(at(20, 50), 'in:0', 'a 0 mező');
  const seen = new Set();
  for (let x = 0; x <= G.right + 10; x += 1)
    for (let y = 0; y <= G.by[3] + 10; y += 1) {
      const k = at(x, y);
      if (k === null) continue;
      assert.ok(g.INSIDE.has(k), `${x},${y} -> ${k}`);
      seen.add(k);
    }
  assert.strictEqual(seen.size, g.INSIDE.size, 'minden belső tét elérhető kattintással');
});
test('gyros: rögzítés, foglalt cella, visszavonás csak a sajáttal, bővülés', () => {
  const gy = require('./gyros');
  const G = gy.fromSeed({ contributors: [{ name: 'Teszt Anna', alias: '🐬' }, { name: 'Teszt Béla', alias: '🎾' }], receipts: { '008': null, '016': '🎾' }, maxNumber: 209 });
  assert.deepStrictEqual(gy.counts(G), { by: { '🎾': 1 }, none: 1, total: 2, of: 209 });
  assert.strictEqual(gy.claim(G, '091', '🐬', 1), null);
  assert.deepStrictEqual(G.receipts['091'], { alias: '🐬', at: 1 });
  assert.match(gy.claim(G, '091', '🎾'), /már megvan/, 'foglalt cellát nem lehet felülírni');
  assert.match(gy.claim(G, '092', '🦄'), /aliasodat/, 'csak létező alias rögzíthet');
  assert.match(gy.claim(G, '000', '🐬'), /között/, 'a 000 nem létezik');
  assert.match(gy.claim(G, 220, '🐬'), /között/, 'max+10 fölött nem');
  assert.match(gy.unclaim(G, '091', '🎾'), /saját/, 'más nyugtáját nem lehet visszavonni');
  assert.match(gy.unclaim(G, '008', '🐬'), /saját/, 'alias nélküli pipát sem');
  assert.strictEqual(gy.unclaim(G, '091', '🐬'), null);
  assert.strictEqual(G.receipts['091'], undefined);
  assert.strictEqual(gy.claim(G, 213, '🐬'), null, '209 fölött is rögzíthető');
  assert.strictEqual(G.maxNumber, 219, 'a rács egy sorral bővül');
  assert.strictEqual(gy.counts(G).of, 219);
});
test('gyros: új hozzájáruló, egyedi és legfeljebb 2 karakteres alias', () => {
  const gy = require('./gyros');
  const G = gy.empty();
  assert.strictEqual(gy.addContributor(G, '  Teszt   Elek ', '🌮'), null);
  assert.deepStrictEqual(G.contributors[0], { name: 'Teszt Elek', alias: '🌮' });
  assert.match(gy.addContributor(G, 'Más Valaki', '🌮'), /foglalt/);
  assert.match(gy.addContributor(G, 'Más Valaki', 'ABC'), /2 karakter/);
  assert.strictEqual(gy.addContributor(G, 'Zászlós Zoli', '🇭🇺'), null, 'egy zászló egy karakternek számít');
  assert.strictEqual(gy.addContributor(G, 'Két Jel', 'KJ'), null);
  assert.match(gy.addContributor(G, 'X', '🍕'), /legalább 2/);
  assert.match(gy.addContributor(G, 'Üres Alias', '  '), /aliast/);
});
test('gyros: a teljes nevek nincsenek a repóban', () => {
  const { execSync } = require('child_process');
  const tracked = execSync('git ls-files', { cwd: path.join(__dirname, '..') }).toString();
  assert.ok(!/gyros-seed/.test(tracked), 'a seed fájl nincs verziókezelve');
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
