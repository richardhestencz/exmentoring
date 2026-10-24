// A tisztás helyei. A böngészőben window.Avatar, a szerveren (tesztekhez, helyfoglaláshoz) require-rel is betölthető.
// A mosómedvék a jóváhagyott Gemini-képből (scene-v7) vannak kivágva, helyenként egy-egy kép (img/spots/spot-N.png, éjjel -n),
// így aki leül, az a kép saját mosómedvéjeként jelenik meg a helyén.
(function (root) {
  // ---- a 16 hely: a jóváhagyott kép mosómedvéi ----
  // x, y: a fej közepe az alap-képen (2000x848); hw: a fej szélessége; box: a kivágás helye [x0, y0, w, h]
  const SPOTS = [
    { name: 'Blackjack: osztó', x: 320, y: 424, hw: 76, box: [253, 377, 179, 247] },
    { name: 'Blackjack: játékos (bal)', x: 236, y: 461, hw: 97, box: [142, 411, 146, 209] },
    { name: 'Blackjack: játékos (jobb)', x: 459, y: 460, hw: 95, box: [353, 409, 208, 219] },
    { name: 'Póker (bal)', x: 915, y: 427, hw: 69, box: [839, 393, 157, 164] },
    { name: 'Póker (jobb)', x: 1091, y: 431, hw: 69, box: [1015, 393, 157, 166] },
    { name: 'Bal rönk: szendvicset eszik', x: 670, y: 520, hw: 82, box: [584, 471, 175, 199] },
    { name: 'Bal rönk: bongózik', x: 777, y: 487, hw: 69, box: [702, 449, 143, 186] },
    { name: 'Jobb rönk: pénzt szór', x: 1262, y: 508, hw: 69, box: [1097, 357, 239, 328] },
    { name: 'Jobb rönk: gitározik', x: 1370, y: 528, hw: 85, box: [1292, 448, 157, 248] },
    { name: 'Függőágy', x: 1827, y: 647, hw: 82, box: [1639, 564, 281, 178] },
    { name: 'Sárkányrepülő', x: 1196, y: 141, hw: 57, box: [1093, 58, 259, 152] },
    { name: 'Home office: horgász 1', x: 1462, y: 440, hw: 30, box: [1409, 424, 88, 62] },
    { name: 'Home office: horgász 2', x: 1612, y: 430, hw: 30, box: [1575, 398, 123, 113] },
    { name: 'Home office: horgász 3', x: 1745, y: 405, hw: 30, box: [1671, 380, 124, 104] },
    { name: 'Home office: horgász 4', x: 1815, y: 405, hw: 30, box: [1772, 380, 96, 92] },
    { name: 'Home office: kenu', x: 1805, y: 505, hw: 30, box: [1690, 478, 193, 112] },
  ];

  const MAX = SPOTS.length;
  // home office-ból a tó melletti helyek választhatók (horgászok, kenu), helyben a többi
  const HO = [11, 12, 13, 14, 15];
  const allowed = (mode, i) => (mode === 'ho' ? HO.includes(i) : mode === 'bent' ? i >= 0 && i < MAX && !HO.includes(i) : false);
  // a kőkör helye és mérete a háttérképeken; a kép mindig teljes szélességében látszik (zoom 1), hogy minden hely látsszon
  const SCENES = {
    wide: { src: 'img/scene-wide.jpg', w: 2000, h: 848, k: 1, ox: 0, oy: 0, cx: 999, cy: 688, ring: 414, wheel: 596, head: 360, zoom: 1 },
    night: { src: 'img/scene-night-wide.jpg', w: 2000, h: 848, k: 1, ox: 0, oy: 0, cx: 999, cy: 688, ring: 414, wheel: 596, head: 360, zoom: 1, night: true },
    tall: { src: 'img/scene-tall.jpg', w: 1116, h: 2000, k: 0.572, ox: -13.2, oy: 793.6, cx: 558, cy: 1187, ring: 237, wheel: 341, head: 1000, zoom: 1 },
  };
  // egy hely egy adott háttérképen, a kép képpontjaiban: a fej közepe (x, y), a kivágás bal felső sarka (left, top), mérete (w, h)
  const spotPos = (sc, i) => {
    const p = SPOTS[i];
    return { x: p.x * sc.k + sc.ox, y: p.y * sc.k + sc.oy, left: p.box[0] * sc.k + sc.ox, top: p.box[1] * sc.k + sc.oy, w: p.box[2] * sc.k, h: p.box[3] * sc.k, k: sc.k, hw: p.hw * sc.k, p };
  };

  const API = { SPOTS, MAX, HO, allowed, SCENES, spotPos };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Avatar = API;
})(typeof window !== 'undefined' ? window : globalThis);
