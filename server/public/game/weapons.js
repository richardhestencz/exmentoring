// Fegyverek: Kenney Blaster Kit (CC0) modellek a mosómedve mancsában, hitscan lövés a célkereszten át, torkolattűz, nyomjelző, becsapódás,
// töltés, 1-5 / görgő fegyverváltás, ököl. Mások hívják: G.giveWeapon(id, ammo), G.addAmmo(id, n), G.makeGun(id) (a rendőröknek).
import { G } from './core.js';
const THREE = G.THREE, P = () => G.player;

// slot: az 1-5 billentyű; ammoPrice: egy lövedék ára; mag: tár; rate: lövés/s; spread: szórás (radián, célzottan 40%-a)
export const WEAPONS = G.WEAPONS = {
  fist:   { id: 'fist', slot: 1, name: 'Mancs', price: 0, ammoPrice: 0, dmg: 10, rate: 2, mag: 0, spread: 0, range: 1.4, auto: false, sound: 'hit' },
  pistol: { id: 'pistol', slot: 2, name: 'Pisztoly', price: 150, ammoPrice: 4, dmg: 22, rate: 4.5, mag: 12, spread: 0.012, range: 90, auto: false, sound: 'shot', file: 'b', len: 0.3, dir: -1, reload: 1.1 },
  smg:    { id: 'smg', slot: 3, name: 'Géppisztoly', price: 400, ammoPrice: 3, dmg: 12, rate: 12, mag: 30, spread: 0.032, range: 70, auto: true, sound: 'shot', file: 'h', len: 0.46, dir: -1, reload: 1.5 },
  rifle:  { id: 'rifle', slot: 4, name: 'Gépkarabély', price: 900, ammoPrice: 5, dmg: 20, rate: 9, mag: 30, spread: 0.016, range: 140, auto: true, sound: 'rifle', file: 'd', len: 0.68, dir: -1, reload: 1.8 },
  sniper: { id: 'sniper', slot: 5, name: 'Mesterlövész', price: 1800, ammoPrice: 20, dmg: 95, rate: 0.9, mag: 5, spread: 0.002, range: 320, auto: false, sound: 'rifle', file: 'e', len: 1.1, dir: 1, reload: 2.4 },
};
// a mosómedve valódi (bőrözött) magassága / a névleges 1,3 m: ha a modell nagyobbra rendereli magát, a fegyver, a találati henger és az eltolások vele nőnek
export function measureK(av) {
  if (G.rk) return G.rk;
  let h = 1.3; av.root.updateMatrixWorld(true);
  av.inner.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); const b = o.boundingBox.clone().applyMatrix4(o.matrixWorld); h = Math.max(h * 0 + 0.1, b.max.y - b.min.y); } });
  return (G.rk = Math.max(0.5, h / 1.3));
}
G.measureK = measureK;
const ORDER = ['fist', 'pistol', 'smg', 'rifle', 'sniper'];

// ---------- modellek: a markolat az origóban, a cső a +Z felé (a mosómedve előre-iránya) ----------
const gunCache = {};
const tmpB = new THREE.Box3(), tmpV = new THREE.Vector3();
export function makeGun(id, k0 = 1) {
  const d = WEAPONS[id], src = gunCache[id]; if (!src || !d.file) return null;
  const g = src.clone(true), pivot = new THREE.Group(), wrap = new THREE.Group();
  wrap.add(g); wrap.rotation.y = d.dir < 0 ? Math.PI : 0;   // a Kenney pisztolyok -Z felé néznek, a mesterlövész +Z felé
  pivot.add(wrap);
  pivot.updateMatrixWorld(true);
  tmpB.setFromObject(pivot); const sz = tmpB.getSize(tmpV), k = d.len * k0 / sz.z; wrap.scale.setScalar(k);
  pivot.updateMatrixWorld(true); tmpB.setFromObject(pivot);
  const back = tmpB.min.z, L = tmpB.max.z - back, yc = (tmpB.min.y + tmpB.max.y) / 2, xc = (tmpB.min.x + tmpB.max.x) / 2;
  wrap.position.set(-xc, -yc * 0.6 - tmpB.min.y * 0.4, -(back + L * 0.3));   // a markolat körül (a hátsó 30%-nál) fogja a mancs
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  pivot.userData.tip = L * 0.7 + 0.02 * k0;   // a cső vége a markolattól
  return pivot;
}

// ---------- közös effektek (újrahasznált geometria és anyag) ----------
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const flashGeo = new THREE.PlaneGeometry(0.34, 0.34);
export function muzzleFlash() {   // két keresztbe állított lap, a pivot tip-jére; a hívó időzíti
  const f = new THREE.Group();
  for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(flashGeo, flashMat); m.rotation.z = r; f.add(m); const m2 = new THREE.Mesh(flashGeo, flashMat); m2.rotation.set(0, Math.PI / 2, r); f.add(m2); }
  f.visible = false; return f;
}
const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1), tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const sparkGeo = new THREE.OctahedronGeometry(0.1), sparkMat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const tracers = [], sparks = [];
function fx(pool, geo, mat, n) { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; G.scene.add(m); m.userData.t = 0; pool.push(m); } }
export function tracer(a, b) {
  const m = tracers.find((x) => !x.visible) || tracers[0], d = a.distanceTo(b); if (d < 0.2) return;
  m.position.copy(a).lerp(b, 0.5); m.lookAt(b); m.scale.set(1, 1, d); m.visible = true; m.userData.t = 0.09;
}
export function spark(p) { const m = sparks.find((x) => !x.visible) || sparks[0]; m.position.copy(p); m.scale.setScalar(1); m.visible = true; m.userData.t = 0.22; }

// ---------- játékos-állapot ----------
let gun = null, gunId = null, flash = null, flashT = 0, cd = 0, reloadT = 0, prevL = false, punchT = 0, lean = 0;
const holder = new THREE.Group();   // a fegyver tartója: a mancs helyén, világ-irányba fordítva
const aimDir = new THREE.Vector3(), ro = new THREE.Vector3(), hand = new THREE.Vector3();
const ray = new THREE.Raycaster();

function hudWeapon() {
  const w = P().weapon, el = document.getElementById('weapon'); if (!el) return;
  if (!w) { G.hud.weapon(); return; }
  if (reloadT > 0) el.innerHTML = `<b>${w.name}</b><span>Töltés…</span>`; else G.hud.weapon();
}
function equip(w) {
  const p = P(); p.weapon = w; reloadT = 0; cd = 0;
  if (gun) { holder.remove(gun); gun = null; flash = null; }
  gunId = w ? w.id : null;
  if (w) { gun = makeGun(w.id, measureK(p.av)); if (gun) { holder.add(gun); flash = muzzleFlash(); flash.position.set(0, 0.02 * measureK(p.av), gun.userData.tip + 0.05); flash.scale.setScalar(measureK(p.av)); gun.add(flash); } }
  G.hud.weapon(); G.emit('weapon', w);
}
G.giveWeapon = (id, ammo = 0) => {
  const d = WEAPONS[id], p = P(); if (!d || id === 'fist') return null;
  let w = p.weapons.find((x) => x.id === id);
  if (w) { w.ammo += ammo; }
  else { w = { ...d, mag: Math.min(d.mag, ammo), ammo: Math.max(0, ammo - d.mag) }; p.weapons.push(w); p.weapons.sort((a, b) => a.slot - b.slot); }
  if (!p.weapon) equip(w); else G.hud.weapon();
  return w;
};
G.addAmmo = (id, n) => {
  const w = P().weapons.find((x) => x.id === id); if (!w) return false;
  w.ammo += n; if (w.mag === 0 && w.ammo > 0) { const t = Math.min(w.ammo, w.mag || WEAPONS[id].mag); w.mag += t; w.ammo -= t; }
  G.hud.weapon(); return true;
};
G.makeGun = makeGun; G.fx = { tracer, spark, muzzleFlash };   // a rendőrök is ezeket használják
G.equipSlot = (slot) => {
  const id = ORDER[slot - 1], p = P(); if (!id) return;
  if (id === 'fist') { if (p.weapon) equip(null); return; }
  const w = p.weapons.find((x) => x.id === id);
  if (!w) { G.hud.toast(`Nincs ${WEAPONS[id].name} (a boltban kapható)`, 1400); return; }
  if (p.weapon !== w) equip(w);
};
function cycle(dir) {
  const p = P(), list = [null, ...p.weapons], i = list.indexOf(p.weapon);
  equip(list[(i + dir + list.length) % list.length]);
}
function reload() {
  const w = P().weapon; if (!w || reloadT > 0 || w.mag >= WEAPONS[w.id].mag || w.ammo <= 0) return;
  reloadT = WEAPONS[w.id].reload; hudWeapon();
}

// ---------- lövés ----------
function targetHit(hits) { return hits[0]; }
function shoot(w) {
  const p = P(), cam = G.camera;
  // a célkereszt iránya: a kamera közepén át; a kezdőpont a mosómedve mellett, hogy mögötte lévő dolgok ne találjanak
  cam.getWorldDirection(aimDir);
  const sp = (w.spread * (p.aiming ? 0.4 : 1) + (p.aiming ? 0 : 0.02)) * (p.speed > 4.5 ? 1.8 : 1);
  aimDir.x += (Math.random() - 0.5) * 2 * sp; aimDir.y += (Math.random() - 0.5) * 2 * sp; aimDir.z += (Math.random() - 0.5) * 2 * sp; aimDir.normalize();
  const t0 = Math.max(0, (p.x - cam.position.x) * aimDir.x + (p.y + 0.8 - cam.position.y) * aimDir.y + (p.z - cam.position.z) * aimDir.z);
  ro.copy(cam.position).addScaledVector(aimDir, t0);
  let best = w.range, hitT = null, hitP = null;
  const wall = G.rayWalls(ro.x, ro.y, ro.z, aimDir.x, aimDir.y, aimDir.z, w.range); if (wall < best) best = wall;
  ray.set(ro, aimDir); ray.far = best;
  for (const t of G.targets) {
    if (!t.obj || t.dead || t.obj.visible === false) continue;
    // durva előszűrés: a cél a sugár közelében van-e (a bőrözött háló lassú)
    tmpV.copy(t.obj.getWorldPosition(hand)).sub(ro); const along = tmpV.dot(aimDir);
    if (along < -3 || along > best + 6) continue;
    if (tmpV.addScaledVector(aimDir, -along).length() > (t.reach || 5)) continue;
    if (t.isNpc) {   // a bőrözött háló sugár-metszése megbízhatatlan: álló henger (0,34 m sugár, 1,35 m magas) a mosómedve helyén
      const q = t.obj.position, fx = ro.x - q.x, fz = ro.z - q.z, a = aimDir.x * aimDir.x + aimDir.z * aimDir.z, bq = fx * aimDir.x + fz * aimDir.z, K = G.rk || 1, rr = 0.34 * K, cq = fx * fx + fz * fz - rr * rr;
      const disc = bq * bq - a * cq; if (a < 1e-6 || disc < 0) continue;
      let s0 = (-bq - Math.sqrt(disc)) / a; if (s0 < 0) s0 = cq < 0 ? 0 : -1;
      const yy = ro.y + aimDir.y * s0; if (s0 < 0 || s0 >= best || yy < q.y || yy > q.y + 1.35 * K) continue;
      best = s0; hitT = t; hitP = ro.clone().addScaledVector(aimDir, s0); continue;
    }
    const h = ray.intersectObject(t.obj, true)[0];
    if (h && h.distance < best) { best = h.distance; hitT = t; hitP = h.point; }
  }
  G.lastShot = { o: ro.toArray(), d: aimDir.toArray(), best, hit: !!hitT, wall };
  const end = hitP ? hitP.clone() : ro.clone().addScaledVector(aimDir, best);
  // a nyomjelző a csőtől indul
  if (gun) { gun.updateMatrixWorld(true); tmpV.set(0, 0.02 * (G.rk || 1), gun.userData.tip); gun.localToWorld(tmpV); } else tmpV.copy(ro);
  tracer(tmpV.clone(), end); if (hitP || best < w.range) spark(end);
  if (hitT) hitT.hit(w.dmg, hitP.clone(), 'player');
  G.sound(w.sound); flashT = 0.05; if (flash) flash.visible = true;
  G.cam.pitch -= w.id === 'sniper' ? 0.06 : w.id === 'pistol' ? 0.022 : 0.008;   // kis hátrarúgás
  G.emit('shot', { x: p.x, z: p.z, player: true, hit: !!hitT });
}
function punch() {
  const p = P(), d = WEAPONS.fist; let any = false;
  const fx_ = Math.sin(p.ry), fz = Math.cos(p.ry);
  for (const t of G.targets) {
    if (!t.obj || t.dead || !t.isNpc) continue;
    const dx = t.obj.position.x - p.x, dz = t.obj.position.z - p.z, dist = Math.hypot(dx, dz);
    if (dist > d.range + 0.3 || (dx * fx_ + dz * fz) / Math.max(dist, 0.01) < 0.4) continue;
    tmpV.set(t.obj.position.x, 0.7, t.obj.position.z); t.hit(d.dmg, tmpV.clone(), 'player'); any = true; break;
  }
  G.sound(any ? 'hit' : 'click', 0.6); punchT = 0.18;
  if (any) G.emit('shot', { x: p.x, z: p.z, player: true, hit: true, melee: true });
}

G.on('key', (c) => {
  if (G.mode !== 'play') return;
  const m = /^Digit([1-5])$/.exec(c); if (m) G.equipSlot(+m[1]);
  if (c === 'KeyR') reload();
});
addEventListener('wheel', (e) => { if (G.mode === 'play' && G.locked() && !P().inCar) cycle(e.deltaY > 0 ? 1 : -1); }, { passive: true });

G.on('update', (dt) => {
  const p = P(); if (!p.av) return;
  const hidden = !!p.inCar || p.dead;
  // a találat-villanások, nyomjelzők, szikrák elhalványítása
  for (const m of tracers) if (m.visible && (m.userData.t -= dt) <= 0) m.visible = false; else if (m.visible) m.material.opacity = 0.9;
  for (const m of sparks) if (m.visible) { m.userData.t -= dt; m.scale.setScalar(1 + (0.22 - m.userData.t) * 6); if (m.userData.t <= 0) m.visible = false; }
  if (flash && flashT > 0 && (flashT -= dt) <= 0) flash.visible = false;
  if (punchT > 0) { punchT -= dt; lean = Math.sin(Math.max(0, punchT) / 0.18 * Math.PI) * 0.35; p.av.root.rotation.x = lean; } else if (lean) { lean = 0; if (!p.dead) p.av.root.rotation.x = 0; }
  // a fegyver a mancs helyén, a nézés irányába fordítva (nem a csonthoz kötve, hogy mindig előre mutasson)
  if (gun) {
    holder.visible = !hidden;
    if (!hidden) {
      p.av.root.updateMatrixWorld(true);
      // a csontok világ-helye ennél a modellnél nem a látható mancs, ezért a törzshöz mért fix hely (jobb kéz, csípő és váll közt)
      const yaw = p.ry;
      let dy = -0.1; if (p.aiming) { G.camera.getWorldDirection(aimDir); dy = aimDir.y; }
      const hz = Math.sqrt(Math.max(0.01, 1 - dy * dy));
      aimDir.set(Math.sin(yaw) * hz, dy, Math.cos(yaw) * hz);
      const K = measureK(p.av), up = (p.aiming ? 0.62 : 0.5) * K;
      holder.position.set(p.x - Math.cos(yaw) * 0.3 * K + aimDir.x * 0.34 * K, p.y + up + aimDir.y * 0.34 * K, p.z + Math.sin(yaw) * 0.3 * K + aimDir.z * 0.34 * K);
      holder.lookAt(holder.position.clone().add(aimDir));
    }
  }
  if (hidden || G.mode !== 'play') { prevL = G.mouse.l; return; }
  cd -= dt;
  if (reloadT > 0 && (reloadT -= dt) <= 0) {
    const w = p.weapon, d = WEAPONS[w.id], t = Math.min(d.mag - w.mag, w.ammo); w.mag += t; w.ammo -= t; reloadT = 0; G.hud.weapon();
  }
  const w = p.weapon, L = G.mouse.l;
  if (L && cd <= 0) {
    if (!w) { if (!prevL) { cd = 1 / WEAPONS.fist.rate; punch(); } }
    else if (reloadT <= 0 && (WEAPONS[w.id].auto || !prevL)) {
      if (w.mag > 0) { cd = 1 / WEAPONS[w.id].rate; w.mag--; shoot(w); G.hud.weapon(); }
      else if (w.ammo > 0) reload();
      else if (!prevL) { G.sound('empty'); cd = 0.25; }
    }
  }
  prevL = L;
});

export function init() {
  fx(tracers, tracerGeo, tracerMat, 10); fx(sparks, sparkGeo, sparkMat, 12);
  G.scene.add(holder);
  return Promise.all(Object.entries(WEAPONS).filter(([, d]) => d.file).map(async ([id, d]) => {
    gunCache[id] = (await G.model(`/game/assets/guns/blaster-${d.file}.glb`)).scene;
  })).then(() => { G.giveWeapon('pistol', 36); });
}
