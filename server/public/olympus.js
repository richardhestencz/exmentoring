// Mosó-Olümposz kapui: modern, Zeusz-féle nyerőgép (6×5 rács, bárhol fizet 8+ egyforma, lavina, szorzógömbök, ingyenes pörgetések).
// Csak a félkarú rabló nézetéből, a nyilakkal lehet ide jutni. A pörgetés minden lépését a szerver dönti el (oly-spin -> oly-result),
// itt csak lejátsszuk: leesnek a jelek, a nyerők felrobbannak, a helyükre újak hullanak, Zeusz villámmal dobja a szorzókat.
// Képek: Gemini (háttér, mosómedve Zeusz, szimbólumok). Bezáráskor minden leáll és felszabadul.

const COLS = 6, ROWS = 5;
const ORDER = ['crown', 'hourglass', 'ring', 'chalice', 'red', 'purple', 'yellow', 'green', 'blue', 'zeus'];   // a képsor (oly-symbols.webp) sorrendje
const COLOR = { crown: '#ffcf4a', hourglass: '#ffb347', ring: '#4ee08a', chalice: '#ffd36a', red: '#ff3b5c', purple: '#b45cff', yellow: '#ffd23e', green: '#3ee07a', blue: '#4a8bff', zeus: '#7fd8ff' };
const NAME = { crown: 'korona', hourglass: 'homokóra', ring: 'gyűrű', chalice: 'kehely', red: 'rubin', purple: 'ametiszt', yellow: 'topáz', green: 'smaragd', blue: 'zafír', zeus: 'Zeusz' };
const TAU = Math.PI * 2;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = (k, v) => { try { if (v !== undefined) localStorage.setItem(k, v); return localStorage.getItem(k); } catch { return null; } };
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const isOrb = (s) => typeof s === 'string' && s[0] === 'x';
const orbVal = (s) => +s.slice(1);

let api = null, V = null;

export function open(a) {
  api = a;
  if (V) return;
  build();
}

/* ---------------- a nézet ---------------- */
function build() {
  injectCss();
  const el = document.createElement('div'); el.className = 'olv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Mosó-Olümposz kapui');
  el.innerHTML = `
    <div class="olbg"></div><div class="olstorm"></div>
    <img class="olzeus" src="/img/oly-zeus.webp" alt="" draggable="false">
    <canvas class="olcv"></canvas>
    <div class="ollogo"><b>Mosó-Olümposz</b><span>kapui</span></div>
    <div class="olside">
      <button type="button" class="olbuy">Ingyenes pörgetések<br><b></b></button>
      <div class="olfsbox" hidden><span>Ingyenes pörgetés</span><b class="olfsn">0</b><span>Össz. szorzó</span><b class="olacc">×0</b></div>
    </div>
    <div class="olbig" aria-live="polite"></div>
    <button type="button" class="olarrow l" aria-label="Vissza a félkarú rablóhoz">‹</button>
    <button type="button" class="olarrow r" aria-label="Vissza a félkarú rablóhoz">›</button>
    <button type="button" class="olx" aria-label="Vissza a tisztásra">✕</button>
    <button type="button" class="olmute" aria-label="Hang ki/be"></button>
    <div class="olbar">
      <div class="olinfo"><span>Közös pot <b class="olpot"></b></span><span class="olwinl">Nyeremény <b class="olwin">0</b></span><span class="olmsg"></span></div>
      <div class="olctl">
        <div class="olbets" role="group" aria-label="Tét"></div>
        <button type="button" class="olturbo" aria-pressed="false" title="Gyors pörgetés">⚡</button>
        <button type="button" class="olgo" aria-label="Pörgetés">⟳</button>
      </div>
      <details class="olpay"><summary>Kifizetések és szabályok</summary><div class="olpt"></div></details>
    </div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  const q = (s) => el.querySelector(s);
  V = {
    el, q, cv: q('.olcv'), g: q('.olcv').getContext('2d'), zeus: q('.olzeus'),
    bet: +(store('olyBet') || 50), mute: store('slotMute') === '1', turbo: store('olyTurbo') === '1',
    busy: false, pending: null, cells: [], parts: [], bolts: [], floats: [], waits: [], t: 0, last: performance.now(), raf: 0,
    winShown: 0, potShown: null, ts: 1, flash: 0, shake: 0, storm: false, acc: 0,
  };
  V.sheet = new Image(); V.sheet.src = '/img/oly-symbols.webp';
  V.audio = makeAudio();
  bindUi();
  resize();
  V.ro = new ResizeObserver(resize); V.ro.observe(el);
  V.onVis = () => { if (document.visibilityState === 'visible') { V.last = performance.now(); loop(); } };
  document.addEventListener('visibilitychange', V.onVis);
  renderPanel();
  // nyitáskor a rács feltöltődik (csak látvány, véletlen jelek, nyerés nélkül)
  idleGrid();
  requestAnimationFrame(() => el.classList.add('in'));
  loop();
  setTimeout(() => V && q('.olgo').focus({ preventScroll: true }), 400);
}

function close(now) {
  if (!V) return;
  const v = V; V = null;
  cancelAnimationFrame(v.raf); v.ro.disconnect();
  document.removeEventListener('visibilitychange', v.onVis);
  removeEventListener('keydown', v.onKey, true);
  if (v.audio.ctx) v.audio.ctx.close();
  if (now) v.el.remove(); else { v.el.classList.remove('in'); setTimeout(() => v.el.remove(), 260); }
  document.body.style.overflow = '';
}
// a nyilak: vissza a félkarú rablóhoz (csak innen és onnan érhető el ez a gép)
async function toClassic() {
  if (V && V.busy) return;
  const a = api; close(true);
  try { (await import('/slot.js?v=2')).open(a); } catch (e) { console.error(e); a.toast('A félkarú rabló most nem tölt be.'); }
}

/* ---------------- kezelőfelület ---------------- */
const olyState = () => (api.state() && api.state().oly) || null;
const betsOf = () => (olyState() && olyState().bets) || [20, 50, 100, 200, 500];
const buyMult = () => (olyState() && olyState().buy) || 100;
const pot = () => (api.state() ? api.state().pot : 0);
function bindUi() {
  const { q } = V;
  q('.olx').onclick = close;
  q('.olarrow.l').onclick = toClassic; q('.olarrow.r').onclick = toClassic;
  q('.olgo').onclick = () => go(false);
  q('.olbuy').onclick = () => { if (V.busy) return; if (confirm(`Ingyenes pörgetések vásárlása ${api.fmt(V.bet * buyMult())} mosómedvéért (a tét ${buyMult()}-szorosa)?`)) go(true); };
  q('.olmute').onclick = () => { V.mute = !V.mute; store('slotMute', V.mute ? '1' : '0'); renderPanel(); };
  q('.olturbo').onclick = () => { V.turbo = !V.turbo; store('olyTurbo', V.turbo ? '1' : '0'); renderPanel(); };
  q('.olbets').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b || b.disabled) return; V.bet = +b.dataset.v; store('olyBet', V.bet); renderPanel(); };
  V.cv.addEventListener('pointerdown', () => { if (V.busy) V.ts = 3; });   // kattintásra gyorsít
  V.onKey = (e) => {
    if (!V) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === ' ' || e.key === 'Enter') { if (e.target && e.target.closest && e.target.closest('summary,button:not(.olgo)')) return; e.preventDefault(); if (V.busy) V.ts = 3; else go(false); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); toClassic(); }
  };
  addEventListener('keydown', V.onKey, true);
}
function renderPanel() {
  if (!V) return;
  const { q } = V, bets = betsOf();
  if (!bets.includes(V.bet)) V.bet = bets[1] || bets[0];
  if (V.potShown === null || !V.busy) V.potShown = pot();
  q('.olpot').textContent = api.fmt(V.potShown);
  q('.olbets').innerHTML = bets.map((v) => `<button type="button" data-v="${v}" class="${v === V.bet ? 'on' : ''}" ${V.busy || pot() < v ? 'disabled' : ''}>${v}</button>`).join('');
  q('.olgo').disabled = V.busy || pot() < V.bet;
  q('.olbuy b').textContent = api.fmt(V.bet * buyMult());
  q('.olbuy').disabled = V.busy || pot() < V.bet * buyMult();
  q('.olmute').textContent = V.mute ? '🔇' : '🔊';
  q('.olturbo').setAttribute('aria-pressed', V.turbo ? 'true' : 'false');
  const st = olyState();
  if (st && !q('.olpt').dataset.ok) {
    q('.olpt').dataset.ok = 1;
    const ic = (s) => `<i class="olic" style="background-position:${ORDER.indexOf(s) * 100 / (ORDER.length - 1)}% 0"></i>`;
    q('.olpt').innerHTML = `<p>Bárhol a rácson legalább 8 egyforma jel nyer (8–9 / 10–11 / 12+). A nyerő jelek eltűnnek, a helyükre újak hullanak, amíg van nyerés. A szorzógömbök (×2–×500) a lavina végén összeadódnak és megszorozzák a nyereményt. 4+ ${ic('zeus')} = 15 ingyenes pörgetés, ott a szorzók gyűlnek; 3+ ${ic('zeus')} újabb 5 pörgetés. Legfeljebb a tét ${st.max}-szorosa.</p>` +
      `<table>${Object.entries(st.pays).map(([s, p]) => `<tr><td>${ic(s)}</td><td>${p.join(' / ')}×</td></tr>`).join('')}<tr><td>${ic('zeus')}</td><td>4: ${st.scatter[4]}× · 5: ${st.scatter[5]}× · 6: ${st.scatter[6]}×</td></tr></table>`;
  }
}
function setWin(v) { V.winShown = v; V.q('.olwin').textContent = api.fmt(Math.round(v)); }
function msg(t) { if (V) V.q('.olmsg').textContent = t || ''; }

// az index.html továbbítja a szerver üzeneteit
window.OlyHook = (m) => {
  if (!V) return;
  if (m.t === 'state' && !V.busy) renderPanel();
  else if (m.t === 'oly-result' && V.pending) { const p = V.pending; V.pending = null; p.ok(m); }
  else if (m.t === 'err' && V.pending) { const p = V.pending; V.pending = null; p.ok({ error: m.msg }); }
};

/* ---------------- a lejátszás ---------------- */
// idő: a ciklus V.t-je (gyorsítással), erre lehet várni
const wait = (s) => new Promise((ok) => V.waits.push({ at: V.t + s, ok }));
const settled = () => new Promise((ok) => V.waits.push({ until: () => V.cells.every((c) => c.state === 'rest'), ok }));

async function go(buy) {
  if (!V || V.busy) return;
  V.audio.unlock();
  const cost = buy ? V.bet * buyMult() : V.bet;
  if (pot() < cost) { msg('Nincs elég mosómedve a közös potban.'); return; }
  const since = performance.now() - (V.sentAt || 0);   // a szerver két pörgetés közt kicsit vár
  if (since < 1100) await new Promise((ok) => setTimeout(ok, 1100 - since));
  if (!V) return;
  msg(''); V.busy = true; V.ts = V.turbo ? 2 : 1; V.potShown = pot(); setWin(0); renderPanel();
  V.el.classList.add('spinning');
  const res = await new Promise((ok) => { V.pending = { ok }; V.sentAt = performance.now(); api.send({ t: 'oly-spin', amount: V.bet, buy: !!buy }); setTimeout(() => { if (V && V.pending) { V.pending = null; ok({ error: 'Nem jött válasz a géptől.' }); } }, 8000); });
  if (!V) return;
  try {
    if (res.error) { msg(res.error); }
    else await playResult(res);
  } catch (e) { console.error(e); }
  if (!V) return;
  V.busy = false; V.ts = 1; V.el.classList.remove('spinning');
  V.potShown = pot(); renderPanel();
}

async function playResult(R) {
  let total = 0;
  const base = await playSpin(R.base, { free: false });
  total += base;
  if (R.free) {
    // a kezdő szám a nyitó pörgetésé (15); a szerver free.awarded-je már az újraindítások összegét is tartalmazza
    const first = R.base.awarded || 15;
    await freeIntro(first);
    V.acc = 0; V.q('.olacc').textContent = '×0'; V.q('.olfsbox').hidden = false;
    let left = first;
    for (const sp of R.free.spins) {
      if (!V) return;
      left--; V.q('.olfsn').textContent = left;
      total += await playSpin(sp, { free: true });
      if (sp.awarded) { left += sp.awarded; V.q('.olfsn').textContent = left; pulse('.olfsn'); await banner(`+${sp.awarded} ingyenes pörgetés`, 'retrig', 1.6); }
    }
    await wait(0.4);
    V.q('.olfsbox').hidden = true; setStorm(false);
  }
  hidePlate();
  setWin(R.back);
  const tier = R.capped ? 'max' : R.mult >= 500 ? 'legend' : R.mult >= 100 ? 'epic' : R.mult >= 50 ? 'mega' : R.mult >= 15 ? 'big' : '';
  if (tier) await bigWin(tier, R.back, R.free ? `Ingyenes pörgetések összesen` : '');
  else if (R.free) await bigWin('fs', R.back, 'Ingyenes pörgetések összesen');
  else if (R.back > 0) V.audio.land();
}

// egy pörgetés: a régi jelek kihullanak, az új rács lehullik, lavinák, szorzók, szórt jelek
async function playSpin(sp, { free }) {
  dropOut(); await wait(0.28);
  dropIn(sp.grid); await settled();
  await zapOrbs();
  let win = 0;
  for (const cas of sp.cascades) {
    const cells = [];
    for (const w of cas.wins) for (const [c, r] of w.cells) { const cell = cellAt(c, r); if (cell) { cell.win = w.s; cells.push(cell); } }
    V.audio.winHit(cas.wins.length);
    cas.wins.forEach((w) => { const cs = w.cells.map(([c, r]) => center(c, r)); const x = cs.reduce((a, p) => a + p.x, 0) / cs.length, y = cs.reduce((a, p) => a + p.y, 0) / cs.length; floatText(x, y, `+${api.fmt(Math.round(w.pay))}`, COLOR[w.s]); });
    await wait(0.6);
    for (const cell of cells) explode(cell);
    V.audio.burst();
    win += cas.wins.reduce((a, w) => a + w.pay, 0); setWin(V.winShown + cas.wins.reduce((a, w) => a + w.pay, 0));
    plate(win, sp.cascades.length > 1 ? 'Lavina nyeremény' : 'Nyeremény');
    await wait(0.18);
    tumble(cas.fill, cas.grid); await settled();
    await zapOrbs();
  }
  // a lavina vége: a szorzógömbök a nyereményhez repülnek
  let total = win;
  if (win > 0 && sp.orbs && sp.orbs.length) {
    for (const o of sp.orbs) { const cell = cellAt(o.c, o.r); if (cell) await orbFly(cell); }
    if (free) { V.acc = sp.accum || V.acc; V.q('.olacc').textContent = '×' + V.acc; pulse('.olacc'); }
    total = win * (sp.applied || 1);
    plate(null, 'Szorzó', `${api.fmt(Math.round(win))} × ${sp.applied}`); V.audio.zap(sp.applied); await wait(0.9);
    plate(total, 'Nyeremény', null, true); V.audio.land();
    setWin(V.winShown - win + total);
  }
  if (sp.scatters >= 4 || (free && sp.scatters >= 3)) {
    for (const c of V.cells) if (c.s === 'zeus') c.hot = 1;
    V.audio.scatter(); zeusStrike(); await wait(1.0);
    for (const c of V.cells) c.hot = 0;
  }
  if (sp.scatterPay) { setWin(V.winShown + sp.scatterPay); plate(total + sp.scatterPay, 'Nyeremény Zeusz-érmékkel'); }
  if (sp.total > 0) await wait(free ? 1.1 : 0.9);   // a tábla egy kicsit még látszik
  return sp.total;
}

/* --- a rács és a cellák mozgása --- */
function geo() { return V.geo; }
function center(c, r) { const G = geo(); return { x: G.x + (c + 0.5) * G.s, y: G.y + (r + 0.5) * G.s }; }
function cellAt(c, r) { return V.cells.find((x) => x.c === c && x.r === r && x.state !== 'gone' && !x.out); }
function mkCell(s, c, r, fromY, delay) { const G = geo(); return { s, c, r, y: fromY, ty: G.y + r * G.s, vy: 0, delay, state: 'fall', sc: 1, hot: 0, win: null, zapped: !isOrb(s), age: 0, rot: rnd(-0.3, 0.3) }; }
function idleGrid() {
  const G = geo(), pool = ORDER.slice(0, 9);
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) V.cells.push(mkCell(pool[Math.floor(Math.random() * pool.length)], c, r, G.y - (ROWS - r) * G.s - 40, c * 0.06 + 0.2));
}
// a nagy nyereménytábla a rács közepén: minden lavinánál felvillan, a szorzónál előbb a szorzást mutatja
function plate(amount, label, text, big) {
  let p = V.plate;
  if (!p) { p = V.plate = document.createElement('div'); p.className = 'olplate'; p.innerHTML = '<div class="pl"></div><div class="pv"></div>'; V.el.appendChild(p); }
  p.querySelector('.pl').textContent = label;
  p.querySelector('.pv').textContent = text || '+' + api.fmt(Math.round(amount));
  p.classList.toggle('mul', !!text); p.classList.toggle('big', !!big);
  p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit');
  const g = geo(); V.flash = Math.max(V.flash, 0.18);
  if (amount) for (let i = 0; i < 14; i++) P({ kind: 'spark', color: '#ffd36a', x: g.x + g.w / 2 + rnd(-g.w * 0.25, g.w * 0.25), y: g.y + g.h / 2 + rnd(-30, 30), vx: rnd(-260, 260), vy: rnd(-220, 120), life: 0.6, s: 3, drag: 2 });
}
function hidePlate() { const p = V.plate; if (!p) return; V.plate = null; p.classList.add('out'); setTimeout(() => p.remove(), 300); }
function dropOut() {
  hidePlate(); const G = geo(); for (const cl of V.cells) { cl.out = true; cl.state = 'fall'; cl.ty = G.y + G.h + G.s * 2 + (ROWS - cl.r) * G.s; cl.delay = cl.c * 0.035 + (ROWS - cl.r) * 0.01; cl.vy = 0; } V.audio.whoosh(); }
function dropIn(grid) {
  const G = geo();
  V.cells = V.cells.filter((c) => c.out);   // a kihullók még látszanak, amíg el nem tűnnek
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) V.cells.push(mkCell(grid[c][r], c, r, G.y - (ROWS - r) * G.s - G.s * 0.6, 0.12 + c * 0.07));
}
function tumble(fill, grid) {
  const G = geo();
  for (let c = 0; c < COLS; c++) {
    const survivors = V.cells.filter((x) => x.c === c && !x.out && x.state !== 'gone' && x.state !== 'boom').sort((a, b) => a.r - b.r);
    const nNew = (fill[c] || []).length;
    survivors.forEach((cl, i) => { const nr = nNew + i; if (nr !== cl.r) { cl.r = nr; cl.ty = G.y + nr * G.s; cl.state = 'fall'; cl.vy = 0; cl.delay = 0; } });
    (fill[c] || []).forEach((s, i) => V.cells.push(mkCell(s, c, i, G.y - (nNew - i) * G.s - G.s * 0.3, 0.05 + c * 0.03)));
  }
  // biztosítékként a cellák jelét a szerver rácsához igazítjuk
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const cl = cellAt(c, r); if (cl) cl.s = grid[c][r]; }
}
function updateCells(dt) {
  const G = geo(), g = 5200 * (G.s / 110);
  for (const cl of V.cells) {
    cl.age += dt;
    if (cl.state === 'fall') {
      if (cl.delay > 0) { cl.delay -= dt; continue; }
      cl.vy += g * dt; cl.y += cl.vy * dt;
      if (cl.y >= cl.ty) {
        cl.y = cl.ty;
        if (cl.out) { cl.state = 'gone'; continue; }
        if (cl.vy > 500) { cl.vy = -cl.vy * 0.22; if (cl.r === ROWS - 1 || Math.random() < 0.15) V.audio.land(cl.c); }
        else { cl.vy = 0; cl.state = 'rest'; if (cl.s === 'zeus') { V.audio.thud(); ring(center(cl.c, cl.r), COLOR.zeus); } }
      }
    } else if (cl.state === 'boom') { cl.sc += dt * 4; if (cl.sc > 1.5) cl.state = 'gone'; }
  }
  V.cells = V.cells.filter((c) => c.state !== 'gone');
}
function explode(cl) {
  cl.state = 'boom'; const p = center(cl.c, cl.r), col = COLOR[cl.s] || '#fff';
  for (let i = 0; i < 16; i++) { const a = rnd(0, TAU), sp = rnd(160, 520); P({ kind: 'shard', color: col, x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 900, life: rnd(0.5, 0.9), s: rnd(3, 7) * geo().s / 110, rot: rnd(0, 6), vr: rnd(-10, 10) }); }
  for (let i = 0; i < 6; i++) P({ kind: 'spark', color: '#fff', x: p.x, y: p.y, vx: rnd(-200, 200), vy: rnd(-200, 200), life: 0.4, s: 3, drag: 3 });
}

/* --- Zeusz és a villámok --- */
function zeusHand() { const r = V.zeus.getBoundingClientRect(), o = V.el.getBoundingClientRect(); return { x: r.left - o.left + r.width * 0.86, y: r.top - o.top + r.height * 0.12 }; }
function zeusStrike() { V.zeus.classList.remove('strike'); void V.zeus.offsetWidth; V.zeus.classList.add('strike'); }
function bolt(a, b, life = 0.28, width = 1) { V.bolts.push({ a, b, age: 0, life, width }); V.flash = Math.max(V.flash, 0.25); }
async function zapOrbs() {
  const orbs = V.cells.filter((c) => isOrb(c.s) && !c.zapped && !c.out);
  for (const cl of orbs) {
    cl.zapped = true; zeusStrike(); const p = center(cl.c, cl.r);
    bolt(zeusHand(), p); V.audio.zap(orbVal(cl.s)); cl.pop = 0; ring(p, orbColor(orbVal(cl.s)));
    await wait(0.32);
  }
}
async function orbFly(cl) {
  const from = center(cl.c, cl.r), to = winPos();
  V.floats.push({ kind: 'orb', v: orbVal(cl.s), from, to, age: 0, life: 0.55 });
  cl.flown = true;
  V.audio.collect();
  await wait(0.42);
}
function winPos() { const r = (V.plate || V.q('.olwin')).getBoundingClientRect(), o = V.el.getBoundingClientRect(); return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 }; }
function orbColor(v) { return v >= 250 ? '#ffd23e' : v >= 50 ? '#ff4d4d' : v >= 15 ? '#c25cff' : v >= 8 ? '#3e9bff' : '#3ee07a'; }
function ring(p, color) { P({ kind: 'ring', color, x: p.x, y: p.y, life: 0.6, s: geo().s * 0.5 }); }
function floatText(x, y, t, color) { V.floats.push({ kind: 'text', x, y, t, color, age: 0, life: 1.1 }); }
function pulse(sel) { const e = V.q(sel); e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
function setStorm(on) { V.storm = on; V.el.classList.toggle('storm', on); }

/* --- feliratok, ünneplés --- */
function banner(text, kind, sec) {
  const b = document.createElement('div'); b.className = 'olban ' + kind; b.textContent = text; V.el.appendChild(b);
  return wait(sec).then(() => { b.classList.add('out'); setTimeout(() => b.remove(), 400); });
}
async function freeIntro(n) {
  zeusStrike(); V.audio.thunder(); setStorm(true); V.flash = 1; V.shake = 0.6;
  for (let i = 0; i < 5; i++) setTimeout(() => V && bolt({ x: rnd(0, V.W), y: -10 }, { x: rnd(0, V.W), y: rnd(V.H * 0.3, V.H * 0.8) }, 0.35, 1.6), i * 160);
  const b = document.createElement('div'); b.className = 'olfs';
  b.innerHTML = `<div class="t1">Zeusz megnyitotta a kapukat!</div><div class="t2">${n}</div><div class="t3">ingyenes pörgetés</div><div class="t4">A szorzók most összegyűlnek</div>`;
  V.el.appendChild(b); V.audio.fanfare(1);
  await wait(2.6);
  b.classList.add('out'); setTimeout(() => b.remove(), 500);
  await wait(0.3);
}
async function bigWin(tier, amount, sub) {
  const T = { big: ['Nagy nyeremény', 3], mega: ['Mega nyeremény', 4], epic: ['Epikus nyeremény', 5], legend: ['Legendás nyeremény', 6], max: ['MAX nyeremény', 6.5], fs: ['Összesen', 2.2] }[tier];
  const b = document.createElement('div'); b.className = 'olbigwin t-' + tier;
  b.innerHTML = `<div class="bt">${T[0]}</div><div class="ba">0</div>${sub ? `<div class="bs">${sub}</div>` : ''}<div class="bk">kattints a folytatáshoz</div>`;
  V.el.appendChild(b); V.audio.fanfare(tier === 'fs' ? 1 : tier === 'big' ? 2 : 3);
  if (tier !== 'fs') { zeusStrike(); V.shake = 0.5; coinRain(tier === 'big' ? 50 : tier === 'mega' ? 90 : 150); for (let i = 0; i < (tier === 'big' ? 2 : 6); i++) setTimeout(() => V && bolt(zeusHand(), { x: rnd(V.W * 0.2, V.W * 0.8), y: rnd(V.H * 0.2, V.H * 0.7) }, 0.4, 1.4), i * 450); }
  const el = b.querySelector('.ba'), t0 = V.t; let done = false, skip = false;
  b.onclick = () => { if (!done) skip = true; else b.dataset.close = 1; };
  V.audio.count(true);
  await new Promise((ok) => V.waits.push({ until: () => { const u = skip ? 1 : clamp01((V.t - t0) / T[1]); el.textContent = '+' + api.fmt(Math.round(amount * (1 - Math.pow(1 - u, 2.2)))); if (u >= 1 && !done) { done = true; V.audio.count(false); V.audio.land(); b.classList.add('landed'); } return done; }, ok }));
  await new Promise((ok) => V.waits.push({ until: () => b.dataset.close || V.t - t0 > T[1] + 2.4, ok }));
  b.classList.add('out'); setTimeout(() => b.remove(), 400);
}

/* --- részecskék --- */
function P(o) { V.parts.push(Object.assign({ age: 0, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, s: 1, drag: 0 }, o)); }
function coinRain(n) { for (let i = 0; i < n; i++) P({ kind: 'coin', x: rnd(0, V.W), y: -30, delay: rnd(0, 3), vx: rnd(-40, 40), vy: rnd(100, 300), g: 900, life: 3.4, s: rnd(10, 20), spin: rnd(4, 12) }); }

/* ---------------- rajzolás ---------------- */
function resize() {
  if (!V) return;
  const W = V.el.clientWidth, H = V.el.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  V.W = W; V.H = H; V.cv.width = W * dpr; V.cv.height = H * dpr; V.cv.style.width = W + 'px'; V.cv.style.height = H + 'px';
  V.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const portrait = W / H < 1.05, bar = portrait ? 190 : 150;
  let s = portrait ? Math.min((W - 24) / COLS, (H - bar - 170) / ROWS) : Math.min((H - bar - 70) / ROWS, (W * 0.56) / COLS);
  s = Math.max(40, Math.floor(s));
  const gw = s * COLS, gh = s * ROWS;
  const x = portrait ? (W - gw) / 2 : Math.max(W * 0.44 - gw / 2, 190), y = portrait ? 150 : Math.max(46, (H - bar - gh) / 2 + 8);
  const old = V.geo; V.geo = { x, y, s, w: gw, h: gh };
  V.el.classList.toggle('portrait', portrait);
  V.el.style.setProperty('--gx', x + 'px'); V.el.style.setProperty('--gy', y + 'px'); V.el.style.setProperty('--gw', gw + 'px'); V.el.style.setProperty('--gh', gh + 'px');
  if (old) for (const c of V.cells) { c.ty = y + c.r * s; if (c.state === 'rest') c.y = c.ty; }
}
function drawGrid(g) {
  const G = geo();
  // keret: sötét üveg, arany szegély, finom oszlopok
  g.save();
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 30;
  rr(g, G.x - 10, G.y - 10, G.w + 20, G.h + 20, 18); g.fillStyle = 'rgba(25,18,48,.72)'; g.fill();
  g.shadowBlur = 0;
  const gold = g.createLinearGradient(0, G.y - 10, 0, G.y + G.h + 10); gold.addColorStop(0, '#fff2b8'); gold.addColorStop(0.3, '#e0a93c'); gold.addColorStop(0.7, '#b8781e'); gold.addColorStop(1, '#ffe59a');
  g.lineWidth = 5; g.strokeStyle = gold; g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,220,150,.12)';
  for (let c = 1; c < COLS; c++) { g.beginPath(); g.moveTo(G.x + c * G.s, G.y + 4); g.lineTo(G.x + c * G.s, G.y + G.h - 4); g.stroke(); }
  g.restore();
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawCells(g) {
  const G = geo();
  g.save(); g.beginPath(); g.rect(G.x - 6, G.y - 6, G.w + 12, G.h + 12); g.clip();
  for (const cl of V.cells) {
    if (cl.flown && isOrb(cl.s)) continue;
    const x = G.x + cl.c * G.s + G.s / 2, y = cl.y + G.s / 2;
    let sc = 1, a = 1, glow = 0;
    if (cl.state === 'boom') { sc = cl.sc; a = clamp01(1.5 - cl.sc) * 2; glow = 1; }
    else if (cl.win) { sc = 1 + 0.1 * Math.sin(V.t * 18); glow = 1; }
    if (cl.hot) { sc = 1 + 0.12 * Math.sin(V.t * 14); glow = 1; }
    if (cl.pop !== undefined && cl.pop < 1) { cl.pop = Math.min(1, cl.pop + 0.06); sc *= 0.25 + 0.75 * easeBack(cl.pop); }
    g.save(); g.globalAlpha = a; g.translate(x, y); g.scale(sc, sc);
    if (glow) { g.shadowColor = COLOR[cl.win || cl.s] || '#fff'; g.shadowBlur = 26; }
    if (isOrb(cl.s)) drawOrb(g, orbVal(cl.s), G.s * 0.44);
    else { const i = ORDER.indexOf(cl.s), sz = G.s * 0.86; if (V.sheet.complete && i >= 0) g.drawImage(V.sheet, i * 200, 0, 200, 200, -sz / 2, -sz / 2, sz, sz); }
    g.restore();
  }
  g.restore();
}
const easeBack = (x) => { x = clamp01(x); const c1 = 1.9; return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function drawOrb(g, v, r) {
  const col = orbColor(v);
  const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, col); gr.addColorStop(1, shade(col));
  g.shadowColor = col; g.shadowBlur = 22;
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 1.08, V.t * 3, V.t * 3 + 1.8); g.stroke();
  g.font = `900 ${Math.round(r * (v >= 100 ? 0.62 : 0.78))}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = 'rgba(30,10,40,.85)'; g.strokeText('×' + v, 0, 2); g.fillStyle = '#fff'; g.fillText('×' + v, 0, 2);
}
function shade(hex) { const n = parseInt(hex.slice(1), 16); const f = (x) => Math.round(x * 0.35); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
function jag(a, b, n = 7, off = 0.18) { const pts = [a]; const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); for (let i = 1; i < n; i++) { const t = i / n; pts.push({ x: a.x + dx * t + rnd(-1, 1) * L * off * (1 - Math.abs(t - 0.5)), y: a.y + dy * t + rnd(-1, 1) * L * off * 0.5 }); } pts.push(b); return pts; }
function drawFx(g, dt) {
  // villámok (minden képkockán új cikcakk: vibrál)
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  V.bolts = V.bolts.filter((b) => (b.age += dt) < b.life);
  for (const b of V.bolts) {
    const pts = jag(b.a, b.b, 9), k = 1 - b.age / b.life;
    for (const [w, c] of [[14, `rgba(80,160,255,${0.25 * k})`], [6, `rgba(150,210,255,${0.7 * k})`], [2.2, `rgba(255,255,255,${k})`]]) { g.strokeStyle = c; g.lineWidth = w * b.width; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
  }
  g.restore();
  // részecskék
  const keep = [];
  for (const p of V.parts) {
    if (p.delay > 0) { p.delay -= dt; keep.push(p); continue; }
    p.age += dt; if (p.age > p.life) continue;
    p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    const k = p.age / p.life; g.save(); g.globalAlpha = Math.min(1, (1 - k) * 3);
    if (p.kind === 'shard') { g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.color; g.beginPath(); g.moveTo(0, -p.s); g.lineTo(p.s * 0.7, 0); g.lineTo(0, p.s); g.lineTo(-p.s * 0.7, 0); g.closePath(); g.fill(); }
    else if (p.kind === 'spark') { g.globalCompositeOperation = 'lighter'; g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); }
    else if (p.kind === 'ring') { g.globalAlpha = 1 - k; g.strokeStyle = p.color; g.lineWidth = 4 * (1 - k) + 1; g.shadowColor = p.color; g.shadowBlur = 16; g.beginPath(); g.arc(p.x, p.y, p.s * (0.6 + k * 1.4), 0, TAU); g.stroke(); }
    else if (p.kind === 'coin') {
      if (p.y > V.H - p.s && p.vy > 0) { p.vy *= -0.4; p.y = V.H - p.s; }
      g.translate(p.x, p.y); g.scale(Math.max(0.15, Math.abs(Math.cos(p.age * p.spin))), 1);
      const gr = g.createRadialGradient(-p.s * 0.3, -p.s * 0.3, 1, 0, 0, p.s); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.5, '#ffc83a'); gr.addColorStop(1, '#b8780e');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, p.s, 0, TAU); g.fill();
    }
    g.restore(); keep.push(p);
  }
  V.parts = keep;
  // repülő gömbök és nyereményfeliratok
  V.floats = V.floats.filter((f) => (f.age += dt) < f.life);
  for (const f of V.floats) {
    const k = f.age / f.life;
    g.save();
    if (f.kind === 'text') {
      g.globalAlpha = Math.min(1, (1 - k) * 2.5); const s = Math.round(geo().s * 0.36 * (1 + 0.3 * Math.max(0, 0.2 - k) * 5));
      g.font = `900 ${s}px system-ui,sans-serif`; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = 'rgba(30,10,40,.9)';
      g.strokeText(f.t, f.x, f.y - k * 40); g.fillStyle = '#fff'; g.shadowColor = f.color; g.shadowBlur = 14; g.fillText(f.t, f.x, f.y - k * 40);
    } else {
      const e = k * k * (3 - 2 * k), x = f.from.x + (f.to.x - f.from.x) * e, y = f.from.y + (f.to.y - f.from.y) * e - Math.sin(k * Math.PI) * 120;
      g.translate(x, y); g.scale(1 - k * 0.4, 1 - k * 0.4); drawOrb(g, f.v, geo().s * 0.4);
      if (k > 0.9 && !f.hit) { f.hit = 1; pulse('.olwin'); if (V.plate) { V.plate.classList.remove('hit'); void V.plate.offsetWidth; V.plate.classList.add('hit'); } }
    }
    g.restore();
  }
  if (V.flash > 0) { g.fillStyle = `rgba(220,235,255,${V.flash * 0.5})`; g.fillRect(0, 0, V.W, V.H); V.flash = Math.max(0, V.flash - dt * 2.5); }
}
function loop() {
  if (!V) return;
  cancelAnimationFrame(V.raf);
  if (document.visibilityState !== 'visible') return;
  V.raf = requestAnimationFrame(loop);
  const now = performance.now(), real = Math.min(0.05, (now - V.last) / 1000); V.last = now;
  const dt = real * V.ts; V.t += dt;
  updateCells(dt);
  V.waits = V.waits.filter((w) => { if (w.until ? w.until() : V.t >= w.at) { w.ok(); return false; } return true; });
  // vihar alatt néha magától is villámlik
  if (V.storm && Math.random() < real * 0.5) bolt({ x: rnd(0, V.W), y: -10 }, { x: rnd(0, V.W), y: rnd(V.H * 0.2, V.H * 0.6) }, 0.3, 0.9);
  V.shake = Math.max(0, V.shake - real); const sh = reduced ? 0 : V.shake * 10;
  V.cv.style.transform = sh ? `translate(${rnd(-sh, sh)}px,${rnd(-sh, sh)}px)` : '';
  const g = V.g; g.clearRect(0, 0, V.W, V.H);
  drawGrid(g); drawCells(g); drawFx(g, dt);
}

/* ---------------- hangok (WebAudio, szintetizálva) ---------------- */
function makeAudio() {
  const A = { ctx: null, master: null, cT: null };
  const ok = () => (!V || V.mute ? null : A.ctx);
  A.unlock = () => { if (!A.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; A.ctx = new C(); A.master = A.ctx.createGain(); A.master.gain.value = 0.45; A.master.connect(A.ctx.destination); } if (A.ctx.state === 'suspended') A.ctx.resume(); };
  const tone = (f, t, d, type = 'sine', v = 0.3, f2) => { const c = ok(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, c.currentTime + t + d); g.gain.setValueAtTime(0, c.currentTime + t); g.gain.linearRampToValueAtTime(v, c.currentTime + t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + d); o.connect(g); g.connect(A.master); o.start(c.currentTime + t); o.stop(c.currentTime + t + d + 0.05); };
  const noise = (t, d, v = 0.2, fq = 2000, type = 'bandpass') => { const c = ok(); if (!c) return; const b = c.createBuffer(1, Math.ceil(c.sampleRate * d), c.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 2); const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = fq; const g = c.createGain(); g.gain.value = v; s.connect(f); f.connect(g); g.connect(A.master); s.start(c.currentTime + t); };
  const notes = (seq, step, type = 'triangle', v = 0.2) => seq.forEach((f, i) => f && tone(f, i * step, step * 2.4, type, v));
  A.whoosh = () => noise(0, 0.35, 0.12, 900, 'lowpass');
  A.land = (c = 0) => { tone(140 + c * 12, 0, 0.08, 'sine', 0.18, 70); noise(0, 0.03, 0.06, 2500); };
  A.thud = () => { tone(90, 0, 0.3, 'sine', 0.4, 45); tone(880, 0, 0.5, 'triangle', 0.08, 1320); };
  A.winHit = (n) => notes([1047, 1319, 1568].slice(0, 1 + Math.min(2, n)), 0.06);
  A.burst = () => { noise(0, 0.25, 0.2, 4000); [2093, 2637, 3136].forEach((f, i) => tone(f, i * 0.02, 0.25, 'sine', 0.05)); };
  A.zap = (v) => { noise(0, 0.18, 0.3, 6000, 'highpass'); tone(1800, 0, 0.18, 'sawtooth', 0.05, 200); tone(v >= 50 ? 330 : 523, 0.1, 0.4, 'triangle', 0.15); };
  A.collect = () => tone(880, 0, 0.3, 'triangle', 0.14, 1760);
  A.thunder = () => { noise(0, 1.8, 0.5, 180, 'lowpass'); noise(0.05, 0.4, 0.3, 3000); tone(60, 0, 1.2, 'sine', 0.4, 35); };
  A.scatter = () => { A.thunder(); notes([523, 659, 784, 1047], 0.09, 'square', 0.06); };
  A.fanfare = (lvl) => { const s = lvl === 1 ? [523, 659, 784, 1047, 1319] : lvl === 2 ? [392, 523, 659, 784, 1047, 1319, 1568] : [392, 523, 659, 784, 1047, 1319, 1568, 2093, 1568, 2093]; notes(s, 0.09, 'square', 0.06); [261, 329, 392].forEach((f) => tone(f, s.length * 0.09, 1.6, 'sawtooth', 0.05)); };
  A.count = (on) => { clearInterval(A.cT); if (!on) return; let i = 0; A.cT = setInterval(() => { if (ok()) tone(1100 + (i++ % 10) * 70, 0, 0.04, 'square', 0.035); }, 75); };
  return A;
}

/* ---------------- stílus ---------------- */
function injectCss() {
  if (document.getElementById('olcss')) return;
  const s = document.createElement('style'); s.id = 'olcss';
  s.textContent = `
.olv{position:fixed;inset:0;z-index:3000;overflow:hidden;opacity:0;transition:opacity .25s;font-family:system-ui,-apple-system,sans-serif;color:#fff;background:#1a1030}
.olv.in{opacity:1}
.olbg{position:absolute;inset:-20px;background:url(/img/oly-bg.webp) center/cover;transition:filter 1.2s;animation:olbgz 30s ease-in-out infinite alternate}
@keyframes olbgz{from{transform:scale(1.02)}to{transform:scale(1.08) translateY(-10px)}}
.olv.storm .olbg{filter:brightness(.45) saturate(.6) hue-rotate(185deg)}
.olstorm{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,transparent 35%,rgba(10,5,30,.6));pointer-events:none}
.olv.storm .olstorm{background:radial-gradient(ellipse at 50% 30%,rgba(60,120,255,.15),rgba(5,5,30,.75))}
.olcv{position:absolute;inset:0;z-index:2}
.olzeus{position:absolute;z-index:1;left:calc(var(--gx) + var(--gw) - 30px);bottom:110px;height:min(78vh,820px);width:auto;pointer-events:none;filter:drop-shadow(0 10px 30px rgba(0,0,0,.45));animation:olbob 4s ease-in-out infinite;transform-origin:60% 100%}
.olzeus.strike{animation:olstrike .55s ease-out,olbob 4s ease-in-out .55s infinite}
@keyframes olbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes olstrike{0%{transform:scale(1);filter:drop-shadow(0 0 0 #7fd8ff) brightness(1)}30%{transform:scale(1.06) rotate(-2deg);filter:drop-shadow(0 0 40px #7fd8ff) brightness(1.5)}100%{transform:scale(1);filter:drop-shadow(0 10px 30px rgba(0,0,0,.45)) brightness(1)}}
.ollogo{position:absolute;z-index:3;left:calc(var(--gx) - 10px);top:calc(var(--gy) - 46px);width:calc(var(--gw) + 20px);text-align:center;pointer-events:none;line-height:1}
.ollogo b{font:900 clamp(20px,3vw,34px)/1 Georgia,serif;letter-spacing:.04em;background:linear-gradient(180deg,#fff7d0,#ffcf4a 45%,#b8701a);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 #4a2306) drop-shadow(0 0 14px rgba(255,200,80,.6))}
.ollogo span{display:inline-block;margin-left:8px;font:700 clamp(14px,1.8vw,20px) Georgia,serif;color:#fff2c0;text-shadow:0 2px 4px #000}
.olside{position:absolute;z-index:3;left:max(12px,calc(var(--gx) - 190px));top:calc(var(--gy) + 20px);width:160px;display:flex;flex-direction:column;gap:12px}
.olbuy{border:0;border-radius:16px;padding:14px 10px;font:800 14px/1.25 system-ui,sans-serif;color:#2a1406;cursor:pointer;background:linear-gradient(180deg,#ffe58a,#f0a52a);box-shadow:0 4px 0 #a8620e,0 0 24px rgba(255,190,60,.45)}
.olbuy b{font-size:17px}
.olbuy:disabled{filter:grayscale(.8);opacity:.55;cursor:default}
.olfsbox{display:grid;gap:2px;text-align:center;padding:10px;border-radius:16px;background:rgba(20,30,80,.75);border:2px solid #7fd8ff;box-shadow:0 0 24px rgba(120,200,255,.5)}
.olfsbox[hidden]{display:none}
.olfsbox span{font-size:12px;opacity:.85}.olfsbox b{font:900 30px/1.1 system-ui,sans-serif;color:#fff;text-shadow:0 0 12px #7fd8ff}
.olfsbox .olacc{color:#ffd36a;text-shadow:0 0 14px #ff9a3c}
.pop{animation:olpop .45s cubic-bezier(.2,2,.4,1)}
@keyframes olpop{0%{transform:scale(1.6)}100%{transform:scale(1)}}
.olarrow{position:absolute;z-index:6;top:50%;transform:translateY(-50%);width:54px;height:96px;border:0;border-radius:16px;background:rgba(10,15,22,.45);color:#fff;font:300 64px/1 system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(6px)}
.olarrow.l{left:10px}.olarrow.r{right:10px}
.olarrow:hover,.olarrow:focus-visible{background:rgba(255,210,100,.35);outline:none}
.olv.spinning .olarrow{opacity:.35;pointer-events:none}
.olx,.olmute{position:absolute;top:14px;z-index:6;width:42px;height:42px;border-radius:50%;border:0;background:rgba(10,15,22,.6);color:#fff;font-size:18px;cursor:pointer}
.olx{right:14px}.olmute{right:64px}
.olbar{position:absolute;z-index:5;left:50%;bottom:12px;transform:translateX(-50%);width:min(760px,calc(100% - 24px));box-sizing:border-box;padding:10px 14px;border-radius:20px;background:rgba(20,10,40,.72);border:1px solid rgba(255,210,120,.3);backdrop-filter:blur(10px)}
.olinfo{display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;font-size:14px}
.olinfo b{font-size:18px;color:#ffd36a;display:inline-block}
.olwinl b{color:#9dffa0;min-width:60px}
.olmsg{color:#ffb4a0;font-size:13px}
.olctl{display:flex;align-items:center;gap:10px;margin-top:8px}
.olbets{display:flex;gap:6px;flex:1;flex-wrap:wrap}
.olbets button{min-width:48px;height:38px;border-radius:999px;border:2px solid rgba(255,211,106,.5);background:rgba(255,255,255,.08);color:#fff;font-weight:800;cursor:pointer}
.olbets button.on{background:#ffd36a;color:#2a1406;border-color:#ffd36a}
.olbets button:disabled{opacity:.35;cursor:default}
.olturbo{width:42px;height:42px;border-radius:50%;border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;font-size:18px;cursor:pointer}
.olturbo[aria-pressed=true]{background:#7fd8ff;color:#06203a;border-color:#7fd8ff}
.olgo{width:74px;height:74px;margin-top:-30px;border-radius:50%;border:4px solid #fff2b8;font:900 34px/1 system-ui,sans-serif;color:#2a1406;cursor:pointer;background:radial-gradient(circle at 35% 30%,#fff6c8,#ffc23a 55%,#c87810);box-shadow:0 6px 0 #8a4c06,0 0 30px rgba(255,190,60,.6);transition:transform .15s}
.olgo:hover:not(:disabled){transform:rotate(90deg)}
.olgo:disabled{filter:grayscale(.6);opacity:.7;cursor:default}
.olv.spinning .olgo{animation:olspin .8s linear infinite}
@keyframes olspin{to{transform:rotate(360deg)}}
.olpay{margin-top:6px;font-size:13px}.olpay summary{cursor:pointer;opacity:.8}
.olpt p{margin:6px 0;line-height:1.45;opacity:.9}.olpt table{border-collapse:collapse}.olpt td{padding:2px 10px 2px 0;vertical-align:middle}
.olic{display:inline-block;width:26px;height:26px;vertical-align:middle;background:url(/img/oly-symbols.webp) 0 0/1000% 100% no-repeat}
.olplate{position:absolute;z-index:7;left:calc(var(--gx) + var(--gw)/2);top:calc(var(--gy) + var(--gh)/2);transform:translate(-50%,-50%);pointer-events:none;text-align:center;padding:14px 38px 16px;border-radius:22px;min-width:min(60%,320px);
  background:linear-gradient(180deg,rgba(60,20,90,.88),rgba(20,8,40,.92));border:3px solid #f3c35a;box-shadow:0 0 0 2px rgba(80,40,0,.6),0 0 40px rgba(255,190,60,.55),0 12px 30px rgba(0,0,0,.5)}
.olplate .pl{font:800 clamp(13px,1.6vw,17px)/1.2 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#ffe6a6}
.olplate .pv{margin-top:4px;font:900 clamp(40px,7vw,78px)/1 system-ui,sans-serif;color:#fff;background:linear-gradient(180deg,#fffbe8,#ffd36a 55%,#e08a12);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 0 #6a3206) drop-shadow(0 0 18px rgba(255,200,80,.85));white-space:nowrap}
.olplate.mul .pv{background:linear-gradient(180deg,#fff,#9fe0ff 55%,#3a8bff);-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 4px 0 #06203a) drop-shadow(0 0 20px #7fd8ff)}
.olplate.big{border-color:#fff2b8;box-shadow:0 0 0 2px rgba(80,40,0,.6),0 0 70px rgba(255,200,80,.9),0 12px 30px rgba(0,0,0,.5)}
.olplate.hit{animation:olplatein .5s cubic-bezier(.2,1.8,.4,1) both,olplateflash .9s ease-out}
.olplate.out{animation:olplateout .3s ease-in both}
@keyframes olplatein{0%{transform:translate(-50%,-50%) scale(1.6);opacity:.2}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
@keyframes olplateflash{0%{filter:brightness(2.2)}30%{filter:brightness(1.4)}100%{filter:none}}
@keyframes olplateout{to{transform:translate(-50%,-50%) scale(.7);opacity:0}}
.olban{position:absolute;z-index:7;left:50%;top:calc(var(--gy) + var(--gh)/2);transform:translate(-50%,-50%);pointer-events:none;font:900 clamp(30px,5vw,60px)/1 Georgia,serif;color:#fff;-webkit-text-stroke:2px #3a1a06;text-shadow:0 5px 0 #3a1a06,0 0 30px rgba(255,200,80,.9);animation:olbanin .45s cubic-bezier(.2,1.8,.4,1) both;white-space:nowrap}
.olban.mult{color:#ffe38a}.olban.retrig{color:#bfe9ff;text-shadow:0 5px 0 #06203a,0 0 30px #7fd8ff}
.olban.out{animation:olbanout .35s ease-in both}
@keyframes olbanin{0%{transform:translate(-50%,-50%) scale(2.4);opacity:0;filter:blur(8px)}100%{transform:translate(-50%,-50%) scale(1);opacity:1;filter:none}}
@keyframes olbanout{to{transform:translate(-50%,-50%) scale(.6);opacity:0}}
.olfs{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle,rgba(30,60,160,.55),rgba(5,5,25,.85));animation:olfade .4s both;text-align:center}
.olfs.out{animation:olfadeo .5s both}
.olfs .t1{font:800 clamp(18px,3vw,30px) Georgia,serif;color:#bfe9ff;text-shadow:0 0 18px #4a8bff;animation:olrise .6s .1s both}
.olfs .t2{font:900 clamp(90px,18vw,200px)/1 Georgia,serif;background:linear-gradient(180deg,#fff,#7fd8ff 60%,#2a6bff);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 30px #4a8bff);animation:olslam .7s .35s cubic-bezier(.2,1.6,.4,1) both}
.olfs .t3{font:900 clamp(26px,5vw,52px) Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#fff;text-shadow:0 0 20px #7fd8ff;animation:olrise .6s .7s both}
.olfs .t4{margin-top:10px;font-size:16px;opacity:.85;animation:olrise .6s 1s both}
@keyframes olfade{from{opacity:0}}@keyframes olfadeo{to{opacity:0}}
@keyframes olrise{from{opacity:0;transform:translateY(30px)}}
@keyframes olslam{from{opacity:0;transform:scale(3) rotate(-8deg)}}
.olbigwin{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle,rgba(80,30,0,.35),rgba(10,0,20,.75));cursor:pointer;animation:olfade .35s both}
.olbigwin.out{animation:olfadeo .4s both}
.olbigwin .bt{font:900 clamp(40px,8vw,96px)/1 Georgia,serif;text-transform:uppercase;letter-spacing:.03em;background:linear-gradient(100deg,#ffe7a8 20%,#fff 40%,#ffe7a8 60%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 0 #5a2206) drop-shadow(0 0 26px rgba(255,190,60,.9));animation:olslam .7s cubic-bezier(.2,1.6,.4,1) both,olshine 1.6s linear infinite;text-align:center}
.olbigwin.t-mega .bt{filter:drop-shadow(0 6px 0 #5a0620) drop-shadow(0 0 30px #ff4d7a)}
.olbigwin.t-epic .bt{filter:drop-shadow(0 6px 0 #2a0660) drop-shadow(0 0 34px #b45cff)}
.olbigwin.t-legend .bt,.olbigwin.t-max .bt{filter:drop-shadow(0 6px 0 #06203a) drop-shadow(0 0 40px #7fd8ff)}
.olbigwin .ba{margin-top:14px;font:900 clamp(40px,7vw,84px)/1 system-ui,sans-serif;color:#fff;text-shadow:0 5px 0 #b8640e,0 0 30px rgba(255,200,60,.9)}
.olbigwin.landed .ba{animation:olpop .5s cubic-bezier(.2,2,.4,1)}
.olbigwin .bs{margin-top:10px;font-size:18px;opacity:.9}
.olbigwin .bk{margin-top:22px;font-size:13px;opacity:.6}
@keyframes olshine{from{background-position:100% 0}to{background-position:-100% 0}}
.olv.portrait .olzeus{height:118px;bottom:auto;top:4px;left:auto;right:112px}
.olv.portrait .ollogo{top:calc(var(--gy) - 40px)}
.olv.portrait .olside{left:12px;top:52px;width:auto;flex-direction:row}
.olv.portrait .olbuy{padding:8px 10px;font-size:12px}.olv.portrait .olbuy b{font-size:13px}
.olv.portrait .olfsbox{grid-template-columns:auto auto;align-items:center;gap:0 8px;padding:6px 10px}.olv.portrait .olfsbox b{font-size:20px}
.olv.portrait .olarrow{width:36px;height:70px;font-size:44px;top:auto;bottom:220px;transform:none}
@media (prefers-reduced-motion:reduce){.olbg,.olzeus{animation:none!important}}
`;
  document.head.appendChild(s);
}
