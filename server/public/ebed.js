// Napi ebédszavazás a főoldalon: 10:00 és 12:30 között, csak a ma helyben belépetteknek. Ha még nem válaszoltál, nagy ablak jön fel
// (balra „Hoztál ma ebédet?”, jobbra „Mikor megyünk ebédelni?”); válasz után az eredmény a bal oldali oszlopba kerül, az üzenetek alá.
// A szerver 'pending' üzenete hozza: {n: hány érvényes szavazásra nem válaszoltál, lunch: null vagy {closesAt, polls: [hozott, mikor]}}.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = (t) => new Date(t).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Budapest' });
  let L = null, snoozed = false;
  const answered = (p) => !!(p && p.choices && p.choices.length);

  // a bal oldali kártya: a mai eredmény (csak válasz után)
  function card() {
    const box = $('lunchcard');
    if (!L || !answered(L.polls[0])) { box.hidden = true; return; }
    const [b, t] = L.polls, who = (arr) => (arr.length ? arr.join(', ') : '');
    const times = t.options.map((o, i) => [o, t.counts[i], t.votersByOption[i]]).filter((x) => x[1] > 0);
    box.innerHTML = `<div class="lch"><b>🍱 Ebéd ma</b><small>lejár ${hm(L.closesAt)}</small></div>`
      + `<div class="lcr"><span title="${esc(who(b.votersByOption[0]))}">Hozott: <b>${b.counts[0]}</b></span> · <span title="${esc(who(b.votersByOption[1]))}">Nem hozott: <b>${b.counts[1]}</b></span></div>`
      + `<div class="lcr">${times.length ? 'Indulás: ' + times.map(([o, c, v]) => `<span title="${esc(who(v))}">${o === 'Ma nem jövök' ? 'nem jön' : esc(o)}${o === 'Ma nem jövök' ? ': ' : ' '}<b>${o === 'Ma nem jövök' ? c : '(' + c + ')'}</b></span>`).join(' · ') : 'Indulás: még senki nem jelölte'}</div>`
      + `<button type="button" class="lcedit" id="lcedit">Módosítom</button>`;
    box.hidden = false;
    $('lcedit').onclick = () => open(true);
  }

  // a nagy ablak
  function modal() {
    if (!L) return;
    const opt = (p, cls) => p.options.map((o, i) => `<button type="button" class="${cls}${p.choices.includes(i) ? ' on' : ''}" aria-pressed="${p.choices.includes(i)}" data-poll="${esc(p.id)}" data-i="${i}">${esc(o)}<small>${p.counts[i] || ''}</small></button>`).join('');
    const [b, t] = L.polls;
    $('lunchbody').innerHTML = `<section><h2>${esc(b.title)}</h2><div class="lbig">${opt(b, 'lopt big')}</div></section>`
      + `<section><h2>${esc(t.title)}</h2><div class="ltimes">${opt(t, 'lopt')}</div></section>`;
    $('lunchdone').disabled = !answered(b);
    $('lunchsub').textContent = `A szavazás ${hm(L.closesAt)}-kor lejár. Az eredményt bal oldalt, az üzenetek alatt látod.`;
  }
  function open(force) {
    if (!L || !$('nickmodal').hidden) return;
    if (!force && (snoozed || answered(L.polls[0]))) return;
    modal(); $('lunchmodal').hidden = false;
    const f = $('lunchmodal').querySelector('.lopt'); if (f) f.focus();
  }
  function close(snooze) { $('lunchmodal').hidden = true; if (snooze) snoozed = true; }

  $('lunchbody').onclick = (e) => {
    const x = e.target.closest('[data-poll]'); if (!x) return;
    send({ t: 'poll-vote', id: x.dataset.poll, choices: [Number(x.dataset.i)], quiet: true });
  };
  $('lunchdone').onclick = () => close(false);
  $('lunchlater').onclick = () => close(true);
  $('lunchmodal').addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });

  window.LunchHook = (m) => {
    if (m.t !== 'pending') return;
    window.pollBadgeLive = true;
    if (window.setPollBadge) window.setPollBadge(m.n);
    L = m.lunch;
    if (!L) { close(false); card(); return; }
    card();
    if (!$('lunchmodal').hidden) modal(); else open(false);
  };
  // a becenév-ablak bezárulása után (belépés) jöhet a nagy ablak
  new MutationObserver(() => { if ($('nickmodal').hidden) open(false); }).observe($('nickmodal'), { attributes: true, attributeFilter: ['hidden'] });
})();
