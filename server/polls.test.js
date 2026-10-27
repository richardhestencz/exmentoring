const test = require('node:test');
const assert = require('node:assert');
const polls = require('./polls');

test('szavazás létrehozása és összesítése', () => {
  const all = [];
  const created = polls.create(all, { creator: 'Ricsi', title: 'Hova menjünk?', options: ['Balaton', 'Bécs'], multiple: false });
  assert.ok(created.poll.id);
  assert.strictEqual(all.length, 1);
  assert.strictEqual(polls.vote(created.poll, 'Matyi', [1]), null);
  assert.deepStrictEqual(polls.view(created.poll, 'Matyi').counts, [0, 1]);
  assert.deepStrictEqual(polls.view(created.poll).votersByOption, [[], ['Matyi']]);
  assert.deepStrictEqual(polls.view(created.poll, 'Matyi').choices, [1]);
});

test('multiple choice: több választás egy felhasználótól, egy szavazónak számít', () => {
  const all = [];
  const { poll } = polls.create(all, { creator: 'Ricsi', title: 'Mit kérsz?', options: ['Sajt', 'Hagyma', 'Csípős'], multiple: true });
  assert.strictEqual(polls.vote(poll, 'Matyi', [0, 2]), null);
  assert.strictEqual(polls.vote(poll, 'Dani', [2]), null);
  assert.deepStrictEqual(polls.view(poll).counts, [1, 0, 2]);
  assert.deepStrictEqual(polls.view(poll).votersByOption, [['Matyi'], [], ['Matyi', 'Dani']]);
  assert.strictEqual(polls.view(poll).voters, 2);
});

test('egyválasztós szavazásnál a válasz lecserélhető', () => {
  const { poll } = polls.create([], { creator: 'Ricsi', title: 'Kávé?', options: ['Igen', 'Nem'] });
  assert.strictEqual(polls.vote(poll, 'Ricsi', [0]), null);
  assert.strictEqual(polls.vote(poll, 'Ricsi', [1]), null);
  assert.deepStrictEqual(polls.view(poll).counts, [0, 1]);
  assert.deepStrictEqual(polls.view(poll, 'Ricsi').choices, [1]);
});

test('a létrehozó a főoldalon szerkesztheti a címet és az opciókat', () => {
  const { poll } = polls.create([], { creator: 'Ricsi', title: 'Régi cím', options: ['A', 'B'] });
  assert.strictEqual(polls.vote(poll, 'Matyi', [1]), null);
  assert.strictEqual(polls.edit(poll, 'Ricsi', { title: 'Új cím', options: ['A', 'B', 'C'] }), null);
  assert.strictEqual(poll.title, 'Új cím');
  assert.deepStrictEqual(polls.view(poll, 'Matyi').choices, [1]);
  assert.match(polls.edit(poll, 'Dani', { title: 'Más', options: ['X', 'Y'] }), /létrehozó/);
});

test('hibás szavazás és túl rövid cím visszautasítása', () => {
  assert.match(polls.create([], { title: 'x', options: ['A', 'B'] }).error, /legalább 2/);
  const { poll } = polls.create([], { title: 'Rendben', options: ['A', 'B'] });
  assert.match(polls.vote(poll, 'M', [0]), /becenevet/);
  assert.match(polls.vote(poll, 'Matyi', []), /legalább egy/);
});

test('lejárat: lejárt szavazásra nem lehet szavazni; a régi, lejárat nélküli egy hét után jár le', () => {
  const list = [];
  const { poll } = polls.create(list, { creator: 'Anna', title: 'Pizza?', options: ['Igen', 'Nem'], closesAt: 2000, now: 1000 });
  assert.strictEqual(polls.vote(poll, 'Béla', 0, 1500), null);
  assert.match(polls.vote(poll, 'Béla', 1, 2500), /lezárult/);
  assert.strictEqual(polls.create(list, { title: 'Rossz', options: ['a', 'b'], closesAt: 500, now: 1000 }).error, 'Érvénytelen lejárat.');
  const [old] = polls.normalize([{ id: 'x1', title: 'Régi', options: ['a', 'b'], createdAt: 0 }]);
  assert.strictEqual(polls.isOpen(old, 6 * 86400e3), true);
  assert.strictEqual(polls.isOpen(old, 8 * 86400e3), false);
});

test('sárga szám: csak az érvényes, látható és még meg nem válaszolt szavazások számítanak', () => {
  const list = [], now = 10000;
  polls.create(list, { creator: 'Anna', title: 'Nyitott', options: ['a', 'b'], closesAt: now + 5000, now });
  polls.create(list, { creator: 'Anna', title: 'Lejárt', options: ['a', 'b'], closesAt: now + 100, now });
  polls.create(list, { creator: 'Exmentoring', title: 'Benti', options: ['a', 'b'], closesAt: now + 5000, audience: 'bent', now });
  assert.strictEqual(polls.pending(list, 'Béla', { now: now + 1000, bent: false }), 1);
  assert.strictEqual(polls.pending(list, 'Béla', { now: now + 1000, bent: true }), 2);
  polls.vote(list.find((p) => p.title === 'Nyitott'), 'Béla', 0, now + 1000);
  assert.strictEqual(polls.pending(list, 'Béla', { now: now + 1000, bent: true }), 1);
  assert.strictEqual(polls.pending(list, '', { now }), 0);
  assert.deepStrictEqual(polls.list(list, 'Béla', { bent: false, now }).map((p) => p.title), ['Lejárt', 'Nyitott'], 'a benti szavazás HO-ból nem látszik');
});

test('ebédszavazás: 10:00 előtt és 12:30 után nem jön létre, naponta egyszer, csak bentieknek, nem szerkeszthető', () => {
  const list = [], day = '2026-10-28', close = 99999;
  assert.deepStrictEqual(polls.ensureLunch(list, day, 9 * 60 + 59, close, 1), []);
  assert.deepStrictEqual(polls.ensureLunch(list, day, 12 * 60 + 30, close, 1), []);
  const made = polls.ensureLunch(list, day, 10 * 60, close, 1);
  assert.deepStrictEqual(list.map((p) => p.title), ['🍱 Hoztál ma ebédet?', '🕛 Mikor megyünk ebédelni?']);
  assert.strictEqual(made.length, 2);
  assert.deepStrictEqual(polls.ensureLunch(list, day, 11 * 60, close, 2), [], 'kétszer nem');
  assert.ok(list.every((p) => p.audience === 'bent' && p.closesAt === close));
  assert.match(polls.edit(list[0], 'Exmentoring', { title: 'X', options: ['a', 'b'] }), /automatikus/);
  assert.strictEqual(polls.lunch(list, day, 50).length, 2);
  assert.strictEqual(polls.lunch(list, day, close + 1), null, '12:30 után eltűnik');
  assert.strictEqual(polls.lunch(list, '2026-10-29', 50), null);
  assert.strictEqual(polls.normalize(list).length, 2, 'mentés után is megmarad');
  assert.strictEqual(polls.normalize(list)[0].audience, 'bent');
});
