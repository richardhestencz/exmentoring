const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ELEMENTS, COLORS, CATALOG, EFFECTS, roundWinner, winningScore, normalizeStats, belt,
  makePlayer, decideBot, create,
} = require('./cardjitsu');

function fakeClock() {
  let now = 1000, serial = 0;
  const jobs = new Map();
  const setTimeout = (fn, delay) => { const job = { id: ++serial, at: now + delay, fn }; jobs.set(job.id, job); return job.id; };
  const clearTimeout = (job) => jobs.delete(job);
  const advance = (ms) => {
    const end = now + ms;
    while (true) {
      const job = [...jobs.values()].filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!job) break;
      jobs.delete(job.id); now = job.at; job.fn();
    }
    now = end;
  };
  return { now: () => now, setTimeout, clearTimeout, advance, jobs };
}

function socket(nick = 'Teszt') {
  return { readyState: 1, city: { nick, tint: 0xabcdef }, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); } };
}

function enginePair(options = {}) {
  const clock = options.clock || fakeClock();
  let n = 0;
  const service = create({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, rng: options.rng || (() => 0), id: () => `id${++n}`, stats: options.stats || {}, save: options.save });
  const a = service._test.makePlayer({ id: 'a', nick: 'Anna' }), b = service._test.makePlayer({ id: 'b', nick: 'Béla' });
  a.ws = socket('Anna'); b.ws = socket('Béla');
  const match = service._test.startMatch(service.mats[0], [a, b]);
  return { clock, service, a, b, match };
}

const regular = (element, color = 'red', value = 5) => ({ id: `${element}-${color}-${value}`, element, color, value });
function setHands(a, b, cardA, cardB) {
  a.hand = [cardA, regular('fire', 'blue', 2), regular('snow', 'yellow', 3), regular('water', 'green', 4), regular('fire', 'orange', 6)];
  b.hand = [cardB, regular('fire', 'purple', 2), regular('snow', 'orange', 3), regular('water', 'yellow', 4), regular('snow', 'blue', 6)];
}

test('catalog has 126 regular and 24 equally distributed powers', () => {
  assert.equal(CATALOG.length, 150); assert.equal(EFFECTS.length, 24);
  assert.deepEqual(ELEMENTS.map((e) => EFFECTS.filter((c) => c.element === e).length), [8, 8, 8]);
  assert.equal(new Set(CATALOG.map((c) => c.id)).size, 150);
});

test('element cycle, same-element number and exact ties', () => {
  assert.equal(roundWinner(regular('fire'), regular('snow')), 0);
  assert.equal(roundWinner(regular('snow'), regular('water')), 0);
  assert.equal(roundWinner(regular('water'), regular('fire')), 0);
  assert.equal(roundWinner(regular('fire', 'red', 8), regular('fire', 'blue', 2)), 0);
  assert.equal(roundWinner(regular('fire'), regular('fire', 'blue', 5)), -1);
  assert.equal(roundWinner(null, regular('fire')), 1); assert.equal(roundWinner(null, null), -1);
});

test('both winning shapes require three distinct colors', () => {
  assert.equal(winningScore([regular('fire', 'red'), regular('fire', 'blue'), regular('fire', 'green')]), true);
  assert.equal(winningScore([regular('fire', 'red'), regular('snow', 'blue'), regular('water', 'green')]), true);
  assert.equal(winningScore([regular('fire', 'red'), regular('fire', 'red'), regular('fire', 'green')]), false);
  assert.equal(winningScore([regular('fire', 'red'), regular('fire', 'blue'), regular('snow', 'green')]), false);
});

test('selection is private and keeps five cards until simultaneous reveal', () => {
  const { service, a, b, match } = enginePair();
  setHands(a, b, regular('fire', 'red', 8), regular('snow', 'blue', 7));
  assert.equal(service._test.choose(match, a, a.hand[0].id), true);
  assert.equal(a.hand.length, 5); assert.equal(service._test.privateState(a).decided, true);
  assert.equal('selected' in service._test.publicMatch(match).players[0], false);
  assert.equal(service._test.publicMatch(match).result, null);
  service._test.choose(match, b, b.hand[0].id);
  assert.equal(a.scored.length, 1); assert.equal(a.discard.length, 0);
  assert.equal(a.hand.length, 4); assert.equal(b.discard.length, 1);
});

test('all 24 powers execute at the correct play/win phase', () => {
  for (const effect of EFFECTS) {
    const { service, a, b, match } = enginePair();
    const effective = effect.kind === 'transform' ? { ...effect, element: { fire: 'snow', snow: 'water', water: 'fire' }[effect.target] } : effect;
    const losingElement = { fire: 'snow', snow: 'water', water: 'fire' }[effective.element];
    const foe = regular(losingElement, effect.target && COLORS.includes(effect.target) ? effect.target : 'red', 2);
    b.scored = [regular(effect.target && ELEMENTS.includes(effect.target) ? effect.target : 'water', effect.target && COLORS.includes(effect.target) ? effect.target : 'red', 4)];
    setHands(a, b, { ...effect }, foe);
    service._test.choose(match, a, effect.id); service._test.choose(match, b, foe.id);
    if (effect.kind === 'low') assert.equal(a.nextMods.low && b.nextMods.low, true, effect.id);
    if (effect.kind === 'transform') assert.equal(match.result.effective[0], effective.element, effect.id);
    if (effect.kind === 'plus') assert.equal(a.nextMods.plus, 2, effect.id);
    if (effect.kind === 'minus') assert.equal(b.nextMods.minus, -2, effect.id);
    if (effect.kind === 'block') assert.equal(b.nextMods.block, effect.target, effect.id);
    if (effect.kind.startsWith('discard')) assert.ok(match.result.removed.length >= 1, effect.id);
  }
});

test('on-play reversal survives loss, modifiers collide and expire after one round', () => {
  const { clock, service, a, b, match } = enginePair();
  const low = EFFECTS.find((c) => c.kind === 'low');
  setHands(a, b, low, regular({ fire: 'water', snow: 'fire', water: 'snow' }[low.element], 'blue', 12));
  service._test.choose(match, a, low.id); service._test.choose(match, b, b.hand[0].id);
  assert.equal(a.nextMods.low, true); assert.equal(b.nextMods.low, true);
  clock.advance(3000);
  assert.equal(a.mods.low, true); a.mods.plus = 2; a.mods.minus = -2;
  setHands(a, b, regular('fire', 'red', 2), regular('fire', 'blue', 7));
  service._test.choose(match, a, a.hand[0].id); service._test.choose(match, b, b.hand[0].id);
  assert.equal(match.result.winner, 0, 'lower wins; +2 and -2 cancel');
  clock.advance(3000); assert.deepEqual(a.mods, {}); assert.deepEqual(b.mods, {});
});

test('pass is allowed only when every card is blocked', () => {
  const { service, a, b, match } = enginePair();
  assert.equal(service._test.choose(match, a, null), false);
  a.mods.block = 'fire'; a.hand = a.hand.map((c, i) => regular('fire', COLORS[i], i + 2));
  assert.equal(service._test.choose(match, a, null), true);
  service._test.choose(match, b, b.hand[0].id);
  assert.equal(match.result.winner, 1); assert.equal(a.hand.length, 5);
});

test('draw/discard/scored zones stay unique and scored winner is not discarded', () => {
  const { service, a, b, match } = enginePair();
  setHands(a, b, regular('fire', 'red', 8), regular('snow', 'blue', 8));
  a.deck = CATALOG.filter((card) => !a.hand.some((held) => held.id === card.id)).map((card) => ({ ...card }));
  b.deck = CATALOG.filter((card) => !b.hand.some((held) => held.id === card.id)).map((card) => ({ ...card }));
  service._test.choose(match, a, a.hand[0].id); service._test.choose(match, b, b.hand[0].id);
  const zones = [...a.deck, ...a.hand, ...a.discard, ...a.scored];
  assert.equal(zones.length, 150); assert.equal(new Set(zones.map((c) => c.id)).size, 150);
  assert.equal(a.discard.some((c) => c.id === a.scored[0].id), false);
});

test('bot decisions cannot depend on the opponent hidden hand or chosen card', () => {
  const bot = makePlayer({ id: 'bot', nick: 'Árnyék', bot: true, difficulty: 'hard', rng: () => 0.2 });
  const publicState = { players: [{ id: 'bot', scored: [] }, { id: 'human', scored: [regular('fire', 'red')] }] };
  const first = decideBot(bot, publicState, () => 0.2);
  const hiddenA = [regular('fire', 'blue', 8)], hiddenB = [regular('water', 'green', 2)];
  assert.notDeepEqual(hiddenA, hiddenB); assert.equal(decideBot(bot, structuredClone(publicState), () => 0.2), first);
});

test('fake clock auto-selects, forfeits on third consecutive miss and manual play resets miss count', () => {
  const { clock, service, a, b, match } = enginePair();
  clock.advance(20000); assert.equal(a.missed, 1); assert.equal(match.resolvedRounds, 1);
  clock.advance(3000); a.missed = 2;
  service._test.choose(match, a, a.hand.find((c) => c.element !== a.mods.block)?.id || null);
  assert.equal(a.missed, 0); service._test.choose(match, b, b.hand.find((c) => c.element !== b.mods.block)?.id || null);
  clock.advance(3000);
  for (let i = 0; i < 3 && match.phase !== 'done'; i++) { clock.advance(20000); if (match.phase !== 'done') clock.advance(3000); }
  assert.equal(match.phase, 'done'); assert.match(match.result.text, /háromszor/);
});

test('disconnect freezes the clock, resume restores it, and reservation expires at 30 seconds', () => {
  const clock = fakeClock(); let n = 0;
  const service = create({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, rng: () => 0, id: () => `x${++n}` });
  const ws = socket('Anna'); service.handle(ws, JSON.stringify({ t: 'cj-enter' })); const token = ws.messages.find((m) => m.t === 'cj-state').token;
  service.handle(ws, JSON.stringify({ t: 'cj-bot', difficulty: 'easy' })); const match = service.mats[0].match;
  clock.advance(5000); service.close(ws); assert.equal(match.paused, true); const round = match.round;
  clock.advance(20000); assert.equal(match.round, round);
  const resumed = socket('Anna'); service.handle(resumed, JSON.stringify({ t: 'cj-resume', token })); assert.equal(match.paused, false);
  service.close(resumed); clock.advance(30000); assert.equal(service.sessions.has(token), false); assert.equal(service.mats[0].match, null);
});

test('a disconnected spectator is removed immediately without a reserved token', () => {
  const clock = fakeClock(); let n = 0;
  const service = create({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, rng: () => 0, id: () => `s${++n}` });
  const a = socket('Anna'), b = socket('Béla'), viewer = socket('Néző');
  for (const ws of [a, b, viewer]) service.handle(ws, JSON.stringify({ t: 'cj-enter' }));
  service.handle(a, JSON.stringify({ t: 'cj-join', mat: 0 })); service.handle(b, JSON.stringify({ t: 'cj-join', mat: 0 }));
  service.handle(viewer, JSON.stringify({ t: 'cj-watch', mat: 0 })); const token = viewer.cjPlayer.token;
  service.close(viewer); assert.equal(service.mats[0].watchers.size, 0); assert.equal(service.sessions.has(token), false);
});

test('stats sanitize, belt progression, and result books once for the human rather than bot', () => {
  assert.deepEqual(Object.keys(normalizeStats({ '<bad>': { wins: 3 }, Anna: { wins: '13', losses: -2 } })), ['Anna']);
  assert.equal(belt({ wins: 4 }).name, 'nincs öv'); assert.equal(belt({ wins: 13 }).name, 'sárga');
  const stats = {}; let saves = 0; const { service, a, b, match } = enginePair({ stats, save: () => saves++ });
  b.bot = true; b.difficulty = 'normal'; a.scored = [regular('fire', 'blue'), regular('fire', 'green')];
  setHands(a, b, regular('fire', 'red', 8), regular('snow', 'yellow', 2));
  service._test.choose(match, a, a.hand[0].id); service._test.choose(match, b, b.hand[0].id);
  assert.equal(stats.Anna.wins, 1); assert.equal(stats.Anna.normalWins, 1); assert.equal(stats[b.nick], undefined); assert.equal(saves, 1);
  service._test.resolveRound(match); assert.equal(stats.Anna.wins, 1); assert.equal(saves, 1);
});
