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
    document.querySelectorAll('.themebtn').forEach((b) => { b.setAttribute('aria-pressed', d); b.title = d ? 'Világos mód' : 'Sötét mód'; });
    window.dispatchEvent(new Event('themechange'));
  }
  window.isDark = dark;
  window.applyTheme = apply;
  window.setTheme = (t) => { root.dataset.theme = t; try { localStorage.setItem('theme', t); } catch {} apply(); };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.themebtn').forEach((b) => b.addEventListener('click', () => window.setTheme(dark() ? 'light' : 'dark')));
    apply();
  });
})();
