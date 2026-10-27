// Chapter esemény: naptáras időpont-szavazás. Mindenki bejelöli, mely napok jók neki; a legtöbbet jelölt nap vezet.
const QUESTION = 'Mikor legyen az AI chapter nagyba?';
const FROM = '2026-11-01', TO = '2026-11-30';   // egyelőre csak november; ebből a sávból lehet akárhány napot választani
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 80;

const empty = () => ({ votes: {} });   // becenév -> ['2026-11-14', ...]

// csak érvényes, a sávba eső napok, rendezve, ismétlés nélkül
function cleanDays(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((d) => typeof d === 'string' && DAY.test(d) && d >= FROM && d <= TO))].sort().slice(0, MAX_DAYS);
}

function normalize(value) {
  const votes = {};
  for (const [nick, days] of Object.entries(value && value.votes && typeof value.votes === 'object' ? value.votes : {})) {
    const d = cleanDays(days);
    if (nick && d.length) votes[nick] = d;
  }
  return { votes };
}

// a saját napjaink beállítása; a mai napnál korábbit nem lehet újonnan bejelölni (a régiek megmaradnak)
function setDays(C, nick, days, today) {
  if (!nick) return 'Előbb add meg a beceneved.';
  if (!Array.isArray(days) || days.length > MAX_DAYS) return 'Érvénytelen napok.';
  const had = new Set(C.votes[nick] || []);
  const d = cleanDays(days).filter((x) => x >= today || had.has(x));
  if (d.length) C.votes[nick] = d; else delete C.votes[nick];
  return null;
}

const view = (C) => ({ question: QUESTION, from: FROM, to: TO, votes: C.votes });

module.exports = { QUESTION, FROM, TO, empty, normalize, setDays, view };
