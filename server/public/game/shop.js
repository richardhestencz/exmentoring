// A 24/7 bolt: az ajtón E-vel belépve egy külön belső térbe kerülünk (a világtól messze, x = 2000 körül), polcokkal, hűtőkkel,
// a pult mögött mosómedve eladóval. A pultnál E: vásárlás (fegyverek és lőszer a weapons.js listájából, hot-dog, mellény).
import { G } from './core.js';
import { raccoon } from './player.js';
const THREE = G.THREE, scene = G.scene, $ = (id) => document.getElementById(id);
const IX = 2000, IZ = 0, W = 16, D = 12, H = 4.2;   // a belső tér közepe és mérete

function room() {
  const floorTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#e9e4dc' : '#cfd8dc'; g.fillRect(i * 32, j * 32, 32, 32); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / 2, D / 2); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(IX, 0.001, IZ); floor.receiveShadow = true; scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, roughness: 0.9, side: THREE.DoubleSide });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, side: THREE.DoubleSide }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(IX, H, IZ); scene.add(ceil);
  const wall = (x0, z0, x1, z1) => {
    const w = Math.max(0.2, x1 - x0), d = Math.max(0.2, z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat); m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m);
    G.addSolid({ x0, z0, x1, z1 });
  };
  const x0 = IX - W / 2, x1 = IX + W / 2, z0 = IZ - D / 2, z1 = IZ + D / 2;
  wall(x0 - 0.2, z0, x0, z1); wall(x1, z0, x1 + 0.2, z1); wall(x0, z0 - 0.2, x1, z0);
  wall(x0, z1, IX - 1.2, z1 + 0.2); wall(IX + 1.2, z1, x1, z1 + 0.2);   // elöl ajtónyílás
  // az ajtó mögött az utca fénye (a kilépés pontja)
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), new THREE.MeshBasicMaterial({ color: 0xffc89a }));
  door.position.set(IX, 1.3, z1 + 0.25); door.rotation.y = Math.PI; scene.add(door); G.addSolid({ x0: IX - 1.2, z0: z1 + 0.2, x1: IX + 1.2, z1: z1 + 0.4 });
  // fények: mennyezeti neoncsövek
  for (const dx of [-4, 0, 4]) {
    const l = new THREE.PointLight(0xfff6e0, 7, 12, 1.5); l.position.set(IX + dx, H - 0.3, IZ); scene.add(l);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff })); tube.position.set(IX + dx, H - 0.05, IZ); scene.add(tube);
  }
  // pult hátul középen, mögötte az eladó
  const counter = new THREE.Mesh(new THREE.BoxGeometry(5, 1.05, 1), new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.5 }));
  counter.position.set(IX, 0.525, z0 + 2.2); counter.castShadow = true; scene.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.06, 1.15), new THREE.MeshStandardMaterial({ color: 0xdedede })); top.position.set(IX, 1.08, z0 + 2.2); scene.add(top);
  G.addSolid({ x0: IX - 2.5, z0: z0 + 1.7, x1: IX + 2.5, z1: z0 + 2.7, h: 1.08 });
  // a pult fölött tábla
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 128; const g = sc.getContext('2d');
  g.fillStyle = '#e8343a'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#fff'; g.font = '900 64px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('24/7 · FEGYVER · KAJA', 256, 68);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: st })); signM.position.set(IX, H - 0.9, z0 + 0.02); scene.add(signM);
  return { x0, x1, z0, z1, counterZ: z0 + 2.2 };
}

let R = null, back = null;
export async function init() {
  R = room();
  G.ceilings.push((x, z) => (Math.abs(x - IX) < W / 2 + 1 && Math.abs(z - IZ) < D / 2 + 1 ? H : 1e9));
  const shop = G.world.places.shop;
  // polcok és hűtők a Kenney Furniture Kitből (CC0)
  const F = '/game/assets/furniture/';
  const put = (f, o) => G.place(F + f, o).catch(() => null);
  await Promise.all([
    ...[-5.5, -3, 3, 5.5].map((dx) => put('bookcaseOpen.glb', { x: IX + dx, z: IZ + 0.5, height: 2.1, ry: 0 }).then((o) => o && G.addSolid({ x0: IX + dx - 0.8, z0: IZ + 0.2, x1: IX + dx + 0.8, z1: IZ + 0.8 }))),
    ...[-5.5, -3, 3, 5.5].map((dx) => put('bookcaseOpenLow.glb', { x: IX + dx, z: IZ + 2.6, height: 1.2, ry: Math.PI })),
    ...[-6.2, -4.9].map((dx) => put('kitchenFridgeLarge.glb', { x: IX + dx, z: R.z0 + 0.5, height: 2.2 }).then((o) => o && G.addSolid({ x0: IX + dx - 0.6, z0: R.z0, x1: IX + dx + 0.6, z1: R.z0 + 1 }))),
    ...[5, 6.2].map((dx) => put('kitchenFridge.glb', { x: IX + dx, z: R.z0 + 0.5, height: 1.9 })),
    put('cardboardBoxClosed.glb', { x: IX + 6.6, z: IZ + 4.5, size: 0.8, ry: 0.4 }), put('cardboardBoxOpen.glb', { x: IX + 6, z: IZ + 5, size: 0.7 }),
    put('rugRectangle.glb', { x: IX, z: R.z1 - 1.4, size: 3, ry: Math.PI / 2 }),
  ]);
  for (const dx of [-5.5, -3, 3, 5.5]) G.addSolid({ x0: IX + dx - 0.8, z0: IZ + 2.3, x1: IX + dx + 0.8, z1: IZ + 2.9, h: 1.2 });
  // az eladó a pult mögött; néha int
  const clerk = raccoon(0xffd8b0); clerk.root.position.set(IX, 0, R.z0 + 1.2); clerk.root.rotation.y = 0; clerk.play('idle');
  G.on('update', (dt) => { if (Math.abs(G.player.x - IX) < 30) clerk.mixer.update(dt); });

  // be: az utcáról a bolt ajtaján
  G.interact.push({ x: shop.door.x, z: shop.door.z, r: 2.4, label: 'Belépés: 24/7 bolt', when: () => !G.player.inCar, act: () => {
    back = { x: shop.door.x, z: shop.door.z + (shop.ry === 0 ? 1.2 : -1.2), ry: shop.ry };
    fade(() => { move(IX, R.z1 - 1.2, Math.PI); G.hud.toast('A pultnál vásárolhatsz (E).'); G.sound('door'); });
  } });
  // ki
  G.interact.push({ x: IX, z: R.z1 - 0.6, r: 1.6, label: 'Kilépés az utcára', act: () => {
    const b = back || { x: shop.door.x, z: shop.door.z + 1.2, ry: 0 };
    fade(() => { move(b.x, b.z, b.ry); G.sound('door'); });
  } });
  // vásárlás a pultnál
  G.interact.push({ x: IX, z: R.counterZ + 1.1, r: 1.8, label: 'Vásárlás', act: openShop });
}
function move(x, z, ry) {
  const P = G.player; P.x = x; P.z = z; P.y = 0; P.ry = ry; G.cam.yaw = ry + Math.PI; P.av.root.position.set(x, 0, z); P.av.root.rotation.y = ry;
}
function fade(fn) { const f = $('flash'); f.style.background = '#000'; f.style.transition = 'opacity .25s'; f.style.opacity = 1; setTimeout(() => { fn(); f.style.opacity = 0; setTimeout(() => { f.style.background = '#fff'; f.style.transition = ''; }, 300); }, 260); }

// ---------- a vásárlás menüje ----------
function items() {
  const P = G.player, out = [], Wp = G.WEAPONS || {};
  for (const [id, w] of Object.entries(Wp)) {
    if (id === 'fist' || !w.price) continue;
    const own = (P.weapons || []).find((x) => x.id === id);
    if (!own) out.push({ label: w.name, price: w.price, buy: () => G.giveWeapon(id, w.mag * 3) });
    else out.push({ label: `${w.name} lőszer (+${w.mag * 2})`, price: w.ammoPrice || Math.round(w.price / 8), buy: () => G.addAmmo(id, w.mag * 2) });
  }
  out.push({ label: 'Hot-dog (+40 életerő)', price: 10, buy: () => { P.hp = Math.min(100, P.hp + 40); G.hud.hp(); }, off: () => P.hp >= 100 });
  out.push({ label: 'Golyóálló mellény', price: 150, buy: () => { P.armor = 100; G.hud.hp(); }, off: () => P.armor >= 100 });
  out.push({ label: 'Energiaital (gyorsabb futás 60 s)', price: 25, buy: () => { G.hud.toast('Szárnyakat ad. 60 másodpercig.'); P.boost = performance.now() + 60000; } });
  return out;
}
function openShop() {
  G.mode = 'pause'; G.keepUnlocked = true; document.exitPointerLock?.();
  const box = $('menubox'), P = G.player;
  const draw = () => {
    box.innerHTML = `<h2>24/7 Bolt</h2><small>Pénzed: $${Math.floor(P.money)}</small>`;
    for (const it of items()) {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<span>${it.label}</span><span>$${it.price}</span>`;
      b.disabled = P.money < it.price || (it.off && it.off());
      b.onclick = () => { if (P.money < it.price) return; P.money -= it.price; it.buy(); G.hud.money(); G.hud.weapon(); G.sound('buy'); draw(); };
      box.appendChild(b);
    }
    const c = document.createElement('button'); c.type = 'button'; c.innerHTML = '<span>← Kész</span>'; c.onclick = close; box.appendChild(c);
    box.querySelector('button:not(:disabled)')?.focus();
  };
  const close = () => { $('menu').hidden = true; G.keepUnlocked = false; G.mode = 'play'; G.renderer.domElement.requestPointerLock?.(); removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.code === 'Escape') close(); };
  addEventListener('keydown', esc);
  draw(); $('menu').hidden = false;
}
