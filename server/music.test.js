const test = require('node:test');
const assert = require('node:assert');
const music = require('./music');
const L = 'PLabcdefghij12345', it = (v, title) => ({ v, title });
const A = it('dQw4w9WgXcQ', 'A'), B = it('kJQP7kiw5Fk', 'B'), C = it('9bZkp7q19f0', 'C');

test('lista-link: playlist, közös szerkesztésre meghívó, YouTube Music, puszta azonosító; a mix és a hülyeség nem', () => {
  assert.deepStrictEqual(music.parseList(`https://www.youtube.com/playlist?list=${L}`), { list: L, link: `https://www.youtube.com/playlist?list=${L}` });
  assert.deepStrictEqual(music.parseList(`https://youtube.com/playlist?list=${L}&jct=AbC123xyz&si=zz`), { list: L, link: `https://www.youtube.com/playlist?list=${L}&jct=AbC123xyz` });
  assert.strictEqual(music.parseList(`https://music.youtube.com/playlist?list=${L}`).list, L);
  assert.strictEqual(music.parseList(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${L}`).list, L);
  assert.strictEqual(music.parseList(L).list, L);
  for (const bad of ['', 'nem link', `https://evil.example/playlist?list=${L}`, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/playlist?list=RDGMEMYH9CUrFO7CfLJpaD7UR85w', 'javascript:alert(1)']) {
    assert.strictEqual(music.parseList(bad), null, bad);
  }
});

test('frissítés: az első lekéréskor indul; ami szól, szól tovább; ha kikerült, a helyén lévő jön', () => {
  const m = music.empty(); music.setList(m, L);
  assert.strictEqual(music.updateItems(m, 'Közös', [A, B], 1000), true);
  assert.deepStrictEqual([m.title, m.items.length, m.cur, m.curV, m.startedAt], ['Közös', 2, 0, A.v, 1000]);
  assert.strictEqual(music.updateItems(m, 'Közös', [A, B], 2000), false, 'nincs változás');
  music.skip(m, 1, 3000);   // B szól
  assert.strictEqual(music.updateItems(m, 'Közös', [C, A, B], 4000), true);
  assert.deepStrictEqual([m.cur, m.curV, m.startedAt], [2, B.v, 3000], 'valaki elé tett egy számot: B szól tovább, nem indul újra');
  music.updateItems(m, 'Közös', [C, A], 5000);
  assert.deepStrictEqual([m.cur, m.curV, m.startedAt], [1, A.v, 5000], 'B kikerült: a helyén lévő indul');
  music.updateItems(m, 'Közös', [], 6000);
  assert.deepStrictEqual([m.items.length, m.curV], [0, '']);
});

test('a szám végén magától a következő jön, a lista végén újrakezdi; dupla jelentés csak egyszer lép', () => {
  const m = music.empty(); music.setList(m, L); music.updateItems(m, '', [A, B], 1000);
  const rev = m.rev;
  assert.strictEqual(music.ended(m, rev, 5000, 3), true);
  assert.strictEqual(music.ended(m, rev, 5010, 3), false, 'a második kliens jelentése elavult');
  assert.deepStrictEqual([m.cur, m.startedAt], [1, 5000]);
  music.ended(m, m.rev, 9000, 3);
  assert.strictEqual(m.cur, 0, 'körbeér');
});

test('ugrás, kattintásra indítás, szünet, új lista bekötése', () => {
  const m = music.empty(); music.setList(m, L); music.updateItems(m, '', [A, B, C], 1000);
  assert.strictEqual(music.skip(m, -1, 2000), null); assert.strictEqual(m.cur, 2, 'körbeér visszafelé');
  assert.strictEqual(music.play(m, 1, 3000), null); assert.deepStrictEqual([m.cur, m.startedAt], [1, 3000]);
  assert.match(music.play(m, 9, 3000), /nincs/);
  music.setPaused(m, true, 6000); assert.strictEqual(music.position(m, 9000), 3000);
  music.setPaused(m, false, 10000); assert.strictEqual(music.position(m, 11000), 4000);
  assert.match(music.setList(m, 'rossz'), /list=/);
  assert.strictEqual(music.setList(m, 'PLzyxwvutsrqp987'), null);
  assert.deepStrictEqual([m.list, m.items.length], ['PLzyxwvutsrqp987', 0], 'új lista: a régi számok kiürülnek');
});

test('mentett állapot: a lista megmarad, a régi formák (egy link, saját lista) nem törnek el', () => {
  const m = music.empty(); music.setList(m, `https://www.youtube.com/playlist?list=${L}&jct=AbC123xyz`); music.updateItems(m, 'K', [A, B], 1);
  const back = music.sanitize(JSON.parse(JSON.stringify(m)));
  assert.deepStrictEqual([back.list, back.items.length, back.link.includes('jct=AbC123xyz')], [L, 2, true]);
  assert.strictEqual(music.sanitize({ queue: [{ v: A.v }], cur: 0 }).list, '');
  assert.strictEqual(music.sanitize({ kind: 'playlist', id: 'RDGMEMYH9CUrFO7CfLJpaD7UR85w' }).list, '');
  assert.strictEqual(music.sanitize(null).list, '');
});

test('a YouTube-oldal feldolgozása: új (lockup) és régi formátum, folytatás-oldal', async () => {
  const lock = (v, t) => ({ lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: v, metadata: { lockupMetadataViewModel: { title: { content: t } } } } });
  const page = { metadata: { playlistMetadataRenderer: { title: 'Közös' } }, contents: { x: [lock(A.v, 'A'), { playlistVideoRenderer: { videoId: B.v, title: { runs: [{ text: 'B' }] } } }, { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'TOK' } } } }] } };
  const html = `<script>var ytInitialData = ${JSON.stringify(page)};</script> "INNERTUBE_CLIENT_VERSION":"2.0"`;
  const calls = [];
  const fake = async (url, opt) => { calls.push(url); return url.includes('/browse') ? { ok: true, json: async () => ({ items: [lock(C.v, 'C'), lock(A.v, 'A')] }) } : { ok: true, text: async () => html }; };
  const r = await music.fetchList(L, fake);
  assert.deepStrictEqual([r.title, r.items.map((x) => x.title)], ['Közös', ['A', 'B', 'C']], 'ismétlés nélkül, a folytatással');
  await assert.rejects(music.fetchList(L, async () => ({ ok: true, text: async () => '<html>privát</html>' })), /nem olvasható/);
});

test('ajtó nyitására halkítás-esemény megy, csukásra feloldás; elveszett zárás magától lejár', () => {
  const rt = { open: false, since: 0 };
  assert.deepStrictEqual(music.onDoor(rt, 'open', 1000), { t: 'music-duck', on: true });
  assert.strictEqual(music.duckActive(rt, 2000), true);
  assert.strictEqual(music.duckActive(rt, 1000 + 5 * 60 * 1000 + 1), false);
  assert.deepStrictEqual(music.onDoor(rt, 'closed', 3000), { t: 'music-duck', on: false });
});

test('szerver: lista bekötése, közös léptetés, ajtós halkítás két klienssel', async () => {
  const os = require('os'), fs = require('fs'), path = require('path'), { once } = require('events');
  process.env.INGEST_TOKEN = 't0k'; process.env.MUSIC_FETCH = '0'; process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'exm-'));
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
  a.send(JSON.stringify({ t: 'music-list', input: `https://www.youtube.com/playlist?list=${L}&jct=AbC123xyz` }));
  await wait(() => last(b) && last(b).music.list === L && last(b).music.link.includes('jct='));
  const m = require('./server');   // a lekérést a teszt pótolja (hálózat nélkül)
  assert.ok(m.server);
  a.send(JSON.stringify({ t: 'music-skip', dir: 1 }));
  await wait(() => a.msgs.some((x) => x.t === 'err' && /üres/.test(x.msg)));
  const res = await fetch(`http://127.0.0.1:${port}/api/door`, { method: 'POST', headers: { authorization: 'Bearer t0k', 'content-type': 'application/json' }, body: '{"state":"open"}' });
  assert.strictEqual(res.status, 200);
  await wait(() => a.msgs.some((x) => x.t === 'music-duck' && x.on === true) && b.msgs.some((x) => x.t === 'music-duck' && x.on === true));
  const c = await open();   // aki most csatlakozik, a halkítást és a listát is megkapja az állapotban
  await wait(() => c.msgs.some((x) => x.t === 'state' && x.music && x.music.duck === true && x.music.list === L));
  for (const w of [a, b, c]) w.close();
  server.closeAllConnections?.(); server.close();
  setTimeout(() => process.exit(), 50).unref();
});

test('szám betétele linkkel: watch, youtu.be, shorts, music; dupla nem; kivehető; lista nélkül is szól', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3', 'youtu.be/dQw4w9WgXcQ?si=x', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'])
    assert.strictEqual(music.parseVideo(u), 'dQw4w9WgXcQ', u);
  for (const u of ['https://example.com/watch?v=dQw4w9WgXcQ', 'hello', 'https://www.youtube.com/playlist?list=PLabcdefghij']) assert.strictEqual(music.parseVideo(u), null, u);
  const m = music.empty();
  assert.strictEqual(music.addSong(m, 'dQw4w9WgXcQ', 'Rick – Never', 'Ricsi', 100), null);
  assert.deepStrictEqual([m.items.length, m.curV, m.startedAt, m.items[0].by], [1, 'dQw4w9WgXcQ', 100, 'Ricsi'], 'üres listán azonnal indul');
  assert.match(music.addSong(m, 'dQw4w9WgXcQ', '', 'Anna', 200), /már a listán/);
  music.addSong(m, 'aaaaaaaaaaa', '', 'Anna', 300);
  assert.deepStrictEqual([m.items[1].title, m.curV], ['YouTube-szám', 'dQw4w9WgXcQ'], 'a szóló szám szól tovább');
  assert.strictEqual(music.removeSong(m, 'dQw4w9WgXcQ', 400), null);
  assert.deepStrictEqual([m.items.length, m.curV], [1, 'aaaaaaaaaaa'], 'a kivett szóló helyén a következő');
  const back = music.sanitize(JSON.parse(JSON.stringify(m)));
  assert.deepStrictEqual([back.items.length, back.extra[0].by], [1, 'Anna'], 'mentés után is megmarad');
});

test('a lista frissítése nem viszi el az oldalon betett számokat; új lista bekötésekor is megmaradnak', () => {
  const m = music.empty(); music.setList(m, L); music.updateItems(m, '', [A, B], 1000);
  music.addSong(m, 'zzzzzzzzzzz', 'Z', 'Ricsi', 1100);
  assert.deepStrictEqual(m.items.map((x) => x.v), [A.v, B.v, 'zzzzzzzzzzz']);
  music.updateItems(m, '', [B], 1200);
  assert.deepStrictEqual(m.items.map((x) => x.v), [B.v, 'zzzzzzzzzzz']);
  assert.match(music.removeSong(m, B.v, 1300), /YouTube-listában/);
  music.setList(m, 'PLzyxwvutsrqp987');
  assert.deepStrictEqual(m.items.map((x) => x.v), ['zzzzzzzzzzz']);
});

test('véletlen sorrend: egy körön belül nincs ismétlés, a kör végén újrakezdi', () => {
  const m = music.empty();
  'abcdefghijk'.split('').forEach((c, i) => music.addSong(m, c.repeat(11), c, 'X', i));
  music.setShuffle(m, true);
  const seen = new Set([m.curV]);
  for (let i = 0; i < 10; i++) { music.ended(m, m.rev, 100 + i, 1); seen.add(m.curV); }
  assert.strictEqual(seen.size, 11, 'mind a 11 szám szólt, ismétlés nélkül');
  music.ended(m, m.rev, 200, 1);
  assert.ok(m.curV, 'új kör indul');
  music.setShuffle(m, false);
  const at = m.cur; music.skip(m, 1, 300);
  assert.strictEqual(m.cur, (at + 1) % 11, 'kikapcsolva sorban jön');
});

test('vége-jelentés: csak ha a közös idő szerint is vége; a lejátszási hiba csak a hallgatók felénél léptet', () => {
  const m = music.empty(); music.setList(m, L); music.updateItems(m, '', [A, B, C], 1000);
  const rev = m.rev;
  assert.strictEqual(music.ended(m, rev, 1000 + 39000, 200), false, 'korai jelentés (39 s egy 200 s-os számból): eldobva');
  assert.strictEqual(music.ended(m, rev, 1000 + 120000), false, 'hossz nélkül nem fogadjuk el');
  assert.strictEqual(m.cur, 0);
  assert.strictEqual(music.ended(m, rev, 1000 + 196000, 200), true, '4 s-mal a vége előtt már jó');
  assert.strictEqual(m.cur, 1);
  const r2 = m.rev;
  assert.strictEqual(music.failed(m, r2, 'Ricsi', 4, 300000), false, 'egy gép hibája 4 hallgatóból nem léptet');
  assert.strictEqual(music.failed(m, r2, 'Ricsi', 4, 300100), false, 'ugyanaz a gép kétszer sem számít kétszer');
  assert.strictEqual(music.failed(m, r2, 'Gabó', 4, 300200), true, 'a hallgatók fele: léptet');
  assert.strictEqual(m.cur, 2);
  assert.strictEqual(music.failed(m, m.rev, 'Misi', 1, 400000), true, 'egyedül hallgatva a saját hiba léptet');
});
