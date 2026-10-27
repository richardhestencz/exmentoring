const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const game = require('./game');
const physics = require('./physics');
const gyros = require('./gyros');
const presence = require('./presence');
const cola = require('./cola');
const profiles = require('./profiles');
const seats = require('./seats');
const world = require('./world');
const bj = require('./blackjack');
const rouletteHistory = require('./roulette-history');
const { occasionalBadPun } = require('./roulette-banter');
const dailyChallenge = require('./roulette-challenge');
const polls = require('./polls');
const chapter = require('./chapter');
const music = require('./music');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'state.json');
const INGEST_TOKEN = process.env.INGEST_TOKEN || crypto.randomBytes(12).toString('hex');
if (!process.env.INGEST_TOKEN) console.log(`INGEST_TOKEN nincs megadva, ideiglenes token: ${INGEST_TOKEN}`);

const BOOT_ID = crypto.randomBytes(4).toString('hex'); // új indulásnál a kliensek újratöltenek
const START_POT = 100000;
const DAILY_CREDIT = 10000, HO_CREDIT = 5000;   // aznapi első belépés: helyben 10 000, home office-ból 5 000 a potba
const T_RESULT = 5000, T_DOOR_DELAY = 3000;
const MAX_PER_ROUND = 20000, MAX_BETS = 80;  // játékosonként egy körben
const DOOR = 'ajtó';

// ---- állapot (a perzisztens rész a data/state.json-ban) ----
const S = { pot: START_POT, history: [], stats: {}, doorOpens: 0, credited: { date: '', names: [] }, bent: {}, roundBets: [], rest: physics.DEFAULT_REST };
try { Object.assign(S, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch {}
S.stats = rouletteHistory.normalizeStats(S.stats);
S.rouletteHistory = Array.isArray(S.rouletteHistory) ? S.rouletteHistory : [];
S.dailyChallenge = dailyChallenge.normalizeState(S.dailyChallenge);
let rouletteHistoryNeedsMigration = Number(S.rouletteHistoryVersion) !== 2;
if (rouletteHistoryNeedsMigration) {
  S.rouletteHistory = rouletteHistory.migrateHistory(S.rouletteHistory);
  rouletteHistory.recountBetStats(S.stats, S.rouletteHistory, DOOR);
  S.rouletteHistoryVersion = 2;
}
// Gyros: a kezdő adat a data/gyros-seed.json-ból jön (nincs a repóban). Csak becenevek legyenek benne (Ricsi, Matyi…),
// teljes név soha. Induláskor a seedben lévő beceneveket aliasonként átvesszük, így ott lehet javítani őket.
{
  let seed = null;
  try { seed = JSON.parse(fs.readFileSync(path.join(path.dirname(DATA_FILE), 'gyros-seed.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.error('gyros-seed.json hibás:', e.message); }
  if (!S.gyros || (!S.gyros.contributors.length && !Object.keys(S.gyros.receipts).length)) {
    S.gyros = seed ? gyros.fromSeed(seed) : gyros.empty();
    if (seed) console.log(`Gyros: ${Object.keys(S.gyros.receipts).length} nyugta betöltve a seedből.`);
  } else if (seed) {
    const names = gyros.fromSeed(seed).contributors;
    for (const c of S.gyros.contributors) { const n = names.find((x) => x.alias === c.alias); if (n) c.name = n.name; }
  }
}
S.music = music.sanitize(S.music);
const musicRt = { open: false, since: 0 };   // az ajtó éppen nyitva van-e (nem mentjük)
S.presence ||= presence.empty();
S.cola ||= cola.empty();
S.profiles ||= profiles.empty();
S.seats ||= seats.empty();
S.world ||= world.empty();
for (const v of Object.values(S.seats)) v.since ||= Date.now();   // a belépés ideje (a korábbi bejegyzésekben még nem volt)
delete S.avatars;   // a régi skin-profilok (skin már nincs)
// blackjack: a kör a memóriában él; ha a szerver kör közben újraindul, a feltett tétek visszajárnak a potba
const BJ = bj.empty();
if (Array.isArray(S.bjBets)) for (const b of S.bjBets) S.pot += b.stake;
S.bjBets = [];
const cleanNick = (s) => String(s || '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 16);
const MINESWEEPER_LEVELS = new Set(['beginner', 'intermediate', 'expert']);
const emptyMinesweeper = () => ({ scores: { beginner: [], intermediate: [], expert: [] } });
function normalizeMinesweeper(value) {
  const out = emptyMinesweeper();
  for (const level of MINESWEEPER_LEVELS) {
    const scores = Array.isArray(value?.scores?.[level]) ? value.scores[level] : [];
    out.scores[level] = scores
      .filter((s) => s && typeof s.nick === 'string' && s.nick.length >= 2 && Number.isInteger(s.seconds) && s.seconds > 0 && s.seconds <= 3600)
      .map((s) => ({ nick: cleanNick(s.nick), seconds: s.seconds, at: Number.isFinite(s.at) ? s.at : 0 }))
      .filter((s) => s.nick.length >= 2)
      .sort((a, b) => a.seconds - b.seconds || a.at - b.at)
      .slice(0, 10);
  }
  return out;
}
S.minesweeper = normalizeMinesweeper(S.minesweeper);
S.polls = polls.normalize(S.polls);
S.chapter = chapter.normalize(S.chapter);
const LAST = {};
// ---- blackjack időzítés és elszámolás ----
let bjTimer = null, bjEndAt = 0;
const BJ_TURN_MS = 20000, BJ_RESULT_MS = 6000;
function bjSettle() {
  for (const st of BJ.seats) { S.pot += st.back; const r = stat(st.nick); r.net += st.back - st.stake; r.rounds++; }
  const dv = bj.value(BJ.dealer).total;
  const words = { blackjack: 'blackjack!', win: 'nyert', push: 'döntetlen', lose: 'vesztett', bust: 'besokallt' };
  say(`🃏 Blackjack: az osztó ${dv > 21 ? 'besokallt' : dv + '-et húzott'}. ` + BJ.seats.map((x) => `${x.nick} ${words[x.result]} (${x.back - x.stake > 0 ? '+' : ''}${fmt(x.back - x.stake)})`).join(', ') + '.');
  console.log(`[${new Date().toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}] blackjack ${BJ.round} | osztó: ${BJ.dealer.join(' ')} (${dv}) | ${BJ.seats.map((x) => `${x.nick}: ${x.cards.join(' ')} tét ${x.stake} -> ${x.back}`).join(' | ')} | pot: ${S.pot}`);
}
function bjSchedule() {
  clearTimeout(bjTimer); bjEndAt = 0;
  if (BJ.phase === 'play') {
    const t = BJ.turn, r = BJ.round; bjEndAt = Date.now() + BJ_TURN_MS;
    bjTimer = setTimeout(() => {
      if (BJ.phase !== 'play' || BJ.turn !== t || BJ.round !== r) return;
      const n = BJ.seats[t].nick; bj.stand(BJ, n); say(`🃏 ${n} nem döntött időben, megállt.`); bjAfter();
    }, BJ_TURN_MS);
  } else if (BJ.phase === 'result') {
    bjEndAt = Date.now() + BJ_RESULT_MS;
    bjTimer = setTimeout(() => { bj.reset(BJ); S.bjBets = []; save(); broadcast(); }, BJ_RESULT_MS);
  }
}
function bjAfter() {
  if (BJ.phase === 'result' && !BJ.settled) { bjSettle(); BJ.settled = true; }
  if (BJ.phase !== 'result') BJ.settled = false;
  bjSchedule();
  S.bjBets = BJ.phase === 'result' ? [] : BJ.seats.map((x) => ({ nick: x.nick, stake: x.stake }));
  save(); broadcast();
}   // becenév -> az előző köre tétjei („Ismétlés” gombhoz)
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
if (rouletteHistoryNeedsMigration) save();

S.roundBets = S.roundBets.filter((b) => game.info(b.kind)).map((b) => ({ ...b, kind: game.norm(b.kind) }));
const R = { id: 0, phase: 'betting', endAt: 0, spinStart: 0, result: null, bets: S.roundBets, doorQueue: 0, sim: null, spinMs: 0, spinner: '', net: null };
let feed = [];
const say = (text) => { feed.unshift({ ts: Date.now(), text }); feed = feed.slice(0, 40); };
const fmt = (n) => n.toLocaleString('hu-HU') + ' 🦝';
const stat = (nick) => (S.stats[nick] ||= { net: 0, rounds: 0, bets: 0, wins: 0 });
function currentDailyChallenge() {
  const date = today();
  if (S.dailyChallenge.date !== date) {
    S.dailyChallenge = dailyChallenge.emptyState(date);
    save();
  }
  return S.dailyChallenge;
}

function settleDailyChallenge(history, spinAt, round, candidateNicks) {
  const state = currentDailyChallenge();
  if (state.winner) return null;
  for (const nick of candidateNicks) {
    const result = dailyChallenge.progress(history, nick, state.date);
    if (!result.complete) continue;
    state.winner = nick;
    state.wonAt = spinAt;
    state.round = round;
    stat(nick).net += dailyChallenge.REWARD;
    say(`🏆 ${nick} teljesítette a napi kihívást: +${fmt(dailyChallenge.REWARD)} jutalom!`);
    save();
    return nick;
  }
  return null;
}

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
// több tét egyszerre (profil vagy ismétlés): vagy mind felkerül, vagy egyik sem
function addBets(nick, list) {
  if (R.phase !== 'betting') return 'A tétek lezárultak, várj a következő körre.';
  if (!list || !list.length) return 'Nincs mit felrakni.';
  const mine = R.bets.filter((b) => b.nick === nick), sum = profiles.total(list);
  if (mine.length + list.length > MAX_BETS) return 'Ennyi zseton már nem fér fel ebben a körben.';
  if (profiles.total(mine) + sum > MAX_PER_ROUND) return `Egy körben legfeljebb ${fmt(MAX_PER_ROUND)} lehet a tétjeid összege.`;
  if (S.pot < sum) return 'Nincs elég mosómedve a közös potban.';
  for (const b of list) { S.pot -= b.stake; R.bets.push({ nick, kind: b.kind, stake: b.stake }); }
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
  say(`Az ajtó 1000 🦝-t tett fel (${bets.length === 1 ? kindName(bets[0].kind) : bets.length + ' mezőre'}). Csukásra pörög a kerék.`);
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
  const pun = occasionalBadPun();
  if (pun && parts.length) parts.push(`Szóvicc: ${pun}`);
  if (!parts.length) parts.push('Senki sem nyert.');
  return parts.join(' ');
}

// ---- körök: a kerék csak ajtózárásra vagy „Pörgetés” gombra indul ----
function startBetting() {
  R.id++; R.phase = 'betting'; R.result = null; R.endAt = 0; R.spinner = ''; R.net = null; R.doorBet = false;
  S.roundBets = []; R.bets = S.roundBets;
  if (R.doorQueue > 0) { // pörgés közben csukódott be az ajtó: tegyen tétet és pörgessen
    R.doorQueue--; R.doorOpenQueued = false; placeDoorBet(); R.doorBet = true; R.spinner = DOOR;
    setTimeout(startSpin, T_DOOR_DELAY);
  } else if (R.doorOpenQueued) { // pörgés közben nyílt ki, és még nyitva van: tegyen tétet, csukásra pörög
    R.doorOpenQueued = false; placeDoorBet(); R.doorBet = true;
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
  const settledBets = rouletteHistory.settleBets(R.bets, n, game.payout);
  for (const k of Object.keys(LAST)) delete LAST[k];
  for (const b of R.bets) if (b.nick !== DOOR) (LAST[b.nick] ||= []).push({ kind: b.kind, stake: b.stake });
  for (const b of settledBets) {
    S.pot += b.payout;
    net[b.nick] = (net[b.nick] || 0) + b.net;
  }
  const color = n === 0 ? 'zöld' : game.RED.has(n) ? 'piros' : 'fekete';
  rouletteHistory.updateStats(S.stats, settledBets, DOOR);
  const spinAt = Date.now();
  const spinId = rouletteHistory.nextSpinId(S, spinAt);
  S.rouletteHistory.unshift({
    id: spinId,
    round: R.id,
    at: spinAt,
    spinner: R.spinner,
    number: n,
    color: n === 0 ? 'green' : game.RED.has(n) ? 'red' : 'black',
    bets: settledBets,
    totalStake: settledBets.reduce((sum, bet) => sum + bet.stake, 0),
    totalPayout: settledBets.reduce((sum, bet) => sum + bet.payout, 0),
    net: settledBets.reduce((sum, bet) => sum + bet.net, 0),
  });
  settleDailyChallenge(S.rouletteHistory, spinAt, R.id, [...new Set(settledBets.map((bet) => bet.nick).filter((nick) => nick !== DOOR))]);
  say(`${n} (${color}). ${tease(R.spinner, net)}`);
  // kör-napló a logs/server.log-ba: ki pörgetett, ki mire tett, mi jött, ki mennyit nyert/veszített
  const bySum = {};
  for (const b of R.bets) ((bySum[b.nick] ||= {})[b.kind] = (bySum[b.nick][b.kind] || 0) + b.stake);
  console.log(`[${new Date().toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}] kör ${R.id} | pörgetett: ${R.spinner || '?'} | eredmény: ${n} | tétek: ${
    Object.entries(bySum).map(([k, v]) => `${k}{${Object.entries(v).map(([kk, vv]) => kk + '=' + vv).join(' ')}}`).join(' ')} | nettó: ${
    Object.entries(net).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')} | pot: ${S.pot}`);
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
  const challengeState = currentDailyChallenge();
  const challenge = dailyChallenge.challengeFor(challengeState.date);
  const board = Object.entries(S.stats).map(([nick, s]) => ({ nick, net: s.net, bets: s.bets, wins: s.wins, winRate: rouletteHistory.winRate(s), challengeWin: challengeState.winner === nick })).sort((a, b) => b.net - a.net).slice(0, 60);
  const challengeNicks = new Set([...Object.keys(S.stats), ...R.bets.map((bet) => bet.nick)]);
  const challengeProgress = Object.fromEntries([...challengeNicks].filter((nick) => nick !== DOOR).map((nick) => [nick, dailyChallenge.progress(S.rouletteHistory, nick, challengeState.date)]));
  const spinHistory = S.rouletteHistory.slice(0, 20).map((spin) => ({
    id: spin.id, round: spin.round, at: spin.at, spinner: spin.spinner, number: spin.number, color: spin.color,
    bets: Array.isArray(spin.bets) ? spin.bets.length : 0, totalStake: spin.totalStake, totalPayout: spin.totalPayout, net: spin.net,
  }));
  const snap = {
    t: 'state', boot: BOOT_ID, now: Date.now(), pot: S.pot, round: R.id, phase: R.phase, endAt: R.endAt,
    spinStart: R.spinStart, spinMs: R.spinMs, result: R.phase === 'result' ? R.result : null,
    net: R.phase === 'result' ? R.net : null, chips: game.CHIPS,
    rest: S.rest || physics.DEFAULT_REST,
    bets: R.bets, history: S.history, spinHistory, board, feed: feed.slice(0, 15),
    door: { opens: S.doorOpens, net: S.stats[DOOR]?.net || 0 },
    gyros: S.gyros,
    presence: presence.view(S.presence, today()),
    cola: (cola.prune(S.cola), S.cola.codes),
    profiles: S.profiles, seats: seats.view(S.seats, today()), chapter: chapter.view(S.chapter),
    dailyChallenge: {
      ...challenge,
      date: challengeState.date,
      winner: challengeState.winner,
      wonAt: challengeState.wonAt,
      progress: challengeProgress,
    },
    bj: { ...bj.view(BJ), endAt: bjEndAt, max: bj.MAX_BET }, last: Object.fromEntries(Object.entries(LAST).map(([k, v]) => [k, profiles.total(v)])),
    minesweeper: S.minesweeper, focus: focusNicks(), music: music.view(S.music, Date.now(), music.duckActive(musicRt, Date.now())),
  };
  if (withTrack && R.phase === 'spin' && R.sim) {
    const { w0, tw, alpha0, hz, hits, track } = R.sim;
    snap.spin = { w0, tw, alpha0, hz, hits, track };
  }
  return snap;
}
// „Csak zene” (fókusz) nézetben lévők: a tisztáson a mosómedvéjük mellett fejhallgató és hangjegyek jelennek meg
const focusNicks = () => [...new Set([...wss.clients].filter((c) => c.readyState === 1 && c.focus && c.nick).map((c) => c.nick))].sort();
function publicSpin(spin) {
  if (!spin) return null;
  return {
    id: spin.id, round: spin.round, at: spin.at, spinner: spin.spinner, number: spin.number, color: spin.color,
    bets: Array.isArray(spin.bets) ? spin.bets : [],
    totalStake: spin.totalStake, totalPayout: spin.totalPayout, net: spin.net,
  };
}
function sendUserHistory(ws, rawNick) {
  const target = cleanNick(rawNick);
  const records = [];
  for (const spin of S.rouletteHistory) {
    for (const bet of Array.isArray(spin.bets) ? spin.bets : []) {
      if (bet.nick !== target) continue;
      records.push({ spinId: spin.id, round: spin.round, at: spin.at, spinner: spin.spinner, number: spin.number, color: spin.color, ...bet });
    }
  }
  ws.send(JSON.stringify({ t: 'roulette-user-history', nick: target, history: records }));
}
function sendSpinHistory(ws, id) {
  const spin = S.rouletteHistory.find((item) => item.id === String(id));
  if (!spin) return ws.send(JSON.stringify({ t: 'err', msg: 'Ehhez a régi húzáshoz nincs részletes napló.' }));
  ws.send(JSON.stringify({ t: 'roulette-spin-history', spin: publicSpin(spin) }));
}
// budapesti idő: a nap hányadik másodperce (TEST_CLOCK_OFFSET_MS csak a helyi teszthez tolja el az órát)
function bpSecond(now = Date.now()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now + (Number(process.env.TEST_CLOCK_OFFSET_MS) || 0)));
  const g = (t) => Number(p.find((x) => x.type === t).value);
  return g('hour') * 3600 + g('minute') * 60 + g('second');
}
// kinek mi látszik a szavazásokból: a 'bent' közönségűt csak az látja, aki ma helyben lépett be
const pollCtx = (nick) => { const x = S.seats[nick]; return { bent: !!x && x.day === today() && x.mode === 'bent' }; };
function pendingMsg(nick) {
  const ctx = pollCtx(nick), L = ctx.bent ? polls.lunch(S.polls, today()) : null;
  return { t: 'pending', n: polls.pending(S.polls, nick, ctx), lunch: L && { closesAt: L[0].closesAt, polls: L.map((p) => polls.view(p, nick)) } };
}
function pushPending(only) {
  for (const c of wss.clients) {
    if (c.readyState !== 1 || !c.nick || (only && c !== only)) continue;
    const out = JSON.stringify(pendingMsg(c.nick));
    if (out !== c.lastPending) { c.lastPending = out; c.send(out); }
  }
}
// percenként: 10:00 után létrejönnek a napi ebédszavazások; a lejáratok miatt a számlálók is frissülnek
function lunchTick() {
  const sec = bpSecond(), made = polls.ensureLunch(S.polls, today(), Math.floor(sec / 60), Date.now() + (polls.LUNCH_TO * 60 - sec) * 1000);
  if (made.length) { save(); broadcastPollList(); }
  pushPending();
}
setInterval(lunchTick, 20 * 1000).unref();
setTimeout(lunchTick, 1000).unref();
app.get('/api/pending', (req, res) => {
  const nick = cleanNick(req.query.nick);
  res.json({ n: nick.length >= 2 ? polls.pending(S.polls, nick, pollCtx(nick)) : 0 });
});
function sendPollState(ws, id) {
  const poll = polls.find(S.polls, id);
  if (poll && !polls.canSee(poll, pollCtx(ws.nick))) return ws.send(JSON.stringify({ t: 'err', msg: 'Ez a szavazás csak a ma helyben lévőknek látszik.' }));
  if (!poll) return ws.send(JSON.stringify({ t: 'err', msg: 'Ez a szavazás nem található.' }));
  ws.pollId = poll.id;
  ws.send(JSON.stringify({ t: 'poll-state', poll: polls.view(poll, ws.nick) }));
}
function sendPollList(ws) {
  ws.wantsPollList = true;
  ws.send(JSON.stringify({ t: 'poll-list', polls: polls.list(S.polls, ws.nick, pollCtx(ws.nick)) }));
}
function broadcastPoll(poll) {
  for (const c of wss.clients) {
    if (c.readyState !== 1 || c.pollId !== poll.id) continue;
    c.send(JSON.stringify({ t: 'poll-state', poll: polls.view(poll, c.nick) }));
  }
}
function broadcastPollList() {
  for (const c of wss.clients) {
    if (c.readyState === 1 && c.wantsPollList) c.send(JSON.stringify({ t: 'poll-list', polls: polls.list(S.polls, c.nick, pollCtx(c.nick)) }));
  }
}
let worldTimer = null;
function broadcastWorld() {
  if (worldTimer) return;
  worldTimer = setTimeout(() => {
    worldTimer = null;
    const msg = JSON.stringify({ t: 'world', world: world.view(S.world) });
    for (const c of wss.clients) if (c.readyState === 1 && c.wantsWorld) c.send(msg);
  }, 100);
}
// kik hallgatják most a zenét (a lejátszó 15 s-onként jelez): a lejátszási hibánál ennek a fele kell az ugráshoz
const musicHeard = new Map();
const musicListeners = (now) => { let n = 0; for (const [k, t] of musicHeard) { if (now - t < 45000) n++; else musicHeard.delete(k); } return n; };
// a bekötött YouTube-lista lekérése (percenként, bekötéskor és kérésre; legfeljebb 10 másodpercenként)
let musicFetching = false, musicLastFetch = 0;
async function refreshMusic(force) {
  if (!S.music.list || musicFetching || process.env.MUSIC_FETCH === '0') return;
  if (!force && Date.now() - musicLastFetch < 10000) return;
  musicFetching = true; musicLastFetch = Date.now();
  const list = S.music.list;
  try {
    const r = await music.fetchList(list);
    if (S.music.list === list && music.updateItems(S.music, r.title, r.items, Date.now())) { save(); broadcastMusic(); }
  } catch (e) {
    if (S.music.list === list) { music.fetchFailed(S.music, String(e.message || e).slice(0, 160), Date.now()); broadcastMusic(); }
  } finally { musicFetching = false; }
}
if (!S.music.list && process.env.MUSIC_PLAYLIST) music.setList(S.music, process.env.MUSIC_PLAYLIST);   // alapértelmezett lista a .env-ből
setInterval(() => refreshMusic(true), 60 * 1000).unref();
setTimeout(() => refreshMusic(true), 3000).unref();
function broadcastMusic(msg) {
  const out = JSON.stringify(msg || { t: 'music', music: music.view(S.music, Date.now(), music.duckActive(musicRt, Date.now())) });
  for (const c of wss.clients) if (c.readyState === 1) c.send(out);
}
function broadcast(withTrack) {
  const msg = JSON.stringify(snapshot(withTrack));
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}
function addMinesweeperScore(nick, level, seconds) {
  if (!MINESWEEPER_LEVELS.has(level)) return 'Ismeretlen nehézség.';
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return 'Érvénytelen időeredmény.';
  const scores = S.minesweeper.scores[level];
  scores.push({ nick, seconds, at: Date.now() });
  scores.sort((a, b) => a.seconds - b.seconds || a.at - b.at);
  S.minesweeper.scores[level] = scores.slice(0, 10);
  return null;
}

wss.on('connection', (ws) => {
  ws.nick = ''; ws.budget = 10;
  const refill = setInterval(() => { ws.budget = 10; }, 1000);
  ws.on('close', () => {
    clearInterval(refill);
    if (ws.focus) setImmediate(() => broadcast());
    // a tisztásról akkor lép ki, ha ezzel a becenévvel már senki nincs bent (más lapon sem)
    if (ws.inWorld && ![...wss.clients].some((c) => c !== ws && c.inWorld && c.nick === ws.nick)) { world.leave(S.world, ws.nick); save(); broadcastWorld(); }
  });
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
      ws.lastPending = ''; pushPending(ws);
      return;
    }
    if (m.t === 'cola-add' || m.t === 'cola-used' || m.t === 'cola-unused') {
      let e = null;
      if (m.t === 'cola-add') { const r = cola.add(S.cola, m.code, m.by); e = r.error; if (!e) say(`🥤 Új kólakód került fel${r.item.by ? ` (${r.item.by})` : ''}.`); }
      else if (m.t === 'cola-used') { e = cola.markUsed(S.cola, String(m.id || ''), m.by); if (!e) say('🥤 Egy kólakódot felhasználtak.'); }
      else e = cola.unmark(S.cola, String(m.id || ''));
      if (e) return err(e);
      save(); broadcast();
      return;
    }
    if (m.t === 'gyros-claim' || m.t === 'gyros-unclaim' || m.t === 'gyros-add') {
      const G = S.gyros, num = gyros.key(parseInt(m.number, 10));
      const e = m.t === 'gyros-claim' ? gyros.claim(G, m.number, m.alias)
        : m.t === 'gyros-unclaim' ? gyros.unclaim(G, m.number, m.alias)
          : gyros.addContributor(G, m.name, m.alias);
      if (e) return err(e);
      if (m.t === 'gyros-claim') say(`${m.alias} rögzítette a ${num} számú gyrosnyugtát. Összesen: ${Object.keys(G.receipts).length}.`);
      else if (m.t === 'gyros-unclaim') say(`${m.alias} visszavonta a ${num} számú nyugtát.`);
      else say(`Új gyros-hozzájáruló: ${G.contributors[G.contributors.length - 1].alias}`);
      save(); broadcast();
      return;
    }
    if (m.t === 'w-watch') { ws.wantsWorld = true; ws.send(JSON.stringify({ t: 'world', world: world.view(S.world) })); return; }
    if (m.t === 'music-ping') { if (m.j && ws.nick) musicHeard.set(ws.nick, Date.now()); return ws.send(JSON.stringify({ t: 'music-pong', c: Number(m.c) || 0, s: Date.now() })); }   // óraszinkron; aki hallgatja, azt számoljuk   // óraszinkron a közös zenéhez
    if (m.t === 'poll-list') return sendPollList(ws);
    if (m.t === 'poll-get') return sendPollState(ws, m.id);
    if (!ws.nick) return err('Előbb adj meg becenevet.');
    if (m.t === 'focus') { if (ws.focus !== !!m.on) { ws.focus = !!m.on; broadcast(); } return; }
    if (m.t.startsWith('music-')) {
      const now = Date.now();
      let e = null;
      if (m.t === 'music-list') {   // a közös YouTube-lista bekötése (a meghívó link is jó)
        if (!(e = music.setList(S.music, m.input))) { say(`🎵 ${ws.nick} bekötötte a közös zenelistát.`); save(); broadcastMusic(); broadcast(); refreshMusic(true); }
        return e ? err(e) : undefined;
      }
      if (m.t === 'music-refresh') { refreshMusic(false); return; }
      if (m.t === 'music-add') {   // egy szám betétele linkkel; a cím a YouTube oEmbedjéből jön
        const v = music.parseVideo(m.input);
        if (!v) return err('Ez nem YouTube-szám linkje (pl. youtube.com/watch?v=… vagy youtu.be/…).');
        if (S.music.items.some((x) => x.v === v)) return err('Ez a szám már a listán van.');
        if (now - (ws.lastAdd || 0) < 3000) return err('Várj egy pillanatot a következő számmal.');
        ws.lastAdd = now;
        const nick = ws.nick;
        (process.env.MUSIC_FETCH === '0' ? Promise.resolve('') : music.fetchTitle(v)).then((title) => {
          const e2 = music.addSong(S.music, v, title, nick, Date.now());
          if (e2) return err(e2);
          say(`🎵 ${nick} betett egy számot: ${S.music.items.find((x) => x.v === v).title}`);
          save(); broadcastMusic(); broadcast();
        }, (x) => { ws.lastAdd = 0; err(String(x.message || x).slice(0, 160)); });
        return;
      }
      const zlog = (what) => console.log(`[${new Date(now).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}] zene: ${ws.nick} ${what}`);
      if (m.t === 'music-ended') {   // csak ha a közös idő szerint is vége (elavult, dupla vagy korai jelentést eldobunk)
        const el = ((now - S.music.startedAt) / 1000).toFixed(1);
        if (!music.ended(S.music, m.rev, now, Number(m.dur))) { if (m.rev === S.music.rev) zlog(`korai vége-jelentést küldött (eltelt ${el} s, hossz ${Number(m.dur) || '?'} s), eldobva`); return; }
        zlog(`vége-jelentés (eltelt ${el} s) -> következő szám`);
      } else if (m.t === 'music-error') {
        const n = musicListeners(now);
        zlog(`lejátszási hibát jelzett (${Number(m.code) || '?'}), hallgatók: ${n}`);
        if (!music.failed(S.music, m.rev, ws.nick, n, now)) return;
        zlog('-> a hallgatók fele nem tudja lejátszani, következő szám');
      }
      else if (m.t === 'music-skip') e = music.skip(S.music, m.dir, now);
      else if (m.t === 'music-play') e = music.play(S.music, Number(m.i), now);
      else if (m.t === 'music-pause') e = music.setPaused(S.music, !!m.paused, now);
      else if (m.t === 'music-remove') e = music.removeSong(S.music, String(m.v || ''), now);
      else if (m.t === 'music-shuffle') { e = music.setShuffle(S.music, !!m.on); if (!e) say(`🎵 ${ws.nick} ${m.on ? 'bekapcsolta' : 'kikapcsolta'} a véletlen sorrendet.`); }
      else return err('Ismeretlen zene-művelet.');
      if (e) return err(e);
      save(); broadcastMusic();
      return;
    }
    if (m.t === 'w-join' || m.t === 'w-move' || m.t === 'w-sit' || m.t === 'w-leave') {
      ws.wantsWorld = true;
      if (m.t === 'w-leave') { ws.inWorld = false; world.leave(S.world, ws.nick); save(); return broadcastWorld(); }
      const e = m.t === 'w-join' ? world.join(S.world, ws.nick) : m.t === 'w-move' ? world.move(S.world, ws.nick, m) : world.sit(S.world, ws.nick, m.spot);
      if (e) return err(e);
      if (m.t === 'w-join') { ws.inWorld = true; ws.send(JSON.stringify({ t: 'w-me', me: world.view(S.world)[ws.nick] })); }
      if (m.t !== 'w-move') save(); else { clearTimeout(ws.moveSave); ws.moveSave = setTimeout(save, 2000); }
      return broadcastWorld();
    }
    if (m.t === 'minesweeper-score') {
      const e = addMinesweeperScore(ws.nick, String(m.difficulty || ''), Number(m.seconds));
      if (e) return err(e);
      save(); broadcast();
      return;
    }
    if (m.t === 'roulette-user-history') return sendUserHistory(ws, m.nick);
    if (m.t === 'roulette-spin-history') return sendSpinHistory(ws, m.id);
    if (m.t === 'spin') {
      if (R.phase !== 'betting') return err('A kerék éppen forog.');
      if (!R.bets.some((b) => b.nick === ws.nick)) return err('Pörgetés előtt tegyél legalább egy tétet.');
      say(`${ws.nick} megpörgette a kereket.`);
      R.spinner = ws.nick;
      return startSpin();
    }
    if (m.t && m.t.startsWith('bj-')) {
      let e = null;
      if (m.t === 'bj-bet') {
        const amt = m.amount;
        if (!game.CHIPS.includes(amt)) e = 'Ismeretlen zseton.';
        else if (S.pot < amt) e = 'Nincs elég mosómedve a közös potban.';
        else if (!(e = bj.bet(BJ, ws.nick, amt, Number.isInteger(m.seat) ? m.seat : undefined))) S.pot -= amt;
      } else if (m.t === 'bj-unbet') S.pot += bj.unbet(BJ, ws.nick);
      else if (m.t === 'bj-deal') { if (!BJ.seats.some((x) => x.nick === ws.nick)) e = 'Osztást az kérhet, aki ült le tétet tenni.'; else if (!(e = bj.deal(BJ))) say(`🃏 ${ws.nick} osztást kért a blackjack-asztalnál.`); }
      else if (m.t === 'bj-hit') e = bj.hit(BJ, ws.nick);
      else if (m.t === 'bj-stand') e = bj.stand(BJ, ws.nick);
      else if (m.t === 'bj-double') {
        e = bj.canDouble(BJ, ws.nick);
        const st = !e && BJ.seats[BJ.turn].stake;
        if (!e && S.pot < st) e = 'Nincs elég mosómedve a potban a duplázáshoz.';
        if (!e) { S.pot -= st; e = bj.double(BJ, ws.nick); }
      } else e = 'Ismeretlen blackjack-lépés.';
      if (e) return err(e);
      bjAfter();
      return;
    }
    // ki ül hol: HO vagy helyben (belépéskor), aztán leülés egy szabad helyre, felállás
    if (m.t === 'where' || m.t === 'seat' || m.t === 'stand' || m.t === 'leave') {
      const had = S.seats[ws.nick] && S.seats[ws.nick].day === today();
      const e = m.t === 'where' ? seats.where(S.seats, ws.nick, m.mode, today())
        : m.t === 'seat' ? seats.sit(S.seats, ws.nick, m.spot, today())
          : m.t === 'stand' ? seats.stand(S.seats, ws.nick, today()) : seats.leave(S.seats, ws.nick, today());
      if (e) return err(e);
      if (m.t === 'leave') say(`👋 ${ws.nick} kilépett.`);
      setImmediate(() => { pushPending(); broadcastPollList(); });
      // aznapi első bejelentkezés: helyben +10 000, home office-ból +5 000 a közös potba (egy becenév naponta egyszer kaphat)
      if (m.t === 'where' && !had) {
        const amount = m.mode === 'ho' ? HO_CREDIT : DAILY_CREDIT;
        const bonus = credit(ws.nick, amount) ? `, +${fmt(amount)} a potba` : '';
        say(m.mode === 'ho' ? `🏠 ${ws.nick} home office-ból csatlakozott${bonus}.` : `🦝 ${ws.nick} bent van${bonus}.`);
      }
      save(); broadcast(); return;
    }
    if (m.t === 'profile-save') {
      const e = profiles.saveProfile(S.profiles, ws.nick, m.name, R.bets.filter((b) => b.nick === ws.nick));
      if (e) return err(e);
      save(); broadcast(); return;
    }
    if (m.t === 'profile-delete') {
      const e = profiles.deleteProfile(S.profiles, ws.nick, String(m.name || ''));
      if (e) return err(e);
      save(); broadcast(); return;
    }
    if (m.t === 'chapter-set') {
      const first = !S.chapter.votes[ws.nick];
      const e = chapter.setDays(S.chapter, ws.nick, m.days, today());
      if (e) return err(e);
      if (first && S.chapter.votes[ws.nick]) say(`📅 ${ws.nick} bejelölte, mikor jó neki az AI chapter.`);
      save(); broadcast(); return;
    }
    if (m.t === 'poll-create') {
      const sec = bpSecond(), TTL = { today: 86400 - sec, '1d': 86400, '3d': 3 * 86400, '7d': 7 * 86400 };
      const result = polls.create(S.polls, { creator: ws.nick, title: m.title, options: m.options, multiple: m.multiple, closesAt: Date.now() + (TTL[m.ttl] || TTL['7d']) * 1000 });
      if (result.error) return err(result.error);
      ws.pollId = result.poll.id;
      save();
      ws.send(JSON.stringify({ t: 'poll-created', url: `/szavazas.html?id=${encodeURIComponent(result.poll.id)}`, poll: polls.view(result.poll, ws.nick) }));
      broadcastPoll(result.poll);
      broadcastPollList(); pushPending();
      return;
    }
    if (m.t === 'poll-vote') {
      const poll = polls.find(S.polls, m.id);
      if (!poll || !polls.canSee(poll, pollCtx(ws.nick))) return err('Ez a szavazás nem található.');
      const e = polls.vote(poll, ws.nick, m.choices);
      if (e) return err(e);
      if (!m.quiet) ws.pollId = poll.id;
      save();
      broadcastPoll(poll); broadcastPollList(); pushPending();
      return;
    }
    if (m.t === 'poll-edit') {
      const poll = polls.find(S.polls, m.id);
      if (!poll) return err('Ez a szavazás nem található.');
      const e = polls.edit(poll, ws.nick, { title: m.title, options: m.options });
      if (e) return err(e);
      ws.pollId = poll.id;
      save();
      broadcastPoll(poll);
      broadcastPollList();
      return;
    }
    const e = m.t === 'bet' ? addBet(ws.nick, m.kind, m.amount) : m.t === 'undo' ? undoBet(ws.nick, false) : m.t === 'clear' ? undoBet(ws.nick, true)
      : m.t === 'profile-apply' ? (profiles.getProfile(S.profiles, ws.nick, String(m.name || '')) ? addBets(ws.nick, profiles.getProfile(S.profiles, ws.nick, String(m.name || '')).bets) : 'Nincs ilyen profil.')
        : m.t === 'rebet' ? (LAST[ws.nick] ? addBets(ws.nick, LAST[ws.nick]) : 'Az előző körben nem volt téted.') : null;
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
  console.log(`[${new Date().toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}] ajtó: ${st} (fázis: ${R.phase})`);
  // nyitásra az ajtó felteszi a tétjét, csukásra pörög a kerék
  const duck = music.onDoor(musicRt, st, Date.now());   // a zene halkul, amíg az ajtó nyitva van
  if (duck) broadcastMusic(duck);
  if (st === 'open') {
    S.doorOpens++;
    say('🚪 Az ajtó kinyílt.');
    if (R.phase === 'betting') { if (!R.doorBet) { placeDoorBet(); R.doorBet = true; } }
    else R.doorOpenQueued = true;                  // pörgés közben nyílt: a következő körben tesz fel
  } else if (st === 'closed') {
    say('🚪 Az ajtó becsukódott.');
    if (R.phase === 'betting') {
      if (!R.doorBet) { placeDoorBet(); R.doorBet = true; }   // ha a nyitás jele elveszett, most tesz fel
      R.spinner = DOOR; startSpin();
    } else if (!R.doorBet || R.doorOpenQueued) R.doorQueue++;   // pörgés közben csukódott: a következő körben tesz fel és pörget
    // (ha a nyitáskori tétje már ebben a pörgésben van, és azóta nem nyílt újra, ez a csukás nem tesz fel még egyszer)
  } else return res.status(400).json({ error: 'state: open|closed' });
  save(); broadcast(); res.json({ ok: true, opens: S.doorOpens });
});
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Budapest' });
// aznapi első érkezés: +10 000 (home office-ból +5 000) a közös potba; egy becenév naponta csak egyszer kaphat
function credit(n, amount = DAILY_CREDIT) {
  if (S.credited.date !== today()) S.credited = { date: today(), names: [] };
  S.bent[n] = Date.now();
  if (S.credited.names.includes(n)) return false;
  S.credited.names.push(n); S.pot += amount;
  return true;
}
app.post('/api/presence', ingest, (req, res) => {
  const names = (Array.isArray(req.body?.present) ? req.body.present : []).map(cleanNick).filter(Boolean).slice(0, 50);
  const first = [];
  for (const n of names) if (credit(n)) { first.push(n); say(`${n} beért, +${fmt(DAILY_CREDIT)} a potba.`); }
  save(); broadcast(); res.json({ ok: true, credited: first });
});

// ---- Ki van bent: QR-kód (vagy NFC-matrica) az ajtón -> /itt?k=<ajtókód> ----
// A céges hálózatot nem figyeljük: a telefon csak megnyit egy weboldalt. A becenév a telefonhoz kötődik
// (a szerver által adott, HttpOnly süti), így más telefonról nem lehet valaki nevében bejelentkezni.
const DOOR_CODE = process.env.DOOR_CODE || '';
const DEV_COOKIE = 'exm_dev';
const cookies = (req) => Object.fromEntries((req.get('cookie') || '').split(';').map((c) => c.trim().split('=')).filter((x) => x.length === 2));
const hitsI = new Map();
setInterval(() => hitsI.clear(), 60000);
function itt(req, res, next) {
  const n = (hitsI.get(req.ip) || 0) + 1; hitsI.set(req.ip, n);
  if (n > 120) return res.status(429).json({ error: 'Túl sok kérés, próbáld újra egy perc múlva.' });
  if (!DOOR_CODE) return res.status(503).json({ error: 'Az ajtókód nincs beállítva a szerveren.' });
  const k = String(req.body?.k || ''), a = Buffer.from(k), b = Buffer.from(DOOR_CODE);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'Ez a link nem érvényes. Olvasd be az ajtón lévő QR-kódot.' });
  req.dev = cookies(req)[DEV_COOKIE] || '';
  next();
}
function setDevice(req, res, dev) {
  const https = req.get('x-forwarded-proto') === 'https' || req.secure;
  res.setHeader('Set-Cookie', `${DEV_COOKIE}=${dev}; Path=/api/itt; Max-Age=${400 * 86400}; HttpOnly; SameSite=Lax${https ? '; Secure' : ''}`);
}
function arrived(nick, res, req) {
  const P = S.presence, fresh = presence.checkin(P, nick, Date.now(), today());
  let credited = false;
  if (fresh) { credited = credit(nick); say(credited ? `📱 ${nick} beért, +${fmt(DAILY_CREDIT)} a potba.` : `📱 ${nick} visszaért.`); }
  setDevice(req, res, req.dev);                       // minden beolvasás meghosszabbítja a sütit
  save(); broadcast();
  res.json({ status: 'in', nick, fresh, credited, since: P.here[nick].since, bonus: DAILY_CREDIT });
}
// beolvasás: ha a telefon ismert, bejelentkezik; ha nem, becenevet kér
app.post('/api/itt', itt, (req, res) => {
  const nick = presence.nickOf(S.presence, req.dev);
  if (!nick) { const v = presence.view(S.presence, today()); return res.json({ status: 'need-nick', taken: v.people.filter((n) => !v.free.includes(n)) }); }
  arrived(nick, res, req);
});
app.post('/api/itt/claim', itt, (req, res) => {
  const nick = cleanNick(req.body?.nick);
  if (!presence.validDevice(req.dev)) req.dev = presence.newDevice();
  const e = presence.claim(S.presence, nick, req.dev);
  if (e) return res.status(409).json({ error: e });
  arrived(nick, res, req);
});
app.post('/api/itt/leave', itt, (req, res) => {
  const nick = presence.nickOf(S.presence, req.dev);
  if (!nick) return res.status(404).json({ error: 'Ez a telefon nincs becenévhez kötve.' });
  if (presence.checkout(S.presence, nick)) say(`📱 ${nick} elment.`);
  save(); broadcast(); res.json({ status: 'out', nick });
});
// a gazda (mester token) felszabadíthat egy becenevet, pl. telefoncsere után
app.delete('/api/presence/people/:nick', ingest, (req, res) => {
  const e = presence.release(S.presence, cleanNick(req.params.nick));
  if (e) return res.status(404).json({ error: e });
  save(); broadcast(); res.json({ ok: true });
});
app.get('/itt', (req, res) => res.sendFile(path.join(__dirname, 'public', 'itt.html')));
// BÉTA: ugyanaz a főoldal, a háttérben a 3D tisztással (a lap maga dönti el az útvonalból)
app.get(['/beta', '/beta.html'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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
