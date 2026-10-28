// Loop City (pilot): a játék magja. Minden modul ezt a G objektumot használja:
//   G.scene, G.camera, G.renderer, G.THREE      a három.js jelenet
//   G.on('update', (dt, t) => …)                 minden képkockán (játék közben)
//   G.solids                                      fal-téglalapok {x0,z0,x1,z1,h} (épületek, akadályok): ezeken nem lehet átmenni
//   G.collide(x, z, r)                            kör ütköztetése a falakkal: {x, z} a kitolt hely
//   G.interact.push({x, z, r, label, act})        „E”-vel használható pontok (ajtó, autó stb.); a legközelebbi jelenik meg
//   G.targets                                     lőhető dolgok: {obj (Object3D), hit(dmg, point, from)} (NPC, autó, tábla)
//   G.player                                      a mosómedve: {x, z, y, ry, hp, money, inCar, weapon, dead}
//   G.hud.toast(text), G.hud.money(), G.hud.hp()
//   G.model(url) -> Promise<gltf> (gyorsítótárral), G.place(url, opt) -> Promise<Object3D>
//   G.world                                       az utak, a háztömbök, a fontos helyek (world.js tölti ki)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const G = {
  THREE, hooks: { update: [] }, solids: [], interact: [], targets: [], world: {}, mode: 'load', keys: {}, mouse: { dx: 0, dy: 0, l: false, r: false },
  on(ev, fn) { (this.hooks[ev] ||= []).push(fn); },
  emit(ev, ...a) { for (const f of this.hooks[ev] || []) f(...a); },
};

// ---------- renderer, kamera, fény ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 2500);
Object.assign(G, { renderer, scene, camera });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// naplemente: meleg, alacsony nap, rózsaszín-narancs köd (a Vice City-hangulat)
// erős égbolt-fény: a hátulról megvilágított tárgyak se legyenek feketék
const hemi = new THREE.HemisphereLight(0xffd2b0, 0x7a6a8a, 1.7); scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffb27a, 2.6); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 }); sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
G.sun = sun; G.sunDir = new THREE.Vector3(-0.55, 0.32, -0.77).normalize();
scene.fog = new THREE.Fog(0xf2a77e, 120, 900);

// ---------- modellek ----------
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
export const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager).setDRACOLoader(draco);
const cache = {};
G.model = (u) => (cache[u] ||= new Promise((res, rej) => loader.load(u, res, undefined, rej)));
// egy modell a világban: a talpa y-on, a közepe x,z-n; size: a hosszabbik vízszintes mérete (vagy height: a magassága) méterben
G.place = async (url, { x = 0, z = 0, y = 0, ry = 0, size, height, scale, shadow = true, parent = scene } = {}) => {
  const src = (await G.model(url)).scene, g = src.clone(true);
  const bb = new THREE.Box3().setFromObject(g), sz = bb.getSize(new THREE.Vector3());
  const k = scale || (height ? height / sz.y : size ? size / Math.max(sz.x, sz.z) : 1);
  const pivot = new THREE.Group(); g.position.set(-(bb.min.x + sz.x / 2), -bb.min.y, -(bb.min.z + sz.z / 2)); pivot.add(g);
  g.scale.setScalar(1); pivot.scale.setScalar(k); g.position.multiplyScalar(1);
  pivot.position.set(x, y, z); pivot.rotation.y = ry;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = shadow; o.receiveShadow = true; for (const m of [].concat(o.material)) if (m.metalness > 0.3) { m.metalness = 0.1; m.roughness = Math.max(m.roughness, 0.6); } } });   // a Kenney-modellek fémesek: környezet nélkül feketék lennének
  parent.add(pivot);
  pivot.userData.size = sz.clone().multiplyScalar(k);
  return pivot;
};

// ---------- ütközés: kör a fal-téglalapokkal (rácsba osztva, hogy gyors legyen) ----------
const CELL = 16, grid = new Map();
const gkey = (i, j) => i * 100003 + j;
G.addSolid = (s) => {
  G.solids.push(s);
  for (let i = Math.floor(s.x0 / CELL); i <= Math.floor(s.x1 / CELL); i++) for (let j = Math.floor(s.z0 / CELL); j <= Math.floor(s.z1 / CELL); j++) {
    const k = gkey(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s);
  }
  return s;
};
G.removeSolid = (s) => { const i = G.solids.indexOf(s); if (i >= 0) G.solids.splice(i, 1); for (const a of grid.values()) { const j = a.indexOf(s); if (j >= 0) a.splice(j, 1); } };
G.solidsNear = (x, z) => grid.get(gkey(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
G.collide = (x, z, r, y = 0) => {
  for (let it = 0; it < 2; it++) {
    const seen = new Set();
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const s of grid.get(gkey(Math.floor(x / CELL) + di, Math.floor(z / CELL) + dj)) || []) {
      if (seen.has(s)) continue; seen.add(s);
      if (s.h !== undefined && y >= s.h - 0.05) continue;   // ha fölötte vagyunk (pl. ráugrott), nem fal
      const cx = Math.max(s.x0, Math.min(x, s.x1)), cz = Math.max(s.z0, Math.min(z, s.z1)), dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) { const d = Math.sqrt(d2), p = (r - d) / d; x += dx * p; z += dz * p; }
      else {   // a közepe a téglalapon belül: a legközelebbi oldalra
        const o = [x - s.x0, s.x1 - x, z - s.z0, s.z1 - z], m = Math.min(...o);
        if (m === o[0]) x = s.x0 - r; else if (m === o[1]) x = s.x1 + r; else if (m === o[2]) z = s.z0 - r; else z = s.z1 + r;
      }
    }
  }
  return { x, z };
};
// talajszint egy pontban (a tetején állható dolgok: {x0,z0,x1,z1,h,top:true})
G.groundAt = (x, z, y = 99) => {
  let g = 0;
  for (const s of G.solidsNear(x, z)) if (s.top && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.h <= y + 0.35) g = Math.max(g, s.h);
  return g;
};
// sugár a falakkal: az első találat távolsága (vagy Infinity); a kamera és a lövések használják
G.rayWalls = (ox, oy, oz, dx, dy, dz, max) => {
  let best = max;
  const steps = Math.ceil(max / (CELL / 2)), seen = new Set();
  for (let k = 0; k <= steps; k++) {
    const px = ox + dx * k * CELL / 2, pz = oz + dz * k * CELL / 2;
    for (const s of G.solidsNear(px, pz)) {
      if (seen.has(s)) continue; seen.add(s);
      const h = s.h ?? 1e9;
      // téglatest-sugár metszés (slab)
      let t0 = 0, t1 = best;
      for (const [o, d, a, b] of [[ox, dx, s.x0, s.x1], [oy, dy, 0, h], [oz, dz, s.z0, s.z1]]) {
        if (Math.abs(d) < 1e-9) { if (o < a || o > b) { t0 = 1; t1 = 0; break; } continue; }
        let ta = (a - o) / d, tb = (b - o) / d; if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < best) best = t0;
    }
  }
  return best;
};

// ---------- bemenet ----------
const K = G.keys;
addEventListener('keydown', (e) => {
  if (e.repeat) { K[e.code] = true; return; }
  K[e.code] = true; G.emit('key', e.code, e);
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code) && G.mode === 'play') e.preventDefault();
});
addEventListener('keyup', (e) => { K[e.code] = false; });
addEventListener('blur', () => { for (const k in K) K[k] = false; G.mouse.l = G.mouse.r = false; });
renderer.domElement.addEventListener('mousedown', (e) => {
  if (G.mode !== 'play') return;
  if (document.pointerLockElement !== renderer.domElement) { renderer.domElement.requestPointerLock?.(); return; }
  if (e.button === 0) G.mouse.l = true; if (e.button === 2) G.mouse.r = true; G.emit('mousedown', e.button);
});
addEventListener('mouseup', (e) => { if (e.button === 0) G.mouse.l = false; if (e.button === 2) G.mouse.r = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
// nézés: zárolt egérrel szabadon, zár nélkül (ha a böngésző nem adja) nyomva tartott gombbal húzva
addEventListener('mousemove', (e) => { if (document.pointerLockElement === renderer.domElement || (e.buttons && e.target === renderer.domElement)) { G.mouse.dx += e.movementX; G.mouse.dy += e.movementY; } });
G.locked = () => document.pointerLockElement === renderer.domElement;

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
let toastT = 0;
G.hud = {
  toast(t, ms = 2600) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms); },
  money() { $('money').textContent = '$' + Math.floor(G.player.money).toLocaleString('en-US').padStart(8, '0'); },
  hp() { $('hpbar').style.width = Math.max(0, G.player.hp) + '%'; $('arbar').style.width = Math.max(0, G.player.armor || 0) + '%'; },
  weapon() { const w = G.player.weapon; $('weapon').innerHTML = w ? `<b>${w.name}</b><span>${w.mag} / ${w.ammo}</span>` : '<b>Mancs</b><span>👊</span>'; },
  stars(n) { $('stars').innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join(''); },
  prompt(t) { const el = $('prompt'); if (!t) { el.hidden = true; return; } el.innerHTML = t; el.hidden = false; },
  banner(big, small = '', ms = 2500) { const el = $('banner'); el.innerHTML = `<b>${big}</b>${small ? `<span>${small}</span>` : ''}`; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), ms); },
};

// a legközelebbi használható pont kiírása; E-re lefut
G.nearest = null;
function interactions() {
  const p = G.player; let best = null, bd = 1e9;
  if (!p.dead) for (const it of G.interact) {
    if (it.when && !it.when()) continue;
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (d < (it.r || 2) && d < bd) { bd = d; best = it; }
  }
  if (best !== G.nearest) { G.nearest = best; G.hud.prompt(best ? `<kbd>${best.key || 'E'}</kbd>${typeof best.label === 'function' ? best.label() : best.label}` : ''); }
}
G.on('key', (c) => {
  if (G.mode !== 'play' || !G.nearest) return;
  if (c === (G.nearest.code || 'KeyE')) { const it = G.nearest; G.nearest = null; it.act(); }
});

// ---------- hangok (WebAudio, minden szintetizált: nincs letöltés) ----------
let AC = null;
G.sound = (kind, vol = 1) => {
  try {
    AC ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime, g = AC.createGain(); g.connect(AC.destination);
    if (kind === 'shot' || kind === 'rifle' || kind === 'boom') {
      const len = kind === 'boom' ? 1.2 : 0.22, b = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** (kind === 'boom' ? 1.5 : 4);
      const s = AC.createBufferSource(); s.buffer = b; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'boom' ? 600 : kind === 'rifle' ? 2600 : 1800;
      s.connect(f); f.connect(g); g.gain.setValueAtTime(0.5 * vol, t); s.start(t);
    } else {
      const o = AC.createOscillator(); o.connect(g);
      const [f0, f1, len, type] = { click: [900, 600, 0.05, 'square'], buy: [660, 990, 0.18, 'triangle'], hit: [220, 120, 0.12, 'sawtooth'], empty: [300, 280, 0.04, 'square'], door: [180, 90, 0.25, 'triangle'], cash: [1200, 1800, 0.12, 'triangle'] }[kind] || [440, 440, 0.1, 'sine'];
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
      g.gain.setValueAtTime(0.15 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len); o.start(t); o.stop(t + len);
    }
  } catch {}
};

// ---------- fő ciklus ----------
G.clock = new THREE.Clock();
G.frame = null;   // a betöltő/bevezető saját rajzolása
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, G.clock.getDelta()), t = G.clock.elapsedTime;
  if (G.frame) { G.frame(dt, t); return; }
  if (G.mode === 'play' || G.mode === 'pause') {
    if (G.mode === 'play') { for (const f of G.hooks.update) f(dt, t); interactions(); }
    G.mouse.dx = G.mouse.dy = 0;
    // a nap követi a játékost (az árnyék-kamera kicsi, éles)
    const p = G.player; sun.position.set(p.x + G.sunDir.x * 200, G.sunDir.y * 200, p.z + G.sunDir.z * 200); sun.target.position.set(p.x, 0, p.z);
    renderer.render(scene, camera);
  }
}
loop();
