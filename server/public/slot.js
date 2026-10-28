// Félkarú rabló, 3D: a tisztáson álló gépre kattintva nyílik (index.html tölti be, csak ekkor).
// A pörgetést a szerver dönti el (slot-spin -> slot-result: reels[i] = [fent, közép, lent]); itt csak a látvány van:
// fa szekrény, rézveretek, égősor, kar, három tárcsa (közelről, csak a gép); a tárcsák a valódi eredményen állnak meg.
// Nyereménykor minden nyerő vonalnak saját animációja van (a modern gépek mintájára: várakozás az utolsó tárcsán,
// fokozatok szerinti ünneplés, felpörgő összeg, érmezápor). Bezáráskor minden felszabadul (WebGL, hang, figyelők).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SYMS = ['🍒', '🍋', '🍇', '🔔', '⭐', '🦝'];
const NAMES = { '🍒': 'cseresznye', '🍋': 'citrom', '🍇': 'szőlő', '🔔': 'harang', '⭐': 'csillag', '🦝': 'mosómedve' };
const CELLS = 10, STEP = Math.PI * 2 / CELLS;          // cellák egy tárcsán; egy cella szöge
const REEL_R = 0.2, REEL_Y = 0.92, REEL_Z = 0.19, REEL_X = [-0.2, 0, 0.2];
const VMAX = 19;                                        // a tárcsák csúcssebessége (rad/s)
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = (k, v) => { try { if (v !== undefined) localStorage.setItem(k, v); return localStorage.getItem(k); } catch { return null; } };

// nyerési fokozatok: a vonal jele és fajtája szerint, mindnek saját ünneplése
function tierOf(r) {
  if (!r || !r.mult) return null;
  if (r.kind === 'pair') return r.line.filter((s) => s === '🦝').length === 2 ? 'paws' : 'tiny';
  return { '🍒': 'cherry', '🍋': 'lemon', '🍇': 'grape', '🔔': 'bell', '⭐': 'star', '🦝': 'jackpot' }[r.line[0]];
}
const TIER = {
  tiny:    { title: '', coins: 8, count: 0.9 },
  paws:    { title: 'Mosómedve-pár!', coins: 16, count: 1.6 },
  cherry:  { title: 'Cseresznyeeső!', coins: 20, count: 1.8 },
  lemon:   { title: 'Citrombomba!', coins: 26, count: 2.2 },
  grape:   { title: 'Nagy nyeremény', coins: 40, count: 3.0 },
  bell:    { title: 'Mega nyeremény', coins: 60, count: 4.0 },
  star:    { title: 'Szuper nyeremény', coins: 80, count: 4.8 },
  jackpot: { title: 'JACKPOT', coins: 120, count: 6.0 },
};

let api = null, V = null;   // V: a megnyitott nézet minden állapota (bezáráskor null)

export function open(a) {
  api = a;
  if (V) return;
  build();
}

/* ---------------- a nézet felépítése ---------------- */
function build() {
  injectCss();
  const night = api.night();
  const el = document.createElement('div'); el.className = 'slv' + (night ? ' night' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Félkarú rabló');
  el.innerHTML = `
    <div class="slbg"></div>
    <canvas class="sl3d"></canvas><canvas class="slfx"></canvas>
    <div class="slwin" aria-live="polite"></div>
    <button type="button" class="slx" aria-label="Vissza a tisztásra">✕</button>
    <button type="button" class="slmute" aria-label="Hang ki/be"></button>
    <div class="slpanel">
      <div class="slrow"><span class="slpot">Közös pot <b></b></span><span class="slmsg"></span></div>
      <div class="slrow">
        <div class="slbets" role="group" aria-label="Tét"></div>
        <button type="button" class="slgo">Pörgetés</button>
      </div>
      <details class="slpay"><summary>Kifizetések és az utolsó pörgetések</summary><div class="slpt"></div><ol class="slrec"></ol></details>
    </div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  const q = (s) => el.querySelector(s);
  V = {
    el, night, q, cv: q('.sl3d'), fx: q('.slfx'), fxc: q('.slfx').getContext('2d'), win: q('.slwin'),
    bet: +(store('slotBet') || 100), mute: store('slotMute') === '1',
    spinning: false, result: null, pending: false, potShown: null, parts: [], coins: [], effects: [],
    t: 0, last: performance.now(), raf: 0, shake: 0, orbit: 0, dim: 0, bulbMode: 'idle', bulbT: 0,
    mouse: { x: 0, y: 0 }, intro: 0, celebrating: null,
  };
  V.audio = makeAudio();
  build3d();
  bindUi();
  renderPanel();
  resize();
  V.ro = new ResizeObserver(resize); V.ro.observe(el);
  V.onVis = () => { if (document.visibilityState === 'visible') { V.last = performance.now(); loop(); } };
  document.addEventListener('visibilitychange', V.onVis);
  requestAnimationFrame(() => el.classList.add('in'));
  loop();
  setTimeout(() => q('.slgo').focus({ preventScroll: true }), 400);
}

function close() {
  if (!V) return;
  const v = V; V = null;
  cancelAnimationFrame(v.raf);
  v.ro.disconnect();
  document.removeEventListener('visibilitychange', v.onVis);
  removeEventListener('keydown', v.onKey);
  v.el.classList.remove('in');
  v.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { for (const k in x) if (x[k] && x[k].isTexture) x[k].dispose(); x.dispose(); }); });
  v.reels.forEach((r) => { r.sharp.dispose(); r.blur.dispose(); });
  v.env.dispose();
  v.renderer.dispose(); v.renderer.forceContextLoss();
  if (v.audio.ctx) v.audio.ctx.close();
  setTimeout(() => v.el.remove(), 260);
  document.body.style.overflow = '';
}

/* ---------------- 3D: a gép ---------------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function woodTex(base, dark) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let p = 0; p < 8; p++) {                        // függőleges deszkák, mindegyik kicsit más árnyalat
      g.fillStyle = `rgba(${p % 2 ? '255,220,170' : '60,25,8'},${0.04 + Math.random() * 0.06})`; g.fillRect(p * 64, 0, 64, h);
      for (let i = 0; i < 14; i++) {                     // erezet
        g.strokeStyle = `rgba(50,20,5,${0.12 + Math.random() * 0.18})`; g.lineWidth = 1 + Math.random() * 1.6;
        g.beginPath(); const x0 = p * 64 + 4 + Math.random() * 56, a = 2 + Math.random() * 5, f = 0.004 + Math.random() * 0.01, ph = Math.random() * 6;
        for (let y = 0; y <= h; y += 8) g.lineTo(x0 + Math.sin(y * f + ph) * a, y);
        g.stroke();
      }
      if (Math.random() < 0.5) { g.fillStyle = 'rgba(55,22,6,.35)'; g.beginPath(); g.ellipse(p * 64 + 32, Math.random() * h, 5, 9, 0, 0, 7); g.fill(); }
      g.fillStyle = dark; g.fillRect(p * 64, 0, 3, h);   // deszkák közti rés
    }
  });
}
function emojiCanvas(s, px) {
  const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d');
  g.font = `${Math.round(px * 0.8)}px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, px / 2, px / 2 + px * 0.06);
  return c;
}
const EMO = {};
const emo = (s, px = 128) => EMO[s + px] || (EMO[s + px] = emojiCanvas(s, px));

// egy tárcsa szalagja: a vászon vízszintes tengelye a tárcsa kerülete (a képernyőn lefelé halad), a függőleges a tárcsa tengelye
function drawStrip(g, cells, blur) {
  const C = 192, W = C * CELLS, H = C;
  g.clearRect(0, 0, W, H);
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#e9dcc0'); grd.addColorStop(0.5, '#fff8e8'); grd.addColorStop(1, '#e9dcc0');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.filter = blur ? 'blur(9px)' : 'none';
  cells.forEach((s, k) => {
    g.save(); g.translate(k * C + C / 2, H / 2); g.rotate(-Math.PI / 2);   // a jel így áll egyenesen a képernyőn
    g.drawImage(emo(s, 160), -78, -78, 156, 156); g.restore();
    g.fillStyle = 'rgba(120,80,40,.18)'; g.fillRect(k * C, 0, 2, H);
  });
  g.filter = 'none';
}
function makeReel(i, wood) {
  const cells = Array.from({ length: CELLS }, (_, k) => SYMS[(k * 7 + i * 3) % SYMS.length]);
  const mk = (blur) => { const c = document.createElement('canvas'); c.width = 192 * CELLS; c.height = 192; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { c, t, blur }; };
  const sharp = mk(false), blur = mk(true);
  const geo = new THREE.CylinderGeometry(REEL_R, REEL_R, 0.17, 60, 1, true);
  geo.rotateZ(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: sharp.t, roughness: 0.55 });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(REEL_X[i], REEL_Y, REEL_Z);
  const caps = new THREE.Mesh(new THREE.CylinderGeometry(REEL_R * 0.98, REEL_R * 0.98, 0.172, 40).rotateZ(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a1a10 }));
  caps.scale.set(1, 0.97, 0.97); mesh.add(caps);
  const R = { i, cells, sharp: sharp.t, blur: blur.t, sc: sharp, bc: blur, mesh, mat, phi: -(0 * STEP + STEP / 2), v: 0, state: 'idle', k: 0, isBlur: false };
  paintReel(R);
  return R;
}
function paintReel(R) {
  drawStrip(R.sc.c.getContext('2d'), R.cells, false); R.sharp.needsUpdate = true;
  drawStrip(R.bc.c.getContext('2d'), R.cells, true); R.blur.needsUpdate = true;
}

function build3d() {
  const renderer = new THREE.WebGLRenderer({ canvas: V.cv, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  scene.environment = env; scene.environmentIntensity = V.night ? 0.35 : 0.6;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 50);
  Object.assign(V, { renderer, scene, camera, env });

  // fények: naplemente balról (este hideg hold és meleg tábortűz), lágy derítés
  const hemi = new THREE.HemisphereLight(V.night ? 0x8090c8 : 0xffe2bf, V.night ? 0x141020 : 0x5a3a20, V.night ? 0.55 : 1.0); scene.add(hemi);
  const key = new THREE.DirectionalLight(V.night ? 0x9fb4ff : 0xffb070, V.night ? 1.2 : 2.6); key.position.set(-3, 4, 3.2);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1, near: 0.5, far: 12 }); key.shadow.bias = -0.0004; key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(V.night ? 0x5070ff : 0xffd9a0, V.night ? 0.8 : 1.1); rim.position.set(3, 2.5, -3); scene.add(rim);
  const fire = new THREE.PointLight(0xff8a3a, V.night ? 2.2 : 0, 6, 1.6); fire.position.set(-1.6, 0.6, 1.8); scene.add(fire);
  const glow = new THREE.PointLight(0xffc860, 0.6, 2.2, 2); glow.position.set(0, 1.5, 0.55); scene.add(glow);
  Object.assign(V, { hemi, key, fire, glow });

  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: V.night ? 0.5 : 0.32 }));
  ground.receiveShadow = true; scene.add(ground);
  const dirtT = canvasTex(256, 256, (g) => { const r = g.createRadialGradient(128, 128, 10, 128, 128, 128); r.addColorStop(0, V.night ? 'rgba(52,50,72,.9)' : 'rgba(190,124,64,.9)'); r.addColorStop(0.6, V.night ? 'rgba(52,50,72,.5)' : 'rgba(190,124,64,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); });
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: dirtT, roughness: 1, transparent: true, depthWrite: false }));
  dirt.position.y = 0.001; dirt.receiveShadow = true; scene.add(dirt);

  const M = new THREE.Group(); scene.add(M); V.machine = M;
  const wood = new THREE.MeshStandardMaterial({ map: woodTex('#9a5a2b', '#4a2410'), roughness: 0.68, metalness: 0 });
  const woodDark = new THREE.MeshStandardMaterial({ map: woodTex('#6e3b1a', '#2c1206'), roughness: 0.75 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd2a04a, metalness: 0.9, roughness: 0.28 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 1, roughness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c120b, roughness: 0.8 });
  const add = (geo, mat, x, y, z, parent = M) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, r = 0, parent) => add(r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);

  box(0.9, 1.3, 0.62, wood, 0, 0.65, 0, 0.03);                 // szekrény
  box(1.0, 0.1, 0.72, woodDark, 0, 0.05, 0.01, 0.02);           // talapzat
  box(0.96, 0.05, 0.68, brass, 0, 1.31, 0, 0.015);              // rézpánt a tetején
  box(0.95, 0.04, 0.67, brass, 0, 0.62, 0, 0.012);              // rézpánt középen
  box(0.86, 0.1, 0.12, woodDark, 0, 0.67, 0.34, 0.02);          // párkány az ablak alatt
  // a felső ív, elején a felirattal és az égőkkel
  const arch = add(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 40, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), wood, 0, 1.33, -0.02);
  arch.castShadow = true;
  const sign = canvasTex(1024, 1024, (g, w) => {
    const r = g.createRadialGradient(w / 2, 512, 40, w / 2, 512, 500); r.addColorStop(0, '#8a2a14'); r.addColorStop(1, '#3c0e06');
    g.fillStyle = r; g.fillRect(0, 0, w, 512);
    g.textAlign = 'center'; g.lineJoin = 'round';
    const txt = (s, y, px) => { g.font = `900 ${px}px Georgia,"Times New Roman",serif`; g.lineWidth = 22; g.strokeStyle = '#3a1606'; g.strokeText(s, w / 2, y); g.fillStyle = '#ffe7a8'; g.fillText(s, w / 2, y); };
    txt('LUCKY', 300, 190); txt('SPIN', 470, 170);
    g.fillStyle = '#ffd36a'; [[250, 200], [774, 200]].forEach(([x, y]) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? 18 : 42; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); });
  });
  const signM = new THREE.MeshStandardMaterial({ map: sign, roughness: 0.5, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.25 });
  add(new THREE.CircleGeometry(0.4, 40, 0, Math.PI), signM, 0, 1.33, 0.232);
  add(new THREE.TorusGeometry(0.43, 0.022, 10, 48, Math.PI), brass, 0, 1.33, 0.232);
  V.signM = signM;
  V.bulbs = [];
  const bulbG = new THREE.SphereGeometry(0.019, 12, 10);
  for (let i = 0; i < 17; i++) {
    const a = Math.PI * (i + 0.5) / 17, m = new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffc04a, emissiveIntensity: 1, roughness: 0.3 });
    const b = add(bulbG, m, Math.cos(a) * 0.43, 1.33 + Math.sin(a) * 0.43, 0.25); b.castShadow = false; V.bulbs.push(b);
  }
  for (let i = 0; i < 9; i++) {                                 // égősor a rézpánton
    const m = new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffc04a, emissiveIntensity: 1, roughness: 0.3 });
    const b = add(bulbG, m, -0.4 + i * 0.1, 1.31, 0.345); b.castShadow = false; V.bulbs.push(b);
  }

  // tárcsák és az ablak (a tárcsák eleje kilóg a szekrény elé: annyi látszik belőlük, mint egy ablakban)
  V.reels = [0, 1, 2].map((i) => { const R = makeReel(i, wood); M.add(R.mesh); return R; });
  const fz = 0.36;
  box(0.7, 0.045, 0.1, brass, 0, REEL_Y + 0.19, fz, 0.012); box(0.7, 0.045, 0.1, brass, 0, REEL_Y - 0.19, fz, 0.012);
  box(0.045, 0.42, 0.1, brass, -0.33, REEL_Y, fz, 0.012); box(0.045, 0.42, 0.1, brass, 0.33, REEL_Y, fz, 0.012);
  box(0.016, 0.34, 0.09, dark, -0.1, REEL_Y, 0.35); box(0.016, 0.34, 0.09, dark, 0.1, REEL_Y, 0.35);
  // árnyék a tárcsák alján és tetején (mélységérzet)
  const shadeT = canvasTex(4, 256, (g, w, h) => { const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, 'rgba(0,0,0,.75)'); l.addColorStop(0.3, 'rgba(0,0,0,0)'); l.addColorStop(0.7, 'rgba(0,0,0,0)'); l.addColorStop(1, 'rgba(0,0,0,.75)'); g.fillStyle = l; g.fillRect(0, 0, w, h); });
  add(new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshBasicMaterial({ map: shadeT, transparent: true, depthWrite: false }), 0, REEL_Y, 0.4).castShadow = false;
  const glass = add(new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false }), 0, REEL_Y, 0.408);
  glass.castShadow = false;
  V.payM = new THREE.MeshStandardMaterial({ color: 0xff3a2a, emissive: 0xff2a10, emissiveIntensity: 0.3, transparent: true, opacity: 0.55 });
  add(new THREE.BoxGeometry(0.64, 0.006, 0.003), V.payM, 0, REEL_Y, 0.404).castShadow = false;

  // kifizetési tábla a párkány alatt
  const pay = canvasTex(1024, 380, (g, w, h) => {
    g.fillStyle = '#2b140a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d2a04a'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
    g.textBaseline = 'middle'; g.font = `bold 44px Georgia,serif`; g.fillStyle = '#ffe7a8';
    const rows = [['🦝🦝🦝', 250], ['⭐⭐⭐', 60], ['🔔🔔🔔', 30], ['🍇🍇🍇', 15], ['🍋🍋🍋', 10], ['🍒🍒🍒', 6], ['🦝🦝', 5], ['🍒🍒', 2]];
    rows.forEach(([s, m], i) => {
      const col = i < 4 ? 0 : 1, row = i % 4, x = 60 + col * 490, y = 70 + row * 80;
      [...s].filter((c) => c.trim()).reduce((a, c) => a.concat(c.length > 1 ? [c] : []), []);
      Array.from(s.matchAll(/\p{Extended_Pictographic}/gu)).forEach((mm, j) => g.drawImage(emo(mm[0], 64), x + j * 54, y - 27, 54, 54));
      g.fillText(`${m}×`, x + 200, y);
    });
  });
  add(new THREE.PlaneGeometry(0.72, 0.267), new THREE.MeshStandardMaterial({ map: pay, roughness: 0.6, emissive: 0xffffff, emissiveMap: pay, emissiveIntensity: 0.12 }), 0, 0.44, 0.312);
  // érmekiadó nyílás és tálca
  box(0.24, 0.07, 0.02, dark, 0, 0.27, 0.315);
  box(0.52, 0.02, 0.22, brass, 0, 0.14, 0.42, 0.006);
  box(0.52, 0.08, 0.02, brass, 0, 0.17, 0.53, 0.006);
  box(0.02, 0.08, 0.22, brass, -0.25, 0.17, 0.42, 0.006); box(0.02, 0.08, 0.22, brass, 0.25, 0.17, 0.42, 0.006);

  // a kar a jobb oldalon: a gömbjét lehúzva (vagy rákattintva) indul a pörgetés
  box(0.04, 0.24, 0.18, brass, 0.47, 0.86, 0.05, 0.012);
  const lever = new THREE.Group(); lever.position.set(0.52, 0.86, 0.05); M.add(lever);
  add(new THREE.CylinderGeometry(0.065, 0.065, 0.08, 24).rotateZ(Math.PI / 2), brass, 0, 0, 0, lever);
  const arm = add(new THREE.CylinderGeometry(0.022, 0.028, 0.56, 16), chrome, 0.03, 0.28, 0, lever);
  const ball = add(new THREE.SphereGeometry(0.075, 24, 18), new THREE.MeshPhysicalMaterial({ color: 0xd61a1a, roughness: 0.18, clearcoat: 1 }), 0.03, 0.59, 0, lever);
  V.lever = lever; V.leverHit = [arm, ball]; V.leverA = 0; V.leverV = 0; V.leverPull = 0;

  // érmék (közös alak és anyag)
  V.coinG = new THREE.CylinderGeometry(0.032, 0.032, 0.007, 22);
  V.coinM = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 1, roughness: 0.22, emissive: 0x402800 });
}

/* ---------------- kezelőfelület ---------------- */
function bindUi() {
  const { q } = V;
  q('.slx').onclick = close;
  q('.slgo').onclick = () => go();
  q('.slmute').onclick = () => { V.mute = !V.mute; store('slotMute', V.mute ? '1' : '0'); renderPanel(); };
  q('.slbets').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b || b.disabled) return; V.bet = +b.dataset.v; store('slotBet', V.bet); renderPanel(); };
  V.win.onclick = () => skipCelebration();
  V.onKey = (e) => {
    if (!V) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === ' ' || e.key === 'Enter') { if (e.target && e.target.closest && e.target.closest('summary,.slbets,.slx,.slmute')) return; e.preventDefault(); go(); }
    const n = +e.key; const bets = betsOf(); if (n >= 1 && n <= bets.length) { V.bet = bets[n - 1]; store('slotBet', V.bet); renderPanel(); }
  };
  addEventListener('keydown', V.onKey, true);
  // a kar: rámutatva kéz, lehúzva vagy kattintva pörget; a gép finoman követi az egeret
  const ray = new THREE.Raycaster(), p = new THREE.Vector2();
  const hitLever = (e) => { const r = V.cv.getBoundingClientRect(); p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(p, V.camera); return ray.intersectObjects(V.leverHit, false).length > 0; };
  let drag = null;
  V.cv.addEventListener('pointermove', (e) => {
    const r = V.cv.getBoundingClientRect(); V.mouse.x = (e.clientX - r.left) / r.width - 0.5; V.mouse.y = (e.clientY - r.top) / r.height - 0.5;
    if (drag) { V.leverPull = Math.max(0, Math.min(1, (e.clientY - drag) / 140)); return; }
    V.cv.style.cursor = hitLever(e) ? 'grab' : '';
  });
  V.cv.addEventListener('pointerdown', (e) => { if (hitLever(e)) { drag = e.clientY; V.cv.setPointerCapture(e.pointerId); V.cv.style.cursor = 'grabbing'; e.preventDefault(); } else if (V.celebrating) skipCelebration(); });
  const up = () => { if (drag === null) return; const pulled = V.leverPull; drag = null; V.leverPull = 0; V.cv.style.cursor = ''; go(pulled > 0.55 ? 'drag' : 'click'); };
  V.cv.addEventListener('pointerup', up); V.cv.addEventListener('pointercancel', () => { drag = null; V.leverPull = 0; });
}
const betsOf = () => (api.state() && api.state().slot && api.state().slot.bets) || [100, 500, 1000, 5000];
const pot = () => (api.state() ? api.state().pot : 0);

function renderPanel() {
  if (!V) return;
  const { q } = V, bets = betsOf();
  if (V.potShown === null || !V.spinning) V.potShown = pot();
  q('.slpot b').textContent = api.fmt(V.potShown);
  if (!bets.includes(V.bet)) V.bet = bets[0];
  q('.slbets').innerHTML = bets.map((v, i) => `<button type="button" data-v="${v}" class="${v === V.bet ? 'on' : ''}" ${V.spinning || pot() < v ? 'disabled' : ''} title="${i + 1}">${v >= 1000 ? v / 1000 + 'k' : v}</button>`).join('');
  const g = q('.slgo'); g.textContent = V.spinning ? (V.result ? 'Megállít' : 'Pörög…') : `Pörgetés · ${api.fmt(V.bet)}`; g.disabled = !V.spinning && pot() < V.bet;
  q('.slmute').textContent = V.mute ? '🔇' : '🔊';
  const st = api.state(), sl = st && st.slot;
  if (sl && !q('.slpt').dataset.ok) {
    q('.slpt').dataset.ok = 1;
    q('.slpt').innerHTML = sl.symbols.slice().reverse().map((x) => `<span>${x.s}${x.s}${x.s} <b>${x.three}×</b></span>`).join('') + Object.entries(sl.pairs).map(([s, m]) => `<span>${s}${s} bárhol <b>${m}×</b></span>`).join('');
  }
  if (sl && !V.spinning) q('.slrec').innerHTML = (sl.recent || []).slice(0, 6).map((r) => `<li><span>${api.esc(r.nick)}</span><span>${r.line.join('')}</span><span class="${r.mult ? 'w' : ''}">${r.mult ? '+' + api.fmt(r.back) : '–'}</span></li>`).join('') || '<li>Még senki nem pörgetett.</li>';
}

// az index.html továbbítja a szerver üzeneteit
window.SlotHook = (m) => {
  if (!V) return;
  if (m.t === 'state') renderPanel();
  else if (m.t === 'slot-result' && V.pending) { V.pending = false; V.result = m; landPlan(); renderPanel(); }
  else if (m.t === 'err' && V.pending) { V.pending = false; V.result = { error: m.msg }; msg(m.msg); landPlan(); }
};
function msg(t) { if (V) V.q('.slmsg').textContent = t || ''; }

/* ---------------- pörgetés ---------------- */
function go(how) {
  if (!V) return;
  V.audio.unlock();
  if (V.celebrating) { skipCelebration(); return; }
  if (V.spinning) { if (V.result) slam(); return; }
  if (pot() < V.bet) { msg('Nincs elég mosómedve a közös potban.'); return; }
  msg('');
  V.spinning = true; V.result = null; V.pending = true; V.potShown = pot(); V.near = false;
  if (how !== 'drag') V.leverV = 9;   // a kar magától lerántódik
  V.audio.lever();
  const now = V.t;
  V.reels.forEach((R, i) => { R.state = 'wind'; R.t0 = now + i * 0.07; R.stopAt = now + 1.05 + i * 0.42; R.v = 0; });
  V.bulbMode = 'spin';
  api.send({ t: 'slot-spin', amount: V.bet });
  renderPanel();
  setTimeout(() => { if (V && V.pending) { V.pending = false; V.result = { error: 'Nem jött válasz a géptől.' }; msg('Nem jött válasz a géptől. Próbáld újra!'); landPlan(); } }, 6000);
}
// az eredmény megjött: a tárcsák hátsó, nem látszó celláira kerül a kijött három jel, és kiszámoljuk, hol álljanak meg
function landPlan() {
  const r = V.result;
  V.reels.forEach((R, i) => {
    let k;
    // az a cella kerül középre, amelyik most épp a tárcsa túloldalán van (így az átfestés nem látszik)
    const front = ((-R.phi) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    k = Math.round((front + Math.PI) / STEP - 0.5) % CELLS; k = (k + CELLS) % CELLS;
    if (r && r.reels) { R.cells[(k + CELLS - 1) % CELLS] = r.reels[i][0]; R.cells[k] = r.reels[i][1]; R.cells[(k + 1) % CELLS] = r.reels[i][2]; paintReel(R); }
    R.k = k;
  });
  if (r && r.reels) {
    const m = r.reels.map((x) => x[1]);
    V.near = m[0] === m[1] && !(r.kind === 'pair' && m[2] !== m[0]) ? true : m[0] === m[1];   // két egyforma: az utolsó tárcsa váratlanul lassan áll meg
    if (V.near) V.reels[2].stopAt += 1.25;
  }
}
function slam() { V.reels.forEach((R, i) => { if (R.state === 'spin' || R.state === 'wind') R.stopAt = Math.min(R.stopAt, V.t + 0.05 + i * 0.12); }); }

const TAU = Math.PI * 2;
function updateReels(dt) {
  let anyMoving = false;
  V.reels.forEach((R, i) => {
    if (R.state === 'idle') return;
    anyMoving = true;
    const t = V.t;
    if (R.state === 'wind') {                            // kis visszahúzás, aztán gyorsulás
      if (t < R.t0) return;
      const u = t - R.t0;
      if (u < 0.12) { R.v = -2.2; } else { R.state = 'spin'; R.v = 0; }
    }
    if (R.state === 'spin') {
      const slow = V.near && i === 2 && V.result && V.reels[1].state === 'idle';
      const target = slow ? VMAX * 0.42 : VMAX;
      R.v += (target - R.v) * Math.min(1, dt * (slow ? 3 : 7));
      if (t >= R.stopAt && V.result && (i === 0 || V.reels[i - 1].state === 'idle' || V.reels[i - 1].state === 'bounce')) {
        // a célszög: a k. cella középen; legalább másfél fordulat még (lassulás a mostani sebességből)
        const want = -(R.k * STEP + STEP / 2);
        const minTravel = Math.max(2.2, R.v * 0.38);
        let end = want + Math.ceil((R.phi + minTravel - want) / TAU) * TAU;
        R.from = R.phi; R.to = end; R.dur = 3 * (end - R.phi) / Math.max(4, R.v); R.dur = Math.min(Math.max(R.dur, 0.35), 1.6); R.ts = t;
        if (!V.result.reels) { R.to = R.phi + 1.2; R.dur = 0.6; }
        R.state = 'stop';
      }
    }
    if (R.state === 'stop') {
      const u = Math.min(1, (t - R.ts) / R.dur), e = 1 - Math.pow(1 - u, 3);
      const prev = R.phi; R.phi = R.from + (R.to - R.from) * e; R.v = (R.phi - prev) / Math.max(dt, 1e-4);
      if (u >= 1) { R.state = 'bounce'; R.bt = t; R.base = R.phi; V.audio.thunk(i); if (i === 1 && V.near) V.audio.tease(); }
    } else if (R.state === 'bounce') {                   // megállás után kis rugózás (a „kattanás”)
      const u = t - R.bt; R.phi = R.base + Math.sin(u * 30) * Math.exp(-u * 12) * 0.07; R.v = 0;
      if (u > 0.4) { R.phi = R.base; R.state = 'idle'; }
    } else {
      R.phi += R.v * dt;
    }
    R.mesh.rotation.x = R.phi;
    const blur = Math.abs(R.v) > 7;
    if (blur !== R.isBlur) { R.isBlur = blur; R.mat.map = blur ? R.blur : R.sharp; R.mat.needsUpdate = true; }
    if (Math.abs(R.v) > 3) { R.tick = (R.tick || 0) + Math.abs(R.v) * dt; if (R.tick > STEP) { R.tick = 0; if (i === 0) V.audio.tick(); } }
  });
  if (V.spinning && V.result && V.reels.every((R) => R.state === 'idle')) finishSpin();
  return anyMoving;
}
function finishSpin() {
  V.spinning = false;
  const r = V.result;
  V.bulbMode = 'idle';
  renderPanel();
  if (!r || r.error) return;
  const tier = tierOf(r);
  if (!tier) { V.audio.dud(); if (V.near) bannerSmall('Majdnem!'); return; }
  celebrate(tier, r);
}

/* ---------------- nyerési animációk ---------------- */
// a nyerő cellák helye a képernyőn (a vonal három jele; párnál csak a két egyforma)
function cellScreen(i) {
  const v = new THREE.Vector3(REEL_X[i], REEL_Y, REEL_Z + REEL_R).applyMatrix4(V.machine.matrixWorld).project(V.camera);
  const w = V.fx.clientWidth, h = V.fx.clientHeight;
  const v2 = new THREE.Vector3(REEL_X[i], REEL_Y + 0.11, REEL_Z + REEL_R).applyMatrix4(V.machine.matrixWorld).project(V.camera);
  return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, s: Math.abs(v.y - v2.y) / 2 * h };
}
function worldScreen(x, y, z) { const v = new THREE.Vector3(x, y, z).applyMatrix4(V.machine.matrixWorld).project(V.camera); return { x: (v.x + 1) / 2 * V.fx.clientWidth, y: (1 - v.y) / 2 * V.fx.clientHeight }; }

// a nagy nyereményeknél előbb egy kis jelenet fut (ennyi mp), a felirat és a felpörgő összeg a jelenet csúcspontján jön
const INTRO = { grape: 1.5, bell: 1.7, star: 1.9, jackpot: 2.8 };
function celebrate(tier, r) {
  const T = TIER[tier], intro = INTRO[tier] || 0;
  const cel = V.celebrating = { tier, r, t0: V.t + intro, intro, dur: T.count + (tier === 'tiny' ? 0.6 : 1.6), shown: 0, done: false, revealed: false };
  cel.cells = r.kind === 'three' ? [0, 1, 2] : r.line.map((s, i) => (r.line.filter((x) => x === s).length === 2 ? i : -1)).filter((i) => i >= 0);
  V.bulbMode = tier === 'jackpot' ? 'rainbow' : ['bell', 'star', 'grape'].includes(tier) ? 'chase' : 'blink';
  if (intro) { V.sc2 = { tier, t0: V.t, st: {} }; V.audio.intro(tier); if (tier === 'jackpot') V.dim = 1; }
  else reveal(cel);
}
// a csúcspont: felirat (minden fokozatnak saját mozgása, CSS), összeg, érmék, a fokozat saját effektjei
function reveal(cel) {
  if (cel.revealed) return;
  cel.revealed = true;
  const { tier, r } = cel, T = TIER[tier], net = r.back - r.stake;
  const big = !['tiny', 'paws', 'cherry', 'lemon'].includes(tier);
  const title = tier === 'jackpot' ? [...T.title].map((c, i) => `<i style="--d:${i * 0.09}s">${c}</i>`).join('') : T.title;
  V.win.className = `slwin show t-${tier}${big ? ' big' : ''}`;
  V.win.innerHTML = `${T.title ? `<div class="wt">${title}</div>` : ''}<div class="wa">+<span>0</span></div><div class="ws">${r.line.join(' ')} · ${r.mult}× · nettó ${net >= 0 ? '+' : ''}${api.fmt(net)}</div>`;
  cel.amountEl = V.win.querySelector('.wa span');
  V.audio.win(tier);
  spawnCoins(T.coins, ['bell', 'star', 'jackpot'].includes(tier));
  const c = cellScreen(1);
  const E = {
    tiny: () => { for (const i of cel.cells) burst(cellScreen(i), 14, 'spark', '#ffe28a'); },
    paws: () => { pawTrail(); V.shake = 0.15; for (const i of cel.cells) burst(cellScreen(i), 18, 'spark', '#ffd0a0'); },
    cherry: () => { rain('🍒', 46, 2.2); },
    lemon: () => { flash('#fff07a', 0.5); burstEmoji(c, '🍋', 26, 900); burst(c, 70, 'drop', '#ffe23a'); V.shake = 0.25; },
    grape: () => { bubbles('🍇', 30); rays(c, '#c58cff', T.count + 1); },
    bell: () => { flash('#fff4d0', 0.35); V.shake = 1.0; ringWaves(worldScreen(0, 1.55, 0.25), 6, '#ffd36a'); coinRain(60); },
    star: () => { flash('#ffffff', 0.45); V.shake = 0.7; burstEmoji(c, '⭐', 30, 1000); rays(c, '#ffe9a0', T.count + 1.6); fireworks(7, 4.5); V.orbit = 1; },
    jackpot: () => { flash('#fff0b0', 0.4); rays(c, 'rainbow', T.count + 2); confetti(240); coinBurst(V.sc2 ? V.sc2.st.bag || c : c, 70); coinRain(120); fireworks(12, 6); V.orbit = 1.6; V.shake = 0.8; },
  };
  E[tier]();
  if (net > 0 && tier !== 'tiny') V.audio.countStart(T.count);
}
function skipCelebration() {
  const c = V && V.celebrating; if (!c) return;
  if (!c.revealed) { c.t0 = V.t; if (V.sc2) V.sc2.t0 = V.t - c.intro; reveal(c); return; }   // első katt: a jelenet a csúcspontra ugrik
  if (!c.done && V.t - c.t0 < c.dur - 0.4) { c.t0 = V.t - TIER[c.tier].count; return; }   // aztán az összeg a végére
  endCelebration();
}
function endCelebration() {
  if (!V || !V.celebrating) return;
  V.celebrating = null; V.dim = 0; V.bulbMode = 'idle';
  if (V.sc2) V.sc2.end = V.t;   // a jelenet elhalványul
  V.win.classList.add('out'); setTimeout(() => { if (V && !V.celebrating) { V.win.className = 'slwin'; V.win.innerHTML = ''; } }, 400);
  V.audio.countStop();
  renderPanel();
}
function updateCelebration() {
  const c = V.celebrating; if (!c) return;
  if (!c.revealed) { if (V.t >= c.t0) reveal(c); else return; }
  const T = TIER[c.tier], u = Math.min(1, (V.t - c.t0) / T.count), e = 1 - Math.pow(1 - u, 2.4);
  const val = Math.round(c.r.back * e);
  if (val !== c.shown) { c.shown = val; c.amountEl.textContent = api.fmt(val); }
  if (u >= 1 && !c.done) { c.done = true; V.win.classList.add('landed'); V.audio.countStop(); V.audio.land(c.tier); V.potShown = pot(); renderPanel(); }
  if (V.t - c.t0 > c.dur + (c.tier === 'jackpot' ? 2.5 : c.tier === 'tiny' ? 0 : 1)) endCelebration();
}

/* --- a nagy nyeremények kis jelenetei (a 2D rétegen, a részecskék alatt) --- */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeBack = (x) => { x = clamp01(x); const c1 = 1.9; return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function emoAt(g, s, x, y, size, rot = 0, a = 1) { g.save(); g.globalAlpha *= a; g.translate(x, y); g.rotate(rot); g.drawImage(emo(s, 128), -size / 2, -size / 2, size, size); g.restore(); }
function drawScene(g, W, H) {
  const S = V.sc2; if (!S) return;
  const t = V.t - S.t0, k = Math.min(W, H) / 800, st = S.st, intro = INTRO[S.tier];
  const fade = S.end ? 1 - clamp01((V.t - S.end) / 0.6) : 1;
  if (fade <= 0) { V.sc2 = null; return; }
  g.save(); g.globalAlpha = fade;
  const c = cellScreen(1);
  if (S.tier === 'grape') {
    // Szüret: két szőlőinda nő be a sarkokból fürtökkel, középen egy hordó, a mosómedve beleugrik és tapossa
    const p = easeOut(t / 1.2);
    for (const side of [-1, 1]) {
      const P0 = [side < 0 ? 0 : W, H], P1 = [side < 0 ? W * 0.12 : W * 0.88, H * 0.35], P2 = [side < 0 ? W * 0.36 : W * 0.64, H * 0.08];
      const at = (u) => [(1 - u) ** 2 * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0], (1 - u) ** 2 * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1]];
      g.strokeStyle = '#4f6b22'; g.lineWidth = 12 * k; g.lineCap = 'round'; g.beginPath();
      for (let u = 0; u <= p; u += 0.02) { const q = at(u); u ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); } g.stroke();
      for (let i = 1; i <= 8; i++) { const u = i / 9; if (u > p) break; const q = at(u), pop = easeBack((p - u) * 6); emoAt(g, i % 3 ? '🍃' : '🍇', q[0] + side * (i % 2 ? 18 : -14) * k, q[1] + (i % 3 ? -6 : 34) * k, (i % 3 ? 44 : 78) * k * pop, side * 0.3 + Math.sin(V.t * 2 + i) * 0.08); }
    }
    const bx = W / 2, by = H * 0.6 + (1 - easeBack((t - 0.4) / 0.6)) * H * 0.4, bw = 170 * k, bh = 150 * k;
    // a mosómedve: leesik a hordóba, aztán tapos (fel-le)
    let ry;
    if (t < 0.9) ry = -200; else if (t < 1.4) ry = -200 + (by - 40 * k + 200) * Math.pow((t - 0.9) / 0.5, 2); else ry = by - 40 * k - Math.abs(Math.sin((t - 1.4) * 9)) * 28 * k;
    if (t >= 1.4 && !st.splash) { st.splash = 1; burst({ x: bx, y: by - bh / 2 }, 60, 'drop', '#9b3cff'); V.audio.splash(); }
    if (t > 1.4 && Math.floor(t * 2) !== st.drip) { st.drip = Math.floor(t * 2); burst({ x: bx + rnd(-40, 40) * k, y: by - bh / 2 }, 8, 'drop', '#b25cff'); }
    g.save(); g.beginPath(); g.rect(0, 0, W, by - bh * 0.32); g.clip(); emoAt(g, '🦝', bx, ry, 120 * k, Math.sin(t * 9) * 0.1); g.restore();
    g.fillStyle = '#7a4520'; g.strokeStyle = '#3a1c08'; g.lineWidth = 4 * k;
    g.beginPath(); g.ellipse(bx, by, bw / 2, bh / 2, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#4a2410'; g.beginPath(); g.ellipse(bx, by - bh * 0.42, bw * 0.42, bh * 0.1, 0, 0, TAU); g.fill();
    g.fillStyle = '#7a2fb8'; g.beginPath(); g.ellipse(bx, by - bh * 0.42, bw * 0.36, bh * 0.07, 0, 0, TAU); g.fill();
    g.strokeStyle = '#c9973f'; g.lineWidth = 7 * k; for (const f of [-0.22, 0.22]) { g.beginPath(); g.ellipse(bx, by + f * bh, bw * 0.49, bh * 0.08, 0, 0, Math.PI); g.stroke(); }
  } else if (S.tier === 'bell') {
    // Harangszó: egy óriási harang ereszkedik le kötélen, minden kilengésnél kongat és érmét szór, a csúcson nagy BONG
    g.fillStyle = `rgba(20,8,0,${0.35 * clamp01(t / 0.4)})`; g.fillRect(0, 0, W, H);
    const L = H * 0.32 * easeBack(t / 0.5), amp = t < intro ? 0.55 : 0.22, ang = amp * Math.sin(t * 7.85);
    const px = W / 2, bx = px + Math.sin(ang) * L, by = Math.cos(ang) * L;
    g.strokeStyle = '#d8b46a'; g.lineWidth = 6 * k; g.beginPath(); g.moveTo(px, -10); g.lineTo(bx, by); g.stroke();
    emoAt(g, '🔔', bx, by + 70 * k, 230 * k, ang);
    const sw = Math.floor((t + 0.2) / 0.4);
    if (sw !== st.sw && t > 0.3) { st.sw = sw; ringWaves({ x: bx, y: by + 110 * k }, 1, '#ffd36a'); if (t < intro) { coinBurst({ x: bx, y: by + 140 * k }, 8); V.audio.dong(sw); } }
  } else if (S.tier === 'star') {
    // Csillaghullás: leszáll az éj, egy hullócsillag ív alakban becsapódik a gépbe
    g.fillStyle = `rgba(6,10,40,${0.72 * clamp01(t / 0.5)})`; g.fillRect(0, 0, W, H);
    if (!st.sky) st.sky = Array.from({ length: 90 }, () => [Math.random(), Math.random() * 0.7, Math.random() * 6, rnd(1, 2.4)]);
    g.fillStyle = '#fff'; for (const [x, y, ph, r] of st.sky) { g.globalAlpha = fade * clamp01(t / 0.5) * (0.4 + 0.6 * Math.abs(Math.sin(V.t * 2 + ph))); g.beginPath(); g.arc(x * W, y * H, r, 0, TAU); g.fill(); }
    g.globalAlpha = fade;
    const at = (u) => { const x0 = -0.1 * W, y0 = 0.02 * H, x1 = W * 0.85, y1 = -0.05 * H; return [(1 - u) ** 2 * x0 + 2 * (1 - u) * u * x1 + u * u * c.x, (1 - u) ** 2 * y0 + 2 * (1 - u) * u * y1 + u * u * c.y]; };
    const u = clamp01((t - 0.5) / (intro - 0.5)) ** 1.6;
    if (t > 0.5 && t < intro) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 14; i >= 0; i--) { const q = at(Math.max(0, u - i * 0.018)); g.fillStyle = `rgba(255,${220 - i * 8},${140 - i * 6},${0.6 * (1 - i / 15)})`; g.beginPath(); g.arc(q[0], q[1], (26 - i * 1.5) * k * (0.6 + u), 0, TAU); g.fill(); }
      g.globalCompositeOperation = 'source-over';
      const q = at(u); emoAt(g, '⭐', q[0], q[1], (50 + 90 * u) * k, V.t * 6);
      if (Math.random() < 0.5) P({ kind: 'spark', color: '#ffe9a0', x: q[0], y: q[1], vx: rnd(-80, 80), vy: rnd(-80, 80), life: 0.6, s: 2.5, drag: 1 });
    }
  } else if (S.tier === 'jackpot') {
    // Mosómedve-parádé: kialszanak a fények, reflektorok pásztáznak, pénzeszsákos mosómedvék vonulnak be,
    // középen egy óriási zsák nő, remeg, és szétrobban (csúcspont: JACKPOT)
    g.fillStyle = `rgba(0,0,0,${0.55 * clamp01(t / 0.4)})`; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (const side of [-1, 1]) {
      const ox = side < 0 ? W * 0.05 : W * 0.95, a = -Math.PI / 2 + side * (0.35 + 0.3 * Math.sin(V.t * 1.6 + (side > 0 ? 1.4 : 0)));
      const col = t < intro ? 'rgba(255,245,210,.16)' : `hsla(${(V.t * 120 + (side > 0 ? 180 : 0)) % 360},100%,60%,.2)`;
      g.fillStyle = col; g.beginPath(); g.moveTo(ox, H); const R = H * 1.3; g.lineTo(ox + Math.cos(a - 0.14) * R, H + Math.sin(a - 0.14) * R); g.lineTo(ox + Math.cos(a + 0.14) * R, H + Math.sin(a + 0.14) * R); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const n = 7, gy = H * 0.64;
    for (let i = 0; i < n; i++) {
      const target = W / 2 + (i - (n - 1) / 2) * 92 * k, x = Math.min(target, -80 * k - i * 95 * k + (t - 0.4) * W * 0.55);
      const arrived = x >= target - 1, hop = Math.abs(Math.sin(V.t * (arrived ? 7 : 11) + i * 0.8)) * (arrived ? 36 : 20) * k;
      emoAt(g, '🦝', x, gy - hop, 82 * k, Math.sin(V.t * 8 + i) * 0.12);
      emoAt(g, '💰', x + 6 * k, gy - hop - 52 * k, 44 * k, Math.sin(V.t * 6 + i) * 0.2);
    }
    if (t < intro + 0.05) {
      const s = easeBack((t - 1.9) / 0.5), sh = t > 2.4 ? Math.sin(V.t * 70) * 7 * k : 0;
      st.bag = { x: c.x, y: c.y + 20 * k };
      if (s > 0) emoAt(g, '💰', c.x + sh, c.y + 20 * k, 260 * k * s * (1 + Math.max(0, t - 2.4) * 0.5), sh * 0.01);
    }
  }
  g.restore();
}
function coinBurst(c, n) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), sp = rnd(200, 900); P({ kind: 'coin', x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 300, g: 1300, life: rnd(1.4, 2.4), s: rnd(10, 22), spin: rnd(4, 14), drag: 0.3 }); } }
function bannerSmall(t) { V.win.className = 'slwin show t-near'; V.win.innerHTML = `<div class="wt">${t}</div>`; setTimeout(() => { if (V && !V.celebrating) { V.win.className = 'slwin'; V.win.innerHTML = ''; } }, 1400); }

/* --- 2D részecskék (a 3D kép fölött): szikra, csepp, emoji, konfetti, érme, gyűrű, sugár, mancsnyom --- */
const rnd = (a, b) => a + Math.random() * (b - a);
function P(o) { V.parts.push(Object.assign({ life: 1, age: 0, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, s: 1, drag: 0 }, o)); }
function burst(c, n, kind, color) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), sp = rnd(120, kind === 'drop' ? 760 : 420); P({ kind, color, x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'drop' ? 200 : 0), g: kind === 'drop' ? 1300 : 0, life: rnd(0.5, 1.1), s: rnd(2, kind === 'drop' ? 7 : 4), drag: kind === 'spark' ? 2.5 : 0.4 }); } }
function burstEmoji(c, s, n, sp) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(sp * 0.3, sp); P({ kind: 'emo', e: s, x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 250, g: 1100, life: rnd(1.2, 2), s: rnd(26, 60), vr: rnd(-8, 8), drag: 0.6 }); } }
function rain(s, n, over) { const W = V.fx.clientWidth; for (let i = 0; i < n; i++) P({ kind: 'emo', e: s, x: rnd(0, W), y: -60, delay: rnd(0, over), vx: rnd(-40, 40), vy: rnd(60, 200), g: 900, life: 3.2, s: rnd(28, 64), vr: rnd(-3, 3), bounce: true }); }
function bubbles(s, n) { const W = V.fx.clientWidth, H = V.fx.clientHeight; for (let i = 0; i < n; i++) P({ kind: 'bub', e: s, x: rnd(0, W), y: H + 40, delay: rnd(0, 2.4), vx: 0, vy: -rnd(140, 300), wob: rnd(0, 6), life: rnd(2, 3.2), s: rnd(30, 70), popY: rnd(H * 0.1, H * 0.6) }); }
function confetti(n) { const W = V.fx.clientWidth, H = V.fx.clientHeight, cols = ['#ff4d6d', '#ffd23e', '#3ed1ff', '#7bff6a', '#c58cff', '#ff9a3c']; for (let i = 0; i < n; i++) { const left = i % 2 === 0; P({ kind: 'conf', color: cols[i % cols.length], x: left ? -10 : W + 10, y: H * 0.85, delay: Math.floor(i / 80) * 1.2 + rnd(0, 0.3), vx: (left ? 1 : -1) * rnd(250, 820), vy: -rnd(700, 1250), g: 900, drag: 1.1, life: rnd(2.5, 4), s: rnd(6, 12), vr: rnd(-12, 12) }); } }
function coinRain(n) { const W = V.fx.clientWidth; for (let i = 0; i < n; i++) P({ kind: 'coin', x: rnd(0, W), y: -40, delay: rnd(0, 2.5), vx: rnd(-30, 30), vy: rnd(100, 300), g: 1000, life: 3, s: rnd(12, 24), spin: rnd(4, 12), bounce: true }); }
function ringWaves(c, n, color) { for (let i = 0; i < n; i++) P({ kind: 'ring', color, x: c.x, y: c.y, delay: i * 0.35, life: 1.4, s: 10 }); }
function rays(c, color, life) { P({ kind: 'rays', color, x: c.x, y: c.y, life, s: 1 }); }
function flash(color, life) { P({ kind: 'flash', color, x: 0, y: 0, life }); }
function shootingStars(n) { const W = V.fx.clientWidth, H = V.fx.clientHeight; for (let i = 0; i < n; i++) P({ kind: 'shoot', x: rnd(-100, W * 0.6), y: rnd(-50, H * 0.4), vx: rnd(700, 1100), vy: rnd(250, 450), delay: rnd(0, 4), life: 0.9, s: rnd(2, 4) }); }
function fireworks(n, over) { const W = V.fx.clientWidth, H = V.fx.clientHeight, cols = ['#ffd23e', '#ff6b6b', '#6be0ff', '#c58cff', '#8bff8b']; for (let i = 0; i < n; i++) P({ kind: 'rocket', x: rnd(W * 0.1, W * 0.9), y: H + 10, vx: rnd(-60, 60), vy: -rnd(700, 950), g: 500, delay: rnd(0, over), life: rnd(0.9, 1.2), color: cols[i % cols.length] }); }
function pawTrail() { const W = V.fx.clientWidth, H = V.fx.clientHeight; for (let i = 0; i < 14; i++) { const x = -40 + i * (W + 80) / 13, y = H * 0.62 + Math.sin(i * 0.9) * 30 + (i % 2 ? 22 : -22); P({ kind: 'paw', x, y, delay: i * 0.11, life: 2.2, s: 34, rot: 0.25 + (i % 2 ? 0.2 : -0.2) }); } }

function updateParts(dt) {
  const g = V.fxc, W = V.fx.clientWidth, H = V.fx.clientHeight;
  g.clearRect(0, 0, W, H);
  drawScene(g, W, H);
  // a nyerő cellák keretei (lüktetnek, amíg tart az ünneplés)
  const c = V.celebrating;
  if (c && c.cells && c.revealed) {
    const pul = 0.5 + 0.5 * Math.sin(V.t * 10);
    for (const i of c.cells) {
      const p = cellScreen(i), s = p.s * 1.08;
      g.save(); g.lineWidth = 3 + pul * 3; g.strokeStyle = c.tier === 'jackpot' ? `hsl(${(V.t * 240 + i * 60) % 360},100%,62%)` : '#ffd23e'; g.shadowColor = g.strokeStyle; g.shadowBlur = 16 + pul * 18;
      roundRect(g, p.x - s * 0.95, p.y - s, s * 1.9, s * 2, 10); g.stroke(); g.restore();
    }
  }
  const out = [];
  for (const p of V.parts) {
    if (p.delay > 0) { p.delay -= dt; out.push(p); continue; }
    p.age += dt; if (p.age > p.life) { if (p.kind === 'rocket') explode(p); continue; }
    p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.bounce && p.y > H - p.s / 2 && p.vy > 0) { p.y = H - p.s / 2; p.vy *= -0.45; p.vx *= 0.7; }
    if (p.kind === 'bub' && p.y < p.popY) { burst(p, 10, 'spark', '#e2b8ff'); V.audio.pop(); continue; }
    drawPart(g, p, W, H); out.push(p);
  }
  V.parts = out;
}
function explode(p) { for (let i = 0; i < 46; i++) { const a = i / 46 * TAU, sp = rnd(180, 330); P({ kind: 'spark', color: p.color, x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 160, drag: 1.2, life: rnd(0.9, 1.4), s: rnd(2, 3.5) }); } V.audio.boom(); }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawPart(g, p, W, H) {
  const k = p.age / p.life, fade = Math.min(1, (1 - k) * 3);
  g.save(); g.globalAlpha = fade;
  switch (p.kind) {
    case 'spark': case 'drop':
      g.globalCompositeOperation = 'lighter'; g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.s * (1 - k * 0.5), 0, TAU); g.fill(); break;
    case 'emo': case 'bub': {
      const x = p.kind === 'bub' ? p.x + Math.sin(p.age * 4 + p.wob) * 18 : p.x;
      g.translate(x, p.y); g.rotate(p.rot); const s = p.s * (p.kind === 'bub' ? 1 + Math.sin(p.age * 9) * 0.06 : 1); g.drawImage(emo(p.e, 96), -s / 2, -s / 2, s, s); break;
    }
    case 'conf': g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.age * 9)); g.fillStyle = p.color; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); break;
    case 'coin': {
      g.translate(p.x, p.y); const sx = Math.cos(p.age * p.spin); g.scale(Math.max(0.12, Math.abs(sx)), 1);
      const gr = g.createRadialGradient(-p.s * 0.3, -p.s * 0.3, 1, 0, 0, p.s); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.5, '#ffc83a'); gr.addColorStop(1, '#b8780e');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, p.s, 0, TAU); g.fill(); g.strokeStyle = '#8a5a08'; g.lineWidth = 2; g.stroke();
      g.fillStyle = 'rgba(138,90,8,.8)'; g.font = `bold ${p.s}px Georgia`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 1); break;
    }
    case 'ring': g.globalAlpha = 1 - k; g.strokeStyle = p.color; g.lineWidth = 6 * (1 - k) + 1; g.shadowColor = p.color; g.shadowBlur = 20; g.beginPath(); g.arc(p.x, p.y, 20 + k * Math.max(W, H) * 0.45, 0, TAU); g.stroke(); break;
    case 'rays': {
      const n = 16, R = Math.hypot(W, H), a0 = p.age * 0.5;
      g.globalAlpha = Math.min(1, p.age * 2) * Math.min(1, (p.life - p.age) * 1.5) * 0.4; g.globalCompositeOperation = 'lighter'; g.translate(p.x, p.y);
      for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n; g.fillStyle = p.color === 'rainbow' ? `hsl(${(i * 360 / n + p.age * 120) % 360},100%,60%)` : p.color; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a, a + TAU / n * 0.45); g.closePath(); g.fill(); }
      break;
    }
    case 'flash': g.globalAlpha = (1 - k) * 0.7; g.fillStyle = p.color; g.fillRect(0, 0, W, H); break;
    case 'shoot': { g.globalCompositeOperation = 'lighter'; const l = g.createLinearGradient(p.x, p.y, p.x - p.vx * 0.18, p.y - p.vy * 0.18); l.addColorStop(0, '#fff'); l.addColorStop(1, 'rgba(255,230,150,0)'); g.strokeStyle = l; g.lineWidth = p.s; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.18, p.y - p.vy * 0.18); g.stroke(); break; }
    case 'rocket': g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(p.x, p.y, 3, 0, TAU); g.fill(); break;
    case 'paw': {
      g.globalAlpha = Math.min(1, p.age * 5) * Math.min(1, (p.life - p.age) * 2) * 0.85; g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = '#3a2a22';
      g.beginPath(); g.ellipse(0, 6, p.s * 0.36, p.s * 0.3, 0, 0, TAU); g.fill();
      [[-0.42, -0.3], [-0.15, -0.52], [0.15, -0.52], [0.42, -0.3]].forEach(([dx, dy]) => { g.beginPath(); g.ellipse(dx * p.s, dy * p.s, p.s * 0.12, p.s * 0.15, 0, 0, TAU); g.fill(); });
      break;
    }
  }
  g.restore();
}

/* --- 3D érmék: a nyílásból a tálcába hullanak, nagy nyereménynél ki is szöknek --- */
function spawnCoins(n, fountain) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(V.coinG, V.coinM); m.castShadow = true; m.visible = false; V.machine.add(m);
    V.coins.push({ m, delay: i * (fountain ? 0.025 : 0.06), p: new THREE.Vector3(rnd(-0.08, 0.08), 0.27, 0.34), v: new THREE.Vector3(rnd(-0.3, 0.3), fountain && i % 2 ? rnd(1.6, 3.2) : rnd(0, 0.4), fountain ? rnd(0.5, 1.4) : rnd(0.4, 0.8)), w: new THREE.Vector3(rnd(-14, 14), rnd(-8, 8), rnd(-14, 14)), age: 0, rest: false });
  }
}
function updateCoins(dt) {
  const keep = [];
  for (const c of V.coins) {
    if (c.delay > 0) { c.delay -= dt; keep.push(c); continue; }
    if (!c.m.visible) { c.m.visible = true; if (Math.random() < 0.5) V.audio.clink(); }
    c.age += dt;
    if (!c.rest) {
      c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt; c.m.rotation.z += c.w.z * dt;
      const inTray = Math.abs(c.p.x) < 0.24 && c.p.z > 0.31 && c.p.z < 0.52;
      const floor = inTray ? 0.155 + Math.min(0.04, keep.filter((o) => o.rest).length * 0.0007) : 0.004;
      if (inTray) c.p.z = Math.min(c.p.z, 0.51);
      if (c.p.y < floor) {
        c.p.y = floor; c.v.y *= -0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5);
        if (Math.abs(c.v.y) < 0.25) { c.rest = true; c.m.rotation.set(rnd(-0.15, 0.15), rnd(0, 6), rnd(-0.15, 0.15)); }
      }
    }
    c.m.position.copy(c.p);
    if (c.age > 6) { const s = Math.max(0, 1 - (c.age - 6) * 2); c.m.scale.setScalar(s); if (s <= 0) { V.machine.remove(c.m); continue; } }
    keep.push(c);
  }
  V.coins = keep;
}

/* ---------------- a fő ciklus ---------------- */
function resize() {
  if (!V) return;
  const w = V.el.clientWidth, h = V.el.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  V.renderer.setSize(w, h, false); V.camera.aspect = w / h; V.camera.updateProjectionMatrix();
  V.fx.width = w * dpr; V.fx.height = h * dpr; V.fx.style.width = w + 'px'; V.fx.style.height = h + 'px'; V.fxc.setTransform(dpr, 0, 0, dpr, 0, 0);
  V.portrait = w / h < 0.9;
}
function loop() {
  if (!V) return;
  cancelAnimationFrame(V.raf);
  if (document.visibilityState !== 'visible') return;
  V.raf = requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min(0.05, (now - V.last) / 1000); V.last = now; V.t += dt;
  updateReels(dt); updateCelebration(); updateCoins(dt);
  // a kar: rugó vissza az alapállásba (vagy követi a húzást)
  const target = V.leverPull * 1.15;
  if (V.leverV > 0) { V.leverA = Math.min(1.15, V.leverA + V.leverV * dt); if (V.leverA >= 1.15) V.leverV = 0; }
  else { V.leverVel = (V.leverVel || 0) + ((target - V.leverA) * 160 - (V.leverVel || 0) * 14) * dt; V.leverA += V.leverVel * dt; }
  V.lever.rotation.x = V.leverA;
  // égők: nyugalomban lassú hullám, pörgéskor futófény, nyereménykor villogás vagy szivárvány
  V.bulbT += dt;
  V.bulbs.forEach((b, i) => {
    let on = 0.6 + 0.4 * Math.sin(V.bulbT * 2 + i * 0.5);
    if (V.bulbMode === 'spin') on = ((Math.floor(V.bulbT * 14) + i) % 4 === 0) ? 2.4 : 0.25;
    else if (V.bulbMode === 'chase') on = ((Math.floor(V.bulbT * 22) - i + 99) % 3 === 0) ? 3 : 0.3;
    else if (V.bulbMode === 'blink') on = Math.floor(V.bulbT * 8) % 2 ? 2.6 : 0.3;
    else if (V.bulbMode === 'rainbow') { b.material.emissive.setHSL(((V.bulbT * 0.8 + i / V.bulbs.length) % 1), 1, 0.55); on = 2.6; }
    if (V.bulbMode !== 'rainbow') b.material.emissive.setHex(0xffc04a);
    b.material.emissiveIntensity = on;
  });
  V.payM.emissiveIntensity = V.celebrating ? 1.5 + Math.sin(V.t * 12) : 0.3;
  V.signM.emissiveIntensity = V.celebrating ? 0.6 + 0.3 * Math.sin(V.t * 8) : 0.25;
  V.glow.intensity = V.night ? 1.2 : 0.6;
  V.hemi.intensity += ((V.dim ? (V.night ? 0.2 : 0.35) : (V.night ? 0.55 : 1.0)) - V.hemi.intensity) * Math.min(1, dt * 4);
  // rázkódás, kamera (belépéskor ráközelít, egérre kicsit elfordul, nagy nyereménynél körbeúszik)
  V.shake = Math.max(0, V.shake - dt * 0.8);
  const sh = reduced ? 0 : V.shake * 0.012;
  V.machine.position.set(rnd(-sh, sh), Math.abs(rnd(0, sh)), rnd(-sh, sh));
  V.intro = Math.min(1, V.intro + dt / 1.3);
  const ei = 1 - Math.pow(1 - V.intro, 3);
  V.orbit = Math.max(0, V.orbit - dt * 0.25);
  const orb = reduced ? 0 : Math.sin(Math.min(1, V.orbit) * Math.PI) * 0.45 * (V.celebrating ? 1 : 0.4);
  // a gép (1,8 m magas, a karral 1,15 m széles) épp kitöltse a képet: a távolság a látószögből és a képarányból
  const tn = Math.tan(THREE.MathUtils.degToRad(V.camera.fov / 2)), fitD = Math.max(1.12 / tn, 0.7 / (tn * V.camera.aspect));
  const dist = fitD + (1 - ei) * 4, yaw = 0.1 + V.mouse.x * 0.18 + orb - (1 - ei) * 0.5, lift = 1.0 - V.mouse.y * 0.1 + (1 - ei) * 1.2;
  V.camera.position.set(Math.sin(yaw) * dist - 0.05, lift, Math.cos(yaw) * dist);
  V.camera.lookAt(0.03, 0.8, 0);   // kicsit lejjebb: alul a kezelőpanel takar
  V.renderer.render(V.scene, V.camera);
  updateParts(dt);
}

/* ---------------- hangok (WebAudio, szintetizálva; semmit nem tölt le) ---------------- */
function makeAudio() {
  const A = { ctx: null, master: null, countT: null };
  const ok = () => !V || V.mute ? null : A.ctx;
  A.unlock = () => { if (!A.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; A.ctx = new C(); A.master = A.ctx.createGain(); A.master.gain.value = 0.5; A.master.connect(A.ctx.destination); } if (A.ctx.state === 'suspended') A.ctx.resume(); };
  const tone = (f, t, d, type = 'sine', v = 0.3, f2) => { const c = ok(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, c.currentTime + t + d); g.gain.setValueAtTime(0, c.currentTime + t); g.gain.linearRampToValueAtTime(v, c.currentTime + t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + d); o.connect(g); g.connect(A.master); o.start(c.currentTime + t); o.stop(c.currentTime + t + d + 0.05); };
  const noise = (t, d, v = 0.2, fq = 2000) => { const c = ok(); if (!c) return; const b = c.createBuffer(1, Math.ceil(c.sampleRate * d), c.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / x.length); const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq; const g = c.createGain(); g.gain.value = v; s.connect(f); f.connect(g); g.connect(A.master); s.start(c.currentTime + t); };
  const notes = (seq, step, type = 'triangle', v = 0.22) => seq.forEach((f, i) => f && tone(f, i * step, step * 2.2, type, v));
  A.lever = () => { for (let i = 0; i < 6; i++) noise(i * 0.035, 0.03, 0.25, 3000 - i * 200); tone(160, 0.2, 0.25, 'sine', 0.25, 70); };
  A.tick = () => noise(0, 0.015, 0.08, 4200);
  A.thunk = (i) => { tone(110 - i * 8, 0, 0.18, 'sine', 0.5, 50); noise(0, 0.05, 0.25, 900); };
  A.tease = () => { for (let i = 0; i < 6; i++) { tone(55, i * 0.42, 0.14, 'sine', 0.45); tone(55, i * 0.42 + 0.16, 0.12, 'sine', 0.3); } tone(300, 0, 1.6, 'sawtooth', 0.04, 900); };
  A.dud = () => tone(220, 0, 0.2, 'triangle', 0.12, 160);
  A.clink = () => { const f = rnd(2600, 4200); tone(f, 0, 0.12, 'sine', 0.08); tone(f * 1.5, 0.004, 0.08, 'sine', 0.04); };
  A.pop = () => tone(rnd(500, 900), 0, 0.08, 'sine', 0.12, 1600);
  A.boom = () => { noise(0, 0.6, 0.25, 300); tone(80, 0, 0.5, 'sine', 0.3, 40); };
  const bell = (t, f) => [1, 2.76, 5.4, 8.93].forEach((h, i) => tone(f * h, t, 1.6 / (i + 1), 'sine', 0.18 / (i + 1)));
  A.win = (tier) => {
    const C = [523, 659, 784, 1047, 1319, 1568, 2093];
    ({
      tiny: () => notes([1319, 1568], 0.08),
      paws: () => notes([784, 988, 1175, 988, 1568], 0.09, 'square', 0.08),
      cherry: () => notes([659, 784, 988, 1319, 988, 1319], 0.08),
      lemon: () => { noise(0, 0.35, 0.3, 5000); notes([880, 1109, 1319, 1760], 0.07, 'square', 0.08); },
      grape: () => notes([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.1),
      bell: () => { for (let i = 0; i < 8; i++) bell(i * 0.3, i % 2 ? 1318 : 1046); notes(C, 0.1, 'sawtooth', 0.06); },
      star: () => { notes([...C, 2637], 0.08); notes([0, 0, 0, 0, 0, 0, 0, 0, 0, 1047, 1319, 1568, 2093], 0.12, 'square', 0.07); },
      jackpot: () => { notes([...C, 0, ...C.slice().reverse(), 0, ...C], 0.07, 'square', 0.08); [523, 659, 784, 1047].forEach((f) => tone(f, 1.8, 2.6, 'sawtooth', 0.06)); for (let i = 0; i < 10; i++) bell(0.3 + i * 0.4, 1568); },
    })[tier]();
  };
  A.dong = (i) => bell(0, i % 2 ? 392 : 523);
  A.splash = () => { noise(0, 0.4, 0.3, 700); tone(300, 0, 0.2, 'sine', 0.2, 90); };
  A.intro = (tier) => ({
    grape: () => notes([392, 0, 494, 0, 587, 0, 784], 0.16, 'triangle', 0.16),
    bell: () => {},
    star: () => { tone(200, 0.4, 1.5, 'sawtooth', 0.05, 2400); noise(0.5, 1.4, 0.12, 6000); },
    jackpot: () => { for (let i = 0; i < 40; i++) noise(i * 0.07 * (1 - i / 90), 0.05, 0.12 + i * 0.006, 260); tone(110, 2.2, 0.6, 'sawtooth', 0.08, 220); },
  })[tier]();
  A.countStart = (dur) => { A.countStop(); let i = 0; A.countT = setInterval(() => { if (!ok()) return; tone(1200 + (i++ % 12) * 60, 0, 0.04, 'square', 0.04); }, 70); setTimeout(A.countStop, dur * 1000); };
  A.countStop = () => { clearInterval(A.countT); A.countT = null; };
  A.land = (tier) => { if (tier === 'tiny') return; tone(1568, 0, 0.6, 'triangle', 0.2); tone(2093, 0.06, 0.8, 'triangle', 0.15); };
  return A;
}

/* ---------------- stílus (egyszer kerül a lapra) ---------------- */
function injectCss() {
  if (document.getElementById('slcss')) return;
  const s = document.createElement('style'); s.id = 'slcss';
  s.textContent = `
.slv{position:fixed;inset:0;z-index:3000;overflow:hidden;opacity:0;transition:opacity .25s;font-family:system-ui,-apple-system,sans-serif;color:#fff;background:#2a160b}
.slv.in{opacity:1}
.slbg{position:absolute;inset:-30px;background:url(/img/scene-wide.jpg) center/cover;filter:blur(14px) brightness(.62) saturate(1.2);transform:scale(1.05)}
.slv.night .slbg{background-image:url(/img/scene-night-wide.jpg);filter:blur(14px) brightness(.5)}
.slbg::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 30%,rgba(10,4,0,.75) 100%)}
.sl3d,.slfx{position:absolute;inset:0;width:100%;height:100%;display:block}
.slfx{pointer-events:none;z-index:2}
.slx,.slmute{position:absolute;top:14px;z-index:5;width:42px;height:42px;border-radius:50%;border:0;background:rgba(10,15,22,.6);color:#fff;font-size:18px;cursor:pointer;backdrop-filter:blur(6px)}
.slx{right:14px}.slmute{right:64px}
.slx:hover,.slmute:hover,.slx:focus-visible,.slmute:focus-visible{background:rgba(255,255,255,.22);outline:none}
.slpanel{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:4;width:min(560px,calc(100% - 24px));background:rgba(20,10,4,.66);backdrop-filter:blur(10px);border:1px solid rgba(255,210,120,.25);border-radius:18px;padding:10px 14px;box-sizing:border-box}
.slrow{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.slrow+.slrow{margin-top:8px}
.slpot{font-size:14px;opacity:.9}.slpot b{font-size:18px;color:#ffd36a;margin-left:4px}
.slmsg{font-size:13px;color:#ffb4a0}
.slbets{display:flex;gap:6px}
.slbets button{min-width:52px;height:40px;border-radius:999px;border:2px solid rgba(255,211,106,.5);background:rgba(255,255,255,.08);color:#fff;font-weight:800;font-size:14px;cursor:pointer}
.slbets button.on{background:#ffd36a;color:#2a1406;border-color:#ffd36a}
.slbets button:disabled{opacity:.35;cursor:default}
.slgo{flex:1;min-width:170px;height:48px;border:0;border-radius:999px;font-weight:900;font-size:17px;letter-spacing:.02em;color:#2a1406;cursor:pointer;background:linear-gradient(180deg,#ffe58a,#f0a52a);box-shadow:0 4px 0 #a8620e,0 8px 22px rgba(255,170,40,.35);transition:transform .08s}
.slgo:active{transform:translateY(3px);box-shadow:0 1px 0 #a8620e}
.slgo:disabled{filter:grayscale(.7);opacity:.6;cursor:default}
.slgo:focus-visible{outline:3px solid #fff;outline-offset:2px}
.slpay{margin-top:8px;font-size:13px}
.slpay summary{cursor:pointer;opacity:.8}
.slpt{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:4px 12px;margin:8px 0}
.slpt b{color:#ffd36a}
.slrec{list-style:none;margin:0;padding:0;max-height:140px;overflow:auto}
.slrec li{display:grid;grid-template-columns:1fr auto 90px;gap:8px;padding:3px 0;border-top:1px solid rgba(255,255,255,.08)}
.slrec li span:last-child{text-align:right}.slrec .w{color:#8dff8a;font-weight:700}
/* a nyeremény felirata: minden fokozatnak saját belépő mozgása */
.slwin{position:absolute;left:0;right:0;top:9%;z-index:3;text-align:center;pointer-events:none;opacity:0}
.slwin.show{opacity:1;pointer-events:auto;cursor:pointer}
.slwin.out{opacity:0;transition:opacity .35s}
.slwin .wt{font:900 clamp(30px,7vw,78px)/1 Georgia,serif;letter-spacing:.02em;color:#ffe7a8;-webkit-text-stroke:2px #5a2206;text-shadow:0 6px 0 #5a2206,0 12px 30px rgba(0,0,0,.55)}
.slwin .wa{margin-top:10px;font:900 clamp(30px,6vw,64px)/1 system-ui,sans-serif;color:#fff;text-shadow:0 4px 0 #b8640e,0 0 28px rgba(255,200,60,.8)}
.slwin .ws{margin-top:8px;font-size:15px;opacity:.85;text-shadow:0 2px 6px #000}
.slwin.landed .wa{animation:slland .5s cubic-bezier(.2,2,.4,1)}
.slwin.t-tiny .wa{font-size:clamp(26px,4.5vw,44px);animation:sltiny 1.4s ease-out both}
.slwin.t-near .wt{font-size:clamp(26px,5vw,48px);color:#ffd0b8;animation:slnear 1.4s ease-out both}
.slwin.t-paws .wt{animation:slslide .8s cubic-bezier(.2,1.6,.4,1) both;color:#ffe2c4}
.slwin.t-cherry .wt{animation:sldrop .9s cubic-bezier(.3,1.7,.5,1) both;color:#ffb4b4;-webkit-text-stroke-color:#6a0a14;text-shadow:0 6px 0 #6a0a14,0 12px 30px rgba(0,0,0,.5)}
.slwin.t-lemon .wt{animation:slpop .7s cubic-bezier(.2,2.2,.4,1) both,slwob 1.2s .7s ease-in-out 2;color:#fff47a;-webkit-text-stroke-color:#6a5200;text-shadow:0 6px 0 #6a5200,0 12px 30px rgba(0,0,0,.5)}
.slwin.big .wt{background:linear-gradient(100deg,#ffe7a8 20%,#fff 40%,#ffe7a8 60%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:slshine 1.6s linear infinite}
.slwin.t-grape .wt{background-image:linear-gradient(100deg,#d9b4ff 20%,#fff 40%,#d9b4ff 60%);-webkit-text-stroke-color:#3a0c66;animation:slelastic 1s cubic-bezier(.2,2,.3,1) both,slshine 1.6s linear infinite}
.slwin.t-bell .wt{animation:slstamp .55s cubic-bezier(.2,1.4,.4,1) both,slshine 1.6s linear infinite,slring .12s .55s ease-in-out 8 alternate}
.slwin.t-star .wt{animation:slrise .9s cubic-bezier(.2,1.4,.4,1) both,slshine 1.2s linear infinite}
.slwin.t-jackpot .wt{background:none;color:#fff;-webkit-text-stroke:0;text-shadow:none;perspective:600px;font-size:clamp(46px,12vw,140px)}
.slwin.t-jackpot .wt i{display:inline-block;font-style:normal;animation:slflip .6s var(--d) cubic-bezier(.2,1.6,.4,1) both,slrain 1.4s calc(var(--d) + .6s) linear infinite;background:linear-gradient(180deg,#fff6c8,#ffc83a 55%,#c06a00);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 0 #5a2206) drop-shadow(0 0 22px rgba(255,200,60,.9))}
@keyframes sltiny{0%{transform:translateY(30px) scale(.6);opacity:0}25%{transform:translateY(0) scale(1.1);opacity:1}100%{transform:translateY(-30px) scale(1);opacity:1}}
@keyframes slnear{0%{transform:scale(.5);opacity:0}30%{transform:scale(1.05);opacity:1}100%{transform:scale(1);opacity:0}}
@keyframes slslide{0%{transform:translateX(-120vw) skewX(-20deg)}100%{transform:none}}
@keyframes sldrop{0%{transform:translateY(-60vh)}100%{transform:none}}
@keyframes slpop{0%{transform:scale(0) rotate(-20deg)}100%{transform:none}}
@keyframes slwob{0%,100%{transform:rotate(0)}25%{transform:rotate(-4deg) scale(1.05)}75%{transform:rotate(4deg) scale(1.05)}}
@keyframes slelastic{0%{transform:scale(0)}100%{transform:scale(1)}}
@keyframes slstamp{0%{transform:scale(3.2);filter:blur(10px);opacity:0}100%{transform:scale(1);filter:none;opacity:1}}
@keyframes slring{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}
@keyframes slrise{0%{transform:translateY(40vh) scale(.6);opacity:0}100%{transform:none;opacity:1}}
@keyframes slshine{from{background-position:100% 0}to{background-position:-100% 0}}
@keyframes slflip{0%{transform:rotateX(-100deg) translateY(-40px) scale(1.6);opacity:0}100%{transform:none;opacity:1}}
@keyframes slrain{0%,100%{filter:drop-shadow(0 6px 0 #5a2206) drop-shadow(0 0 22px hsl(40 100% 60%)) hue-rotate(0deg)}50%{filter:drop-shadow(0 6px 0 #5a2206) drop-shadow(0 0 30px hsl(300 100% 60%)) hue-rotate(40deg)}}
@keyframes slland{0%{transform:scale(1.35)}100%{transform:scale(1)}}
@media (max-width:560px){.slbets button{min-width:44px;height:38px;font-size:13px}.slgo{min-width:100%;order:-1}.slwin{top:6%}}
@media (prefers-reduced-motion:reduce){.slwin .wt,.slwin .wa,.slwin .wt i{animation:none!important}}
`;
  document.head.appendChild(s);
}

// próbához (konzolból): a gép egy kitalált eredményen áll meg, a pot nem változik. pl. (await import('/slot.js?v=1')).demo('jackpot')
export function demo(tier) {
  if (!V || V.spinning) return;
  const L = { tiny: ['🍒', '🍋', '🍒'], paws: ['🦝', '🍇', '🦝'], cherry: ['🍒', '🍒', '🍒'], lemon: ['🍋', '🍋', '🍋'], grape: ['🍇', '🍇', '🍇'], bell: ['🔔', '🔔', '🔔'], star: ['⭐', '⭐', '⭐'], jackpot: ['🦝', '🦝', '🦝'], lose: ['🍒', '🔔', '🍋'] }[tier] || ['🍒', '🔔', '🍋'];
  const kind = tier === 'tiny' || tier === 'paws' ? 'pair' : tier === 'lose' ? '' : 'three';
  const mult = { tiny: 2, paws: 5, cherry: 6, lemon: 10, grape: 15, bell: 30, star: 60, jackpot: 250 }[tier] || 0;
  V.spinning = true; V.pending = false; V.near = false; V.leverV = 9; V.audio.unlock(); V.audio.lever(); V.bulbMode = 'spin';
  V.reels.forEach((R, i) => { R.state = 'wind'; R.t0 = V.t + i * 0.07; R.stopAt = V.t + 1.05 + i * 0.42; });
  setTimeout(() => { if (!V) return; V.result = { reels: L.map((s) => [SYMS[(SYMS.indexOf(s) + 2) % 6], s, SYMS[(SYMS.indexOf(s) + 4) % 6]]), line: L, mult, kind, stake: 1000, back: 1000 * mult }; landPlan(); }, 150);
}
