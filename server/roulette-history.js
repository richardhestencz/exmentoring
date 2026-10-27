const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Budapest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateKey(at) {
  const parts = Object.fromEntries(DATE_FORMATTER.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}`;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function emptyStat() {
  return { net: 0, rounds: 0, bets: 0, wins: 0 };
}

function normalizeStats(value) {
  const out = {};
  for (const [nick, stat] of Object.entries(value && typeof value === 'object' ? value : {})) {
    out[nick] = {
      net: finiteNumber(stat?.net),
      rounds: nonNegativeInteger(stat?.rounds),
      bets: nonNegativeInteger(stat?.bets),
      wins: nonNegativeInteger(stat?.wins),
    };
  }
  return out;
}

function nextSpinId(state, at = Date.now()) {
  const date = dateKey(at);
  let sequence = state.spinDate === date ? nonNegativeInteger(state.spinSequence) : 0;
  if (sequence === 0 && state.spinDate !== date) {
    const previous = Array.isArray(state.rouletteHistory)
      ? state.rouletteHistory.find((spin) => String(spin?.id || '').startsWith(date))
      : null;
    const previousSequence = Number(String(previous?.id || '').slice(8));
    if (Number.isInteger(previousSequence) && previousSequence > 0) sequence = previousSequence;
  }
  sequence += 1;
  state.spinDate = date;
  state.spinSequence = sequence;
  return `${date}${String(sequence).padStart(3, '0')}`;
}

function settleBets(bets, number, payout) {
  return bets.map((bet) => {
    const stake = Number(bet.stake);
    const returned = payout(bet.kind, number, stake);
    return {
      nick: bet.nick,
      kind: bet.kind,
      stake,
      payout: returned,
      net: returned - stake,
      won: returned > 0,
    };
  });
}

function updateStats(stats, bets, excludedNick = '') {
  const touched = new Set();
  for (const bet of bets) {
    const stat = stats[bet.nick] ||= emptyStat();
    stat.net += bet.net;
    if (bet.nick !== excludedNick) {
      stat.bets += 1;
      if (bet.won) stat.wins += 1;
    }
    touched.add(bet.nick);
  }
  for (const nick of touched) stats[nick].rounds += 1;
}

function winRate(stat) {
  return stat.bets ? stat.wins / stat.bets * 100 : 0;
}

module.exports = { dateKey, normalizeStats, nextSpinId, settleBets, updateStats, winRate };
