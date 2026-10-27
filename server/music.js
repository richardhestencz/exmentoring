// Közös zene: mindenki ugyanazt a YouTube-lejátszási listát hallgatja, ugyanott tartva.
// Az állapot: {kind: 'playlist'|'video', id, index, startedAt, paused, pos, setBy, rev}.
// Pozíció a számban: lejátszva: now - startedAt, szünetelve: pos. A rev minden változásnál nő (a dupla jelentések kiszűrésére).
const PLAYLIST_RE = /^[A-Za-z0-9_-]{10,64}$/;
const VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;
const BARE_LIST_RE = /^(PL|OLAK5uy_|RD|UU|LL|FL)[A-Za-z0-9_-]{8,}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);
const MAX_LEN = 500;                  // egy lejátszási lista legfeljebb ennyi számát vesszük figyelembe
const DUCK_MAX_MS = 5 * 60 * 1000;    // ha az ajtó "zárt" jele elveszik, ennyi után magától feloldódik a halkítás

// YouTube / YouTube Music / youtu.be link -> {kind, id} vagy null
function parse(input) {
  const s = String(input || '').trim();
  if (!s || s.length > 500) return null;
  if (BARE_LIST_RE.test(s)) return { kind: 'playlist', id: s };
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !HOSTS.has(u.hostname.toLowerCase())) return null;
  const list = u.searchParams.get('list');
  if (list && PLAYLIST_RE.test(list)) return { kind: 'playlist', id: list };
  let v = u.searchParams.get('v');
  if (!v) {
    const parts = u.pathname.split('/').filter(Boolean);
    if (u.hostname.toLowerCase().endsWith('youtu.be')) v = parts[0];
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) v = parts[1];
  }
  if (v && VIDEO_RE.test(v)) return { kind: 'video', id: v };
  return null;
}

const empty = () => ({ kind: '', id: '', index: 0, startedAt: 0, paused: false, pos: 0, setBy: '', rev: 0 });

// a mentett állapot tisztítása indításkor
function sanitize(m) {
  const e = empty();
  if (!m || typeof m !== 'object') return e;
  if ((m.kind === 'playlist' && PLAYLIST_RE.test(m.id)) || (m.kind === 'video' && VIDEO_RE.test(m.id))) {
    Object.assign(e, { kind: m.kind, id: m.id });
    e.index = Number.isInteger(m.index) && m.index >= 0 && m.index < MAX_LEN ? m.index : 0;
    e.startedAt = Number(m.startedAt) || 0; e.paused = !!m.paused; e.pos = Math.max(0, Number(m.pos) || 0);
    e.setBy = String(m.setBy || '').slice(0, 30); e.rev = Number(m.rev) || 0;
  }
  return e;
}

// hol tart a szám (ms)
const position = (m, now) => (m.paused ? m.pos : Math.max(0, now - m.startedAt));

// kliensnek küldött nézet; a pos a kiszámolt pozíció, a now a szerver ideje (óraeltolás kiszámításához)
function view(m, now, duck = false) {
  return { kind: m.kind, id: m.id, index: m.index, startedAt: m.startedAt, paused: m.paused, pos: position(m, now), setBy: m.setBy, rev: m.rev, now, duck };
}

// új forrás beállítása (playlist vagy videó), bárki megteheti
function setSource(m, input, nick, now) {
  const p = parse(input);
  if (!p) return 'Ez nem YouTube vagy YouTube Music playlist-/videólink.';
  Object.assign(m, { kind: p.kind, id: p.id, index: 0, startedAt: now, paused: false, pos: 0, setBy: nick, rev: m.rev + 1 });
  return null;
}
function needSource(m) { return m.kind ? null : 'Még nincs playlist felrakva.'; }

// egy kliens jelenti, hogy a lejátszó a `to` indexű számra lépett (magától vagy hibás szám miatt).
// Csak az a jelentés számít, amelyik a jelenlegi rev-re vonatkozik: így többen jelentve is csak egyszer lép.
function trackChanged(m, rev, to, now) {
  if (!m.kind || rev !== m.rev) return false;
  if (!Number.isInteger(to) || to < 0 || to >= MAX_LEN) return false;
  Object.assign(m, { index: to, startedAt: now, paused: false, pos: 0, rev: m.rev + 1 });
  return true;
}

// következő / előző: len = a lista hossza a kliens szerint (a szerver nem ismeri)
function skip(m, dir, len, now) {
  const e = needSource(m); if (e) return e;
  if (dir !== 1 && dir !== -1) return 'Ismeretlen lépés.';
  len = Number.isInteger(len) && len >= 1 && len <= MAX_LEN ? len : 1;
  const i = ((m.index + dir) % len + len) % len;
  Object.assign(m, { index: i, startedAt: now, paused: false, pos: 0, rev: m.rev + 1 });
  return null;
}
function setPaused(m, paused, now) {
  const e = needSource(m); if (e) return e;
  if (paused === m.paused) return null;
  if (paused) { m.pos = position(m, now); m.paused = true; }
  else { m.startedAt = now - m.pos; m.paused = false; }
  m.rev++;
  return null;
}

// ajtóesemény -> halkítás. rt: futásidejű (nem mentett) állapot. Visszaadja a kliensek felé küldendő üzenetet.
function onDoor(rt, state, now) {
  if (state === 'open') { rt.open = true; rt.since = now; return { t: 'music-duck', on: true }; }
  if (state === 'closed') { rt.open = false; return { t: 'music-duck', on: false }; }
  return null;
}
const duckActive = (rt, now) => !!rt.open && now - rt.since < DUCK_MAX_MS;

module.exports = { parse, empty, sanitize, position, view, setSource, trackChanged, skip, setPaused, onDoor, duckActive, MAX_LEN };
