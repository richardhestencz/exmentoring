// Card-Jitsu rules and in-memory room service. Only sanitized statistics persist.
const crypto = require('crypto');
const ELEMENTS = ['fire', 'snow', 'water'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
const BEATS = { fire: 'snow', snow: 'water', water: 'fire' };
const STAT_KEYS = ['wins', 'losses', 'pvpWins', 'pvpLosses', 'easyWins', 'easyLosses', 'normalWins', 'normalLosses', 'hardWins', 'hardLosses'];
const BELTS = [[5, 'fehér'], [13, 'sárga'], [21, 'narancs'], [30, 'zöld'], [40, 'kék'], [52, 'piros'], [64, 'lila'], [76, 'barna'], [88, 'fekete']];
const HU = { fire: 'tűz', snow: 'hó', water: 'víz', red: 'piros', blue: 'kék', yellow: 'sárga', green: 'zöld', orange: 'narancs', purple: 'lila' };

// Exactly 24 variants; index assignment gives every element eight power cards.
const EFFECT_SPECS = [
  ['plus', '', '+2 saját érték a következő körben'],
  ['minus', '', '−2 az ellenfélnek a következő körben'],
  ['low', '', 'A kisebb érték nyer a következő körben'],
  ...ELEMENTS.map((x) => ['discardElement', x, `Egy ${HU[x]} nyert lap eldobása`]),
  ...COLORS.map((x) => ['discardColor', x, `Egy ${HU[x]} nyert lap eldobása`]),
  ...COLORS.map((x) => ['discardAll', x, `Minden ${HU[x]} nyert lap eldobása`]),
  ...ELEMENTS.map((x) => ['transform', x, `Kijátszáskor: ${HU[x]} → ${HU[BEATS[x]]} mindkét félnél, erre a körre`]),
  ...ELEMENTS.map((x) => ['block', x, `${HU[x]} blokkolása a következő körben`]),
];
const EFFECTS = EFFECT_SPECS.map(([kind, target, label], i) => ({
  id: `${kind}-${target || 'next'}`, kind, target: target || undefined,
  element: ELEMENTS[i % 3], color: COLORS[i % 6], value: 9 + (i % 4),
  label: ['transform', 'low'].includes(kind) ? (kind === 'low' ? `Kijátszáskor: ${label.toLowerCase()}` : label) : `Környeréskor: ${label.toLowerCase()}`,
}));
function makeCatalog() {
  const cards = [];
  for (const element of ELEMENTS) for (const color of COLORS) for (let value = 2; value <= 8; value++) cards.push({ id: `${element}-${color}-${value}`, element, color, value });
  return cards.concat(EFFECTS.map((card) => ({ ...card })));
}
const CATALOG = makeCatalog();
const cloneCard = (card) => card && { ...card };
const shuffle = (cards, rng = Math.random) => {
  const out = cards.map(cloneCard);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

function roundWinner(a, b, modifiers = {}) {
  if (!a && !b) return -1;
  if (!a) return 1;
  if (!b) return 0;
  if (a.element !== b.element) return BEATS[a.element] === b.element ? 0 : 1;
  const av = a.value + (modifiers.a || 0), bv = b.value + (modifiers.b || 0);
  if (av === bv) return -1;
  return modifiers.low ? (av < bv ? 0 : 1) : (av > bv ? 0 : 1);
}
function winningScore(cards) {
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) for (let k = j + 1; k < cards.length; k++) {
    const three = [cards[i], cards[j], cards[k]];
    if (new Set(three.map((card) => card.color)).size !== 3) continue;
    const elements = new Set(three.map((card) => card.element)).size;
    if (elements === 1 || elements === 3) return true;
  }
  return false;
}
const emptyStats = () => Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
const safeNick = (value) => /^[\p{L}\p{N} _.-]{2,16}$/u.test(String(value || ''));
function normalizeStats(value) {
  const out = Object.create(null);
  for (const [nick, raw] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (!safeNick(nick)) continue;
    out[nick] = emptyStats();
    for (const key of STAT_KEYS) { const n = Number(raw?.[key]); out[nick][key] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  }
  return out;
}
function belt(stats) {
  const wins = Math.max(0, Math.floor(Number(stats?.wins) || 0)); let index = -1;
  for (let i = 0; i < BELTS.length && wins >= BELTS[i][0]; i++) index = i;
  const next = BELTS[index + 1] || null, base = index < 0 ? 0 : BELTS[index][0];
  return { name: index < 0 ? 'nincs öv' : BELTS[index][1], wins, next: next ? { wins: next[0], name: next[1] } : null, progress: next ? { current: wins - base, needed: next[0] - base } : null };
}
function drawToFive(player, rng = Math.random) {
  while (player.hand.length < 5) {
    if (!player.deck.length && player.discard.length) { player.deck = shuffle(player.discard, rng); player.discard.length = 0; }
    if (!player.deck.length) break;
    player.hand.push(player.deck.pop());
  }
}
function makePlayer({ id, nick, tint = 0xffffff, bot = false, difficulty = '', rng = Math.random }) {
  const player = { id, nick, tint, bot, difficulty, deck: shuffle(CATALOG, rng), hand: [], discard: [], scored: [], selectedId: null, decided: false, missed: 0, mods: {}, nextMods: {}, ws: null, token: '', match: null, mat: null, watchMat: null, inRoom: true, disconnectedAt: 0, expiryTimer: null };
  drawToFive(player, rng); return player;
}
const legalCards = (player) => player.hand.filter((card) => player.mods.block !== card.element);
function effectiveCard(card, transforms = []) { if (!card) return null; const out = cloneCard(card); if (transforms.includes(card.element)) out.element = BEATS[card.element]; return out; }
function comparePair(a, b, modifiers) {
  const transforms = [a, b].filter((card) => card?.kind === 'transform').map((card) => card.target);
  return roundWinner(effectiveCard(a, transforms), effectiveCard(b, transforms), modifiers);
}
function removeScored(opponent, card, rng) {
  const matches = opponent.scored.filter((scored) => card.kind === 'discardElement' ? scored.element === card.target : scored.color === card.target);
  if (!matches.length) return [];
  if (card.kind === 'discardAll') { const removed = opponent.scored.filter((scored) => scored.color === card.target); opponent.scored = opponent.scored.filter((scored) => scored.color !== card.target); opponent.discard.push(...removed); return removed; }
  const removed = matches[Math.floor(rng() * matches.length)]; opponent.scored.splice(opponent.scored.indexOf(removed), 1); opponent.discard.push(removed); return [removed];
}
function applyOnPlay(card, own, other) { if (card?.kind === 'low') { own.nextMods.low = true; other.nextMods.low = true; } }
function applyOnWin(card, own, other, rng) {
  if (!card?.kind) return [];
  if (card.kind === 'plus') own.nextMods.plus = (own.nextMods.plus || 0) + 2;
  if (card.kind === 'minus') other.nextMods.minus = (other.nextMods.minus || 0) - 2;
  if (card.kind === 'block') other.nextMods.block = card.target;
  if (card.kind.startsWith('discard')) return removeScored(other, card, rng);
  return [];
}
function candidateScore(player, card, publicState, hard) {
  const ownWin = winningScore(player.scored.concat(card)) ? 120 : 0, power = card.kind ? 8 : 0;
  const foe = publicState?.players?.find((p) => p.id !== player.id);
  const modifiers = { a: (player.mods.plus || 0) + (player.mods.minus || 0), b: (foe?.mods?.plus || 0) + (foe?.mods?.minus || 0), low: !!(player.mods.low || foe?.mods?.low) };
  const possibleCards = hard ? CATALOG : CATALOG.filter((_, i) => i % 5 === 0); let matchup = 0;
  for (const possible of possibleCards) {
    if (foe?.mods?.block === possible.element) continue;
    const w = comparePair(card, possible, modifiers);
    matchup += w === 0 ? 2 : w === 1 ? -2 : 0;
  }
  const deny = foe?.scored?.length >= 2 ? matchup / possibleCards.length * 5 : 0;
  const threats = foe?.scored?.length >= 2 ? CATALOG.filter((possible) => foe.mods?.block !== possible.element && winningScore(foe.scored.concat(possible))) : [];
  let threatScore = 0;
  for (const threat of threats) { const w = comparePair(card, threat, modifiers); threatScore += w === 0 ? 2 : w === 1 ? -2 : 0; }
  return ownWin + power + card.value + matchup / possibleCards.length + deny + (threats.length ? threatScore / threats.length * (hard ? 35 : 18) : 0);
}
// Receives only the bot's own private state and the public projection.
function decideBot(player, publicState, rng = Math.random) {
  const legal = legalCards(player); if (!legal.length) return null;
  if (player.difficulty === 'easy') return legal[Math.floor(rng() * legal.length)].id;
  let best = legal[0], bestScore = -Infinity;
  for (const card of legal) { const score = candidateScore(player, card, publicState, player.difficulty === 'hard') + rng() * (player.difficulty === 'normal' ? 3 : 0.01); if (score > bestScore) { best = card; bestScore = score; } }
  return best.id;
}

function create(options = {}) {
  const now = options.now || Date.now, rng = options.rng || Math.random, later = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout, save = options.save || (() => {}), stats = options.stats || {}, id = options.id || ((bytes = 9) => crypto.randomBytes(bytes).toString('base64url'));
  const mats = Array.from({ length: 3 }, (_, index) => ({ index, seats: [], match: null, watchers: new Set() }));
  const sessions = new Map(), roomPlayers = new Set();
  const send = (ws, message) => { if (ws?.readyState === 1) try { ws.send(JSON.stringify(message)); } catch {} };
  const error = (ws, msg, extra = {}) => (send(ws, { t: 'cj-error', msg, ...extra }), true);
  const playerStats = (player) => Object.hasOwn(stats, player.nick) && stats[player.nick] && typeof stats[player.nick] === 'object' ? stats[player.nick] : emptyStats();
  const writableStats = (player) => {
    if (!Object.hasOwn(stats, player.nick) || !stats[player.nick] || typeof stats[player.nick] !== 'object') Object.defineProperty(stats, player.nick, { value: emptyStats(), enumerable: true, configurable: true, writable: true });
    return stats[player.nick];
  };
  const publicPlayer = (player) => ({ id: player.id, nick: player.nick, tint: player.tint, bot: player.bot, difficulty: player.bot ? player.difficulty : undefined, belt: belt(playerStats(player)), scored: player.scored.map(cloneCard), count: player.hand.length, ready: player.decided, mods: { ...player.mods } });
  const publicMatch = (match) => match && ({ id: match.id, mat: match.mat.index, round: match.round, phase: match.phase, endAt: match.paused ? 0 : match.endAt, paused: match.paused, players: match.players.map(publicPlayer), result: match.result ? { ...match.result, cards: match.result.cards?.map(cloneCard), removed: match.result.removed?.map(cloneCard) } : null, rematch: [...match.rematch] });
  const roomView = () => ({ t: 'cj-room', users: [...roomPlayers].filter((p) => p.ws).map((p) => ({ id: p.id, nick: p.nick, tint: p.tint, belt: belt(playerStats(p)), mat: p.mat?.index ?? null, watching: p.watchMat?.index ?? null })), mats: mats.map((mat) => ({ i: mat.index, active: !!mat.match, watchers: mat.watchers.size, players: mat.seats.map(publicPlayer), phase: mat.match?.phase || (mat.seats.length ? 'waiting' : 'empty') })) });
  const privateState = (player) => ({ t: 'cj-state', playerId: player.id, token: player.token, match: publicMatch(player.match), hand: player.match ? player.hand.map(cloneCard) : [], decided: player.decided, mods: { ...player.mods }, stats: { ...playerStats(player) }, belt: belt(playerStats(player)), watching: player.watchMat?.index ?? null });
  function broadcastRoom() { const view = roomView(); for (const player of roomPlayers) send(player.ws, view); }
  function sendMatch(match, roundEvent = false) {
    const view = publicMatch(match);
    for (const player of match.players) if (!player.bot) send(player.ws, privateState(player));
    for (const ws of match.mat.watchers) send(ws, { t: 'cj-state', match: view, spectator: true });
    if (roundEvent && match.result) { const message = { t: 'cj-round', match: view }; for (const player of match.players) if (!player.bot) send(player.ws, message); for (const ws of match.mat.watchers) send(ws, message); }
    broadcastRoom();
  }
  function clearMatchTimers(match) { cancel(match.timer); match.timer = null; for (const timer of match.botTimers) cancel(timer); match.botTimers.clear(); }
  function cleanupMatch(match) {
    clearMatchTimers(match);
    for (const ws of match.mat.watchers) { if (ws.cjPlayer) { ws.cjPlayer.watchMat = null; send(ws, privateState(ws.cjPlayer)); } }
    match.mat.watchers.clear();
    for (const player of match.players) { player.match = null; player.mat = null; player.selectedId = null; player.decided = false; }
    match.mat.match = null; match.mat.seats = [];
    for (const player of match.players) if (!player.bot) send(player.ws, privateState(player));
  }
  function book(match, winnerIndex) {
    if (match.booked || winnerIndex < 0) return; match.booked = true;
    const bot = match.players.find((player) => player.bot);
    if (bot) { const human = match.players.find((player) => !player.bot), won = match.players[winnerIndex] === human, record = writableStats(human); record[won ? 'wins' : 'losses']++; record[`${bot.difficulty}${won ? 'Wins' : 'Losses'}`]++; }
    else for (let i = 0; i < match.players.length; i++) { const record = writableStats(match.players[i]), won = i === winnerIndex; record[won ? 'wins' : 'losses']++; record[`pvp${won ? 'Wins' : 'Losses'}`]++; }
    save();
  }
  function finish(match, winnerIndex, text, countResult) { clearMatchTimers(match); match.phase = 'done'; match.endAt = 0; match.paused = false; match.result = { ...(match.result || {}), winner: winnerIndex, text, final: true }; if (countResult) book(match, winnerIndex); sendMatch(match, true); }
  function schedule(match, delay, callback) { cancel(match.timer); match.remaining = delay; match.endAt = now() + delay; match.timer = later(() => { match.timer = null; if (!match.paused) callback(match); }, delay); match.timer?.unref?.(); }
  function botMove(match, player) { if (match.phase === 'select' && !player.decided && !match.paused) choose(match, player, decideBot(player, publicMatch(match), rng), 'bot'); }
  function beginRound(match) {
    if (match.phase === 'done') return; clearMatchTimers(match); match.round++; match.phase = 'select'; match.result = null; match.paused = false; match.rematch.clear();
    for (const player of match.players) { player.mods = player.nextMods; player.nextMods = {}; player.selectedId = null; player.decided = false; drawToFive(player, rng); }
    schedule(match, 20000, timeoutRound);
    for (const player of match.players.filter((p) => p.bot)) { const delay = 350 + Math.floor(rng() * 650), timer = later(() => (match.botTimers.delete(timer), botMove(match, player)), delay); timer?.unref?.(); match.botTimers.add(timer); }
    sendMatch(match);
  }
  function timeoutRound(match) {
    if (match.phase !== 'select') return;
    for (const player of match.players) {
      if (player.decided || player.bot) continue; player.missed++;
      if (player.missed >= 3) return finish(match, match.players.indexOf(player) ^ 1, `${player.nick} háromszor nem döntött időben.`, match.resolvedRounds > 0);
      const legal = legalCards(player); choose(match, player, legal.length ? legal[Math.floor(rng() * legal.length)].id : null, 'timeout', false);
    }
    for (const player of match.players.filter((p) => p.bot && !p.decided)) botMove(match, player);
    if (match.players.every((player) => player.decided)) resolveRound(match);
  }
  function resolveRound(match) {
    if (match.phase !== 'select' || !match.players.every((player) => player.decided)) return;
    clearMatchTimers(match); const [a, b] = match.players;
    const printed = [a, b].map((player) => player.selectedId ? player.hand.find((card) => card.id === player.selectedId) : null);
    applyOnPlay(printed[0], a, b); applyOnPlay(printed[1], b, a);
    const transforms = printed.filter((card) => card?.kind === 'transform').map((card) => card.target);
    const compared = printed.map((card) => effectiveCard(card, transforms));
    const winnerIndex = roundWinner(compared[0], compared[1], { a: (a.mods.plus || 0) + (a.mods.minus || 0), b: (b.mods.plus || 0) + (b.mods.minus || 0), low: !!(a.mods.low || b.mods.low) }), removed = [];
    for (let i = 0; i < 2; i++) { const card = printed[i]; if (!card) continue; match.players[i].hand.splice(match.players[i].hand.indexOf(card), 1); if (i === winnerIndex) match.players[i].scored.push(card); else match.players[i].discard.push(card); }
    if (winnerIndex >= 0) removed.push(...applyOnWin(printed[winnerIndex], match.players[winnerIndex], match.players[winnerIndex ^ 1], rng));
    match.resolvedRounds++; match.phase = 'reveal'; match.result = { cards: printed.map(cloneCard), effective: compared.map((card) => card?.element || null), winner: winnerIndex, removed, text: winnerIndex < 0 ? 'Döntetlen kör.' : `${match.players[winnerIndex].nick} nyerte a kört.` };
    if (winnerIndex >= 0 && winningScore(match.players[winnerIndex].scored)) return finish(match, winnerIndex, `${match.players[winnerIndex].nick} megnyerte a párbajt!`, true);
    schedule(match, 3000, beginRound); sendMatch(match, true);
  }
  function choose(match, player, cardId, source = 'manual', resolve = true) {
    if (!match || match.phase !== 'select' || match.paused || player.match !== match || player.decided) return false;
    if (source === 'manual' && now() >= match.endAt) return false;
    const legal = legalCards(player); if (cardId === null ? legal.length : typeof cardId !== 'string' || !legal.some((card) => card.id === cardId)) return false;
    player.selectedId = cardId; player.decided = true; if (source === 'manual') player.missed = 0; sendMatch(match); if (resolve && match.players.every((candidate) => candidate.decided)) resolveRound(match); return true;
  }
  function startMatch(mat, players) {
    const match = { id: id(9), mat, players, phase: 'new', round: 0, resolvedRounds: 0, result: null, timer: null, botTimers: new Set(), endAt: 0, remaining: 0, paused: false, booked: false, rematch: new Set() };
    mat.match = match; mat.seats = players;
    for (const player of players) {
      player.deck = shuffle(CATALOG, rng); player.hand = []; player.discard = []; player.scored = [];
      player.mods = {}; player.nextMods = {}; player.selectedId = null; player.decided = false; player.missed = 0;
      player.match = match; player.mat = mat; player.watchMat = null;
    }
    beginRound(match); return match;
  }
  function pauseMatch(match) { if (match.paused || match.phase === 'done') return; match.remaining = Math.max(0, match.endAt - now()); clearMatchTimers(match); match.paused = true; match.endAt = 0; sendMatch(match); }
  function resumeMatch(match) {
    if (!match.paused || match.players.some((player) => !player.bot && !player.ws)) return; match.paused = false;
    if (match.phase === 'select') { schedule(match, Math.max(1, match.remaining), timeoutRound); for (const player of match.players.filter((p) => p.bot && !p.decided)) { const timer = later(() => (match.botTimers.delete(timer), botMove(match, player)), 350); timer?.unref?.(); match.botTimers.add(timer); } }
    else if (match.phase === 'reveal') schedule(match, Math.max(1, match.remaining), beginRound); sendMatch(match);
  }
  function detachFromMat(player) { if (player.watchMat) { player.watchMat.watchers.delete(player.ws); player.watchMat = null; } if (player.mat && !player.match) { player.mat.seats = player.mat.seats.filter((seat) => seat !== player); player.mat = null; } }
  function expire(player) {
    player.expiryTimer = null; if (player.ws || !player.disconnectedAt || now() - player.disconnectedAt < 30000) return; const match = player.match;
    if (match) {
      const humanCount = match.players.filter((p) => !p.bot).length, absent = match.players.filter((p) => !p.bot && !p.ws);
      if (match.phase === 'done' || (humanCount === 2 && absent.length === 2)) cleanupMatch(match);
      else if (match.resolvedRounds > 0) { finish(match, match.players.indexOf(player) ^ 1, `${player.nick} kapcsolata megszakadt.`, true); if (humanCount === 1) cleanupMatch(match); }
      else cleanupMatch(match);
    } else detachFromMat(player);
    roomPlayers.delete(player); sessions.delete(player.token); broadcastRoom();
  }
  function disconnect(player) { if (!player || player.bot || !player.ws) return; if (player.watchMat) { player.watchMat.watchers.delete(player.ws); player.watchMat = null; } player.ws = null; player.disconnectedAt = now(); if (player.match) pauseMatch(player.match); cancel(player.expiryTimer); player.expiryTimer = later(() => expire(player), 30000); player.expiryTimer?.unref?.(); broadcastRoom(); }
  function newSession(ws) { const city = ws.city; if (!city?.nick) return null; const player = makePlayer({ id: id(8), nick: city.nick, tint: city.tint, rng }); player.token = id(24); player.ws = ws; sessions.set(player.token, player); roomPlayers.add(player); ws.cjPlayer = player; return player; }
  function joinPvp(player, matIndex) { const mat = mats[matIndex]; if (!mat || mat.match || mat.seats.length >= 2) return 'Ez a tatami foglalt.'; if (player.mat || player.match || player.watchMat) return 'Már választottál helyet.'; player.mat = mat; mat.seats.push(player); if (mat.seats.length === 2) startMatch(mat, mat.seats.slice()); broadcastRoom(); send(player.ws, privateState(player)); return null; }
  function joinBot(player, difficulty) { if (!['easy', 'normal', 'hard'].includes(difficulty)) return 'Ismeretlen nehézség.'; if (player.mat || player.match || player.watchMat) return 'Már választottál helyet.'; const mat = mats.find((candidate) => !candidate.match && candidate.seats.length === 0); if (!mat) return 'Mindhárom tatami foglalt.'; player.mat = mat; const bot = makePlayer({ id: `bot-${id(5)}`, nick: { easy: 'Kölyök', normal: 'Mester', hard: 'Árnyék' }[difficulty], tint: 0xc58b52, bot: true, difficulty, rng }); startMatch(mat, [player, bot]); return null; }
  function leaveSeat(player, forfeit = false) {
    const match = player.match; if (!match) { detachFromMat(player); broadcastRoom(); send(player.ws, privateState(player)); return null; }
    if (match.phase !== 'done' && !forfeit) return 'Aktív párbajból csak feladással léphetsz ki.';
    if (match.phase !== 'done') { finish(match, match.players.indexOf(player) ^ 1, `${player.nick} feladta a párbajt.`, match.resolvedRounds > 0); return null; }
    cleanupMatch(match); broadcastRoom(); return null;
  }
  function rematch(player) {
    const match = player.match; if (!match || match.phase !== 'done') return 'A visszavágó most nem kérhető.'; match.rematch.add(player.id); const humans = match.players.filter((p) => !p.bot);
    if (match.players.some((p) => p.bot) || humans.every((p) => match.rematch.has(p.id))) { clearMatchTimers(match); startMatch(match.mat, match.players); } else sendMatch(match); return null;
  }
  function parse(raw) { const text = String(raw); if (!text.includes('cj-')) return null; try { const message = JSON.parse(text); return typeof message?.t === 'string' && message.t.startsWith('cj-') ? message : null; } catch { return false; } }
  function handle(ws, raw) {
    const message = parse(raw); if (message === null) return false; if (message === false) return true; const time = now(); if (!ws.cjRate || time - ws.cjRate.at >= 1000) ws.cjRate = { at: time, count: 0 }; if (++ws.cjRate.count > 20) return error(ws, 'Túl sok Card-Jitsu kérés.');
    if (message.t === 'cj-enter') { let player = ws.cjPlayer; if (!player) player = newSession(ws); if (!player) return error(ws, 'Előbb csatlakozz Loop Cityhez.'); player.inRoom = true; send(ws, roomView()); send(ws, privateState(player)); return true; }
    if (message.t === 'cj-resume') { if (ws.cjPlayer) return error(ws, 'Ez a kapcsolat már egy játékoshoz tartozik.'); const player = sessions.get(String(message.token || '')); if (!player || player.bot || player.ws || !player.disconnectedAt || time - player.disconnectedAt > 30000) return error(ws, 'A párbaj már nem állítható vissza.', { reset: true }); if (ws.city?.nick !== player.nick) return error(ws, 'Ez a visszaállítási kulcs másik játékoshoz tartozik.', { reset: true }); cancel(player.expiryTimer); player.expiryTimer = null; player.ws = ws; player.disconnectedAt = 0; ws.cjPlayer = player; send(ws, roomView()); send(ws, privateState(player)); if (player.match) resumeMatch(player.match); return true; }
    const player = ws.cjPlayer; if (!player) return error(ws, 'Előbb lépj be a dojōba.'); let problem = null;
    if (message.t === 'cj-join') problem = Number.isInteger(message.mat) ? joinPvp(player, message.mat) : 'Érvénytelen tatami.';
    else if (message.t === 'cj-bot') problem = joinBot(player, String(message.difficulty || ''));
    else if (message.t === 'cj-watch') { const mat = mats[Number(message.mat)]; if (player.mat || player.match || player.watchMat) problem = 'Már választottál helyet.'; else if (!mat?.match) problem = 'Ezen a tatamin nincs aktív párbaj.'; else { player.watchMat = mat; mat.watchers.add(ws); send(ws, { t: 'cj-state', match: publicMatch(mat.match), spectator: true }); broadcastRoom(); } }
    else if (message.t === 'cj-play') { const match = player.match; if (!match || message.match !== match.id || message.round !== match.round) problem = 'Lejárt vagy idegen kör.'; else if (!choose(match, player, message.card === null ? null : message.card, 'manual')) problem = 'Ez a döntés nem érvényes.'; }
    else if (message.t === 'cj-rematch') problem = rematch(player);
    else if (message.t === 'cj-forfeit') problem = leaveSeat(player, true);
    else if (message.t === 'cj-leave') { if (player.watchMat) { player.watchMat.watchers.delete(ws); player.watchMat = null; broadcastRoom(); send(ws, privateState(player)); } else problem = leaveSeat(player, false); }
    else if (message.t === 'cj-exit') { if (player.match && player.match.phase !== 'done') problem = 'Aktív párbajból előbb lépj ki vagy add fel.'; else { if (player.match) leaveSeat(player, false); detachFromMat(player); player.inRoom = false; roomPlayers.delete(player); sessions.delete(player.token); ws.cjPlayer = null; broadcastRoom(); send(ws, { t: 'cj-exited' }); } }
    else problem = 'Ismeretlen Card-Jitsu művelet.';
    return problem ? error(ws, problem) : true;
  }
  function close(ws) {
    const player = ws.cjPlayer;
    if (player?.watchMat) { player.watchMat.watchers.delete(ws); player.watchMat = null; player.ws = null; roomPlayers.delete(player); sessions.delete(player.token); ws.cjPlayer = null; broadcastRoom(); return; }
    if (player) { ws.cjPlayer = null; disconnect(player); } else { for (const mat of mats) mat.watchers.delete(ws); broadcastRoom(); }
  }
  return { handle, close, room: roomView, stats: () => stats, mats, sessions, _test: { choose, resolveRound, beginRound, timeoutRound, publicMatch, privateState, startMatch, makePlayer: (o) => makePlayer({ ...o, rng }) } };
}

module.exports = { ELEMENTS, E: ELEMENTS, COLORS, BEATS, beats: BEATS, EFFECTS, effects: EFFECTS, CATALOG, roundWinner, winner: roundWinner, winningScore, normalizeStats, belt, drawToFive, draw: drawToFive, makePlayer, legalCards, effectiveCard, applyOnPlay, applyOnWin, decideBot, create };
