// Közös zene: hivatalos YouTube IFrame Player, mindenki ugyanazt hallgatja (a szerver állapota alapján),
// az ajtó nyitására mindenkinél lehalkul. A hangerő-csúszka helyi.
(() => {
  const $ = (id) => document.getElementById(id);
  const card = $('music');
  if (!card) return;
  const DUCK_LEVEL = 0.15, DUCK_DOWN_MS = 500, DUCK_UP_MS = 2000, DUCK_HOLD_MS = 15000, DRIFT_S = 2, RESYNC_MS = 15000;
  const M = { st: null, off: 0, player: null, ready: false, joined: false, vol: Number(safeGet('mvol')) || 60,
    duckOn: false, holdUntil: 0, level: 1, loadedKey: '', loadedRev: -1, loading: 0, errs: [], noteT: 0 };
  const synced = () => Date.now() + M.off;       // a szerver ideje
  const expected = () => { const s = M.st; return s ? (s.paused ? s.pos : Math.max(0, synced() - s.startedAt)) / 1000 : 0; };

  function note(msg, ms = 6000) {
    const n = $('mnote'); n.textContent = msg || '';
    clearTimeout(M.noteT); if (msg && ms) M.noteT = setTimeout(() => { n.textContent = ''; }, ms);
  }

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
    const host = $('ytp'); if (!host) return;
    M.ready = false;
    M.player = new YT.Player(host, {
      width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, controls: 1, disablekb: 1, modestbranding: 1, origin: location.origin },
      events: { onReady: () => { M.ready = true; applyVolume(); sync(true); }, onStateChange, onError },
    });
  }
  function destroyPlayer() {
    try { M.player && M.player.destroy(); } catch {}
    M.player = null; M.ready = false; M.loadedKey = ''; M.loadedRev = -1;
    const old = card.querySelector('.mplayer'); old.innerHTML = '<div id="ytp"></div>';
  }

  /* ---- hangerő és halkítás ---- */
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
    card.classList.toggle('ducked', M.level < 1);
  }, 50);
  function duck(on, fromEvent) {
    if (on) { if (!M.duckOn) { M.duckOn = true; M.holdUntil = fromEvent ? Date.now() + DUCK_HOLD_MS : 0; } }
    else M.duckOn = false;
    $('mduck').hidden = !(on || M.level < 1);
  }

  /* ---- a közös állapot követése ---- */
  const key = (s) => s.kind + ':' + s.id;
  function onStateChange(e) {
    const s = M.st; if (!s || !M.player) return;
    if (e.data === 1) {                                   // PLAYING
      M.errs = M.errs.filter((t) => Date.now() - t < 10000);
      if (M.loading && Date.now() > M.loading) M.loading = 0;
      if (s.kind === 'playlist' && !M.loading) {
        let i = -1; try { i = M.player.getPlaylistIndex(); } catch {}
        if (i >= 0 && i !== s.index) send({ t: 'music-track', rev: s.rev, to: i });   // magától lépett a következő számra
      }
      M.loading = 0;
    } else if (e.data === 0 && s.kind === 'video' && M.joined) {       // egy szám vége: újra
      send({ t: 'music-track', rev: s.rev, to: 0 });
    }
    paintPlay();
  }
  function onError(e) {
    const c = e.data, s = M.st;
    M.errs.push(Date.now());
    const mix = s && s.kind === 'playlist' && s.id.startsWith('RD');
    if ([100, 101, 150, 153].includes(c)) note('Ennél a számnál le van tiltva a beágyazás, átugrom.');
    else note(mix ? 'Ez a YouTube-mix nem játszható be itt, tegyél fel egy normál playlistet.' : `A lejátszó hibát jelzett (${c}).`);
    if (!s || M.errs.length >= 6) { if (s) note('Több szám egymás után nem játszható be, állj meg és válassz másik listát.', 0); return; }
    if (s.kind === 'playlist' && [100, 101, 150, 153, 5].includes(c)) {
      const len = playlistLen();
      send({ t: 'music-skip', dir: 1, len });   // a szerver egyszer lép; a többi kliens ugyanígy jelezhet, a rev kiszűri
    }
  }
  const playlistLen = () => { try { return (M.player.getPlaylist() || []).length || 1; } catch { return 1; } };

  // a lejátszót a szerver állapotához igazítja; force: mindenképp betölt
  function sync(force) {
    const s = M.st; if (!s || !M.ready || !M.player) return;
    if (!s.kind) return;
    const pos = expected();
    if (!M.joined) {      // bekapcsolásig csak a borítót töltjük be (a böngésző hanggal nem engedi az automatikus indítást)
      if (M.loadedKey !== key(s)) {
        M.loadedKey = key(s); M.loadedRev = s.rev;
        try { s.kind === 'playlist' ? M.player.cuePlaylist({ listType: 'playlist', list: s.id, index: s.index }) : M.player.cueVideoById(s.id); } catch {}
      }
      return;
    }
    const changed = force || M.loadedRev !== s.rev || M.loadedKey !== key(s);
    if (changed) {
      let cur = -1; try { cur = s.kind === 'playlist' ? M.player.getPlaylistIndex() : 0; } catch {}
      const sameTrack = M.loadedKey === key(s) && cur === s.index && !force;
      M.loadedKey = key(s); M.loadedRev = s.rev;
      if (sameTrack) { seekIfOff(pos, true); }            // már ezen a számon vagyunk (magától lépett, vagy a szerver csak megerősítette)
      else {
        M.loading = Date.now() + 5000;
        try {
          if (s.kind === 'playlist') { M.player.loadPlaylist({ listType: 'playlist', list: s.id, index: s.index, startSeconds: pos }); M.player.setLoop(true); }
          else M.player.loadVideoById({ videoId: s.id, startSeconds: pos });
        } catch {}
      }
    }
    try { s.paused ? M.player.pauseVideo() : (M.player.getPlayerState() !== 1 && !changed ? M.player.playVideo() : 0); } catch {}
    applyVolume(); paintPlay();
  }
  function seekIfOff(pos, hard) {
    if (!M.ready || !M.joined || !M.st || M.st.paused) return;
    try {
      const st = M.player.getPlayerState();
      if (st !== 1 && st !== 3) return;                  // hirdetés vagy puffer alatt nem tekergetünk
      if (Math.abs(M.player.getCurrentTime() - pos) > DRIFT_S || hard && Math.abs(M.player.getCurrentTime() - pos) > DRIFT_S) M.player.seekTo(pos, true);
    } catch {}
  }
  setInterval(() => { if (M.joined && M.st && M.st.kind) seekIfOff(expected()); }, RESYNC_MS);

  // a szerver üzenetei (a főoldal onmessage-e hívja)
  window.MusicHook = (m) => {
    if (m.t === 'music-duck') return duck(m.on, true);
    const mu = m.t === 'state' ? m.music : m.t === 'music' ? m.music : null;
    if (!mu) return;
    const first = !M.st;
    M.off = mu.now - Date.now();
    const srcChanged = !M.st || M.st.rev !== mu.rev || key(M.st) !== key(mu);
    M.st = mu;
    if (m.t !== 'music' || srcChanged) { /* a state üzenet pos-a elavulhat, de a startedAt/rev a mérvadó */ }
    duck(mu.duck, false);
    if (first || srcChanged) { paint(); sync(false); }
  };

  /* ---- felület ---- */
  function paint() {
    const s = M.st;
    $('mby').textContent = s && s.kind ? `Felrakta: ${s.setBy}` : '';
    $('mempty').hidden = !!(s && s.kind);
    paintPlay();
  }
  function paintPlay() {
    const s = M.st;
    $('mjoin').textContent = M.joined ? 'Zene kikapcsolása' : 'Zene bekapcsolása';
    $('mjoin').classList.toggle('on', M.joined);
    $('mpause').textContent = s && s.paused ? '▶' : '⏸';
    $('mpause').title = s && s.paused ? 'Folytatás (mindenkinek)' : 'Szünet (mindenkinek)';
    const has = !!(s && s.kind); for (const b of ['mprev', 'mnext', 'mpause']) $(b).disabled = !has;
  }
  $('mjoin').onclick = () => {
    M.joined = !M.joined;
    if (!M.joined) { try { M.player.stopVideo(); } catch {} M.loadedKey = ''; M.loadedRev = -1; paintPlay(); return; }
    if (!M.ready) { note('A lejátszó még töltődik, próbáld újra mindjárt.'); M.joined = false; return; }
    if (!M.st || !M.st.kind) { M.joined = true; paintPlay(); note('Még nincs playlist, tegyél fel egyet.'); return; }
    M.loadedKey = ''; sync(true);
  };
  $('mprev').onclick = () => send({ t: 'music-skip', dir: -1, len: playlistLen() });
  $('mnext').onclick = () => send({ t: 'music-skip', dir: 1, len: playlistLen() });
  $('mpause').onclick = () => send({ t: 'music-pause', paused: !(M.st && M.st.paused) });
  $('mvol').value = M.vol;
  $('mvol').oninput = () => { M.vol = Number($('mvol').value); safeSet('mvol', M.vol); applyVolume(); };
  $('mform').onsubmit = (e) => {
    e.preventDefault();
    const v = $('murl').value.trim(); if (!v) return;
    if (!nick) { note('Előbb adj meg becenevet.'); return; }
    send({ t: 'music-set', input: v }); $('murl').value = '';
    note('Playlist elküldve…', 3000);
  };

  // Elfér-e a kártya a játéktér bal oldalán (a hírfolyam alatt, a tét-panel és a tétasztal nélkül takarva)?
  // Ha nem (keskeny vagy alacsony ablak, mobil), a játéktér alá kerül; az átköltöztetés újratölti a lejátszót.
  const home = card.parentNode, homeNext = card.nextSibling, CARD_H = 360;
  const stageEl = $('stage');
  function fits() {
    if (innerWidth <= 760) return false;
    const R = (sel) => document.querySelector(sel).getBoundingClientRect();
    const st = stageEl.getBoundingClientRect(), feed = R('#feed'), tl = R('.tl'), pills = R('.pills'), board = R('.boardwrap');
    const bottom = feed.bottom + 8 + CARD_H;
    if (bottom + 8 > pills.top) return false;                         // alul a „Közös pot” panelek
    return board.left >= tl.right - 2 || bottom + 8 <= board.top;     // a tétasztal ne csússzon alá
  }
  let wantSlot = false;
  function place(force) {
    const slot = $('musicSlot');
    const target = wantSlot ? slot : home;
    if (card.parentNode === target) return;
    const had = !!M.player; if (had) destroyPlayer();
    wantSlot ? slot.appendChild(card) : home.insertBefore(card, homeNext && homeNext.parentNode === home ? homeNext : null);
    if (had) makePlayer();
  }
  function relayout() { const w = !fits(); if (w !== wantSlot) { wantSlot = w; place(); } }
  let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(relayout, 300); });
  addEventListener('load', () => setTimeout(relayout, 200));
  wantSlot = innerWidth <= 760; place(); relayout();
  window.MusicDebug = () => ({ idx: M.player && M.ready ? M.player.getPlaylistIndex() : -1, t: M.player && M.ready ? M.player.getCurrentTime() : -1, exp: expected(), vol: M.player && M.ready ? M.player.getVolume() : -1, level: M.level, rev: M.st && M.st.rev, idxSrv: M.st && M.st.index, state: M.player && M.ready ? M.player.getPlayerState() : -1 });   // csak ellenőrzéshez
  paint();
  if (document.readyState === 'complete') loadApi(); else addEventListener('load', loadApi);
})();
