// Autók (Kenney Car Kit, CC0): leparkolt kocsik, vezetés (arcade), forgalom a rácson, rendőrség, robbanás.
// Nincs fizikamotor: minden autó egy pont + irány + sebességvektor, az ütközés körökkel (G.collide) és autó-autó körpárokkal megy.
import { G } from './core.js';
const THREE = G.THREE;

const KINDS = ['taxi', 'police', 'sedan', 'sedan-sports', 'suv', 'van', 'hatchback-sports', 'ambulance', 'delivery', 'suv-luxury'];
const CIVIL = KINDS.filter((k) => k !== 'police');
const NAMES = { taxi: 'Taxi', police: 'Rendőrautó', sedan: 'Szedán', 'sedan-sports': 'Sportszedán', suv: 'SUV', van: 'Furgon', 'hatchback-sports': 'Sport kisautó', ambulance: 'Mentő', delivery: 'Szállító', 'suv-luxury': 'Luxus SUV' };
const K = 1.6;                    // a Kenney-modell 2,75 m hosszú: így lesz ~4,4 m
const LANE = 2.7, PARK = 4.6;     // a jobb sáv közepe és a leparkolt autók közepe az út tengelyétől (az aszfalt fél-szélessége 5,5)
const CIR = [-1.3, 0, 1.3], CR = 0.95;   // három ütköző kör az autó hossza mentén
const MAXV = 32, WHEEL_R = 0.48, WB = 2.8;
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];   // kelet, dél, nyugat, észak (a jobbra fordulás: d+1)
const models = {}, cars = [];
let R, XS, ZS, P, police = 0, wantedN = 0, spawnCd = 0, lastMouse = 0, ready = false;
const rnd = (() => { let s = 777; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();   // fix mag: ugyanaz a város minden indításnál
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- részecskék: füst és tűzgömb (sprite-készlet, nincs futás közbeni foglalás) ----------
function blob(rgb) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.5, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const parts = [];
let texSmoke, texFire, boomLight;
function initFx() {
  texSmoke = blob('70,70,74'); texFire = blob('255,170,60');
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSmoke, transparent: true, depthWrite: false, fog: true }));
    s.visible = false; G.scene.add(s); parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 1, o: 1, fire: false, size: 1 });
  }
  boomLight = new THREE.PointLight(0xff8a30, 0, 45, 2); boomLight.position.set(0, -50, 0); G.scene.add(boomLight);   // egy előre felvett fény: nem fordít újra shadert
}
function puff(x, y, z, fire, size, life, vy = 2, vx = 0, vz = 0, o = 0.8) {
  const p = parts.find((q) => q.life <= 0); if (!p) return;
  p.s.material.map = fire ? texFire : texSmoke;
  p.s.position.set(x, y, z); p.s.scale.setScalar(size); p.s.visible = true; p.life = p.max = life; p.vx = vx; p.vy = vy; p.vz = vz; p.g = fire ? 4 : 1.6; p.o = o; p.fire = fire; p.size = size;
}
function updFx(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
    const k = 1 - p.life / p.max;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    p.s.scale.setScalar(p.size * (1 + k * p.g)); p.s.material.opacity = p.o * (p.fire ? 1 - k * k : (1 - k) * Math.min(1, k * 8));
  }
  if (boomLight.intensity > 0) { boomLight.intensity = Math.max(0, boomLight.intensity - dt * 1400); if (boomLight.intensity === 0) boomLight.position.y = -50; }
}

// ---------- hang: halk motor, az autó sebességéből ----------
let eng = null;
function engine(on, v) {
  try {
    if (!eng) {
      if (!on) return;
      const ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(ac.destination); o.start(); eng = { ac, o, g };
    }
    const t = eng.ac.currentTime; eng.o.frequency.setTargetAtTime(48 + Math.abs(v) * 3.2, t, 0.08); eng.g.gain.setTargetAtTime(on ? 0.025 : 0, t, 0.1);
  } catch {}
}

// ---------- autó létrehozása ----------
function makeCar(kind, x, z, ry, o = {}) {
  const g = new THREE.Group(), tilt = new THREE.Group(), m = models[kind].scene.clone(true);
  m.scale.setScalar(K); m.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  tilt.add(m); g.add(tilt); g.position.set(x, 0, z); g.rotation.y = ry; G.scene.add(g);
  const wh = (n) => { const w = m.getObjectByName(n); if (w) w.rotation.order = 'YXZ'; return w; };
  const car = {
    g, tilt, kind, x, z, ry, vx: 0, vz: 0, v: 0, lat: 0, hp: kind === 'police' ? 150 : 100, police: kind === 'police', driven: false, idle: !!o.idle, dead: false, ai: !!o.ai, fleeing: false,
    wheels: ['wheel-front-right', 'wheel-front-left', 'wheel-back-left', 'wheel-back-right'].map(wh), spin: 0, steer: 0, st: 0, stIn: 0, thr: 0, hb: false, max: o.max || 12,
    ni: 0, nj: 0, dir: 0, turn: 's', tnd: 0, blocked: 0, ghost: 0, stuck: 0, rev: 0, bumpCd: 0, smokeT: 0, burn: 0, mode: 'grid', cc: new Float32Array(6), leaving: 0,
  };
  if (car.police) {
    const top = new THREE.Box3().setFromObject(m).max.y + 0.06;
    car.lights = [0xff2020, 0x2060ff].map((c, i) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.2), new THREE.MeshBasicMaterial({ color: c })); l.position.set(i ? 0.35 : -0.35, top, 0); g.add(l); return l; });
  }
  car.tgt = { obj: g, hit: (dmg, pt, from) => hitCar(car, dmg, from) };
  G.targets.push(car.tgt);
  // beszállás / kiszállás: egy pont az autó közepén, elég nagy sugárral (a legközelebbi nyer)
  G.interact.push({
    _car: car, get x() { return car.x; }, get z() { return car.z; }, r: 3.4,
    when: () => !car.dead && (P.inCar === car || (!P.inCar && !P.dead && Math.abs(car.v) < 4)),
    label: () => (P.inCar === car ? 'Kiszállás' : 'Beszállás: ' + NAMES[kind]), act: () => (P.inCar === car ? exitCar(car) : enterCar(car)),
  });
  cars.push(car); setCC(car); return car;
}
function setCC(c) {
  const s = Math.sin(c.ry), co = Math.cos(c.ry);
  for (let i = 0; i < 3; i++) { c.cc[i * 2] = c.x + s * CIR[i]; c.cc[i * 2 + 1] = c.z + co * CIR[i]; }
}

// ---------- beszállás, kiszállás ----------
function enterCar(car) {
  if (P.inCar || car.dead) return;
  car.driven = true; car.ai = false; car.idle = false; car.mode = 'driven'; car.fleeing = false; P.inCar = car; P.hide(true); P.speed = 0; G.sound('door', 0.8);
  G.camTarget = { x: car.x, y: 0.2, z: car.z, dist: 8, h: 1.8 }; G.nearest = null;
  G.hud.toast('WASD vezetés · Szóköz kézifék · E kiszállás', 3500);
}
function exitCar(car) {
  if (P.inCar !== car) return;
  const s = Math.sin(car.ry), co = Math.cos(car.ry), lx = co, lz = -s;   // bal oldal (vezető)
  const cand = [[lx * 2.2, lz * 2.2], [-lx * 2.2, -lz * 2.2], [-s * 3.4, -co * 3.4], [s * 3.4, co * 3.4], [lx * 3.2, lz * 3.2]];
  let px = car.x + cand[0][0], pz = car.z + cand[0][1];
  for (const [ox, oz] of cand) {
    const tx = car.x + ox, tz = car.z + oz, c = G.collide(tx, tz, 0.45);
    if (Math.hypot(c.x - tx, c.z - tz) < 0.08 && G.groundAt(tx, tz, 0) === 0) { px = tx; pz = tz; break; }
  }
  P.x = px; P.z = pz; P.y = 0; P.vy = 0; P.ry = car.ry; P.inCar = null; P.hide(false); G.camTarget = null; car.driven = false; car.mode = 'inert'; car.thr = 0; car.hb = true;
  G.nearest = null; engine(false, 0); G.sound('door', 0.8);
}
G.on('forceExit', () => { if (P.inCar) exitCar(P.inCar); });

// ---------- sérülés, robbanás ----------
function stopDriver(c) { if (c.ai && !c.police) { c.ai = false; c.fleeing = true; c.mode = 'inert'; } }
function hitCar(car, dmg) {
  if (car.dead) return;
  car.hp -= dmg; stopDriver(car);   // a sofőr megáll és elmenekül: az autó üresen áll
  if (car.hp <= 0) explode(car);
}
function explode(car) {
  if (car.dead) return;
  car.dead = true; car.hp = 0; car.ai = false; car.idle = true; car.vx = car.vz = car.v = 0; car.burn = 8;
  const bx = car.x, bz = car.z;
  puff(bx, 1.2, bz, true, 3, 0.6, 3, 0, 0, 1); puff(bx, 1.5, bz, true, 2.2, 0.5, 4, 0, 0, 1);
  for (let i = 0; i < 7; i++) puff(bx, 1.5, bz, i < 3, 1.5 + Math.random(), 0.9 + Math.random() * 1.2, 3 + Math.random() * 4, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.85);
  boomLight.position.set(bx, 3, bz); boomLight.intensity = 900;
  G.sound('boom', 1);
  // kiégett, sötét héj (az anyagot csak itt klónozzuk)
  car.g.traverse((n) => { if (n.isMesh && !n.material.userData.burnt) { n.material = n.material.clone(); n.material.map = null; n.material.color.setHex(0x161514); n.material.userData.burnt = true; n.material.roughness = 1; if (n.material.metalness !== undefined) n.material.metalness = 0; } });
  car.tilt.rotation.z = 0.05;
  if (car.lights) for (const l of car.lights) l.visible = false;
  const tgi = G.targets.indexOf(car.tgt); if (tgi >= 0) G.targets.splice(tgi, 1);
  const wasIn = P.inCar === car;
  if (wasIn) exitCar(car);
  const d = Math.hypot(P.x - bx, P.z - bz);
  if (wasIn) G.damage(45, 'boom'); else if (d < 6) G.damage(Math.round(60 * (1 - d / 6)) + 10, 'boom');
  for (const o of cars) if (o !== car && !o.dead && Math.hypot(o.x - bx, o.z - bz) < 6.5) { o.hp -= 45; stopDriver(o); if (o.hp <= 0) setTimeout(() => explode(o), 220); }
}

// ---------- mozgás: közös arcade-modell a játékosnak és az AI-nak ----------
function drive(c, dt) {
  const f = Math.sin(c.ry), co = Math.cos(c.ry);
  let vf = c.vx * f + c.vz * co, vl = c.vx * co - c.vz * f;   // előre / oldalra
  const mx = c.driven ? MAXV : c.max;
  if (c.thr > 0) { if (vf < mx) vf += c.thr * (vf < 0 ? 34 : 17 * (1 - 0.65 * (vf / mx) ** 2)) * dt; }
  else if (c.thr < 0) { if (vf > 0.6) vf = Math.max(0, vf + c.thr * 30 * dt); else vf = Math.max(-9, vf + c.thr * 11 * dt); }
  else { vf -= Math.sign(vf) * Math.min(Math.abs(vf), (c.driven ? 5 : 2.2) * dt); vf *= Math.exp(-0.18 * dt); }
  if (c.hb) vf *= Math.exp(-(c.driven ? 1.1 : 3) * dt);
  c.st += (c.stIn - c.st) * Math.min(1, dt * (c.driven ? 9 : 6));
  const ang = c.st * 0.58 / (1 + Math.abs(vf) / 9);
  const yaw = (vf * Math.tan(ang) / WB) * (c.hb && c.driven ? 1.7 : 1);
  c.steer = ang; c.ry += yaw * dt;
  const f2 = Math.sin(c.ry), c2 = Math.cos(c.ry);
  // az oldalirányú sebesség a kézifékkel megmarad (csúszás), egyébként gyorsan eltűnik (tapad)
  vl *= Math.exp(-(c.hb ? 1.0 : 7) * dt);
  c.vx = f2 * vf + c2 * vl; c.vz = c2 * vf - f2 * vl;
  c.v = vf; c.lat = vl;
}

function moveCar(c, dt) {
  c.x += c.vx * dt; c.z += c.vz * dt; c.bumpCd -= dt;
  // tenger: a part előtt megáll
  const lim = R.beach - 4; if (c.x > lim) { c.x = lim; if (c.vx > 0) { impact(c, c.vx); c.vx *= -0.3; c.vz *= 0.7; } }
  // falak: három kör
  const s = Math.sin(c.ry), co = Math.cos(c.ry);
  let px = 0, pz = 0;
  for (let i = 0; i < 3; i++) {
    const cx = c.x + s * CIR[i], cz = c.z + co * CIR[i], r = G.collide(cx, cz, CR, 0.3);
    px += r.x - cx; pz += r.z - cz;
  }
  const pl = Math.hypot(px, pz);
  if (pl > 1e-4) {
    c.x += px * 0.6; c.z += pz * 0.6;
    const nx = px / pl, nz = pz / pl, vn = c.vx * nx + c.vz * nz;
    if (vn < 0) { impact(c, -vn); c.vx -= 1.3 * vn * nx; c.vz -= 1.3 * vn * nz; c.vx *= 0.92; c.vz *= 0.92; c.v = c.vx * s + c.vz * co; }
  }
}
function impact(c, sp) {
  if (sp < 4 || c.bumpCd > 0) return;
  c.bumpCd = 0.25; c.hp -= (sp - 3) * 2.2;
  if (c.driven) { G.sound('hit', clamp(sp / 15, 0.3, 1)); if (sp > 9) G.damage((sp - 8) * 0.9, 'car'); }
  if (c.hp <= 0) explode(c);
}

// ---------- AI: rács-navigáció ----------
const nodeOK = (i, j) => i >= 0 && i < XS.length && j >= 0 && j < ZS.length;
function pickTurn(c) {
  const d = c.dir, opts = [];
  for (const [t, nd, w] of [['s', d, 0.5], ['r', (d + 1) & 3, 0.25], ['l', (d + 3) & 3, 0.25]]) {
    const ni = c.ni + DX[nd], nj = c.nj + DZ[nd];
    if (nodeOK(ni, nj)) opts.push({ t, nd, ni, nj, w });
  }
  if (!opts.length) { c.turn = 'u'; return; }
  let o;
  if (c.police && c.mode === 'grid' && !c.leaving) {   // üldözés: amelyik szomszéd csomópont közelebb van a játékoshoz
    let b = 1e9; for (const q of opts) { const dd = Math.hypot(XS[q.ni] - P.x, ZS[q.nj] - P.z) + Math.random() * 25; if (dd < b) { b = dd; o = q; } }
  } else { let r = Math.random() * opts.reduce((a, q) => a + q.w, 0); for (const q of opts) { r -= q.w; if (r <= 0) { o = q; break; } } o ||= opts[0]; }
  c.turn = o.t; c.tnd = o.nd;
}
// a következő csomópont és az irány az autó helyzetéből (üldözés után újra a rácsra állás)
function initNav(c) {
  const f = Math.sin(c.ry), co = Math.cos(c.ry);
  let d = 0, b = -9; for (let i = 0; i < 4; i++) { const q = f * DX[i] + co * DZ[i]; if (q > b) { b = q; d = i; } }
  const near = (arr, v) => { let k = 0, bd = 1e9; arr.forEach((a, i) => { if (Math.abs(a - v) < bd) { bd = Math.abs(a - v); k = i; } }); return k; };
  const ahead = (arr, v, s) => { if (s > 0) { for (let i = 0; i < arr.length; i++) if (arr[i] - v > 0.5) return i; } else { for (let i = arr.length - 1; i >= 0; i--) if (v - arr[i] > 0.5) return i; } return -1; };
  for (let tr = 0; tr < 2; tr++) {
    const rx = -DZ[d], rz = DX[d];
    if (d & 1) { c.ni = near(XS, c.x - rx * LANE); c.nj = ahead(ZS, c.z, DZ[d]); } else { c.nj = near(ZS, c.z - rz * LANE); c.ni = ahead(XS, c.x, DX[d]); }
    if (c.ni >= 0 && c.nj >= 0) break;
    d = (d + 2) & 3;   // a rács szélén túl: fordulj meg
  }
  c.ni = Math.max(0, c.ni); c.nj = Math.max(0, c.nj); c.dir = d; pickTurn(c);
}
const SW = { s: 0, r: 4.5, l: -1.5, u: 0 };
// beállítja a c.stIn értéket a sávkövetésből, visszaadja a cél-sebességet
function navStep(c, cruise) {
  for (let guard = 0; guard < 3; guard++) {
    const d = c.dir, rem = (XS[c.ni] - c.x) * DX[d] + (ZS[c.nj] - c.z) * DZ[d];
    if (rem >= SW[c.turn]) break;
    if (c.turn === 'u') { c.ni -= DX[d]; c.nj -= DZ[d]; c.dir = (d + 2) & 3; }   // zsákutca: vissza az előző csomópont felé
    else { c.dir = c.tnd; c.ni += DX[c.tnd]; c.nj += DZ[c.tnd]; }
    c.ni = clamp(c.ni, 0, XS.length - 1); c.nj = clamp(c.nj, 0, ZS.length - 1); pickTurn(c);
  }
  const d = c.dir, rem = (XS[c.ni] - c.x) * DX[d] + (ZS[c.nj] - c.z) * DZ[d], rx = -DZ[d], rz = DX[d], L = 7;
  let tx, tz;
  if (d & 1) { tx = XS[c.ni] + rx * LANE; tz = c.z + DZ[d] * L; } else { tz = ZS[c.nj] + rz * LANE; tx = c.x + DX[d] * L; }
  const err = wrap(Math.atan2(tx - c.x, tz - c.z) - c.ry);
  c.stIn = clamp(err * 2.2, -1, 1);
  let tv = cruise * (1 - Math.min(0.55, Math.abs(err)));
  if (c.turn !== 's' && rem < 22) tv = Math.min(tv, 7);
  return tv;
}
// az előttünk álló autó vagy gyalogos játékos: a megengedett sebesség
function lookAhead(c, tv) {
  if (c.ghost > 0) return tv;
  const f = Math.sin(c.ry), co = Math.cos(c.ry);
  let best = tv;
  const chk = (ox, oz) => {
    const rx = ox - c.x, rz = oz - c.z, a = rx * f + rz * co, l = rx * co - rz * f;
    if (a > 0 && a < 18 && Math.abs(l) < 2.4) best = Math.min(best, a < 6.5 ? 0 : (a - 6.5) * 0.9);
  };
  for (const o of cars) if (o !== c) chk(o.x, o.z);
  if (!P.inCar && !P.dead) chk(P.x, P.z);
  return best;
}
function speedCtl(c, tv, dt) {
  const tv2 = lookAhead(c, tv);
  if (tv2 < 0.5 && Math.abs(c.v) < 0.8) { c.blocked += dt; if (c.blocked > 5) { c.ghost = 3; c.blocked = 0; } } else c.blocked = 0;
  if (c.ghost > 0) c.ghost -= dt;
  c.thr = clamp((tv2 - c.v) * 0.7, -1, 1); c.hb = false;
}
function policeAI(c, dt) {
  const dx = P.x - c.x, dz = P.z - c.z, dist = Math.hypot(dx, dz);
  if (c.leaving) { speedCtl(c, navStep(c, 17), dt); return; }
  if (dist < 45 && c.mode !== 'direct') c.mode = 'direct';
  if (dist > 75 && c.mode === 'direct') { c.mode = 'grid'; initNav(c); }
  if (c.mode === 'grid') { speedCtl(c, navStep(c, 24), dt); return; }
  // közvetlen üldözés: a játékos felé (a mozgását kicsit előre becsülve)
  const lead = P.inCar ? clamp(dist / 30, 0, 1) * 0.6 : 0, tx = P.x + (P.inCar ? P.inCar.vx * lead : 0), tz = P.z + (P.inCar ? P.inCar.vz * lead : 0);
  const err = wrap(Math.atan2(tx - c.x, tz - c.z) - c.ry);
  c.hb = false;
  if (c.rev > 0) { c.rev -= dt; c.thr = -1; c.stIn = -clamp(err * 2, -1, 1); return; }
  c.stIn = clamp(err * 2.4, -1, 1);
  if (!P.inCar && dist < 6) { c.thr = -1; return; }
  c.max = 26; c.thr = Math.abs(err) > 1.9 ? 0.4 : 1;
  if (Math.abs(c.v) < 1.2) { c.stuck += dt; if (c.stuck > 1.1) { c.stuck = 0; c.rev = 1.0; } } else c.stuck = 0;
}

// ---------- autó-autó ütközés (körpárok); az álló autók mozdíthatatlanok ----------
function pairs() {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j], ddx = b.x - a.x, ddz = b.z - a.z;
      if (ddx * ddx + ddz * ddz > 42) continue;
      const ai = a.idle && !a.driven, bi = b.idle && !b.driven;
      if (ai && bi) continue;
      let best = 0, nx = 0, nz = 0;
      for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) {
        const ex = b.cc[q * 2] - a.cc[p * 2], ez = b.cc[q * 2 + 1] - a.cc[p * 2 + 1], d2 = ex * ex + ez * ez;
        if (d2 < 4 * CR * CR && d2 > 1e-6) { const d = Math.sqrt(d2), pen = 2 * CR - d; if (pen > best) { best = pen; nx = ex / d; nz = ez / d; } }
      }
      if (!best) continue;
      const wa = ai ? 0 : bi ? 1 : 0.5, wb = bi ? 0 : ai ? 1 : 0.5;
      a.x -= nx * best * wa; a.z -= nz * best * wa; b.x += nx * best * wb; b.z += nz * best * wb;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;   // negatív: közelednek
      if (rv >= 0) continue;
      const k = 1.25 * -rv;
      if (!ai) { a.vx -= nx * k * wa; a.vz -= nz * k * wa; }
      if (!bi) { b.vx += nx * k * wb; b.vz += nz * k * wb; }
      const sp = -rv;
      if (sp < 3.5) continue;
      for (const [c, o] of [[a, b], [b, a]]) {
        if (c.bumpCd > 0 || (c.idle && !c.driven)) continue;
        c.bumpCd = 0.3;
        if (sp > 5) c.hp -= (sp - 4) * (c.police ? 1.2 : 2);
        if (c.driven) { G.sound('hit', clamp(sp / 14, 0.3, 1)); if (sp > 6) G.damage((sp - 5) * (o.police ? 0.8 : 0.5), 'car'); }
        if (sp > 7) stopDriver(c);   // a lelökött forgalmi autó sofőrje megáll
        if (c.hp <= 0) explode(c);
      }
    }
  }
}

// ---------- frissítés ----------
const sweep = { x: 0, z: 0, r: 2.2, speed: 0, car: null };
let hurtFoot = 0;
function update(dt, t) {
  if (!ready) return;
  const Kk = G.keys, drv = P.inCar;
  for (const c of cars) {
    if (c.dead) { c.burn -= dt; if (c.burn > 0) { c.smokeT -= dt; if (c.smokeT < 0) { c.smokeT = 0.22; puff(c.x, 1.1, c.z, false, 1.4, 2.2, 2.2, 0, 0, 0.55); } } continue; }
    if (c.driven) {
      c.thr = (Kk.KeyW ? 1 : 0) - (Kk.KeyS ? 1 : 0); c.stIn = (Kk.KeyA ? 1 : 0) - (Kk.KeyD ? 1 : 0); c.hb = !!Kk.Space;
      if (P.dead) { c.thr = 0; c.stIn = 0; }
    } else if (c.ai && c.police) policeAI(c, dt);
    else if (c.ai) speedCtl(c, navStep(c, c.max), dt);
    else if (c.mode === 'inert') {   // üresen álló autó: fékez, aztán álló
      c.thr = 0; c.stIn = 0; c.hb = true;
      if (Math.hypot(c.vx, c.vz) < 0.2) { c.vx = c.vz = c.v = 0; c.idle = true; }
    }
    if (c.driven || !c.idle) { drive(c, dt); moveCar(c, dt); }
    setCC(c);
    // megjelenítés
    c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.ry;
    c.tilt.rotation.z += (clamp(c.lat * 0.012 + c.st * c.v * 0.0015, -0.07, 0.07) - c.tilt.rotation.z) * Math.min(1, dt * 8);
    c.tilt.rotation.x += (clamp(-c.thr * (c.v > 0 ? 0.025 : 0.01), -0.04, 0.04) - c.tilt.rotation.x) * Math.min(1, dt * 6);
    c.spin += c.v * dt / WHEEL_R;
    for (let w = 0; w < 4; w++) { const wm = c.wheels[w]; if (!wm) continue; wm.rotation.x = c.spin; wm.rotation.y = w < 2 ? c.steer : 0; }
    if (c.lights) { const on = ((t * 7) | 0) & 1; c.lights[0].visible = !!on; c.lights[1].visible = !on; }
    // füst a sérült motortérből; nagyon sérülten lassan magától kigyullad
    if (c.hp < 35) {
      c.smokeT -= dt;
      if (c.smokeT < 0) { c.smokeT = c.hp < 18 ? 0.09 : 0.2; puff(c.x + Math.sin(c.ry) * 1.6, 1.0, c.z + Math.cos(c.ry) * 1.6, false, 0.9, 1.8, 2.4, 0, 0, c.hp < 18 ? 0.8 : 0.5); }
      if (c.hp < 12 && !c.driven) c.hp -= dt * 2.5;
      if (c.hp <= 0) { explode(c); continue; }
    }
    // gázolás: a gyalogosok modulja ezt hallgatja
    const sp = Math.hypot(c.vx, c.vz);
    if (sp > 3) { sweep.x = c.x + Math.sin(c.ry) * 1.2; sweep.z = c.z + Math.cos(c.ry) * 1.2; sweep.speed = sp; sweep.car = c; G.emit('carSweep', sweep); }
    if (!c.driven && !drv && sp > 6 && !P.dead && hurtFoot <= 0) {
      for (let k = 0; k < 3; k++) if (Math.hypot(c.cc[k * 2] - P.x, c.cc[k * 2 + 1] - P.z) < 1.35) { hurtFoot = 0.8; G.damage(Math.round(sp * 2), 'car'); break; }
    }
  }
  hurtFoot -= dt;
  pairs();
  for (const c of cars) if (!c.idle || c.driven) setCC(c);
  // gyalog játékos: az álló autók nem átjárhatók
  if (!drv && !P.dead) for (const c of cars) {
    if (Math.abs(c.x - P.x) > 5 || Math.abs(c.z - P.z) > 5 || Math.hypot(c.vx, c.vz) > 6) continue;
    for (let k = 0; k < 3; k++) {
      const ex = P.x - c.cc[k * 2], ez = P.z - c.cc[k * 2 + 1], d = Math.hypot(ex, ez), m = CR + 0.25;
      if (d < m && d > 1e-4) { P.x += ex / d * (m - d); P.z += ez / d * (m - d); }
    }
  }
  // játékos az autóban: szinkron, kamera, hang
  if (drv) {
    P.x = drv.x; P.z = drv.z; P.y = 0; P.ry = drv.ry; P.speed = Math.abs(drv.v);
    const cam = G.cam, cur = G.camTarget || (G.camTarget = {});
    cur.x = drv.x; cur.y = 0.2; cur.z = drv.z; cur.dist = 8 + Math.min(3, Math.abs(drv.v) * 0.1); cur.h = 1.8;
    if (G.mouse.dx || G.mouse.dy) lastMouse = t;
    if (t - lastMouse > 1.2 && drv.v > 2.5) cam.yaw += wrap(drv.ry + Math.PI - cam.yaw) * Math.min(1, dt * 2.2);   // a kamera lassan az autó mögé áll
    engine(true, drv.v);
  } else if (eng) engine(false, 0);
  // rendőrség
  spawnCd -= dt;
  if (wantedN > 0 && police < Math.min(wantedN, 5) && spawnCd <= 0 && !P.dead) { spawnCd = 3.5; spawnPolice(); }
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i]; if (!c.police || !c.leaving || c.driven || c.dead) continue;
    c.leaving += dt;
    if (c.leaving > 6 && Math.hypot(c.x - P.x, c.z - P.z) > 130) removeCar(c);
  }
  updFx(dt);
}
function removeCar(c) {
  G.scene.remove(c.g); const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);
  const t = G.targets.indexOf(c.tgt); if (t >= 0) G.targets.splice(t, 1);
  for (let k = G.interact.length - 1; k >= 0; k--) if (G.interact[k]._car === c) G.interact.splice(k, 1);
  if (c.police) police--;
}

// ---------- forgalom és rendőrség létrehozása ----------
function spawnOnGrid(kind, o, minFromPlayer) {
  for (let tries = 0; tries < 60; tries++) {
    const ni = (Math.random() * XS.length) | 0, nj = (Math.random() * ZS.length) | 0, d = (Math.random() * 4) | 0;
    if (!nodeOK(ni - DX[d], nj - DZ[d])) continue;   // a mögöttünk lévő csomópont is kell
    const back = 18 + Math.random() * 30, rx = -DZ[d], rz = DX[d];
    // vízszintes úton a z a sáv, függőlegesen az x
    const px = DX[d] ? XS[ni] - DX[d] * back : XS[ni] + rx * LANE, pz = DX[d] ? ZS[nj] + rz * LANE : ZS[nj] - DZ[d] * back;
    if (Math.hypot(px - P.x, pz - P.z) < minFromPlayer) continue;
    if (cars.some((q) => Math.hypot(q.x - px, q.z - pz) < 9)) continue;
    const c = makeCar(kind, px, pz, Math.atan2(DX[d], DZ[d]), o);
    c.ni = ni; c.nj = nj; c.dir = d; pickTurn(c);
    return c;
  }
  return null;
}
function spawnPolice() {
  const c = spawnOnGrid('police', { ai: true, max: 24 }, 100); if (!c) return;
  c.mode = 'grid'; police++; c.hp = 150;
  G.hud.toast('Rendőrautó a nyomodban!', 1800);
}
G.on('wanted', (n) => {
  wantedN = n | 0;
  if (!wantedN) for (const c of cars) if (c.police && !c.driven && !c.dead && !c.leaving) { c.leaving = 0.01; c.mode = 'grid'; c.max = 17; c.ai = true; initNav(c); }
});

// ---------- leparkolt autók a járdaszegélynél ----------
function parkedCars() {
  const used = [];
  for (let n = 0, guard = 0; n < 14 && guard < 300; guard++) {
    const horiz = rnd() < 0.5, line = horiz ? ZS[(rnd() * ZS.length) | 0] : XS[(rnd() * XS.length) | 0];
    const nodes = horiz ? XS : ZS, seg = (rnd() * (nodes.length - 1)) | 0, along = nodes[seg] + 16 + rnd() * (nodes[seg + 1] - nodes[seg] - 32), side = rnd() < 0.5 ? 1 : -1;
    // a parkolás iránya a forgalom iránya azon az oldalon (jobb sáv): vízszintesen a z+ oldalon kelet felé, a z- oldalon nyugat felé
    const x = horiz ? along : line + (side > 0 ? -PARK : PARK), z = horiz ? line + (side > 0 ? PARK : -PARK) : along;
    const ry = horiz ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    if (used.some((u) => Math.hypot(u[0] - x, u[1] - z) < 7)) continue;
    used.push([x, z]); n++;
    makeCar(CIVIL[(rnd() * CIVIL.length) | 0], x, z, ry, { idle: true }).mode = 'parked';
  }
}

export async function init() {
  P = G.player; R = G.world.roads; XS = R.xs; ZS = R.zs; R.beach = G.world.beach;
  await Promise.all(KINDS.map(async (k) => { models[k] = await G.model(`/game/assets/cars/${k}.glb`); }));
  initFx();
  G.vehicles = cars;   // a minimap olvassa: {x, z, ry, kind, police, driven}
  // az első kocsi a földút végén, a tisztás közelében
  makeCar('sedan-sports', 46, 2.6, Math.PI / 2, { idle: true }).mode = 'parked';
  parkedCars();
  const mix = ['taxi', 'taxi', 'sedan', 'sedan-sports', 'suv', 'van', 'hatchback-sports', 'delivery', 'suv-luxury', 'sedan', 'taxi', 'ambulance', 'suv', 'hatchback-sports'];
  for (const k of mix) spawnOnGrid(k, { ai: true, max: 9 + Math.random() * 5 }, 40);
  G.hooks.update.unshift(update);   // a kamera-frissítés előtt fusson (az autó írja a camTarget-et)
  ready = true;
}
