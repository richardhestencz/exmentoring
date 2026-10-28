// Az aréna pályája és fizikája: ~60x60 m, két szint (a földszint és a 3 m magas központi fedélzet + két torony, hidakkal),
// lépcsők, ládák, falak. Minden egy AABB-lista (BOXES): ugyanaz rajzolja és ütközteti, így a kettő sosem tér el.
import * as THREE from 'three';

export const BOXES = [];
export const HW = 0.35, STAND = 1.7, CROUCH = 1.0, STEP = 0.56;   // a játékos fél szélessége, magassága állva/guggolva, a legnagyobb lépcsőfok
const EPS = 1e-4;

// 8 kezdőpont a falak mentén; a tekintet a pálya közepe felé
export const SPAWNS = [];   // a pálya tölti ki
export const setSpawns = (pts) => { SPAWNS.length = 0; for (const [x, z, y = 0] of pts) SPAWNS.push({ x, y, z, yaw: Math.atan2(x, z) }); };   // a tekintet a pálya közepe felé
setSpawns([[-26, -15], [-12, -26], [12, -26], [26, -15], [26, 15], [12, 26], [-12, 26], [-26, 15]]);

function gridTex(alpha = 0.22) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = `rgba(0,0,40,${alpha})`; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 61, 61);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t;
}
// doboz-gyártó: ugyanaz a doboz rajzolódik és ütközik (color = null: csak ütközés, pl. láthatatlan fal)
export function makeBuilder(scene, lineAlpha = 0.22) {
  const tex = gridTex(lineAlpha), mats = {};
  const mat = (c) => (mats[c] ||= new THREE.MeshStandardMaterial({ color: c, map: tex, roughness: 0.85, metalness: 0 }));
  const box = (x0, y0, z0, x1, y1, z1, color, shadow = true) => {
    const b = { x0, y0, z0, x1, y1, z1 }; BOXES.push(b); if (!color) return b;
    const w = x1 - x0, h = y1 - y0, d = z1 - z0, geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / 2, uv.getY(k) * dims[f][1] / 2); }
    const m = new THREE.Mesh(geo, mat(color)); m.position.set(x0 + w / 2, y0 + h / 2, z0 + d / 2); m.castShadow = shadow; m.receiveShadow = true; scene.add(m);
    return b;
  };
  return { box, C: (cx, cz, w, d, y0, y1, color) => box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y1, cz + d / 2, color) };
}
// útpontok összekötése: azonos magasságú, szabad rálátású párok (két magasságban sugarazva) + a megadott (lépcső) élek
export function linkNodes(nodes, explicit = [], maxLen = 26) {
  const edges = nodes.map(() => []);
  const link = (a, b) => { if (!edges[a].includes(b)) edges[a].push(b); if (!edges[b].includes(a)) edges[b].push(a); };
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j]; if (Math.abs(a.y - b.y) > 0.01) continue;
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz); if (L > maxLen || L < 0.01) continue;
    if (rayBoxes(a.x, a.y + 0.5, a.z, dx / L, 0, dz / L, L) >= L && rayBoxes(a.x, a.y + 1.3, a.z, dx / L, 0, dz / L, L) >= L) link(i, j);
  }
  for (const [a, b] of explicit) link(a, b);
  return edges;
}

export function buildMap(scene) {
  BOXES.length = 0;
  const { box, C } = makeBuilder(scene);

  // padló és a pálya körüli fal (a padló a falon túl is folytatódik, hogy ne lógjon a semmibe)
  box(-34, -1, -34, 34, 0, 34, '#8fc9e8', false);
  const WALL = '#eef3ff';
  box(-31, 0, -31, 31, 9, -30, WALL); box(-31, 0, 30, 31, 9, 31, WALL); box(-31, 0, -30, -30, 9, 30, WALL); box(30, 0, -30, 31, 9, 30, WALL);

  // központi fedélzet (3 m), 4 oszlopon; a szélén 1 m-es korlát, a lépcsők helyén rés
  box(-7, 2.6, -7, 7, 3, 7, '#b78cf2');
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) C(x, z, 1, 1, 0, 2.6, '#8a63d2');
  box(-7, 3, -7, -6.7, 4, 7, '#d9c2ff'); box(6.7, 3, -7, 7, 4, 7, '#d9c2ff');
  box(-6.7, 3, -7, -2, 4, -6.7, '#d9c2ff'); box(2, 3, -7, 6.7, 4, -6.7, '#d9c2ff');
  box(-6.7, 3, 6.7, -2, 4, 7, '#d9c2ff'); box(2, 3, 6.7, 6.7, 4, 7, '#d9c2ff');
  // a középső lépcsők (észak és dél): 8 fok, egyenként 0,375 m
  for (let k = 1; k <= 8; k++) {
    const t = k * 0.375, o = (8 - k) * 0.75;
    box(-2, 0, 7 + o, 2, t, 7.75 + o, '#ffd166'); box(-2, 0, -7.75 - o, 2, t, -7 - o, '#ffd166');
  }
  // két torony (3 m) a fedélzettel hídon összekötve; a tornyokra 6 fokos lépcső vezet
  box(-29, 0, -5, -19, 3, 5, '#4fd1a5'); box(19, 0, -5, 29, 3, 5, '#4fd1a5');
  box(-19, 2.6, -1.5, -7, 3, 1.5, '#7be3c4'); box(7, 2.6, -1.5, 19, 3, 1.5, '#7be3c4');
  for (const sx of [-1, 1]) { box(sx * 13 - 6, 3, -1.5, sx * 13 + 6, 3.9, -1.3, '#d9fff0'); box(sx * 13 - 6, 3, 1.3, sx * 13 + 6, 3.9, 1.5, '#d9fff0'); }
  for (let k = 1; k <= 6; k++) {
    const t = k * 0.5, o = 6 - k;
    box(-27, 0, 5 + o, -23, t, 6 + o, '#ffd166');       // nyugati torony, dél felől
    box(23, 0, -6 - o, 27, t, -5 - o, '#ffd166');       // keleti torony, észak felől
  }
  box(-29, 3, -5, -28.8, 3.9, 5, '#d9fff0'); box(28.8, 3, -5, 29, 3.9, 5, '#d9fff0');

  // falak (pörgettyű-elrendezés) és ládák a fedezékhez
  const WL = '#ff7a59';
  box(-18, 0, -16, -10, 3, -15.4, WL); box(10, 0, 15.4, 18, 3, 16, WL); box(15.4, 0, -18, 16, 3, -10, WL); box(-16, 0, 10, -15.4, 3, 18, WL);
  const crates = [[-4, -12, 2], [3, -12.5, 1.5], [0, -19, 2.5], [12, -3, 2], [12.5, 2, 1.5], [18, 6, 2], [-12, 3, 2], [-12.5, -2, 1.5], [-17, -8, 2],
    [4, 12, 2], [-4, 12.5, 1.5], [0, 19, 2.5], [-8, -22, 2], [8, 22, 2], [22, -16, 2], [-22, 16, 2], [-9, 9, 1.5], [9, -9, 1.5]];
  crates.forEach(([x, z, s], i) => C(x, z, s, s, 0, s, i % 2 ? '#f2a83b' : '#ff5d8f'));
  C(-4, -12, 1.2, 1.2, 2, 3.2, '#f2a83b'); C(12, -3, 1.2, 1.2, 2, 3.2, '#ff5d8f');   // egymásra rakott ládák
  for (const [x, z] of [[-24, -24], [24, 24], [-24, 24], [24, -24]]) C(x, z, 3, 3, 0, 3, '#5b8def');

  // a botok útpontjai (x, z, y); az élek automatikusan: ami között nincs fal, azt összeköti
  const ground = [[-20, -20], [-6, -20], [6, -20], [20, -20], [-22, -10], [22, 10], [-14, -8], [14, 8], [-20, 20], [-6, 20], [6, 20], [20, 20], [22, -10], [-22, 10], [0, -14], [0, 14], [-14, 8], [14, -8], [-25, 13], [25, -13]];
  const upper = [[0, 0], [0, 5.5], [0, -5.5], [-5, 0], [5, 0], [-13, 0], [13, 0], [-24, 0], [24, 0]];
  const nodes = [...ground.map(([x, z]) => ({ x, y: 0, z })), ...upper.map(([x, z]) => ({ x, y: 3, z }))];
  const at = (x, z, y) => nodes.findIndex((n) => n.x === x && n.z === z && n.y === y);
  const edges = linkNodes(nodes, [[at(0, 14, 0), at(0, 5.5, 3)], [at(0, -14, 0), at(0, -5.5, 3)], [at(-25, 13, 0), at(-24, 0, 3)], [at(25, -13, 0), at(24, 0, 3)]]);
  return { nodes, edges };
}

// ---------- ütközés ----------
const hit = (x, y, z, h) => {
  for (const s of BOXES) if (x + HW > s.x0 + EPS && x - HW < s.x1 - EPS && z + HW > s.z0 + EPS && z - HW < s.z1 - EPS && y + h > s.y0 + EPS && y < s.y1 - EPS) return s;
  return null;
};
export const blocked = hit;
// a test (b: x,y,z talp, h magasság, vy) elmozdítása; a vízszintesen elé kerülő ≤ STEP magas peremre fellép
export function moveBody(b, dx, dy, dz) {
  b.y += dy; b.ground = false;
  for (let i = 0, s; i < 4 && (s = hit(b.x, b.y, b.z, b.h)); i++) {
    if (dy <= 0) { b.y = s.y1; b.ground = true; } else b.y = s.y0 - b.h;
    b.vy = 0;
  }
  for (const ax of ['x', 'z']) {
    b[ax] += ax === 'x' ? dx : dz;
    for (let i = 0, s; i < 4 && (s = hit(b.x, b.y, b.z, b.h)); i++) {
      if (s.y1 - b.y <= STEP && b.vy <= 0.5 && !hit(b.x, s.y1, b.z, b.h)) { b.y = s.y1; b.ground = true; if (b.vy < 0) b.vy = 0; continue; }
      const d = (ax === 'x' ? dx : dz) || (ax === 'x' ? b.x - (s.x0 + s.x1) / 2 : b.z - (s.z0 + s.z1) / 2);   // álló helyzetben a doboz közepétől tolunk el
      if (ax === 'x') { b.x = d > 0 ? s.x0 - HW : s.x1 + HW; b.vx = 0; } else { b.z = d > 0 ? s.z0 - HW : s.z1 + HW; b.vz = 0; }
    }
  }
  // nyugvó helyzetben (vy = 0) nincs lefelé mozgás, mégis a talajon állunk: a pár milliméteres rés alatti doboz tartja
  if (!b.ground && b.vy <= 0 && hit(b.x, b.y - 0.02, b.z, b.h)) b.ground = true;
}
// lefelé lépcsőn nem „repülünk”: ha az előbb a talajon álltunk, a közeli (≤ r) talajra tapadunk
export function snapDown(b, r = 0.45) {
  let top = -1e9;
  for (const s of BOXES) if (b.x + HW > s.x0 + EPS && b.x - HW < s.x1 - EPS && b.z + HW > s.z0 + EPS && b.z - HW < s.z1 - EPS && s.y1 <= b.y + EPS && s.y1 >= b.y - r && s.y1 > top) top = s.y1;
  if (top > -1e9) { b.y = top; b.vy = 0; b.ground = true; }
}

// ---------- sugarak ----------
export function rayAABB(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  for (const [o, d, a, b] of [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return Infinity; continue; }
    let ta = (a - o) / d, tb = (b - o) / d; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return Infinity;
  }
  return t0;
}
export function rayBoxes(ox, oy, oz, dx, dy, dz, max) {
  let best = max;
  for (const s of BOXES) { const t = rayAABB(ox, oy, oz, dx, dy, dz, s.x0, s.y0, s.z0, s.x1, s.y1, s.z1); if (t < best) best = t; }
  return best;
}
// egy játékos találati dobozai: test + fej (guggolva alacsonyabb); {t, head} vagy null
export function rayPlayer(ox, oy, oz, dx, dy, dz, max, e) {
  const bh = e.cr ? 0.8 : 1.3, th = e.cr ? CROUCH : STAND;
  const tb = rayAABB(ox, oy, oz, dx, dy, dz, e.x - 0.4, e.y, e.z - 0.4, e.x + 0.4, e.y + bh, e.z + 0.4);
  const tH = rayAABB(ox, oy, oz, dx, dy, dz, e.x - 0.25, e.y + bh, e.z - 0.25, e.x + 0.25, e.y + th, e.z + 0.25);
  const t = Math.min(tb, tH); if (t > max) return null;
  return { t, head: tH <= tb };
}
