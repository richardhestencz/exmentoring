// Sárga szám a fejléc „Szavazás” menüpontja mellett (mint a játékokban): hány érvényes, még le nem járt szavazásra nem válaszoltál.
// Minden oldal betölti; a főoldal élőben is frissíti (window.setPollBadge), a többi félpercenként kérdez rá.
(() => {
  const css = document.createElement('style');
  css.textContent = '.pbadge{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin-left:5px;border-radius:999px;'
    + 'background:#ffd400;color:#1a1200;font:800 .7rem/1 Figtree,system-ui,sans-serif;box-shadow:0 0 0 2px rgba(0,0,0,.25);vertical-align:1px}'
    + '.pbadge[hidden]{display:none}';
  document.head.appendChild(css);
  const nick = () => { try { return localStorage.getItem('nick') || ''; } catch { return ''; } };
  let badges = [];
  function mount() {
    badges = [...document.querySelectorAll('nav a[href="/szavazas.html"]')].map((a) => {
      let b = a.querySelector('.pbadge');
      if (!b) { b = document.createElement('span'); b.className = 'pbadge'; b.hidden = true; a.appendChild(b); }
      return b;
    });
  }
  window.setPollBadge = (n) => {
    n = Number(n) || 0;
    for (const b of badges) {
      b.hidden = n < 1; b.textContent = n > 9 ? '9+' : String(n);
      b.parentElement.setAttribute('aria-label', n ? `Szavazás: ${n} szavazásra még nem válaszoltál` : 'Szavazás');
      b.parentElement.title = n ? `${n} érvényes szavazásra még nem válaszoltál` : '';
    }
  };
  async function poll() {
    if (window.pollBadgeLive || document.visibilityState !== 'visible') return;   // a főoldal websocketen kapja
    const n = nick(); if (!n) return window.setPollBadge(0);
    try { const r = await fetch('/api/pending?nick=' + encodeURIComponent(n), { cache: 'no-store' }); if (r.ok) window.setPollBadge((await r.json()).n); } catch {}
  }
  const start = () => { mount(); poll(); setInterval(poll, 30000); document.addEventListener('visibilitychange', poll); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.refreshPollBadge = poll;
})();
