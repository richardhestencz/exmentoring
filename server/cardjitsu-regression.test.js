const test = require('node:test');
const assert = require('node:assert/strict');
const cj = require('./cardjitsu');

function room() {
  let time = 1000, sequence = 0;
  const jobs = new Map();
  const service = cj.create({
    now: () => time,
    rng: () => 0.25,
    setTimeout(fn, delay) { const key = ++sequence; jobs.set(key, { fn, at: time + delay }); return key; },
    clearTimeout(key) { jobs.delete(key); },
  });
  const send = (ws, message) => service.handle(ws, JSON.stringify(message));
  const connect = (nick) => {
    const ws = { readyState: 1, city: { nick, tint: 0xffffff }, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); } };
    send(ws, { t: 'cj-enter' }); return ws;
  };
  const a = connect('Egyik'), b = connect('Másik');
  send(a, { t: 'cj-join', mat: 0 }); send(b, { t: 'cj-join', mat: 0 });
  const match = service.mats[0].match;
  const advance = (ms) => {
    const end = time + ms;
    for (;;) {
      const next = [...jobs].filter(([, job]) => job.at <= end).sort((x, y) => x[1].at - y[1].at)[0];
      if (!next) break;
      jobs.delete(next[0]); time = next[1].at; next[1].fn();
    }
    time = end;
  };
  return { service, send, connect, a, b, match, advance };
}

const card = (element, color, value) => cj.CATALOG.find((c) => !c.kind && c.element === element && c.color === color && c.value === value);
function arrange(player, hand, scored = []) {
  const used = new Set([...hand, ...scored].map((c) => c.id));
  const rest = cj.CATALOG.filter((c) => !used.has(c.id));
  player.hand = hand.map((c) => ({ ...c }));
  while (player.hand.length < 5) player.hand.push({ ...rest.shift() });
  player.scored = scored.map((c) => ({ ...c })); player.deck = rest.map((c) => ({ ...c })); player.discard = [];
}
function chooseBoth(env, a, b) {
  env.send(env.a, { t: 'cj-play', match: env.match.id, round: env.match.round, card: a.id });
  env.send(env.b, { t: 'cj-play', match: env.match.id, round: env.match.round, card: b.id });
}
function finishForA(env) {
  const [a, b] = env.match.players;
  const win = card('fire', 'red', 8), lose = card('snow', 'yellow', 2);
  arrange(a, [win], [card('fire', 'blue', 2), card('fire', 'green', 3)]); arrange(b, [lose]);
  chooseBoth(env, win, lose);
  assert.equal(env.match.phase, 'done'); assert.equal(env.match.result.winner, 0);
}

test('stat keys cannot inherit a prototype and non-finite saved counts are rejected', () => {
  const stats = cj.normalizeStats(JSON.parse('{"__proto__":{"wins":5},"constructor":{"wins":13},"toString":{"wins":"Infinity"}}'));
  assert.equal(Object.hasOwn(stats, '__proto__'), true);
  assert.equal(stats.__proto__.wins, 5); assert.equal(stats.constructor.wins, 13);
  assert.equal(stats.toString.wins, 0);
});

test('element conversion compares both printed elements without changing scored originals', () => {
  const env = room(), [a, b] = env.match.players;
  const power = cj.EFFECTS.find((c) => c.kind === 'transform' && c.target === 'fire');
  const foe = card('fire', 'blue', 2);
  arrange(a, [power]); arrange(b, [foe]); chooseBoth(env, power, foe);
  assert.deepEqual(env.match.result.effective, ['snow', 'snow']);
  assert.equal(env.match.result.winner, 0);
  assert.equal(a.scored[0].element, power.element);
});

test('removed score cards return to their owner discard and conserve both decks', () => {
  const env = room(), [a, b] = env.match.players;
  const power = cj.EFFECTS.find((c) => c.kind === 'discardAll' && c.target === 'red');
  const foe = card(cj.BEATS[power.element], 'blue', 2), removed = card('water', 'red', 3);
  arrange(a, [power]); arrange(b, [foe], [removed]); chooseBoth(env, power, foe);
  assert.equal(b.scored.length, 0); assert.ok(b.discard.some((c) => c.id === removed.id));
  for (const player of [a, b]) {
    const zones = [...player.hand, ...player.deck, ...player.discard, ...player.scored];
    assert.equal(zones.length, 150); assert.equal(new Set(zones.map((c) => c.id)).size, 150);
  }
});

test('a rematch gets a fresh identity and rejects the previous match selection', () => {
  const env = room(); finishForA(env); const priorId = env.match.id;
  env.send(env.a, { t: 'cj-rematch' }); env.send(env.b, { t: 'cj-rematch' });
  assert.notEqual(env.service.mats[0].match.id, priorId);
  env.send(env.a, { t: 'cj-play', match: priorId, round: 1, card: env.match.players[0].hand[0].id });
  assert.equal(env.a.messages.at(-1).t, 'cj-error');
});

test('closing a finished mat releases spectators and sends them back to the dojo', () => {
  const env = room(), spectator = env.connect('Néző');
  env.send(spectator, { t: 'cj-watch', mat: 0 }); finishForA(env);
  env.send(env.a, { t: 'cj-leave' });
  assert.equal(Boolean(spectator.cjPlayer.watchMat), false); assert.equal(env.service.mats[0].watchers.size, 0);
  assert.equal(spectator.messages.findLast((m) => m.t === 'cj-state').match, null);
});

test('disconnect expiry cannot overwrite an already awarded match winner', () => {
  const env = room(); finishForA(env); env.service.close(env.a); env.advance(30000);
  assert.equal(env.match.result.winner, 0); assert.equal(env.service.stats().Egyik.wins, 1);
  assert.equal(env.service.stats().Másik.wins, 0);
});

test('hard bot counters a publicly visible immediate winning element', () => {
  const bot = cj.makePlayer({ id: 'bot', nick: 'Bot', bot: true, difficulty: 'hard', rng: () => 0.25 });
  bot.hand = [card('water', 'purple', 8), card('fire', 'green', 2), card('snow', 'orange', 3)];
  const publicState = { players: [{ id: 'bot', scored: [] }, { id: 'opponent', scored: [card('fire', 'blue', 5), card('water', 'red', 5)] }] };
  assert.equal(cj.decideBot(bot, publicState, () => 0.25), card('fire', 'green', 2).id);
});

test('joining another mat after a completed game resets scored cards and the entire deck', () => {
  const env = room(); finishForA(env);
  env.send(env.a, { t: 'cj-leave' });
  env.send(env.a, { t: 'cj-join', mat: 2 }); env.send(env.b, { t: 'cj-join', mat: 2 });
  for (const player of env.service.mats[2].match.players) {
    assert.equal(player.scored.length, 0); assert.equal(player.discard.length, 0);
    assert.equal(player.hand.length, 5); assert.equal(player.deck.length, 145);
  }
});

test('an early disconnect abort notifies the connected opponent and releases their seat', () => {
  const env = room(); env.service.close(env.a); env.advance(30000);
  assert.equal(Boolean(env.b.cjPlayer.match), false);
  assert.equal(env.b.messages.findLast((message) => message.t === 'cj-state').match, null);
  assert.equal(env.service.mats[0].seats.length, 0);
});

test('public temporary effects and the reveal deadline agree with authoritative state', () => {
  const env = room(), [a, b] = env.match.players;
  a.mods.plus = 2;
  assert.equal(env.service._test.publicMatch(env.match).players[0].mods.plus, 2);
  const win = card('fire', 'red', 8), lose = card('snow', 'blue', 2);
  arrange(a, [win]); arrange(b, [lose]); chooseBoth(env, win, lose);
  const reveal = env.b.messages.findLast((message) => message.t === 'cj-round');
  assert.equal(reveal.match.endAt, env.match.endAt);
  assert.equal(reveal.match.endAt, 4000);
});

test('each bot difficulty completes a legal match and records exactly one human result', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const env = room();
    env.send(env.a, { t: 'cj-forfeit' }); env.send(env.a, { t: 'cj-leave' });
    env.send(env.a, { t: 'cj-bot', difficulty });
    const match = env.service.mats[0].match, human = match.players.find((player) => !player.bot);
    for (let turn = 0; turn < 100 && match.phase !== 'done'; turn++) {
      if (match.phase === 'select' && !human.decided) {
        const legal = cj.legalCards(human);
        env.send(env.a, { t: 'cj-play', match: match.id, round: match.round, card: legal.length ? legal[turn % legal.length].id : null });
      }
      env.advance(match.phase === 'reveal' ? 3000 : 1000);
    }
    assert.equal(match.phase, 'done', difficulty);
    assert.match(match.result.text, /megnyerte/, difficulty);
    const stats = env.service.stats().Egyik;
    assert.equal(stats.wins + stats.losses, 1, difficulty);
    assert.equal(stats[`${difficulty}Wins`] + stats[`${difficulty}Losses`], 1, difficulty);
  }
});
