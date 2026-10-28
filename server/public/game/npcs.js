// Gyalogosok: a város mosómedvékből áll. Járdán sétálnak (a háztömbök gyűrűjén, a zebrán átkelnek), csoportban beszélgetnek, a parkban és a
// parton ülnek; lövésre menekülnek, az autó elüti őket; a halottból pénz marad. Itt van a körözési szint (csillagok) és a gyalogos rendőrök is.
import { G } from './core.js';
import { raccoon } from './player.js';
const THREE = G.THREE, P = () => G.player;
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const TINTS = [0xffffff, 0xd8c0a0, 0xc09878, 0xb0a098, 0xe8d8c8, 0xb8a8c0, 0xa8bcaa, 0xd8a898, 0xc8b070, 0x98a8c8];
const N_NPC = 30, N_COP = 10, ACTIVE_R = 120, FAR_R = 145, HP = 40;
const blocks = () => G.world.blocks || [];
G.npcs = [];
const pool = [], cops = [];
let T = 0;

// ---------- a járda-gyűrű: a háztömb szélétől l méterre befelé, a sarkok 0..3 sorrendben körbe ----------
const CORNER = [[0, 0], [1, 0], [1, 1], [0, 1]];
const cornerPt = (b, i, l) => { const [sx, sz] = CORNER[i]; return [sx ? b.x1 - l : b.x0 + l, sz ? b.z1 - l : b.z0 + l]; };
const blockAt = (i, j) => blocks().find((b) => b.i === i && b.j === j);
function snap(n) {   // a legközelebbi háztömb legközelebbi sarkához kötjük (menekülés vagy ütés után)
  let best = 1e9, bb = null, bi = 0;
  for (const b of blocks()) for (let i = 0; i < 4; i++) { const [x, z] = cornerPt(b, i, n.lane), d = Math.hypot(x - n.x, z - n.z); if (d < best) { best = d; bb = b; bi = i; } }
  n.b = bb; n.ci = bi; n.dir = Math.random() < 0.5 ? 1 : -1; n.crossTo = null; [n.tx, n.tz] = cornerPt(bb, bi, n.lane);
}
function placeOnRing(n, b) {
  const e = Math.floor(Math.random() * 4), t = Math.random(), [ax, az] = cornerPt(b, e, n.lane), [bx, bz] = cornerPt(b, (e + 1) & 3, n.lane);
  n.x = ax + (bx - ax) * t; n.z = az + (bz - az) * t; n.b = b; n.dir = Math.random() < 0.5 ? 1 : -1; n.ci = n.dir > 0 ? (e + 1) & 3 : e; n.crossTo = null;
  [n.tx, n.tz] = cornerPt(b, n.ci, n.lane);
}

// ---------- pénz ----------
const billGeo = new THREE.BoxGeometry(0.34, 0.025, 0.18), billMat = new THREE.MeshStandardMaterial({ color: 0x3fbf5a, emissive: 0x145a22, roughness: 0.6 });
const cash = [];
for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(billGeo, billMat); m.visible = false; G.scene.add(m); cash.push({ m, amt: 0, t: 0 }); }
function drop(x, z, y) {
  const c = cash.find((k) => !k.m.visible) || cash[0]; c.amt = Math.round(rnd(5, 40)); c.t = 60; c.y = y + 0.35; c.m.position.set(x, c.y, z); c.m.visible = true;
}

// ---------- körözés ----------
let crimeT = -99, seenT = -99, lastCopSpawn = 0;
function setWanted(n) {
  const p = P(); n = Math.max(0, Math.min(5, n)); if (n === p.wanted) return;
  p.wanted = n; G.hud.stars(n); G.emit('wanted', n); crimeT = T;
  if (n === 0) for (const c of cops) if (c.active) deactivate(c);
}
const crime = (min) => { crimeT = T; if (P().wanted < min) setWanted(min); };
G.on('wanted', (n) => { if (n === 0) for (const c of cops) if (c.active) deactivate(c); G.hud.stars(n); });
G.setWanted = setWanted; G.crime = crime;

// ---------- egy gyalogos (civil vagy rendőr) ----------
function make(cop, i) {
  const av = raccoon(cop ? 0x7a96ff : TINTS[i % TINTS.length]); if (!G.rk) G.measureK?.(av);
  const mats = []; av.inner.traverse((o) => { if (o.isMesh) mats.push(o.material); });
  const n = { obj: av.root, av, cop, mats, active: false, dead: false, isNpc: true, reach: 3, x: 0, z: 0, y: 0, ry: rnd(0, 6.28), hp: HP, state: 'walk', st: 0, lane: rnd(0.9, 2.6), speed: rnd(1.3, 1.9),
    kx: 0, kz: 0, ky: 0, vy: 0, fl: 0, deadT: 0, cd: 0, stuck: 0, flashT: 0, head: av.inner.getObjectByName('head') };
  n.hit = (dmg, pt, from) => hit(n, dmg, pt, from);
  av.root.visible = false; G.targets.push(n);
  if (cop) {
    n.cap = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x2a50c0, roughness: 0.7 }), top = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.09, 12), m), vis = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 0.1), m);
    top.position.y = 0.045; vis.position.set(0, 0.012, 0.14);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), new THREE.MeshBasicMaterial({ color: 0xffd23a })); badge.position.set(0, 0.05, 0.13);
    n.cap.add(top, vis, badge); n.cap.visible = false; G.scene.add(n.cap);
  }
  return n;
}
function activate(n) {
  n.active = true; n.dead = false; n.hp = HP; n.state = 'walk'; n.fl = 0; n.kx = n.kz = n.ky = n.vy = 0; n.y = G.groundAt(n.x, n.z); n.deadT = 0; n.stuck = 0;
  for (const m of n.mats) { m.transparent = false; m.opacity = 1; }
  n.av.root.visible = true; n.av.root.rotation.set(0, n.ry, 0); n.av.cur = ''; n.av.play('idle'); n.cd = rnd(0.5, 1.5);
  if (n.cap) n.cap.visible = true;
  if (n.cop) ensureGun(n);
}
function deactivate(n) {
  n.active = false; n.av.root.visible = false; if (n.cap) n.cap.visible = false; if (n.gun) n.gun.visible = false;
}
function ensureGun(n) {
  if (n.gun || !G.makeGun) return;
  const k = G.rk || 1, g = G.makeGun('pistol', k); if (!g) return;
  n.gun = new THREE.Group(); n.gun.add(g); n.flash = G.fx.muzzleFlash(); n.flash.position.set(0, 0.02 * k, g.userData.tip + 0.05); n.flash.scale.setScalar(k); g.add(n.flash); G.scene.add(n.gun);
}
function die(n, from) {
  n.dead = true; n.state = 'dead'; n.deadT = 0; n.av.play('lie'); drop(n.x, n.z, n.y);
  if (from === 'player' || from === 'playerCar') { crime(0); setWanted(P().wanted + (n.cop ? 2 : 1)); }
  if (n.gun) n.gun.visible = false;
  if (n.cap) n.cap.visible = false;
}
function hit(n, dmg, pt, from) {
  if (!n.active || n.dead) return;
  n.hp -= dmg; n.fl = 0.25; G.sound('hit', 0.5);
  if (n.hp <= 0) { die(n, from); return; }
  if (from === 'player') crime(1);
  if (!n.cop) { n.state = 'flee'; n.st = rnd(6, 9); n.fx = P().x; n.fz = P().z; }
}
function panic(x, z, r) {
  for (const n of pool) {
    if (!n.active || n.dead || n.state === 'flee' || n.state === 'stumble') continue;
    if (Math.hypot(n.x - x, n.z - z) < r) { n.state = 'flee'; n.st = rnd(5, 9); n.fx = x + rnd(-2, 2); n.fz = z + rnd(-2, 2); }
  }
}
G.on('shot', (e) => {
  if (!e.player) return;
  panic(e.x, e.z, 30);
  for (const n of pool) if (n.active && !n.dead && Math.hypot(n.x - e.x, n.z - e.z) < 30) { crime(1); break; }
});
G.on('carSweep', ({ x, z, r, speed, car }) => {
  const mine = car && car === P().inCar;
  for (const n of pool.concat(cops)) {
    if (!n.active || n.dead) continue;
    const dx = n.x - x, dz = n.z - z, d = Math.hypot(dx, dz); if (d > r + 0.4) continue;
    const k = Math.min(9, 2 + speed * 0.5) / Math.max(d, 0.1); n.kx = dx * k; n.kz = dz * k; n.vy = 2 + speed * 0.15;
    if (speed > 10) { n.hp = 0; die(n, mine ? 'playerCar' : 'car'); n.deadT = 0; }
    else { n.fl = 0.5; n.state = 'stumble'; n.st = 0.9; n.hp -= 10; if (n.hp <= 0) die(n, mine ? 'playerCar' : 'car'); else if (mine) crime(1); }
  }
});

// ---------- mozgás ----------
const hd = new THREE.Vector3(), hv = new THREE.Vector3();
function move(n, ux, uz, sp, dt) {
  const nx = n.x + ux * sp * dt, nz = n.z + uz * sp * dt, c = G.collide(nx, nz, 0.32, n.y);
  const got = Math.hypot(c.x - n.x, c.z - n.z); n.stuck = got < sp * dt * 0.3 ? n.stuck + dt : Math.max(0, n.stuck - dt);
  n.x = c.x; n.z = c.z;
}
function face(n, ang, dt, rate = 10) { const d = ((ang - n.ry + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; n.ry += d * Math.min(1, dt * rate); }
function arrive(n) {
  if (n.crossTo) { const c = n.crossTo; n.b = c.b; n.ci = c.ci; n.crossTo = null; n.dir = Math.random() < 0.5 ? 1 : -1; n.ci = (n.ci + n.dir) & 3; [n.tx, n.tz] = cornerPt(n.b, n.ci, n.lane); return; }
  const r = Math.random();
  if (r < 0.2) {   // zebra: a sarokból át az útra, a szomszéd háztömb megfelelő sarkához
    const [sx, sz] = CORNER[n.ci], alongX = Math.random() < 0.5;
    const nb = alongX ? blockAt(n.b.i + (sx ? 1 : -1), n.b.j) : blockAt(n.b.i, n.b.j + (sz ? 1 : -1));
    if (nb) {
      const ci = CORNER.findIndex(([a, b]) => (alongX ? a === 1 - sx && b === sz : a === sx && b === 1 - sz));
      n.crossTo = { b: nb, ci }; [n.tx, n.tz] = cornerPt(nb, ci, n.lane); return;
    }
  }
  if (r < 0.28) { n.state = 'idle'; n.st = rnd(3, 7); return; }
  if (r < 0.31) n.dir = -n.dir;
  n.ci = (n.ci + n.dir) & 3; [n.tx, n.tz] = cornerPt(n.b, n.ci, n.lane);
}
function updateCivil(n, dt) {
  const p = P();
  if (n.state === 'sit') { n.av.play('sit_ground'); return; }
  if (n.state === 'idle' || n.state === 'chat') {
    n.av.play('idle'); n.st -= dt;
    if (n.state === 'chat' && n.mate?.active) face(n, Math.atan2(n.mate.x - n.x, n.mate.z - n.z), dt);
    if (n.st <= 0) { n.state = 'walk'; n.mate = null; if (!n.b) snap(n); }
    return;
  }
  if (n.state === 'stumble') { n.st -= dt; n.av.play('idle'); if (n.st <= 0) { n.state = 'flee'; n.st = 5; n.fx = n.x - n.kx; n.fz = n.z - n.kz; } return; }
  if (n.state === 'flee') {
    let dx = n.x - n.fx, dz = n.z - n.fz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    if (n.stuck > 0.4) { const t = dx; dx = -dz; dz = t; }   // falnak ütközve oldalra kerül
    move(n, dx, dz, 6.4, dt); face(n, Math.atan2(dx, dz), dt, 14); n.av.play('run', 1.0);
    if ((n.st -= dt) <= 0) { n.state = 'walk'; snap(n); }
    return;
  }
  // séta a cél felé
  const dx = n.tx - n.x, dz = n.tz - n.z, d = Math.hypot(dx, dz);
  if (d < 0.5) arrive(n);
  else {
    let ux = dx / d, uz = dz / d;
    if (n.stuck > 0.8) { snap(n); n.stuck = 0; }
    move(n, ux, uz, n.speed, dt); face(n, Math.atan2(ux, uz), dt, 8); n.av.play('walk', n.speed / 2.4);
  }
}
const COP_SP = 6.8;
function updateCop(n, dt) {
  const p = P();
  n.cd -= dt;
  if (n.flashT > 0 && (n.flashT -= dt) <= 0 && n.flash) n.flash.visible = false;
  if (n.state === 'stumble') { n.st -= dt; n.av.play('idle'); if (n.st <= 0) n.state = 'chase'; return; }
  const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz) || 1;
  let los = false;
  if (!p.dead && d < 25) { const t = G.rayWalls(n.x, n.y + 0.8 * (G.rk || 1), n.z, dx / d, (p.y + 0.6 * (G.rk || 1) - n.y - 0.8 * (G.rk || 1)) / d, dz / d, d); los = t >= d - 0.3; }
  if (los) seenT = T;
  if (p.dead) { n.av.play('idle'); return; }
  const stop = los ? 11 : 1.5;
  if (d > stop) {
    let ux = dx / d, uz = dz / d; if (n.stuck > 0.3) { const t = ux; ux = -uz * (n.id % 2 ? 1 : -1); uz = t * (n.id % 2 ? 1 : -1); }
    move(n, ux, uz, COP_SP, dt); face(n, Math.atan2(ux, uz), dt, 12); n.av.play('run', COP_SP / 6.5);
  } else { n.av.play('idle'); face(n, Math.atan2(dx, dz), dt, 14); }
  if (los && n.cd <= 0 && n.gun) {
    n.cd = rnd(0.9, 1.5); face(n, Math.atan2(dx, dz), 1, 1); G.sound('shot', 0.45); n.flashT = 0.06; n.flash.visible = true;
    hv.set(n.x, n.y + 0.7 * (G.rk || 1), n.z); hd.set(p.x, p.y + 0.6 * (G.rk || 1), p.z);
    G.fx.tracer(hv, hd); panic(n.x, n.z, 20);
    if (Math.random() < 0.4) { G.damage(Math.round(rnd(6, 10)), 'cop'); G.fx.spark(hd); }
  }
}

// ---------- fő ciklus ----------
const boneP = new THREE.Vector3();
function visuals(n, dt) {
  const r = n.av.root, p = P();
  // függőleges: járda/út, lökés; halál után fekszik
  const g = G.groundAt(n.x, n.z, n.y + 0.5);
  if (n.vy > 0 || n.y > g + 0.02) { n.vy -= 22 * dt; n.y = Math.max(g, n.y + n.vy * dt); if (n.y === g) n.vy = 0; } else n.y += (g - n.y) * Math.min(1, dt * 18);
  if (Math.abs(n.kx) + Math.abs(n.kz) > 0.05) { const c = G.collide(n.x + n.kx * dt * 4, n.z + n.kz * dt * 4, 0.32, n.y); n.x = c.x; n.z = c.z; const f = Math.max(0, 1 - dt * 4); n.kx *= f; n.kz *= f; }
  r.position.set(n.x, n.y + (n.dead ? 0.12 : n.state === 'sit' ? 0.02 : 0), n.z); r.rotation.y = n.ry;
  r.rotation.x = n.dead ? -1.2 : n.fl > 0 ? -0.3 * Math.sin(n.fl / 0.25 * Math.PI * 0.5) : 0;
  if (n.fl > 0) n.fl -= dt;
  if (n.cop && !n.dead) {   // sapka a fejen, pisztoly a mancsban, világ-irányba fordítva
    const K = G.rk || 1;
    n.cap.position.set(n.x, n.y + CAP_Y * K, n.z); n.cap.scale.setScalar(K * 1.7); n.cap.rotation.y = n.ry;
    if (n.gun) {   // pisztoly a jobb kézben, a játékos felé fordítva
      n.gun.visible = true; const ax = P().x - n.x, az = P().z - n.z, ad = Math.hypot(ax, az) || 1;
      n.gun.position.set(n.x - Math.cos(n.ry) * 0.3 * K + Math.sin(n.ry) * 0.34 * K, n.y + 0.55 * K, n.z + Math.sin(n.ry) * 0.3 * K + Math.cos(n.ry) * 0.34 * K);
      n.gun.rotation.set(0, n.ry, 0);
    }
  }
}
const CAP_Y = 1.0;
let spawnAcc = 0, chatAcc = 0, copAcc = 0, id = 0;
function pickBlock(near) {
  const p = P(), ok = blocks().filter((b) => { const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1); return Math.hypot(dx, dz) < near; });
  return ok.length ? pick(ok) : null;
}
function sitSpot() {   // a part vagy a központi park
  const p = P(), W = G.world, parks = W.parks || [];
  const park = parks[0];
  if (park && Math.random() < 0.5 && Math.hypot(park.x0 - p.x, park.z0 - p.z) < 200) { const i = park.inner; return { x: rnd(i.x0 + 6, i.x1 - 6), z: rnd(i.z0 + 6, i.z1 - 6), ry: rnd(0, 6.28) }; }
  if (Math.hypot(380 - p.x, 0) < 200) return { x: rnd(362, 395), z: rnd(-60, 60), ry: Math.PI / 2 + rnd(-0.5, 0.5) };
  return null;
}
function respawn(n, sitters) {
  const p = P();
  for (let k = 0; k < 8; k++) {
    if (n.sitter) { const s = sitSpot(); if (!s) return false; n.x = s.x; n.z = s.z; n.ry = s.ry; n.state = 'sit'; }
    else { const b = pickBlock(ACTIVE_R) || pickBlock(400); if (!b) return false; placeOnRing(n, b); n.state = 'walk'; }
    if (Math.hypot(n.x - p.x, n.z - p.z) < 18 || Math.hypot(n.x - p.x, n.z - p.z) > ACTIVE_R + 10) continue;
    activate(n); if (n.sitter) { n.state = 'sit'; n.av.play('sit_ground'); } return true;
  }
  return false;
}
function spawnCop(n) {
  const p = P();
  for (let k = 0; k < 12; k++) {
    const a = rnd(0, 6.28), r = rnd(30, 50), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, c = G.collide(x, z, 0.5);
    if (Math.hypot(c.x - x, c.z - z) > 0.01) continue;
    n.x = x; n.z = z; n.state = 'chase'; activate(n); n.state = 'chase'; return true;
  }
  return false;
}

G.on('update', (dt) => {
  T += dt; const p = P();
  // pénz: forgó, lebegő bankó; ráállva a játékosé
  for (const c of cash) {
    if (!c.m.visible) continue;
    c.t -= dt; c.m.rotation.y += dt * 3; c.m.position.y = c.y + Math.sin(T * 3 + c.amt) * 0.05;
    if (c.t <= 0) { c.m.visible = false; continue; }
    if (!p.inCar && !p.dead && Math.hypot(c.m.position.x - p.x, c.m.position.z - p.z) < 1.1) { p.money += c.amt; G.hud.money(); G.sound('cash'); G.hud.toast(`+$${c.amt}`, 900); c.m.visible = false; }
  }
  // gyalogosok
  G.npcs.length = 0;
  for (const n of pool.concat(cops)) {
    if (!n.active) continue;
    const dd = Math.hypot(n.x - p.x, n.z - p.z);
    if (n.dead) {
      n.deadT += dt;
      if (n.deadT > 28) { const o = Math.max(0, 1 - (n.deadT - 28) / 2); for (const m of n.mats) { m.transparent = true; m.opacity = o; } }
      if (n.deadT > 30) { deactivate(n); continue; }
    } else if (n.cop) updateCop(n, dt); else updateCivil(n, dt);
    visuals(n, dt);
    if (dd < 100) n.av.mixer.update(dt);
    G.npcs.push(n);
  }
  // utánpótlás: akit messze hagytunk, azt a játékos közelében újra elhelyezzük
  spawnAcc += dt;
  if (spawnAcc > 0.4) {
    spawnAcc = 0; let did = 0;
    for (const n of pool) {
      if (did >= 3) break;
      if (n.active && !n.dead && Math.hypot(n.x - p.x, n.z - p.z) > FAR_R) deactivate(n);
      if (!n.active && respawn(n)) did++;
    }
  }
  // beszélgetés: két közeli járókelő megáll és egymásra néz
  chatAcc += dt;
  if (chatAcc > 0.5) {
    chatAcc = 0;
    for (const a of pool) {
      if (!a.active || a.dead || a.state !== 'walk' || a.cop) continue;
      for (const b of pool) if (b !== a && b.active && !b.dead && b.state === 'walk' && Math.hypot(a.x - b.x, a.z - b.z) < 1.6 && Math.random() < 0.3) {
        a.state = b.state = 'chat'; a.st = b.st = rnd(5, 10); a.mate = b; b.mate = a; break;
      }
    }
  }
  // rendőrök: a körözési szint kétszerese, legfeljebb N_COP
  copAcc += dt;
  if (p.wanted > 0 && copAcc > 1.5 && !p.dead) {
    copAcc = 0; const want = Math.min(N_COP, p.wanted * 2); let alive = cops.filter((c) => c.active && !c.dead).length;
    for (const c of cops) { if (alive >= want) break; if (!c.active) { if (spawnCop(c)) alive++; } }
  }
  // a csillagok fogynak: 25 s bűntett és rendőr-látás nélkül
  if (p.wanted > 0 && T - Math.max(crimeT, seenT) > 25) { setWanted(p.wanted - 1); crimeT = T; }
});

export function init() {
  for (let i = 0; i < N_NPC; i++) { const n = make(false, i); n.id = id++; n.sitter = i >= N_NPC - 5; pool.push(n); }
  for (let i = 0; i < N_COP; i++) { const c = make(true, i); c.id = id++; cops.push(c); }
  G.npcPool = pool; G.copPool = cops;
  return Promise.resolve();
}
