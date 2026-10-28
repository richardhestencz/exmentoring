// A radar bal alul: a kamera irányába forgatott felülnézet (utak, háztömbök, tenger, a bolt és a lőtér jele, autók, gyalogosok,
// rendőrök), közepén a játékos nyila. Kb. 200 x 140 m-t mutat; gyorsan haladva (autóban) kijjebb zoomol.
import { G } from './core.js';
const cv = document.getElementById('radar'), g = cv.getContext('2d'), CW = cv.width, CH = cv.height;
let zoom = 2;   // pixel / méter
export function init() {
  const R = G.world.roads;
  G.on('update', (dt, t) => {
    const P = G.player, want = P.inCar ? 1.1 : 2; zoom += (want - zoom) * Math.min(1, dt * 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#4f6b3c'; g.fillRect(0, 0, CW, CH);
    // a világ forgatása: a kamera nézési iránya legyen fölfelé
    g.translate(CW / 2, CH / 2 + 30); g.rotate(G.cam.yaw); g.scale(zoom, zoom); g.translate(-P.x, -P.z);
    // homok és tenger
    g.fillStyle = '#d9c38f'; g.fillRect(G.world.beach, -1000, G.world.sea - G.world.beach, 2000);
    g.fillStyle = '#3d7fa6'; g.fillRect(G.world.sea, -1000, 2000, 2000);
    // háztömbök (járdával) és a park
    for (const b of G.world.blocks) {
      g.fillStyle = '#b9b2a8'; g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      g.fillStyle = G.world.parks.includes(b) ? '#5f8f4a' : '#8d8a97'; g.fillRect(b.inner.x0, b.inner.z0, b.inner.x1 - b.inner.x0, b.inner.z1 - b.inner.z0);
    }
    // utak
    g.fillStyle = '#2a2a30';
    for (const x of R.xs) g.fillRect(x - R.half, R.z0 - R.half, R.half * 2, R.z1 - R.z0 + R.half * 2);
    for (const z of R.zs) g.fillRect(R.x0, z - R.half, R.x1 - R.x0, R.half * 2);
    g.fillStyle = '#9b7a4c'; g.fillRect(14, -2.5, R.x0 - 14, 5);                    // földút
    g.fillStyle = '#c98a2c'; g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill();          // a tisztás
    // autók, gyalogosok, rendőrök
    for (const v of G.vehicles || []) { if (v.dead) continue; g.fillStyle = v.police ? (t % 0.5 < 0.25 ? '#ff3b3b' : '#3b7bff') : '#f2f2f2'; g.save(); g.translate(v.x, v.z); g.rotate(-(v.ry || 0)); g.fillRect(-1.1, -2.2, 2.2, 4.4); g.restore(); }
    // a többi játékos: nagyobb sárga pötty
    if (G.others) for (const o of G.others.values()) { g.fillStyle = '#ffd23e'; g.strokeStyle = '#000'; g.lineWidth = 0.8; g.beginPath(); g.arc(o.x, o.z, 3.2, 0, 7); g.fill(); g.stroke(); }
    for (const n of G.npcs || []) { if (n.dead) continue; g.fillStyle = n.cop ? '#3b7bff' : 'rgba(255,230,150,.9)'; g.beginPath(); g.arc(n.x, n.z, n.cop ? 2.2 : 1.4, 0, 7); g.fill(); }
    // ikonok: a fontos helyek mindig látszanak (a radar szélére húzva)
    g.setTransform(1, 0, 0, 1, 0, 0);
    const icon = (x, z, txt, col) => {
      let dx = (x - P.x) * zoom, dz = (z - P.z) * zoom; const c = Math.cos(G.cam.yaw), s = Math.sin(G.cam.yaw);
      let sx = dx * c - dz * s, sy = dx * s + dz * c; sx += CW / 2; sy += CH / 2 + 30;
      sx = Math.max(16, Math.min(CW - 16, sx)); sy = Math.max(16, Math.min(CH - 16, sy));
      g.fillStyle = col; g.beginPath(); g.arc(sx, sy, 14, 0, 7); g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
      g.fillStyle = '#fff'; g.font = '900 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, sx, sy + 1);
    };
    const pl = G.world.places;
    if (pl.shop) icon(pl.shop.door.x, pl.shop.door.z, '$', '#2f9e44');
    if (pl.range) icon(pl.range.door.x, pl.range.door.z, '⌖', '#d6336c');
    icon(0, 0, '🔥', '#c98a2c');
    // a játékos nyila
    g.translate(CW / 2, CH / 2 + 30); g.rotate(G.cam.yaw - P.ry + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
  });
}
