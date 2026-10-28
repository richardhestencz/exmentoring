// Az aréna hangjai: minden WebAudio-val szintetizált (nincs letöltés), önálló modul.
let AC = null, armed = false;   // csak felhasználói kattintás után szólal meg (különben a böngésző tiltja)
const ctx = () => (AC ||= new (window.AudioContext || window.webkitAudioContext)());
export function unlock() { armed = true; try { ctx().resume(); } catch {} }
function noise(len, lp, vol, pow, hp = 0) {
  const c = ctx(), t = c.currentTime, b = c.createBuffer(1, Math.max(1, c.sampleRate * len | 0), c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** pow;
  const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
  const g = c.createGain(); g.gain.value = vol; s.connect(f); let n = f;
  if (hp) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; f.connect(h); n = h; }
  n.connect(g); g.connect(c.destination); s.start(t);
}
function tone(f0, f1, len, type, vol, delay = 0) {
  const c = ctx(), t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = type; o.connect(g); g.connect(c.destination);
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len); o.start(t); o.stop(t + len + 0.02);
}
// kind: w0/w1/w2 (fegyverek), hit, head, kill, hurt, reload, empty, jump, land, step, spawn, tick; vol: 0..1 (távolsággal csökken)
export function sfx(kind, vol = 1) {
  if (!armed) return;
  try {
    if (kind === 'w0') { noise(0.16, 2600, 0.5 * vol, 4); tone(240, 90, 0.1, 'square', 0.1 * vol); }
    else if (kind === 'w1') { noise(0.12, 3400, 0.42 * vol, 5); tone(180, 70, 0.07, 'sawtooth', 0.08 * vol); }
    else if (kind === 'w2') { noise(0.7, 1500, 0.8 * vol, 2.2); tone(110, 40, 0.35, 'sine', 0.35 * vol); }
    else if (kind === 'hit') tone(1500, 1100, 0.05, 'square', 0.1 * vol);
    else if (kind === 'head') { tone(2200, 1800, 0.08, 'square', 0.14 * vol); tone(1100, 900, 0.1, 'triangle', 0.1 * vol, 0.04); }
    else if (kind === 'kill') { tone(660, 660, 0.09, 'triangle', 0.2 * vol); tone(990, 990, 0.16, 'triangle', 0.2 * vol, 0.08); }
    else if (kind === 'hurt') { tone(200, 90, 0.14, 'sawtooth', 0.16 * vol); noise(0.1, 800, 0.25 * vol, 2); }
    else if (kind === 'reload') { tone(500, 380, 0.05, 'square', 0.08 * vol); tone(700, 520, 0.05, 'square', 0.08 * vol, 0.5); }
    else if (kind === 'empty') tone(300, 280, 0.04, 'square', 0.08 * vol);
    else if (kind === 'jump') noise(0.08, 900, 0.1 * vol, 1.5);
    else if (kind === 'land') noise(0.12, 500, 0.22 * vol, 2);
    else if (kind === 'step') noise(0.05, 600, 0.05 * vol, 2, 200);
    else if (kind === 'spawn') { tone(300, 900, 0.25, 'triangle', 0.12 * vol); }
    else if (kind === 'tick') tone(900, 600, 0.04, 'square', 0.06 * vol);
  } catch {}
}
