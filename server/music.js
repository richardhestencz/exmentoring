// Közös zene: egy YouTube-lejátszási lista van bekötve; amit az emberek a YouTube-on a listába tesznek, megjelenik az oldalon,
// és sorban, magától szól (a végén újrakezdi). Mindenki ugyanott tart; ugrani, adott számot indítani, szüneteltetni közösen lehet.
// Az állapot: {list, link, title, items: [{v, title}], cur, curV, startedAt, paused, pos, rev, fetchedAt, err}.
// Pozíció a számban: lejátszva now - startedAt, szünetelve pos. A rev minden lejátszás-változásnál nő (a dupla jelentések kiszűrésére).
const VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;
const LIST_RE = /^[A-Za-z0-9_-]{10,64}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const MAX_ITEMS = 300;
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

const empty = () => ({ list: '', link: '', title: '', items: [], cur: 0, curV: '', startedAt: 0, paused: false, pos: 0, rev: 0, fetchedAt: 0, err: '' });
const cleanTitle = (t) => String(t || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);

// a mentett állapot tisztítása indításkor (a régebbi formákból csak a beállított lista marad meg)
function sanitize(m) {
  const e = empty();
  if (!m || typeof m !== 'object') return e;
  const p = m.link ? parseList(m.link) : m.list ? parseList(m.list) : null;
  if (!p) return e;
  Object.assign(e, p, { title: cleanTitle(m.title) });
  if (Array.isArray(m.items)) e.items = m.items.filter((x) => x && VIDEO_RE.test(x.v)).slice(0, MAX_ITEMS).map((x) => ({ v: x.v, title: cleanTitle(x.title) || 'YouTube-szám' }));
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
  return { list: m.list, link: m.link, title: m.title, items: m.items, cur: m.cur, startedAt: m.startedAt, paused: m.paused,
    pos: m.items.length ? position(m, now) : 0, rev: m.rev, fetchedAt: m.fetchedAt, err: m.err, now, duck };
}

const startAt = (m, i, now) => Object.assign(m, { cur: i, curV: m.items[i] ? m.items[i].v : '', startedAt: now, paused: false, pos: 0, rev: m.rev + 1 });

// új lista bekötése: a régi számok kiürülnek, a lekérés után indul
function setList(m, input) {
  const p = parseList(input);
  if (!p) return 'Ez nem YouTube-lejátszásilista-link (a linkben legyen „list=”; YouTube-mix nem jó).';
  Object.assign(m, empty(), p, { rev: m.rev + 1 });
  return null;
}

// a YouTube-ról frissen lekért számok átvétele. Ami épp szól, az szól tovább (ha még a listán van); ha kikerült, a helyén lévő indul.
// Visszaadja, változott-e valami, amit a klienseknek látniuk kell.
function updateItems(m, title, items, now) {
  const next = items.filter((x) => x && VIDEO_RE.test(x.v)).slice(0, MAX_ITEMS).map((x) => ({ v: x.v, title: cleanTitle(x.title) || 'YouTube-szám' }));
  const same = next.length === m.items.length && next.every((x, i) => x.v === m.items[i].v && x.title === m.items[i].title) && cleanTitle(title) === m.title;
  m.fetchedAt = now; m.err = '';
  if (same) return false;
  const wasEmpty = !m.items.length;
  m.items = next; m.title = cleanTitle(title);
  if (!next.length) { Object.assign(m, { cur: 0, curV: '', startedAt: 0, paused: false, pos: 0, rev: m.rev + 1 }); return true; }
  const i = next.findIndex((x) => x.v === m.curV);
  if (wasEmpty || !m.curV) startAt(m, 0, now);
  else if (i >= 0) { m.cur = i; m.rev++; }                     // ugyanaz szól tovább, csak a helye változhatott
  else startAt(m, Math.min(m.cur, next.length - 1), now);      // a szóló szám kikerült a listából
  return true;
}
function fetchFailed(m, msg, now) { m.err = msg; m.fetchedAt = now; }

// egy kliens jelenti, hogy a szám véget ért (vagy nem játszható): a következő indul.
// Csak az a jelentés számít, amelyik a jelenlegi rev-re vonatkozik: így többen jelentve is csak egyszer lép.
function ended(m, rev, now) {
  if (!m.items.length || rev !== m.rev) return false;
  startAt(m, (m.cur + 1) % m.items.length, now);
  return true;
}
function skip(m, dir, now) {
  if (!m.items.length) return 'Még üres a lista.';
  if (dir !== 1 && dir !== -1) return 'Ismeretlen lépés.';
  startAt(m, ((m.cur + dir) % m.items.length + m.items.length) % m.items.length, now);
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

module.exports = { parseList, empty, sanitize, position, view, setList, updateItems, fetchFailed, ended, skip, play, setPaused, fetchList, collect, onDoor, duckActive, MAX_ITEMS };
