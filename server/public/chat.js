// Közös chat fal: egy közös üzenetfolyam, mindenki ugyanazt látja. Ha valaki ír, az üzenet azonnal felugrik (popup)
// mindenkinél, bárhol is jár az oldalon. A chat egy oldalsó panelben van (a fejléc „💬 Chat” gombja nyitja), mint a zene:
// nincs egyből szem előtt. A küldés a főoldal közös websocketjén megy (window.send), az üzeneteket a szerver tárolja és osztja szét.
(() => {
  const $ = (id) => document.getElementById(id);
  const drawer = $('cdrawer');
  if (!drawer) return;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const C = { msgs: [], seen: new Set(), ready: false, unread: 0, popT: 0 };

  const myNick = () => { try { return (window.nick || localStorage.getItem('nick') || ''); } catch { return ''; } };
  const timeStr = (ts) => { try { return new Date(ts).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  /* ---- a panel ---- */
  function openDrawer(on) {
    drawer.classList.toggle('open', on); drawer.setAttribute('aria-hidden', on ? 'false' : 'true');
    $('cbtn').setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { C.unread = 0; paintBadge(); scrollDown(); setTimeout(() => $('ctext').focus({ preventScroll: true }), 300); }
  }
  const isOpen = () => drawer.classList.contains('open');
  $('cbtn').onclick = () => openDrawer(!isOpen());
  $('cclose').onclick = () => openDrawer(false);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) openDrawer(false); });

  function paintBadge() {
    const b = $('cbadge');
    b.hidden = C.unread < 1;
    b.textContent = C.unread > 9 ? '9+' : String(C.unread);
    $('cbtn').setAttribute('aria-label', C.unread ? `Chat: ${C.unread} új üzenet` : 'Chat');
  }

  function scrollDown() { const l = $('clist'); l.scrollTop = l.scrollHeight; }

  function render() {
    const me = (myNick() || '').toLowerCase();
    $('cempty').hidden = C.msgs.length > 0;
    $('clist').innerHTML = C.msgs.map((x) => {
      const mine = (x.nick || '').toLowerCase() === me && me;
      return `<li class="${mine ? 'me' : ''}"><div class="b"><span class="who">${esc(x.nick || '?')}</span>`
        + `<span class="tm">${timeStr(x.ts)}</span><div class="tx">${esc(x.text)}</div></div></li>`;
    }).join('');
    scrollDown();
  }

  // új üzenet beérkezett: hozzáadjuk a falhoz (ha még nem láttuk), és felugrik mindenkinél
  function onMsg(msg, isHistory) {
    if (!msg || !msg.id || C.seen.has(msg.id)) return;
    C.seen.add(msg.id);
    C.msgs.push(msg);
    if (C.msgs.length > 200) { const drop = C.msgs.shift(); if (drop) C.seen.delete(drop.id); }
    render();
    if (isHistory) return;
    if (!isOpen()) { C.unread++; paintBadge(); }
    popup(msg);
  }

  // a teljes fal (belépéskor / kérésre): az eddigi üzeneteket felvesszük, popup nélkül
  function setWall(wall) {
    if (!wall || !Array.isArray(wall.msgs)) return;
    for (const msg of wall.msgs) onMsg(msg, true);
  }

  /* ---- popup: az új üzenet felugrik a képernyő alján, bárhol is jár az oldalon ---- */
  function popup(msg) {
    const host = $('cpop');
    const el = document.createElement('div');
    el.className = 'citem';
    const mine = (msg.nick || '').toLowerCase() === (myNick() || '').toLowerCase() && myNick();
    el.innerHTML = `<span class="who">${esc(msg.nick || '?')}</span><span class="tx">${esc(msg.text)}</span>`;
    if (mine) el.classList.add('me');
    el.onclick = () => openDrawer(true);
    host.appendChild(el);
    // legfeljebb 4 popup egyszerre; a legrégebbi eltűnik
    while (host.children.length > 4) host.firstChild.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 350); }, 6000);
  }

  /* ---- küldés ---- */
  function sendMsg() {
    const ta = $('ctext'); const text = ta.value.trim();
    if (!text) return;
    if (!myNick()) { note('Előbb adj meg becenevet (fent a nevednél).'); return; }
    if (typeof window.send !== 'function') { note('Nincs kapcsolat a szerverrel, próbáld újra.'); return; }
    window.send({ t: 'chat-send', text });
    ta.value = ''; autoGrow();
  }
  $('cform').onsubmit = (e) => { e.preventDefault(); sendMsg(); };
  $('ctext').addEventListener('keydown', (e) => {   // Enter küld, Shift+Enter új sor
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });
  function autoGrow() { const ta = $('ctext'); ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; }
  $('ctext').addEventListener('input', autoGrow);

  let noteT = 0;
  function note(msg, ms = 4000) {
    const n = $('cnote'); n.textContent = msg || '';
    clearTimeout(noteT); if (msg && ms) noteT = setTimeout(() => { n.textContent = ''; }, ms);
  }

  /* ---- mozgó emote-ok (Twitch-stílus): felúsznak és a zenére táncolnak ---- */
  const EMOTES = ['💃', '🕺', '🔥', '🎉', '❤️', '😂', '👏', '🙌', '🎶', '🤘', '✨', '🥳'];
  // a kabala mosómedve 4 reakciója: mindegyikhez SAJÁT rajzolt kép (SVG) + hozzá illő mozgás
  const RACCOONS = [
    { e: 'rc:dance',  m: 'dance', src: '/img/rc-dance.svg',  t: 'Táncoló mosómedve' },
    { e: 'rc:laugh',  m: 'laugh', src: '/img/rc-laugh.svg',  t: 'Nevető mosómedve' },
    { e: 'rc:cry',    m: 'sad',   src: '/img/rc-cry.svg',    t: 'Síró mosómedve' },
    { e: 'rc:hungry', m: 'jump',  src: '/img/rc-hungry.svg', t: 'Éhes mosómedve' },
  ];
  const rcOf = (e) => RACCOONS.find((x) => x.e === e);
  let musicOn = false;
  document.addEventListener('music:playing', (e) => { musicOn = !!e.detail; });   // a zene.js jelzi, szól-e a zene

  // az emote-sor gombjai: előbb a mosómedve-reakciók (saját képükkel), aztán a sima emojik
  $('cemotes').innerHTML =
    RACCOONS.map((r) => `<button type="button" class="rc" data-emote="${r.e}" title="${r.t}"><img src="${r.src}" alt="${r.t}"></button>`).join('')
    + EMOTES.map((e) => `<button type="button" data-emote="${e}" title="Küldd el mindenkinek">${e}</button>`).join('');
  // a sor egy külön gombbal jelenik meg / tűnik el
  function showEmotes(on) {
    $('cemotes').hidden = !on;
    $('cemobtn').setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  $('cemobtn').onclick = () => showEmotes($('cemotes').hidden);
  $('cemotes').onclick = (ev) => {
    const b = ev.target.closest('[data-emote]'); if (!b) return;
    if (!myNick()) { note('Előbb adj meg becenevet (fent a nevednél).'); return; }
    if (typeof window.send !== 'function') { note('Nincs kapcsolat a szerverrel.'); return; }
    window.send({ t: 'chat-emote', e: b.dataset.emote });   // mindenki képernyőjén felrepül
    showEmotes(false);
  };

  // egy emote felrepítése a képernyőn; ha szól a zene, gyorsabban „táncol” (rövidebb ritmus)
  function fly(emoji) {
    const host = $('cfly');
    if (host.children.length > 60) return;   // ne tömjük tele
    const el = document.createElement('div');
    el.className = 'fe';
    const dur = 4 + Math.random() * 2.5;          // 4–6,5 mp felúszás
    const beat = musicOn ? 0.28 + Math.random() * 0.14 : 0.45 + Math.random() * 0.25;   // zenére pörgősebb tánc
    const rise = 70 + Math.random() * 22;         // meddig úszik fel (vh)
    el.style.left = (4 + Math.random() * 88) + 'vw';
    el.style.setProperty('--dur', dur + 's');
    el.style.setProperty('--beat', beat + 's');
    el.style.setProperty('--rise', rise + 'vh');
    const rc = rcOf(emoji);
    if (rc) {   // mosómedve-reakció: a saját rajzolt képe + hozzá illő mozgás
      el.classList.add('rc', 'm-' + rc.m);
      el.innerHTML = `<span><img src="${rc.src}" alt=""></span>`;
    } else {      // sima emoji
      el.style.fontSize = (1.8 + Math.random() * 1.4) + 'rem';
      el.innerHTML = `<span>${emoji}</span>`;
    }
    host.appendChild(el);
    setTimeout(() => el.remove(), dur * 1000 + 200);
  }

  /* ---- a szerver üzenetei (a főoldal onmessage-e hívja) ---- */
  window.ChatHook = (m) => {
    if (!m || !m.t) return;
    if (m.t === 'chat-emote') return fly(m.e);                  // mozgó emote mindenkinél
    if (m.t === 'chat-msg') return onMsg(m.msg, false);
    if (m.t === 'chat') return setWall(m.chat);                 // külön kérésre küldött fal
    if ((m.t === 'state') && m.chat) { setWall(m.chat); C.ready = true; return; }   // belépéskor a snapshot hozza a falat
  };

  paintBadge();
})();
