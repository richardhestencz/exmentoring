const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const g = require('./game');
const rh = require('./roulette-history');
const banter = require('./roulette-banter');
const challenge = require('./roulette-challenge');

test('rulett feed: a rossz szóvicc csak időnként jelenik meg', () => {
  assert.strictEqual(banter.occasionalBadPun(() => 0, 0.2), banter.BAD_PUNS[0]);
  assert.strictEqual(banter.occasionalBadPun(() => 0.2, 0.2), '');
});

test('napi rulett-kihívás: naponta másik kihívás és nehézített teljesítés', () => {
  const first = challenge.challengeFor('2026-10-27');
  const second = challenge.challengeFor('2026-10-28');
  assert.notStrictEqual(first.id, second.id);
  const history = [
    { round: 3, at: Date.parse('2026-10-27T09:00:00+02:00'), bets: [{ nick: 'Ricsi', kind: 'red', stake: 5000, won: true }] },
    { round: 2, at: Date.parse('2026-10-27T08:00:00+02:00'), bets: [{ nick: 'Ricsi', kind: 'in:17', stake: 5000, won: true }] },
    { round: 1, at: Date.parse('2026-10-27T07:00:00+02:00'), bets: [{ nick: 'Ricsi', kind: 'black', stake: 5000, won: true }] },
  ];
  const result = challenge.progress(history, 'Ricsi', '2026-10-27');
  assert.strictEqual(result.totalStake, 15000);
  assert.strictEqual(result.winningSpins, 3);
  assert.strictEqual(result.insideWin, true);
  assert.strictEqual(typeof result.complete, 'boolean');
});

test('rulett tét-napló: minden tét külön rekord és külön eredmény', () => {
  const bets = rh.settleBets([
    { nick: 'Ricsi', kind: 'in:17', stake: 100 },
    { nick: 'Ricsi', kind: 'red', stake: 500 },
  ], 17, (kind, number, stake) => kind === 'in:17' && number === 17 ? stake * 36 : 0);
  assert.strictEqual(bets.length, 2, 'két helyre tett tét két naplóbejegyzés');
  assert.strictEqual(bets[0].won, true);
  assert.strictEqual(bets[1].won, false);
  const stats = rh.normalizeStats({});
  rh.updateStats(stats, [...bets, { nick: 'ajtó', kind: 'red', stake: 500, payout: 0, net: -500, won: false }], 'ajtó');
  assert.deepStrictEqual(stats.Ricsi, { net: 3000, rounds: 1, bets: 2, wins: 1 });
  assert.deepStrictEqual(stats.ajtó, { net: -500, rounds: 1, bets: 0, wins: 0 });
  assert.strictEqual(rh.winRate(stats.Ricsi), 50);
});

test('rulett tét-napló: azonos hely zsetonjai egy tétként jelennek meg', () => {
  const bets = rh.settleBets([
    { nick: 'Ricsi', kind: 'red', stake: 5000 },
    { nick: 'Ricsi', kind: 'red', stake: 5000 },
    { nick: 'Ricsi', kind: 'red', stake: 5000 },
    { nick: 'Ricsi', kind: 'red', stake: 5000 },
  ], 12, (kind, number, stake) => kind === 'red' && number === 12 ? stake * 2 : 0);
  assert.strictEqual(bets.length, 1);
  assert.deepStrictEqual(bets[0], { nick: 'Ricsi', kind: 'red', stake: 20000, payout: 40000, net: 20000, won: true });
});

test('rulett history migráció: a régi azonos helyű tétek összevonódnak', () => {
  const history = rh.migrateHistory([{
    id: '20261027002',
    spinner: 'Ricsi',
    bets: [1, 2, 3, 4].map(() => ({ nick: 'Ricsi', kind: 'red', stake: 5000, payout: 10000, net: 5000, won: true })),
  }]);
  assert.strictEqual(history[0].spinner, 'Ricsi');
  assert.strictEqual(history[0].bets.length, 1);
  assert.strictEqual(history[0].bets[0].stake, 20000);
  assert.strictEqual(history[0].bets[0].payout, 40000);
  const stats = rh.normalizeStats({ Ricsi: { net: 20000, rounds: 1, bets: 4, wins: 4 } });
  rh.recountBetStats(stats, history);
  assert.deepStrictEqual(stats.Ricsi, { net: 20000, rounds: 1, bets: 1, wins: 1 });
});

test('rulett pörgetésazonosító: dátum és napi sorszám', () => {
  const state = { rouletteHistory: [] };
  const first = Date.parse('2026-10-27T10:00:00+02:00');
  assert.strictEqual(rh.nextSpinId(state, first), '20261027001');
  assert.strictEqual(rh.nextSpinId(state, first + 1000), '20261027002');
  assert.strictEqual(rh.nextSpinId(state, Date.parse('2026-10-28T12:01:00+01:00')), '20261028001');
});

test('kifizetések', () => {
  assert.strictEqual(g.payout('in:17', 17, 100), 3600);
  assert.strictEqual(g.payout('in:17', 18, 100), 0);
  assert.strictEqual(g.payout('n:17', 17, 100), 3600, 'régi mentés formátuma');
  assert.strictEqual(g.payout('in:16-17', 17, 100), 1800);
  assert.strictEqual(g.payout('in:16-17-18', 16, 500), 6000);
  assert.strictEqual(g.payout('in:14-15-17-18', 18, 100), 900);
  assert.strictEqual(g.payout('in:0-1-2-3', 0, 100), 900);
  assert.strictEqual(g.payout('in:1-2-3-4-5-6', 6, 1000), 6000);
  assert.strictEqual(g.payout('red', 1, 1000), 2000);
  assert.strictEqual(g.payout('black', 2, 500), 1000);
  assert.strictEqual(g.payout('dozen:2', 13, 500), 1500);
  assert.strictEqual(g.payout('col:3', 3, 500), 1500);
});
test('0-nál a külső tétek vesztenek', () => {
  for (const k of [...g.OUTSIDE, ...g.LINES]) assert.strictEqual(g.payout(k, 0, 100), 0, k);
  assert.strictEqual(g.payout('in:0', 0, 100), 3600);
});
test('csak valódi asztali kombinációk érvényesek', () => {
  assert.strictEqual(g.INSIDE.size, 37 + 60 + 12 + 2 + 22 + 1 + 11);
  for (const k of ['in:37', 'in:1-3', 'in:3-4', 'in:1-5', 'in:2-3-4', 'in:3-4-6-7', 'in:0-4', 'in:17-17', 'foo', 'n:37'])
    assert.strictEqual(g.info(k), null, k);
});
test('ajtó-tét mindig 1000', () => {
  for (let i = 0; i < 300; i++) {
    const bets = g.doorBet();
    assert.strictEqual(bets.reduce((s, b) => s + b.stake, 0), 1000);
    for (const b of bets) assert.ok(g.info(b.kind) && g.CHIPS.includes(b.stake), b.kind);
  }
});
test('visszatérülés ~ 97,3% minden tétfajtánál', () => {
  for (const k of [...g.INSIDE, ...g.OUTSIDE, ...g.LINES]) {
    let back = 0;
    for (let n = 0; n <= 36; n++) back += g.payout(k, n, 100);
    assert.ok(Math.abs(back / (37 * 100) - 36 / 37) < 1e-9, k);
  }
});
test('a tétasztal: mező = szám, rés = 2 szám, kereszteződés = sarok, minden pont érvényes', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const src = html.slice(html.indexOf('const inKind='), html.indexOf('function geom'));
  const zoneKind = new Function(src + 'return zoneKind;')();
  // egy 50×36 képpontos mezőkből, 3 képpontos résekkel felépített asztal (a 0 mező 0..55 között)
  const W = 50, H = 36, GAP = 3, X0 = 58, Y0 = 0;
  const left = (c) => X0 + c * (W + GAP), top = (r) => Y0 + r * (H + GAP);
  const G = { bx: [], by: [0], top: Y0, right: left(11) + W, tol: 6 };
  G.bx.push(X0 - GAP / 2); for (let c = 1; c < 12; c++) G.bx.push(left(c) - GAP / 2);
  for (let r = 1; r <= 3; r++) G.by.push(top(r) - GAP / 2);
  const at = (x, y) => zoneKind(x, y, G);
  assert.strictEqual(at(left(5) + 25, top(1) + 18), 'in:17', 'mező közepe');
  assert.strictEqual(at(left(5) + 40, top(1) + 18), 'in:17', 'mező széle is még a szám');
  assert.strictEqual(at(G.bx[6], top(1) + 18), 'in:17-20', 'rés két oszlop között');
  assert.strictEqual(at(left(5) + 25, G.by[1]), 'in:17-18', 'rés két sor között');
  assert.strictEqual(at(G.bx[6], G.by[1]), 'in:17-18-20-21', 'négy mező találkozása');
  assert.strictEqual(at(left(0) + 25, G.by[3]), 'in:1-2-3', 'alsó vonal: sor');
  assert.strictEqual(at(G.bx[1], G.by[3]), 'in:1-2-3-4-5-6', 'alsó kereszteződés: hatos sor');
  assert.strictEqual(at(G.bx[0], top(2) + 18), 'in:0-1', 'rés a 0 mellett');
  assert.strictEqual(at(G.bx[0], G.by[2]), 'in:0-1-2', 'trió');
  assert.strictEqual(at(G.bx[0], G.by[3]), 'in:0-1-2-3', 'első négy');
  assert.strictEqual(at(20, 50), 'in:0', 'a 0 mező');
  const seen = new Set();
  for (let x = 0; x <= G.right + 10; x += 1)
    for (let y = 0; y <= G.by[3] + 10; y += 1) {
      const k = at(x, y);
      if (k === null) continue;
      assert.ok(g.INSIDE.has(k), `${x},${y} -> ${k}`);
      seen.add(k);
    }
  assert.strictEqual(seen.size, g.INSIDE.size, 'minden belső tét elérhető kattintással');
});
test('gyros: rögzítés, foglalt cella, visszavonás csak a sajáttal, bővülés', () => {
  const gy = require('./gyros');
  const G = gy.fromSeed({ contributors: [{ name: 'Teszt Anna', alias: '🐬' }, { name: 'Teszt Béla', alias: '🎾' }], receipts: { '008': null, '016': '🎾' }, maxNumber: 209 });
  assert.deepStrictEqual(gy.counts(G), { by: { '🎾': 1 }, none: 1, total: 2, of: 209 });
  assert.strictEqual(gy.claim(G, '091', '🐬', 1), null);
  assert.deepStrictEqual(G.receipts['091'], { alias: '🐬', at: 1 });
  assert.match(gy.claim(G, '091', '🎾'), /már megvan/, 'foglalt cellát nem lehet felülírni');
  assert.match(gy.claim(G, '092', '🦄'), /aliasodat/, 'csak létező alias rögzíthet');
  assert.match(gy.claim(G, '000', '🐬'), /között/, 'a 000 nem létezik');
  assert.match(gy.claim(G, 220, '🐬'), /között/, 'max+10 fölött nem');
  assert.match(gy.unclaim(G, '091', '🎾'), /saját/, 'más nyugtáját nem lehet visszavonni');
  assert.match(gy.unclaim(G, '008', '🐬'), /saját/, 'alias nélküli pipát sem');
  assert.strictEqual(gy.unclaim(G, '091', '🐬'), null);
  assert.strictEqual(G.receipts['091'], undefined);
  assert.strictEqual(gy.claim(G, 213, '🐬'), null, '209 fölött is rögzíthető');
  assert.strictEqual(G.maxNumber, 219, 'a rács egy sorral bővül');
  assert.strictEqual(gy.counts(G).of, 219);
});
test('gyros: új hozzájáruló, egyedi és legfeljebb 2 karakteres alias', () => {
  const gy = require('./gyros');
  const G = gy.empty();
  assert.strictEqual(gy.addContributor(G, '  Teszt   Elek ', '🌮'), null);
  assert.deepStrictEqual(G.contributors[0], { name: 'Teszt Elek', alias: '🌮' });
  assert.match(gy.addContributor(G, 'Más Valaki', '🌮'), /foglalt/);
  assert.match(gy.addContributor(G, 'Más Valaki', 'ABC'), /2 karakter/);
  assert.strictEqual(gy.addContributor(G, 'Zászlós Zoli', '🇭🇺'), null, 'egy zászló egy karakternek számít');
  assert.strictEqual(gy.addContributor(G, 'Két Jel', 'KJ'), null);
  assert.match(gy.addContributor(G, 'X', '🍕'), /legalább 2/);
  assert.match(gy.addContributor(G, 'Üres Alias', '  '), /aliast/);
});
test('gyros: a teljes nevek nincsenek a repóban', () => {
  const { execSync } = require('child_process');
  const tracked = execSync('git ls-files', { cwd: path.join(__dirname, '..') }).toString();
  assert.ok(!/gyros-seed/.test(tracked), 'a seed fájl nincs verziókezelve');
});
test('ki van bent: QR-kód, becenév a telefonhoz kötve, napi lejárat', () => {
  const pr = require('./presence');
  const P = pr.empty(), DAY = 24 * 3600 * 1000;
  const phoneA = pr.newDevice(), phoneB = pr.newDevice();
  assert.strictEqual(pr.nickOf(P, phoneA), null, 'új telefon: becenevet kell választani');
  assert.strictEqual(pr.claim(P, 'Ricsi', phoneA, 1000), null);
  assert.ok(!JSON.stringify(P).includes(phoneA), 'a telefon azonosítóját nem tároljuk, csak a lenyomatát');
  assert.strictEqual(pr.nickOf(P, phoneA), 'Ricsi', 'utána a telefon magától Ricsi');
  assert.match(pr.claim(P, 'Ricsi', phoneB, 2000), /másik telefon/, 'más telefon nem veheti el');
  assert.strictEqual(pr.claim(P, 'Ricsi', phoneA, 3000), null, 'a saját telefon újra választhatja');
  assert.strictEqual(pr.checkin(P, 'Ricsi', 100, '2026-10-21'), true, 'első érkezés');
  assert.strictEqual(pr.checkin(P, 'Ricsi', 200, '2026-10-21'), false, 'második beolvasás nem új érkezés');
  assert.deepStrictEqual(pr.view(P, '2026-10-21', 300).here, [{ nick: 'Ricsi', since: 100 }]);
  assert.strictEqual(pr.checkout(P, 'Ricsi'), true);
  pr.checkin(P, 'Ricsi', 400, '2026-10-21');
  assert.deepStrictEqual(pr.view(P, '2026-10-22', 500).here, [], 'másnapra lejár');
  assert.strictEqual(pr.claim(P, 'Ricsi', phoneB, 400 + 31 * DAY), null, '30 nap használat nélkül felszabadul');
  assert.strictEqual(pr.nickOf(P, phoneA), null);
  assert.strictEqual(pr.claim(P, 'Matyi', phoneB, 400 + 32 * DAY), null, 'telefonváltás becenevet: a régi felszabadul');
  assert.deepStrictEqual(pr.view(P, '2026-11-30', 400 + 32 * DAY).people, ['Matyi']);
  assert.strictEqual(pr.release(P, 'Matyi'), null, 'a gazda felszabadíthatja');
  assert.strictEqual(pr.nickOf(P, phoneB), null);
  assert.ok(pr.claim(P, 'X', phoneA), 'túl rövid becenév');
  assert.ok(pr.claim(P, 'Valaki', 'nem-hex'), 'hibás eszközazonosító');
});
test('kólakódok: feltöltés, duplikátum, felhasználva, visszavonás 10 percig', () => {
  const co = require('./cola');
  const C = co.empty();
  const r = co.add(C, ' ab12 cd34 ', 'Ricsi', 1000);
  assert.strictEqual(r.item.code, 'AB12CD34', 'szóköz nélkül, nagybetűvel');
  assert.match(co.add(C, 'ab12cd34').error, /már fent/, 'ugyanaz kétszer nem');
  assert.ok(co.add(C, 'x!').error, 'hibás formátum');
  assert.ok(co.add(C, '<script>').error, 'nem lehet benne HTML');
  assert.strictEqual(co.markUsed(C, r.item.id, 'Matyi', 2000), null);
  assert.match(co.markUsed(C, r.item.id, 'Dani', 3000), /már valaki/, 'kétszer nem lehet felhasználni');
  assert.strictEqual(co.unmark(C, r.item.id, 2000 + co.UNDO_MS - 1), null, '10 percen belül visszavonható');
  assert.strictEqual(C.codes[0].usedAt, 0);
  co.markUsed(C, r.item.id, 'Matyi', 5000);
  assert.match(co.unmark(C, r.item.id, 5000 + co.UNDO_MS + 1), /10 percig/, 'utána már nem');
  co.prune(C, 5000 + 31 * 24 * 3600 * 1000);
  assert.strictEqual(C.codes.length, 0, 'a régi felhasznált kódok eltűnnek');
});
test('tét-profilok: mentés, felülírás, korlátok, törlés', () => {
  const pf = require('./profiles');
  const P = pf.empty();
  const bets = [{ kind: 'red', stake: 1000 }, { kind: 'in:17', stake: 100 }, { kind: 'n:17', stake: 100 }];
  assert.strictEqual(pf.saveProfile(P, 'Ricsi', 'Szokásos', bets), null);
  assert.deepStrictEqual(pf.getProfile(P, 'Ricsi', 'Szokásos').bets[2], { kind: 'in:17', stake: 100 }, 'régi alak is jó');
  assert.strictEqual(pf.total(pf.getProfile(P, 'Ricsi', 'Szokásos').bets), 1200);
  assert.strictEqual(pf.saveProfile(P, 'Ricsi', 'Szokásos', [{ kind: 'black', stake: 500 }]), null, 'azonos névvel felülír');
  assert.strictEqual(P.Ricsi.length, 1);
  assert.strictEqual(pf.getProfile(P, 'Matyi', 'Szokásos'), null, 'a profil a becenévhez tartozik');
  assert.match(pf.saveProfile(P, 'Ricsi', 'Üres', []), /téteket/);
  assert.match(pf.saveProfile(P, 'Ricsi', 'Rossz', [{ kind: 'in:1-3', stake: 100 }]), /téteket/, 'érvénytelen tét nem menthető');
  assert.match(pf.saveProfile(P, 'Ricsi', 'Rossz', [{ kind: 'red', stake: 123 }]), /téteket/, 'nem létező zseton');
  assert.match(pf.saveProfile(P, 'Ricsi', 'Sok', Array(5).fill({ kind: 'red', stake: 5000 })), /20 000/);
  assert.match(pf.saveProfile(P, 'Ricsi', '', bets), /nevet/);
  for (let k = 2; k <= 6; k++) assert.strictEqual(pf.saveProfile(P, 'Ricsi', 'P' + k, bets), null);
  assert.match(pf.saveProfile(P, 'Ricsi', 'P7', bets), /Legfeljebb 6/);
  assert.strictEqual(pf.deleteProfile(P, 'Ricsi', 'P2'), null);
  assert.ok(pf.deleteProfile(P, 'Ricsi', 'P2'));
});
test('tisztás: HO vagy helyben, leülés a megengedett szabad helyre, felállás, napi lejárat', () => {
  const A = require('./public/avatar.js'), st = require('./seats');
  const S = st.empty(), day = '2026-10-24';
  assert.match(st.sit(S, 'Ricsi', 3, day), /home office/, 'előbb meg kell mondani, hol van');
  assert.match(st.where(S, 'Ricsi', 'iroda', day), /Válaszd ki/);
  assert.strictEqual(st.where(S, 'Ricsi', 'bent', day), null);
  assert.strictEqual(st.where(S, 'Gabó', 'ho', day), null);
  assert.match(st.sit(S, 'Gabó', 3, day), /tó mellett/, 'HO-ból csak horgász vagy kenu');
  assert.match(st.sit(S, 'Ricsi', A.HO[0], day), /home office-osoké/, 'helyben nem ülhet a HO-helyre');
  assert.strictEqual(st.sit(S, 'Gabó', A.HO[4], day), null, 'HO: kenu');
  assert.strictEqual(st.sit(S, 'Ricsi', 3, day), null);
  assert.strictEqual(st.where(S, 'Matyi', 'bent', day), null);
  assert.match(st.sit(S, 'Matyi', 3, day), /Ricsi/, 'egy helyen csak egy ember ül');
  assert.ok(st.sit(S, 'Matyi', A.MAX, day), 'nem létező hely');
  assert.deepStrictEqual(st.view(S, day).Ricsi, { mode: 'bent', spot: 3, since: st.view(S, day).Ricsi.since });
  const t0 = st.view(S, day).Ricsi.since;
  assert.strictEqual(st.stand(S, 'Ricsi', day), null);
  assert.strictEqual(st.view(S, day).Ricsi.spot, null, 'felállás után nincs helye');
  assert.ok(st.stand(S, 'Ricsi', day), 'kétszer nem állhat fel');
  assert.strictEqual(st.sit(S, 'Matyi', 3, day), null, 'a felszabadult hely foglalható');
  assert.strictEqual(st.where(S, 'Gabó', 'bent', day), null);
  assert.strictEqual(st.view(S, day).Gabó.spot, null, 'módváltáskor a hely felszabadul');
  assert.strictEqual(st.sit(S, 'Ricsi', 5, day), null);
  assert.strictEqual(st.view(S, day).Ricsi.since, t0, 'átüléskor nem lesz új időpont');
  assert.strictEqual(st.where(S, 'Ricsi', 'ho', day, t0 + 5000), null);
  assert.strictEqual(st.view(S, day).Ricsi.since, t0, 'módváltáskor sem');
  assert.strictEqual(st.leave(S, 'Ricsi', day), null);
  assert.strictEqual(st.view(S, day).Ricsi, undefined, 'kilépés után nincs a listában');
  assert.ok(st.leave(S, 'Ricsi', day), 'kétszer nem léphet ki');
  assert.strictEqual(st.where(S, 'Ricsi', 'bent', day, t0 + 9000), null);
  assert.strictEqual(st.view(S, day).Ricsi.since, t0 + 9000, 'visszajövetelkor új belépés');
  assert.deepStrictEqual(st.view(S, '2026-10-25'), {}, 'másnap tiszta lap');
  assert.strictEqual(A.HO.length + A.SPOTS.filter((p, i) => A.allowed('bent', i)).length, A.MAX);
  for (const sc of Object.values(A.SCENES)) for (let i = 0; i < A.MAX; i++) {
    const q = A.spotPos(sc, i);
    assert.ok(q.x > 0 && q.x < sc.w && q.y > 0 && q.y < sc.h, 'a hely a képen belül van');
  }
});
test('blackjack: lapértékek, osztás, sorrend, kifizetések', () => {
  const B = require('./blackjack');
  assert.deepStrictEqual(B.value(['A♠', 'K♥']), { total: 21, soft: true });
  assert.strictEqual(B.value(['A♠', 'A♥', '9♦']).total, 21);
  assert.strictEqual(B.value(['K♠', 'Q♥', '5♦']).total, 25);
  assert.ok(B.isBJ(['A♠', 'J♣']) && !B.isBJ(['7♠', '7♣', '7♦']));
  assert.strictEqual(B.newShoe().length, 312, '6 pakli');
  // a pakli végéről húzunk: a sorrend fordított; a 60 lapos tartalék miatt 100 töltelék lap alul
  const G = B.empty(), fill = Array(100).fill('2♣');
  const shoe = (cards) => { G.shoe = [...fill, ...cards.slice().reverse()]; };
  assert.strictEqual(B.bet(G, 'Ricsi', 1000), null);
  assert.strictEqual(B.bet(G, 'Matyi', 500), null);
  assert.ok(B.bet(G, 'Ricsi', 9500), 'kézenként max 10 000');
  // osztás: Ricsi, Matyi, osztó, Ricsi, Matyi, osztó
  shoe(['10♠', '9♠', '10♥', '7♦', 'A♣', '6♣', /* húzások: */ '5♥', '10♦']);
  assert.strictEqual(B.deal(G), null);
  assert.strictEqual(B.view(G).dealer[1], '??', 'az osztó második lapja rejtett');
  assert.ok(B.hit(G, 'Matyi'), 'nem Matyi jön');
  assert.strictEqual(B.stand(G, 'Ricsi'), null);           // Ricsi 17
  assert.strictEqual(B.hit(G, 'Matyi'), null);             // Matyi 9+A+5 = 15
  assert.strictEqual(B.stand(G, 'Matyi'), null);           // osztó 16 -> húz 10-et -> 26, besokall
  assert.strictEqual(G.phase, 'result');
  assert.deepStrictEqual(G.seats.map((x) => [x.result, x.back]), [['win', 2000], ['win', 1000]]);
  // blackjack 3:2, duplázás, push
  B.reset(G); B.bet(G, 'Ricsi', 1000); B.bet(G, 'Matyi', 1000); B.bet(G, 'Dani', 1000);
  shoe(['A♠', '5♠', '10♣', '10♦', 'K♠', '6♥', '6♦', '7♦', /* Matyi duplázik: */ '6♣']);
  assert.strictEqual(B.deal(G), null);                      // Ricsi BJ, Matyi 11, Dani 16, osztó 17
  assert.ok(B.double(G, 'Dani'), 'nem Dani jön');
  assert.strictEqual(B.double(G, 'Matyi'), null);          // Matyi 11+6 = 17, tét 2000
  assert.strictEqual(B.stand(G, 'Dani'), null);            // osztó 17-nél megáll
  assert.deepStrictEqual(G.seats.map((x) => [x.result, x.back]), [['blackjack', 2500], ['push', 2000], ['lose', 0]]);
  // az osztó blackjackje azonnal lezárja a kört
  B.reset(G); B.bet(G, 'Ricsi', 500);
  shoe(['10♠', 'A♦', '9♠', 'K♦']);
  assert.strictEqual(B.deal(G), null);
  assert.strictEqual(G.phase, 'result');
  assert.deepStrictEqual([G.seats[0].result, G.seats[0].back], ['lose', 0]);
  // fogadás visszavonása
  B.reset(G); B.bet(G, 'Ricsi', 500); B.bet(G, 'Ricsi', 100);
  assert.strictEqual(B.unbet(G, 'Ricsi'), 600);
  assert.strictEqual(G.seats.length, 0);
});
test('blackjack: helyválasztás az asztalnál', () => {
  const B = require('./blackjack'), G = B.empty();
  assert.strictEqual(B.bet(G, 'Ricsi', 100, 3), null);
  assert.ok(B.bet(G, 'Matyi', 100, 3), 'foglalt hely');
  assert.ok(B.bet(G, 'Matyi', 100, 6), 'nincs ilyen hely');
  assert.strictEqual(B.bet(G, 'Matyi', 100), null);          // az első szabad hely: 0
  assert.strictEqual(B.bet(G, 'Ricsi', 100, 5), null);       // aki már ül, a helye marad
  assert.deepStrictEqual(B.view(G).seats.map((x) => [x.nick, x.seat, x.stake]), [['Matyi', 0, 100], ['Ricsi', 3, 200]]);
});
test('fizikai szimuláció: megáll, érvényes szám, a pálya véges', () => {
  const { simulate, DEFAULT_REST } = require('./physics');
  let rest = DEFAULT_REST;
  for (let i = 0; i < 40; i++) {
    const s = simulate(rest);
    rest = s.rest;
    assert.ok(s.settled, 'a golyó megállt');
    assert.ok(s.result >= 0 && s.result <= 36);
    assert.ok(s.track.every(Number.isFinite));
    assert.ok(s.track.length / 3 >= 600 && s.durationMs <= 30000);
  }
});
test('fizikai szimuláció: az eredmények nagyjából egyenletesek', () => {
  const { simulate, DEFAULT_REST } = require('./physics');
  const N = 740, hist = Array(37).fill(0);
  let rest = DEFAULT_REST;
  for (let i = 0; i < N; i++) { const s = simulate(rest); rest = s.rest; hist[s.result]++; }
  const exp = N / 37, chi = hist.reduce((a, c) => a + (c - exp) ** 2 / exp, 0);
  assert.ok(chi < 70, `khí-négyzet ${chi.toFixed(1)}`);
});
test('3D tisztás: a mosómedve ott marad, ahol hagyták', () => {
  const Wd = require('./world'), W = Wd.empty();
  assert.ok(Wd.move(W, 'Ricsi', { x: 1, z: 1, ry: 0 }), 'belépés nélkül nem mozoghat');
  assert.strictEqual(Wd.join(W, 'Ricsi'), null);
  assert.strictEqual(Wd.move(W, 'Ricsi', { x: 3, z: -2, ry: 1, act: 'run' }), null);
  assert.strictEqual(Wd.move(W, 'Ricsi', { x: 50, z: 0, ry: 0 }), null);
  assert.ok(W.Ricsi.x <= Wd.R, 'a tisztás szélén megáll');
  assert.ok(Wd.move(W, 'Ricsi', { x: 'a', z: 0, ry: 0 }), 'hibás adat');
  assert.strictEqual(Wd.move(W, 'Ricsi', { x: 0, z: 0, y: 0.7, ry: 0 }), null); assert.strictEqual(W.Ricsi.y, 0.7, 'a tárgy tetején áll');
  Wd.move(W, 'Ricsi', { x: 0, z: 0, y: 99, ry: 0 }); assert.strictEqual(W.Ricsi.y, 3, 'a magasság korlátos');
  assert.strictEqual(Wd.sit(W, 'Ricsi', 4), null);
  Wd.join(W, 'Gabó'); assert.match(Wd.sit(W, 'Gabó', 4), /Ricsi/, 'foglalt hely');
  Wd.leave(W, 'Ricsi');
  assert.strictEqual(W.Ricsi.on, false); assert.strictEqual(W.Ricsi.spot, 4, 'kilépés után is ott ül');
  Wd.join(W, 'Ricsi'); assert.strictEqual(W.Ricsi.spot, 4, 'visszalépve ugyanott folytatja');
  assert.strictEqual(Wd.move(W, 'Ricsi', { x: 0, z: 0, ry: 0 }), null); assert.strictEqual(W.Ricsi.spot, null, 'feláll, ha elindul');
});

test('Chapter esemény: napok bejelölése', () => {
  const Ch = require('./chapter'), C = Ch.empty();
  assert.ok(Ch.setDays(C, '', ['2026-11-10'], '2026-10-27'), 'becenév nélkül nem');
  assert.strictEqual(Ch.setDays(C, 'Ricsi', ['2026-11-12', '2026-11-10', '2026-11-10', 'x', '2026-12-05'], '2026-10-27'), null);
  assert.deepStrictEqual(C.votes.Ricsi, ['2026-11-10', '2026-11-12'], 'rendezve, ismétlés és sávon kívüli nap nélkül');
  Ch.setDays(C, 'Gabó', ['2026-11-02'], '2026-11-05');
  assert.strictEqual(C.votes.Gabó, undefined, 'elmúlt napot újonnan nem lehet bejelölni');
  Ch.setDays(C, 'Ricsi', [], '2026-10-27');
  assert.strictEqual(C.votes.Ricsi, undefined, 'üres lista: visszavonja');
  assert.strictEqual(Ch.view(C).question, 'Mikor legyen az AI chapter nagyba?');
});
