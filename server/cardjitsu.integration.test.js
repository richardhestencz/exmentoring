const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const WebSocket = require('ws');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function startServer(port, dataDir) {
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, INGEST_TOKEN: 'card-jitsu-test', MUSIC_FETCH: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { output += chunk; });
  for (let i = 0; i < 100 && !output.includes('Exmentoring:'); i++) { if (child.exitCode !== null) throw new Error(output); await delay(25); }
  if (!output.includes('Exmentoring:')) throw new Error(`A tesztszerver nem indult el: ${output}`);
  return child;
}
async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(2000).then(() => child.kill('SIGKILL'))]);
}
async function client(port, nick) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`), messages = [];
  ws.on('message', (raw) => { try { messages.push(JSON.parse(raw)); } catch {} });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'c-join', nick, tint: 0xabc123 }));
  await waitFor({ messages }, (m) => m.t === 'c-wl');
  let cursor = 0;
  return {
    ws, messages,
    send(message) { ws.send(JSON.stringify(message)); },
    async wait(predicate, timeout = 5000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        for (; cursor < messages.length; cursor++) { const message = messages[cursor]; if (predicate(message)) { cursor++; return message; } }
        await delay(10);
      }
      throw new Error(`Nem érkezett várt üzenet ${nick} kliensnek. Utolsó típusok: ${messages.slice(-5).map((m) => m.t).join(', ')}`);
    },
    close() { ws.close(); },
  };
}
async function waitFor(holder, predicate, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const found = holder.messages.find(predicate); if (found) return found; await delay(10); }
  throw new Error('Nem érkezett meg a várt websocket üzenet.');
}
async function enter(c) { c.send({ t: 'cj-enter' }); return c.wait((m) => m.t === 'cj-state' && m.playerId); }

test('real websocket keeps Card-Jitsu private, validates actions, seats atomically and persists one result', { timeout: 25000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exm-cj-'));
  const port = await freePort(); let server; const clients = [];
  try {
    server = await startServer(port, dataDir);
    const anna = await client(port, 'Anna'), bela = await client(port, 'Béla'), spectator = await client(port, 'Néző'); clients.push(anna, bela, spectator);
    const annaEntry = await enter(anna), belaEntry = await enter(bela); await enter(spectator);
    assert.ok(annaEntry.token); assert.equal(annaEntry.hand.length, 0);

    anna.send({ t: 'cj-join', mat: 0 }); bela.send({ t: 'cj-join', mat: 0 });
    const annaState = await anna.wait((m) => m.t === 'cj-state' && m.match?.mat === 0 && m.hand?.length === 5);
    const belaState = await bela.wait((m) => m.t === 'cj-state' && m.match?.id === annaState.match.id && m.hand?.length === 5);
    spectator.send({ t: 'cj-watch', mat: 0 });
    const publicState = await spectator.wait((m) => m.t === 'cj-state' && m.spectator && m.match?.id === annaState.match.id);
    assert.equal('hand' in publicState, false); assert.equal('token' in publicState, false);
    for (const player of publicState.match.players) { assert.equal('hand' in player, false); assert.equal('selected' in player, false); }
    assert.notDeepEqual(annaState.hand.map((c) => c.id), belaState.hand.map((c) => c.id), 'players receive separate shuffled decks');

    spectator.send({ t: 'cj-play', match: annaState.match.id, round: 1, card: annaState.hand[0].id });
    assert.match((await spectator.wait((m) => m.t === 'cj-error')).msg, /Előbb lépj be|Lejárt|idegen/);
    anna.send({ t: 'cj-play', match: 'wrong', round: 1, card: annaState.hand[0].id });
    assert.match((await anna.wait((m) => m.t === 'cj-error')).msg, /Lejárt|idegen/);
    anna.send({ t: 'cj-play', match: annaState.match.id, round: 1, card: annaState.hand[0].id });
    const chosen = await anna.wait((m) => m.t === 'cj-state' && m.match?.id === annaState.match.id && m.decided === true);
    assert.equal(chosen.hand.length, 5, 'a private hand remains stable before reveal');
    const publicReady = await spectator.wait((m) => m.t === 'cj-state' && m.match?.players?.some((p) => p.id === annaState.playerId && p.ready));
    assert.equal(publicReady.match.result, null, 'readiness reveals no selected card');
    assert.equal('hand' in publicReady, false);
    anna.send({ t: 'cj-play', match: annaState.match.id, round: 1, card: annaState.hand[1].id });
    assert.match((await anna.wait((m) => m.t === 'cj-error')).msg, /nem érvényes/);
    bela.send({ t: 'cj-play', match: belaState.match.id, round: 1, card: belaState.hand[0].id });
    const reveal = await spectator.wait((m) => m.t === 'cj-round' && m.match?.result?.cards);
    assert.equal(reveal.match.result.cards.length, 2); assert.ok(reveal.match.result.cards.every((card) => card === null || card.id));
    anna.send({ t: 'cj-play', match: annaState.match.id, round: 1, card: annaState.hand[0].id });
    assert.match((await anna.wait((m) => m.t === 'cj-error')).msg, /nem érvényes|Lejárt|idegen/);

    const racers = await Promise.all(['R1', 'R2', 'R3'].map((nick) => client(port, nick))); clients.push(...racers); await Promise.all(racers.map(enter));
    racers.forEach((c) => c.send({ t: 'cj-join', mat: 1 }));
    await Promise.all(racers.map((c) => c.wait((m) => m.t === 'cj-room' && m.mats[1].players.length === 2 || m.t === 'cj-error')));
    const raceRooms = racers.flatMap((c) => c.messages.filter((m) => m.t === 'cj-room'));
    assert.equal(Math.max(...raceRooms.map((m) => m.mats[1].players.length)), 2);
    assert.ok(racers.some((c) => c.messages.some((m) => m.t === 'cj-error' && /foglalt/.test(m.msg))));

    anna.send({ t: 'cj-forfeit' }); await anna.wait((m) => m.t === 'cj-state' && m.match?.phase === 'done');
    anna.send({ t: 'cj-forfeit' }); await anna.wait((m) => m.t === 'cj-state' && !m.match);
    for (const c of clients) c.close(); clients.length = 0; await delay(1700); await stopServer(server);

    server = await startServer(port, dataDir);
    const persisted = await client(port, 'Anna'); clients.push(persisted); const restored = await enter(persisted);
    assert.equal(restored.stats.losses, 1); assert.equal(restored.stats.pvpLosses, 1);
  } finally {
    for (const c of clients) c.close();
    await stopServer(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
