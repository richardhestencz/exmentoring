const crypto = require('crypto');

const MAX_POLLS = 500;
const MAX_TITLE = 120;
const MAX_OPTIONS = 20;
const MAX_OPTION = 160;

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
  const now = Date.now();
  const poll = {
    id: newId(polls),
    creator: cleanNick(input?.creator),
    title,
    options,
    multiple: !!input?.multiple,
    votes: {},
    createdAt: now,
    updatedAt: now,
  };
  polls.unshift(poll);
  return { poll };
}

function find(polls, id) {
  const target = cleanText(id, 24);
  return (Array.isArray(polls) ? polls : []).find((poll) => poll.id === target) || null;
}

function vote(poll, nick, value) {
  const player = cleanNick(nick);
  if (player.length < 2) return 'Előbb adj meg becenevet.';
  const choices = normalizeChoices(value, poll.options.length, poll.multiple);
  if (!choices.length) return 'Válassz legalább egy opciót.';
  if (!poll.multiple && choices.length !== 1) return 'Itt pontosan egy opciót választhatsz.';
  poll.votes[player] = choices;
  poll.updatedAt = Date.now();
  return null;
}

function edit(poll, editor, input) {
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

function list(value, viewer = '') {
  const player = cleanNick(viewer);
  return (Array.isArray(value) ? value : []).map((poll) => ({
    id: poll.id,
    title: poll.title,
    creator: poll.creator,
    multiple: poll.multiple,
    voters: Object.keys(poll.votes).length,
    createdAt: poll.createdAt,
    editable: !!player && player === poll.creator,
  }));
}

function view(poll, viewer = '') {
  const counts = poll.options.map(() => 0);
  for (const choices of Object.values(poll.votes)) {
    for (const choice of choices) if (counts[choice] !== undefined) counts[choice]++;
  }
  const player = cleanNick(viewer);
  return {
    id: poll.id,
    creator: poll.creator,
    title: poll.title,
    options: poll.options,
    multiple: poll.multiple,
    counts,
    voters: Object.keys(poll.votes).length,
    choices: poll.votes[player] || [],
    createdAt: poll.createdAt,
    updatedAt: poll.updatedAt,
  };
}

module.exports = { MAX_OPTIONS, MAX_OPTION, normalize, create, find, vote, edit, list, view };
