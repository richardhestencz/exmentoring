// Közös zene: közös lejátszási lista (bárki betehet számot), sorban, magától megy; mindenki ugyanott tart.
// A lejátszó egy oldalsó panelben van (a fejléc „🎵 Zene” gombja nyitja), bezárva is szól. Az ajtó nyitására mindenkinél lehalkul.
(() => {
  const $ = (id) => document.getElementById(id);
  const drawer = $('mdrawer');
  if (!drawer) return;
  const DUCK_LEVEL = 0.15, DUCK_DOWN_MS = 500, DUCK_UP_MS = 2000, DUCK_HOLD_MS = 15000, DRIFT_S = 2, RESYNC_MS = 15000;
  const M = { st: null, off: 0, player: null, ready: false, joined: false, vol: Number(safeGet('mvol')) || 60,
    duckOn: false, holdUntil: 0, level: 1, loadedV: '', loadedRev: -1, errs: [], noteT: 0, endedRev: -1 };
  const synced = () => Date.now() + M.off;       // a szerver ideje
  const expected = () => { const s = M.st; return s ? (s.paused ? s.pos : Math.max(0, synced() - s.startedAt)) / 1000 : 0; };
  const cur = () => (M.st && M.st.queue.length ? M.st.queue[M.st.cur] : null);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function note(msg, ms = 6000) {
    const n = $('mnote'); n.textContent = msg || '';
    clearTimeout(M.noteT); if (msg && ms) M.noteT = setTimeout(() => { n.textContent = ''; }, ms);
  }

  /* ---- a panel ---- */
  function openDrawer(on) {
    drawer.classList.toggle('open', on); drawer.setAttribute('aria-hidden', on ? 'false' : 'true');
    $('mbtn').setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) setTimeout(() => (M.joined ? $('murl') : $('mjoin')).focus({ preventScroll: true }), 300);
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
    if (e.data === 1) M.errs = M.errs.filter((t) => Date.now() - t < 10000);
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
      if (Math.abs(M.player.getCurrentTime() - pos) > DRIFT_S) M.player.seekTo(pos, true);
    } catch {}
  }
  setInterval(() => { if (M.joined && cur()) seekIfOff(expected()); }, RESYNC_MS);

  // a szerver üzenetei (a főoldal onmessage-e hívja)
  window.MusicHook = (m) => {
    if (m.t === 'music-duck') return duck(m.on, true);
    const mu = m.t === 'state' || m.t === 'music' ? m.music : null;
    if (!mu || !Array.isArray(mu.queue)) return;
    const changed = !M.st || M.st.rev !== mu.rev;
    M.off = mu.now - Date.now(); M.st = mu;
    duck(mu.duck, false);
    if (changed) { paint(); sync(false); }
  };

  /* ---- felület ---- */
  function paint() {
    const s = M.st, it = cur();
    $('mempty').hidden = !!it;
    $('mnow').textContent = it ? it.title : '';
    $('mby').textContent = it ? `Betette: ${it.by}` : '';
    $('mcount').textContent = s && s.queue.length ? `A lista (${s.queue.length} szám, a végén újrakezdi)` : 'A lista';
    $('mlist').innerHTML = s && s.queue.length ? s.queue.map((x, i) => `<li class="${i === s.cur ? 'cur' : ''}"><span class="n">${i === s.cur ? '▶' : i + 1}</span>`
      + `<button type="button" class="t" data-play="${x.id}" title="Lejátszás most (mindenkinek)"><b>${esc(x.title)}</b><small>${esc(x.by)}</small></button>`
      + `<button type="button" class="x" data-del="${x.id}" title="Kivétel a listából" aria-label="Kivétel: ${esc(x.title)}">✕</button></li>`).join('')
      : '<li class="mlempty">Még nincs szám a listán. Másold be egy YouTube- vagy YouTube Music-szám linkjét fent.</li>';
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
  $('mlist').onclick = (e) => {
    const p = e.target.closest('[data-play]'), d = e.target.closest('[data-del]');
    if (p) send({ t: 'music-play', id: Number(p.dataset.play) });
    else if (d && confirm('Kiveszed ezt a számot a közös listából?')) send({ t: 'music-remove', id: Number(d.dataset.del) });
  };
  $('mjoin').onclick = () => {
    M.joined = !M.joined;
    if (!M.joined) { try { M.player.stopVideo(); } catch {} M.loadedV = ''; M.loadedRev = -1; sync(false); paintPlay(); return; }
    if (!M.ready) { note('A lejátszó még töltődik, próbáld újra mindjárt.'); M.joined = false; return; }
    if (!cur()) note('Még üres a lista: tegyél be egy számot!');
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
    send({ t: 'music-add', input: v }); $('murl').value = '';
    note('Hozzáadás…', 3000);
  };
  window.MusicDebug = (seek) => (seek != null && M.player && M.player.seekTo(seek, true), { t: M.player && M.ready ? M.player.getCurrentTime() : -1, exp: expected(), vol: M.player && M.ready ? M.player.getVolume() : -1, level: M.level, rev: M.st && M.st.rev, cur: M.st && M.st.cur, state: M.player && M.ready ? M.player.getPlayerState() : -1, joined: M.joined, dur: M.player && M.ready ? M.player.getDuration() : -1 });   // csak ellenőrzéshez
  paint();
  if (document.readyState === 'complete') loadApi(); else addEventListener('load', loadApi);
})();
