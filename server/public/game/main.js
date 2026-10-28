// Belépés: a tisztás „SZINKRONIZÁLÁS” betöltője (mint a 3D tisztáson), közben töltődik minden; utána fehér villanás,
// és a kamera a magasból leereszkedik a tűz mellett álló mosómedve mögé. Innen indul a játék.
import { G, manager } from './core.js';
import './world.js';
import { loadRaccoon, spawnPlayer } from './player.js';
const THREE = G.THREE, $ = (id) => document.getElementById(id);
const nick = (() => { try { return localStorage.getItem('nick') || ''; } catch { return ''; } })() || 'Mosómedve';
G.nick = nick;
$('syncNick').textContent = nick;

// a modulok (autók, gyalogosok, fegyverek, bolt, lőtér) egymástól függetlenül töltődnek: ha egy hibás, a többi megy
const MODS = ['./vehicles.js', './npcs.js', './weapons.js', './shop.js', './range.js', './minimap.js'];

// ---------- az Animus-tér: szürke végtelen, forgó szilánkok, a kamera előre száguld ----------
const animus = new THREE.Scene(); animus.background = new THREE.Color(0xf3f3f3); animus.fog = new THREE.Fog(0xf3f3f3, 10, 80);
{
  const mats = [0xd9d9d9, 0xbdbdbd, 0xe8e8e8, 0xa9a9a9].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }));
  const tri = new THREE.TetrahedronGeometry(0.6);
  for (let i = 0; i < 320; i++) {
    const m = new THREE.Mesh(i % 7 ? tri : new THREE.OctahedronGeometry(0.35), mats[i % mats.length]);
    const a = Math.random() * 6.28, r = 2 + Math.random() * 12;
    m.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.6, -Math.random() * 400); m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    m.scale.setScalar(0.4 + Math.random() * 1.6); m.userData.spin = (Math.random() - 0.5) * 2; animus.add(m);
  }
  const grid = new THREE.GridHelper(800, 300, 0xcfcfcf, 0xdddddd); grid.position.y = -5; animus.add(grid);
}
const acam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
let loaded = 0, want = 1, ready = false, t0 = 0, phase = 'sync';
manager.onProgress = (u, a, b) => { loaded = a; want = b; };
const flash = $('flash');
G.frame = (dt, t) => {
  if (phase === 'sync') {
    const k = t;
    acam.aspect = innerWidth / innerHeight; acam.updateProjectionMatrix();
    acam.position.set(Math.sin(k * 0.7) * 0.6, Math.cos(k * 0.5) * 0.3, -k * 9 % 350); acam.lookAt(0, 0, acam.position.z - 10);
    for (const s of animus.children) if (s.userData.spin) { s.rotation.x += s.userData.spin * dt; s.rotation.y += s.userData.spin * 0.7 * dt; }
    const pct = Math.min(ready ? 100 : 97, Math.floor((loaded / Math.max(1, want)) * 100));
    $('syncPct').textContent = pct + '%';
    if (ready && k > 2.6) { if (!t0) t0 = t; flash.style.opacity = Math.min(1, (t - t0) / 0.35); if (t - t0 > 0.35) { phase = 'drop'; t0 = t; $('sync').hidden = true; } }
    G.renderer.render(animus, acam); return;
  }
  // a világ: a kamera a magasból (a város fölött) leereszkedik a mosómedve mögé
  const b = Math.min(1, (t - t0) / 3.6), e = b < 0.5 ? 4 * b ** 3 : 1 - (-2 * b + 2) ** 3 / 2;
  flash.style.opacity = Math.max(0, 1 - (t - t0) / 0.6);
  const P = G.player, cam = G.cam, yaw = cam.yaw + (1 - e) * 2.2, dist = 60 + (cam.dist - 60) * e, hgt = 45 + (Math.sin(cam.pitch) * cam.dist + 1.25 - 45) * e;
  G.camera.position.set(P.x + Math.sin(yaw) * dist, hgt, P.z + Math.cos(yaw) * dist); G.camera.lookAt(P.x, 1.1 * e + 6 * (1 - e), P.z);
  P.av.mixer.update(dt);
  G.renderer.render(G.scene, G.camera);
  if (b >= 1) { G.frame = null; G.mode = 'play'; document.body.classList.add('playing'); G.hud.banner('LOOP CITY', 'Szinkronizálva · kattints a játékba, az egér néz', 3500); G.emit('start'); }
};

(async () => {
  await loadRaccoon();
  spawnPlayer();
  await Promise.all(MODS.map((m) => import(m).then((x) => x.init && x.init()).catch((e) => console.warn('modul nem töltődött:', m, e))));
  await G.world.clearingReady;
  // a többi letöltés megvárása (a LoadingManager mindent számol)
  await new Promise((r) => { const ck = () => (loaded >= want ? r() : setTimeout(ck, 100)); ck(); setTimeout(r, 20000); });
  G.renderer.compile(G.scene, G.camera);
  ready = true;
})();

// ---------- szünet (Esc / a pointer lock elvesztése), kilépés ----------
const pause = $('pause');
document.addEventListener('pointerlockchange', () => { if (!G.locked() && G.mode === 'play' && !G.keepUnlocked) { G.mode = 'pause'; pause.hidden = false; } });
$('resume').onclick = () => { pause.hidden = true; G.mode = 'play'; G.renderer.domElement.requestPointerLock?.(); };
$('quit').onclick = () => { location.href = '/beta.html'; };
G.on('key', (c) => { if (c === 'Escape' && G.mode === 'pause') $('resume').onclick(); });
