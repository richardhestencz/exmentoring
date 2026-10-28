// A festett tisztás egyetlen mozgása: ha szól a közös zene, két hangfal finoman lüktet, és néha egy hangjegy száll ki belőlük.
// Minden más áll (a fák, a tó, a mosómedvék is). A „✨” gombbal ki-be kapcsolható (megjegyzi; csökkentett mozgásnál alapból ki).
// A réteg a háttérképpel együtt méreteződik és nagyít (a főoldal hívja: FxLayout, FxCam).
(() => {
  const bg = document.getElementById('bg'), btn = document.getElementById('fxbtn');
  if (!bg || !btn) return;
  const store = (k, v) => { try { v === undefined ? 0 : localStorage.setItem(k, v); return localStorage.getItem(k); } catch { return null; } };
  const saved = store('motion');
  let on = saved === null ? !matchMedia('(prefers-reduced-motion: reduce)').matches : saved === '1';
  let musicOn = false, cur = null, unit = 1, timer = null, turn = 0;
  const layer = document.createElement('div'); layer.className = 'fx'; layer.setAttribute('aria-hidden', 'true');
  (document.getElementById('bgNight') || bg).after(layer);   // a nappali és az éjszakai kép fölé

  // a hangfalak helye a széles kép saját képpontjaiban: [x, talppont y, magasság, merre néz]. Az álló kép közepe a széles kép kicsinyítve (k, ox, oy).
  const SPEAKERS = [[602, 540, 115, 'right'], [478, 790, 165, 'right']];   // a jobb oldali hangfal helyén a félkarú rabló áll (index.html)
  const geo = (sc) => (sc.w > sc.h ? SPEAKERS : SPEAKERS.map(([x, y, h, f]) => [x * sc.k + sc.ox, y * sc.k + sc.oy, h * sc.k, f]));
  const pct = (v, of) => (v / of * 100).toFixed(3) + '%';
  const rnd = (a, b) => a + Math.random() * (b - a);
  function el(cls, x, y, w, h, sc, extra = {}) {
    const d = document.createElement('div'); d.className = cls;
    Object.assign(d.style, { left: pct(x, sc.w), top: pct(y, sc.h), width: w == null ? '' : pct(w, sc.w), height: h == null ? '' : pct(h, sc.h) }, extra);
    layer.appendChild(d); return d;
  }

  function build(sc) {
    clearInterval(timer);
    layer.replaceChildren();
    const S = geo(sc);
    S.forEach(([x, y, h, face], i) => {
      const w = h * 0.64, s = el('fxspk', x - w / 2, y - h, w, h, sc, { animationDelay: (i * 0.16) + 's' });
      s.innerHTML = `<img src="/img/speaker-${face}.png" alt="" draggable="false">`;
    });
    // hangjegy ritkán, mindig csak egy hangfalból (sorban váltakozva)
    timer = setInterval(() => {
      if (!on || !musicOn || document.visibilityState !== 'visible') return;
      const [x, y, h] = S[turn++ % S.length]; note(sc, x, y - h * 0.95, h / 115);
    }, 2500);
    paint();
  }
  function note(sc, x, y, k = 1) {
    const d = el('fxnote', x + rnd(-20, 20) * k, y, null, null, sc, { '--tx': rnd(-40, 40) * unit * k + 'px', '--k': k * 0.8, animationDuration: rnd(2.6, 3.4) + 's' });
    d.textContent = ['♪', '♫', '♬', '♩'][Math.floor(rnd(0, 4))];
    d.addEventListener('animationend', () => d.remove());
  }
  function paint() {
    layer.classList.toggle('still', !on); layer.classList.toggle('music', musicOn);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Hangfalak mozgásának kikapcsolása' : 'Hangfalak mozgásának bekapcsolása';
    if (!on) layer.querySelectorAll('.fxnote').forEach((n) => n.remove());
  }
  btn.onclick = () => { on = !on; store('motion', on ? '1' : '0'); paint(); };
  document.addEventListener('music:playing', (e) => { musicOn = !!e.detail; paint(); });

  // a főoldal hívja: a réteg a háttérkép helyén, ugyanakkora; a kép cseréjekor (álló/fekvő) újraépül
  let last = null;
  window.FxLayout = (sc, s, left, top) => {
    Object.assign(layer.style, { width: sc.w * s + 'px', height: sc.h * s + 'px', left: left + 'px', top: top + 'px' });
    unit = s; layer.style.setProperty('--u', s);
    last = sc; if (sc.src !== cur) { cur = sc.src; build(sc); }
  };
  window.FxNight = () => {};   // a napszak már nem változtat a rétegen (nincs csillag, szentjánosbogár)
  window.FxCam = (t, f) => { layer.style.transform = t; layer.style.filter = f; };
  if (window.__fxArgs) window.FxLayout(...window.__fxArgs);   // a háttér már elrendeződött, mire ez a fájl betöltött
  paint();
})();
