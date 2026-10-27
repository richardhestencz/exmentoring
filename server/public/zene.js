// Közös zene: egy bekötött YouTube-lejátszási lista (a számokat a YouTube-on teszik bele), sorban, magától megy; mindenki ugyanott tart.
// A lejátszó egy oldalsó panelben van (a fejléc „🎵 Zene” gombja nyitja), bezárva is szól. Az ajtó nyitására mindenkinél lehalkul.
(() => {
  const $ = (id) => document.getElementById(id);
  const drawer = $('mdrawer');
  if (!drawer) return;
  const DUCK_LEVEL = 0.15, DUCK_DOWN_MS = 500, DUCK_UP_MS = 2000, DUCK_HOLD_MS = 15000, DRIFT_S = 0.35, RESYNC_MS = 2000, SEEK_LEAD = 0.1;   // ennyinél nagyobb eltérésnél igazít; a tekerés után ennyivel később szól újra
  const M = { st: null, off: 0, clock: false, player: null, ready: false, joined: false, vol: Number(safeGet('mvol')) || 60,
    duckOn: false, holdUntil: 0, level: 1, loadedV: '', loadedRev: -1, errs: [], noteT: 0, endedRev: -1 };
  const synced = () => Date.now() + M.off;       // a szerver ideje
  const expected = () => { const s = M.st; return s ? (s.paused ? s.pos : Math.max(0, synced() - s.startedAt)) / 1000 : 0; };
  const cur = () => (M.st && M.st.items.length ? M.st.items[M.st.cur] : null);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function note(msg, ms = 6000) {
    const n = $('mnote'); n.textContent = msg || '';
    clearTimeout(M.noteT); if (msg && ms) M.noteT = setTimeout(() => { n.textContent = ''; }, ms);
  }

  /* ---- a panel ---- */
  function openDrawer(on) {
    drawer.classList.toggle('open', on); drawer.setAttribute('aria-hidden', on ? 'false' : 'true');
    $('mbtn').setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) setTimeout(() => $('mjoin').focus({ preventScroll: true }), 300);
  }
  $('mbtn').onclick = () => openDrawer(!drawer.classList.contains('open'));
  $('mclose').onclick = () => openDrawer(false);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) openDrawer(false); });

  /* ---- YouTube API ---- */
  function loadApi() {
    if (window.YT && YT.Player) return makePlayer();
    window.onYouTubeIframeAPIReady = makePlayer;
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    s.onerror = () => note('A YouTube-lejátszó nem töltődött be (hálózat vagy tartalomblokkoló?).', 0);
    document.head.appendChild(s);
  }
  function makePlayer() {
    if (M.player || !(window.YT && YT.Player)) return;
    M.player = new YT.Player($('ytp'), {
      width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, controls: 1, disablekb: 1, modestbranding: 1, origin: location.origin },
      events: { onReady: () => { M.ready = true; applyVolume(); sync(true); }, onStateChange, onError },
    });
  }

  /* ---- hangerő és ajtós halkítás ---- */
  function applyVolume() {
    if (!M.ready || !M.player) return;
    try { M.player.setVolume(Math.round(M.vol * M.level)); } catch {}
  }
  setInterval(() => {   // halkítás léptetése: lefelé 0,5 s, felfelé 2 s
    const target = (M.duckOn || Date.now() < M.holdUntil) ? DUCK_LEVEL : 1;
    if (M.level === target) return;
    const step = (1 - DUCK_LEVEL) * 50 / (target < M.level ? DUCK_DOWN_MS : DUCK_UP_MS);
    M.level = target < M.level ? Math.max(target, M.level - step) : Math.min(target, M.level + step);
    applyVolume();
  }, 50);
  function duck(on, fromEvent) {
    if (on) { if (!M.duckOn) { M.duckOn = true; M.holdUntil = fromEvent ? Date.now() + DUCK_HOLD_MS : 0; } }
    else M.duckOn = false;
    $('mduck').hidden = !on;
  }

  /* ---- a közös állapot követése ---- */
  function onStateChange(e) {
    const s = M.st; if (!s) return;
    if (e.data === 0 && M.joined && M.endedRev !== s.rev) { M.endedRev = s.rev; send({ t: 'music-ended', rev: s.rev }); }   // vége: a következő jön
    if (e.data === 1) { M.errs = M.errs.filter((t) => Date.now() - t < 10000); setTimeout(() => seekIfOff(expected()), 400); }   // indulás, puffer, reklám után azonnal a közös helyre
    paintPlay();
  }
  function onError(e) {
    const c = e.data, s = M.st;
    M.errs.push(Date.now());
    if ([100, 101, 150, 153].includes(c)) note('Ennél a számnál le van tiltva a beágyazás, átugrom.');
    else note(`A lejátszó hibát jelzett (${c}), átugrom.`);
    if (!s || !M.joined || M.errs.length >= 6) { if (s && M.errs.length >= 6) note('Több szám egymás után nem játszható le; ellenőrizd a listát.', 0); return; }
    if (M.endedRev !== s.rev) { M.endedRev = s.rev; send({ t: 'music-ended', rev: s.rev }); }
  }

  // a lejátszót a szerver állapotához igazítja; force: mindenképp betölt
  function sync(force) {
    const s = M.st; if (!s || !M.ready || !M.player) return;
    const it = cur();
    if (!it) { try { M.player.stopVideo(); } catch {} M.loadedV = ''; return; }
    if (!M.joined) {      // bekapcsolásig csak a borító (a böngésző hanggal nem enged automatikus indítást)
      if (M.loadedV !== it.v) { M.loadedV = it.v; M.loadedRev = -1; try { M.player.cueVideoById(it.v); } catch {} }
      return;
    }
    const pos = expected();
    if (force || M.loadedRev !== s.rev || M.loadedV !== it.v) {
      if (M.loadedV === it.v && !force) seekIfOff(pos);   // ugyanaz a szám (pl. csak a lista változott): csak igazítunk
      else { try { M.player.loadVideoById({ videoId: it.v, startSeconds: pos }); } catch {} }
      M.loadedV = it.v; M.loadedRev = s.rev;
    }
    try { s.paused ? M.player.pauseVideo() : (M.player.getPlayerState() === 2 ? M.player.playVideo() : 0); } catch {}
    applyVolume(); paintPlay();
  }
  function seekIfOff(pos) {
    if (!M.ready || !M.joined || !M.st || M.st.paused) return;
    try {
      const st = M.player.getPlayerState();
      if (st !== 1 && st !== 3) return;                  // hirdetés vagy puffer alatt nem tekergetünk
      if (Math.abs(M.player.getCurrentTime() - pos) > DRIFT_S) M.player.seekTo(pos + SEEK_LEAD, true);
    } catch {}
  }
  setInterval(() => { if (M.joined && cur()) seekIfOff(expected()); }, RESYNC_MS);

  // a szerver üzenetei (a főoldal onmessage-e hívja)
  // pontos óra: oda-vissza időmérés a szerverrel; a legkisebb késésű mérés a mérvadó (a késés felét beszámítva)
  const pings = [];
  function ping() { send({ t: 'music-ping', c: Date.now() }); }
  function pong(m) {
    const now = Date.now(), rtt = now - m.c; if (rtt < 0 || rtt > 5000) return;
    pings.push({ rtt, off: m.s - (m.c + rtt / 2) }); if (pings.length > 10) pings.shift();
    const best = pings.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    M.off = best.off; M.clock = true;
  }
  let pingN = 0; setInterval(() => { if (pingN < 6 || pingN % 15 === 0) ping(); pingN++; }, 1000);   // indításkor sűrűn, aztán 15 s-onként
  window.MusicHook = (m) => {
    if (m.t === 'music-duck') return duck(m.on, true);
    if (m.t === 'music-pong') return pong(m);
    const mu = m.t === 'state' || m.t === 'music' ? m.music : null;
    if (!mu || !Array.isArray(mu.items)) return;
    const changed = !M.st || M.st.rev !== mu.rev || M.st.fetchedAt !== mu.fetchedAt || M.st.link !== mu.link;
    if (!M.clock) M.off = mu.now - Date.now();   // amíg nincs pontos mérés, az üzenet ideje szerint
    M.st = mu;
    duck(mu.duck, false);
    if (changed) { paint(); sync(false); }
  };

  /* ---- felület ---- */
  let changing = false;
  function paint() {
    const s = M.st, it = cur(), has = !!(s && s.list);
    $('mempty').innerHTML = has ? 'A lista még üres, vagy most töltődik.<br>Tegyél bele egy számot a YouTube-on!' : 'Még nincs bekötve közös lista.<br>Illeszd be lent egy YouTube-lejátszási lista linkjét!';
    $('mempty').hidden = !!it;
    $('mnow').textContent = it ? it.title : '';
    $('mby').textContent = it ? `${s.cur + 1}. / ${s.items.length}` : '';
    $('mlinkbox').hidden = !has || changing;
    $('mform').hidden = has && !changing;
    if (has) { $('mltitle').textContent = s.title || 'YouTube-lista'; $('mlopen').href = s.link; }
    if (s && s.err) note('A lista frissítése nem sikerült: ' + s.err, 0);
    else if ($('mnote').textContent.startsWith('A lista frissítése')) note('');
    $('mcount').textContent = s && s.items.length ? `A lista (${s.items.length} szám, a végén újrakezdi)` : 'A lista';
    $('mlist').innerHTML = s && s.items.length ? s.items.map((x, i) => `<li class="${i === s.cur ? 'cur' : ''}"><span class="n">${i === s.cur ? '▶' : i + 1}</span>`
      + `<button type="button" class="t" data-play="${i}" title="Lejátszás most (mindenkinek)"><b>${esc(x.title)}</b></button></li>`).join('')
      : `<li class="mlempty">${has ? 'Még nincs szám a listában.' : 'Nincs bekötött lista.'}</li>`;
    paintPlay();
  }
  function paintPlay() {
    const s = M.st, has = !!cur();
    $('mjoin').textContent = M.joined ? 'Zene kikapcsolása (nálad)' : '▶ Zene bekapcsolása';
    $('mjoin').classList.toggle('on', M.joined);
    $('mpause').textContent = s && s.paused ? '▶' : '⏸';
    $('mpause').title = s && s.paused ? 'Folytatás (mindenkinek)' : 'Szünet (mindenkinek)';
    for (const b of ['mprev', 'mnext', 'mpause']) $(b).disabled = !has;
    $('mbtn').classList.toggle('playing', M.joined && has && !(s && s.paused));
  }
  $('mlist').onclick = (e) => { const p = e.target.closest('[data-play]'); if (p) send({ t: 'music-play', i: Number(p.dataset.play) }); };
  $('mlcopy').onclick = async () => {
    try { await navigator.clipboard.writeText(M.st.link); note('A lista linkje a vágólapon.', 3000); }
    catch { prompt('A lista linkje:', M.st.link); }
  };
  $('mlrefresh').onclick = () => { send({ t: 'music-refresh' }); note('Frissítés…', 2000); };
  $('mlchange').onclick = () => { changing = true; paint(); $('murl').focus(); };
  $('mjoin').onclick = () => {
    M.joined = !M.joined;
    if (!M.joined) { try { M.player.stopVideo(); } catch {} M.loadedV = ''; M.loadedRev = -1; sync(false); paintPlay(); return; }
    if (!M.ready) { note('A lejátszó még töltődik, próbáld újra mindjárt.'); M.joined = false; return; }
    if (!cur()) note(M.st && M.st.list ? 'Még üres a lista: tegyél bele egy számot a YouTube-on!' : 'Még nincs bekötve lista.');
    M.loadedV = ''; sync(true); paintPlay();
  };
  $('mprev').onclick = () => send({ t: 'music-skip', dir: -1 });
  $('mnext').onclick = () => send({ t: 'music-skip', dir: 1 });
  $('mpause').onclick = () => send({ t: 'music-pause', paused: !(M.st && M.st.paused) });
  $('mvol').value = M.vol;
  $('mvol').oninput = () => { M.vol = Number($('mvol').value); safeSet('mvol', M.vol); applyVolume(); };
  $('mform').onsubmit = (e) => {
    e.preventDefault();
    const v = $('murl').value.trim(); if (!v) return;
    if (!nick) { note('Előbb adj meg becenevet.'); return; }
    send({ t: 'music-list', input: v }); $('murl').value = ''; changing = false;
    note('A lista bekötése…', 3000);
  };
  window.MusicDebug = (seek) => (seek != null && M.player && M.player.seekTo(seek, true), { t: M.player && M.ready ? M.player.getCurrentTime() : -1, exp: expected(), vol: M.player && M.ready ? M.player.getVolume() : -1, level: M.level, rev: M.st && M.st.rev, cur: M.st && M.st.cur, state: M.player && M.ready ? M.player.getPlayerState() : -1, joined: M.joined, dur: M.player && M.ready ? M.player.getDuration() : -1 });   // csak ellenőrzéshez
  paint();
  if (document.readyState === 'complete') loadApi(); else addEventListener('load', loadApi);
})();
