// Mosómedve-profilok a becenevekhez: skin (kalap, szemüveg, felső, alsó) és a választott hely a tisztáson.
const A = require('./public/avatar.js');

const empty = () => ({});

function setAvatar(S, nick, skin, spot) {
  if (!nick) return 'Előbb add meg a beceneved.';
  const s = skin && { hat: skin.hat, glasses: skin.glasses, top: skin.top, bottom: skin.bottom };
  if (!A.validSkin(s)) return 'Hibás skin.';
  if (spot !== null && spot !== undefined && !(Number.isInteger(spot) && spot >= 0 && spot < A.MAX)) return 'Ismeretlen hely.';
  const sp = Number.isInteger(spot) ? spot : null;
  if (sp !== null) {
    const other = Object.keys(S).find((n) => n !== nick && S[n].spot === sp);
    if (other) return `Ezt a helyet már ${other} választotta.`;
  }
  if (!S[nick] && Object.keys(S).length >= 300) return 'Túl sok profil.';
  S[nick] = { ...s, spot: sp };
  return null;
}

module.exports = { empty, setAvatar };
