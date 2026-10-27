// Közös zene: egy YouTube-lejátszási lista van bekötve; amit az emberek a YouTube-on a listába tesznek, megjelenik az oldalon,
// és sorban, magától szól (a végén újrakezdi). Mindenki ugyanott tart; ugrani, adott számot indítani, szüneteltetni közösen lehet.
// Az oldalon bárki betehet egy-egy számot is (linkkel): ezek a lista végére kerülnek (extra), és ugyanúgy szólnak.
// Az állapot: {list, link, title, pl: a YouTube-lista számai, extra: [{v, title, by}], items: pl + extra, cur, curV, shuffle, played,
// startedAt, paused, pos, rev, fetchedAt, err}.
// Pozíció a számban: lejátszva now - startedAt, szünetelve pos. A rev minden lejátszás-változásnál nő (a dupla jelentések kiszűrésére).
const VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;
const LIST_RE = /^[A-Za-z0-9_-]{10,64}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const MAX_ITEMS = 300;
const MAX_EXTRA = 100;
const DUCK_MAX_MS = 5 * 60 * 1000;    // ha az ajtó "zárt" jele elveszik, ennyi után magától feloldódik a halkítás

// YouTube / YouTube Music lejátszásilista-link (a közös szerkesztésre meghívó link is) -> {list, link}, vagy null
function parseList(input) {
  const s = String(input || '').trim();
  if (!s || s.length > 600) return null;
  if (/^(PL|OLAK5uy_)[A-Za-z0-9_-]{8,}$/.test(s)) return { list: s, link: `https://www.youtube.com/playlist?list=${s}` };
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !HOSTS.has(u.hostname.toLowerCase())) return null;
  const list = u.searchParams.get('list');
  if (!list || !LIST_RE.test(list) || /^(RD|UU|LL|WL)/.test(list)) return null;   // mixek, feltöltések, kedvencek nem
  const link = new URL(`https://www.youtube.com/playlist?list=${list}`);
  const jct = u.searchParams.get('jct');                       // a közös szerkesztés meghívója: ezzel tud más is hozzáadni
  if (jct && /^[A-Za-z0-9_-]{4,64}$/.test(jct)) link.searchParams.set('jct', jct);
  return { list, link: link.toString() };
}

const empty = () => ({ list: '', link: '', title: '', pl: [], extra: [], items: [], shuffle: false, played: [], cur: 0, curV: '', startedAt: 0, paused: false, pos: 0, rev: 0, fetchedAt: 0, err: '' });
const cleanTitle = (t) => String(t || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
const cleanBy = (t) => String(t || '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 16);

// egy YouTube / YouTube Music szám linkje (watch, youtu.be, shorts, embed, music) vagy a puszta azonosító -> videóazonosító, vagy null
function parseVideo(input) {
  const s = String(input || '').trim();
  if (!s || s.length > 600) return null;
  if (VIDEO_RE.test(s)) return s;
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  let v = null;
  if (h === 'youtu.be' || h === 'www.youtu.be') v = u.pathname.split('/')[1];
  else if (HOSTS.has(h)) v = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/) || [])[1];
  return v && VIDEO_RE.test(v) ? v : null;
}

// a lejátszandó sor: a YouTube-lista számai, utánuk az oldalon betettek; ami épp szól, szól tovább (ha még a soron van)
function merge(m) {
  const seen = new Set(), items = [];
  for (const x of m.pl) if (!seen.has(x.v)) { seen.add(x.v); items.push({ v: x.v, title: x.title }); }
  for (const x of m.extra) if (!seen.has(x.v)) { seen.add(x.v); items.push({ v: x.v, title: x.title, by: x.by }); }
  m.items = items.slice(0, MAX_ITEMS + MAX_EXTRA);
  m.played = m.played.filter((v) => seen.has(v));
}

// a mentett állapot tisztítása indításkor (a régebbi formákból csak a beállított lista marad meg)
function sanitize(m) {
  const e = empty();
  if (!m || typeof m !== 'object') return e;
  const p = m.link ? parseList(m.link) : m.list ? parseList(m.list) : null;
  const clean = (a, n) => (Array.isArray(a) ? a : []).filter((x) => x && VIDEO_RE.test(x.v)).slice(0, n).map((x) => ({ v: x.v, title: cleanTitle(x.title) || 'YouTube-szám' }));
  if (p) Object.assign(e, p, { title: cleanTitle(m.title) });
  e.pl = p ? clean(Array.isArray(m.pl) ? m.pl : m.items, MAX_ITEMS) : [];   // régebben a lista számai az items-ben voltak
  e.extra = clean(m.extra, MAX_EXTRA).map((x, i) => ({ ...x, by: cleanBy(m.extra[i] && m.extra[i].by) }));
  e.shuffle = !!m.shuffle;
  e.played = Array.isArray(m.played) ? m.played.filter((v) => VIDEO_RE.test(v)).slice(0, MAX_ITEMS + MAX_EXTRA) : [];
  merge(e);
  if (!e.items.length) return e;
  e.cur = Number.isInteger(m.cur) && m.cur >= 0 && m.cur < e.items.length ? m.cur : 0;
  e.curV = e.items[e.cur] ? e.items[e.cur].v : '';
  e.startedAt = Number(m.startedAt) || 0; e.paused = !!m.paused; e.pos = Math.max(0, Number(m.pos) || 0); e.rev = Number(m.rev) || 0;
  e.fetchedAt = Number(m.fetchedAt) || 0;
  return e;
}

// hol tart a szám (ms)
const position = (m, now) => (m.paused ? m.pos : Math.max(0, now - m.startedAt));

// kliensnek küldött nézet; a now a szerver ideje (óraeltolás kiszámításához)
function view(m, now, duck = false) {
  return { list: m.list, link: m.link, title: m.title, items: m.items, extra: m.extra.length, shuffle: m.shuffle, cur: m.cur, startedAt: m.startedAt, paused: m.paused,
    pos: m.items.length ? position(m, now) : 0, rev: m.rev, fetchedAt: m.fetchedAt, err: m.err, now, duck };
}

const startAt = (m, i, now) => (m.items[i] && !m.played.includes(m.items[i].v) && m.played.push(m.items[i].v), Object.assign(m, { cur: i, curV: m.items[i] ? m.items[i].v : '', startedAt: now, paused: false, pos: 0, rev: m.rev + 1 }));

// a következő szám: sorban, vagy véletlen sorrendben úgy, hogy egy körön belül egyik sem ismétlődik
function nextIndex(m, rnd = Math.random) {
  const n = m.items.length;
  if (!m.shuffle || n < 2) return (m.cur + 1) % n;
  let left = m.items.map((x, i) => i).filter((i) => i !== m.cur && !m.played.includes(m.items[i].v));
  if (!left.length) { m.played = []; left = m.items.map((x, i) => i).filter((i) => i !== m.cur); }   // új kör
  return left[Math.floor(rnd() * left.length)];
}

// új lista bekötése: a régi számok kiürülnek, a lekérés után indul
function setList(m, input) {
  const p = parseList(input);
  if (!p) return 'Ez nem YouTube-lejátszásilista-link (a linkben legyen „list=”; YouTube-mix nem jó).';
  const keep = { extra: m.extra, shuffle: m.shuffle, curV: m.curV, cur: m.cur, startedAt: m.startedAt, paused: m.paused, pos: m.pos };
  Object.assign(m, empty(), p, { rev: m.rev + 1, extra: keep.extra, shuffle: keep.shuffle });
  merge(m);
  const i = m.items.findIndex((x) => x.v === keep.curV);   // az oldalon betett szám, ami épp szól, szól tovább
  if (i >= 0) Object.assign(m, { cur: i, curV: keep.curV, startedAt: keep.startedAt, paused: keep.paused, pos: keep.pos });
  else if (m.items.length) startAt(m, 0, Date.now());
  return null;
}

// a YouTube-ról frissen lekért számok átvétele. Ami épp szól, az szól tovább (ha még a listán van); ha kikerült, a helyén lévő indul.
// Visszaadja, változott-e valami, amit a klienseknek látniuk kell.
function updateItems(m, title, items, now) {
  const next = items.filter((x) => x && VIDEO_RE.test(x.v)).slice(0, MAX_ITEMS).map((x) => ({ v: x.v, title: cleanTitle(x.title) || 'YouTube-szám' }));
  const same = next.length === m.pl.length && next.every((x, i) => x.v === m.pl[i].v && x.title === m.pl[i].title) && cleanTitle(title) === m.title;
  m.fetchedAt = now; m.err = '';
  if (same) return false;
  const wasEmpty = !m.items.length;
  m.pl = next; m.title = cleanTitle(title); merge(m);
  if (!m.items.length) { Object.assign(m, { cur: 0, curV: '', startedAt: 0, paused: false, pos: 0, rev: m.rev + 1 }); return true; }
  const i = m.items.findIndex((x) => x.v === m.curV);
  if (wasEmpty || !m.curV) startAt(m, 0, now);
  else if (i >= 0) { m.cur = i; m.rev++; }                     // ugyanaz szól tovább, csak a helye változhatott
  else startAt(m, Math.min(m.cur, m.items.length - 1), now);      // a szóló szám kikerült a listából
  return true;
}
function fetchFailed(m, msg, now) { m.err = msg; m.fetchedAt = now; }

// egy kliens jelenti, hogy a szám véget ért (vagy nem játszható): a következő indul.
// Csak az a jelentés számít, amelyik a jelenlegi rev-re vonatkozik: így többen jelentve is csak egyszer lép.
function ended(m, rev, now) {
  if (!m.items.length || rev !== m.rev) return false;
  startAt(m, nextIndex(m), now);
  return true;
}
function skip(m, dir, now) {
  if (!m.items.length) return 'Még üres a lista.';
  if (dir !== 1 && dir !== -1) return 'Ismeretlen lépés.';
  startAt(m, dir === 1 ? nextIndex(m) : ((m.cur - 1) % m.items.length + m.items.length) % m.items.length, now);
  return null;
}
function play(m, i, now) {
  if (!Number.isInteger(i) || i < 0 || i >= m.items.length) return 'Ez a szám már nincs a listán.';
  startAt(m, i, now);
  return null;
}
function setPaused(m, paused, now) {
  if (!m.items.length) return 'Még üres a lista.';
  if (paused === m.paused) return null;
  if (paused) { m.pos = position(m, now); m.paused = true; }
  else { m.startedAt = now - m.pos; m.paused = false; }
  m.rev++;
  return null;
}

// egy szám betétele az oldalon (a cím a szervertől jön, oEmbedből). Ha eddig semmi nem szólt, ez indul.
function addSong(m, v, title, by, now) {
  if (!VIDEO_RE.test(v || '')) return 'Ez nem YouTube-szám linkje.';
  if (m.items.some((x) => x.v === v)) return 'Ez a szám már a listán van.';
  if (m.extra.length >= MAX_EXTRA) return `Legfeljebb ${MAX_EXTRA} számot lehet betenni; vegyél ki egy régebbit.`;
  const wasEmpty = !m.items.length;
  m.extra.push({ v, title: cleanTitle(title) || 'YouTube-szám', by: cleanBy(by) });
  merge(m);
  if (wasEmpty) startAt(m, 0, now); else m.rev++;
  return null;
}
// az oldalon betett szám kivétele (a YouTube-lista számai a YouTube-on szerkeszthetők); ha épp ez szólt, a helyén lévő jön
function removeSong(m, v, now) {
  const k = m.extra.findIndex((x) => x.v === v);
  if (k < 0) return 'Ezt a számot csak a YouTube-listában lehet kivenni.';
  const playing = m.curV === v;
  m.extra.splice(k, 1); merge(m);
  if (!m.items.length) Object.assign(m, { cur: 0, curV: '', startedAt: 0, paused: false, pos: 0, rev: m.rev + 1 });
  else if (playing) startAt(m, Math.min(m.cur, m.items.length - 1), now);
  else { m.cur = Math.max(0, m.items.findIndex((x) => x.v === m.curV)); m.rev++; }
  return null;
}
function setShuffle(m, on) { m.shuffle = !!on; m.played = m.curV ? [m.curV] : []; m.rev++; return null; }

// a szám címe a YouTube oEmbed-jéből (API-kulcs nélkül). 401/403/404: nem beágyazható vagy nem létező szám.
async function fetchTitle(v, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + v)}`, { headers: UA, signal: AbortSignal.timeout(6000) });
  if ([401, 403, 404].includes(r.status)) throw new Error('Ez a szám nem létezik, vagy a feltöltője nem engedi beágyazni.');
  if (!r.ok) return '';
  const j = await r.json();
  return cleanTitle([j.author_name && !String(j.title || '').includes(j.author_name) ? j.author_name : '', j.title].filter(Boolean).join(' – '));
}

// a lista számai a YouTube lejátszásilista-oldaláról (API-kulcs nélkül): ytInitialData, plusz a folytatás-oldalak
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'accept-language': 'hu,en;q=0.8', cookie: 'CONSENT=YES+cb; SOCS=CAI' };
function collect(o, out, state) {
  if (!o || typeof o !== 'object') return;
  const l = o.lockupViewModel;
  if (l && l.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && VIDEO_RE.test(l.contentId || '')) { out.push({ v: l.contentId, title: l.metadata?.lockupMetadataViewModel?.title?.content || '' }); return; }
  const r = o.playlistVideoRenderer;
  if (r && VIDEO_RE.test(r.videoId || '')) { out.push({ v: r.videoId, title: r.title?.runs?.[0]?.text || r.title?.simpleText || '' }); return; }
  if (o.continuationItemRenderer) { const t = JSON.stringify(o.continuationItemRenderer).match(/"token":"([^"]+)"/); if (t) state.cont = t[1]; return; }
  for (const k in o) collect(o[k], out, state);
}
async function fetchList(list, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(`https://www.youtube.com/playlist?list=${encodeURIComponent(list)}&hl=hu`, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`A YouTube ${r.status} hibát adott.`);
  const html = await r.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error('A lista nem olvasható (privát lista? Legyen nyilvános vagy nem listázott).');
  const data = JSON.parse(m[1]);
  const title = data?.metadata?.playlistMetadataRenderer?.title || '';
  const items = [], state = { cont: null };
  collect(data.contents || data, items, state);
  if (!items.length && !title) throw new Error('A lista nem olvasható (privát lista? Legyen nyilvános vagy nem listázott).');
  const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1];
  for (let page = 0; state.cont && ver && page < 5 && items.length < MAX_ITEMS; page++) {
    const t = state.cont; state.cont = null;
    const c = await fetchImpl('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', { method: 'POST', headers: { ...UA, 'content-type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'hu' } }, continuation: t }), signal: AbortSignal.timeout(10000) });
    if (!c.ok) break;
    collect(await c.json(), items, state);
  }
  const seen = new Set();
  return { title, items: items.filter((x) => !seen.has(x.v) && seen.add(x.v)) };
}

// ajtóesemény -> halkítás. rt: futásidejű (nem mentett) állapot. Visszaadja a kliensek felé küldendő üzenetet.
function onDoor(rt, state, now) {
  if (state === 'open') { rt.open = true; rt.since = now; return { t: 'music-duck', on: true }; }
  if (state === 'closed') { rt.open = false; return { t: 'music-duck', on: false }; }
  return null;
}
const duckActive = (rt, now) => !!rt.open && now - rt.since < DUCK_MAX_MS;

module.exports = { parseList, parseVideo, addSong, removeSong, setShuffle, nextIndex, fetchTitle, empty, sanitize, position, view, setList, updateItems, fetchFailed, ended, skip, play, setPaused, fetchList, collect, onDoor, duckActive, MAX_ITEMS };
