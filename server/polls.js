const crypto = require('crypto');

const MAX_POLLS = 500;
const MAX_TITLE = 120;
const MAX_OPTIONS = 20;
const MAX_OPTION = 160;
const DEFAULT_TTL = 7 * 24 * 3600 * 1000;   // a lejárat nélküli (régi) szavazás a létrehozása után egy héttel jár le
const AUDIENCES = ['', 'bent'];            // 'bent': csak aki aznap helyben lépett be

// az automatikus napi ebédszavazás (10:00 és 12:30 között, csak a helyben lévőknek)
const LUNCH = [
  { key: 'lunch-brought', title: '🍱 Hoztál ma ebédet?', options: ['Igen, hoztam', 'Nem hoztam'] },
  { key: 'lunch-time', title: '🕛 Mikor megyünk ebédelni?', options: ['11:30', '11:45', '12:00', '12:15', '12:30', '13:00', 'Ma nem jövök'] },
];
const LUNCH_FROM = 10 * 60, LUNCH_TO = 12 * 60 + 30;   // percben, budapesti idő szerint

const cleanText = (value, max) => String(value ?? '')
  .replace(/[\u0000-\u001f<>]/g, '')
  .trim()
  .slice(0, max);

const cleanNick = (value) => cleanText(value, 16).replace(/[&"]/g, '');

function uniqueOptions(value) {
  const seen = new Set();
  const options = [];
  for (const raw of Array.isArray(value) ? value : []) {
    if (options.length >= MAX_OPTIONS) break;
    const option = cleanText(raw, MAX_OPTION);
    if (!option || seen.has(option.toLocaleLowerCase('hu-HU'))) continue;
    seen.add(option.toLocaleLowerCase('hu-HU'));
    options.push(option);
  }
  return options;
}

function normalize(value) {
  const out = [];
  for (const raw of Array.isArray(value) ? value.slice(0, MAX_POLLS) : []) {
    const id = cleanText(raw?.id, 24);
    const title = cleanText(raw?.title, MAX_TITLE);
    const options = uniqueOptions(raw?.options);
    if (!id || !title || options.length < 2) continue;
    const votes = {};
    for (const [rawNick, rawChoices] of Object.entries(raw?.votes && typeof raw.votes === 'object' ? raw.votes : {})) {
      const nick = cleanNick(rawNick);
      const choices = normalizeChoices(rawChoices, options.length, !!raw.multiple);
      if (nick.length >= 2 && choices.length) votes[nick] = choices;
    }
    out.push({
      id,
      creator: cleanNick(raw?.creator),
      title,
      options,
      multiple: !!raw.multiple,
      votes,
      createdAt: Number.isFinite(raw?.createdAt) ? raw.createdAt : Date.now(),
      updatedAt: Number.isFinite(raw?.updatedAt) ? raw.updatedAt : Date.now(),
      closesAt: Number.isFinite(raw?.closesAt) && raw.closesAt > 0 ? raw.closesAt : 0,
      audience: AUDIENCES.includes(raw?.audience) ? raw.audience : '',
      auto: cleanText(raw?.auto, 40),
    });
  }
  return out;
}

function normalizeChoices(value, optionCount, multiple) {
  const choices = [...new Set((Array.isArray(value) ? value : [value])
    .map(Number)
    .filter((choice) => Number.isInteger(choice) && choice >= 0 && choice < optionCount))].sort((a, b) => a - b);
  if (!multiple && choices.length > 1) return choices.slice(0, 1);
  return choices;
}

function newId(polls) {
  let id;
  do id = crypto.randomBytes(7).toString('base64url');
  while ((Array.isArray(polls) ? polls : []).some((poll) => poll.id === id));
  return id;
}

function create(polls, input) {
  const title = cleanText(input?.title, MAX_TITLE);
  const options = uniqueOptions(input?.options);
  if (title.length < 2) return { error: 'A cím legalább 2 karakter legyen.' };
  if (options.length < 2) return { error: 'Legalább két különböző opció szükséges.' };
  const now = input?.now || Date.now();
  const closesAt = Number(input?.closesAt);
  if (closesAt && !(closesAt > now && closesAt <= now + 31 * 24 * 3600 * 1000)) return { error: 'Érvénytelen lejárat.' };
  const poll = {
    id: newId(polls),
    creator: cleanNick(input?.creator),
    title,
    options,
    multiple: !!input?.multiple,
    votes: {},
    createdAt: now,
    updatedAt: now,
    closesAt: closesAt || 0,
    audience: AUDIENCES.includes(input?.audience) ? input.audience : '',
    auto: cleanText(input?.auto, 40),
  };
  polls.unshift(poll);
  return { poll };
}

function find(polls, id) {
  const target = cleanText(id, 24);
  return (Array.isArray(polls) ? polls : []).find((poll) => poll.id === target) || null;
}

const closesAt = (poll) => poll.closesAt || poll.createdAt + DEFAULT_TTL;
const isOpen = (poll, now = Date.now()) => now < closesAt(poll);
// látja-e: a 'bent' közönségű szavazást csak az, aki aznap helyben lépett be
const canSee = (poll, ctx = {}) => !poll.audience || (poll.audience === 'bent' && !!ctx.bent);

function vote(poll, nick, value, now = Date.now()) {
  const player = cleanNick(nick);
  if (player.length < 2) return 'Előbb adj meg becenevet.';
  if (!isOpen(poll, now)) return 'Ez a szavazás már lezárult.';
  const choices = normalizeChoices(value, poll.options.length, poll.multiple);
  if (!choices.length) return 'Válassz legalább egy opciót.';
  if (!poll.multiple && choices.length !== 1) return 'Itt pontosan egy opciót választhatsz.';
  poll.votes[player] = choices;
  poll.updatedAt = Date.now();
  return null;
}

function edit(poll, editor, input) {
  if (poll.auto) return 'Az automatikus szavazás nem szerkeszthető.';
  if (cleanNick(editor) !== poll.creator) return 'Ezt a szavazást csak a létrehozó szerkesztheti.';
  const title = cleanText(input?.title, MAX_TITLE);
  const options = uniqueOptions(input?.options);
  if (title.length < 2) return 'A cím legalább 2 karakter legyen.';
  if (options.length < 2) return 'Legalább két különböző opció szükséges.';
  const nextByLabel = new Map(options.map((option, index) => [option.toLocaleLowerCase('hu-HU'), index]));
  const votes = {};
  for (const [nick, choices] of Object.entries(poll.votes)) {
    const remapped = [...new Set(choices
      .map((choice) => poll.options[choice])
      .map((option) => nextByLabel.get(String(option || '').toLocaleLowerCase('hu-HU')))
      .filter((choice) => Number.isInteger(choice)))].sort((a, b) => a - b);
    if (!poll.multiple && remapped.length > 1) remapped.splice(1);
    if (remapped.length) votes[nick] = remapped;
  }
  poll.title = title;
  poll.options = options;
  poll.votes = votes;
  poll.updatedAt = Date.now();
  return null;
}

function list(value, viewer = '', ctx = {}) {
  const player = cleanNick(viewer), now = ctx.now || Date.now();
  return (Array.isArray(value) ? value : []).filter((poll) => canSee(poll, ctx)).map((poll) => ({
    id: poll.id,
    title: poll.title,
    creator: poll.creator,
    multiple: poll.multiple,
    voters: Object.keys(poll.votes).length,
    createdAt: poll.createdAt,
    closesAt: closesAt(poll),
    open: isOpen(poll, now),
    voted: !!poll.votes[player],
    editable: !!player && player === poll.creator && !poll.auto,
  }));
}

function view(poll, viewer = '') {
  const counts = poll.options.map(() => 0);
  const votersByOption = poll.options.map(() => []);
  for (const [nick, choices] of Object.entries(poll.votes)) {
    for (const choice of choices) {
      if (counts[choice] !== undefined) {
        counts[choice]++;
        votersByOption[choice].push(nick);
      }
    }
  }
  const player = cleanNick(viewer);
  return {
    id: poll.id,
    creator: poll.creator,
    title: poll.title,
    options: poll.options,
    multiple: poll.multiple,
    counts,
    votersByOption,
    voters: Object.keys(poll.votes).length,
    choices: poll.votes[player] || [],
    createdAt: poll.createdAt,
    updatedAt: poll.updatedAt,
    closesAt: closesAt(poll),
    open: isOpen(poll),
    audience: poll.audience,
    auto: poll.auto,
  };
}

// hány érvényes (le nem járt, neki látható) szavazásra nem válaszolt még
function pending(value, viewer, ctx = {}) {
  const player = cleanNick(viewer), now = ctx.now || Date.now();
  if (player.length < 2) return 0;
  return (Array.isArray(value) ? value : []).filter((poll) => canSee(poll, ctx) && isOpen(poll, now) && !poll.votes[player]).length;
}

// a mai ebédszavazások: 10:00 és 12:30 között létrehozza őket, ha még nincsenek (minute: a budapesti idő percben, closeAt: 12:30 időbélyege)
function ensureLunch(value, day, minute, closeAt, now = Date.now()) {
  if (minute < LUNCH_FROM || minute >= LUNCH_TO) return [];
  const made = [];
  for (const l of [...LUNCH].reverse()) {   // fordítva, hogy a listában a „Hoztál ebédet?” legyen elöl
    const auto = `${l.key}:${day}`;
    if (value.some((p) => p.auto === auto)) continue;
    const r = create(value, { creator: 'Exmentoring', title: l.title, options: l.options, closesAt: closeAt, audience: 'bent', auto, now });
    if (r.poll) made.push(r.poll);
  }
  return made;
}
// a mai ebédszavazások (a nagy ablakhoz és a bal oldali kártyához), ha még érvényesek
function lunch(value, day, now = Date.now()) {
  const found = LUNCH.map((l) => value.find((p) => p.auto === `${l.key}:${day}`));
  if (found.some((p) => !p) || !found.every((p) => isOpen(p, now))) return null;
  return found;
}

module.exports = { MAX_OPTIONS, MAX_OPTION, LUNCH, LUNCH_FROM, LUNCH_TO, normalize, create, find, vote, edit, list, view, isOpen, canSee, pending, ensureLunch, lunch };
