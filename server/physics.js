// Valódi (egyszerűsített) 3D golyó-fizika a rulettkerékhez. A szerveren fut, így minden kliens
// ugyanazt a pályát játssza vissza, és az eredmény a fizikából jön, nem előre sorsolt.
const crypto = require('crypto');
const { ORDER } = require('./game');

const TAU = Math.PI * 2, STEP = TAU / 37;
const R_IN = 0.58, R_OUT = 0.95, BALL_R = 0.048;
const G = 31.6;                                   // gravitáció a jelenet egységeiben (1 egység ≈ 0,31 m)
// A rekeszfal alacsony, lekerekített gerinc (kapszula): épp csak benntartja a golyót, közben sokat pattog
const FRET = { L: R_OUT - R_IN - 0.005, R: 0.015, Y: 0.018, RC: (R_IN + R_OUT) / 2 };
const WALL_R = 1.17, INNER_R = R_IN + 0.07;
const DT = 1 / 1200, HZ = 60, TW = 13, T_MAX = 30, LAUNCH = 0.4;
const DEFLECTORS = Array.from({ length: 8 }, (_, k) => k * TAU / 8 + 0.2);
// a terelők lapos domborulatok: egy nagy gömb, aminek csak a teteje áll ki a pályából, így a golyót inkább megdobják
const DEF_R = 1.07, DEF_RAD = 0.045, DEF_SINK = 0.036;

const rnd = () => crypto.randomBytes(4).readUInt32LE(0) / 4294967296;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

// Felület: homorú rekesz-fenék (a golyó a rekesz közepe felé gurul), perem, lejtős pálya
const pocketH = (r) => 0.03 * ((r - 0.76) / 0.19) ** 2;
const H = (r) => (r <= R_OUT ? pocketH(r) : r <= 1.0 ? 0.03 + (r - R_OUT) / (1.0 - R_OUT) * 0.04 : r <= 1.2 ? 0.07 + (r - 1) * 0.475 : 0.165 + (r - 1.2) * 0.2);
const dH = (r) => (r <= R_OUT ? 0.06 * (r - 0.76) / 0.0361 : r <= 1.0 ? 0.8 : r <= 1.2 ? 0.475 : 0.2);

const wheelW = (p, t) => p.w0 * Math.max(0, 1 - t / TW);
const wheelAlpha = (p, t) => { const x = Math.min(t, TW); return p.alpha0 - p.w0 * (x - x * x / (2 * TW)); };

function simulate(rest, rng = rnd) {
  const p = { w0: 2.2 + rng() * 1.0, alpha0: rest.alpha };
  const omega = -(8.5 + rng() * 2.5);              // a golyó szögsebessége indításkor (a kerékkel ellentétes)
  const track = [], hits = [];
  let lastHit = -1, aPrev = rest.a;
  const sample = (x, y, z) => {
    let a = Math.atan2(z, x); a = aPrev + ((a - aPrev + Math.PI) % TAU + TAU) % TAU - Math.PI; aPrev = a;
    track.push(Math.round(a * 1000), Math.round(Math.hypot(x, z) * 1000), Math.round(y * 1000));
  };
  const hit = (t, v) => { if (t - lastHit > 0.03 && hits.length < 250) { hits.push([Math.round(t * 1000), Math.round(clamp(v / 6, 0.1, 1) * 100)]); lastHit = t; } };

  // 1) kézi indítás (kinematikus): a nyugvó pozícióból a lejtős pályára
  const rT = 1.15, yT = H(rT) + BALL_R * Math.sqrt(1 + dH(rT) ** 2);
  let t = 0, nextSample = 0;
  for (; t < LAUNCH; t += 1 / HZ) {
    const s = smooth(t / LAUNCH), a = rest.a + omega * 0.5 * t * t / LAUNCH, r = rest.r + (rT - rest.r) * s;
    sample(r * Math.cos(a), rest.y + (yT - rest.y) * s + 0.1 * Math.sin(Math.PI * s), r * Math.sin(a));
  }
  const aL = rest.a + omega * 0.5 * LAUNCH;
  let x = rT * Math.cos(aL), z = rT * Math.sin(aL), y = yT;
  let vx = -Math.sin(aL) * omega * rT, vz = Math.cos(aL) * omega * rT, vy = 0;
  t = LAUNCH; nextSample = t;

  let still = 0, settledAt = null;
  for (; t < T_MAX; t += DT) {
    const alpha = wheelAlpha(p, t), W = wheelW(p, t);
    vy -= G * DT; x += vx * DT; y += vy * DT; z += vz * DT;
    let r = Math.hypot(x, z), th = Math.atan2(z, x), c = Math.cos(th), sn = Math.sin(th);

    // külső fal / belső kúp
    if (r > WALL_R) { const vr = vx * c + vz * sn; x = WALL_R * c; z = WALL_R * sn; if (vr > 0) { vx -= 1.25 * vr * c; vz -= 1.25 * vr * sn; } r = WALL_R; }
    if (r < INNER_R) { const vr = vx * c + vz * sn; x = INNER_R * c; z = INNER_R * sn; if (vr < 0) { vx -= 1.3 * vr * c; vz -= 1.3 * vr * sn; } r = INNER_R; }

    // felület (lejtős pálya + kerék síkja)
    const s = dH(r), yc = H(r) + BALL_R * Math.sqrt(1 + s * s);
    let contact = false;
    if (y <= yc + 1e-4) {
      contact = true; y = yc;
      const inv = 1 / Math.sqrt(1 + s * s), nx = -s * c * inv, ny = inv, nz = -s * sn * inv;
      const vn = vx * nx + vy * ny + vz * nz;
      if (vn < 0) {
        const e = -vn > 0.5 ? 0.52 : 0, k = (1 + e) * vn;
        vx -= k * nx; vy -= k * ny; vz -= k * nz;
        if (-vn > 0.4) hit(t, -vn);
      }
      // súrlódás a felülethez képest (a kerék viszi a golyót, a pályán csak lassan fékez)
      const onWheel = r <= R_OUT, vsx = onWheel ? -W * z : 0, vsz = onWheel ? W * x : 0;
      let rx = vx - vsx, ry = vy, rz = vz - vsz;
      const rn = rx * nx + ry * ny + rz * nz;
      let tx = rx - rn * nx, ty = ry - rn * ny, tz = rz - rn * nz;
      const f = Math.exp(-(onWheel ? 1.4 : 0.12) * DT), tl = Math.hypot(tx, ty, tz);
      const dec = onWheel ? 0 : Math.min(tl, 0.3 * DT);
      const sc = tl > 1e-9 ? f * (1 - dec / tl) : 0;
      vx = vsx + tx * sc + rn * nx; vy = ty * sc + rn * ny; vz = vsz + tz * sc + rn * nz;
    }

    // terelő rombuszok a lejtőn
    for (const da of DEFLECTORS) {
      const dx0 = DEF_R * Math.cos(da), dz0 = DEF_R * Math.sin(da), dy0 = H(DEF_R) - DEF_SINK;
      const dx = x - dx0, dy = y - dy0, dz = z - dz0, d = Math.hypot(dx, dy, dz), min = BALL_R + DEF_RAD;
      if (d < min && d > 1e-9) {
        const nx = dx / d, ny = dy / d, nz = dz / d;
        x += nx * (min - d); y += ny * (min - d); z += nz * (min - d);
        const vn = vx * nx + vy * ny + vz * nz;
        if (vn < 0) { vx -= 1.35 * vn * nx; vy -= 1.35 * vn * ny; vz -= 1.35 * vn * nz; hit(t, -vn); }
      }
    }

    // rekeszfalak (a kerékkel forognak): gömb–kapszula ütközés
    if (r > R_IN - 0.06 && r < R_OUT + 0.06 && y < FRET.Y + FRET.R + BALL_R + 0.02) {
      const thl = th + alpha, kf = Math.floor((thl + Math.PI / 2 + STEP / 2) / STEP);
      for (let dk = -1; dk <= 1; dk++) {
        const k = ((kf + dk) % 37 + 37) % 37, phi = k * STEP - Math.PI / 2 - STEP / 2 - alpha;
        const ux = Math.cos(phi), uz = Math.sin(phi);
        const cx0 = FRET.RC * ux, cz0 = FRET.RC * uz;
        const lx = clamp((x - cx0) * ux + (z - cz0) * uz, -FRET.L / 2, FRET.L / 2);
        const qx = cx0 + lx * ux, qz = cz0 + lx * uz;           // a tengely legközelebbi pontja
        let dx = x - qx, dy = y - FRET.Y, dz = z - qz, d = Math.hypot(dx, dy, dz);
        const min = BALL_R + FRET.R;
        if (d >= min) continue;
        if (d < 1e-9) { dx = 0; dy = 1; dz = 0; d = 1; }
        const nx = dx / d, ny = dy / d, nz = dz / d, pen = min - Math.hypot(dx, dy, dz);
        x += nx * pen; y += ny * pen; z += nz * pen;
        const vfx = -W * qz, vfz = W * qx;
        const vn = (vx - vfx) * nx + vy * ny + (vz - vfz) * nz;
        if (vn < 0) { const k2 = 1.92 * vn; vx -= k2 * nx; vy -= k2 * ny; vz -= k2 * nz; if (-vn > 0.5) hit(t, -vn); }
      }
    }

    if (t >= nextSample) { sample(x, y, z); nextSample += 1 / HZ; }

    // megállt-e (a kerékhez képest)?
    if (t > 3 && contact && Math.hypot(x, z) < R_OUT - 0.05) {
      const W2 = wheelW(p, t), rvx = vx + W2 * z, rvz = vz - W2 * x;
      if (Math.hypot(rvx, rvz) < 0.12 && Math.abs(vy) < 0.3) { still += DT; if (settledAt === null && still > 0.5) settledAt = t; }
      else { still = 0; if (settledAt !== null && t - settledAt > 0.05) settledAt = null; }
    } else still = 0;
    if (settledAt !== null && t >= Math.max(settledAt + 0.6, TW + 0.3)) break;
  }

  const tEnd = Math.min(t, T_MAX), alphaEnd = wheelAlpha(p, tEnd);
  const r = Math.hypot(x, z), thl = Math.atan2(z, x) + alphaEnd;
  const idx = ((Math.round((thl + Math.PI / 2) / STEP) % 37) + 37) % 37;
  const norm = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;
  return {
    result: ORDER[idx], durationMs: Math.round(tEnd * 1000), settled: settledAt !== null,
    w0: p.w0, tw: TW, alpha0: p.alpha0, hz: HZ, track, hits,
    rest: { alpha: norm(alphaEnd), a: norm(Math.atan2(z, x)), r, y },
  };
}

const DEFAULT_REST = { alpha: 0, a: -Math.PI / 2, r: (R_IN + R_OUT) / 2 - 0.03, y: BALL_R };
module.exports = { simulate, DEFAULT_REST, BALL_R, FRET, wheelAlpha, TW, H, pocketH };
