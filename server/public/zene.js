// Közös zene: egy bekötött YouTube-lejátszási lista (a számokat a YouTube-on teszik bele), sorban, magától megy; mindenki ugyanott tart.
// A lejátszó egy oldalsó panelben van (a fejléc „🎵 Zene” gombja nyitja), bezárva is szól. Az ajtó nyitására mindenkinél lehalkul.
(() => {
  const $ = (id) => document.getElementById(id);
  const drawer = $('mdrawer');
  if (!drawer) return;
  const DUCK_LEVEL = 0.15, DUCK_DOWN_MS = 500, DUCK_UP_MS = 2000, DUCK_HOLD_MS = 15000, RESYNC_MS = 1000;
  const M = { st: null, off: 0, clock: false, lead: Math.min(3, Math.max(0, Number(safeGet('mlead')) || 0.3)), player: null, ready: false, joined: false, vol: Number(safeGet('mvol')) || 60,
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
    if (e.data === 0 && M.joined) reportEnd();   // vége: a következő jön (a szerver ellenőrzi, tényleg vége-e)
    if (e.data === 1) { M.errs = M.errs.filter((t) => Date.now() - t < 10000); setTimeout(align, 300); }   // indulás, puffer, reklám után azonnal a közös helyre
    paintPlay();
  }
  function reportEnd() {
    const s = M.st; if (!s || (M.endedRev === s.rev && Date.now() - M.endedAt < 4000)) return;
    let dur = 0; try { dur = M.player.getDuration(); } catch {}
    if (dur > 0 && expected() < dur - 5) return;           // a közös idő szerint még nincs vége (pl. betöltés közbeni ugrás): nem jelentünk
    M.endedRev = s.rev; M.endedAt = Date.now(); send({ t: 'music-ended', rev: s.rev, dur });
  }
  function onError(e) {
    const c = e.data, s = M.st;
    M.errs.push(Date.now());
    if ([100, 101, 150, 153].includes(c)) note('Ennél a számnál le van tiltva a beágyazás, átugrom.');
    else note(`A lejátszó hibát jelzett (${c}), átugrom.`);
    if (!s || !M.joined || M.errs.length >= 6) { if (s && M.errs.length >= 6) note('Több szám egymás után nem játszható le; ellenőrizd a listát.', 0); return; }
    // egy gép hibája nem léptet mindenkit: jelezzük, és itt csend van, amíg a többieknél véget nem ér (ha a hallgatók fele hibát jelez, a szerver ugrik)
    if (M.errRev !== s.rev) { M.errRev = s.rev; send({ t: 'music-error', rev: s.rev, code: c }); }
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
      if (M.loadedV === it.v && !force) align();   // ugyanaz a szám (pl. csak a lista változott): csak igazítunk
      else { try { M.player.loadVideoById({ videoId: it.v, startSeconds: pos + M.lead }); } catch {} seekAt = 0; fresh = true; diffs.length = 0; }
      M.loadedV = it.v; M.loadedRev = s.rev;
    }
    try { s.paused ? M.player.pauseVideo() : (M.player.getPlayerState() === 2 ? M.player.playVideo() : 0); } catch {}
    applyVolume(); paintPlay();
  }
  // Igazítás a közös időhöz (Richard, 2026-10-27: „gyorsul meg lassul néha, de ha ellépek az oldalról, akkor jó”).
  // Sebességet SOHA nem állítunk: a YouTube csak 1,25 / 0,75 lépcsőt tud, ami zenében hallható gyorsulás-lassulás, és a mérés
  // zaja (a YouTube kb. 265 ms-onként küldi az időt, az óraszinkron is igazít) önmagában kiváltotta. Ha mindenki 1×-en szól,
  // az eltérés magától nem nő; csak valódi csúszásnál (reklám, akadó net) tekerünk: ha az utolsó 5 mérés középértéke 1 s fölött van,
  // és legfeljebb fél percenként. Belépéskor a betöltés pontos (a tanult ráhagyással).
  const SEEK_OVER = 1.0, SEEK_GAP = 30000, LEAD_STEP = 0.2, SETTLE = 0.12;
  let seekAt = 0, lastSeek = 0, fresh = false;
  const diffs = [];
  M.stats = { seeks: 0, nudges: 0 };
  function setRate(r) { try { if (M.player.getPlaybackRate() !== r) M.player.setPlaybackRate(r); } catch {} }
  function seek(now) {
    diffs.length = 0;
    let dur = 0; try { dur = M.player.getDuration(); } catch {}
    if (dur > 0 && expected() >= dur - 1) { reportEnd(); return; }   // a közös idő szerint már vége: nem tekerünk a vége utánra
    try { M.player.seekTo(dur > 0 ? Math.min(expected() + M.lead, dur - 1) : expected() + M.lead, true); } catch {}
    seekAt = lastSeek = now; M.stats.seeks++;
  }
  function align() {
    if (!M.ready || !M.joined || !M.st || M.st.paused || !cur()) return;
    let st, t; try { st = M.player.getPlayerState(); t = M.player.getCurrentTime(); } catch { return; }
    if (st !== 1) { diffs.length = 0; return; }               // puffer, hirdetés, szünet alatt nem mérünk
    try { if (M.player.getVideoData().isLive) return; } catch {}   // élő adást nem lehet közös időre igazítani
    setRate(1);                                               // ha egy régebbi változat gyorsítva hagyta
    const now = Date.now(), diff = t - expected();
    if (seekAt) {                                             // a legutóbbi tekerés hová vitt: a ráhagyás ebből tanul
      if (now - seekAt < 2000) return;
      if (Math.abs(diff) < SEEK_OVER) { M.lead = Math.min(3, Math.max(0, M.lead - Math.max(-LEAD_STEP, Math.min(LEAD_STEP, diff * 0.6)))); safeSet('mlead', M.lead.toFixed(3)); }
      seekAt = 0;
    }
    diffs.push(diff); if (diffs.length > 5) diffs.shift();
    if (diffs.length < 5) return;
    const med = [...diffs].sort((a, b) => a - b)[2];          // középérték: egy-egy kiugró mérés nem számít
    if (fresh) { fresh = false; if (Math.abs(med) > SETTLE) seek(now); return; }   // betöltés / számváltás után egyszer pontosan beállunk
    if (Math.abs(med) > SEEK_OVER && now - lastSeek > SEEK_GAP) seek(now);
  }
  setInterval(() => {
    if (!M.joined || !cur()) return;
    let st = -1; try { st = M.player.getPlayerState(); } catch {}
    if (st === 0) reportEnd();   // nálunk vége: ha a közös idő szerint is, (újra) jelentjük; a szerver a duplát kiszűri
    else align();
  }, 1000);
  const seekIfOff = () => align();

  // a szerver üzenetei (a főoldal onmessage-e hívja)
  // pontos óra: oda-vissza időmérés a szerverrel; a legkisebb késésű mérés a mérvadó (a késés felét beszámítva)
  const pings = [];
  function ping() { send({ t: 'music-ping', c: Date.now(), j: M.joined ? 1 : 0 }); }
  function pong(m) {
    const now = Date.now(), rtt = now - m.c; if (rtt < 0 || rtt > 5000) return;
    pings.push({ rtt, off: m.s - (m.c + rtt / 2) }); if (pings.length > 10) pings.shift();
    const best = pings.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    if (!M.clock || Math.abs(best.off - M.off) > 40) M.off = best.off;
    M.clock = true;
  }
  let pingN = 0; setInterval(() => { if (pingN < 6 || pingN % 15 === 0) ping(); pingN++; }, 1000);   // a 15 s-os jelzésből tudja a szerver, hányan hallgatják   // indításkor sűrűn, aztán 15 s-onként
  window.MusicHook = (m) => {
    if (m.t === 'music-duck') return duck(m.on, true);
    if (m.t === 'music-pong') return pong(m);
    const mu = m.t === 'state' || m.t === 'music' ? m.music : null;
    if (!mu || !Array.isArray(mu.items)) return;
    const changed = !M.st || M.st.rev !== mu.rev || M.st.fetchedAt !== mu.fetchedAt || M.st.link !== mu.link;
    if (!M.clock && !M.roughOff) { M.off = mu.now - Date.now(); M.roughOff = true; }   // amíg nincs pontos mérés: egyszer, az első üzenet szerint
    M.st = mu;
    const playing = !!(mu.items.length && !mu.paused);
    if (playing !== M.playingEv) { M.playingEv = playing; document.dispatchEvent(new CustomEvent('music:playing', { detail: playing })); }
    duck(mu.duck, false);
    if (changed) { paint(); sync(false); }
  };

  /* ---- felület ---- */
  let changing = false;
  function paint() {
    const s = M.st, it = cur(), has = !!(s && s.list);
    $('mempty').innerHTML = 'Még üres a lista.<br>Tegyél be egy számot a linkjével!';
    $('mempty').hidden = !!it;
    $('mnow').textContent = it ? it.title : '';
    $('mby').textContent = it ? `${s.cur + 1}. / ${s.items.length}` : '';
    $('mlinkbox').hidden = !has || changing;
    $('mform').hidden = !changing;
    $('mlbind').hidden = has || changing;
    if (has) { $('mltitle').textContent = s.title || 'YouTube-lista'; $('mlopen').href = s.link; }
    if (s && s.err) note('A lista frissítése nem sikerült: ' + s.err, 0);
    else if ($('mnote').textContent.startsWith('A lista frissítése')) note('');
    $('mcount').textContent = s && s.items.length ? `A lista (${s.items.length} szám, ${s.shuffle ? 'véletlen sorrendben' : 'a végén újrakezdi'})` : 'A lista';
    $('mlist').innerHTML = s && s.items.length ? s.items.map((x, i) => `<li class="${i === s.cur ? 'cur' : ''}"><span class="n">${i === s.cur ? '▶' : i + 1}</span>`
      + `<button type="button" class="t" data-play="${i}" title="Lejátszás most (mindenkinek)"><b>${esc(x.title)}</b></button>`
      + (x.by != null ? `<span class="by" title="Az oldalon tette be">+ ${esc(x.by)}</span><button type="button" class="x" data-rm="${esc(x.v)}" title="Kivétel a listából" aria-label="Kivétel a listából">✕</button>` : '') + '</li>').join('')
      : `<li class="mlempty">${has ? 'Még nincs szám a listában. Tegyél be egyet fent!' : 'Még üres: tegyél be egy számot fent a linkjével!'}</li>`;
    $('mshuf').setAttribute('aria-pressed', s && s.shuffle ? 'true' : 'false');
    $('mshuf').title = s && s.shuffle ? 'Véletlen sorrend: be (mindenkinek)' : 'Véletlen sorrend: ki (mindenkinek)';
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
    const r = e.target.closest('[data-rm]'); if (r) { send({ t: 'music-remove', v: r.dataset.rm }); return; }
    const p = e.target.closest('[data-play]'); if (p) send({ t: 'music-play', i: Number(p.dataset.play) });
  };
  $('mshuf').onclick = () => { if (!nick) { note('Előbb adj meg becenevet.'); return; } send({ t: 'music-shuffle', on: !(M.st && M.st.shuffle) }); };
  $('madd').onsubmit = (e) => {
    e.preventDefault();
    const v = $('maddurl').value.trim(); if (!v) return;
    if (!nick) { note('Előbb adj meg becenevet.'); return; }
    send({ t: 'music-add', input: v }); $('maddurl').value = '';
    note('A szám betétele…', 3000);
  };
  $('mlcopy').onclick = async () => {
    try { await navigator.clipboard.writeText(M.st.link); note('A lista linkje a vágólapon.', 3000); }
    catch { prompt('A lista linkje:', M.st.link); }
  };
  $('mlrefresh').onclick = () => { send({ t: 'music-refresh' }); note('Frissítés…', 2000); };
  $('mlchange').onclick = $('mlbind').onclick = () => { changing = true; paint(); $('murl').focus(); };
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
  window.MusicDebug = (sk) => (sk != null && M.player && M.player.seekTo(sk, true), { stats: M.stats, hidden: document.visibilityState, t: M.player && M.ready ? M.player.getCurrentTime() : -1, exp: expected(), vol: M.player && M.ready ? M.player.getVolume() : -1, level: M.level, rev: M.st && M.st.rev, cur: M.st && M.st.cur, state: M.player && M.ready ? M.player.getPlayerState() : -1, joined: M.joined, lead: M.lead, rate: M.player && M.ready ? M.player.getPlaybackRate() : -1, dur: M.player && M.ready ? M.player.getDuration() : -1 });   // csak ellenőrzéshez
  paint();
  if (document.readyState === 'complete') loadApi(); else addEventListener('load', loadApi);
})();
