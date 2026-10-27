// Apró, kellemes mozgás a festett tisztáson: a fák lombja leng a szélben, hintázik a függőágy, csillog a tó, nappal falevelek
// sodródnak és lüktet a nap fénye, éjjel pislákolnak a csillagok és szentjánosbogarak szállnak. Ha szól a közös zene, két hangfal
// ugrál a tisztáson, és hangjegyek szállnak ki belőlük. A „✨” gombbal ki-be kapcsolható (megjegyzi; csökkentett mozgásnál alapból ki).
// A réteg a háttérképpel együtt méreteződik és nagyít (a főoldal hívja: FxLayout, FxCam).
(() => {
  const bg = document.getElementById('bg'), btn = document.getElementById('fxbtn');
  if (!bg || !btn) return;
  const store = (k, v) => { try { v === undefined ? 0 : localStorage.setItem(k, v); return localStorage.getItem(k); } catch { return null; } };
  const saved = store('motion');
  let on = saved === null ? !matchMedia('(prefers-reduced-motion: reduce)').matches : saved === '1';
  let musicOn = false, cur = null, unit = 1, timers = [];
  const layer = document.createElement('div'); layer.className = 'fx'; layer.setAttribute('aria-hidden', 'true');
  (document.getElementById('bgNight') || bg).after(layer);   // a nappali és az éjszakai kép fölé
  let nightV = 0, nightSrc = '';

  // a festett képek részei (a kép saját képpontjaiban). A tall (álló) kép középső része a széles kép kicsinyítve (k, ox, oy),
  // a fák viszont mások rajta, azokat külön adjuk meg.
  const WIDE = {
    trees: [[0, 0, 205, 440, 7.5], [185, 0, 165, 440, 9], [300, 10, 195, 440, 8.2], [1375, 0, 345, 430, 10], [1770, 0, 230, 420, 8.8]],
    hammock: [1560, 592, 370, 175], lake: [1280, 482, 680, 125], sun: [1030, 335, 330], moon: [690, 110, 120],
    sky: [0, 0, 2000, 300], ground: [180, 520, 1640, 230], speakers: [[812, 550], [1188, 550]], wind: [0, 120, 2000, 380],
  };
  const TALL_TREES = [[0, 220, 115, 940, 8], [88, 240, 115, 830, 9.4], [165, 455, 105, 600, 7.6], [690, 0, 320, 1250, 10.5], [1012, 285, 104, 920, 8.6]];
  function geo(sc) {
    if (sc.w > sc.h) return WIDE;
    const m = ([x, y, w, h]) => [x * sc.k + sc.ox, y * sc.k + sc.oy, w * sc.k, h * sc.k];
    const p = ([x, y]) => [x * sc.k + sc.ox, y * sc.k + sc.oy];
    return { trees: TALL_TREES, hammock: m(WIDE.hammock), lake: m(WIDE.lake), sun: [...p(WIDE.sun), WIDE.sun[2] * sc.k * 1.4], moon: [...p(WIDE.moon), 120],
      sky: [0, 0, sc.w, 900], ground: m(WIDE.ground), speakers: WIDE.speakers.map(p), wind: [0, 300, sc.w, 1000] };
  }
  const pct = (v, of) => (v / of * 100).toFixed(3) + '%';
  const rnd = (a, b) => a + Math.random() * (b - a);
  function el(cls, x, y, w, h, sc, extra = {}) {
    const d = document.createElement('div'); d.className = cls;
    Object.assign(d.style, { left: pct(x, sc.w), top: pct(y, sc.h), width: w == null ? '' : pct(w, sc.w), height: h == null ? '' : pct(h, sc.h) }, extra);
    layer.appendChild(d); return d;
  }
  // a kép egy részének mozgó másolata (az eredeti alatta marad; a mozgás csak néhány képpont, a szélek elmosva)
  function piece(cls, [x, y, w, h], sc, origin, extra = {}) {
    const bgOf = (src) => ({ backgroundImage: `url("${src}")`, backgroundSize: `${pct(sc.w, w)} ${pct(sc.h, h)}`,
      backgroundPosition: `${(x / (sc.w - w) * 100).toFixed(3)}% ${(y / (sc.h - h) * 100).toFixed(3)}%`, backgroundRepeat: 'no-repeat' });
    const d = el(cls, x, y, w, h, sc, { ...bgOf(sc.src), transformOrigin: origin, ...extra });
    if (nightSrc && nightSrc !== sc.src) { const n = document.createElement('div'); n.className = 'fxnight'; Object.assign(n.style, bgOf(nightSrc)); d.appendChild(n); }   // éjjel az éjszakai kép darabja
    return d;
  }

  function build(sc) {
    timers.forEach(clearInterval); timers = [];
    layer.replaceChildren();
    const G = geo(sc), night = nightV >= 0.42;
    G.trees.forEach(([x, y, w, h, d], i) => piece('fxsway', [x, y, w, h], sc, '50% 100%', { animationDuration: d + 's', animationDelay: (-i * 1.7) + 's' }));
    piece('fxswing', G.hammock, sc, '50% 0%');
    // tó: csillanások
    { const [x, y, w, h] = G.lake; for (let i = 0; i < 12; i++) el('fxglint', x + rnd(0.08, 0.92) * w, y + rnd(0.15, 0.85) * h, null, null, sc, { animationDelay: rnd(0, 6) + 's', animationDuration: rnd(3.5, 6.5) + 's' }); }
    if (!night) {
      const [x, y, r] = G.sun; el('fxsun', x - r, y - r, 2 * r, 2 * r, sc);
    } else {
      const [mx, my, mr] = G.moon; el('fxmoon', mx - mr, my - mr, 2 * mr, 2 * mr, sc);
      const [sx, sy, sw, sh] = G.sky; for (let i = 0; i < 28; i++) el('fxstar', sx + rnd(0, sw), sy + rnd(0.05, 1) * sh, null, null, sc, { animationDelay: rnd(0, 5) + 's', animationDuration: rnd(2.5, 5) + 's' });
      const [gx, gy, gw, gh] = G.ground;
      for (let i = 0; i < 10; i++) el('fxfly', gx + rnd(0, gw), gy + rnd(0, gh), null, null, sc, { '--dx': rnd(-60, 60) + 'px', '--dy': rnd(-40, 20) + 'px', animationDelay: rnd(0, 8) + 's', animationDuration: rnd(7, 12) + 's' });
    }
    // hangfalak (csak ha szól a zene)
    G.speakers.forEach(([x, y], i) => {
      const s = el('fxspk', x - 38, y - 96, 76, 96, sc, { animationDelay: (i * 0.24) + 's' });
      s.innerHTML = '<svg viewBox="0 0 60 80"><rect x="3" y="3" width="54" height="74" rx="8" fill="#3a2418" stroke="#1a0f0a" stroke-width="3"/><circle cx="30" cy="24" r="10" fill="#6b4630" stroke="#1a0f0a" stroke-width="2.5"/><circle cx="30" cy="24" r="4" fill="#1a0f0a"/><circle class="cone" cx="30" cy="54" r="16" fill="#6b4630" stroke="#1a0f0a" stroke-width="2.5"/><circle class="cone" cx="30" cy="54" r="7" fill="#1a0f0a"/></svg>';
      s.dataset.i = i;
    });
    // falevelek a szélben (nappal), hangjegyek a hangfalakból (zene alatt)
    timers.push(setInterval(() => { if (on && !night && document.visibilityState === 'visible') leaf(sc, G); }, 3200));
    timers.push(setInterval(() => { if (on && musicOn && document.visibilityState === 'visible') G.speakers.forEach(([x, y], i) => setTimeout(() => note(sc, x, y - 100), i * 260)); }, 620));
    paint();
  }
  function leaf(sc, G) {
    const [x, y, w, h] = G.wind, fromLeft = Math.random() < 0.6;
    const d = el('fxleaf', fromLeft ? x - 30 : x + w + 30, y + rnd(0, h), null, null, sc, { '--tx': (fromLeft ? 1 : -1) * rnd(500, 900) * unit + 'px', '--ty': rnd(120, 320) * unit + 'px', animationDuration: rnd(9, 14) + 's' });
    d.textContent = Math.random() < 0.5 ? '🍂' : '🍃';
    d.addEventListener('animationend', () => d.remove());
  }
  function note(sc, x, y) {
    const d = el('fxnote', x + rnd(-20, 20), y, null, null, sc, { '--tx': rnd(-50, 50) * unit + 'px', animationDuration: rnd(2.2, 3.2) + 's' });
    d.textContent = ['♪', '♫', '♬', '♩'][Math.floor(rnd(0, 4))];
    d.addEventListener('animationend', () => d.remove());
  }
  function paint() {
    layer.classList.toggle('still', !on); layer.classList.toggle('music', musicOn);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Mozgás kikapcsolása' : 'Mozgás bekapcsolása';
    if (!on) layer.querySelectorAll('.fxleaf,.fxnote').forEach((n) => n.remove());
  }
  btn.onclick = () => { on = !on; store('motion', on ? '1' : '0'); paint(); };
  document.addEventListener('music:playing', (e) => { musicOn = !!e.detail; paint(); });

  // a főoldal hívja: a réteg a háttérkép helyén, ugyanakkora; a kép cseréjekor (nappal/éjjel, álló/fekvő) újraépül
  window.FxLayout = (sc, s, left, top) => {
    Object.assign(layer.style, { width: sc.w * s + 'px', height: sc.h * s + 'px', left: left + 'px', top: top + 'px' });
    unit = s; layer.style.setProperty('--u', s);
    last = sc; rebuild();
  };
  let last = null;
  function rebuild() { if (!last) return; const key = last.src + '|' + nightSrc + '|' + (nightV >= 0.42 ? 'n' : 'd'); if (key !== cur) { cur = key; build(last); } }
  // a főoldal hívja a napszak változásakor: 0 nappal, 1 éjjel (közte átúszik); éjjel csillagok, szentjánosbogarak
  window.FxNight = (v, src) => { nightV = v; nightSrc = src || ''; layer.style.setProperty('--night', v.toFixed(3)); rebuild(); };
  window.FxCam = (t, f) => { layer.style.transform = t; layer.style.filter = f; };
  if (window.__fxNight) window.FxNight(...window.__fxNight);
  if (window.__fxArgs) window.FxLayout(...window.__fxArgs);   // a háttér már elrendeződött, mire ez a fájl betöltött
  paint();
})();
