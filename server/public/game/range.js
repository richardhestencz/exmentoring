// A lőtér: az ajtajánál „E”-vel menü nyílik, innen megy a játékos a Loop Arénába (/arena.html). A visszatérés is itt dől el:
// az arénából jövő játékos a lőtér ajtaja előtt áll az utcán (sessionStorage: 'loopcity-return').
import { G } from './core.js';
const $ = (id) => document.getElementById(id);
const KEY = 'loopcity-return';

export function init() {
  const R = G.world.places.range; if (!R) return;
  // visszatérés az arénából: a spawnPlayer() már lefutott, ezért a játékost és a modelljét helyben mozdítjuk
  try {
    if (sessionStorage.getItem(KEY)) {
      sessionStorage.removeItem(KEY);   // egyszer használjuk: a frissítés ne vigyen megint a lőtérhez
      const P = G.player, out = R.ry === 0 ? 1 : -1;   // a homlokzat felé nézve az utca felé állunk
      P.x = R.door.x + 2; P.z = R.door.z + out * 3.4;   // az ajtó előtt, kicsit kijjebb
      P.y = 0; P.ry = R.ry; G.cam.yaw = R.ry + Math.PI;
      P.av?.root.position.set(P.x, 0, P.z); if (P.av) P.av.root.rotation.y = P.ry;
    }
  } catch {}
  G.interact.push({ x: R.door.x, z: R.door.z, r: 2.8, label: 'Lőtér: belépés', key: 'E', act: openMenu });
}

function openMenu() {
  G.mode = 'pause'; G.keepUnlocked = true; document.exitPointerLock?.();
  const box = $('menubox');
  const close = () => { $('menu').hidden = true; G.keepUnlocked = false; G.mode = 'play'; G.renderer.domElement.requestPointerLock?.(); removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.code === 'Escape') close(); };
  const go = (q) => {
    try { const P = G.player; sessionStorage.setItem(KEY, JSON.stringify({ x: P.x, z: P.z })); } catch {}
    location.href = '/arena.html' + q;
  };
  box.innerHTML = '<h2>Lőtér</h2><small id="rangeOn">Az aréna állása: betöltés…</small>';
  const mk = (txt, fn) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${txt}</span>`; b.onclick = fn; box.appendChild(b); return b; };
  const first = mk('▶ Arénába (online lövöldözés)', () => go(''));
  mk('Gyakorlás botokkal', () => go('?bots=1'));
  mk('Mégse', close);
  addEventListener('keydown', esc);
  $('menu').hidden = false; first.focus();
  // az aréna élő létszáma (a szerver /api/arena végpontja)
  fetch('/api/arena').then((r) => r.json()).then((j) => { $('rangeOn').textContent = j.players ? `Az arénában most ${j.players} játékos lő.` : 'Az aréna üres: te vagy az első, vagy gyakorolj botokkal.'; })
    .catch(() => { $('rangeOn').textContent = 'Az aréna állása nem érhető el.'; });
}
