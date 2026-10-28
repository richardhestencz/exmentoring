// Többjátékos Loop City: a többi játékos mosómedvéje (vagy az autója) a városban, a nevével a feje fölött.
// Saját WebSocket a szerverhez (server/city.js); 10-szer küldjük a helyünket, a többieket simítva mozgatjuk a pillanatképek között.
import { G } from './core.js';
import { raccoon } from './player.js';
const THREE = G.THREE, P = G.player;
const ANIMS = ['idle', 'walk', 'run', 'lie', 'sit'];
const CAR_K = 1.6;                                 // ugyanaz a nagyítás, mint a vehicles.js-ben
const others = new Map();                          // id -> {av, tag, car, kind, x, y, z, r, tx, ty, tz, tr, a}
G.others = others;
let ws = null, myId = 0, roster = new Map(), sendT = 0, retry = 0;
const myTint = (() => { try { const v = +sessionStorage.getItem('loopcity-tint'); if (v) return v; const c = new THREE.Color().setHSL(Math.random(), 0.35, 0.78).getHex(); sessionStorage.setItem('loopcity-tint', c); return c; } catch { return 0xffffff; } })();

// név a fej fölött: vászon-sprite (mindig a kamera felé néz)
function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '800 30px system-ui, sans-serif'; const w = Math.min(250, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(20,14,10,.72)'; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 22); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(2, 0.5, 1); s.renderOrder = 10; G.scene.add(s);
  return s;
}
function add(id, x, y, z, r) {
  const info = roster.get(id) || ['Mosómedve', 0xffffff];
  const av = raccoon(info[1] || 0xffffff); av.root.position.set(x, y, z); av.play('idle');
  const o = { av, tag: nameTag(info[0]), car: null, kind: '', x, y, z, r, tx: x, ty: y, tz: z, tr: r, a: 0 };
  others.set(id, o); return o;
}
function drop(id) {
  const o = others.get(id); if (!o) return;
  G.scene.remove(o.av.root, o.tag); if (o.car) G.scene.remove(o.car); others.delete(id);
}
async function setCar(o, kind) {
  if (o.kind === kind) return; o.kind = kind;
  if (o.car) { G.scene.remove(o.car); o.car = null; }
  if (!kind) return;
  try {
    const m = (await G.model(`/game/assets/cars/${kind}.glb`)).scene.clone(true); m.scale.setScalar(CAR_K);
    m.traverse((n) => { if (n.isMesh) n.castShadow = true; });
    const g = new THREE.Group(); g.add(m); if (o.kind !== kind) return; o.car = g; G.scene.add(g);
  } catch {}
}

function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host);
  ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ t: 'c-join', nick: G.nick, tint: myTint })); };
  ws.onclose = () => { for (const id of [...others.keys()]) drop(id); myId = 0; setTimeout(connect, Math.min(10000, 1500 * ++retry)); };
  ws.onmessage = (e) => {
    const s = e.data; if (typeof s !== 'string' || !s.startsWith('{"t":"c-')) return;   // a webhely többi üzenete nem kell
    const m = JSON.parse(s);
    if (m.t === 'c-wl') { myId = m.id; G.hud.toast('Online vagy a városban: a többiek látnak.'); }
    else if (m.t === 'c-ro') {
      const prev = roster; roster = new Map(m.l.map(([id, n, t]) => [id, [n, t]]));
      for (const [id] of roster) if (id !== myId && !prev.has(id) && prev.size) G.hud.toast(`${roster.get(id)[0]} megérkezett Loop Citybe.`);
    }
    else if (m.t === 'c-lv') drop(m.id);
    else if (m.t === 'c-sn') {
      const seen = new Set();
      for (const [id, x, y, z, r, a, c] of m.p) {
        if (id === myId) continue; seen.add(id);
        const o = others.get(id) || add(id, x, y, z, r);
        o.tx = x; o.ty = y; o.tz = z; o.tr = r; o.a = a; setCar(o, c);
      }
      for (const id of [...others.keys()]) if (!seen.has(id)) drop(id);
    }
  };
}

export function init() {
  connect();
  G.on('update', (dt, t) => {
    // a saját helyünk 10-szer másodpercenként
    sendT -= dt;
    if (sendT <= 0 && ws && ws.readyState === 1 && myId) {
      sendT = 0.1;
      const a = P.dead ? 3 : P.speed > 4.5 ? 2 : P.speed > 0.3 ? 1 : 0;
      ws.send(JSON.stringify({ t: 'c-st', x: +P.x.toFixed(2), y: +(P.sy ?? P.y).toFixed(2), z: +P.z.toFixed(2), r: +P.ry.toFixed(2), a, c: P.inCar ? P.inCar.kind : '' }));
    }
    // a többiek: simítás a legutóbbi pillanatkép felé (egy 100 ms-os lépésnyi késéssel ez folyamatos mozgás)
    const k = Math.min(1, dt * 10);
    for (const o of others.values()) {
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.z += (o.tz - o.z) * k;
      let d = ((o.tr - o.r + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; o.r += d * k;
      const inCar = !!o.car;
      o.av.root.visible = !inCar;
      if (inCar) { o.car.position.set(o.x, 0, o.z); o.car.rotation.y = o.r; }
      else {
        o.av.root.position.set(o.x, o.y, o.z); o.av.root.rotation.set(o.a === 3 ? -1.2 : 0, o.r, 0);
        const near = Math.hypot(o.x - P.x, o.z - P.z) < 90;   // a messzieket nem animáljuk (gyorsaság)
        if (near) { o.av.play(ANIMS[o.a] || 'idle'); o.av.mixer.update(dt); }
      }
      o.tag.position.set(o.x, o.y + (inCar ? 2.6 : 1.95), o.z);
    }
  });
}
