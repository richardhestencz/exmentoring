// Világos / sötét mód. A fejlécben a mosómedvére kattintva vált; sötétben napszemüveg nélküli mosómedve.
(function () {
  const root = document.documentElement;
  const dark = () => root.dataset.theme === 'dark';
  function apply() {
    const d = dark();
    document.querySelectorAll('img.rc').forEach((i) => {
      const src = i.getAttribute('src');
      const next = d ? src.replace(/raccoon-(\d)/, 'raccoon-night-$1') : src.replace('raccoon-night-', 'raccoon-');
      if (next !== src) i.setAttribute('src', next);
    });
    document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]').forEach((l) => {
      l.href = d ? l.href.replace(/raccoon-(\d)/, 'raccoon-night-$1') : l.href.replace('raccoon-night-', 'raccoon-');
    });
    const cs = document.querySelector('meta[name="color-scheme"]'); if (cs) cs.content = d ? 'dark' : 'light';
    document.querySelectorAll('.themebtn').forEach((b) => { b.title = 'Menü: világos/sötét mód'; });
    window.dispatchEvent(new Event('themechange'));
  }
  window.isDark = dark;
  window.applyTheme = apply;
  // t: 'light' | 'dark' | '' (automatikus: a felület a rendszer beállítását, a főoldal tisztása a napszakot követi)
  window.setTheme = (t) => {
    try { t ? localStorage.setItem('theme', t) : localStorage.removeItem('theme'); } catch {}
    root.dataset.theme = t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    apply();
  };
  // a fejlécben a mosómedvére kattintva kis menü nyílik: világos/sötét mód
  function menu(btn) {
    let m = document.getElementById('exm-menu');
    if (m) { close(); return; }
    m = document.createElement('div'); m.id = 'exm-menu'; m.setAttribute('role', 'menu');
    const r = btn.getBoundingClientRect();
    Object.assign(m.style, { position: 'fixed', left: Math.max(8, r.left) + 'px', top: r.bottom + 8 + 'px', zIndex: 1000, minWidth: '190px',
      background: '#0a0f16', color: '#fff', border: '1px solid rgba(255,255,255,.18)', borderRadius: '14px', padding: '6px',
      boxShadow: '0 12px 32px rgba(0,0,0,.45)', fontFamily: 'Figtree,system-ui,sans-serif', fontSize: '.92rem' });
    const item = (label, fn, href) => {
      const el = document.createElement(href ? 'a' : 'button'); el.setAttribute('role', 'menuitem'); el.textContent = label;
      Object.assign(el.style, { display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: '0', borderRadius: '10px',
        background: 'transparent', color: '#fff', font: 'inherit', fontWeight: '600', cursor: 'pointer', textDecoration: 'none' });
      el.onmouseenter = el.onfocus = () => { el.style.background = 'rgba(255,255,255,.1)'; };
      el.onmouseleave = el.onblur = () => { el.style.background = 'transparent'; };
      if (href) el.href = href; else el.onclick = fn;
      m.appendChild(el); return el;
    };
    // három állás: világos, sötét, automatikus (a főoldal tisztása a valódi napszakot követi); a választott előtt pipa
    let chosen = ''; try { chosen = localStorage.getItem('theme') || ''; } catch {}
    const mark = (k) => (chosen === k ? '✓ ' : '\u2003 ');
    const first = item(mark('light') + '☀️  Világos mód', () => { window.setTheme('light'); close(); });
    item(mark('dark') + '🌙  Sötét mód', () => { window.setTheme('dark'); close(); });
    item(mark('') + '🕒  Automatikus (napszak szerint)', () => { window.setTheme(''); close(); });
    document.body.appendChild(m); btn.setAttribute('aria-expanded', 'true'); first.focus();
    setTimeout(() => document.addEventListener('click', outside, true));
    document.addEventListener('keydown', esc);
    function outside(e) { if (!m.contains(e.target) && !btn.contains(e.target)) close(); }
    function esc(e) { if (e.key === 'Escape') { close(); btn.focus(); } }
    function close() { m.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); document.removeEventListener('keydown', esc); }
    m.close = close;
  }
  function close() { const m = document.getElementById('exm-menu'); if (m && m.close) m.close(); }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.themebtn').forEach((b) => {
      b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'Menü: világos/sötét mód');
      b.addEventListener('click', (e) => { e.preventDefault(); menu(b); });
    });
    apply();
  });
})();
