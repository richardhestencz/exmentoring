// A világ: a tisztás (ahonnan minden indul), földút a városba, Loop City rácsos utcái pasztell házakkal, pálmafák,
// tengerpart és óceán naplementében. Itt van a bolt és a lőtér bejárata is.
import { G } from './core.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
const THREE = G.THREE, scene = G.scene;

// ---------- elrendezés (méterben; +x kelet, a tenger felé) ----------
export const S = 1.35;                                   // a tisztás nagyítása a játékos mosómedvéhez (a 3D tisztásé 0,95 m, itt ~1,3 m)
const XS = [60, 130, 200, 270, 340], ZS = [-140, -70, 0, 70, 140];
const HALF = 5.5, WALK = 9;                               // aszfalt fél-szélesség, járda széle
const BEACH = 352, SEA = 430;
G.world.roads = { xs: XS, zs: ZS, half: HALF, walk: WALK, x0: XS[0], x1: XS[XS.length - 1], z0: ZS[0], z1: ZS[ZS.length - 1] };
G.world.spawn = { x: 0.5 * S, z: 3.2 * S, ry: Math.PI };   // a tűz mellett, a város felé néz majd a kamera
G.world.beach = BEACH; G.world.sea = SEA;
const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

// ---------- ég, köd, óceán ----------
const sky = new Sky(); sky.scale.setScalar(2000); scene.add(sky);
Object.assign(sky.material.uniforms, {}); const su = sky.material.uniforms;
su.turbidity.value = 9; su.rayleigh.value = 3.2; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.86;
su.sunPosition.value.set(G.sunDir.x, 0.035, G.sunDir.z).normalize().multiplyScalar(1000);   // az égen alacsonyabban áll a nap (naplemente), a fény maradhat magasabban
// hullám-normáltérkép vászonból (a three npm-csomagja nem hozza a mintaképet): néhány szinuszhullám összege, a meredekségből normál
function waveNormals() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
  const W = Array.from({ length: 9 }, () => [1 + Math.floor(rnd() * 6), Math.floor(rnd() * 7) - 3, rnd() * 6.28, 0.4 + rnd()]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0;
    for (const [kx, ky, ph, a] of W) { const k = 2 * Math.PI / N, v = Math.cos((kx * x + ky * y) * k + ph) * a; dx += v * kx; dy += v * ky; }
    const l = Math.hypot(dx * 0.15, dy * 0.15, 1), i = (y * N + x) * 4;
    im.data[i] = (-dx * 0.15 / l * 0.5 + 0.5) * 255; im.data[i + 1] = (-dy * 0.15 / l * 0.5 + 0.5) * 255; im.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const water = new Water(new THREE.PlaneGeometry(6000, 6000), {
  textureWidth: 512, textureHeight: 512,
  waterNormals: waveNormals(),
  sunDirection: G.sunDir.clone(), sunColor: 0xffc08a, waterColor: 0x1c4f6e, distortionScale: 2.2, fog: true,
});
water.rotation.x = -Math.PI / 2; water.position.set(SEA + 3000, -0.6, 0); scene.add(water);
G.on('update', (dt) => { water.material.uniforms.time.value += dt * 0.6; });

// ---------- talaj: fű, a város aszfaltja és járdái (vászon-textúrák), homok ----------
function canvasTex(w, h, draw, rep = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 8; return t;
}
const noise = (g, w, h, cols, n, sz) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(rnd() * w, rnd() * h, sz * (0.5 + rnd()), sz * (0.5 + rnd())); } };
const grassTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#6d8f3a'; g.fillRect(0, 0, w, h); noise(g, w, h, ['#7da447', '#5c7d30', '#8bb054', '#66863a'], 2500, 3); }, [400, 400]);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(BEACH + 700, 1600), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));   // a fű a partig tart, onnan homok, aztán tenger
ground.rotation.x = -Math.PI / 2; ground.position.set((BEACH - 700) / 2, -0.02, 0); ground.receiveShadow = true; scene.add(ground);
const sandTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#e9cf9a'; g.fillRect(0, 0, w, h); noise(g, w, h, ['#f3dcac', '#d9bb83', '#efd5a2'], 3000, 2); }, [40, 120]);
const sand = new THREE.Mesh(new THREE.PlaneGeometry(SEA - BEACH + 8, 900), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
sand.rotation.x = -Math.PI / 2; sand.position.set((BEACH + SEA + 8) / 2, -0.01, 0); sand.receiveShadow = true; scene.add(sand);
// part-szegély: a sekély víz világosabb sávja
const shore = new THREE.Mesh(new THREE.PlaneGeometry(26, 900), new THREE.MeshBasicMaterial({ color: 0x7fd3d0, transparent: true, opacity: 0.55, depthWrite: false }));
shore.rotation.x = -Math.PI / 2; shore.position.set(SEA + 4, -0.3, 0); scene.add(shore);

// utak: egy aszfaltcsík felezővonallal és zebrával; a járda kicsit világosabb, szegéllyel
const asphalt = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#5b5a62'; g.fillRect(0, 0, w, h); noise(g, w, h, ['#66656d', '#4f4e56', '#6e6d75'], 4000, 2); });
const roadMat = (len, vertical) => {
  const t = canvasTex(64, 512, (g, w, h) => {
    g.drawImage(asphalt.image, 0, 0, w, h);
    g.fillStyle = '#f2c94c'; g.fillRect(w / 2 - 2, 0, 1.5, h); g.fillRect(w / 2 + 1, 0, 1.5, h);   // dupla sárga felező
    g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(3, 0, 1.5, h); g.fillRect(w - 4.5, 0, 1.5, h);
  }, [1, len / 16]);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
};
const walkMat = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#cfc4b8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b3a798'; g.lineWidth = 2; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } noise(g, w, h, ['#d8cdc1', '#c4b8ab'], 400, 2); }, [1, 1]), roughness: 0.95 });
walkMat.map.repeat.set(1, 1);
const X0 = XS[0], X1 = XS[XS.length - 1], Z0 = ZS[0], Z1 = ZS[ZS.length - 1];
function strip(cx, cz, w, l, mat, y, rotY) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat); m.rotation.set(-Math.PI / 2, 0, rotY || 0); m.position.set(cx, y, cz); m.receiveShadow = true; scene.add(m); return m;
}
// járdák: minden háztömb körül egy keret (a járda szélessége WALK-HALF)
const sideMat = (w, l) => { const m = walkMat.clone(); m.map = walkMat.map.clone(); m.map.needsUpdate = true; m.map.repeat.set(w / 3, l / 3); return m; };
for (const x of XS) strip(x, (Z0 + Z1) / 2, HALF * 2, Z1 - Z0 + HALF * 2, roadMat(Z1 - Z0, true), 0.01);
for (const z of ZS) for (let i = 0; i < XS.length - 1; i++) {   // vízszintes szakaszok a kereszteződések közt (a kereszteződés a függőleges úté)
  const a = XS[i] + HALF, b = XS[i + 1] - HALF; strip((a + b) / 2, z, HALF * 2, b - a, roadMat(b - a), 0.012, Math.PI / 2);
}
// zebrák a kereszteződések előtt
const zebra = new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(245,245,240,.85)'; for (let i = 0; i < w; i += 16) g.fillRect(i, 0, 8, h); }), transparent: true, depthWrite: false });
for (const x of XS) for (const z of ZS) {
  for (const s of [-1, 1]) {
    strip(x + s * (HALF + 1.6), z, 2.6, HALF * 2, zebra, 0.02);
    const m = strip(x, z + s * (HALF + 1.6), 2.6, HALF * 2, zebra, 0.02, Math.PI / 2);
  }
}
const blocks = [];
for (let i = 0; i < XS.length - 1; i++) for (let j = 0; j < ZS.length - 1; j++) {
  const b = { x0: XS[i] + HALF, x1: XS[i + 1] - HALF, z0: ZS[j] + HALF, z1: ZS[j + 1] - HALF, i, j };
  blocks.push(b);
  const w = b.x1 - b.x0, l = b.z1 - b.z0;
  const curb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, l), sideMat(w, l));
  curb.position.set((b.x0 + b.x1) / 2, 0.08, (b.z0 + b.z1) / 2); curb.receiveShadow = true; scene.add(curb);
  b.inner = { x0: b.x0 + (WALK - HALF), x1: b.x1 - (WALK - HALF), z0: b.z0 + (WALK - HALF), z1: b.z1 - (WALK - HALF) };
}
G.world.blocks = blocks;
// a járda fellépője: a talaj ott 0,16 m (rá lehet lépni)
for (const b of blocks) G.addSolid({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: 0.16, top: true });

// ---------- házak: pasztell színek, ablakos homlokzat-textúra, lapos tető peremmel, néhány neon felirat ----------
const PASTEL = ['#f4b6c2', '#a8e6cf', '#ffd3b6', '#dcedc1', '#b5c7f2', '#ffe08a', '#f7c5e0', '#c3f0f0', '#f9d5a7', '#e2c2f2', '#fffaf0', '#ffc1a1'];
const winTex = {};
function facade(color, floors, cols) {
  const k = color + floors + 'x' + cols; if (winTex[k]) return winTex[k];
  const t = canvasTex(cols * 32, floors * 40, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const lit = rnd() < 0.18;
      g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(c * 32 + 5, f * 40 + 7, 22, 28);
      g.fillStyle = lit ? '#ffe2a8' : (rnd() < 0.5 ? '#3a5872' : '#4d6f8a'); g.fillRect(c * 32 + 7, f * 40 + 9, 18, 24);
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(c * 32 + 7, f * 40 + 9, 18, 4);
    }
    g.fillStyle = 'rgba(255,255,255,.35)'; for (let f = 0; f <= floors; f++) g.fillRect(0, f * 40, w, 3);
  });
  winTex[k] = t; return t;
}
const roofMat = new THREE.MeshStandardMaterial({ color: 0x8c8580, roughness: 0.9 });
export function building(x0, z0, x1, z1, h, color, opt = {}) {
  const w = x1 - x0, l = z1 - z0, floors = Math.max(1, Math.round(h / 3.6));
  const side = (len) => { const m = new THREE.MeshStandardMaterial({ map: facade(color, floors, Math.max(1, Math.round(len / 3.2))), roughness: 0.75 }); return m; };
  const mats = [side(l), side(l), roofMat, roofMat, side(w), side(w)];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mats); m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
  const par = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.8, l + 0.4), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.85), roughness: 0.8 }));
  par.position.set(m.position.x, h + 0.2, m.position.z); par.castShadow = true; scene.add(par);
  if (!opt.noSolid) G.addSolid({ x0, z0, x1, z1, h: h + 0.6 });
  return m;
}
// egy felirat (neon): vászonra írt szöveg, ragyogó anyaggal, a megadott homlokzaton
export function sign(text, x, y, z, ry, w = 8, color = '#ff4fa3', bg = 'rgba(20,10,30,.85)') {
  const t = canvasTex(512, 128, (g, cw, ch) => {
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.font = '900 78px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color; g.fillText(text, cw / 2, ch / 2 + 4); g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = .55; g.fillText(text, cw / 2, ch / 2 + 4);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
}
const NEON = ['MOTEL', 'BAR', 'PIZZA', 'TACOS', 'CLUB', 'HOTEL', 'GYM', 'DINER', 'SURF', 'ARCADE'];

// ---------- különleges helyek: a bolt és a lőtér (a homlokzatuk az úttest felé, előttük ajtó-pont) ----------
G.world.places = {};
// a bolt: az (1. oszlop, 2. sor) háztömb déli oldalán, a z=0 út felé
function special(b, side, name, w, d, h, color, neon, neonColor) {
  const cx = (b.inner.x0 + b.inner.x1) / 2, inner = b.inner;
  let x0, x1, z0, z1, door, ry;
  if (side === 'n') { x0 = cx - w / 2; x1 = cx + w / 2; z0 = inner.z0; z1 = inner.z0 + d; door = { x: cx, z: z0 - 1.2 }; ry = Math.PI; }
  else { x0 = cx - w / 2; x1 = cx + w / 2; z1 = inner.z1; z0 = inner.z1 - d; door = { x: cx, z: z1 + 1.2 }; ry = 0; }
  building(x0, z0, x1, z1, h, color);
  const fz = side === 'n' ? z0 - 0.05 : z1 + 0.05;
  sign(neon, cx, h - 1.6, fz, ry, Math.min(w * 0.8, 12), neonColor);
  // üvegajtó és kirakat
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 2.6), new THREE.MeshStandardMaterial({ color: 0x9fd6ff, emissive: 0x2a5577, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.4 }));
  glass.position.set(cx, 1.5, fz + (side === 'n' ? -0.02 : 0.02)); glass.rotation.y = ry; scene.add(glass);
  const fr = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), new THREE.MeshStandardMaterial({ color: 0x2a2a30, emissive: 0x332211 }));
  fr.position.set(cx, 1.25, fz + (side === 'n' ? -0.04 : 0.04)); fr.rotation.y = ry; scene.add(fr);
  return (G.world.places[name] = { x0, x1, z0, z1, door, ry, cx });
}
const blockAt = (i, j) => blocks.find((b) => b.i === i && b.j === j);
const shop = special(blockAt(1, 1), 's', 'shop', 22, 16, 7, '#fff3c4', '24/7 BOLT', '#3ef0ff');
// a lőtér a tisztás és a város között, a földút mellett (Richard: legyen közelebb a tisztáshoz); bejárata a földút felé
const range = special({ inner: { x0: 24, x1: 50, z0: -36, z1: -13 } }, 's', 'range', 24, 20, 9, '#c9d6df', 'LŐTÉR', '#ff4040');
{ // betonozott előtér az ajtó és a földút között
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), new THREE.MeshStandardMaterial({ color: 0xbdb5aa, roughness: 0.95 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(37, 0.01, -8.5); pad.receiveShadow = true; scene.add(pad);
}

// ---------- a többi telek: 2-4 ház háztömbönként, a sarkokon magasabbak; a part felőli sor szállodák ----------
const taken = (b, x0, z0, x1, z1) => Object.values(G.world.places).some((p) => x0 < p.x1 + 3 && x1 > p.x0 - 3 && z0 < p.z1 + 3 && z1 > p.z0 - 3);
G.world.parks = [];
for (const b of blocks) {
  const { x0, x1, z0, z1 } = b.inner, W = x1 - x0, L = z1 - z0;
  if (b.i === 2 && b.j === 2) { G.world.parks.push(b); continue; }   // park a város közepén
  const coast = b.i === XS.length - 2;
  const nx = coast ? 1 : 2, nz = 2;
  for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) {
    const gx = 2.5, bx0 = x0 + (W / nx) * a + (a ? gx / 2 : 0), bx1 = x0 + (W / nx) * (a + 1) - (a < nx - 1 ? gx / 2 : 0);
    const bz0 = z0 + (L / nz) * c + (c ? gx / 2 : 0), bz1 = z0 + (L / nz) * (c + 1) - (c < nz - 1 ? gx / 2 : 0);
    // a ház a telek utca felőli oldalán, hátul udvar
    const dz = (bz1 - bz0) * (0.55 + rnd() * 0.35), fx0 = bx0 + rnd() * 1.5, fx1 = bx1 - rnd() * 1.5;
    const hz0 = c === 0 ? bz0 : bz1 - dz, hz1 = c === 0 ? bz0 + dz : bz1;
    if (taken(b, fx0, hz0, fx1, hz1)) continue;
    const h = coast ? 26 + rnd() * 30 : (rnd() < 0.25 ? 18 + rnd() * 26 : 6 + rnd() * 9);
    const color = PASTEL[Math.floor(rnd() * PASTEL.length)];
    building(fx0, hz0, fx1, hz1, h, color);
    if (rnd() < 0.45) {
      const fz = c === 0 ? hz0 - 0.05 : hz1 + 0.05;
      sign(NEON[Math.floor(rnd() * NEON.length)], (fx0 + fx1) / 2, Math.min(h - 1.5, 5.5), fz, c === 0 ? Math.PI : 0, 6, ['#ff4fa3', '#3ef0ff', '#ffd23e', '#7cff6b', '#c06bff'][Math.floor(rnd() * 5)]);
    }
  }
}

// ---------- a tisztás: a 3D tisztás tárgyai, nagyítva, a város nyugati szélén; földút vezet keletre ----------
const pines = [[-7, -0.6, 7.2], [-6.6, 2.4, 6.4], [-6.1, -2.8, 7.8], [-4.9, -4.5, 7.4], [-3.4, -5.6, 8.2], [-1.8, -6.4, 7.6], [-0.2, -6.9, 8.4], [1.4, -6.9, 7.2],
  [2.9, -7.3, 6.6], [5.2, -6.2, 7], [7.0, -4.3, 6.4], [7.6, -1.6, 6], [-5.8, 4.4, 6.2], [-8, 6.5, 7], [-2, 8.5, 6.5], [9, -8, 7.5], [-10, -6, 8], [-9.5, 2, 7.2]];
const clearingTex = canvasTex(512, 512, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2); gr.addColorStop(0, '#e7a843'); gr.addColorStop(0.75, '#c98a2c'); gr.addColorStop(1, 'rgba(201,138,44,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h); noise(g, w, h, ['#a8691f', '#f2c25c', '#7f8a2e'], 1500, 3);
});
const clearing = new THREE.Mesh(new THREE.CircleGeometry(11.5 * S, 64), new THREE.MeshStandardMaterial({ map: clearingTex, transparent: true, roughness: 1 }));
clearing.rotation.x = -Math.PI / 2; clearing.position.y = 0.005; clearing.receiveShadow = true; scene.add(clearing);
const dirt = canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#b98a52'; g.fillRect(0, 0, w, h); noise(g, w, h, ['#a57846', '#c99d63', '#8f6a3c'], 600, 2); g.fillStyle = 'rgba(110,140,60,.6)'; g.fillRect(w / 2 - 3, 0, 6, h); }, [1, 12]);
strip(XS[0] / 2 + 5, 0, 5, XS[0] - 10 - HALF, new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }), 0.008, Math.PI / 2);
// tó: kék ellipszis (a tisztás hátsó jobb sarkában), nem lehet belemenni
{
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x5aa2c0, roughness: 0.15, metalness: 0.2 }));
  lake.rotation.set(-Math.PI / 2, 0, -0.62); lake.scale.set(3.4 * S, 1.45 * S, 1); lake.position.set(4.2 * S, 0.015, -3.0 * S); scene.add(lake);
}
const props = [];
G.world.clearingReady = Promise.all([
  G.place('/img/m3d/firering.glb', { x: 0, z: 0.6 * S, size: 2.2 * S }).then((o) => props.push(o)),
  G.place('/img/m3d/log.glb', { x: -2.5 * S, z: 0.65 * S, size: 2.1 * S, ry: 0.95 }).then((o) => { o.scale.y *= 0.45; props.push(o); }),
  G.place('/img/m3d/log.glb', { x: 2.5 * S, z: 0.65 * S, size: 2.1 * S, ry: -0.95 }).then((o) => { o.scale.y *= 0.45; props.push(o); }),
  G.place('/img/m3d/picnic.glb', { x: -4.6 * S, z: 1.5 * S, size: 2.1 * S }).then((o) => { props.push(o); G.addSolid({ x0: -4.6 * S - 1.2, x1: -4.6 * S + 1.2, z0: 1.5 * S - 0.9, z1: 1.5 * S + 0.9, h: 1.0 }); }),
  G.place('/img/m3d/pub.glb', { x: 0, z: -2.1 * S, size: 2.4 * S }).then((o) => { props.push(o); G.addSolid({ x0: -1.4, x1: 1.4, z0: -2.1 * S - 1.1, z1: -2.1 * S + 1.1, h: 1.2 }); }),
  G.place('/img/m3d/hammock.glb', { x: 4.5 * S, z: 3.4 * S, size: 3.0 * S, ry: -0.55 }).then((o) => props.push(o)),
  G.place('/img/m3d/canoe.glb', { x: 4.5 * S, z: -2.75 * S, size: 2.2 * S, ry: -0.6 }).then((o) => props.push(o)),
  ...pines.map(([x, z, h]) => G.place('/img/m3d/pine.glb', { x: x * S, z: z * S, height: h * S * 0.95, ry: (x * 7 + z) % 6.28 }).then((o) => { props.push(o); G.addSolid({ x0: x * S - 0.45, x1: x * S + 0.45, z0: z * S - 0.45, z1: z * S + 0.45 }); })),
]).catch((e) => console.warn('tisztás', e));
// a tűz: villódzó pontfény és lángcsóva
const fire = new THREE.PointLight(0xff8a3a, 6, 9, 1.6); fire.position.set(0, 0.8, 0.6 * S); scene.add(fire);
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
flame.position.set(0, 0.6, 0.6 * S); scene.add(flame);
G.on('update', (dt, t) => { const f = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3); fire.intensity = 6 * f; flame.scale.set(f, 0.9 + 0.25 * Math.sin(t * 9), f); });
G.addSolid({ x0: -0.7, x1: 0.7, z0: 0.6 * S - 0.7, z1: 0.6 * S + 0.7, h: 0.3 });
// a tó nem járható (egyszerű téglalap-közelítés)
G.addSolid({ x0: 4.2 * S - 3.6, x1: 4.2 * S + 3.6, z0: -3.0 * S - 1.4, z1: -3.0 * S + 1.4, h: 0.01 });
// útjelző tábla a tisztás szélén
sign('LOOP CITY →', 13 * S, 2.3, 2.2, -Math.PI / 2, 4.2, '#ffd23e', 'rgba(40,25,10,.9)');
{ const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2), new THREE.MeshStandardMaterial({ color: 0x5a3a20 })); post.position.set(13 * S + 0.02, 1.1, 2.2); scene.add(post); }

// ---------- pálmák és lámpák a járdák mentén ----------
const PALMS = ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall', 'tree_palm'].map((n) => `/game/assets/nature/${n}.glb`);
function palm(x, z, h = 7 + rnd() * 4) {
  // Kenney Nature Kit pálma (CC0); amíg töltődik, csak az ütközője van meg
  G.place(PALMS[Math.floor(rnd() * PALMS.length)], { x, z, height: h, ry: rnd() * 6.28 }).catch(() => null);
  G.addSolid({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 });
}
const lampMat = new THREE.MeshStandardMaterial({ color: 0x2d2d33, roughness: 0.6, metalness: 0.5 });
function lamp(x, z, ry) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 6, 8), lampMat); p.position.y = 3; g.add(p);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), lampMat); arm.position.set(0.75, 5.95, 0); g.add(arm);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); bulb.position.set(1.45, 5.85, 0); g.add(bulb);
  g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); G.addSolid({ x0: x - 0.15, x1: x + 0.15, z0: z - 0.15, z1: z + 0.15 });
}
for (const b of blocks) {
  const o = 1.4;
  for (let x = b.x0 + 8; x < b.x1 - 6; x += 16) { (rnd() < 0.6 ? palm : (a, c) => lamp(a, c, Math.PI / 2))(x, b.z0 + o); (rnd() < 0.6 ? palm : (a, c) => lamp(a, c, -Math.PI / 2))(x, b.z1 - o); }
  for (let z = b.z0 + 8; z < b.z1 - 6; z += 16) { palm(b.x0 + o, z); palm(b.x1 - o, z); }
}
// a park: fű, pálmák, padok helyett szökőkút
for (const b of G.world.parks) {
  const { x0, x1, z0, z1 } = b.inner;
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: grassTex.clone(), roughness: 1 }));
  lawn.material.map.repeat.set(12, 12); lawn.material.map.needsUpdate = true; lawn.rotation.x = -Math.PI / 2; lawn.position.set((x0 + x1) / 2, 0.17, (z0 + z1) / 2); lawn.receiveShadow = true; scene.add(lawn);
  for (let i = 0; i < 14; i++) palm(x0 + 4 + rnd() * (x1 - x0 - 8), z0 + 4 + rnd() * (z1 - z0 - 8));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.3, 0.7, 32), new THREE.MeshStandardMaterial({ color: 0xe8dccb })); basin.position.set(cx, 0.35, cz); scene.add(basin);
  const wtr = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.05, 32), new THREE.MeshStandardMaterial({ color: 0x5fc6e0, roughness: 0.05, metalness: 0.3 })); wtr.position.set(cx, 0.66, cz); scene.add(wtr);
  G.addSolid({ x0: cx - 4, x1: cx + 4, z0: cz - 4, z1: cz + 4, h: 0.7, top: true });
}
// a parton: pálmák és napernyők
for (let z = -200; z <= 200; z += 14) { palm(BEACH + 10 + rnd() * 30, z + rnd() * 6); }
for (let z = -180; z <= 180; z += 22) {
  const c = ['#ff5f7e', '#3ec7ff', '#ffd23e', '#7cff6b'][Math.floor(rnd() * 4)];
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4), new THREE.MeshStandardMaterial({ color: 0xffffff })); pole.position.set(BEACH + 50 + rnd() * 20, 1.2, z); scene.add(pole);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 10), new THREE.MeshStandardMaterial({ color: c })); top.position.set(pole.position.x, 2.5, z); scene.add(top);
}
// a világ széle: láthatatlan falak (a tengerbe sem lehet besétálni)
G.addSolid({ x0: SEA, x1: SEA + 50, z0: -1000, z1: 1000 });
G.addSolid({ x0: -120, x1: -100, z0: -1000, z1: 1000 });
G.addSolid({ x0: -120, x1: SEA, z0: -320, z1: -300 });
G.addSolid({ x0: -120, x1: SEA, z0: 300, z1: 320 });
