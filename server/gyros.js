// Gyros Központ: számozott gyrosnyugták gyűjtése (001-től), aliasonként. Tiszta logika, a szerver hívja.
const EXCLUDED = new Set(['000']);
const ROW = 10;

const key = (n) => String(n).padStart(3, '0');
const graphemes = (s) => [...new Intl.Segmenter('hu', { granularity: 'grapheme' }).segment(s)].length;
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const cleanAlias = (s) => String(s || '').replace(/[\u0000-\u001f<>&"\s]/g, '');

function empty() {
  return { contributors: [], receipts: {}, maxNumber: 209 };
}

// A Confluence-ből jött seed: receipts értéke alias vagy null (csak pipa volt a cellában)
function fromSeed(seed) {
  const g = empty();
  g.maxNumber = Number.isInteger(seed.maxNumber) ? seed.maxNumber : 209;
  for (const c of seed.contributors || []) {
    const name = cleanName(c.name), alias = cleanAlias(c.alias);
    if (name && alias && graphemes(alias) <= 2 && !g.contributors.some((x) => x.alias === alias)) g.contributors.push({ name, alias });
  }
  for (const [k, a] of Object.entries(seed.receipts || {})) {
    const n = parseInt(k, 10);
    if (!Number.isInteger(n) || n < 1 || EXCLUDED.has(key(n))) continue;
    g.receipts[key(n)] = { alias: a && g.contributors.some((x) => x.alias === a) ? a : null, at: null };
    if (n > g.maxNumber) g.maxNumber = Math.ceil((n + 1) / ROW) * ROW - 1;
  }
  return g;
}

function parseNumber(g, number) {
  const n = typeof number === 'number' ? number : /^\d{1,4}$/.test(String(number)) ? parseInt(number, 10) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > g.maxNumber + ROW) return null;
  return n;
}

// Mindegyik null-t ad vissza siker esetén, különben a hibaüzenetet
function claim(g, number, alias, now = Date.now()) {
  const n = parseNumber(g, number);
  if (n === null) return `A szám 001 és ${key(g.maxNumber + ROW)} között lehet.`;
  if (!g.contributors.some((c) => c.alias === alias)) return 'Előbb válaszd ki az aliasodat.';
  const k = key(n);
  if (g.receipts[k]) return `A ${k} már megvan.`;
  g.receipts[k] = { alias, at: now };
  if (n > g.maxNumber) g.maxNumber = Math.ceil((n + 1) / ROW) * ROW - 1;   // a rács bővül egy sorral
  return null;
}

function unclaim(g, number, alias) {
  const n = parseNumber(g, number);
  if (n === null) return 'Ismeretlen szám.';
  const r = g.receipts[key(n)];
  if (!r) return 'Ez a cella üres.';
  if (!r.alias || r.alias !== alias) return 'Csak a saját aliasoddal rögzített nyugtát vonhatod vissza.';
  delete g.receipts[key(n)];
  return null;
}

function addContributor(g, name, alias) {
  name = cleanName(name); alias = cleanAlias(alias);
  if (name.length < 2) return 'A név legalább 2 karakter.';
  if (!alias) return 'Adj meg egy aliast (1-2 karakter, pl. emoji).';
  if (graphemes(alias) > 2) return 'Az alias legfeljebb 2 karakter lehet.';
  if (g.contributors.some((c) => c.alias === alias)) return 'Ez az alias már foglalt.';
  if (g.contributors.length >= 200) return 'Túl sok hozzájáruló.';
  g.contributors.push({ name, alias });
  return null;
}

function counts(g) {
  const by = {};
  let none = 0;
  for (const r of Object.values(g.receipts)) if (r.alias) by[r.alias] = (by[r.alias] || 0) + 1; else none++;
  return { by, none, total: Object.keys(g.receipts).length, of: g.maxNumber };
}

module.exports = { EXCLUDED, key, graphemes, empty, fromSeed, claim, unclaim, addContributor, counts };
