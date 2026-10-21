// Kólakódok: aki nem használja a kódját, felteszi; aki felhasználta, megjelöli. Tiszta logika, a szerver hívja.
const crypto = require('crypto');

const UNDO_MS = 10 * 60 * 1000;          // a „felhasználva” jelölés 10 percig visszavonható (elkattintás ellen)
const KEEP_USED_MS = 30 * 24 * 3600 * 1000;
const empty = () => ({ codes: [] });
const cleanCode = (s) => String(s || '').toUpperCase().replace(/[\s ]/g, '');
const cleanBy = (s) => String(s || '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 16);

function add(C, code, by, now = Date.now()) {
  code = cleanCode(code);
  if (!/^[A-Z0-9-]{4,24}$/.test(code)) return { error: 'A kód 4–24 karakter lehet: betűk, számok, kötőjel.' };
  if (C.codes.some((c) => c.code === code)) return { error: 'Ez a kód már fent van.' };
  if (C.codes.filter((c) => !c.usedAt).length >= 300) return { error: 'Túl sok szabad kód van fent.' };
  const item = { id: crypto.randomBytes(6).toString('hex'), code, by: cleanBy(by), at: now, usedBy: '', usedAt: 0 };
  C.codes.unshift(item);
  return { item };
}

function markUsed(C, id, by, now = Date.now()) {
  const c = C.codes.find((x) => x.id === id);
  if (!c) return 'Nincs ilyen kód.';
  if (c.usedAt) return 'Ezt a kódot már valaki felhasználta.';
  c.usedAt = now; c.usedBy = cleanBy(by);
  return null;
}

function unmark(C, id, now = Date.now()) {
  const c = C.codes.find((x) => x.id === id);
  if (!c || !c.usedAt) return 'Ez a kód nincs felhasználtként megjelölve.';
  if (now - c.usedAt > UNDO_MS) return 'A jelölést csak 10 percig lehet visszavonni.';
  c.usedAt = 0; c.usedBy = '';
  return null;
}

// a régi, felhasznált kódok 30 nap után eltűnnek
function prune(C, now = Date.now()) {
  C.codes = C.codes.filter((c) => !c.usedAt || now - c.usedAt < KEEP_USED_MS);
}

module.exports = { UNDO_MS, empty, cleanCode, add, markUsed, unmark, prune };
