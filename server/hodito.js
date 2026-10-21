// Realtime, Honfoglaló-szerű területfoglaló játék. A szerver az egyetlen hiteles
// óra- és állapotforrás: a kliensek csak területet választanak és válaszokat küldenek.
const COLORS = ['#eb772e', '#3778c2', '#8b4bb3', '#11845b', '#d23b62', '#aa7a18'];
const MAX_PLAYERS = 6;
const BASE_MS = 30000;
const EXPAND_MS = 20000;
const BONUS_MS = 20000;
const ATTACK_MS = 15000;
const EXPANSION_ROUNDS = 3;
const ATTACKS_PER_PLAYER = 2;

const NAMES = [
  'Fenyves', 'Ködkapu', 'Vörös-szikla', 'Napmező', 'Széljárta', 'Vadláp',
  'Hollóvár', 'Aranyrét', 'Kékhegy', 'Tölgyes', 'Sólyomfok', 'Kőpatak',
  'Borostyán', 'Holdvölgy', 'Sasbérc', 'Mocsárszeg', 'Csermely', 'Őrhalom',
  'Farkaserdő', 'Rézvidék', 'Csillagpart', 'Bölényföld', 'Párakert', 'Viharzug',
  'Bársonyrét', 'Kárpátkapu', 'Lápvidék', 'Ezüstpart', 'Várhegy', 'Szederes',
  'Tűzkő', 'Kőrisliget', 'Kincsesföld', 'Sárkányszoros', 'Borókás', 'Napkorona',
];

function createMap(playerCount) {
  const total = playerCount * 6;
  const cols = playerCount <= 2 ? 4 : playerCount <= 4 ? 6 : 8;
  const rows = Math.ceil(total / cols);
  const territories = Array.from({ length: total }, (_, id) => ({
    id, name: NAMES[id], row: Math.floor(id / cols), col: id % cols,
    neighbors: [
      id >= cols ? id - cols : null,
      id + cols < total ? id + cols : null,
      id % cols ? id - 1 : null,
      id % cols < cols - 1 && id + 1 < total ? id + 1 : null,
    ].filter((x) => x !== null),
  }));
  return { territories, cols, rows };
}

// A saját kérdésbank később külön adminfelületről is tölthető.
const QUESTIONS = [
  ['Melyik a Naprendszer legnagyobb bolygója?', ['Föld', 'Jupiter', 'Szaturnusz', 'Mars'], 1, 'Tudomány'],
  ['Melyik évben ért véget a második világháború Európában?', ['1939', '1943', '1945', '1948'], 2, 'Történelem'],
  ['Hány oldala van egy hatszögnek?', ['5', '6', '7', '8'], 1, 'Matek'],
  ['Melyik város Magyarország fővárosa?', ['Szeged', 'Pécs', 'Budapest', 'Győr'], 2, 'Földrajz'],
  ['Ki írta Az ember tragédiáját?', ['Madách Imre', 'Arany János', 'Móricz Zsigmond', 'Jókai Mór'], 0, 'Irodalom'],
  ['Melyik elem vegyjele az O?', ['Arany', 'Oxigén', 'Ólom', 'Ozmium'], 1, 'Tudomány'],
  ['Melyik a Föld legnagyobb óceánja?', ['Atlanti-óceán', 'Indiai-óceán', 'Jeges-tenger', 'Csendes-óceán'], 3, 'Földrajz'],
  ['Hány perc van egy órában?', ['50', '60', '70', '100'], 1, 'Matek'],
  ['Melyik magyar városban található a Dóm tér?', ['Debrecen', 'Szeged', 'Eger', 'Veszprém'], 1, 'Földrajz'],
  ['Melyik állat emlős?', ['Krokodil', 'Pingvin', 'Delfin', 'Gyík'], 2, 'Tudomány'],
  ['Ki festette a Mona Lisát?', ['Van Gogh', 'Leonardo da Vinci', 'Picasso', 'Michelangelo'], 1, 'Művészet'],
  ['Mennyi 7×8?', ['48', '54', '56', '64'], 2, 'Matek'],
  ['Melyik bolygót nevezik vörös bolygónak?', ['Vénusz', 'Mars', 'Merkúr', 'Neptunusz'], 1, 'Tudomány'],
  ['Melyik folyó folyik át Budapesten?', ['Tisza', 'Duna', 'Dráva', 'Rába'], 1, 'Földrajz'],
  ['Melyik hangszernek vannak billentyűi és húrjai is?', ['Hegedű', 'Zongora', 'Fuvola', 'Trombita'], 1, 'Művészet'],
  ['Hány játékos van egyszerre egy futballcsapatban a pályán?', ['9', '10', '11', '12'], 2, 'Sport'],
  ['Melyik kontinensen található Egyiptom nagy része?', ['Ázsia', 'Afrika', 'Európa', 'Dél-Amerika'], 1, 'Földrajz'],
  ['Melyik a legkisebb prímszám?', ['0', '1', '2', '3'], 2, 'Matek'],
  ['Mi Magyarország pénzneme?', ['Korona', 'Forint', 'Pengő', 'Euró'], 1, 'Közélet'],
  ['Melyik évszak követi a nyarat?', ['Tavasz', 'Ősz', 'Tél', 'Nincs ilyen'], 1, 'Közös'],
  ['Melyik városban található az Eiffel-torony?', ['London', 'Párizs', 'Róma', 'Berlin'], 1, 'Földrajz'],
  ['Hány színe van a szivárványnak a hagyományos felosztás szerint?', ['5', '6', '7', '8'], 2, 'Tudomány'],
  ['Melyik sportban használnak ütőt és labdát, valamint hálót?', ['Úszás', 'Tenisz', 'Birkózás', 'Síelés'], 1, 'Sport'],
  ['Melyik a világ legnagyobb szárazföldi állata?', ['Elefánt', 'Zsiráf', 'Víziló', 'Orrszarvú'], 0, 'Tudomány'],
  ['Melyik hónapban van karácsony?', ['Október', 'November', 'December', 'Január'], 2, 'Közös'],
  ['Melyik nem programozási nyelv?', ['JavaScript', 'Python', 'HTML', 'C++'], 2, 'Technika'],
  ['Melyik ország zászlaján látható juharlevél?', ['Kanada', 'Ausztrália', 'Japán', 'Norvégia'], 0, 'Földrajz'],
  ['Hány lába van egy póknak?', ['6', '8', '10', '12'], 1, 'Tudomány'],
  ['Ki volt Mátyás király?', ['Magyar király', 'Római császár', 'Francia festő', 'Angol költő'], 0, 'Történelem'],
  ['Melyik szín keveréke a narancssárga?', ['Kék és zöld', 'Piros és sárga', 'Sárga és fekete', 'Piros és kék'], 1, 'Művészet'],
  ['Melyik a leggyorsabb szárazföldi állat?', ['Gepárd', 'Ló', 'Oroszlán', 'Antilop'], 0, 'Tudomány'],
  ['Hány napból áll egy szökőév?', ['364', '365', '366', '367'], 2, 'Matek'],
];

const NUMERIC_QUESTIONS = [
  ['Hány kilométer hosszú a Duna, kerekítve?', 2850, 'Földrajz', 'km'],
  ['Hány méter magas a Mount Everest, kerekítve?', 8849, 'Földrajz', 'méter'],
  ['Hány millió lakosa van Magyarországnak, kerekítve?', 10, 'Közélet', 'millió fő'],
  ['Hány nap alatt kerüli meg a Föld a Napot, kerekítve?', 365, 'Tudomány', 'nap'],
  ['Hány kilométer a maratoni futás hivatalos távja, kerekítve?', 42, 'Sport', 'km'],
  ['Hány méter magas a budapesti Országház, kerekítve?', 96, 'Földrajz', 'méter'],
  ['Hány billentyűje van egy hagyományos zongorának?', 88, 'Művészet', 'billentyű'],
  ['Hány kis négyzetből áll a Rubik-kocka egy lapja?', 9, 'Matek', 'kis négyzet'],
  ['Hány perc egy teljes nap?', 1440, 'Matek', 'perc'],
  ['Hány évig tartott a százéves háború, kerekítve?', 100, 'Történelem', 'év'],
  ['Hány kilométerre van körülbelül Budapest Bécstől közúton?', 243, 'Földrajz', 'km'],
  ['Hány liter víz fér egy köbméterbe?', 1000, 'Matek', 'liter'],
];

// A poolt később egy szerkesztett, 2000+2000-es adatfájlra lehet cserélni.
// Addig determinisztikus matematikai kérdésekkel tartjuk meg a kívánt méretet.
function makeChoiceQuestions(count) {
  return Array.from({ length: count }, (_, i) => {
    const base = 40 + i * 3, b = 2 + (i % 11), operation = i % 4;
    let text, answer, delta;
    if (operation === 0) { text = `Mennyi ${base} + ${b}?`; answer = base + b; }
    else if (operation === 1) { text = `Mennyi ${base + b} − ${b}?`; answer = base; }
    else if (operation === 2) { text = `Mennyi ${base} × ${b}?`; answer = base * b; }
    else { text = `Mennyi ${base * b} ÷ ${b}?`; answer = base; }
    delta = 3 + (i % 7);
    const distractors = [answer + delta, answer - delta, answer + delta * 2];
    const answerIndex = i % 4;
    const options = Array.from({ length: 4 }, (_, index) => index === answerIndex ? answer : distractors.shift());
    return [text, options.map(String), answerIndex, 'Matek'];
  });
}

function makeNumericQuestions(count) {
  return Array.from({ length: count }, (_, i) => {
    const value = 10 + i * 7, factor = 2 + (i % 13), operation = i % 5;
    if (operation === 0) return [`Hány másodperc van ${value} percben?`, value * 60, 'Matek', 'másodperc'];
    if (operation === 1) return [`Mennyi ${value} × ${factor}?`, value * factor, 'Matek', ''];
    if (operation === 2) return [`Hány centiméter ${value} méter?`, value * 100, 'Matek', 'centiméter'];
    if (operation === 3) return [`Hány gramm ${value} kilogramm?`, value * 1000, 'Matek', 'gramm'];
    return [`Hány nap ${value} hét?`, value * 7, 'Matek', 'nap'];
  });
}

const rawChoiceQuestions = QUESTIONS.concat(makeChoiceQuestions(2000 - QUESTIONS.length));
const rawNumericQuestions = NUMERIC_QUESTIONS.concat(makeNumericQuestions(2000 - NUMERIC_QUESTIONS.length));
const questionObjects = rawChoiceQuestions.map(([text, options, answer, category], id) => ({ id: `q${id}`, type: 'choice', text, options, answer, category, asked: false }));
const numericObjects = rawNumericQuestions.map(([text, answer, category, unit], id) => ({ id: `n${id}`, type: 'number', text, answer, category, unit, asked: false }));
const questionPool = { choice: questionObjects, numeric: numericObjects };
const now = () => Date.now();
const randomItem = (a) => a[Math.floor(Math.random() * a.length)];
const cleanCode = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

function takeUnasked(pool) {
  const available = pool.filter((question) => !question.asked);
  if (!available.length) return null;
  const question = randomItem(available);
  question.asked = true;
  return question;
}

function emptyTerritories(map) { return map.map((x) => ({ id: x.id, owner: null })); }
function byNick(room, nick) { return room.players.find((p) => p.nick === nick); }
function playerTerritories(room, nick) { return room.territories.filter((t) => t.owner === nick).map((t) => t.id); }
function neighborsOf(room, id) { return room.map[id]?.neighbors || []; }
function canExpand(room, p) { return playerTerritories(room, p.nick).some((id) => neighborsOf(room, id).some((n) => !room.territories[n].owner)); }
function canAttack(room, p) { return playerTerritories(room, p.nick).some((id) => neighborsOf(room, id).some((n) => room.territories[n].owner && room.territories[n].owner !== p.nick)); }
function publicQuestion(q) {
  if (!q) return null;
  const result = { id: q.id, type: q.type, text: q.text, category: q.category };
  if (q.type === 'choice') result.options = q.options;
  if (q.type === 'number') result.unit = q.unit;
  return result;
}

class Manager {
  constructor(notify) { this.rooms = new Map(); this.notify = notify; }

  emit(room) { if (room) this.notify(room); }

  create(nick) {
    let code;
    do { code = Math.random().toString(36).slice(2, 7).toUpperCase(); } while (this.rooms.has(code));
    const room = {
      code, host: nick, players: [], phase: 'lobby', map: [], mapCols: 0, mapRows: 0, territories: [],
      baseDeadline: 0, endAt: 0, expansionRound: 0, activeIndex: 0, attackTurns: 0,
      selections: new Map(), answers: {}, question: null, bonusTarget: null, bonusAnswers: {},
      battle: null, selectedTarget: null, winner: '', message: 'Várjuk a játékosokat…',
      timer: null,
    };
    this.rooms.set(code, room); this.join(room, nick); return room;
  }

  joinByCode(code, nick) {
    const room = this.rooms.get(cleanCode(code));
    if (!room) return { error: 'Nincs ilyen szoba.' };
    return this.join(room, nick);
  }

  join(room, nick) {
    if (room.phase !== 'lobby') return { error: 'Ez a játék már elkezdődött.' };
    if (room.players.some((p) => p.nick === nick)) return { error: 'Ezzel a becenévvel már bent van valaki.' };
    if (room.players.length >= MAX_PLAYERS) return { error: 'A szoba megtelt.' };
    room.players.push({ nick, color: COLORS[room.players.length], base: null, connected: true });
    room.message = `${room.players.length} játékos a szobában.`; this.emit(room); return { room };
  }

  leave(room, nick) {
    if (!room) return;
    const i = room.players.findIndex((p) => p.nick === nick);
    if (i < 0) return;
    room.players.splice(i, 1);
    if (!room.players.length) { clearTimeout(room.timer); this.rooms.delete(room.code); return; }
    if (room.host === nick) room.host = room.players[0].nick;
    if (room.activeIndex >= room.players.length) room.activeIndex = 0;
    room.message = `${nick} kilépett a játékből.`;
    this.emit(room);
  }

  start(room, nick) {
    if (!room || room.host !== nick) return { error: 'Csak a szoba gazdája indíthat.' };
    if (room.players.length < 2) return { error: 'Legalább két játékos kell.' };
    const map = createMap(room.players.length);
    room.map = map.territories; room.mapCols = map.cols; room.mapRows = map.rows; room.territories = emptyTerritories(room.map);
    room.phase = 'base'; room.message = 'Válassz egy bázisterületet!'; room.baseDeadline = now() + BASE_MS; room.endAt = room.baseDeadline;
    this.arm(room, BASE_MS, () => this.finishBases(room)); this.emit(room); return { room };
  }

  chooseBase(room, nick, id) {
    if (!room || room.phase !== 'base') return { error: 'Most nem lehet bázist választani.' };
    const p = byNick(room, nick), n = Number(id);
    if (!p || p.base !== null || !Number.isInteger(n) || !room.territories[n] || room.territories[n].owner) return { error: 'Ez a bázisterület nem választható.' };
    p.base = n; room.territories[n].owner = nick; room.message = `${nick} kiválasztotta a bázisát.`;
    if (room.players.every((x) => x.base !== null)) this.finishBases(room); else this.emit(room);
    return { room };
  }

  finishBases(room) {
    if (!room || room.phase !== 'base') return;
    for (const p of room.players) if (p.base === null) {
      const free = room.territories.filter((t) => !t.owner); if (!free.length) break;
      const t = randomItem(free); p.base = t.id; t.owner = p.nick;
    }
    clearTimeout(room.timer); room.phase = 'expand'; room.expansionRound = 1; this.prepareExpansionRound(room);
  }

  nextQuestion() { return takeUnasked(questionPool.choice); }

  nextNumericQuestion() { return takeUnasked(questionPool.numeric); }

  prepareExpansionRound(room) {
    if (!room || room.phase !== 'expand') return;
    room.selections = new Map(); room.answers = {}; room.question = this.nextQuestion();
    if (!room.question) return this.finish(room, 'Elfogyott a feleletválasztós kérdésbank.');
    room.endAt = now() + EXPAND_MS;
    room.message = `Terjeszkedési kör ${room.expansionRound}/3: mindenki válasszon szabad szomszédos területet, majd válaszoljon!`;
    this.arm(room, EXPAND_MS, () => this.resolveExpansionRound(room)); this.emit(room);
  }

  isLegalExpansionTarget(room, nick, id) {
    const n = Number(id);
    if (!Number.isInteger(n) || !room.territories[n] || room.territories[n].owner) return false;
    return playerTerritories(room, nick).some((owned) => neighborsOf(room, owned).includes(n));
  }

  chooseTarget(room, nick, id) {
    if (!room || (room.phase !== 'expand' && room.phase !== 'attack')) return { error: 'Most nem választható célterület.' };
    const n = Number(id), p = byNick(room, nick);
    if (!p || !Number.isInteger(n) || !room.territories[n]) return { error: 'Hibás célterület.' };
    if (room.phase === 'expand') {
      if (!this.isLegalExpansionTarget(room, nick, n)) return { error: 'Ez a terület nem választható terjeszkedési célpont.' };
      for (const [other, target] of room.selections) if (other !== nick && target === n) return { error: 'Ezt a területet már más választotta ebben a körben.' };
      room.selections.set(nick, n); room.message = `${nick} célpontot választott: ${room.map[n].name}.`; this.emit(room); return { room };
    }
    const active = room.players[room.activeIndex];
    if (!active || active.nick !== nick) return { error: 'Nem te vagy soron.' };
    const legal = playerTerritories(room, nick).some((owned) => neighborsOf(room, owned).includes(n)) && room.territories[n].owner && room.territories[n].owner !== nick;
    if (!legal) return { error: 'Ez a terület innen nem választható támadási célpont.' };
    room.selectedTarget = n; room.message = `${nick} megtámadja: ${room.map[n].name}.`; this.beginBattle(room); return { room };
  }

  answer(room, nick, answerValue) {
    if (!room || !room.question) return { error: 'Nincs aktív kérdés.' };
    const q = room.question;
    if (room.phase === 'expand') {
      const a = Number(answerValue);
      if (!Number.isInteger(a) || a < 0 || a >= q.options.length) return { error: 'Hibás válasz.' };
      if (!byNick(room, nick) || !room.selections.has(nick)) return { error: 'Előbb válassz célterületet.' };
      if (room.answers[nick] !== undefined) return { error: 'Ezt a kérdést már megválaszoltad.' };
      room.answers[nick] = { answer: a, at: now() };
      if (room.players.every((p) => room.answers[p.nick] !== undefined)) this.resolveExpansionRound(room); else this.emit(room);
      return { room };
    }
    if (room.phase === 'bonus') {
      const guess = Number(answerValue);
      if (!Number.isFinite(guess)) return { error: 'A tippnek számnak kell lennie.' };
      if (!byNick(room, nick)) return { error: 'Ez a játékos nincs a szobában.' };
      if (room.bonusAnswers[nick] !== undefined) return { error: 'Ezt a tippelős kérdést már megválaszoltad.' };
      room.bonusAnswers[nick] = { answer: guess, at: now() };
      if (room.players.every((p) => room.bonusAnswers[p.nick] !== undefined)) this.resolveBonus(room); else this.emit(room);
      return { room };
    }
    if (room.phase === 'battle') {
      const b = room.battle;
      if (!b || ![b.attacker, b.defender].includes(nick)) return { error: 'Ez nem a te csatád.' };
      if (b.answers[nick] !== undefined) return { error: 'Ezt a kérdést már megválaszoltad.' };
      if (b.stage === 'choice') {
        const a = Number(answerValue);
        if (!Number.isInteger(a) || a < 0 || a >= q.options.length) return { error: 'Hibás válasz.' };
        b.answers[nick] = { answer: a, at: now() };
        if (b.answers[b.attacker] && b.answers[b.defender]) this.resolveBattleChoice(room); else this.emit(room);
      } else {
        const guess = Number(answerValue);
        if (!Number.isFinite(guess)) return { error: 'A tippnek számnak kell lennie.' };
        b.answers[nick] = { answer: guess, at: now() };
        if (b.answers[b.attacker] && b.answers[b.defender]) this.resolveBattleGuess(room); else this.emit(room);
      }
      return { room };
    }
    return { error: 'Most nem lehet válaszolni.' };
  }

  resolveExpansionRound(room) {
    if (!room || room.phase !== 'expand') return;
    clearTimeout(room.timer);
    const captured = [];
    for (const p of room.players) {
      const target = room.selections.get(p.nick), answer = room.answers[p.nick];
      if (target !== undefined && answer && answer.answer === room.question.answer && !room.territories[target].owner) {
        room.territories[target].owner = p.nick; captured.push(`${p.nick}: ${room.map[target].name}`);
      }
    }
    room.message = captured.length ? `Helyes válaszok, foglalás: ${captured.join(', ')}.` : 'Ebben a körben senki nem foglalt területet.';
    if (room.expansionRound >= EXPANSION_ROUNDS) return this.beginBonus(room);
    room.expansionRound++; this.prepareExpansionRound(room);
  }

  beginBonus(room) {
    room.phase = 'bonus'; room.selections = new Map(); room.answers = {}; room.bonusTarget = null; room.bonusAnswers = {};
    room.message = 'A maradék területekért tippelős kérdések jönnek.'; this.prepareBonus(room);
  }

  prepareBonus(room) {
    const target = room.territories.find((t) => !t.owner);
    if (!target) return this.beginAttacks(room);
    room.bonusTarget = target.id; room.bonusAnswers = {}; room.question = this.nextNumericQuestion();
    if (!room.question) return this.finish(room, 'Elfogyott a tippelős kérdésbank.');
    room.endAt = now() + BONUS_MS;
    room.message = `Tippelős kérdés: a legközelebbi válaszadóé lesz ${room.map[target.id].name}.`;
    this.arm(room, BONUS_MS, () => this.resolveBonus(room)); this.emit(room);
  }

  resolveBonus(room) {
    if (!room || room.phase !== 'bonus') return;
    clearTimeout(room.timer);
    const entries = room.players.map((p) => ({ nick: p.nick, value: room.bonusAnswers[p.nick]?.answer, at: room.bonusAnswers[p.nick]?.at })).filter((x) => Number.isFinite(x.value));
    entries.sort((a, b) => Math.abs(a.value - room.question.answer) - Math.abs(b.value - room.question.answer) || a.at - b.at);
    const winner = entries[0];
    if (winner && room.bonusTarget !== null) {
      room.territories[room.bonusTarget].owner = winner.nick;
      room.message = `${winner.nick} tippelt a legközelebb, övé lett: ${room.map[room.bonusTarget].name}.`;
    } else room.message = 'Erre a területre senki nem adott érvényes tippet, szürke maradt.';
    room.bonusTarget = null; this.prepareBonus(room);
  }

  beginAttacks(room) {
    clearTimeout(room.timer); room.phase = 'attack'; room.attackTurns = 0; room.activeIndex = 0; room.selectedTarget = null; room.question = null; room.battle = null; room.bonusTarget = null;
    room.message = 'A terjeszkedés véget ért. Válassz támadási célpontot!'; this.prepareAttack(room);
  }

  prepareAttack(room) {
    const maxTurns = room.players.length * ATTACKS_PER_PLAYER;
    if (room.attackTurns >= maxTurns || !room.players.some((p) => canAttack(room, p))) return this.finish(room);
    let checked = 0;
    while (checked < room.players.length && !canAttack(room, room.players[room.activeIndex])) {
      room.attackTurns++; room.activeIndex = (room.activeIndex + 1) % room.players.length; checked++;
      if (room.attackTurns >= maxTurns) return this.finish(room);
    }
    if (!canAttack(room, room.players[room.activeIndex])) return this.finish(room);
    room.selectedTarget = null; room.endAt = now() + ATTACK_MS; room.message = `${room.players[room.activeIndex].nick} támadást indíthat.`;
    this.arm(room, ATTACK_MS, () => this.skipAttack(room)); this.emit(room);
  }

  beginBattle(room) {
    const attacker = room.players[room.activeIndex]?.nick, defender = room.territories[room.selectedTarget]?.owner;
    if (!attacker || !defender) return this.skipAttack(room);
    clearTimeout(room.timer); room.phase = 'battle'; room.battle = { attacker, defender, target: room.selectedTarget, stage: 'choice', answers: {} };
    room.question = this.nextQuestion();
    if (!room.question) return this.finishBattle(room, false, 'Elfogyott a feleletválasztós kérdésbank, a védő megtartotta a területet.');
    room.endAt = now() + ATTACK_MS; room.message = `${attacker} támadja ${defender} területét: ABCD-kérdés.`;
    this.arm(room, ATTACK_MS, () => this.resolveBattleChoice(room)); this.emit(room);
  }

  finishBattle(room, attackerWon, message) {
    const b = room.battle;
    if (attackerWon) room.territories[b.target].owner = b.attacker;
    room.message = message || (attackerWon ? `${b.attacker} elfoglalta a területet!` : `${b.defender} megtartotta a területet.`);
    room.attackTurns++; room.activeIndex = (room.activeIndex + 1) % room.players.length; room.phase = 'attack'; room.battle = null; room.question = null; room.selectedTarget = null; this.prepareAttack(room);
  }

  resolveBattleChoice(room) {
    if (!room || room.phase !== 'battle' || room.battle.stage !== 'choice') return;
    clearTimeout(room.timer);
    const b = room.battle, q = room.question, aa = b.answers[b.attacker], da = b.answers[b.defender];
    const attackerCorrect = !!aa && aa.answer === q.answer, defenderCorrect = !!da && da.answer === q.answer;
    if (attackerCorrect && defenderCorrect) {
      b.stage = 'guess'; b.answers = {}; room.question = this.nextNumericQuestion();
      if (!room.question) return this.finishBattle(room, false, 'Elfogyott a tippelős kérdésbank, a védő megtartotta a területet.');
      room.endAt = now() + ATTACK_MS;
      room.message = 'Mindketten eltalálták. Jön a számtipp: aki közelebb tippel, nyer.'; this.arm(room, ATTACK_MS, () => this.resolveBattleGuess(room)); this.emit(room); return;
    }
    this.finishBattle(room, attackerCorrect && !defenderCorrect);
  }

  resolveBattleGuess(room) {
    if (!room || room.phase !== 'battle' || room.battle.stage !== 'guess') return;
    clearTimeout(room.timer);
    const b = room.battle, answer = room.question.answer, aa = b.answers[b.attacker], da = b.answers[b.defender];
    const attackerWon = aa && !da ? true : !aa && da ? false : !!aa && !!da && Math.abs(aa.answer - answer) < Math.abs(da.answer - answer);
    this.finishBattle(room, attackerWon);
  }

  skipAttack(room) {
    if (!room || room.phase !== 'attack') return;
    clearTimeout(room.timer); room.attackTurns++; room.activeIndex = (room.activeIndex + 1) % room.players.length; this.prepareAttack(room);
  }

  finish(room, message) {
    clearTimeout(room.timer); room.phase = 'finished'; room.endAt = 0; room.question = null; room.battle = null;
    const counts = room.players.map((p) => ({ nick: p.nick, count: playerTerritories(room, p.nick).length })).sort((a, b) => b.count - a.count);
    room.winner = counts[0]?.nick || ''; room.message = message || (room.winner ? `${room.winner} nyerte a játékot ${counts[0].count} területtel!` : 'A játék véget ért.'); this.emit(room);
  }

  arm(room, delay, callback) { clearTimeout(room.timer); room.timer = setTimeout(() => callback(), delay + 30); }

  public(room) {
    if (!room) return null;
    const answered = room.phase === 'expand' ? Object.keys(room.answers) : room.phase === 'bonus' ? Object.keys(room.bonusAnswers) : [];
    return {
      code: room.code, host: room.host, phase: room.phase, phaseEnd: room.endAt, now: now(), message: room.message,
      expansionRound: room.expansionRound, active: room.players[room.activeIndex]?.nick || '', winner: room.winner,
      mapCols: room.mapCols, mapRows: room.mapRows, answered, selectedTarget: room.selectedTarget,
      selections: Object.fromEntries(room.selections), bonusTarget: room.bonusTarget,
      players: room.players.map((p) => ({ nick: p.nick, color: p.color, base: p.base, connected: p.connected, territories: playerTerritories(room, p.nick).length, selected: room.selections.get(p.nick) ?? null, answered: answered.includes(p.nick) })),
      map: room.map.map((t) => ({ id: t.id, name: t.name, row: t.row, col: t.col, neighbors: t.neighbors, owner: room.territories[t.id].owner })),
      question: publicQuestion(room.question),
      battle: room.battle && { attacker: room.battle.attacker, defender: room.battle.defender, target: room.battle.target, stage: room.battle.stage, answered: Object.keys(room.battle.answers) },
    };
  }
}

module.exports = { Manager, cleanCode };
