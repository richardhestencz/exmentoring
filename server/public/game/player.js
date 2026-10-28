// A játékos mosómedvéje: harmadik személyű irányítás (WASD a kamerához képest, egér: nézés, Shift: futás, Szóköz: ugrás),
// a kamera a háta mögött, a falaknál közelebb jön. Célzáskor (jobb egérgomb) a válla fölé áll, és a mosómedve a cél felé fordul.
// A mosómedve-modell (és a raccoon() gyártó) a többi modulnak is kell: NPC-k, a lőtér játékosai.
import { G } from './core.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const THREE = G.THREE;

export const RACCOON_H = 1.5;                    // a mosómedve magassága méterben
const BASE = {};
export async function loadRaccoon() {
  const gltf = await G.model('/img/m3d/raccoon-poses.glb');
  // a csontváz felnagyítja a hálót: a méretet a pontos (bőrözött, álló pózú) befoglaló dobozból számoljuk, nem a nyugalmi hálóból
  const probe = SkeletonUtils.clone(gltf.scene), mx = new THREE.AnimationMixer(probe), idle = gltf.animations.find((c) => c.name === 'idle');
  if (idle) { mx.clipAction(idle).play(); mx.update(0); }
  probe.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(probe, true);
  BASE.scene = gltf.scene; BASE.clips = gltf.animations; BASE.sc = RACCOON_H / (bb.max.y - bb.min.y); BASE.foot = -bb.min.y * BASE.sc;
}
const CYCLE = new Set(['idle', 'walk', 'run']);
// egy mosómedve példány: {root, mixer, play(name, speed), tint}
export function raccoon(tint) {
  const inner = SkeletonUtils.clone(BASE.scene); inner.scale.setScalar(BASE.sc); inner.position.y = BASE.foot;
  const root = new THREE.Group(); root.add(inner);
  inner.traverse((o) => {
    if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
    if (tint) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); }
  });
  const mixer = new THREE.AnimationMixer(inner), actions = {};
  for (const c of BASE.clips) { const a = mixer.clipAction(c); actions[c.name] = a; if (!CYCLE.has(c.name)) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; } }
  const av = { root, inner, mixer, actions, cur: '' };
  av.play = (name, speed = 1) => {
    const a = actions[name]; if (!a) return; a.timeScale = speed; if (av.cur === name) return;
    const prev = actions[av.cur]; a.reset().setEffectiveWeight(1).play();
    if (prev && CYCLE.has(av.cur) && CYCLE.has(name)) a.crossFadeFrom(prev, 0.2, false); else if (prev) prev.stop();
    av.cur = name;
  };
  // a jobb mancs (ide kerül a fegyver)
  av.hand = inner.getObjectByName('forearmR');   // a modellnek nincs kézcsontja: az alkar vége (a three a pontot kiveszi a nevekből)
  G.scene.add(root); return av;
}
export function boneNames() { const n = []; BASE.scene.traverse((o) => { if (o.isBone) n.push(o.name); }); return n; }

// ---------- a játékos ----------
const P = G.player = { x: 0, z: 0, y: 0, vy: 0, ry: 0, hp: 100, armor: 0, money: 250, inCar: null, weapon: null, weapons: [], dead: false, wanted: 0, speed: 0, aiming: false };
const cam = { yaw: 0, pitch: 0.28, dist: 5.2, cur: 5.2 };
G.cam = cam;
let av = null;
export function spawnPlayer() {
  av = P.av = raccoon(); const s = G.world.spawn;
  P.x = s.x; P.z = s.z; P.ry = s.ry; cam.yaw = s.ry + Math.PI;
  av.root.position.set(P.x, 0, P.z); av.play('idle');
  G.hud.money(); G.hud.hp(); G.hud.weapon(); G.hud.stars(0);
}
const WALK = 3.0, RUN = 7.5, GRAV = 22, JUMP = 7.2, RAD = 0.35;
P.hide = (h) => { av.root.visible = !h; };

G.on('update', (dt) => {
  if (!av) return;
  av.mixer.update(dt);
  // egér: nézés (a kamera; a mosómedve a mozgás irányába fordul)
  const sens = 0.0022 * (P.aiming ? 0.6 : 1);
  cam.yaw -= G.mouse.dx * sens; cam.pitch = Math.max(-0.5, Math.min(1.2, cam.pitch + G.mouse.dy * sens));
  // nyilakkal is lehet fordulni; ha az egér pihen és megyünk, a kamera lassan a mosómedve mögé áll (mint a nagy városi játékokban)
  const K0 = G.keys; cam.yaw += ((K0.ArrowLeft ? 1 : 0) - (K0.ArrowRight ? 1 : 0)) * dt * 2.2;
  if (G.mouse.dx || G.mouse.dy || K0.ArrowLeft || K0.ArrowRight) cam.lastLook = performance.now();
  if (P.inCar || P.dead) return;   // autóban a vezetés modulja mozgat; halálkor a halál-jelenet
  const K = G.keys;
  P.aiming = G.mouse.r && !!P.weapon;
  let fx = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), sx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
  const run = (K.ShiftLeft || K.ShiftRight) && !P.aiming, len = Math.hypot(fx, sx);
  const sp = (run ? RUN * (P.boost > performance.now() ? 1.45 : 1) : WALK) * (P.aiming ? 0.6 : 1);   // energiaital: gyorsabb futás
  if (len) { fx /= len; sx /= len; }
  // a kamera előre-iránya a vízszintesen
  const fwx = -Math.sin(cam.yaw), fwz = -Math.cos(cam.yaw), rgx = -fwz, rgz = fwx;
  const vx = (fwx * fx + rgx * sx) * sp, vz = (fwz * fx + rgz * sx) * sp;
  let nx = P.x + vx * dt, nz = P.z + vz * dt;
  const c = G.collide(nx, nz, RAD, P.y); nx = c.x; nz = c.z;
  P.speed = Math.hypot(nx - P.x, nz - P.z) / dt; P.x = nx; P.z = nz;
  // függőleges: gravitáció, ugrás, a talaj (járda, szökőkút pereme)
  const g = G.groundAt(P.x, P.z, P.y);
  if (P.y <= g + 0.01 && P.vy <= 0) { P.y = g; P.vy = 0; if (K.Space) P.vy = JUMP; }
  else { P.vy -= GRAV * dt; P.y = Math.max(g, P.y + P.vy * dt); if (P.y === g) P.vy = 0; }
  // fordulás: célzáskor a kamera irányába, máskor a mozgás irányába
  const want = P.aiming ? cam.yaw + Math.PI : len ? Math.atan2(vx, vz) : P.ry;
  let d = ((want - P.ry + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  P.ry += d * Math.min(1, dt * (P.aiming ? 20 : 12));
  av.root.position.set(P.x, P.y, P.z); av.root.rotation.y = P.ry;
  if (!P.aiming && fx > 0 && P.speed > 0.5 && performance.now() - (cam.lastLook || 0) > 700) {   // csak előre menet (oldalazásnál ne köröztessen)
    const behind = P.ry + Math.PI, dd = ((behind - cam.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (Math.abs(dd) < 2.6) cam.yaw += dd * Math.min(1, dt * 1.6 * Math.min(1, P.speed / 3));   // szembefordulásnál (S) nem pörög körbe
  }
  const air = P.y > g + 0.05;
  if (air) av.play('run', 0.6); else if (P.speed > 4.5) av.play('run', P.speed / 6.5); else if (P.speed > 0.3) av.play('walk', P.speed / 2.4); else av.play('idle');
});
// a kamera mindig a többi frissítés után (az autó is ide írja a célpontját)
G.camTarget = null;
G.on('update', (dt) => {
  if (!av) return;
  let tx, ty, tz, dist = P.aiming ? 2.2 : cam.dist, side = P.aiming ? 0.75 : 0, h = 1.25;
  if (G.camTarget) ({ x: tx, y: ty, z: tz, dist = dist, h = h } = G.camTarget); else { tx = P.x; ty = P.y; tz = P.z; }
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const bx = Math.sin(cam.yaw) * cp, by = sp, bz = Math.cos(cam.yaw) * cp;   // a kamera felé mutató irány
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const ox = tx + rx * side, oy = ty + h, oz = tz + rz * side;
  const hit = G.rayWalls(ox, oy, oz, bx, by, bz, dist + 0.3);
  const want = Math.max(0.6, Math.min(dist, hit - 0.3));
  cam.cur += (want - cam.cur) * Math.min(1, dt * (want < cam.cur ? 30 : 6));
  const ceil = G.ceilAt ? G.ceilAt(tx, tz) : 1e9;   // belső térben (bolt) a mennyezet alatt marad
  G.camera.position.set(ox + bx * cam.cur, Math.min(ceil - 0.25, Math.max(0.3, oy + by * cam.cur)), oz + bz * cam.cur);
  G.camera.lookAt(ox - bx * 2, oy - by * 2 + 0.2, oz - bz * 2);
  const f = P.aiming ? 50 : 65; if (Math.abs(G.camera.fov - f) > 0.1) { G.camera.fov += (f - G.camera.fov) * Math.min(1, dt * 12); G.camera.updateProjectionMatrix(); }
  document.getElementById('reticle').hidden = !(P.aiming || (P.weapon && !P.inCar));
  document.getElementById('reticle').classList.toggle('aim', P.aiming);
});

function respawn() {
  if (!P.dead) return;
  const lost = Math.min(P.money, 100); P.money -= lost; G.hud.money();
  const s = G.world.spawn; P.x = s.x; P.z = s.z; P.y = 0; P.vy = 0; P.hp = 100; P.armor = 0; P.dead = false; P.wanted = 0; G.emit('wanted', 0);
  G.camTarget = null; G.cam.yaw = s.ry + Math.PI; av.root.rotation.x = 0; av.root.position.set(P.x, 0, P.z); av.play('idle'); G.hud.hp();
  G.hud.banner('', '', 1); G.hud.toast(`Felébredtél a tűz mellett. Az orvos ${lost} $-t kért.`);
}
G.on('key', (c) => { if (P.dead && (c === 'Space' || c === 'KeyE') && performance.now() - P.deadAt > 1200) respawn(); });
// biztonsági háló: ha a visszaszámlálás időzítője valamiért elmaradna (háttérbe tett lap), a ciklus is feléleszt
G.on('update', () => { if (P.dead && performance.now() - P.deadAt > 6000) respawn(); });
// sebzés és halál (a többi modul hívja): 0 alatt elájul, 5 s múlva a kórház (a tisztás) előtt ébred, a pénze egy része elveszik
G.damage = (dmg, from) => {
  if (P.dead) return;
  const a = Math.min(P.armor, dmg * 0.7); P.armor -= a; P.hp -= dmg - a; G.hud.hp();
  document.getElementById('hurt').style.opacity = 0.6; setTimeout(() => (document.getElementById('hurt').style.opacity = 0), 160);
  if (P.hp <= 0) {
    P.dead = true; P.deadAt = performance.now(); if (P.inCar) G.emit('forceExit');
    av.play('lie'); av.root.rotation.x = -1.2; G.emit('playerDied');
    // visszaszámlálás a képernyőn; Szóköz vagy E azonnal feléleszt (ne kelljen találgatni, mi történik)
    const tick = () => {
      if (!P.dead) return;
      const left = Math.max(0, 4 - (performance.now() - P.deadAt) / 1000);
      G.hud.banner('KIÜTÖTTEK', `újraéledés a tisztáson: ${Math.ceil(left)} s · Szóköz: azonnal`, 600);
      if (left <= 0) respawn(); else setTimeout(tick, 250);
    };
    tick();
  }
};
