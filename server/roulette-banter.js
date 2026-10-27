const BAD_PUNS = Object.freeze([
  'A szerencse forgandó, de ez a poén sajnos nem.',
  'Ez a kör igazán kerek lett, csak nem mindenkinek.',
  'A pénz körforgásban van — most épp a pot felé gurult.',
  'A kerék pörgött, a poén meg lejtett.',
  'Aki most nyert, annak bejött a körítés.',
]);

function occasionalBadPun(random = Math.random, chance = 0.2) {
  if (random() >= chance) return '';
  return BAD_PUNS[Math.floor(random() * BAD_PUNS.length)];
}

module.exports = { BAD_PUNS, occasionalBadPun };
