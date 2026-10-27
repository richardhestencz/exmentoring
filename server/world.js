// A 3D tisztás: ki merre jár a saját mosómedvéjével. A helyzet tartós: kilépés után a mosómedve ott marad, ahol hagyták.
const R = 7.6;                    // a tisztás járható sugara
const SPOTS = 16;                 // a leülős helyek száma (a kliens számolja ki őket a tárgyakból)
const ACTS = ['idle', 'walk', 'run'];

const empty = () => ({});         // becenév -> { x, z, ry, act, spot: szám vagy null, on: bent van-e, at }
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// belépés: ha már járt itt, onnan folytatja; különben a tűz mellett jelenik meg
function join(W, nick, now = Date.now()) {
  if (!W[nick]) {
    if (Object.keys(W).length >= 200) return 'Túl sokan vannak a tisztáson.';
    const a = Math.random() * Math.PI * 2;
    W[nick] = { x: Math.sin(a) * 2.6, z: 0.6 + Math.cos(a) * 2.6, ry: a + Math.PI, act: 'idle', spot: null, on: true, at: now };
  }
  Object.assign(W[nick], { on: true, at: now });
  return null;
}

function move(W, nick, m, now = Date.now()) {
  const me = W[nick];
  if (!me || !me.on) return 'Előbb lépj be a tisztásra.';
  if (!num(m.x) || !num(m.z) || !num(m.ry)) return 'Hibás helyzet.';
  const d = Math.hypot(m.x, m.z), k = d > R ? R / d : 1;
  Object.assign(me, { x: m.x * k, z: m.z * k, ry: m.ry % (Math.PI * 2), act: ACTS.includes(m.act) ? m.act : 'idle', spot: null, at: now });
  return null;
}

function sit(W, nick, spot, now = Date.now()) {
  const me = W[nick];
  if (!me || !me.on) return 'Előbb lépj be a tisztásra.';
  if (!(Number.isInteger(spot) && spot >= 0 && spot < SPOTS)) return 'Ismeretlen hely.';
  const other = Object.keys(W).find((n) => n !== nick && W[n].spot === spot);
  if (other) return `Ezen a helyen már ${other} ül.`;
  Object.assign(me, { spot, act: 'idle', at: now });
  return null;
}

// kilépés: a mosómedve ott marad (ülve vagy állva), csak „nincs bent” lesz
function leave(W, nick) {
  if (W[nick]) { W[nick].on = false; if (W[nick].act !== 'idle') W[nick].act = 'idle'; }
}

const view = (W) => Object.fromEntries(Object.entries(W).map(([n, v]) => [n, {
  x: +v.x.toFixed(2), z: +v.z.toFixed(2), ry: +v.ry.toFixed(2), act: v.act, spot: v.spot, on: v.on }]));

module.exports = { empty, join, move, sit, leave, view, R, SPOTS };
