const TIME_ZONE = 'Europe/Budapest';
const REWARD = 30000;
const CHALLENGES = Object.freeze([
  {
    id: 'three-spin-inside-win', title: 'Háromszoros szerencse',
    description: 'Nyerj 3 külön pörgetésben, tegyél fel összesen legalább 15 000 🦝-t, és az egyik nyerésed belső tét legyen.',
    minTotalStake: 15000, minWinningSpins: 3, needsInsideWin: true,
  },
  {
    id: 'four-winning-kinds', title: 'Négyféle út',
    description: 'Nyerj legalább 4 különböző tétfajtával, legalább 20 000 🦝 össztét mellett.',
    minTotalStake: 20000, minWinningKinds: 4,
  },
  {
    id: 'red-black-tour', title: 'Piros-fekete túra',
    description: 'Nyerj legalább egy piros és egy fekete tétet külön pörgetésekben, legalább 12 000 🦝 össztéttel.',
    minTotalStake: 12000, requiredWinningColors: ['red', 'black'], minWinningSpins: 2,
  },
  {
    id: 'winning-streak', title: 'Forró kerék',
    description: 'Nyerj legalább 2 egymást követő pörgetésben, és tegyél fel összesen legalább 12 000 🦝-t.',
    minTotalStake: 12000, minWinStreak: 2,
  },
  {
    id: 'inside-double', title: 'Belső kör',
    description: 'Nyerj 2 különböző belső tétfajtával, legalább 3 pörgetésben és 18 000 🦝 össztéttel.',
    minTotalStake: 18000, minWinningSpins: 3, minInsideWinningKinds: 2,
  },
  {
    id: 'five-spin-run', title: 'Hosszú menet',
    description: 'Legyen legalább 4 külön pörgetésben nyerő tipped, és tegyél fel összesen legalább 25 000 🦝-t.',
    minTotalStake: 25000, minWinningSpins: 4,
  },
  {
    id: 'mixed-winning-card', title: 'Vegyes lapjárás',
    description: 'Nyerj legalább 3 különböző tétfajtával 3 pörgetésben, legalább 18 000 🦝 össztéttel.',
    minTotalStake: 18000, minWinningSpins: 3, minWinningKinds: 3,
  },
].map((challenge) => Object.freeze({ ...challenge, reward: REWARD })));

function dateKey(at = Date.now()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE }).format(new Date(at));
}

function challengeFor(date) {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return CHALLENGES[((day % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
}

function emptyState(date = '') {
  return { date, winner: '', wonAt: 0, round: 0 };
}

function normalizeState(value) {
  return {
    date: typeof value?.date === 'string' ? value.date : '',
    winner: typeof value?.winner === 'string' ? value.winner : '',
    wonAt: Number.isFinite(value?.wonAt) ? value.wonAt : 0,
    round: Number.isInteger(value?.round) && value.round >= 0 ? value.round : 0,
  };
}

function progress(history, nick, date) {
  const challenge = challengeFor(date);
  const spins = (Array.isArray(history) ? history : [])
    .filter((spin) => dateKey(spin?.at) === date)
    .map((spin) => ({
      ...spin,
      bets: (Array.isArray(spin?.bets) ? spin.bets : []).filter((bet) => bet?.nick === nick),
    }))
    .filter((spin) => spin.bets.length)
    .sort((a, b) => (a.round || 0) - (b.round || 0) || (a.at || 0) - (b.at || 0));
  const winningSpins = spins.filter((spin) => spin.bets.some((bet) => bet.won));
  const totalStake = spins.reduce((sum, spin) => sum + spin.bets.reduce((inner, bet) => inner + (Number(bet.stake) || 0), 0), 0);
  const winningBets = winningSpins.flatMap((spin) => spin.bets.filter((bet) => bet.won));
  const winningKinds = new Set(winningBets.map((bet) => String(bet.kind)));
  const insideWinningKinds = new Set(winningBets.map((bet) => String(bet.kind)).filter((kind) => /^(in:|n:)/.test(kind)));
  const winningColors = new Set(winningBets.map((bet) => String(bet.kind)).filter((kind) => kind === 'red' || kind === 'black'));
  let winStreak = 0, maxWinStreak = 0, previousRound = null;
  for (const spin of winningSpins) {
    winStreak = previousRound !== null && spin.round === previousRound + 1 ? winStreak + 1 : 1;
    maxWinStreak = Math.max(maxWinStreak, winStreak);
    previousRound = spin.round;
  }
  const insideWin = insideWinningKinds.size > 0;
  const complete = totalStake >= challenge.minTotalStake
    && (!challenge.minWinningSpins || winningSpins.length >= challenge.minWinningSpins)
    && (!challenge.minWinningKinds || winningKinds.size >= challenge.minWinningKinds)
    && (!challenge.minInsideWinningKinds || insideWinningKinds.size >= challenge.minInsideWinningKinds)
    && (!challenge.requiredWinningColors || challenge.requiredWinningColors.every((color) => winningColors.has(color)))
    && (!challenge.needsInsideWin || insideWin)
    && (!challenge.minWinStreak || maxWinStreak >= challenge.minWinStreak);
  return {
    totalStake,
    winningSpins: winningSpins.length,
    insideWin,
    winningKinds: winningKinds.size,
    insideWinningKinds: insideWinningKinds.size,
    winningColors: [...winningColors],
    maxWinStreak,
    complete,
  };
}

module.exports = { CHALLENGES, REWARD, dateKey, challengeFor, emptyState, normalizeState, progress };
