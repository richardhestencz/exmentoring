// Tét-profilok a becenevekhez: elmentett tétkészletek, amiket egy kattintással (vagy minden körben automatikusan) fel lehet rakni.
const game = require('./game');

const MAX_PROFILES = 6, MAX_BETS = 80, MAX_TOTAL = 20000;
const empty = () => ({});
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 24);

// a tétek összevonása mezőnként (a zsetonok sorrendje nem számít), csak érvényes tétek és zsetonok
function normalize(bets) {
  const out = [];
  for (const b of Array.isArray(bets) ? bets : []) {
    const kind = game.norm(b && b.kind), stake = b && b.stake;
    if (!game.info(kind) || !game.CHIPS.includes(stake)) return null;
    out.push({ kind, stake });
  }
  return out;
}

function saveProfile(P, nick, name, bets) {
  name = cleanName(name);
  if (!name) return 'Adj nevet a profilnak.';
  const list = normalize(bets);
  if (!list || !list.length) return 'Előbb rakj fel téteket, azokat mentem el profilként.';
  if (list.length > MAX_BETS) return `Egy profilban legfeljebb ${MAX_BETS} zseton lehet.`;
  if (list.reduce((s, b) => s + b.stake, 0) > MAX_TOTAL) return 'Egy profil legfeljebb 20 000 lehet.';
  const mine = (P[nick] ||= []);
  const i = mine.findIndex((p) => p.name === name);
  if (i < 0 && mine.length >= MAX_PROFILES) return `Legfeljebb ${MAX_PROFILES} profilod lehet. Törölj egyet.`;
  const p = { name, bets: list };
  if (i < 0) mine.push(p); else mine[i] = p;
  return null;
}

function deleteProfile(P, nick, name) {
  const mine = P[nick] || [], i = mine.findIndex((p) => p.name === name);
  if (i < 0) return 'Nincs ilyen profil.';
  mine.splice(i, 1);
  if (!mine.length) delete P[nick];
  return null;
}

const getProfile = (P, nick, name) => (P[nick] || []).find((p) => p.name === name) || null;
const total = (bets) => bets.reduce((s, b) => s + b.stake, 0);

module.exports = { MAX_PROFILES, empty, normalize, saveProfile, deleteProfile, getProfile, total };
