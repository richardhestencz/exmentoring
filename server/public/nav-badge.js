// Sárga szám a fejléc „Szavazás” menüpontja mellett (mint a játékokban): hány érvényes, még le nem járt szavazásra nem válaszoltál.
// Minden oldal betölti; a főoldal élőben is frissíti (window.setPollBadge), a többi félpercenként kérdez rá.
(() => {
  const css = document.createElement('style');
  css.textContent = '.pbadge{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin-left:5px;border-radius:999px;'
    + 'background:#ffd400;color:#1a1200;font:800 .7rem/1 Figtree,system-ui,sans-serif;box-shadow:0 0 0 2px rgba(0,0,0,.25);vertical-align:1px}'
    + '.pbadge[hidden]{display:none}'
    + '.nav-update{display:block;width:100%;padding:9px 12px;border:0;border-radius:7px;background:transparent;color:#e9dcd3;font:600 .88rem Figtree,system-ui,sans-serif;text-align:left;cursor:pointer}'
    + '.nav-update:hover,.nav-update:focus-visible{background:rgba(255,255,255,.1);color:#fff;outline:none}'
    + '.nav-update:disabled{opacity:.65;cursor:wait}';
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
  const start = () => { mount(); mountUpdateButtons(); poll(); setInterval(poll, 30000); document.addEventListener('visibilitychange', poll); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.refreshPollBadge = poll;

  function mountUpdateButtons() {
    document.querySelectorAll('.nav-dropdown').forEach((menu) => {
      if (menu.querySelector('.nav-update')) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'nav-update'; button.textContent = '↻ Frissítés';
      button.title = 'Frissítés a GitHubról';
      button.onclick = async () => {
        button.disabled = true; button.textContent = '↻ Frissítés…';
        try {
          const response = await fetch('/api/update', { method: 'POST' });
          const result = await response.json();
          button.textContent = result.ok ? '✓ Frissítés elindult' : `⚠ ${result.error || 'Nem sikerült'}`;
        } catch { button.textContent = '⚠ Nem sikerült elérni a szervert'; }
        setTimeout(() => { button.disabled = false; button.textContent = '↻ Frissítés'; }, 6000);
      };
      menu.appendChild(button);
    });
  }
})();
