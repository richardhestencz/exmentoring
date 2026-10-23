// Mosómedve-skinek és a tisztás helyei. A böngészőben window.Avatar, a szerveren (tesztekhez) require-rel is betölthető.
// A mosómedvék a jóváhagyott Gemini-képből (scene-v7) vannak kivágva, helyenként egy-egy kép (img/spots/spot-N.png),
// így ha mindenki „Eredeti” skinben van, a nyitóoldal pontosan a jóváhagyott kép. A skin a ruhát átszínezi, a kalap és a
// szemüveg a fejre kerül.
(function (root) {
  // ---- skin-elemek (a 0. elem mindig az alapértelmezett: a kép eredeti ruhája, kalap és szemüveg nélkül) ----
  const HATS = ['Nincs', 'Kötött sapka', 'Cowboykalap', 'Korona', 'Cilinder', 'Tiroli kalap'];
  const GLASSES = ['Nincs', 'Napszemüveg', 'Kerek szemüveg', 'Szívecskés', '3D szemüveg', 'Pilóta', 'Csillagos (rózsaszín)', 'Kék napszemüveg', 'Arany pilóta', 'Csillagos (lila)'];
  const TOPS = [
    { name: 'Eredeti' },
    { name: 'Piros póló', c: '#d93a32' }, { name: 'Narancs póló', c: '#eb772e' }, { name: 'Sárga póló', c: '#f2c230' },
    { name: 'Zöld póló', c: '#3f9a4e' }, { name: 'Kék póló', c: '#2f6fd6' }, { name: 'Lila póló', c: '#7b3fe4' },
    { name: 'Rózsaszín póló', c: '#e86ba8' }, { name: 'Fekete póló', c: '#2c2a30' }, { name: 'Fehér póló', c: '#f4f1ec' },
    { name: 'Tengerész csíkos', c: '#f4f1ec', p: 'stripes', c2: '#1f3a6b' },
    { name: 'Kockás flanel', c: '#b8322b', p: 'plaid', c2: '#2a1a1a' },
    { name: 'Mentoring póló', c: '#eb772e', p: 'stripes', c2: '#b83553' },
  ];
  const BOTTOMS = [
    { name: 'Eredeti' },
    { name: 'Farmer', c: '#3b5b8c' }, { name: 'Fekete', c: '#2c2a30' }, { name: 'Bézs', c: '#c9b08a' }, { name: 'Piros', c: '#c43b35' },
    { name: 'Khaki zöld', c: '#56703f' }, { name: 'Szürke', c: '#8a8d91' }, { name: 'Rózsaszín', c: '#e86ba8' },
  ];
  // a kalap-rétegek az ülő alap-sprite fejéhez készültek (fejközép REF, fejszélesség HEAD); a szemüveg: [szélesség a szemsáv arányában, függőleges eltolás]
  const REF = { hx: 135, hy: 70.5 }, HEAD = 140, EYES = { ex: 140, ey: 62, hw: 120 }, HAT_PAD = 100, HAT_SIDE = 20;
  const FIT_GLASSES = [null, [0.75, 2], [0.72, 2], [0.75, 2], [0.75, 2], [0.78, 2], [0.8, 0], [0.75, 2], [0.78, 2], [0.8, 0]];

  // ---- a 16 hely: a jóváhagyott kép mosómedvéi ----
  // x, y: a fej közepe az alap-képen (2000x848); hw: a fej szélessége; box: a kivágás helye [x0, y0, w, h];
  // top / bottom: van-e átszínezhető póló / nadrág; face: a bal szem, a jobb szem és az orr helye a képen (a fej térbeli
  // állása ebből számolódik, erre ül rá a kalap és a szemüveg)
  const SPOTS = [
    { name: 'Blackjack: osztó', x: 320, y: 424, hw: 76, box: [253, 377, 179, 247], top: 1, face: [314.3, 418.9, 340.5, 418.9, 332.3, 428.3] },
    { name: 'Blackjack: játékos (bal)', x: 236, y: 461, hw: 97, box: [142, 411, 146, 209], top: 1, face: [225.2, 459.2, 254.7, 456.7, 245.7, 470] },
    { name: 'Blackjack: játékos (jobb)', x: 459, y: 460, hw: 95, box: [353, 409, 208, 219], top: 1, face: [429.9, 456.4, 459, 455.7, 441.2, 466.4] },
    { name: 'Póker (bal)', x: 915, y: 427, hw: 69, box: [839, 393, 157, 164], top: 1, face: [911.2, 428.3, 932.9, 428.3, 926, 437.2] },
    { name: 'Póker (jobb)', x: 1091, y: 431, hw: 69, box: [1015, 393, 157, 166], top: 1, face: [1073.2, 427.2, 1094.8, 428, 1080.8, 437.4] },
    { name: 'Bal rönk: szendvicset eszik', x: 670, y: 520, hw: 82, box: [584, 471, 175, 199], bottom: 1, face: [668.5, 516.9, 693.8, 514.8, 686.8, 524.6] },
    { name: 'Bal rönk: bongózik', x: 777, y: 487, hw: 69, box: [702, 449, 143, 186], bottom: 1, face: [771.4, 488.8, 796.9, 488.8, 784.7, 495.2] },
    { name: 'Jobb rönk: pénzt szór', x: 1262, y: 508, hw: 69, box: [1097, 357, 239, 328], bottom: 1, face: [1245.4, 504.2, 1266.6, 504.2, 1242.9, 511.3] },
    { name: 'Jobb rönk: gitározik', x: 1370, y: 528, hw: 85, box: [1292, 448, 157, 248], bottom: 1, face: [1359, 524.8, 1385.7, 526.4, 1355.8, 535.9] },
    { name: 'Függőágy', x: 1827, y: 647, hw: 82, box: [1639, 564, 281, 178], face: [1810.2, 637.8, 1839.2, 642.4, 1807.2, 649.1] },
    { name: 'Sárkányrepülő', x: 1196, y: 141, hw: 57, box: [1093, 58, 259, 152], top: 1, face: [1176, 139.9, 1196, 132.6, 1186.5, 143.5] },
    { name: 'Home office: horgász 1', x: 1462, y: 440, hw: 30, box: [1409, 424, 88, 62], top: 1, face: [1454.3, 441.1, 1464.2, 441.3, 1454.9, 447.2] },
    { name: 'Home office: horgász 2', x: 1612, y: 430, hw: 30, box: [1575, 398, 123, 113], top: 1, face: [1610.4, 433.3, 1620.3, 435, 1613.7, 438.8] },
    { name: 'Home office: horgász 3', x: 1745, y: 405, hw: 30, box: [1671, 380, 124, 104], top: 1, face: [1736.2, 405, 1747.8, 405, 1740.1, 411.6] },
    { name: 'Home office: horgász 4', x: 1815, y: 405, hw: 30, box: [1772, 380, 96, 92], top: 1, face: [1804.6, 402.8, 1818.9, 402.3, 1810, 408.3] },
    { name: 'Home office: kenu', x: 1805, y: 505, hw: 30, box: [1690, 478, 193, 112], face: [1793.5, 509.4, 1806.7, 510.5, 1799.5, 516] },
  ];
  // éjszaka a ruhaszín szorzója helyenként (R, G, B): az éjszakai kép és a nappali aránya a mosómedve pixelein
  const NIGHT = [[0.494, 0.705, 1.091], [0.498, 0.716, 1.103], [0.49, 0.743, 1.127], [0.776, 0.896, 1.008], [0.776, 0.875, 0.985], [0.768, 0.905, 1.05], [0.835, 0.95, 1.031], [0.727, 0.886, 1.052], [0.776, 0.913, 1.067], [0.529, 0.775, 1.16], [0.522, 0.614, 0.894], [0.356, 0.681, 1.157], [0.554, 0.907, 1.301], [0.402, 0.719, 1.106], [0.454, 0.722, 1.162], [0.545, 0.733, 1.081]];
  const MAX = SPOTS.length;
  // a háttérképek: az alap-koordináták átváltása (k-szoros + ox, oy), a kőkör közepe, a kerék célmérete, a legmagasabb fontos fej
  const SCENES = {
    wide: { src: 'img/scene-wide.jpg', w: 2000, h: 848, k: 1, ox: 0, oy: 0, cx: 999, cy: 688, ring: 414, wheel: 596, head: 360, zoom: 1.3 },
    night: { src: 'img/scene-night-wide.jpg', w: 2000, h: 848, k: 1, ox: 0, oy: 0, cx: 999, cy: 688, ring: 414, wheel: 596, head: 360, zoom: 1.3, night: true },
    tall: { src: 'img/scene-tall.jpg', w: 1116, h: 2000, k: 0.572, ox: -13.2, oy: 793.6, cx: 558, cy: 1187, ring: 237, wheel: 341, head: 1000, zoom: 1.1 },
  };
  // a vászon a kivágás körül: fölötte hely a kalapnak, oldalt egy kis ráhagyás
  const margin = (p) => ({ t: Math.ceil(p.hw * 1.1), s: Math.ceil(p.hw * 0.6), b: 2 });
  const size = (i) => { const p = SPOTS[i], m = margin(p); return { w: p.box[2] + 2 * m.s, h: p.box[3] + m.t + m.b }; };
  // egy hely egy adott háttérképen, a kép képpontjaiban: a fej közepe (x, y), a vászon bal felső sarka (left, top) és a méretarány (k)
  const spotPos = (sc, i) => {
    const p = SPOTS[i], m = margin(p);
    return { x: p.x * sc.k + sc.ox, y: p.y * sc.k + sc.oy, left: (p.box[0] - m.s) * sc.k + sc.ox, top: (p.box[1] - m.t) * sc.k + sc.oy, k: sc.k, hw: p.hw * sc.k, p };
  };

  // akinek nincs saját skinje: a kép eredeti mosómedvéje (így a nyitóoldal a jóváhagyott képpel azonos)
  function defaultSkin() { return { hat: 0, glasses: 0, top: 0, bottom: 0 }; }
  const intIn = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
  function validSkin(s) {
    return !!s && intIn(s.hat, HATS.length) && intIn(s.glasses, GLASSES.length) && intIn(s.top, TOPS.length) && intIn(s.bottom, BOTTOMS.length);
  }
  // ki melyik helyre kerül: érkezési sorrendben, a választott hely ha szabad, különben az első szabad; legfeljebb MAX fő
  function assign(here, avatars) {
    const taken = new Map(), out = [];
    for (const h of here.slice(0, MAX)) {
      const pref = avatars[h.nick] && avatars[h.nick].spot;
      if (Number.isInteger(pref) && pref >= 0 && pref < MAX && !taken.has(pref)) { taken.set(pref, h.nick); out.push({ nick: h.nick, spot: pref }); }
      else out.push({ nick: h.nick, spot: null });
    }
    for (const o of out) if (o.spot === null) { let i = 0; while (taken.has(i)) i++; taken.set(i, o.nick); o.spot = i; }
    return out;
  }

  // ---- a fej térbeli állása: a kalap és a szemüveg valódi 3D-s ráhelyezése ----
  // A kalapok és a szemüvegek az alap-sprite fejére készültek. Minden fejnél a két szemből jön a dőlés (roll), az orr
  // vízszintes eltéréséből az elfordulás (yaw). A kiegészítő minden pontja mélységet kap (a szemüveg a szemek síkja előtt,
  // a kalap a fejtető körül), ezt elforgatjuk a fej állására, enyhe perspektívával vetítjük, és háromszögrácson rátorzítjuk.
  const SPRITE_FACE = [120, 63, 159.5, 62, 148.5, 78], NOSE_DEPTH = 0.75;   // az orr a szemek síkja előtt (a szemtávolság arányában)
  function headPose(f) {
    const mx = (f[0] + f[2]) / 2, my = (f[1] + f[3]) / 2, d = Math.hypot(f[2] - f[0], f[3] - f[1]), roll = Math.atan2(f[3] - f[1], f[2] - f[0]);
    const nx = (f[4] - mx) * Math.cos(roll) + (f[5] - my) * Math.sin(roll);      // az orr eltérése a fej saját vízszintesén
    const yaw = Math.atan(nx / (NOSE_DEPTH * d));
    return { mx, my, roll, yaw, df: d / Math.cos(yaw) };                            // df: a szemtávolság szemből nézve
  }
  const P0 = headPose(SPRITE_FACE);
  const glassesDepth = (x) => { const t = (x - P0.mx) / 60; return 12 - 10 * t * t; };                       // enyhén ívelt keret
  const hatDepth = (x) => { const t = Math.min(1, Math.abs(x - REF.hx) / 85); return -10 - 20 * (1 - Math.sqrt(1 - t * t)); };   // a fej körül
  // sprite-pont (x, y) mélységgel (z) -> pont a kép adott fején
  function project(P, x, y, z) {
    const c0 = Math.cos(P0.roll), s0 = Math.sin(P0.roll), dx = x - P0.mx, dy = y - P0.my;
    const X = dx * c0 + dy * s0, Y = -dx * s0 + dy * c0;                            // a sprite saját dőlése ki
    const xf = (X - z * Math.sin(P0.yaw)) / Math.cos(P0.yaw);                       // a sprite elfordulása ki: szemből nézve
    const xt = xf * Math.cos(P.yaw) + z * Math.sin(P.yaw), zt = -xf * Math.sin(P.yaw) + z * Math.cos(P.yaw);
    const k = (P.df / P0.df) * (6 * P0.df) / (6 * P0.df - zt);                       // méret + perspektíva: a közelebbi rész nagyobb
    const px = xt * k, py = Y * k, cr = Math.cos(P.roll), sr = Math.sin(P.roll);
    return [P.mx + px * cr - py * sr, P.my + px * sr + py * cr];
  }
  // egy kép (sx, sy, sw, sh) része háromszögrácson rátorzítva: map(u, v) a kép képpontjából a cél-vászon pontja
  function warp(ctx, img, sx, sy, sw, sh, map, n) {
    const G = [];
    for (let j = 0; j <= n; j++) { const row = []; for (let i = 0; i <= n; i++) { const u = sx + sw * i / n, v = sy + sh * j / n; row.push([u, v, ...map(u, v)]); } G.push(row); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = G[j][i], b = G[j][i + 1], c = G[j + 1][i + 1], d = G[j + 1][i]; tri(ctx, img, a, b, c); tri(ctx, img, a, c, d); }
  }
  function tri(ctx, img, [u0, v0, x0, y0], [u1, v1, x1, y1], [u2, v2, x2, y2]) {
    const den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if (!den) return;
    const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3;
    const g = (x, y) => { const l = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / l * 0.4, y + (y - cy) / l * 0.4]; };   // résmentes illesztés
    ctx.save(); ctx.beginPath(); ctx.moveTo(...g(x0, y0)); ctx.lineTo(...g(x1, y1)); ctx.lineTo(...g(x2, y2)); ctx.closePath(); ctx.clip();
    ctx.transform((x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / den, (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / den,
      (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / den, (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / den,
      (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / den, (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / den);
    ctx.drawImage(img, 0, 0); ctx.restore();
  }
  // a kép nem átlátszó részének kerete (a kalap-rétegek nagy, üres vásznon vannak)
  const BOXES = new WeakMap();
  function opaqueBox(img) {
    if (BOXES.has(img)) return BOXES.get(img);
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
    for (let y = 0; y < img.height; y++) for (let i = 0; i < img.width; i++) if (d[(y * img.width + i) * 4 + 3] > 8) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const b = x1 < x0 ? [0, 0, img.width, img.height] : [Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(img.width, x1 + 2) - Math.max(0, x0 - 1), Math.min(img.height, y1 + 2) - Math.max(0, y0 - 1)];
    BOXES.set(img, b); return b;
  }

  // ---- rajzolás (csak böngészőben) ----
  const IMG = {};
  const load = (src) => IMG[src] || (IMG[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }));
  const hex = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
  const tint = (c, mul) => { if (!mul) return c; const v = hex(c).map((x, k) => Math.max(0, Math.min(255, Math.round(x * mul[k])))); return `rgb(${v.join(',')})`; };
  // a ruha-réteg (szürke árnyékolás + átlátszóság) megszorozva a választott színnel / mintával
  function paint(ctx, layer, spec, x, y, mul, scale) {
    const off = document.createElement('canvas'); off.width = layer.width; off.height = layer.height;
    const o = off.getContext('2d');
    o.drawImage(layer, 0, 0);
    o.globalCompositeOperation = 'multiply';
    if (spec.p) {
      const n = Math.max(6, Math.round(16 * scale)), t = document.createElement('canvas'), q = t.getContext('2d'); t.width = t.height = n;
      q.fillStyle = tint(spec.c, mul); q.fillRect(0, 0, n, n); q.fillStyle = tint(spec.c2, mul);
      if (spec.p === 'stripes') q.fillRect(0, 0, n, Math.round(n * 0.38));
      else { const b = Math.round(n * 0.32); q.globalAlpha = 0.55; q.fillRect(0, 0, n, b); q.fillRect(0, 0, b, n); q.globalAlpha = 1; q.fillRect(0, 0, b, b); }
      o.fillStyle = o.createPattern(t, 'repeat');
    } else o.fillStyle = tint(spec.c, mul);
    o.fillRect(0, 0, off.width, off.height);
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(layer, 0, 0);
    ctx.drawImage(off, x, y);
  }
  // egy hely mosómedvéje a választott skinben; a vászon mérete size(i), az alap-kép képpontjaiban
  async function draw(canvas, skin, i, night = false, base = '/img/') {
    const p = SPOTS[i] || SPOTS[0], s = validSkin(skin) ? skin : defaultSkin(), m = margin(p);
    const [body, top, bot, hat, gl] = await Promise.all([
      load(`${base}spots/spot-${i}${night ? '-n' : ''}.png`),
      s.top && p.top ? load(`${base}spots/spot-${i}-top.png`) : null,
      s.bottom && p.bottom ? load(`${base}spots/spot-${i}-bottom.png`) : null,
      s.hat && !root.Acc3D ? load(`${base}skin/hat-${s.hat}-sit.png`) : null, s.glasses && !root.Acc3D ? load(`${base}skin/glasses-${s.glasses}.png`) : null,
    ]);
    const { w, h } = size(i);
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d'), X = m.s, Y = m.t, mul = night ? NIGHT[i] : null, f = p.hw / HEAD;
    c.clearRect(0, 0, w, h);
    c.drawImage(body, X, Y);
    if (top) paint(c, top, TOPS[s.top], X, Y, mul, f);
    if (bot) paint(c, bot, BOTTOMS[s.bottom], X, Y, mul, f);
    if ((s.hat || s.glasses) && root.Acc3D) {
      // valódi 3D: a kalap és a szemüveg modellje a fej lemért állásában (acc3d.js)
      const P = headPose(p.face);
      root.Acc3D.draw(c, w, h, { x: P.mx - p.box[0] + X, y: P.my - p.box[1] + Y, df: P.df, roll: P.roll, yaw: P.yaw }, s.hat, s.glasses, mul);
    } else if (hat || gl) {
      // tartalék (WebGL nélkül): a kalap és a szemüveg rajza külön rétegre, a fej térbeli állása szerint torzítva; éjjel a réteg egyben sötétebb
      const L = document.createElement('canvas'); L.width = w; L.height = h;
      const lc = L.getContext('2d'), P = headPose(p.face);
      const toCanvas = (q) => [q[0] - p.box[0] + X, q[1] - p.box[1] + Y];
      if (gl) {
        const g = FIT_GLASSES[s.glasses], gw = EYES.hw * g[0], gh = gl.height * gw / gl.width, gx = EYES.ex - gw / 2, gy = EYES.ey + g[1] - gh / 2;
        warp(lc, gl, 0, 0, gl.width, gl.height, (u, v) => { const xs = gx + u * gw / gl.width, ys = gy + v * gh / gl.height; return toCanvas(project(P, xs, ys, glassesDepth(xs))); }, 8);
      }
      if (hat) {
        const b = opaqueBox(hat);
        warp(lc, hat, b[0], b[1], b[2], b[3], (u, v) => { const xs = u - HAT_SIDE, ys = v - HAT_PAD; return toCanvas(project(P, xs, ys, hatDepth(xs))); }, 10);
      }
      if (mul) c.filter = `brightness(${(0.55 + 0.25 * (mul[0] + mul[1])).toFixed(2)})`;
      c.drawImage(L, 0, 0); c.filter = 'none';
    }
    return canvas;
  }

  const API = { HATS, GLASSES, TOPS, BOTTOMS, SPOTS, MAX, SCENES, spotPos, size, margin, defaultSkin, validSkin, assign, draw, headPose };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Avatar = API;
})(typeof window !== 'undefined' ? window : globalThis);
