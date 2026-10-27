// „Csak zene” nézet: se kerék, se tisztás, csak egy nagy kép (a világfa tövében lantozó mosómedve), a közös zene és ami fontos
// (az ebéd). A fejléc 🎧 gombja kapcsolja; megjegyzi (localStorage 'focus'), a #zene címmel is nyílik. Amíg be van kapcsolva,
// a szerver tudja (WS 'focus'), és a többiek a tisztáson fejhallgatót, hangjegyet és „ne zavarj” jelvényt látnak a mosómedvéd mellett.
(() => {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement, btn = $('focusbtn'), view = $('focusview');
  if (!btn || !view) return;
  const store = (v) => { try { v === undefined ? 0 : localStorage.setItem('focus', v); return localStorage.getItem('focus'); } catch { return null; } };
  let on = location.hash === '#zene' || store() === '1';

  function apply() {
    root.classList.toggle('focus', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Vissza a tisztásra' : 'Csak zene: nincs kerék, csak a zene és ami fontos';
    view.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (typeof send === 'function') send({ t: 'focus', on });
    if (!on && window.wheelDirty) window.wheelDirty();
    if (on) scrollTo(0, 0);
    if (!on) zen(false);
    mirror();
  }
  function set(v) { on = v; store(on ? '1' : '0'); if (!on && location.hash === '#zene') history.replaceState(null, '', location.pathname); apply(); }
  btn.onclick = () => set(!on);
  $('fexit').onclick = () => set(false);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && on && !document.querySelector('.lunchmodal:not([hidden]), .mdrawer.open')) set(false); });

  // a lejátszó a zenepanelben marad (bezárva is szól); itt csak a gombjai tükre
  const click = (id) => () => { const b = $(id); if (b && !b.disabled) b.click(); setTimeout(mirror, 150); };
  $('fjoin').onclick = click('mjoin'); $('fprev').onclick = click('mprev'); $('fpause').onclick = click('mpause'); $('fnext').onclick = click('mnext');
  $('fopen').onclick = () => $('mbtn').click();
  $('fvol').oninput = () => { const v = $('mvol'); v.value = $('fvol').value; v.dispatchEvent(new Event('input')); };
  function mirror() {
    if (!on) return;
    const now = $('mnow').textContent.trim();
    $('fnow').textContent = now || 'Még üres a lista: a 🎵 Zene panelen tegyél be egy számot.';
    $('fby').textContent = $('mby').textContent;
    $('fjoin').textContent = $('mjoin').classList.contains('on') ? 'Zene kikapcsolása (nálad)' : '▶ Zene bekapcsolása';
    $('fjoin').classList.toggle('on', $('mjoin').classList.contains('on'));
    $('fpause').textContent = $('mpause').textContent; $('fpause').title = $('mpause').title;
    for (const [f, m] of [['fprev', 'mprev'], ['fpause', 'mpause'], ['fnext', 'mnext']]) $(f).disabled = $(m).disabled;
    $('fvol').value = $('mvol').value;
    if (!joined()) zen(false);
  }
  // zen: ha itt kapcsolja be a zenét, minden kezelő eltűnik (csak a kép marad); kattintás, érintés vagy billentyű 5 mp-re visszahozza
  let zenTimer = 0;
  const joined = () => $('mjoin').classList.contains('on');
  const zen = (z) => { clearTimeout(zenTimer); root.classList.toggle('zen', z && on && joined()); };
  $('fjoin').addEventListener('click', () => setTimeout(() => zen(true), 400));
  const wake = (e) => {
    if (!root.classList.contains('zen') && !zenTimer) return;
    if (e.type === 'keydown' && e.key === 'Escape') { zen(false); zenTimer = 0; return; }
    zen(false); zenTimer = setTimeout(() => { zenTimer = 0; zen(true); }, 5000);
  };
  addEventListener('pointerdown', wake, true); addEventListener('keydown', wake, true);
  view.addEventListener('pointermove', () => { if (zenTimer) wake({ type: 'pointermove' }); });
  new MutationObserver(mirror).observe($('mdrawer'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled'] });

  // újracsatlakozáskor (és becenév után) a szerver újra megtudja, hogy fókuszban vagyok
  window.FocusHook = (m) => { if (m.t === 'hello' && on) send({ t: 'focus', on: true }); };
  apply();
})();
