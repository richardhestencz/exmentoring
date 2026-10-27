const test = require('node:test');
const assert = require('node:assert');
const music = require('./music');

test('link-értelmezés: playlist youtube.com, music.youtube.com és youtu.be linkből', () => {
  const L = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
  assert.deepStrictEqual(music.parse(`https://www.youtube.com/playlist?list=${L}`), { kind: 'playlist', id: L });
  assert.deepStrictEqual(music.parse(`https://music.youtube.com/playlist?list=OLAK5uy_kXyz1234567`), { kind: 'playlist', id: 'OLAK5uy_kXyz1234567' });
  assert.deepStrictEqual(music.parse(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${L}&index=3`), { kind: 'playlist', id: L });
  assert.deepStrictEqual(music.parse(`youtu.be/dQw4w9WgXcQ?list=${L}`), { kind: 'playlist', id: L });
  assert.deepStrictEqual(music.parse(L), { kind: 'playlist', id: L });
});

test('link-értelmezés: egy szám, és az érvénytelen bemenetek', () => {
  assert.deepStrictEqual(music.parse('https://youtu.be/dQw4w9WgXcQ?t=5'), { kind: 'video', id: 'dQw4w9WgXcQ' });
  assert.deepStrictEqual(music.parse('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), { kind: 'video', id: 'dQw4w9WgXcQ' });
  assert.deepStrictEqual(music.parse('https://www.youtube.com/shorts/dQw4w9WgXcQ'), { kind: 'video', id: 'dQw4w9WgXcQ' });
  for (const bad of ['', 'nem link', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/', 'https://www.youtube.com/watch?v=rovid', 'javascript:alert(1)', 'https://www.youtube.com/playlist?list=<x>']) {
    assert.strictEqual(music.parse(bad), null, bad);
  }
});

test('beállítás: a beállító neve, rev nő, érvénytelen link hibát ad', () => {
  const m = music.empty();
  assert.match(music.setSource(m, 'hülyeség', 'Ricsi', 1000), /nem YouTube/);
  assert.strictEqual(m.rev, 0);
  assert.strictEqual(music.setSource(m, 'https://www.youtube.com/playlist?list=PLabcdefghij12', 'Ricsi', 1000), null);
  assert.deepStrictEqual([m.kind, m.setBy, m.index, m.startedAt, m.rev], ['playlist', 'Ricsi', 0, 1000, 1]);
});

test('léptetés: többszöri jelentés is csak egyszer lépteti a számot (rev-dedupe)', () => {
  const m = music.empty();
  music.setSource(m, 'PLabcdefghij12', 'Ricsi', 1000);
  const rev = m.rev;
  assert.strictEqual(music.trackChanged(m, rev, 1, 5000), true);
  assert.strictEqual(music.trackChanged(m, rev, 1, 5010), false, 'a második kliens jelentése elavult');
  assert.strictEqual(music.trackChanged(m, rev, 2, 5020), false);
  assert.deepStrictEqual([m.index, m.startedAt], [1, 5000]);
  assert.strictEqual(music.trackChanged(m, m.rev, -1, 6000), false);
});

test('következő/előző körbeér, szünet és folytatás megtartja a pozíciót', () => {
  const m = music.empty();
  assert.match(music.skip(m, 1, 5, 0), /Még nincs/);
  music.setSource(m, 'PLabcdefghij12', 'Ricsi', 1000);
  music.skip(m, -1, 5, 2000);
  assert.strictEqual(m.index, 4, 'az elsőről visszalépve az utolsó');
  music.skip(m, 1, 5, 3000);
  assert.strictEqual(m.index, 0);
  music.setPaused(m, true, 13000);
  assert.strictEqual(m.pos, 10000);
  assert.strictEqual(music.position(m, 99999), 10000, 'szünetelve áll a pozíció');
  music.setPaused(m, false, 20000);
  assert.strictEqual(music.position(m, 25000), 15000);
});

test('csatlakozáskor a pozíció a szerver idejéből jön ki', () => {
  const m = music.empty();
  music.setSource(m, 'PLabcdefghij12', 'Ricsi', 100000);
  m.index = 3; m.startedAt = 100000;
  const v = music.view(m, 142500);
  assert.strictEqual(v.index, 3);
  assert.strictEqual(v.pos, 42500);
  assert.strictEqual(v.now, 142500);
});

test('mentett állapot tisztítása indításkor', () => {
  assert.strictEqual(music.sanitize({ kind: 'playlist', id: '<script>' }).kind, '');
  assert.strictEqual(music.sanitize(null).kind, '');
  assert.strictEqual(music.sanitize({ kind: 'video', id: 'dQw4w9WgXcQ', index: 7, startedAt: 5 }).id, 'dQw4w9WgXcQ');
});

test('ajtó nyitására halkítás-esemény megy, csukásra feloldás; elveszett zárás magától lejár', () => {
  const rt = { open: false, since: 0 };
  assert.deepStrictEqual(music.onDoor(rt, 'open', 1000), { t: 'music-duck', on: true });
  assert.strictEqual(music.duckActive(rt, 2000), true);
  assert.strictEqual(music.duckActive(rt, 1000 + 6 * 60 * 1000), false, '5 perc után feloldódik');
  assert.deepStrictEqual(music.onDoor(rt, 'closed', 3000), { t: 'music-duck', on: false });
  assert.strictEqual(music.duckActive(rt, 3500), false);
  assert.strictEqual(music.onDoor(rt, 'valami', 4000), null);
});

test('szerver: az ajtónyitás halkítás-üzenetet küld a kapcsolt klienseknek, a zene állapota szinkronban megy', async () => {
  const os = require('os'), fs = require('fs'), path = require('path'), { once } = require('events');
  process.env.INGEST_TOKEN = 't0k'; process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'exm-'));
  const WebSocket = require('ws');
  const { server } = require('./server');
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const open = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`); ws.msgs = [];
    ws.on('message', (d) => ws.msgs.push(JSON.parse(d)));
    await once(ws, 'open'); ws.send(JSON.stringify({ t: 'hello', nick: 'Teszt' })); return ws;
  };
  const wait = async (f) => { for (let i = 0; i < 50; i++) { if (f()) return; await new Promise((r) => setTimeout(r, 40)); } assert.fail('időtúllépés'); };
  const a = await open(), b = await open();
  a.send(JSON.stringify({ t: 'music-set', input: 'https://www.youtube.com/playlist?list=PLabcdefghij12' }));
  await wait(() => b.msgs.some((m) => m.t === 'music' && m.music.id === 'PLabcdefghij12'));
  const rev = b.msgs.filter((m) => m.t === 'music').pop().music.rev;
  for (const c of [a, b]) c.send(JSON.stringify({ t: 'music-track', rev, to: 1 }));   // két kliens jelent, egy lépés lesz
  await wait(() => a.msgs.some((m) => m.t === 'music' && m.music.index === 1));
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(a.msgs.filter((m) => m.t === 'music' && m.music.index === 1).length, 1);
  const res = await fetch(`http://127.0.0.1:${port}/api/door`, { method: 'POST', headers: { authorization: 'Bearer t0k', 'content-type': 'application/json' }, body: '{"state":"open"}' });
  assert.strictEqual(res.status, 200);
  await wait(() => a.msgs.some((m) => m.t === 'music-duck' && m.on === true) && b.msgs.some((m) => m.t === 'music-duck' && m.on === true));
  const c = await open();   // aki most csatlakozik, a halkítást is megkapja az állapotban
  await wait(() => c.msgs.some((m) => m.t === 'state' && m.music && m.music.duck === true && m.music.index === 1));
  await fetch(`http://127.0.0.1:${port}/api/door`, { method: 'POST', headers: { authorization: 'Bearer t0k', 'content-type': 'application/json' }, body: '{"state":"closed"}' });
  await wait(() => a.msgs.some((m) => m.t === 'music-duck' && m.on === false));
  for (const w of [a, b, c]) w.close();
  server.closeAllConnections?.(); server.close();
  setTimeout(() => process.exit(), 50).unref();
});
