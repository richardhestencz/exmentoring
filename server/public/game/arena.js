// Loop Aréna: Krunker-szerű gyors első személyű lövöldözés. Önálló oldal (nem a nyílt világ core.js-e), saját renderer.
// Szerkezet: pálya + fizika -> arena-map.js, hangok -> arena-audio.js, szerver -> /server/arena.js (WebSocket, a- üzenetek).
// ?bots=1: gyakorlás, offline, botokkal; különben online (ha a szerver nem érhető el, automatikusan gyakorlásra vált).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildTown } from './arena-town.js';
import { buildMap, SPAWNS, moveBody, snapDown, blocked, rayBoxes, rayPlayer, STAND, CROUCH } from './arena-map.js';
import { sfx, unlock } from './arena-audio.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const nick0 = (() => { try { return localStorage.getItem('nick') || ''; } catch { return ''; } })() || 'Mosómedve';
$('syncNick').textContent = nick0;
const toast = (t, ms = 2400) => { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms); };

// a fegyverosztályok; a sebzést a szerver is ismeri (server/arena.js), ott a kliens száma nem számít
const WEAPONS = [
  { name: 'Pisztoly', gun: 'blaster-b', len: 0.17, dmg: 24, gap: 0.22, mag: 12, rel: 1.1, auto: false, spread: 0.012, ads: 0.002, zoom: 1.25, kick: 0.05, sound: 'w0' },
  { name: 'Gépkarabély', gun: 'blaster-d', len: 0.3, dmg: 16, gap: 0.085, mag: 30, rel: 1.6, auto: true, spread: 0.022, ads: 0.008, zoom: 1.4, kick: 0.028, sound: 'w1' },
  { name: 'Mesterlövész', gun: 'blaster-e', len: 0.46, dmg: 70, gap: 0.85, mag: 3, rel: 1.9, auto: false, spread: 0.06, ads: 0, zoom: 3.6, kick: 0.1, sound: 'w2', scope: true },
];
const FOV = 78, EYE = 1.55, EYE_C = 0.9, TINTS = [0xff9a9a, 0x9ad0ff, 0xa6ff9a, 0xffe08a, 0xd9a6ff, 0x8affea, 0xffb48a, 0xc7c7ff];
const BOTNAMES = ['Bot Béla', 'Bot Zsuzsi', 'Bot Pista', 'Bot Cica', 'Bot Mókus'];

// ---------- renderer, jelenet ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('sync').querySelector('b').textContent = 'NINCS WEBGL'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa8d8ff); scene.fog = new THREE.Fog(0xa8d8ff, 60, 170);
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 400); camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xffffff, 0x8fa8c8, 1.35));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4); sun.position.set(-30, 50, -20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 }); sun.shadow.bias = -0.0004;
scene.add(sun);
// a fegyver külön jelenetben, hogy ne lógjon bele a falba
const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xffffff, 0x9aa8c0, 2.2)); const vl = new THREE.DirectionalLight(0xffffff, 2); vl.position.set(1, 2, 1); vmScene.add(vl);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); for (const c of [camera, vmCam]) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); } });

// ---------- modellek ----------
const manager = new THREE.LoadingManager();
let loaded = 0, want = 1; manager.onProgress = (u, a, b) => { loaded = a; want = b; };
const loader = new GLTFLoader(manager).setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/'));
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
const RB = {};   // a mosómedve alap (a player.js loadRaccoon-ja, a nyílt világ nélkül)
const GUNS = [];
let MAPG = null;
async function loadAll() {
  const [rc, ...gs] = await Promise.all([load('/img/m3d/raccoon-poses.glb'), ...WEAPONS.map((w) => load(`/game/assets/guns/${w.gun}.glb`))]);
  // a csontváz felnagyítja a hálót: a pontos, álló pózú befoglaló dobozból méretezünk (különben 2,3-szor nagyobb lenne a találati dobozánál)
  const probe = SkeletonUtils.clone(rc.scene), pm = new THREE.AnimationMixer(probe), idle = rc.animations.find((c) => c.name === 'idle');
  if (idle) { pm.clipAction(idle).play(); pm.update(0); }
  probe.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(probe, true);
  Object.assign(RB, { scene: rc.scene, clips: rc.animations, sc: STAND / (bb.max.y - bb.min.y), foot: -bb.min.y * (STAND / (bb.max.y - bb.min.y)) });
  gs.forEach((g, i) => {   // a cső -Z felé, középre igazítva, a megadott hosszra méretezve
    const src = g.scene, b = new THREE.Box3().setFromObject(src), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const rot = sz.x > sz.z;   // ha a modell X mentén hosszú, forgatjuk
    const inner = new THREE.Group(); src.position.sub(c); inner.add(src); if (rot) inner.rotation.y = Math.PI / 2;
    const k = WEAPONS[i].len / Math.max(sz.x, sz.z), pivot = new THREE.Group(); inner.scale.setScalar(k); pivot.add(inner);
    GUNS[i] = { model: pivot, flip: GUN_FLIP[i] };
  });
  MAPG = Q.get('map') === 'old' ? buildMap(scene) : await buildTown(scene, load);
  if (Q.get('map') !== 'old') Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52 }), sun.shadow.camera.updateProjectionMatrix();
}
const GUN_FLIP = [false, false, false];   // a Kenney-fegyverek csöve eleve -Z felé néz
function gunInstance(i, fwdZ = false) {   // fwdZ: +Z felé néző cső (a mosómedve +Z felé néz)
  const g = GUNS[i].model.clone(true), w = new THREE.Group(); w.add(g); if (GUNS[i].flip !== fwdZ) g.rotation.y = Math.PI;
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return w;
}

// ---------- játékosok (távoli és bot): mosómedve + név + fegyver ----------
const pawns = new Map();
function makePawn(id, nick) {
  const inner = SkeletonUtils.clone(RB.scene); inner.scale.setScalar(RB.sc); inner.position.y = RB.foot;
  const root = new THREE.Group(); root.rotation.order = 'YXZ'; root.add(inner);
  const tint = new THREE.Color(TINTS[id % TINTS.length]);
  inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.color.multiply(tint); } });
  const mixer = new THREE.AnimationMixer(inner), actions = {};
  for (const c of RB.clips) { const a = mixer.clipAction(c); actions[c.name] = a; if (!['idle', 'walk', 'run'].includes(c.name)) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; } }
  const guns = GUNS.map((_, i) => { const g = gunInstance(i, true); g.position.set(-0.26, 0.95, 0.4); g.scale.setScalar(2.4); g.visible = false; root.add(g); return g; });
  const tag = makeTag(nick); root.add(tag);
  scene.add(root);
  const p = { id, nick, root, inner, mixer, actions, cur: '', tag, guns, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, fy: 0, tfy: 0, hp: 100, dead: false, cr: false, w: 1, an: 0, seen: false };
  playAnim(p, 'idle'); setGun(p, 1); pawns.set(id, p); return p;
}
function setGun(p, w) { p.w = w; p.guns.forEach((g, i) => (g.visible = i === w)); }
function makeTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, 128, 42); g.fillStyle = '#fff'; g.fillText(text, 128, 42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true })); s.scale.set(1.6, 0.4, 1); s.position.y = STAND + 0.4; return s;
}
function retag(p, nick) { if (p.nick === nick && p.tagged) return; p.nick = nick; p.tagged = true; p.root.remove(p.tag); p.tag.material.map.dispose(); p.tag = makeTag(nick); p.root.add(p.tag); }
function playAnim(p, name, speed = 1) {
  const a = p.actions[name]; if (!a) return; a.timeScale = speed; if (p.cur === name) return;
  const prev = p.actions[p.cur]; a.reset().setEffectiveWeight(1).play();
  if (prev && ['idle', 'walk', 'run'].includes(p.cur) && ['idle', 'walk', 'run'].includes(name)) a.crossFadeFrom(prev, 0.2, false); else if (prev) prev.stop();
  p.cur = name;
}
function removePawn(id) { const p = pawns.get(id); if (!p) return; scene.remove(p.root); pawns.delete(id); }
const angDiff = (a, b) => ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
function updPawn(p, dt) {
  const k = 1 - Math.exp(-dt * 16);
  p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; p.z += (p.tz - p.z) * k; p.fy += angDiff(p.fy, p.tfy) * k;
  const sp = Math.hypot(p.x - (p.px ?? p.x), p.z - (p.pz ?? p.z)) / Math.max(dt, 1e-3); p.px = p.x; p.pz = p.z;
  p.root.position.set(p.x, p.y, p.z); p.root.rotation.y = p.fy;
  if (p.dead) { playAnim(p, 'lie'); p.root.rotation.x = -1.2; p.tag.visible = false; }
  else {
    p.root.rotation.x = 0; p.tag.visible = true; p.root.scale.y = p.cr ? 0.72 : 1; p.tag.scale.y = 0.4 / p.root.scale.y; p.tag.position.y = (p.cr ? CROUCH : STAND) / p.root.scale.y + 0.4;
    if ((p.an & 7) === 3) playAnim(p, 'run', 0.6); else if (sp > 4.5) playAnim(p, 'run', Math.min(1.6, sp / 6.5)); else if (sp > 0.4) playAnim(p, 'walk', sp / 2.4); else playAnim(p, 'idle');
  }
  p.mixer.update(dt);
}

// ---------- a saját játékos ----------
const me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, h: STAND, ground: false, crouch: false, slide: 0, air: 0, yaw: 0, pitch: 0, hp: 100, alive: false, cls: 1, nextCls: 1, mag: 30, reload: 0, fireT: 0, prot: 0, lastDmg: 0, camY: 0, eyeH: EYE, ads: 0, kick: 0, bob: 0, stepT: 0, killer: 0, deadT: 0, shake: 0 };
let state = 'menu', paused = false, online = false, myId = 0, ws = null, roundTime = 0, phase = 'play', netT = 0, practiceStart = 0;
let board = [];   // [id, nick, ölés, halál, pont, osztály]
const keys = {}, mouse = { l: false, r: false, pressed: false };

function spawnMe(idx, cls, prot) {
  const s = SPAWNS[idx % SPAWNS.length];
  Object.assign(me, { x: s.x, y: 0, z: s.z, vx: 0, vy: 0, vz: 0, crouch: false, slide: 0, h: STAND, yaw: s.yaw, pitch: 0, hp: 100, alive: true, cls, nextCls: cls, reload: 0, fireT: 0.3, prot: prot / 1000, ads: 0, kick: 0, camY: 0 });
  me.mag = WEAPONS[cls].mag; me.camY = me.y;
  state = 'play'; $('dead').style.display = 'none'; $('over').style.display = 'none'; sfx('spawn');
}
function die(killerId) {
  if (!me.alive) return;
  me.alive = false; state = 'dead'; me.killer = killerId; me.deadT = 3; me.deathEye = { x: me.x, y: me.y + 1.3, z: me.z };
  const k = pawns.get(killerId); $('deadt').textContent = k ? `Megölt: ${k.nick}` : 'Kiütöttek';
  $('dead').style.display = 'block'; me.ads = 0; mouse.r = false; sfx('hurt');
}

// mozgás: Krunker-szerű gyors alapsebesség, ugrás tartva = bunnyhop, guggolás futás közben = csúszás
function stepMe(dt) {
  const K = keys, act = state === 'play' && !paused;
  const f = act ? (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0) : 0, s = act ? (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) : 0;
  let wx = -Math.sin(me.yaw) * f + Math.cos(me.yaw) * s, wz = -Math.cos(me.yaw) * f - Math.sin(me.yaw) * s; const wl = Math.hypot(wx, wz); if (wl) { wx /= wl; wz /= wl; }
  const spd0 = Math.hypot(me.vx, me.vz), wantC = act && (K.KeyC || K.ControlLeft);
  // csúszás csak futás (előre) közbeni guggolásra indul
  if (wantC && !me.crouch) { me.crouch = true; if (me.ground && spd0 > 6.5 && f > 0) { me.slide = 1.1; const k = Math.min(1.12, 12 / spd0); me.vx *= k; me.vz *= k; } }
  if (!wantC && me.crouch && !blocked(me.x, me.y, me.z, STAND)) { me.crouch = false; me.slide = 0; }
  me.h = me.crouch ? CROUCH : STAND; if (me.slide > 0) { me.slide -= dt; if (spd0 < 2.5 || !me.crouch) me.slide = 0; }
  const W = WEAPONS[me.cls], maxSp = (me.crouch && me.slide <= 0 ? 4 : 8) * (me.ads > 0.5 ? (W.scope ? 0.6 : 0.8) : 1);
  const wasGround = me.ground; me.air = me.ground ? 0 : me.air + dt;
  const jump = act && K.Space && (me.ground || (me.air < 0.08 && me.vy <= 0));
  if (jump) { me.vy = 8.6; me.ground = false; me.air = 1; me.slide = 0; sfx('jump', 0.6); }
  const accel = (ws_, a) => { const add = ws_ - (me.vx * wx + me.vz * wz); if (add <= 0) return; const as = Math.min(add, a * ws_ * dt); me.vx += wx * as; me.vz += wz * as; };
  if (me.ground && !jump) {   // talajon: súrlódás, majd gyorsítás (landoláskor tartott ugrással nincs súrlódás: bunnyhop)
    const sp = Math.hypot(me.vx, me.vz);
    if (sp > 0) { const ns = Math.max(0, sp - Math.max(sp, 2.5) * (me.slide > 0 ? 0.9 : 12) * dt); me.vx *= ns / sp; me.vz *= ns / sp; }
    if (wl && me.slide <= 0) accel(maxSp, 20);
  } else if (wl) accel(Math.min(maxSp, 1.1), 45);   // levegőben: kis gyorsítás, strafe-olva nő a sebesség
  // kis lépésekben: a nehézség minden lépésben hat, a lépcsőn lefelé a talajra tapadunk (nincs „ugrálás” a fokokon)
  const n = Math.ceil(dt / 0.0125), h = dt / n; let fall = 0;
  for (let i = 0; i < n; i++) {
    me.vy -= 24 * h; fall = Math.min(fall, me.vy); const wg = me.ground;
    moveBody(me, me.vx * h, me.vy * h, me.vz * h);
    if (wg && !me.ground && me.vy <= 0 && !jump) snapDown(me, 0.32);
  }
  if (!wasGround && me.ground && fall < -5) { sfx('land', 0.7); me.shake = 0.03; }
  if (me.y < -10) { me.y = 0; me.vy = 0; }
  // a szem magassága a lépcsőfokon simán követ (~0,1 s), levegőben szorosan; nagy ugrásnál (újraéledés) azonnal
  me.camY += (me.y - me.camY) * (1 - Math.exp(-dt * (me.ground ? 22 : 45))); if (Math.abs(me.y - me.camY) > 1.2) me.camY = me.y;
  me.eyeH += ((me.crouch ? EYE_C : EYE) - me.eyeH) * Math.min(1, dt * 14);
  const sp = Math.hypot(me.vx, me.vz);
  me.bob += sp * dt * (me.ground ? 1.4 : 0.2);
  if (me.ground && sp > 3 && me.slide <= 0 && (me.stepT -= dt) <= 0) { me.stepT = 0.38; sfx('step'); }
}

// ---------- lövés ----------
const tracers = [], sparks = [];
const trMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85 }), trGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4);
function tracer(a, b) {
  let t = tracers.find((x) => x.life <= 0); if (!t) { t = { m: new THREE.Mesh(trGeo, trMat.clone()), life: 0 }; scene.add(t.m); tracers.push(t); }
  const d = b.clone().sub(a), L = d.length(); if (L < 0.2) return;
  t.m.position.copy(a).addScaledVector(d, 0.5); t.m.scale.set(1, L, 1); t.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); t.m.visible = true; t.life = 0.08;
}
const spGeo = new THREE.SphereGeometry(0.08, 6, 6);
function spark(p) {
  let s = sparks.find((x) => x.life <= 0); if (!s) { s = { m: new THREE.Mesh(spGeo, new THREE.MeshBasicMaterial({ color: 0xffd23e })), life: 0 }; scene.add(s.m); sparks.push(s); }
  s.m.position.copy(p); s.m.visible = true; s.life = 0.14;
}
const _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const eyePos = () => new THREE.Vector3(me.x, me.camY + me.eyeH, me.z);
const muzzle = () => new THREE.Vector3(0.13, -0.12, -0.8).applyMatrix4(camera.matrixWorld);
function canFire() { return state === 'play' && me.alive && me.reload <= 0 && me.fireT <= 0; }
function fire() {
  const W = WEAPONS[me.cls];
  if (me.mag <= 0) { sfx('empty'); reload(); return false; }
  me.mag--; me.fireT = W.gap;
  const cp = Math.cos(me.pitch);
  _d.set(-Math.sin(me.yaw) * cp, Math.sin(me.pitch), -Math.cos(me.yaw) * cp);
  _r.set(Math.cos(me.yaw), 0, -Math.sin(me.yaw)); _u.crossVectors(_r, _d);
  const sp = (me.ads > 0.6 ? W.ads : W.spread) + (me.ground ? 0 : 0.015) + Math.hypot(me.vx, me.vz) * 0.0012;
  _d.addScaledVector(_r, (Math.random() * 2 - 1) * sp).addScaledVector(_u, (Math.random() * 2 - 1) * sp).normalize();
  const o = eyePos(), tw = rayBoxes(o.x, o.y, o.z, _d.x, _d.y, _d.z, 200);
  let best = null;
  for (const p of pawns.values()) {
    if (p.dead) continue;
    const r = rayPlayer(o.x, o.y, o.z, _d.x, _d.y, _d.z, tw, { x: p.x, y: p.y, z: p.z, cr: p.cr });
    if (r && r.t < tw && (!best || r.t < best.t)) best = { p, ...r };
  }
  const end = o.clone().addScaledVector(_d, best ? best.t : tw);
  camera.updateMatrixWorld(); tracer(muzzle(), end);
  if (online) send({ t: 'a-shot', o: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)], d: [+_d.x.toFixed(3), +_d.y.toFixed(3), +_d.z.toFixed(3)], w: me.cls });
  if (best) hitPawn(best.p, best.head, W); else if (tw < 200) spark(end);
  me.kick = Math.min(1, me.kick + W.kick * 6); me.pitch += W.kick * (me.ads > 0.6 ? 0.25 : 0.6) * (0.7 + Math.random() * 0.6); me.yaw += (Math.random() - 0.5) * W.kick * 0.5;
  sfx(W.sound); if (me.mag === 0 && !W.scope) setTimeout(() => state === 'play' && me.mag === 0 && reload(), 150);
  return true;
}
function hitPawn(p, head, W) {
  const hm = $('hm'); hm.className = head ? 'on head' : 'on'; void hm.offsetWidth; setTimeout(() => (hm.className = ''), 120);
  sfx(head ? 'head' : 'hit');
  if (online) { send({ t: 'a-hit', id: p.id, w: me.cls, h: head ? 1 : 0 }); return; }
  botDamage(p, W.dmg * (head ? 2 : 1), head);
}
function reload() {
  const W = WEAPONS[me.cls]; if (me.reload > 0 || me.mag >= W.mag || !me.alive) return;
  me.reload = W.rel; me.ads = 0; sfx('reload');
}

// ---------- háló ----------
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function connect(nick, cls) {
  return new Promise((res, rej) => {
    let done = false; const to = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch {} rej(new Error('időtúllépés')); } }, 4000);
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host); } catch (e) { clearTimeout(to); return rej(e); }
    ws.onopen = () => send({ t: 'a-join', nick, cls });
    ws.onerror = () => { if (!done) { done = true; clearTimeout(to); rej(new Error('hiba')); } };
    ws.onclose = () => { if (done && online && state !== 'menu') { toast('A kapcsolat megszakadt'); state = 'menu'; $('pick').hidden = false; } };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (!m.t || m.t.slice(0, 2) !== 'a-') return;
      if (m.t === 'a-wl' && !done) { done = true; clearTimeout(to); res(m); }
      if (m.t === 'a-full' && !done) { done = true; clearTimeout(to); rej(new Error('tele')); }
      onNet(m);
    };
  });
}
const nameOf = (id) => (id === myId ? $('nick').value || nick0 : (board.find((r) => r[0] === id) || [0, pawns.get(id)?.nick || '?'])[1]);
function onNet(m) {
  switch (m.t) {
    case 'a-wl': myId = m.id; online = true; roundTime = m.tm; phase = m.ph; spawnMe(m.sp, me.nextCls, m.prot); break;
    case 'a-sn': {
      roundTime = m.tm; phase = m.ph; const seen = new Set();
      for (const e of m.p) {
        const [id, x, y, z, r, pit, an, w, hp, dead] = e;
        if (id === myId) { if (state === 'play' || state === 'dead') me.hp = hp; continue; }
        seen.add(id);
        let p = pawns.get(id); if (!p) { p = makePawn(id, nameOf(id)); p.x = p.tx = x; p.y = p.ty = y; p.z = p.tz = z; }
        p.tx = x; p.ty = y; p.tz = z; p.tfy = r + Math.PI; p.an = an; p.cr = !!(an & 8); p.hp = hp; p.dead = !!dead; if (p.w !== w) setGun(p, w);
        if (!p.tagged) retag(p, nameOf(id));
      }
      for (const id of [...pawns.keys()]) if (!seen.has(id)) removePawn(id);
      break;
    }
    case 'a-sc': board = m.l; for (const r of board) { const p = pawns.get(r[0]); if (p) retag(p, r[1]); } if ($('board').style.display === 'block') drawBoard(); break;
    case 'a-sh': {
      const o = new THREE.Vector3(...m.o), d = new THREE.Vector3(...m.d).normalize(), tw = rayBoxes(o.x, o.y, o.z, d.x, d.y, d.z, 120);
      tracer(o.clone().addScaledVector(d, 0.8).add(new THREE.Vector3(0, -0.2, 0)), o.clone().addScaledVector(d, tw));
      sfx(WEAPONS[m.w].sound, Math.max(0.05, 1 - o.distanceTo(camera.position) / 70)); break;
    }
    case 'a-dm': {
      me.hp = m.hp; me.lastDmg = performance.now(); sfx('hurt'); hurtFlash(m.fx, m.fz);
      if (m.hp <= 0) die(m.id); break;
    }
    case 'a-kl': feed(m.k, m.v, m.w, m.h); if (m.k === myId) { const hm = $('hm'); hm.className = 'on kill'; setTimeout(() => (hm.className = ''), 300); sfx('kill'); } if (m.v === myId && me.alive) die(m.k); break;
    case 'a-rs': spawnMe(m.sp, m.cls, m.prot); break;
    case 'a-ov': showOver(m.w, m.l); break;
    case 'a-nw': spawnMe(m.sp, m.cls, m.prot); break;
    case 'a-lv': removePawn(m.id); break;
  }
}
function showOver(w, l) {
  state = 'over'; $('over').style.display = 'grid'; $('overw').textContent = `${w} nyert`;
  $('overl').innerHTML = (l || []).map((r, i) => `${i + 1}. ${esc(r[0])} · ${r[1]} ölés · ${r[2]} halál · ${r[3]} pont`).join('<br>'); me.ads = 0; mouse.r = false;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function feed(k, v, w, h) {
  const d = document.createElement('div'); if (k === myId || v === myId) d.className = 'me';
  d.innerHTML = `${esc(nameOf(k))} · ${['pisztoly', 'karabély', 'mesterlövész'][w]}${h ? ' · fejlövés' : ''} → ${esc(nameOf(v))}`; $('feed').appendChild(d);
  setTimeout(() => d.remove(), 6000); while ($('feed').children.length > 5) $('feed').firstChild.remove();
}
function hurtFlash(fx, fz) {
  const h = $('hurt'); h.style.opacity = 1; setTimeout(() => (h.style.opacity = 0), 120);
  if (fx === undefined) return;
  // a sebző irányának jelzése a célkereszt körül: a nézési irányhoz képest
  const vx = fx - me.x, vz = fz - me.z, fwd = -Math.sin(me.yaw) * vx - Math.cos(me.yaw) * vz, rgt = Math.cos(me.yaw) * vx - Math.sin(me.yaw) * vz;
  const i = document.createElement('i'); i.style.transform = `rotate(${Math.atan2(rgt, fwd)}rad)`; $('dir').appendChild(i); setTimeout(() => i.remove(), 1200);
}
function drawBoard() {
  const rows = board.slice().sort((a, b) => b[4] - a[4] || a[3] - b[3]);
  $('bb').innerHTML = rows.map((r) => `<tr class="${r[0] === myId ? 'me' : ''}"><td>${esc(r[1])}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join('');
}

// ---------- gyakorlás: botok (kliens-oldali) ----------
let bots = false;
const randSp = () => Math.floor(Math.random() * SPAWNS.length);
function startPractice() {
  online = false; bots = true; practiceStart = performance.now(); myId = 0;
  board = [[0, $('nick').value || nick0, 0, 0, 0, me.cls]];
  BOTNAMES.forEach((n, i) => {
    const p = makePawn(101 + i, n); p.bot = { node: 0, next: -1, prev: -1, seg: 1, left: 0, shootT: 1 + Math.random(), seen: 0, respawn: 0 }; botSpawn(p); board.push([p.id, n, 0, 0, 0, 1]);
  });
}
function botSpawn(p) {
  const { nodes } = MAPG, b = p.bot; b.node = Math.floor(Math.random() * nodes.length); const n = nodes[b.node];
  p.x = p.tx = n.x; p.y = p.ty = n.y; p.z = p.tz = n.z; b.next = -1; p.dead = false; p.hp = 100; b.seen = 0; setGun(p, 1);
}
function botDamage(p, dmg, head) {
  if (p.dead) return; p.hp -= dmg;
  if (p.hp <= 0) {
    p.dead = true; p.bot.respawn = 3; const r = board.find((x) => x[0] === 0), v = board.find((x) => x[0] === p.id);
    r[2]++; r[4] += 100 + (head ? 50 : 0); v[3]++; feed(0, p.id, me.cls, head); sfx('kill');
  }
}
function damageMe(dmg, from) {
  if (!me.alive || me.prot > 0) return;
  me.hp -= dmg; me.lastDmg = performance.now(); sfx('hurt'); hurtFlash(from.x, from.z);
  if (me.hp <= 0) {
    me.hp = 0; const r = board.find((x) => x[0] === 0), k = board.find((x) => x[0] === from.id); r[3]++; k[2]++; k[4] += 100; feed(from.id, 0, 1, false); die(from.id); me.respawnAt = 3;
  }
}
function botTick(p, dt) {
  const b = p.bot, { nodes, edges } = MAPG;
  if (p.dead) { b.respawn -= dt; if (b.respawn <= 0) botSpawn(p); return; }
  const eyeY = p.y + 1.5, tx = me.x, ty = me.y + (me.crouch ? 0.6 : 1.0), tz = me.z;
  let dx = tx - p.x, dy = ty - eyeY, dz = tz - p.z; const dist = Math.hypot(dx, dy, dz) || 1; dx /= dist; dy /= dist; dz /= dist;
  const los = me.alive && dist < 42 && rayBoxes(p.x, eyeY, p.z, dx, dy, dz, dist) >= dist - 0.3;
  b.seen = los ? b.seen + dt : 0;
  const engage = b.seen > 0.7;
  if (b.next < 0 || b.left <= 0.2) {   // útpontról útpontra: a következőt a szomszédokból sorsoljuk (visszafelé csak ha nincs más)
    if (b.next >= 0) { b.prev = b.node; b.node = b.next; }
    const opts = edges[b.node].filter((n) => n !== b.prev), list = opts.length ? opts : edges[b.node]; if (!list.length) return;
    b.next = list[Math.floor(Math.random() * list.length)]; const a0 = nodes[b.node], c0 = nodes[b.next]; b.seg = b.left = Math.max(0.01, Math.hypot(c0.x - a0.x, c0.z - a0.z));
  }
  const a = nodes[b.node], c = nodes[b.next], hold = engage && dist < 16 && (Math.floor(performance.now() / 1500) + p.id) % 2 === 0;
  const sp = (hold ? 0.8 : engage ? 3 : 4.2) * dt; b.left = Math.max(0, b.left - sp);
  const t = 1 - b.left / Math.max(b.seg, 0.01);
  p.tx = a.x + (c.x - a.x) * t; p.tz = a.z + (c.z - a.z) * t; p.ty = a.y + (c.y - a.y) * t; p.x = p.tx; p.y = p.ty; p.z = p.tz;
  p.tfy = engage ? Math.atan2(dx, dz) : Math.atan2(c.x - a.x, c.z - a.z); p.an = hold ? 0 : 1; p.cr = false;
  if (engage && (b.shootT -= dt) <= 0) {
    b.shootT = 0.45 + Math.random() * 0.5;
    const err = 0.045 + dist * 0.003, d = new THREE.Vector3(dx + (Math.random() - 0.5) * 2 * err, dy + (Math.random() - 0.5) * 2 * err, dz + (Math.random() - 0.5) * 2 * err).normalize();
    const tw = rayBoxes(p.x, eyeY, p.z, d.x, d.y, d.z, 80), r = rayPlayer(p.x, eyeY, p.z, d.x, d.y, d.z, tw, { x: me.x, y: me.y, z: me.z, cr: me.crouch });
    const end = new THREE.Vector3(p.x, eyeY, p.z).addScaledVector(d, r && r.t < tw ? r.t : tw);
    tracer(new THREE.Vector3(p.x, eyeY - 0.25, p.z).addScaledVector(d, 0.6), end); sfx('w1', Math.max(0.05, 1 - dist / 60));
    if (r && r.t < tw) damageMe(r.head ? 14 : 7, p);
  }
}

// ---------- fő ciklus ----------
const vm = { g: null, cls: -1 };
function setVm(cls) {
  if (vm.g) vmScene.remove(vm.g);
  vm.g = gunInstance(cls); vm.g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); vmScene.add(vm.g); vm.cls = cls;
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0 })); f.position.set(0, 0.02, -WEAPONS[cls].len / 2 - 0.04); vm.g.add(f); vm.flash = f;
}
const clock = new THREE.Clock(); let lastBoardFrame = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()), now = performance.now();
  if (state === 'menu' && !MAPG) return;
  if (state === 'menu') { menuCam(clock.elapsedTime); renderer.clear(); renderer.render(scene, camera); return; }
  const W = WEAPONS[me.cls];
  // egér-állapot és időzítők
  if (me.alive) {
    const act = state === 'play' && !paused;
    me.fireT -= dt; if (me.reload > 0) { me.reload -= dt; if (me.reload <= 0) { me.mag = W.mag; } }
    me.prot -= dt;
    const wantAds = act && mouse.r && me.reload <= 0; me.ads += ((wantAds ? 1 : 0) - me.ads) * Math.min(1, dt * 14);
    if (act && canFire() && (W.auto ? mouse.l : mouse.pressed)) fire();
    mouse.pressed = false;
    if (!online && now - me.lastDmg > 5000 && me.hp < 100) me.hp = Math.min(100, me.hp + 30 * dt);
  }
  stepMe(dt);
  if (state === 'dead') {
    me.deadT -= dt; $('deadt').textContent = ($('deadt').textContent.split(' · ')[0]) + ` · újraéledés: ${Math.max(0, me.deadT).toFixed(1)} s`;
    if (!online && me.deadT <= 0) spawnMe(randSp(), me.nextCls, 2000);
  }
  for (const p of pawns.values()) { if (p.bot) botTick(p, dt); updPawn(p, dt); }
  // kamera
  const ads = me.ads, zoom = 1 + (W.zoom - 1) * ads;
  camera.fov = FOV / zoom; camera.updateProjectionMatrix();
  if (state === 'dead' && me.deathEye) {   // „killcam”: a halál helyéről a gyilkos felé fordul
    const k = pawns.get(me.killer), e = me.deathEye;
    if (k) { const tx = k.x - e.x, tz = k.z - e.z, ty = k.y + 1.1 - e.y; const ty_ = Math.atan2(-tx, -tz), tp = Math.atan2(ty, Math.hypot(tx, tz)); me.yaw += angDiff(me.yaw, ty_) * Math.min(1, dt * 4); me.pitch += (tp - me.pitch) * Math.min(1, dt * 4); }
    camera.position.set(e.x, Math.max(0.3, e.y - 1.0 + Math.min(1, (3 - me.deadT) * 0.6)), e.z); camera.rotation.set(me.pitch, me.yaw, 0.35 * Math.min(1, (3 - me.deadT)));
  } else {
    me.shake = Math.max(0, me.shake - dt * 0.2);
    camera.position.set(me.x, me.camY + me.eyeH - me.shake, me.z); camera.rotation.set(me.pitch, me.yaw, 0);
  }
  camera.updateMatrixWorld();
  // lövedék-nyomok, szikrák
  for (const t of tracers) if (t.life > 0) { t.life -= dt; t.m.material.opacity = Math.max(0, t.life / 0.08) * 0.85; if (t.life <= 0) t.m.visible = false; }
  for (const s of sparks) if (s.life > 0) { s.life -= dt; if (s.life <= 0) s.m.visible = false; }
  // fegyver a kézben
  if (vm.cls !== me.cls) setVm(me.cls);
  me.kick = Math.max(0, me.kick - dt * 8);
  const sp = Math.hypot(me.vx, me.vz), bobA = me.ground ? Math.min(1, sp / 8) : 0.2, rl = me.reload > 0 ? Math.sin(Math.PI * (1 - me.reload / W.rel)) : 0;
  vm.g.position.set(0.13 * (1 - ads) + Math.sin(me.bob) * 0.008 * bobA * (1 - ads), -0.15 + (0.04) * ads + Math.abs(Math.cos(me.bob)) * 0.01 * bobA * (1 - ads) - rl * 0.15, -0.46 + me.kick * 0.05 + 0.04 * ads);
  vm.g.rotation.set(me.kick * 0.18 - rl * 0.9, 0, rl * 0.3); if (me.slide > 0 || (me.crouch && me.ground)) vm.g.rotation.z += 0.05;
  vm.flash.material.opacity = me.kick > 0.7 ? 0.9 : 0;
  const scope = !!W.scope && ads > 0.85 && me.alive; $('scope').style.display = scope ? 'block' : 'none';
  // HUD
  $('hpn').textContent = Math.max(0, Math.ceil(me.hp)); $('hpi').style.width = Math.max(0, me.hp) + '%'; $('hpi').style.background = me.hp > 50 ? '#5fcf5f' : me.hp > 25 ? '#ffd23e' : '#ff4a4a';
  $('am').textContent = me.reload > 0 ? '…' : me.mag; $('wn').textContent = `${W.name} / ${W.mag}`;
  $('cross').classList.toggle('ads', ads > 0.6); $('prot').style.opacity = me.prot > 0 && me.alive ? 1 : 0;
  const tl = online ? roundTime : Math.max(0, 300000 - (now - practiceStart)); const sec = Math.ceil(tl / 1000);
  $('timer').textContent = online || bots ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '';
  if (online && phase === 'over') $('overc').textContent = `Új kör: ${Math.ceil(roundTime / 1000)} s`;
  if (!online && bots && now - lastBoardFrame > 300 && $('board').style.display === 'block') { lastBoardFrame = now; drawBoard(); }
  // állapot küldése 15 Hz-en
  if (online && me.alive && (netT -= dt) <= 0) {
    netT = 1 / 15;
    send({ t: 'a-st', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), r: +me.yaw.toFixed(2), p: +me.pitch.toFixed(2), a: (me.ground ? (sp > 6 ? 2 : sp > 0.5 ? 1 : 0) : 3) + (me.crouch ? 8 : 0), w: me.cls });
  }
  if (!online && bots && !me.alive && state === 'dead') {}
  renderer.clear(); renderer.render(scene, camera);
  if (me.alive && !scope && state === 'play') { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}
// a menü hátterében lassan körbejáró kamera a pálya fölött
function menuCam(t) { camera.fov = FOV; camera.updateProjectionMatrix(); camera.position.set(Math.sin(t * 0.15) * 38, 22, Math.cos(t * 0.15) * 38); camera.lookAt(0, 1, 0); }

// ---------- bemenet ----------
const canvas = renderer.domElement;
const lock = () => { try { const r = canvas.requestPointerLock?.(); r && r.catch && r.catch(() => {}); } catch {} };
let lockedOnce = false;
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (state === 'menu') return;
  if (e.code === 'Tab') { drawBoard(); $('board').style.display = 'block'; }
  if (e.code === 'KeyR' && state === 'play' && !paused) reload();
  const ci = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
  if (ci !== undefined) { me.nextCls = ci; send({ t: 'a-cls', cls: ci }); toast(`Következő életedben: ${WEAPONS[ci].name}`); if (!online && bots && !me.alive) {} }
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') $('board').style.display = 'none'; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; });
canvas.addEventListener('mousedown', (e) => {
  if (state === 'menu') return; unlock();
  if (document.pointerLockElement !== canvas && !paused) { lock(); }
  if (paused) return;
  if (e.button === 0) { mouse.l = true; mouse.pressed = true; } if (e.button === 2) mouse.r = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || paused || state === 'over') return;
  const sens = 0.0022 / (1 + (WEAPONS[me.cls].zoom - 1) * me.ads * 0.8);
  me.yaw -= e.movementX * sens; me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch - e.movementY * sens));
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { lockedOnce = true; paused = false; $('pause').hidden = true; }
  else if (lockedOnce && state !== 'menu') { paused = true; mouse.l = mouse.r = false; $('pause').hidden = false; }
});
$('resume').onclick = () => { paused = false; $('pause').hidden = true; lock(); };
$('quit').onclick = $('back').onclick = () => { try { ws && ws.close(); } catch {} location.href = '/jatek.html'; };
addEventListener('keydown', (e) => { if (e.code === 'Escape' && paused && !document.pointerLockElement) $('resume').onclick(); });

// ---------- menü, indulás ----------
function pickCls(c) { me.cls = me.nextCls = c; for (const b of $('cls').children) b.classList.toggle('sel', +b.dataset.c === c); }
for (const b of $('cls').children) b.onclick = () => pickCls(+b.dataset.c);
addEventListener('keydown', (e) => { if (state === 'menu' && !$('pick').hidden && ['Digit1', 'Digit2', 'Digit3'].includes(e.code) && e.target.tagName !== 'INPUT') pickCls(+e.code.slice(5) - 1); });
$('nick').value = nick0;
async function begin(practice) {
  unlock(); document.body.classList.add('playing'); const nick = ($('nick').value || nick0).trim() || 'Mosómedve'; $('pick').hidden = true;
  if (!practice) {
    try { await connect(nick, me.cls); toast('Csatlakoztál az arénához'); }
    catch (e) { toast('Nem érem el a szervert: gyakorlás botokkal', 3500); practice = true; try { ws && ws.close(); } catch {} ws = null; }
  }
  if (practice) { startPractice(); spawnMe(randSp(), me.cls, 2000); }
  lock();
}
$('goOn').onclick = () => begin(false); $('goBot').onclick = () => begin(true);
fetch('/api/arena').then((r) => r.json()).then((j) => { $('onl').textContent = `· ${j.players} játékos online`; }).catch(() => {});

(async () => {
  const tick = setInterval(() => { $('syncPct').textContent = Math.min(97, Math.floor(loaded / Math.max(1, want) * 100)) + '%'; }, 100);
  try { await loadAll(); } catch (e) { console.warn('arena betöltés', String(e && e.stack || e)); $('sync').querySelector('b').textContent = 'HIBA A BETÖLTÉSNÉL'; clearInterval(tick); return; }
  clearInterval(tick); $('syncPct').textContent = '100%'; frame();
  setTimeout(() => { $('sync').hidden = true; $('pick').hidden = false; if (Q.get('bots') === '1' && !Q.get('menu')) $('goBot').click(); }, 700);
})();

// hibakereséshez és tesztekhez
window.A = {
  me, pawns, get state() { return state; }, get online() { return online; }, get id() { return myId; }, get board() { return board; }, get paused() { return paused; },
  fire() { if (canFire()) return fire(); if (me.mag <= 0) reload(); return false; },
  look(yaw, pitch) { me.yaw = yaw; me.pitch = pitch; },
  aimAt(id) { const p = pawns.get(id); if (!p) return false; const e = eyePos(), tx = p.x - e.x, tz = p.z - e.z, ty = p.y + 1.0 - e.y; me.yaw = Math.atan2(-tx, -tz); me.pitch = Math.atan2(ty, Math.hypot(tx, tz)); return true; },
  tp(x, z, y = 0) { me.x = x; me.z = z; me.y = y; me.camY = y; me.vx = me.vz = me.vy = 0; },
  mapg: () => MAPG, blocked, keys, step: stepMe, camPos: () => [camera.position.x, camera.position.y, camera.position.z],
  ads(v) { mouse.r = !!v; }, pickCls, begin, bots: () => [...pawns.values()].filter((p) => p.bot),
};
