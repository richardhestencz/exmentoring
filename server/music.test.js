const test = require('node:test');
const assert = require('node:assert');
const music = require('./music');
const V = 'dQw4w9WgXcQ', W = 'kJQP7kiw5Fk', X = '9bZkp7q19f0';

test('link-értelmezés: youtube.com, music.youtube.com, youtu.be, shorts, puszta azonosító', () => {
  assert.strictEqual(music.parse('https://youtu.be/dQw4w9WgXcQ?t=5'), V);
  assert.strictEqual(music.parse('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM'), V);
  assert.strictEqual(music.parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghij12&index=3'), V);
  assert.strictEqual(music.parse('https://www.youtube.com/shorts/dQw4w9WgXcQ'), V);
  assert.strictEqual(music.parse(V), V);
  for (const bad of ['', 'nem link', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/', 'https://www.youtube.com/watch?v=rovid', 'javascript:alert(1)', 'https://www.youtube.com/playlist?list=PLabcdefghij12']) {
    assert.strictEqual(music.parse(bad), null, bad);
  }
});

test('lista: az első szám azonnal indul, a többi a végére kerül, nincs duplikátum', () => {
  const m = music.empty();
  assert.strictEqual(music.add(m, V, 'Első', 'Ricsi', 1000), null);
  assert.deepStrictEqual([m.queue.length, m.cur, m.startedAt, m.paused], [1, 0, 1000, false]);
  assert.strictEqual(music.add(m, W, 'Második', 'Gabó', 2000), null);
  assert.strictEqual(m.startedAt, 1000, 'a hozzáadás nem indítja újra a szóló számot');
  assert.match(music.add(m, V, 'Megint', 'Gabó', 3000), /már a listán/);
  assert.match(music.add(m, 'rossz', '', 'Gabó', 3000), /nem YouTube/);
  assert.deepStrictEqual(music.view(m, 5000).queue.map((x) => [x.title, x.by]), [['Első', 'Ricsi'], ['Második', 'Gabó']]);
});

test('a szám végén magától a következő jön, a lista végén újrakezdi; dupla jelentés csak egyszer lép', () => {
  const m = music.empty();
  music.add(m, V, 'A', 'R', 1000); music.add(m, W, 'B', 'R', 1000);
  const rev = m.rev;
  assert.strictEqual(music.ended(m, rev, 5000), true);
  assert.strictEqual(music.ended(m, rev, 5010), false, 'a második kliens jelentése elavult');
  assert.deepStrictEqual([m.cur, m.startedAt], [1, 5000]);
  music.ended(m, m.rev, 9000);
  assert.strictEqual(m.cur, 0, 'körbeér');
});

test('ugrás, kattintásra indítás, kivétel, szünet', () => {
  const m = music.empty();
  for (const [v, t] of [[V, 'A'], [W, 'B'], [X, 'C']]) music.add(m, v, t, 'R', 1000);
  assert.strictEqual(music.skip(m, -1, 2000), null); assert.strictEqual(m.cur, 2, 'előre-hátra körbeér');
  const idB = m.queue[1].id;
  assert.strictEqual(music.play(m, idB, 3000), null); assert.deepStrictEqual([m.cur, m.startedAt], [1, 3000]);
  assert.strictEqual(music.remove(m, idB, 4000), null);
  assert.deepStrictEqual([m.queue.map((x) => x.title), m.cur, m.startedAt], [['A', 'C'], 1, 4000], 'a szóló szám kivétele után a következő indul');
  assert.strictEqual(music.remove(m, m.queue[0].id, 5000), null);
  assert.deepStrictEqual([m.cur, m.startedAt], [0, 4000], 'előtte lévő kivétele: ugyanaz szól tovább');
  music.setPaused(m, true, 6000); assert.strictEqual(music.position(m, 9000), 2000);
  music.setPaused(m, false, 10000); assert.strictEqual(music.position(m, 11000), 3000);
  music.remove(m, m.queue[0].id, 12000); assert.deepStrictEqual([m.queue.length, m.cur], [0, 0]);
  assert.match(music.skip(m, 1, 1), /üres/);
});

test('mentett állapot: az új forma megmarad, a régi egy-szám formából lista lesz', () => {
  const m = music.empty(); music.add(m, V, 'A', 'R', 1); music.add(m, W, 'B', 'R', 1);
  const back = music.sanitize(JSON.parse(JSON.stringify(m)));
  assert.deepStrictEqual(back.queue.map((x) => x.v), [V, W]);
  assert.deepStrictEqual(music.sanitize({ kind: 'video', id: V, setBy: 'Ricsi' }).queue.map((x) => [x.v, x.by]), [[V, 'Ricsi']]);
  assert.deepStrictEqual(music.sanitize({ kind: 'playlist', id: 'PLabcdefghij12' }).queue, []);
  assert.deepStrictEqual(music.sanitize(null).queue, []);
});

test('oEmbed: beágyazás tiltva / nem elérhető / hálózati hiba', async () => {
  const fake = (status, body) => async () => ({ status, ok: status === 200, json: async () => body });
  assert.deepStrictEqual(await music.info(V, fake(200, { title: 'Dal' })), { ok: true, title: 'Dal' });
  assert.strictEqual((await music.info(V, fake(401))).ok, false);
  assert.strictEqual((await music.info(V, fake(404))).ok, false);
  assert.deepStrictEqual(await music.info(V, async () => { throw new Error('offline'); }), { ok: true, title: '' });
});

test('ajtó nyitására halkítás-esemény megy, csukásra feloldás; elveszett zárás magától lejár', () => {
  const rt = { open: false, since: 0 };
  assert.deepStrictEqual(music.onDoor(rt, 'open', 1000), { t: 'music-duck', on: true });
  assert.strictEqual(music.duckActive(rt, 2000), true);
  assert.strictEqual(music.duckActive(rt, 1000 + 5 * 60 * 1000 + 1), false);
  assert.deepStrictEqual(music.onDoor(rt, 'closed', 3000), { t: 'music-duck', on: false });
  assert.strictEqual(music.onDoor(rt, 'valami', 4000), null);
});

test('szerver: hozzáadás, közös léptetés, ajtós halkítás két klienssel', async () => {
  const os = require('os'), fs = require('fs'), path = require('path'), { once } = require('events');
  process.env.INGEST_TOKEN = 't0k'; process.env.MUSIC_OEMBED = '0'; process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'exm-'));
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
  const last = (c) => c.msgs.filter((m) => m.t === 'music').pop();
  const a = await open(), b = await open();
  a.send(JSON.stringify({ t: 'music-add', input: 'https://youtu.be/' + V }));
  a.send(JSON.stringify({ t: 'music-add', input: 'https://www.youtube.com/watch?v=' + W }));
  await wait(() => last(b) && last(b).music.queue.length === 2);
  const rev = last(b).music.rev;
  for (const c of [a, b]) c.send(JSON.stringify({ t: 'music-ended', rev }));   // két kliens jelent, egy lépés lesz
  await wait(() => last(a) && last(a).music.cur === 1);
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(a.msgs.filter((m) => m.t === 'music' && m.music.cur === 1 && m.music.rev === rev + 1).length, 1);
  const res = await fetch(`http://127.0.0.1:${port}/api/door`, { method: 'POST', headers: { authorization: 'Bearer t0k', 'content-type': 'application/json' }, body: '{"state":"open"}' });
  assert.strictEqual(res.status, 200);
  await wait(() => a.msgs.some((m) => m.t === 'music-duck' && m.on === true) && b.msgs.some((m) => m.t === 'music-duck' && m.on === true));
  const c = await open();   // aki most csatlakozik, a halkítást és a listát is megkapja az állapotban
  await wait(() => c.msgs.some((m) => m.t === 'state' && m.music && m.music.duck === true && m.music.queue.length === 2));
  await fetch(`http://127.0.0.1:${port}/api/door`, { method: 'POST', headers: { authorization: 'Bearer t0k', 'content-type': 'application/json' }, body: '{"state":"closed"}' });
  await wait(() => a.msgs.some((m) => m.t === 'music-duck' && m.on === false));
  for (const w of [a, b, c]) w.close();
  server.closeAllConnections?.(); server.close();
  setTimeout(() => process.exit(), 50).unref();
});
