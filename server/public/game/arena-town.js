// "Mosóváros": egy rövid, zsákutcás kertvárosi utca, két egymással szemben álló kétszintes ház (sárga és zöld), hátsó kertek, kerítések,
// autók, egy roncs busz az utca közepén. Eredeti elrendezés (nem másolat). 70 x 50 m. A ház a saját 180 fokos elforgatottja a
// másiknak (a zöld = a sárga elforgatva), így a pálya méltányos. Minden doboz egyszerre látszik és ütközik (BOXES), a nyílások valódi rések:
// az ajtón át lehet menni, az ablakon át lőni (a párkány 0,9 m, a nyílás 1,2 m magas), a lépcső 11 fok, egyenként 0,27 m.
import * as THREE from 'three';
import { BOXES, makeBuilder, linkNodes, setSpawns, rayBoxes } from './arena-map.js';

export async function buildTown(scene, loadModel) {
  const { box } = makeBuilder(scene, 0.07);
  const rot = (x, z) => [-x, -z];
  // egy-egy ház/kert elemét kétszer építjük: A = ahogy írtuk, B = 180 fokkal elforgatva (más színekkel)
  const PAL = [
    { wall: '#ffe28a', trim: '#fff6d0', roof: '#c4584a', floor: '#d9b48a', accent: '#e8a23c' },
    { wall: '#a6e0b0', trim: '#effff2', roof: '#4a6fa5', floor: '#c9b08a', accent: '#5aa36a' },
  ];
  const both = (fn) => [0, 1].forEach((side) => {
    const B = (x0, y0, z0, x1, y1, z1, c, sh) => (side ? box(-x1, y0, -z1, -x0, y1, -z0, c, sh) : box(x0, y0, z0, x1, y1, z1, c, sh));
    fn(B, PAL[side], side, (x, z) => (side ? rot(x, z) : [x, z]));
  });
  const deco = (m, shadow = true) => { m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
  const plane = (x0, z0, x1, z1, y, color) => {   // csak látvány: aszfalt, járda, padló, ösvény
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m;
  };

  // ---------- talaj, utca, határ ----------
  box(-36, -1, -26, 36, 0, 26, '#8fd16a', false);
  plane(-35, -5, 35, 5, 0.012, '#4b4e58'); plane(-35, -6.5, 35, -5, 0.014, '#dedbd3'); plane(-35, 5, 35, 6.5, 0.014, '#dedbd3');
  for (let x = -33; x < 33; x += 6) plane(x, -0.1, x + 3, 0.1, 0.02, '#f4d03f');
  const FENCE = '#fbf7ec';
  box(-35.4, 0, -25.4, 35.4, 2.6, -25, FENCE); box(-35.4, 0, 25, 35.4, 2.6, 25.4, FENCE); box(-35.4, 0, -25, -35, 2.6, 25, FENCE); box(35, 0, -25, 35.4, 2.6, 25, FENCE);
  box(-36, 2.6, -26, 36, 16, -25, null); box(-36, 2.6, 25, 36, 16, 26, null); box(-36, 2.6, -25, -35, 16, 25, null); box(35, 2.6, -25, 36, 16, 25, null);   // láthatatlan tető a kerítés fölött

  // ---------- a ház ----------
  // fal az x tengely mentén: [x0,x1] hosszan, [z0,z1] vastagon, nyílások [a,b,párkány,sztok] (a párkány = alsó él, a sztok = felső él)
  const wallX = (B, x0, x1, z0, z1, y0, y1, ops, c) => {
    let cur = x0;
    for (const [a, b, s, t] of ops) { if (a > cur) B(cur, y0, z0, a, y1, z1, c); if (s > y0) B(a, y0, z0, b, s, z1, c); if (t < y1) B(a, t, z0, b, y1, z1, c); cur = b; }
    if (cur < x1) B(cur, y0, z0, x1, y1, z1, c);
  };
  const wallZ = (B, z0, z1, x0, x1, y0, y1, ops, c) => {
    let cur = z0;
    for (const [a, b, s, t] of ops) { if (a > cur) B(x0, y0, cur, x1, y1, a, c); if (s > y0) B(x0, y0, a, x1, s, b, c); if (t < y1) B(x0, t, a, x1, y1, b, c); cur = b; }
    if (cur < z1) B(x0, y0, cur, x1, y1, z1, c);
  };
  const gridModels = [];
  both((B, P, side, tr) => {
    const ZB = -18, ZF = -10, W = 0.3, F0 = 2.8, F1 = 3.0, F2 = 5.8;
    // földszint
    wallX(B, -5, 5, ZF - W, ZF, 0, F0, [[-4, -2.2, 0.9, 2.1], [-0.6, 0.6, 0, 2.2], [2.2, 4, 0.9, 2.1]], P.wall);
    wallX(B, -5, 5, ZB, ZB + W, 0, F0, [[-3, -1.8, 0, 2.2], [2.5, 4, 0.9, 2.1]], P.wall);
    wallZ(B, ZB + W, ZF - W, -5, -4.7, 0, F0, [[-16.5, -15, 0.9, 2.1], [-12.5, -11, 0.9, 2.1]], P.wall);
    wallZ(B, ZB + W, ZF - W, 4.7, 5, 0, F0, [[-16.5, -15, 0.9, 2.1], [-12.5, -11, 0.9, 2.1]], P.wall);
    wallX(B, -4.7, 4.7, -14.15, -13.85, 0, F0, [[-3, -1.8, 0, 2.2], [2, 3.2, 0, 2.2]], P.trim);
    // az emelet padlója a lépcső nyílásával (x -1..2.3, z -17.7..-16.4)
    B(-4.7, F0, -16.4, 4.7, F1, ZF - W, P.floor); B(-4.7, F0, ZB + W, -1, F1, -16.4, P.floor); B(2.3, F0, ZB + W, 4.7, F1, -16.4, P.floor);
    // emelet: három ablak elöl, kettő hátul, kettő oldalt
    wallX(B, -5, 5, ZF - W, ZF, F1, F2, [[-4, -2.6, 3.9, 5.1], [-0.7, 0.7, 3.9, 5.1], [2.6, 4, 3.9, 5.1]], P.wall);
    wallX(B, -5, 5, ZB, ZB + W, F1, F2, [[-4, -2.6, 3.9, 5.1], [2.6, 4, 3.9, 5.1]], P.wall);
    wallZ(B, ZB + W, ZF - W, -5, -4.7, F1, F2, [[-16.5, -15, 3.9, 5.1], [-12.5, -11, 3.9, 5.1]], P.wall);
    wallZ(B, ZB + W, ZF - W, 4.7, 5, F1, F2, [[-16.5, -15, 3.9, 5.1], [-12.5, -11, 3.9, 5.1]], P.wall);
    wallX(B, -4.7, 4.7, -14.15, -13.85, F1, F2, [[-0.8, 0.8, 3, 5], [2.5, 3.7, 3, 5]], P.trim);
    // tető: két réteg és egy ereszcsík; az emeleti párkány-csík díszít
    B(-4.7, F2 - 0.1, ZB + W, 4.7, F2, ZF - W, P.trim, false);   // fehér mennyezet a tető alatt
    B(-5.4, F2, ZB - 0.4, 5.4, F2 + 0.3, ZF + 0.4, P.roof); B(-4, F2 + 0.3, ZB + 1, 4, F2 + 0.7, ZF - 1, P.roof);
    B(-5.1, F0 - 0.05, ZF - 0.45, 5.1, F0 + 0.05, ZF, P.trim, false);
    // lépcső (a hátsó fal mentén, +x felé emelkedik) és korlát
    for (let k = 1; k <= 11; k++) B(-1 + (k - 1) * 0.3, 0, ZB + W, -1 + k * 0.3, k * (F1 / 11), -16.4, '#caa26b');
    B(-1, F1, -16.4, 2.3, F1 + 0.9, -16.25, P.accent); B(-1.15, F1, -17.7, -1, F1 + 0.9, -16.25, P.accent);
    // bútorok: kanapé, dohányzóasztal, TV-szekrény, konyhapult, sziget, hűtő, szekrény; emelet: ágy, komód
    B(-4.7, 0, -13.2, -3.7, 0.5, -10.7, '#c75d5d'); B(-4.7, 0.5, -13.2, -4.35, 1.0, -10.7, '#a84a4a');
    B(-2.8, 0, -12.2, -1.6, 0.45, -11.5, '#8a6a4a'); B(4.1, 0, -12.3, 4.7, 0.9, -11.0, '#2f3340');
    B(-4.7, 0, -16.6, -4.0, 0.9, -14.5, '#eef0f4'); B(-3.2, 0, -16.2, -2.0, 0.9, -15.4, '#eef0f4'); B(-4.65, 0, -17.65, -3.8, 1.8, -16.7, '#cfd6df');
    B(3.4, 0, -17.6, 4.6, 1.2, -16.6, '#8a6a4a');
    B(-4.6, F1, -13.1, -2.6, F1 + 0.5, -11.1, '#7da7d9'); B(-4.6, F1, -17.6, -3.8, F1 + 0.9, -15.6, '#8a6a4a'); B(3.8, F1, -12.6, 4.6, F1 + 1.0, -11.2, '#8a6a4a');
    // az autóbeálló az utca felőli oldalon (x 5..10): tető két oszlopon
    B(4.9, 2.6, ZB, 10.2, 2.85, ZF, P.roof); B(9.9, 0, ZF - 0.3, 10.2, 2.6, ZF, P.trim); B(9.9, 0, ZB, 10.2, 2.6, ZB + 0.3, P.trim);
    // előkert: kerítés kaputérrel (x -1.5..1.5) és a felhajtóval (x 5..10.5), sövény a végeken
    // padló a földszinten (csak látvány) és a szobák lámpái
    const [fa, fb] = tr(-4.7, -17.7), [fc, fd] = tr(4.7, -10.3);
    plane(Math.min(fa, fc), Math.min(fb, fd), Math.max(fa, fc), Math.max(fb, fd), 0.015, '#d6b88c');
    for (const [lx, lz, ly] of [[0, -12, 1.9], [0, -15.5, 1.9], [0, -12, 4.9], [0, -15.5, 4.9]]) { const [px, pz] = tr(lx, lz); const L = new THREE.PointLight(0xfff0d8, 9, 9, 1.6); L.position.set(px, ly, pz); scene.add(L); }
    const fz0 = -7.1, fz1 = -7;
    B(-35, 0, fz0, -20, 1.3, fz1 + 0.3, '#4f9a45'); B(-20, 0, fz0, -1.5, 0.95, fz1, FENCE); B(1.5, 0, fz0, 5, 0.95, fz1, FENCE); B(10.5, 0, fz0, 35, 0.95, fz1, FENCE);
    // hátsó kert: oldalkerítések, góliát-sövény, fészer, trambulin-szerű doboz, fák
    B(-12.1, 0, -25, -12, 0.95, -21, FENCE); B(12, 0, -25, 12.1, 0.95, -21, FENCE);
    B(-24, 0, -24.5, -20.5, 2.4, -21.5, '#b88a5a'); B(-24.2, 2.4, -24.7, -20.3, 2.65, -21.3, P.roof);
    B(14, 0, -23.5, 17.5, 0.7, -20, '#3d8be8'); B(14.3, 0.7, -23.2, 17.2, 0.78, -20.3, '#222');
    B(-31, 0, -17, -29, 1.2, -16.4, '#4f9a45');
  });
  // fák (a törzs ütközik, a lomb 2,3 m fölött lóg)
  const treeSpots = [[-30, -21], [-16, -8.5], [24, -12], [30, -22], [-3, -22]];
  for (const [x, z] of treeSpots) for (const s of [1, -1]) {
    const tx = x * s, tz = z * s;
    box(tx - 0.25, 0, tz - 0.25, tx + 0.25, 2.8, tz + 0.25, '#7a5230');
    deco(new THREE.Mesh(new THREE.IcosahedronGeometry(2, 1), new THREE.MeshStandardMaterial({ color: s > 0 ? '#4aa84a' : '#5cb85c', flatShading: true })), true).position.set(tx, 4.6, tz);
  }

  // ---------- járművek (Kenney CC0): a doboz a modell tényleges kerete ----------
  const vehicle = async (url, cx, cz, len, along, flip = false, tint, wid, hei) => {
    const g = (await loadModel(url)).scene.clone(true), b0 = new THREE.Box3().setFromObject(g), s0 = b0.getSize(new THREE.Vector3());
    const k = len / s0.z, pivot = new THREE.Group(), c0 = b0.getCenter(new THREE.Vector3());   // a Kenney-autók hossza a Z tengelyen van
    g.position.set(-c0.x, -b0.min.y, -c0.z); pivot.add(g); pivot.scale.set(wid ? wid / s0.x : k, hei ? hei / s0.y : k, k);
    pivot.rotation.y = (along === 'x' ? Math.PI / 2 : 0) + (flip ? Math.PI : 0);
    pivot.position.set(cx, 0, cz); scene.add(pivot); pivot.updateMatrixWorld(true);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (tint) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); } } });
    const bb = new THREE.Box3().setFromObject(pivot);
    box(bb.min.x + 0.03, 0, bb.min.z + 0.03, bb.max.x - 0.03, bb.max.y, bb.max.z - 0.03, null);
  };
  await Promise.all([
    vehicle('/game/assets/cars/delivery.glb', 0, 0, 7.4, 'x', false, '#d8d2c0', 2.6, 2.9),      // a roncs busz az utca közepén
    vehicle('/game/assets/cars/taxi.glb', -14, 3.1, 4.4, 'x'), vehicle('/game/assets/cars/police.glb', 15, -3, 4.6, 'x', true),
    vehicle('/game/assets/cars/sedan.glb', 7.6, -14, 4.4, 'z'), vehicle('/game/assets/cars/suv.glb', -7.6, 14, 4.6, 'z', true),
    vehicle('/game/assets/cars/van.glb', 25, 3.2, 5, 'x'), vehicle('/game/assets/cars/ambulance.glb', -25, -3.3, 5.4, 'x', true),
  ]);

  // ---------- kezdőpontok (a házak mögött és az oldalsó telkeken) és botok útpontjai ----------
  setSpawns([[-8, -22], [8, -22], [-27, -14], [27, -14], [8, 22], [-8, 22], [27, 14], [-27, 14]]);
  const N = [];   // [x, z, y]
  const nA = [[-28, 0], [-18, -3.4], [-18, 3.4], [-9, -3.4], [-9, 3.4], [0, -3.6], [0, 3.6], [9, -3.4], [9, 3.4], [19, -3.4], [19, 3.4], [29, 0],
    [0, -6], [7.5, -6.5], [-12, -8.7], [0, -8.5], [14, -8.5], [-26, -8.5], [27, -8.5],   // a kerítésen át az előkertbe
    [0, -11.7], [-1, -12], [-2.4, -14], [-2.4, -14.8], [3.6, -15], [2.6, -14], [3.2, -12], [-2.4, -19], [-2.4, -16.6],  // a ház földszintje, hátsó ajtó
    [-8, -22], [8, -22], [-22, -19.5], [0, -22], [20, -21], [-27, -13]];
  const stairA = [[-1.7, -17, 0], [0.65, -17, 1.95], [2.7, -17, 3]];
  const upA = [[3.6, -17, 3], [3.2, -15, 3], [3.1, -14, 3], [3.2, -12, 3], [0, -12, 3], [-1.6, -12, 3], [0, -14, 3], [0, -15.2, 3]];
  const mk = (x, z, y = 0) => { N.push({ x, y, z }); return N.length - 1; };
  const explicit = [];
  const idx = [];
  for (const [x, z] of nA) { idx.push(mk(x, z)); }
  for (const [x, z] of nA.slice(12)) mk(-x, -z);   // a B oldal az elforgatott másolat (az utca nodei már szimmetrikusak)
  const ch = (pts) => { const ids = pts.map(([x, z, y]) => mk(x, z, y)); for (let i = 0; i + 1 < ids.length; i++) explicit.push([ids[i], ids[i + 1]]); return ids; };
  const chA = ch(stairA), chB = ch(stairA.map(([x, z, y]) => [-x, -z, y]));
  for (const pts of [upA, upA.map(([x, z, y]) => [-x, -z, y])]) for (const [x, z, y] of pts) mk(x, z, y);
  // a lépcső alja a földszinti nodékhoz, teteje az emeleti nodékhoz kötve
  const near = (x, z, y, pool) => N.map((n, i) => [i, Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 3]).sort((a, b) => a[1] - b[1])[0][0];
  for (const [ch_, sgn] of [[chA, 1], [chB, -1]]) {
    explicit.push([ch_[0], near(-2.4 * sgn, -14.8 * sgn, 0)], [ch_[2], near(3.6 * sgn, -17 * sgn, 3)]);
    
  }
  // a szabályos (kerítésen/falon át nem látó) élek, majd a hátsó ajtók hozzákötése
  const edges = linkNodes(N, explicit, 16);
  return { nodes: N, edges };
}
