const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const game = require('./game');
const physics = require('./physics');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'state.json');
const INGEST_TOKEN = process.env.INGEST_TOKEN || crypto.randomBytes(12).toString('hex');
if (!process.env.INGEST_TOKEN) console.log(`INGEST_TOKEN nincs megadva, ideiglenes token: ${INGEST_TOKEN}`);

const BOOT_ID = crypto.randomBytes(4).toString('hex'); // új indulásnál a kliensek újratöltenek
const START_POT = 100000;
const DAILY_CREDIT = 10000;
const T_RESULT = 5000, T_DOOR_DELAY = 3000;
const MAX_PER_ROUND = 20000, MAX_BETS = 80;  // játékosonként egy körben
const DOOR = 'ajtó';

// ---- állapot (a perzisztens rész a data/state.json-ban) ----
const S = { pot: START_POT, history: [], stats: {}, doorOpens: 0, credited: { date: '', names: [] }, bent: {}, roundBets: [], rest: physics.DEFAULT_REST };
try { Object.assign(S, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch {}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(S));
      fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
    } catch (e) { console.error('mentés sikertelen:', e.message); }
  }, 1500);
}

S.roundBets = S.roundBets.filter((b) => game.info(b.kind)).map((b) => ({ ...b, kind: game.norm(b.kind) }));
const R = { id: 0, phase: 'betting', endAt: 0, spinStart: 0, result: null, bets: S.roundBets, doorQueue: 0, sim: null, spinMs: 0, spinner: '', net: null };
let feed = [];
const say = (text) => { feed.unshift({ ts: Date.now(), text }); feed = feed.slice(0, 40); };
const fmt = (n) => n.toLocaleString('hu-HU') + ' 🦝';
const stat = (nick) => (S.stats[nick] ||= { net: 0, rounds: 0 });

// ---- tétek: zsetonokkal, ugyanarra a mezőre többször is ----
function addBet(nick, kind, amount) {
  kind = game.norm(kind);
  if (!game.info(kind)) return 'Ismeretlen tét.';
  if (!game.CHIPS.includes(amount)) return 'Ismeretlen zseton.';
  if (R.phase !== 'betting') return 'A tétek lezárultak, várj a következő körre.';
  const mine = R.bets.filter((b) => b.nick === nick);
  if (nick !== DOOR && mine.length >= MAX_BETS) return 'Ennyi zseton elég lesz ebben a körben.';
  if (nick !== DOOR && mine.reduce((s, b) => s + b.stake, 0) + amount > MAX_PER_ROUND) return `Egy körben legfeljebb ${fmt(MAX_PER_ROUND)} lehet a tétjeid összege.`;
  if (S.pot < amount) return 'Nincs elég mosómedve a közös potban.';
  S.pot -= amount;
  R.bets.push({ nick, kind, stake: amount });
  save();
  return null;
}
function undoBet(nick, all) {
  if (R.phase !== 'betting') return 'A tétek lezárultak.';
  let n = 0;
  for (let i = R.bets.length - 1; i >= 0; i--) {
    if (R.bets[i].nick !== nick) continue;
    S.pot += R.bets[i].stake; R.bets.splice(i, 1); n++;
    if (!all) break;
  }
  if (!n) return 'Nincs visszavonható tétod.';
  save();
  return null;
}
function placeDoorBet() {
  const bets = game.doorBet();
  for (const b of bets) if (addBet(DOOR, b.kind, b.stake)) { say('Az ajtó tétje elmaradt: nincs elég mosómedve a potban.'); return; }
  say(`Az ajtó 1000 🦝-t tett fel (${bets.length === 1 ? kindName(bets[0].kind) : bets.length + ' mezőre'}).`);
}
const KIND_NAMES = { red: 'pirosra', black: 'feketére', even: 'párosra', odd: 'páratlanra', low: '1–18-ra', high: '19–36-ra' };
const kindName = (k) => KIND_NAMES[k] || k;

// ---- szurkálás az eredménynél ----
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
const FRONT = /[eéiíöőüű]/;
const nekNak = (n) => { const v = n.toLowerCase().match(/[aáeéiíoóöőuúüű]/g); return n + (v && FRONT.test(v[v.length - 1]) ? 'nek' : 'nak'); };
const list = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' és ' + a[a.length - 1]);
function tease(spinner, net) {
  const parts = [];
  const sNet = net[spinner];
  if (spinner === DOOR) {
    if (sNet > 0) parts.push(pickOne([`Az ajtó nyert: +${fmt(sNet)}. Ki tanította meg rulettezni?`, `Az ajtó: +${fmt(sNet)}. Lassan többet keres, mint mi.`]));
    else if (sNet < 0) parts.push(pickOne(['Az ajtó elbukta a tétjét. Legalább nyikorogni tud.', 'Az ajtónak ez most nem jött össze.']));
  } else if (sNet !== undefined) {
    const X = fmt(Math.abs(sNet));
    if (sNet > 0) parts.push(pickOne([`${spinner} bezsebelt: +${X}. Ma ő hozza a pogácsát.`, `${spinner} keze aranyat ér: +${X}.`, `${spinner} kifosztotta a potot: +${X}. Gyanús.`, `${spinner} nyert (+${X}), és most nagyon elégedett magával.`]));
    else if (sNet < 0) parts.push(pickOne([`${nekNak(spinner)} ez most nem jött össze.`, `${spinner} pörgetett, a pot köszöni az adományt (−${X}).`, `${spinner}, legközelebb próbáld bal kézzel.`, `${spinner} keze ma nem aranyat ér: −${X}.`, `${spinner} szponzorálta a kört: −${X}.`]));
    else parts.push(`${spinner} nullára hozta ki. Bátor, de óvatos.`);
  }
  const others = Object.entries(net).filter(([k]) => k !== spinner && k !== DOOR);
  const losers = others.filter(([, v]) => v < 0).map(([k]) => k), winners = others.filter(([, v]) => v > 0);
  if (losers.length) parts.push(pickOne([`${list(losers)} is a potba fizetett.`, `${list(losers)} sem járt jobban.`, `Részvétünk: ${list(losers)}.`]));
  if (winners.length) parts.push(winners.length === 1 ? `${winners[0][0]} viszont nyert: +${fmt(winners[0][1])}.` : `Nyertek: ${winners.map(([k, v]) => `${k} +${fmt(v)}`).join(', ')}.`);
  if (!parts.length) parts.push('Senki sem nyert.');
  return parts.join(' ');
}

// ---- körök: a kerék csak ajtónyitásra vagy „Pörgetés” gombra indul ----
function startBetting() {
  R.id++; R.phase = 'betting'; R.result = null; R.endAt = 0; R.spinner = ''; R.net = null;
  S.roundBets = []; R.bets = S.roundBets;
  if (R.doorQueue > 0) { // közben nyílt ajtó: tegyen tétet és pörgessen
    R.doorQueue--; placeDoorBet(); R.spinner = DOOR;
    setTimeout(startSpin, T_DOOR_DELAY);
  }
  save(); broadcast();
}
function startSpin() {
  if (R.phase !== 'betting' || !R.bets.length) return;
  R.sim = physics.simulate(S.rest || physics.DEFAULT_REST);   // a golyó pályája fizikai szimulációból jön
  R.result = R.sim.result; R.spinMs = R.sim.durationMs;
  R.phase = 'spin'; R.spinStart = Date.now(); R.endAt = R.spinStart + R.spinMs;
  save(); broadcast(true);
  setTimeout(startResult, R.spinMs);
}
function startResult() {
  const n = R.result;
  const net = {};
  for (const b of R.bets) {
    const back = game.payout(b.kind, n, b.stake);
    S.pot += back;
    net[b.nick] = (net[b.nick] || 0) + back - b.stake;
  }
  for (const [nick, v] of Object.entries(net)) { const s = stat(nick); s.net += v; s.rounds++; }
  const color = n === 0 ? 'zöld' : game.RED.has(n) ? 'piros' : 'fekete';
  say(`${n} (${color}). ${tease(R.spinner, net)}`);
  R.net = net;
  S.history.unshift(n); S.history = S.history.slice(0, 20);
  S.rest = R.sim.rest; R.sim = null;
  R.phase = 'result'; R.endAt = Date.now() + T_RESULT;
  save(); broadcast();
  setTimeout(startBetting, T_RESULT);
}

// ---- kliensek ----
const app = express();
app.use(express.json({ limit: '4kb' }));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 1024 });

function snapshot(withTrack) {
  const board = Object.entries(S.stats).map(([nick, s]) => ({ nick, net: s.net })).sort((a, b) => b.net - a.net).slice(0, 8);
  const snap = {
    t: 'state', boot: BOOT_ID, now: Date.now(), pot: S.pot, round: R.id, phase: R.phase, endAt: R.endAt,
    spinStart: R.spinStart, spinMs: R.spinMs, result: R.phase === 'result' ? R.result : null,
    net: R.phase === 'result' ? R.net : null, chips: game.CHIPS,
    rest: S.rest || physics.DEFAULT_REST,
    bets: R.bets, history: S.history, board, feed: feed.slice(0, 15),
    door: { opens: S.doorOpens, net: S.stats[DOOR]?.net || 0 },
  };
  if (withTrack && R.phase === 'spin' && R.sim) {
    const { w0, tw, alpha0, hz, hits, track } = R.sim;
    snap.spin = { w0, tw, alpha0, hz, hits, track };
  }
  return snap;
}
function broadcast(withTrack) {
  const msg = JSON.stringify(snapshot(withTrack));
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}
const cleanNick = (s) => String(s || '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 16);

wss.on('connection', (ws) => {
  ws.nick = ''; ws.budget = 10;
  const refill = setInterval(() => { ws.budget = 10; }, 1000);
  ws.on('close', () => clearInterval(refill));
  ws.send(JSON.stringify(snapshot(true)));
  ws.on('message', (raw) => {
    if (--ws.budget < 0) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    const err = (msg) => ws.send(JSON.stringify({ t: 'err', msg }));
    if (m.t === 'hello') {
      const nick = cleanNick(m.nick);
      if (nick.length < 2) return err('A becenév legalább 2 karakter.');
      if (nick.toLowerCase() === DOOR) return err('Az „ajtó” becenév foglalt.');
      ws.nick = nick; ws.send(JSON.stringify({ t: 'hello', nick }));
      return;
    }
    if (!ws.nick) return err('Előbb adj meg becenevet.');
    if (m.t === 'spin') {
      if (R.phase !== 'betting') return err('A kerék éppen forog.');
      if (!R.bets.some((b) => b.nick === ws.nick)) return err('Pörgetés előtt tegyél legalább egy tétet.');
      say(`${ws.nick} megpörgette a kereket.`);
      R.spinner = ws.nick;
      return startSpin();
    }
    const e = m.t === 'bet' ? addBet(ws.nick, m.kind, m.amount) : m.t === 'undo' ? undoBet(ws.nick, false) : m.t === 'clear' ? undoBet(ws.nick, true) : null;
    if (e) err(e); else broadcast();
  });
});

// ---- gépről érkező jelek (ajtó, jelenlét) ----
const hits = new Map();
setInterval(() => hits.clear(), 60000);
function ingest(req, res, next) {
  const n = (hits.get(req.ip) || 0) + 1; hits.set(req.ip, n);
  if (n > 120) return res.status(429).json({ error: 'túl sok kérés' });
  const a = Buffer.from(req.get('authorization') || ''), b = Buffer.from(`Bearer ${INGEST_TOKEN}`);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'hibás token' });
  next();
}
app.get('/api/ping', ingest, (req, res) => res.json({ ok: true })); // az irodai telepítő ezzel ellenőrzi a címet és a tokent
app.post('/api/door', ingest, (req, res) => {
  const st = req.body?.state;
  if (st === 'open') {
    S.doorOpens++;
    say('🚪 Az ajtó kinyílt.');
    if (R.phase === 'betting') { placeDoorBet(); R.spinner = DOOR; startSpin(); } else R.doorQueue++;
  } else if (st === 'closed') say('🚪 Az ajtó becsukódott.');
  else return res.status(400).json({ error: 'state: open|closed' });
  save(); broadcast(); res.json({ ok: true, opens: S.doorOpens });
});
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Budapest' });
app.post('/api/presence', ingest, (req, res) => {
  const names = (Array.isArray(req.body?.present) ? req.body.present : []).map(cleanNick).filter(Boolean).slice(0, 50);
  if (S.credited.date !== today()) S.credited = { date: today(), names: [] };
  const first = [];
  for (const n of names) {
    S.bent[n] = Date.now();
    if (!S.credited.names.includes(n)) { S.credited.names.push(n); S.pot += DAILY_CREDIT; first.push(n); say(`${n} beért, +${fmt(DAILY_CREDIT)} a potba.`); }
  }
  save(); broadcast(); res.json({ ok: true, credited: first });
});

// ---- frissítés a GitHubról (a Mac mini napi frissítése mellett bárki kérheti az oldalról) ----
const UPDATE_SCRIPT = path.join(__dirname, '..', 'mac-mini', 'update.sh');
const UPDATE_GAP = 10 * 60 * 1000;
let lastUpdate = 0;
app.post('/api/update', (req, res) => {
  if (!fs.existsSync(UPDATE_SCRIPT)) return res.status(501).json({ error: 'Ezen a gépen nincs beállítva a frissítés.' });
  const wait = lastUpdate + UPDATE_GAP - Date.now();
  if (wait > 0) return res.status(429).json({ error: `Nemrég volt frissítés, próbáld újra ${Math.ceil(wait / 60000)} perc múlva.` });
  lastUpdate = Date.now();
  spawn('/bin/bash', [UPDATE_SCRIPT], { detached: true, stdio: 'ignore' }).unref();
  say('Frissítés indult a GitHubról. Ha volt új verzió, az oldal pár másodpercre újratölt.');
  broadcast(); res.json({ ok: true });
});

R.id = 1; // újraindításkor a mentett, el nem pörgetett tétek megmaradnak
if (require.main === module) server.listen(PORT, () => console.log(`Exmentoring: http://localhost:${PORT}`));
module.exports = { server };
