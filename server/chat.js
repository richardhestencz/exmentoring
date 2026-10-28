// Közös chat fal: egy közös üzenetfolyam, mindenki ugyanazt látja; ha valaki ír, az üzenet azonnal felugrik mindenkinél.
// A chat egy oldalsó panelben van (a fejléc „💬 Chat” gombja nyitja), mint a zene: nincs egyből szem előtt.
// Az állapot: { msgs: [{ id, ts, nick, text }] } — a legutóbbi MAX_MSGS üzenet, a legrégebbi elöl.
const MAX_MSGS = 200;       // ennyi üzenetet tartunk meg
const MAX_LEN = 500;        // egy üzenet legfeljebb ennyi karakter
const MIN_GAP_MS = 800;     // két üzenet között ennyit várni kell (elárasztás ellen)

const cleanText = (t) => String(t || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, MAX_LEN);

const empty = () => ({ msgs: [] });

// a mentett állapot tisztítása indításkor (a hibás/régi formákat eldobja)
function sanitize(m) {
  const e = empty();
  if (!m || typeof m !== 'object' || !Array.isArray(m.msgs)) return e;
  e.msgs = m.msgs
    .filter((x) => x && typeof x === 'object' && cleanText(x.text) && typeof x.nick === 'string')
    .slice(-MAX_MSGS)
    .map((x) => ({ id: String(x.id || '') || mkId(), ts: Number(x.ts) || Date.now(), nick: String(x.nick).slice(0, 16), text: cleanText(x.text) }));
  return e;
}

let seq = 0;
const mkId = () => `${Date.now().toString(36)}${(seq = (seq + 1) % 1000).toString(36)}`;

// kliensnek küldött nézet: a teljes (korlátozott) üzenetfolyam + a szerver ideje
const view = (m) => ({ msgs: m.msgs, now: Date.now() });

// egy üzenet hozzáadása. Siker esetén a friss üzenetet adja vissza (ezt kell mindenkinek popupolni), hibánál { error }.
function add(m, nick, text, now = Date.now()) {
  const t = cleanText(text);
  if (!t) return { error: 'Üres üzenetet nem lehet küldeni.' };
  const msg = { id: mkId(), ts: now, nick: String(nick || '').slice(0, 16), text: t };
  m.msgs.push(msg);
  if (m.msgs.length > MAX_MSGS) m.msgs = m.msgs.slice(-MAX_MSGS);
  return { msg };
}

// a küldhető mozgó emote-ok (Twitch-stílus: a képernyőn repülnek/táncolnak a zenére). Zárt lista: nem lehet vele tetszőleges tartalmat küldeni.
// Kétféle: sima emoji, és a kabala mosómedve érzelmei (rc:<mozgás>) — a kép a kliensen a raccoon-képből jön, a mozgást CSS adja.
const EMOTES = ['💃', '🕺', '🔥', '🎉', '❤️', '😂', '👏', '🙌', '🎶', '🤘', '✨', '🥳'];
const RACCOONS = ['rc:dance', 'rc:laugh', 'rc:cry', 'rc:hungry'];
const isEmote = (e) => EMOTES.includes(String(e || '')) || RACCOONS.includes(String(e || ''));

module.exports = { empty, sanitize, view, add, cleanText, isEmote, EMOTES, RACCOONS, MAX_MSGS, MAX_LEN, MIN_GAP_MS };
