// Loop City aréna (szerver): a Krunker-szerű lövöldözés állapota. A kliens küldi a helyzetét és a találatait (pilot: kliens-hiteles),
// a szerver viszont maga számolja az életerőt, a sebzést (fegyvertáblából, a kliens száma nem számít), a halált, az újraélesztést és a kört.
// Üzenetek (mind {"t":"a-…"}, 1 KB alatt): a-join, a-st, a-shot, a-hit, a-cls  ->  a-wl, a-sn, a-sc, a-sh, a-dm, a-kl, a-rs, a-ov, a-nw, a-full
const WEAPONS = [{ dmg: 24, gap: 0.22 }, { dmg: 16, gap: 0.075 }, { dmg: 70, gap: 0.8 }];   // pisztoly, gépkarabély, mesterlövész (fejre x2)
const MAX = 12, SPAWNS = 8, ROUND_MS = 5 * 60 * 1000, OVER_MS = 8000, RESPAWN_MS = 3000, PROT_MS = 2000, REGEN_AFTER = 5000, REGEN_PER_S = 30, MSG_PER_S = 90;
const players = new Map();
let nextId = 1;
const round = { start: Date.now(), phase: 'play', overAt: 0 };
const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const r2 = (v) => Math.round(v * 100) / 100;
const send = (p, o) => { if (p.ws.readyState === 1) p.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const all = (o) => { const s = JSON.stringify(o); for (const p of players.values()) send(p, s); };
const board = () => ({ t: 'a-sc', l: [...players.values()].map((p) => [p.id, p.nick, p.k, p.d, p.sc, p.cls]) });
const sp = () => Math.floor(Math.random() * SPAWNS);

function handle(ws, raw) {
  const s = typeof raw === 'string' ? raw : raw.toString('utf8');
  if (!s.startsWith('{"t":"a-')) return false;
  const now = Date.now();
  // a saját keret: a webhely általános 10 üzenet/mp-je kevés egy 15 Hz-es lövöldözéshez
  if (!ws.arenaRate || now - ws.arenaRate.t > 1000) ws.arenaRate = { t: now, n: 0 };
  if (++ws.arenaRate.n > MSG_PER_S) return true;
  let m; try { m = JSON.parse(s); } catch { return true; }
  const p = ws.arena;
  if (m.t === 'a-join') {
    if (p) return true;
    if (players.size >= MAX) { ws.send(JSON.stringify({ t: 'a-full' })); return true; }
    const nick = String(m.nick || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Mosómedve';
    const cls = num(m.cls | 0, 0, 2);
    const q = { id: nextId++, ws, nick, cls, nextCls: cls, hp: 100, k: 0, d: 0, sc: 0, x: 0, y: 0, z: 0, yaw: 0, pit: 0, an: 0, w: cls, dead: false, respawnAt: 0, protUntil: now + PROT_MS, lastDmg: 0, lastHit: 0, lastShot: 0 };
    players.set(q.id, q); ws.arena = q; wake();
    send(q, { t: 'a-wl', id: q.id, sp: sp(), tm: timeLeft(now), ph: round.phase, prot: PROT_MS });
    all(board());
    return true;
  }
  if (!p) return true;
  if (m.t === 'a-st') {
    if (p.dead) return true;
    p.x = num(m.x, -45, 45); p.y = num(m.y, -5, 30); p.z = num(m.z, -45, 45);
    p.yaw = num(m.r, -100, 100); p.pit = num(m.p, -2, 2); p.an = num(m.a | 0, 0, 15); p.w = num(m.w | 0, 0, 2);
  } else if (m.t === 'a-shot') {
    const w = num(m.w | 0, 0, 2);
    if (p.dead || now - p.lastShot < WEAPONS[w].gap * 500) return true;
    p.lastShot = now;
    if (!Array.isArray(m.o) || !Array.isArray(m.d)) return true;
    const out = JSON.stringify({ t: 'a-sh', id: p.id, o: m.o.slice(0, 3).map((v) => r2(num(v, -99, 99))), d: m.d.slice(0, 3).map((v) => r2(num(v, -1, 1))), w });
    for (const q of players.values()) if (q !== p) send(q, out);
  } else if (m.t === 'a-hit') {
    const t = players.get(m.id | 0), w = num(m.w | 0, 0, 2);
    if (!t || t === p || p.dead || t.dead || round.phase !== 'play' || now < t.protUntil) return true;
    if (now - p.lastHit < WEAPONS[w].gap * 600) return true;   // gyorsabban nem lőhet, mint a fegyvere
    if (Math.hypot(t.x - p.x, t.z - p.z) > 140) return true;
    p.lastHit = now;
    const head = m.h ? 1 : 0, dmg = WEAPONS[w].dmg * (head ? 2 : 1);
    t.hp -= dmg; t.lastDmg = now;
    send(t, { t: 'a-dm', hp: Math.max(0, t.hp), id: p.id, fx: r2(p.x), fz: r2(p.z) });
    if (t.hp <= 0) {
      t.dead = true; t.hp = 0; t.respawnAt = now + RESPAWN_MS; t.d++; p.k++; p.sc += 100 + (head ? 50 : 0);
      all({ t: 'a-kl', k: p.id, v: t.id, w, h: head });
      all(board());
    }
  } else if (m.t === 'a-cls') p.nextCls = num(m.cls | 0, 0, 2);
  return true;
}

function leave(ws) {
  const p = ws.arena; if (!p) return;
  players.delete(p.id); ws.arena = null;
  all({ t: 'a-lv', id: p.id }); all(board());
}

const timeLeft = (now) => Math.max(0, round.phase === 'play' ? ROUND_MS - (now - round.start) : OVER_MS - (now - round.overAt));
function tick() {   // 15 Hz, csak amíg van játékos (wake)
  const now = Date.now(), dt = 1 / 15;
  if (!players.size) { round.start = now; round.phase = 'play'; clearInterval(timer); timer = null; return; }
  if (round.phase === 'play' && now - round.start >= ROUND_MS) {
    round.phase = 'over'; round.overAt = now;
    const l = [...players.values()].sort((a, b) => b.sc - a.sc || a.d - b.d);
    all({ t: 'a-ov', w: l[0].nick, l: l.slice(0, 5).map((p) => [p.nick, p.k, p.d, p.sc]) });
  } else if (round.phase === 'over' && now - round.overAt >= OVER_MS) {
    round.phase = 'play'; round.start = now;
    for (const p of players.values()) {
      p.k = p.d = p.sc = 0; p.hp = 100; p.dead = false; p.cls = p.nextCls; p.protUntil = now + PROT_MS;
      send(p, { t: 'a-nw', sp: sp(), cls: p.cls, prot: PROT_MS });
    }
    all(board());
  }
  for (const p of players.values()) {
    if (p.dead) {
      if (round.phase === 'play' && now >= p.respawnAt) {
        p.dead = false; p.hp = 100; p.cls = p.nextCls; p.protUntil = now + PROT_MS;
        send(p, { t: 'a-rs', sp: sp(), cls: p.cls, prot: PROT_MS });
        all(board());
      }
    } else if (p.hp < 100 && now - p.lastDmg > REGEN_AFTER) p.hp = Math.min(100, p.hp + REGEN_PER_S * dt);
  }
  // tömör pillanatkép: [id, x, y, z, yaw, pitch, anim, fegyver, hp, halott]
  const out = JSON.stringify({ t: 'a-sn', tm: timeLeft(now), ph: round.phase, p: [...players.values()].map((p) => [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pit), p.an, p.w, Math.round(p.hp), p.dead ? 1 : 0]) });
  for (const p of players.values()) send(p, out);
}
// az óra csak akkor jár, ha van bent valaki: üres arénánál a szerver nem dolgozik
let timer = null;
const wake = () => { if (!timer) timer = setInterval(tick, 66).unref(); };

module.exports = { handle, leave, count: () => players.size };
