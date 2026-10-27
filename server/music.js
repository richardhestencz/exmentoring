// Közös zene: egy közös lejátszási lista, amibe bárki betehet YouTube-számokat; sorban, magától megy, a végén újrakezdi.
// Az állapot: {queue: [{id, v, title, by, at}], cur, startedAt, paused, pos, rev, seq}.
// Pozíció a számban: lejátszva now - startedAt, szünetelve pos. A rev minden változásnál nő (a dupla jelentések kiszűrésére).
const VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);
const MAX_QUEUE = 200;
const DUCK_MAX_MS = 5 * 60 * 1000;    // ha az ajtó "zárt" jele elveszik, ennyi után magától feloldódik a halkítás

// YouTube / YouTube Music / youtu.be link (vagy puszta videóazonosító) -> videóazonosító, vagy null
function parse(input) {
  const s = String(input || '').trim();
  if (!s || s.length > 500) return null;
  if (VIDEO_RE.test(s)) return s;
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !HOSTS.has(u.hostname.toLowerCase())) return null;
  let v = u.searchParams.get('v');
  if (!v) {
    const parts = u.pathname.split('/').filter(Boolean);
    if (u.hostname.toLowerCase().endsWith('youtu.be')) v = parts[0];
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) v = parts[1];
  }
  return v && VIDEO_RE.test(v) ? v : null;
}

const empty = () => ({ queue: [], cur: 0, startedAt: 0, paused: false, pos: 0, rev: 0, seq: 0 });
const cleanTitle = (t) => String(t || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);

// a mentett állapot tisztítása indításkor (a régi „egy link” formából az egy szám átjön, a YouTube-playlist nem)
function sanitize(m) {
  const e = empty();
  if (!m || typeof m !== 'object') return e;
  if (Array.isArray(m.queue)) {
    for (const x of m.queue.slice(0, MAX_QUEUE)) if (x && VIDEO_RE.test(x.v)) e.queue.push({ id: Number(x.id) || ++e.seq, v: x.v, title: cleanTitle(x.title) || 'YouTube-szám', by: String(x.by || '').slice(0, 30), at: Number(x.at) || 0 });
    e.seq = Math.max(Number(m.seq) || 0, ...e.queue.map((x) => x.id), 0);
    e.cur = Number.isInteger(m.cur) && m.cur >= 0 && m.cur < e.queue.length ? m.cur : 0;
    e.startedAt = Number(m.startedAt) || 0; e.paused = !!m.paused; e.pos = Math.max(0, Number(m.pos) || 0); e.rev = Number(m.rev) || 0;
  } else if (m.kind === 'video' && VIDEO_RE.test(m.id)) {
    e.queue.push({ id: ++e.seq, v: m.id, title: 'YouTube-szám', by: String(m.setBy || '').slice(0, 30), at: 0 });
  }
  return e;
}

// hol tart a szám (ms)
const position = (m, now) => (m.paused ? m.pos : Math.max(0, now - m.startedAt));

// kliensnek küldött nézet; a now a szerver ideje (óraeltolás kiszámításához)
function view(m, now, duck = false) {
  return { queue: m.queue.map(({ id, v, title, by }) => ({ id, v, title, by })), cur: m.cur, startedAt: m.startedAt, paused: m.paused, pos: position(m, now), rev: m.rev, now, duck };
}

const startAt = (m, i, now) => Object.assign(m, { cur: i, startedAt: now, paused: false, pos: 0, rev: m.rev + 1 });

// szám hozzáadása a lista végére; ha üres volt a lista, azonnal indul
function add(m, v, title, nick, now) {
  if (!VIDEO_RE.test(v || '')) return 'Ez nem YouTube- vagy YouTube Music-számlink.';
  if (m.queue.length >= MAX_QUEUE) return `A lista megtelt (legfeljebb ${MAX_QUEUE} szám).`;
  if (m.queue.some((x) => x.v === v)) return 'Ez a szám már a listán van.';
  m.queue.push({ id: ++m.seq, v, title: cleanTitle(title) || 'YouTube-szám', by: nick, at: now });
  if (m.queue.length === 1) startAt(m, 0, now); else m.rev++;
  return null;
}

// szám kivétele; ha épp az szólt, a következő indul
function remove(m, id, now) {
  const i = m.queue.findIndex((x) => x.id === id);
  if (i < 0) return 'Ez a szám már nincs a listán.';
  m.queue.splice(i, 1);
  if (!m.queue.length) { Object.assign(m, { cur: 0, startedAt: 0, paused: false, pos: 0, rev: m.rev + 1 }); return null; }
  if (i < m.cur) { m.cur--; m.rev++; }
  else if (i === m.cur) startAt(m, m.cur % m.queue.length, now);
  else m.rev++;
  return null;
}

// egy kliens jelenti, hogy a szám véget ért (vagy nem játszható): a következő indul.
// Csak az a jelentés számít, amelyik a jelenlegi rev-re vonatkozik: így többen jelentve is csak egyszer lép.
function ended(m, rev, now) {
  if (!m.queue.length || rev !== m.rev) return false;
  startAt(m, (m.cur + 1) % m.queue.length, now);
  return true;
}

// következő / előző (körbeér), illetve egy adott szám indítása
function skip(m, dir, now) {
  if (!m.queue.length) return 'Még üres a lista.';
  if (dir !== 1 && dir !== -1) return 'Ismeretlen lépés.';
  startAt(m, ((m.cur + dir) % m.queue.length + m.queue.length) % m.queue.length, now);
  return null;
}
function play(m, id, now) {
  const i = m.queue.findIndex((x) => x.id === id);
  if (i < 0) return 'Ez a szám már nincs a listán.';
  startAt(m, i, now);
  return null;
}
function setPaused(m, paused, now) {
  if (!m.queue.length) return 'Még üres a lista.';
  if (paused === m.paused) return null;
  if (paused) { m.pos = position(m, now); m.paused = true; }
  else { m.startedAt = now - m.pos; m.paused = false; }
  m.rev++;
  return null;
}

// a szám címe és beágyazhatósága a YouTube oEmbedjéből (kulcs nélkül). Hálózati hibánál elfogadjuk, cím nélkül.
async function info(v, fetchImpl = globalThis.fetch) {
  if (process.env.MUSIC_OEMBED === '0' || !fetchImpl) return { ok: true, title: '' };
  try {
    const r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + v)}`, { signal: AbortSignal.timeout(4000) });
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'Ennél a számnál a beágyazás le van tiltva, válassz másikat.' };
    if (r.status === 404 || r.status === 400) return { ok: false, error: 'Ez a szám nem érhető el (privát vagy törölt).' };
    if (!r.ok) return { ok: true, title: '' };
    const j = await r.json();
    return { ok: true, title: cleanTitle(j.title) };
  } catch { return { ok: true, title: '' }; }
}

// ajtóesemény -> halkítás. rt: futásidejű (nem mentett) állapot. Visszaadja a kliensek felé küldendő üzenetet.
function onDoor(rt, state, now) {
  if (state === 'open') { rt.open = true; rt.since = now; return { t: 'music-duck', on: true }; }
  if (state === 'closed') { rt.open = false; return { t: 'music-duck', on: false }; }
  return null;
}
const duckActive = (rt, now) => !!rt.open && now - rt.since < DUCK_MAX_MS;

module.exports = { parse, empty, sanitize, position, view, add, remove, ended, skip, play, setPaused, info, onDoor, duckActive, MAX_QUEUE };
