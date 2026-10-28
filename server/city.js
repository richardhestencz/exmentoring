// Loop City többjátékos: aki a városban van, látja a többieket (gyalog vagy autóban), névvel. A szerver csak továbbít:
// mindenki 10-szer küldi a saját helyét, a szerver 10-szer egy tömör pillanatképet mindenkinek. Az óra csak akkor jár, ha van bent valaki.
// Üzenetek: c-join {nick} -> c-wl {id}; c-st {x,y,z,r,a,c} (a: animáció, c: autó fajtája vagy ''); c-ro: névsor; c-sn: pillanatkép.
const MAX = 32, MSG_PER_S = 40;
const players = new Map();
let nextId = 1, timer = null;
const num = (v, a, b) => (Number.isFinite(+v) ? Math.max(a, Math.min(b, +v)) : a);
const r2 = (v) => Math.round(v * 100) / 100;
const send = (p, m) => { if (p.ws.readyState === 1) p.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const all = (m) => { const s = JSON.stringify(m); for (const p of players.values()) send(p, s); };
const roster = () => all({ t: 'c-ro', l: [...players.values()].map((p) => [p.id, p.nick, p.tint]) });

function handle(ws, raw) {
  const s = String(raw); if (!s.startsWith('{"t":"c-')) return false;
  const now = Date.now();
  if (!ws.cityRate || now - ws.cityRate.t > 1000) ws.cityRate = { t: now, n: 0 };
  if (++ws.cityRate.n > MSG_PER_S) return true;
  let m; try { m = JSON.parse(s); } catch { return true; }
  const p = ws.city;
  if (m.t === 'c-join') {
    if (p) return true;
    if (players.size >= MAX) { ws.send(JSON.stringify({ t: 'c-full' })); return true; }
    const nick = String(m.nick || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Mosómedve';
    const q = { id: nextId++, ws, nick, tint: num(m.tint | 0, 0, 0xffffff), x: 0, y: 0, z: 0, r: 0, a: 0, c: '' };
    players.set(q.id, q); ws.city = q;
    send(q, { t: 'c-wl', id: q.id }); roster();
    if (!timer) timer = setInterval(tick, 100).unref();
    return true;
  }
  if (!p) return true;
  if (m.t === 'c-st') {
    p.x = num(m.x, -200, 2200); p.y = num(m.y, -5, 60); p.z = num(m.z, -400, 400); p.r = num(m.r, -100, 100); p.a = num(m.a | 0, 0, 7);
    p.c = typeof m.c === 'string' ? m.c.replace(/[^a-z-]/g, '').slice(0, 20) : '';
  }
  return true;
}
function leave(ws) {
  const p = ws.city; if (!p) return;
  players.delete(p.id); ws.city = null; all({ t: 'c-lv', id: p.id }); roster();
}
function tick() {
  if (!players.size) { clearInterval(timer); timer = null; return; }
  // [id, x, y, z, irány, animáció, autó]
  const out = JSON.stringify({ t: 'c-sn', p: [...players.values()].map((p) => [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.r), p.a, p.c]) });
  for (const p of players.values()) send(p, out);
}
const count = () => players.size;
module.exports = { handle, leave, count };
