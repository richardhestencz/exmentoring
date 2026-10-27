// „Csak zene” nézetben a kép él: a lomb ring a szélben, a folyó folyik, a köd és a felhők sodródnak, a festett hangjegyek
// lebegnek, a csillagok és szentjánosbogarak pislognak (WebGL); fölötte néhány hulló levél, a lantból szálló hangjegyek, a levegőben
// lebegő fénypöttyök (2D vászon). Ingyenes, a 8K-s kép élessége megmarad: a vászon pontosan a képernyő pixeleire méretezett képet rajzol.
// A maszkok (img/focus-{day,night}-m1/m2.png, tools/focus_masks.py) a fekvő kép 1920x1080-as koordinátáiban vannak:
// m1: R folyó, G lomb, B köd; m2: R égbolt, G festett hangjegyek, B a folyás iránya. Az álló kép ennek a középső 2430/7680-as sávja.
(() => {
  const root = document.documentElement, view = document.getElementById('focusview'), bg = view && view.querySelector('.fbg');
  if (!bg) return;
  const cv = document.createElement('canvas'), pc = document.createElement('canvas');
  cv.className = pc.className = 'fmo'; cv.setAttribute('aria-hidden', 'true'); pc.setAttribute('aria-hidden', 'true');
  bg.after(cv, pc);
  // ha nincs WebGL2 (vagy a shader nem fordul), a kép áll, de a levelek, hangjegyek és fénypöttyök akkor is mozognak
  let gl = null, glErr = '', lastErr = '', frames = 0;
  try { gl = cv.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' }); } catch (e) { glErr = String(e); }
  if (!gl && !glErr) glErr = 'nincs webgl2';
  const ctx = pc.getContext('2d');
  if (!ctx) { cv.remove(); pc.remove(); return; }

  const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;
  const FS = `#version 300 es
precision highp float;
uniform sampler2D uImg, uM1, uM2;
uniform vec2 uRes, uOff, uSize, uCrop;
uniform float uT, uNight;
out vec4 o;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a*noise(p); p = p*2.03 + vec2(17.1, 9.2); a *= .5; } return s; }
vec3 img(vec2 uv){ return textureLod(uImg, uv, 0.).rgb; }
// Catmull-Rom (bicubic) mintavétel 9 bilineáris lépésből: a tört pixelnyi elmozdulás így nem mossa el a 8K-s részleteket
vec3 cr(vec2 uv){
  vec2 ts = vec2(textureSize(uImg, 0)), sp = uv*ts, tp = floor(sp - .5) + .5, f = sp - tp;
  vec2 w0 = f*(-.5 + f*(1. - .5*f)), w1 = 1. + f*f*(-2.5 + 1.5*f), w2 = f*(.5 + f*(2. - 1.5*f)), w3 = f*f*(-.5 + .5*f);
  vec2 w12 = w1 + w2, t0 = (tp - 1.)/ts, t3 = (tp + 2.)/ts, t12 = (tp + w2/w12)/ts;
  vec3 r = (img(vec2(t0.x, t0.y))*w0.x + img(vec2(t12.x, t0.y))*w12.x + img(vec2(t3.x, t0.y))*w3.x)*w0.y
         + (img(vec2(t0.x, t12.y))*w0.x + img(vec2(t12.x, t12.y))*w12.x + img(vec2(t3.x, t12.y))*w3.x)*w12.y
         + (img(vec2(t0.x, t3.y))*w0.x + img(vec2(t12.x, t3.y))*w12.x + img(vec2(t3.x, t3.y))*w3.x)*w3.y;
  return max(r, vec3(0.));
}
float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
void main(){
  vec2 uv = (vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) - uOff) / uSize;
  vec2 mu = vec2(uCrop.x + uv.x*uCrop.y, uv.y), p = mu*vec2(1920., 1080.);
  vec2 k = vec2(1./(1920.*uCrop.y), 1./1080.);   // egy 1920-as képpont uv-ben
  vec3 m1 = texture(uM1, mu).rgb, m2 = texture(uM2, mu).rgb;
  float river = m1.r, canopy = m1.g, mist = m1.b, sky = m2.r, notes = m2.g, t = uT;
  vec2 d = vec2(0.);
  if (canopy > .002) {   // a lomb: lassú ringás, széllökésekkel, fent erősebben
    float gust = .45 + .55*fbm(p*.0022 + vec2(t*.06, 0.));
    float hf = 1. - .45*smoothstep(120., 460., p.y);
    d += canopy*hf*gust*vec2(3.6*sin(t*.9 + p.y*.016 + p.x*.004) + 1.4*sin(t*1.9 + p.x*.03), 1.6*sin(t*.7 + p.x*.019));
  }
  if (notes > .002) d += notes*vec2(2.5*sin(t*.8 + p.y*.04), 5.*sin(t*1.2 + p.x*.05));
  if (mist > .002) d += mist*(vec2(fbm(p*.004 + vec2(t*.07, t*.02)), fbm(p*.004 + vec2(5.2, 1.3) - vec2(t*.04, 0.))) - .5)*vec2(22., 8.);
  if (sky > .002) d += sky*(vec2(fbm(p*.003 + vec2(t*.05, 0.)), fbm(p*.003 + vec2(3., t*.03))) - .5)*vec2(18., 6.);
  vec2 uvd = uv + d*k;
  vec3 c = dot(d, d) > 1e-6 ? cr(uvd) : img(uv);
  if (river > .002) {    // a folyó: két, fél ciklussal eltolt mintavétel a folyás irányában (flowmap), és halvány csillanások
    float a = m2.b*6.2831853 - 1.5707963; vec2 dir = vec2(cos(a), sin(a));
    float ph0 = fract(t*.22), ph1 = fract(t*.22 + .5);
    vec3 fl = mix(cr(uvd - dir*ph0*18.*k), cr(uvd - dir*ph1*18.*k), abs(1. - 2.*ph0));
    float g = pow(noise(p*.12 - dir*t*1.2)*noise(p*.21 + dir*t*.8 + 3.1), 3.)*2.;
    c = mix(c, fl + g*.4*mix(vec3(1., .85, .55), vec3(.75, .85, 1.), uNight), river);
  }
  if (mist > .002) c += mist*smoothstep(.42, .8, fbm(p*.0035 + vec2(-t*.06, t*.015)))*.16*mix(vec3(1., .86, .66), vec3(.62, .72, .92), uNight);
  // pislogás: a környezetüknél jóval világosabb pöttyök (csillagok, fénypöttyök, éjjel a szentjánosbogarak)
  float tw = smoothstep(.07, .25, lum(c) - lum(textureLod(uImg, uvd, 3.).rgb))*(1. - min(canopy*2., 1.))*max(sky, uNight*.8*(1. - river));
  c *= 1. + tw*(noise(p*.35 + vec2(t*.9, -t*.6))*1.2 - .6);
  o = vec4(c, 1.);
}`;
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  let prog, U = {}, MAXTEX = 8192, texs = [];
  if (gl) try { prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); }
  catch (e) { glErr = String(e && e.message || e).slice(0, 300); gl = null; }
  if (gl) try {
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['uImg', 'uM1', 'uM2', 'uRes', 'uOff', 'uSize', 'uCrop', 'uT', 'uNight']) U[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(U.uImg, 0); gl.uniform1i(U.uM1, 1); gl.uniform1i(U.uM2, 2);
  MAXTEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  texs = [gl.createTexture(), gl.createTexture(), gl.createTexture()];
  } catch (e) { glErr = String(e && e.message || e).slice(0, 300); gl = null; }
  if (!gl) { console.warn('fokusz-mozgas: WebGL nélkül megy:', glErr); cv.remove(); }
  function upload(unit, src, mip) {
    if (!gl) return;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[unit]);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, mip ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = bad; i.src = src; });

  // a jelenet: a CSS által épp választott kép (nappal/éjjel, fekvő/álló, a képernyőhöz illő méret) és a hozzá tartozó maszkok
  const S = { key: '', img: null, night: 0, crop: [0, 1], leafPts: [], ready: false };
  let L = null;   // elrendezés: vászon- és képméret eszközpixelben
  function current() {
    const night = root.dataset.theme === 'dark';
    const m = /url\(["']?([^"')]+)/.exec(getComputedStyle(bg).getPropertyValue(night ? '--fn' : '--fd'));
    return m && { url: new URL(m[1], location.href).href, night };
  }
  let loading = null;
  async function scene() {
    const c = current(); if (!c) return false;
    const key = c.url;
    if (S.key === key && S.ready) return true;
    if (loading && loading.key === key) return loading.p;
    const p = (async () => {
      const n = c.night ? 'night' : 'day';
      const [img, m1, m2] = await Promise.all([load(key), load(`/img/focus-${n}-m1.png`), load(`/img/focus-${n}-m2.png`)]);
      const tall = /-tall/.test(key);
      Object.assign(S, { key, img, night: c.night ? 1 : 0, crop: tall ? [2625 / 7680, 2430 / 7680] : [0, 1], ready: false });
      upload(1, m1, false); upload(2, m2, false);
      // a levelek a lomb (m1 zöld) erős pontjaiból indulnak
      const t = document.createElement('canvas'); t.width = 240; t.height = 135; const x = t.getContext('2d'); x.drawImage(m1, 0, 0, 240, 135);
      const d = x.getImageData(0, 0, 240, 135).data; S.leafPts = [];
      for (let i = 0; i < 240 * 135; i++) if (d[i * 4 + 1] > 200) S.leafPts.push([(i % 240) * 8 + 4, Math.floor(i / 240) * 8 + 4]);
      L = null; S.ready = true; return true;
    })().catch((e) => { lastErr = String(e && (e.message || e.type) || e).slice(0, 200); console.warn('fokusz-mozgas:', e); return false; }).finally(() => { loading = null; });
    loading = { key, p }; return p;
  }
  function layout() {
    const cw = view.clientWidth, ch = view.clientHeight; if (!cw || !ch || !S.img) return false;
    let dpr = devicePixelRatio || 1; if (cw * ch * dpr * dpr > 16e6) dpr = Math.sqrt(16e6 / (cw * ch));
    const iw = S.img.naturalWidth, ih = S.img.naturalHeight, s = Math.max(cw / iw, ch / ih);
    let dw = Math.round(iw * s * dpr), dh = Math.round(ih * s * dpr);
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    const key = [W, H, S.key].join();
    if (L && L.key === key) return true;
    // a kép pontosan a kirajzolt méretre kicsinyítve (a böngésző jó minőségű szűrőjével), így 1:1-ben mintavételezünk: éles marad
    const f = Math.min(1, MAXTEX / Math.max(dw, dh)); const tw = Math.round(dw * f), th = Math.round(dh * f);
    if (gl) {
      const t = document.createElement('canvas'); t.width = tw; t.height = th;
      const x = t.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(S.img, 0, 0, tw, th);
      upload(0, t, true); t.width = t.height = 0;
    }
    cv.width = pc.width = W; cv.height = pc.height = H;
    L = { key, W, H, dw, dh, ox: Math.round((W - dw) / 2), oy: H - dh, unit: dh / 1080 };   // egész pixelre: a texel a pixelre esik, nincs elmosás
    if (gl) gl.viewport(0, 0, W, H);
    return true;
  }
  // a fekvő kép 1920x1080-as koordinátáiból a vászon pixeleire
  const toX = (X) => L.ox + ((X / 1920 - S.crop[0]) / S.crop[1]) * L.dw, toY = (Y) => L.oy + (Y / 1080) * L.dh;

  // részecskék: levelek, hangjegyek, fénypöttyök
  const rnd = (a, b) => a + Math.random() * (b - a);
  let leaves = [], notes = [], motes = [], nextLeaf = 0, nextNote = 0;
  const GLYPH = ['♪', '♫', '♩', '♬'];
  function spawn(t) {
    if (t > nextLeaf && leaves.length < 8 && S.leafPts.length) {
      const [X, Y] = S.leafPts[Math.floor(Math.random() * S.leafPts.length)];
      leaves.push({ X, Y, t0: t, vy: rnd(14, 24), dr: rnd(-6, 14), A: rnd(14, 30), w: rnd(.6, 1.1), ph: rnd(0, 6.3), fw: rnd(1.2, 2.4), r0: rnd(0, 6.3), len: rnd(7, 10), hue: rnd(36, 48) });
      nextLeaf = t + rnd(1.2, 3.5);
    }
    if (t > nextNote && notes.length < 8) {
      notes.push({ X: 1064 + rnd(-8, 8), Y: 812 + rnd(-6, 6), t0: t, life: rnd(6.5, 8.5), vx: rnd(4, 10), vy: rnd(-20, -14), A: rnd(6, 12), w: rnd(.8, 1.4), ph: rnd(0, 6.3), g: GLYPH[Math.floor(Math.random() * 4)], sz: rnd(24, 32), rot: rnd(-.25, .25) });
      nextNote = t + rnd(1.1, 2.2);
    }
    const want = S.night ? 18 : 12;
    while (motes.length < want) motes.push({ X: rnd(0, 1920), Y: S.night ? rnd(560, 1040) : rnd(250, 700), vx: rnd(-4, 4), vy: rnd(-3, 3), w: rnd(.5, 1.3), ph: rnd(0, 6.3), r: rnd(1.2, 2.2) });
  }
  function particles(t, dt) {
    ctx.clearRect(0, 0, L.W, L.H);
    const u = L.unit;
    // fénypöttyök: lassan bolyonganak és pulzálnak (éjjel szentjánosbogarak, nappal porszemek a napfényben)
    for (const m of motes) {
      m.vx += rnd(-1, 1) * dt * 3; m.vy += rnd(-1, 1) * dt * 3; m.vx *= .99; m.vy *= .99;
      m.X += m.vx * dt; m.Y += m.vy * dt;
      if (m.X < -20 || m.X > 1940 || m.Y < 200 || m.Y > 1080) { m.X = rnd(0, 1920); m.Y = S.night ? rnd(560, 1040) : rnd(250, 700); }
      const a = (S.night ? .2 + .8 * Math.max(0, Math.sin(t * m.w + m.ph)) ** 2 : .12 + .2 * (.5 + .5 * Math.sin(t * m.w + m.ph)));
      const x = toX(m.X), y = toY(m.Y), R = m.r * u * (S.night ? 4 : 3);
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, S.night ? `rgba(255,236,150,${a})` : `rgba(255,236,190,${a})`); g.addColorStop(.25, S.night ? `rgba(255,210,90,${a * .5})` : `rgba(255,220,150,${a * .35})`); g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.fill();
    }
    // levelek: ingázva, forogva hullanak
    leaves = leaves.filter((f) => {
      const age = t - f.t0, Y = f.Y + f.vy * age;
      if (Y > 1090 || age > 40) return false;
      const X = f.X + f.dr * age + f.A * Math.sin(f.w * age + f.ph);
      const a = Math.min(1, age / 1.5) * Math.min(1, (1080 - Y) / 120) * .9;
      const x = toX(X), y = toY(Y), l = f.len * u;
      ctx.save(); ctx.translate(x, y); ctx.rotate(f.r0 + .9 * Math.sin(f.w * age + f.ph + 1.2)); ctx.scale(Math.cos(age * f.fw), 1);
      ctx.globalAlpha = a;
      if (S.night) { ctx.shadowColor = 'rgba(255,200,90,.8)'; ctx.shadowBlur = 5 * u; }
      ctx.fillStyle = `hsl(${f.hue},${S.night ? 95 : 82}%,${S.night ? 62 : 52}%)`;
      ctx.beginPath(); ctx.moveTo(-l, 0); ctx.quadraticCurveTo(0, -l * .55, l, 0); ctx.quadraticCurveTo(0, l * .55, -l, 0); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = `hsla(${f.hue - 8},70%,28%,.55)`; ctx.lineWidth = Math.max(.6, .35 * u);
      ctx.beginPath(); ctx.moveTo(-l * 1.25, 0); ctx.lineTo(l * .9, 0); ctx.stroke();
      ctx.restore();
      return true;
    });
    // hangjegyek: a lant fejéből szállnak fel, lassan, ringatózva, halványulva
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    notes = notes.filter((n) => {
      const age = t - n.t0; if (age > n.life) return false;
      const X = n.X + n.vx * age + n.A * Math.sin(n.w * age + n.ph), Y = n.Y + n.vy * age;
      const a = Math.min(1, age / 1.2) * Math.min(1, (n.life - age) / 2.5) * .9;
      ctx.save(); ctx.translate(toX(X), toY(Y)); ctx.rotate(n.rot + .15 * Math.sin(n.w * age));
      ctx.globalAlpha = a; ctx.font = `${n.sz * u}px "Apple Symbols","Segoe UI Symbol","Noto Music",serif`;
      ctx.shadowColor = 'rgba(255,190,80,.95)'; ctx.shadowBlur = 9 * u; ctx.fillStyle = '#ffd56e'; ctx.fillText(n.g, 0, 0);
      ctx.restore();
      return true;
    });
  }

  let raf = 0, last = 0, t0 = performance.now(), running = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 32) return;   // ~30 kép/mp elég ehhez a lassú mozgáshoz
    const dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
    if (!S.ready || !layout()) return;
    const t = (now - t0) / 1000;
    if (gl) {
      gl.uniform2f(U.uRes, L.W, L.H); gl.uniform2f(U.uOff, L.ox, L.oy); gl.uniform2f(U.uSize, L.dw, L.dh);
      gl.uniform2f(U.uCrop, S.crop[0], S.crop[1]); gl.uniform1f(U.uT, t); gl.uniform1f(U.uNight, S.night);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    frames++;
    spawn(t); particles(t, dt);
    view.classList.add('fmoon');
  }
  let stopTimer = 0;
  async function sync() {
    const zen = root.classList.contains('focus');   // a „Csak zene” nézetben mindig fut
    if (zen) {
      clearTimeout(stopTimer);
      if (!(await scene())) return;
      if (!root.classList.contains('focus')) return;
      if (!running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    } else if (running) {
      view.classList.remove('fmoon');
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => { cancelAnimationFrame(raf); running = false; leaves = []; notes = []; }, 2200);   // a halványulás után áll le
    }
  }
  new MutationObserver(() => { if (running || root.classList.contains('focus')) { const c = current(); if (c && c.url !== S.key) { S.ready = false; view.classList.remove('fmoon'); motes = []; } sync(); } })
    .observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  addEventListener('resize', () => { if (!running) return; const c = current(); if (c && c.url !== S.key) { S.ready = false; motes = []; } sync(); });
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glErr = 'context lost'; gl = null; cv.remove(); });
  // visszajelzés a szervernek (a szerver naplójába), hogy egy-egy gépen miért nem mozog: böngésző, WebGL, hiba, lefutott képkockák
  const diag = (when) => { try { if (typeof send === 'function') send({ t: 'fmodiag', d: JSON.stringify({ v: 3, when, ua: navigator.userAgent, gl: !!gl, glErr, lastErr, focus: root.classList.contains('focus'), running, frames, live: view.classList.contains('fmoon'), dpr: devicePixelRatio, vw: view.clientWidth, vh: view.clientHeight, img: S.key.split('/').pop(), hidden: document.hidden }) }); } catch {} };
  setTimeout(() => diag('8s'), 8000); setTimeout(() => diag('30s'), 30000);
  sync();
})();
