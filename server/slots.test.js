const test = require('node:test');
const assert = require('node:assert');
const S = require('./slots');

test('félkarú rabló: kifizetési tábla', () => {
  assert.deepStrictEqual(S.evaluate(['🦝', '🦝', '🦝']), { mult: 250, kind: 'three' });
  assert.deepStrictEqual(S.evaluate(['🍒', '🍒', '🍒']), { mult: 6, kind: 'three' });
  assert.deepStrictEqual(S.evaluate(['🦝', '🍋', '🦝']), { mult: 5, kind: 'pair' });
  assert.deepStrictEqual(S.evaluate(['🍋', '🍒', '🍒']), { mult: 2, kind: 'pair' });
  assert.deepStrictEqual(S.evaluate(['🍋', '🍋', '🍇']), { mult: 0, kind: '' });
  assert.deepStrictEqual(S.evaluate(['🍒', '🍋', '🍇']), { mult: 0, kind: '' });
});

test('félkarú rabló: pörgetés és visszafizetési arány', () => {
  const r = S.spin(1000, () => 0.99);   // mindig az utolsó jel: három 🦝
  assert.deepStrictEqual(r.line, ['🦝', '🦝', '🦝']);
  assert.strictEqual(r.reels.length, 3);
  assert.strictEqual(r.back, 250000);
  assert.strictEqual(S.spin(100, () => 0).back, 600);   // három 🍒
  const p = S.rtp();
  assert.ok(p > 0.9 && p < 0.98, `RTP: ${p}`);
});
