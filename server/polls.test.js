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
