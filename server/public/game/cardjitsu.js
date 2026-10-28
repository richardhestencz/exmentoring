// Shared walk-in dojo and authoritative Card-Jitsu client. Cards are procedural HTML; no bitmap deck is shipped.
import { G } from './core.js';
import { raccoon } from './player.js';

const THREE = G.THREE, scene = G.scene, P = G.player;
const IX = 2000, IZ = 80, W = 24, D = 18, H = 5.2;
const MAT_X = [IX - 7, IX, IX + 7], MAT_Z = IZ + 0.5;
const HU = { fire: 'Tűz', water: 'Víz', snow: 'Hó', red: 'piros', blue: 'kék', yellow: 'sárga', green: 'zöld', orange: 'narancs', purple: 'lila' };
const ICON = { fire: '火', water: '水', snow: '雪' };
const POWER = { plus: '+2 saját', minus: '−2 ellenfél', low: 'kisebb nyer', discardElement: 'elem eldobás', discardColor: 'szín eldobás', discardAll: 'minden szín eldobás', transform: 'átalakítás', block: 'blokkolás' };
const root = document.createElement('section'); root.id = 'cj'; root.hidden = true; document.body.append(root);
const menu = document.createElement('div'); menu.id = 'cj-menu'; menu.className = 'menu'; menu.hidden = true; document.body.append(menu);
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

let inside = false, back = null, room = null, state = null, spectator = false, masterOpen = false;
let duelAvatars = [], particles = [], lastRoundKey = '', lastSecond = -1;
let cityStarted = false, restoring = false, duelFov = null;
let muted = sessionStorage.getItem('loopcity-cj-muted') === '1';
const tokenKey = 'loopcity-cj-session';

function canvasTexture(draw) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const ctx = canvas.getContext('2d'); draw(ctx, 256); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; return texture;
}
function addBox(x, y, z, w, h, d, material, solid = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  if (solid) G.addSolid({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
  return mesh;
}
function symbolTexture(element) {
  return canvasTexture((ctx, size) => { ctx.clearRect(0, 0, size, size); ctx.fillStyle = { fire: '#c84f2d', water: '#347bb7', snow: '#d9f2f4' }[element]; ctx.beginPath(); ctx.arc(size / 2, size / 2, 82, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#2b1710'; ctx.lineWidth = 12; ctx.stroke(); ctx.fillStyle = '#24140f'; ctx.font = '900 104px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ICON[element], size / 2, size / 2 + 7); });
}
function buildDojo() {
  const wood = canvasTexture((ctx, size) => { ctx.fillStyle = '#8d512d'; ctx.fillRect(0, 0, size, size); for (let y = 0; y < size; y += 32) { ctx.fillStyle = y % 64 ? '#a76738' : '#9a5b31'; ctx.fillRect(0, y, size, 29); ctx.fillStyle = 'rgba(43,20,10,.3)'; ctx.fillRect(0, y + 29, size, 3); } }); wood.repeat.set(12, 9);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: wood, roughness: .9 })); floor.rotation.x = -Math.PI / 2; floor.position.set(IX, .01, IZ); floor.receiveShadow = true; scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a2018, roughness: .92 }), beamMat = new THREE.MeshStandardMaterial({ color: 0x160e0c, roughness: .75 });
  const x0 = IX - W / 2, x1 = IX + W / 2, z0 = IZ - D / 2, z1 = IZ + D / 2;
  addBox(x0 - .15, H / 2, IZ, .3, H, D, wallMat, true); addBox(x1 + .15, H / 2, IZ, .3, H, D, wallMat, true); addBox(IX, H / 2, z0 - .15, W, H, .3, wallMat, true);
  addBox(IX - 7, H / 2, z1 + .15, W / 2 - 2, H, .3, wallMat, true); addBox(IX + 7, H / 2, z1 + .15, W / 2 - 2, H, .3, wallMat, true);
  for (const x of [x0, IX - 4, IX + 4, x1]) addBox(x, H / 2, IZ, .25, H, .25, beamMat);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x211411, side: THREE.DoubleSide, roughness: 1 })); ceiling.rotation.x = Math.PI / 2; ceiling.position.set(IX, H, IZ); scene.add(ceiling);
  G.ceilings.push((x, z) => Math.abs(x - IX) < W / 2 + 1 && Math.abs(z - IZ) < D / 2 + 1 ? H : 1e9);
  const tatami = new THREE.MeshStandardMaterial({ color: 0xb9a970, roughness: 1 }), border = new THREE.MeshStandardMaterial({ color: 0x402319, roughness: .85 });
  MAT_X.forEach((x, i) => {
    addBox(x, .06, MAT_Z, 5.7, .12, 5.2, border); addBox(x, .13, MAT_Z, 5.2, .08, 4.7, tatami);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(.72, 40), new THREE.MeshBasicMaterial({ map: symbolTexture(ELEMENT_FOR_MAT[i]), transparent: true })); emblem.rotation.x = -Math.PI / 2; emblem.position.set(x, .19, MAT_Z); scene.add(emblem);
  });
  for (let i = 0; i < 9; i++) { const color = [0xf1eee2, 0xe2c44e, 0xe48a37, 0x4b9b55, 0x3f77ad, 0xc34c43, 0x8b5aa5, 0x795039, 0x171513][i]; addBox(IX - 8 + i * 2, 3.55, z0 + .05, 1.45, .22, .08, new THREE.MeshBasicMaterial({ color })); }
  for (const x of [IX - 7, IX, IX + 7]) { const light = new THREE.PointLight(0xffc879, 6, 11, 1.6); light.position.set(x, H - .5, MAT_Z); scene.add(light); }
  const master = raccoon(0xd6a36e); master.root.position.set(IX, 0, z0 + 2); master.root.rotation.y = 0; master.play('idle'); master.root.userData.cardJitsuMaster = true;
  G.on('update', (dt) => { if (inside) master.mixer.update(dt); });
  return { x0, x1, z0, z1, master };
}
const ELEMENT_FOR_MAT = ['fire', 'water', 'snow'];
let dojo;

function move(x, z, ry) { P.x = x; P.z = z; P.y = P.sy = 0; P.vy = P.speed = 0; P.ry = ry; P.av.root.position.set(x, 0, z); P.av.root.rotation.y = ry; G.cam.yaw = ry + Math.PI; }
function fade(action) { const flash = document.getElementById('flash'); flash.style.background = '#1b0f0c'; flash.style.transition = 'opacity .2s'; flash.style.opacity = 1; setTimeout(() => { action(); flash.style.opacity = 0; setTimeout(() => { flash.style.background = '#fff'; flash.style.transition = ''; }, 250); }, 220); }
function savedToken() { try { return sessionStorage.getItem(tokenKey) || ''; } catch { return ''; } }
function saveToken(token) { try { if (token) sessionStorage.setItem(tokenKey, token); else sessionStorage.removeItem(tokenKey); } catch {} }
function send(message) { if (G.net.status !== 'online') return G.hud.toast('A Card-Jitsu kapcsolata helyreállításra vár.'); G.net.send(message); }

function enterDojo() {
  if (P.inCar || P.dead) return;
  const place = G.world.places.dojo; back = { x: place.door.x, z: place.door.z + (place.ry === 0 ? 1.4 : -1.4), ry: place.ry };
  fade(() => { inside = true; G.cardJitsuSafe = true; G.keepUnlocked = true; document.body.classList.add('cj-inside'); document.exitPointerLock?.(); move(IX, IZ + 5.5, Math.PI); root.hidden = false; root.className = 'cj-lobby'; reconnect(); drawLobby(); G.hud.toast('Három tatami vár. A Mester elmagyarázza a szabályokat.'); });
}
function exitDojo() {
  if (state?.match) return G.hud.toast('Előbb zárd le a párbajt vagy a megfigyelést.');
  send({ t: 'cj-exit' }); saveToken(''); inside = false; room = state = null; root.hidden = true; masterOpen = false; G.cardJitsuSafe = false;
  document.body.classList.remove('cj-inside');
  const place = G.world.places.dojo, target = back || { x: place.door.x, z: place.door.z + 1.4, ry: 0 };
  fade(() => { move(target.x, target.z, target.ry); G.keepUnlocked = false; G.renderer.domElement.requestPointerLock?.(); });
}

function esc(text) { return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function effectText(card) { return card?.kind ? (card.label || POWER[card.kind] || card.kind) : 'Alaplap'; }
function cardHTML(card, index, disabled = false, blocked = false) {
  if (!card) return '<article class="cj-card cj-empty"><span>Passz</span></article>';
  return `<button type="button" class="cj-card ${card.element} color-${card.color}" data-card="${esc(card.id)}" ${disabled || blocked ? 'disabled' : ''} title="${esc(effectText(card))}"><span class="cj-key">${index ? index : ''}</span><span class="cj-element">${ICON[card.element]} <small>${HU[card.element]}</small></span><strong>${card.value}</strong><img class="cj-art" src="/img/raccoon-64.png" alt=""><span class="cj-color"><i></i>${HU[card.color]}</span><small>${esc(effectText(card))}${blocked ? ' · BLOKKOLVA' : ''}</small></button>`;
}
function scoredHTML(player) { return `<div class="cj-score"><b>${esc(player.nick)}</b><span>${esc(player.belt.name)}${state?.match?.phase === 'select' && player.ready ? ' · ✓ Választott' : ''}</span><div>${player.scored.length ? player.scored.map((c) => `<i class="${c.color}" title="${HU[c.element]} ${c.value}, ${HU[c.color]}">${ICON[c.element]}${c.value}<em>${HU[c.color]}</em></i>`).join('') : '<small>Még nincs nyert lap</small>'}</div></div>`; }
function seconds(match) { return match?.phase === 'select' && match.endAt ? Math.max(0, Math.ceil((match.endAt - Date.now()) / 1000)) : 0; }
function activeRules() {
  const rules = [];
  for (const player of state?.match?.players || []) {
    const mods = player.mods || (player.id === state.playerId ? state.mods : {}) || {}, parts = [];
    const value = (mods.plus || 0) + (mods.minus || 0);
    if (value) parts.push(`érték ${value > 0 ? '+' : ''}${value}`);
    if (mods.block) parts.push(`${HU[mods.block]} blokkolva`);
    if (parts.length) rules.push(`${player.nick}: ${parts.join(', ')}`);
    if (mods.low && !rules.includes('Azonos elemnél a kisebb érték nyer')) rules.push('Azonos elemnél a kisebb érték nyer');
  }
  return rules;
}

function drawLobby() {
  if (!inside || state?.match) return;
  const scrollTop = root.querySelector('.cj-room-panel')?.scrollTop || 0;
  root.className = 'cj-lobby'; root.hidden = false;
  const mine = room?.users?.find((user) => user.id === state?.playerId), seated = mine?.mat !== null && mine?.mat !== undefined;
  root.innerHTML = `<div class="cj-room-panel"><header><div><span>LOOP CITY · DOJŌ</span><h1>Card-Jitsu</h1></div><button type="button" data-action="exit" aria-label="Kilépés a dojōból">Utcára</button></header>
    <div class="cj-room-status"><span class="${G.net.status}"></span>${G.net.status === 'online' ? `${room?.users?.length || 1} játékos a teremben` : 'Kapcsolódás…'}${state?.belt ? ` · ${esc(state.belt.name)} · ${state.stats?.wins || 0} győzelem` : ''}</div>
    <div class="cj-mats">${(room?.mats || [0, 1, 2].map((i) => ({ i, players: [], active: false, watchers: 0 }))).map((mat) => `<article class="${mat.active ? 'active' : mat.players.length ? 'waiting' : ''}"><span>${ICON[ELEMENT_FOR_MAT[mat.i]]}</span><h2>${mat.i + 1}. tatami</h2><p>${mat.players.length ? mat.players.map((p) => `${esc(p.nick)} · ${esc(p.belt.name)}`).join('<br>') : 'Szabad tatami'}</p>${mat.active ? `<button data-watch="${mat.i}" ${seated ? 'disabled' : ''}>Megfigyelem <small>${mat.watchers} néző</small></button>` : mine?.mat === mat.i ? '<button data-action="leave">Felállok</button>' : `<button data-join="${mat.i}" ${seated ? 'disabled' : ''}>Leülök párbajra</button>`}</article>`).join('')}</div>
    <button class="cj-master-link" data-action="master">🥋 A Mester · szabályok, gépi ellenfél és statisztika</button>
    ${masterOpen ? masterPanel() : ''}<p class="cj-room-help">WASD: mozgás · E: használat · kattints a terembe a körbenézéshez · Esc: egér</p></div>`;
  root.querySelector('.cj-room-panel').scrollTop = scrollTop;
}
function masterPanel() {
  const stats = state?.stats || {}, belt = state?.belt || {};
  return `<aside class="cj-master"><button class="cj-close" data-action="master" aria-label="Bezárás">×</button><h2>A Mester tekercse</h2><p><b>Tűz › Hó › Víz › Tűz.</b> Azonos elemnél a nagyobb szám nyer. Három különböző színű, azonos elemű vagy mindhárom különböző elemű nyert lap hozza a párbajt.</p><p>A kiválasztás titkos és végleges. Ha egy elem blokkolva van, azt a lapot nem játszhatod ki. Passzolni csak akkor lehet, ha nincs szabályos lapod.</p><details><summary>A nyolc erőcsalád</summary><p>+2 saját; −2 ellenfél; kisebb szám nyer; egy nyert lap eldobása elem vagy szín szerint; minden adott szín eldobása; elemátalakítás; elemblokkolás. Az átalakítás és a kisebb-nyer hatás kijátszáskor, a többi körgyőzelemkor aktiválódik.</p></details><div class="cj-bots"><button data-bot="easy">Kölyök <small>véletlen lapok</small></button><button data-bot="normal">Mester <small>célokra figyel</small></button><button data-bot="hard">Árnyék <small>esélyeket számol</small></button></div><p class="cj-statline">Összesen ${stats.wins || 0}–${stats.losses || 0} · PvP ${stats.pvpWins || 0}–${stats.pvpLosses || 0}<br>Kölyök ${stats.easyWins || 0}–${stats.easyLosses || 0} · Mester ${stats.normalWins || 0}–${stats.normalLosses || 0} · Árnyék ${stats.hardWins || 0}–${stats.hardLosses || 0}${belt.next ? `<br>Következő öv: ${esc(belt.next.name)} (${belt.progress.current}/${belt.progress.needed})` : '<br>Elérted a fekete övet.'}</p></aside>`;
}

function drawDuel(force = false) {
  const match = state?.match; if (!inside || !match) return;
  const sec = seconds(match);
  if (!force) {
    if (sec === lastSecond) return;
    lastSecond = sec; const timer = root.querySelector('.cj-timer'), value = timer?.querySelector('strong');
    if (value && match.phase === 'select') value.textContent = sec;
    timer?.classList.toggle('urgent', sec <= 5 && match.phase === 'select'); return;
  }
  lastSecond = sec;
  const me = match.players.find((p) => p.id === state.playerId), hasChosen = !!state.decided;
  const legal = (state.hand || []).filter((card) => state.mods?.block !== card.element);
  const offline = G.net.status !== 'online';
  const status = offline ? 'Kapcsolat helyreállítása…' : match.paused ? 'Kapcsolat megszakadt · az óra áll' : match.phase === 'select' ? (spectator ? 'Titkos választás folyik' : hasChosen ? 'Várunk az ellenfélre' : 'Válassz egy lapot') : match.result?.text || 'Felfedés';
  root.className = 'cj-duel-ui'; root.hidden = false;
  root.innerHTML = `<div class="cj-duel-top"><div><span>${spectator ? 'MEGFIGYELŐ' : `TATAMI ${match.mat + 1}`}</span><b>${status}</b></div><div class="cj-timer ${sec <= 5 && match.phase === 'select' ? 'urgent' : ''}"><strong>${match.phase === 'select' ? sec : match.phase === 'done' ? 'VÉGE' : '•'}</strong><small>${match.phase === 'select' ? 'másodperc' : `kör ${match.round}`}</small></div><div class="cj-top-actions"><button data-action="mute">${muted ? '🔇' : '🔊'} Hang</button><button data-action="menu">Esc · Menü</button></div></div>
    <div class="cj-scoreboard">${match.players.map(scoredHTML).join('')}</div>
    <div class="cj-center">${match.result?.cards ? `<div class="cj-reveal">${match.result.cards.map((c) => c ? cardHTML(c, 0, true) : '<article class="cj-card cj-empty">Passz</article>').join('<b>VS</b>')}</div>` : `<div class="cj-seal"><span>${ICON[ELEMENT_FOR_MAT[match.mat]]}</span><b>${status}</b></div>`}<div class="cj-rules-active">${activeRules().map((x) => `<span>${esc(x)}</span>`).join('') || '<span>Alapszabályok</span>'}</div></div>
    ${!spectator ? `<div class="cj-hand" aria-label="Saját lapok">${(state.hand || []).map((card, i) => cardHTML(card, i + 1, offline || match.phase !== 'select' || hasChosen || match.paused, state.mods?.block === card.element)).join('')}<button class="cj-pass" data-card-pass ${offline || match.paused || legal.length || match.phase !== 'select' || hasChosen ? 'disabled' : ''}>Passz<small>nincs játszható lap</small></button></div>` : '<div class="cj-spectator-note">A kéz és a választás a felfedésig titkos.</div>'}
    ${match.phase === 'done' ? `<div class="cj-result-actions">${!spectator ? `<button data-action="rematch" ${match.rematch?.includes(state.playerId) ? 'disabled' : ''}>${match.rematch?.includes(state.playerId) ? 'Várunk a másik játékosra…' : 'Visszavágó'}</button>` : ''}<button data-action="leave-match">Vissza a dojōba</button></div>` : ''}`;
}

function ensureDuelAvatars(match) {
  if (duelAvatars.length) return;
  duelAvatars = match.players.map((player, i) => { const avatar = raccoon(player.tint || (i ? 0x9bbfe0 : 0xe0b087)); avatar.root.position.set(MAT_X[match.mat] + (i ? 1.6 : -1.6), .18, MAT_Z); avatar.root.rotation.y = i ? -Math.PI / 2 : Math.PI / 2; avatar.play('idle'); return avatar; });
}
function startDuel(match) {
  if (G.mode !== 'cardjitsu') {
    duelFov = G.camera.fov;
    const seat = match.players.findIndex((player) => player.id === state.playerId);
    move(MAT_X[match.mat] + (seat < 0 ? 0 : seat ? 1.6 : -1.6), MAT_Z + (spectator ? 3.6 : 0), seat === 1 ? -Math.PI / 2 : Math.PI / 2);
    G.mode = 'cardjitsu'; G.keepUnlocked = true; document.exitPointerLock?.(); P.hide(true); G.hideCityPlayers = true; document.body.classList.add('cj-playing');
    for (const key in G.keys) G.keys[key] = false;
    G.mouse.l = G.mouse.r = false; G.hud.prompt('');
  }
  ensureDuelAvatars(match); if (match.phase === 'select') for (const avatar of duelAvatars) avatar.play('idle'); drawDuel(true);
}
function removeParticle(particle) { scene.remove(particle.mesh); particle.mesh.geometry.dispose(); particle.mesh.material.dispose(); }
function clearParticles() { for (const particle of particles) removeParticle(particle); particles = []; }
function stopDuel() {
  for (const avatar of duelAvatars) {
    scene.remove(avatar.root); avatar.mixer.stopAllAction(); avatar.mixer.uncacheRoot(avatar.inner);
    avatar.inner.traverse((node) => { if (node.isMesh) for (const material of [].concat(node.material)) material.dispose(); });
  }
  duelAvatars = []; clearParticles(); lastRoundKey = ''; lastSecond = -1;
  if (duelFov !== null) { G.camera.fov = duelFov; G.camera.updateProjectionMatrix(); duelFov = null; }
  move(IX, IZ + 5.5, Math.PI);
  G.mode = 'play'; G.keepUnlocked = true; P.hide(false); G.hideCityPlayers = false; document.body.classList.remove('cj-playing'); menu.hidden = true; drawLobby();
}
function burst(match) {
  const result = match.result; if (!result?.cards) return; const key = `${match.id}:${match.round}`; if (key === lastRoundKey) return; lastRoundKey = key;
  const winner = result.winner, element = result.effective?.[winner] || result.cards[winner]?.element || 'snow', color = { fire: 0xff632e, water: 0x4aa8ff, snow: 0xdafcff }[element];
  const from = winner < 0 ? 0 : winner, direction = from ? -1 : 1, origin = new THREE.Vector3(MAT_X[match.mat] + (from ? 1.4 : -1.4), 1.05, MAT_Z);
  for (let i = 0; i < (REDUCED_MOTION ? 0 : 28); i++) { const mesh = new THREE.Mesh(new THREE.SphereGeometry(.05 + Math.random() * .08, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true })); mesh.position.copy(origin); scene.add(mesh); particles.push({ mesh, life: .65 + Math.random() * .7, velocity: new THREE.Vector3(direction * (2.8 + Math.random() * 2), (Math.random() - .15) * 2, (Math.random() - .5) * 2.2) }); }
  duelAvatars.forEach((avatar, i) => { avatar.play(REDUCED_MOTION || i === winner ? 'idle' : 'sit'); avatar.root.userData.cjKick = REDUCED_MOTION ? 0 : i === winner ? .32 : -.22; });
  if (!muted) G.sound(element === 'fire' ? 'boom' : element === 'water' ? 'cash' : 'hit', .35);
}
function updateDuel(dt) {
  const match = state?.match; if (!match) return;
  const x = MAT_X[match.mat]; G.camera.position.set(x, 5.2, MAT_Z + 7.2); G.camera.lookAt(x, 1.05, MAT_Z - .25); G.camera.fov += (54 - G.camera.fov) * Math.min(1, dt * 8); G.camera.updateProjectionMatrix();
  for (const avatar of duelAvatars) { avatar.mixer.update(dt); const kick = avatar.root.userData.cjKick || 0; avatar.root.rotation.z = kick; avatar.root.userData.cjKick = kick * Math.max(0, 1 - dt * 5); }
  for (const particle of particles) { particle.life -= dt; particle.velocity.y -= dt * 2; particle.mesh.position.addScaledVector(particle.velocity, dt); particle.mesh.material.opacity = Math.max(0, particle.life); }
  for (const particle of particles.filter((x) => x.life <= 0)) removeParticle(particle); particles = particles.filter((x) => x.life > 0);
  drawDuel();
}

function openMatchMenu() {
  const match = state?.match; if (!match) return;
  document.exitPointerLock?.(); menu.hidden = false;
  menu.innerHTML = `<div class="mbox"><h2>Card-Jitsu</h2><button data-action="continue">▶ Folytatás</button>${spectator ? '<button data-action="leave-match">👁 Megfigyelés befejezése</button>' : match.phase === 'done' ? '<button data-action="rematch">↻ Visszavágó</button><button data-action="leave-match">← Vissza a dojōba</button>' : '<button class="danger" data-action="forfeit">⚑ Párbaj feladása</button>'}<small>A feladás az első lezárt kör után vereségnek számít.</small></div>`;
}

root.addEventListener('click', (event) => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.join !== undefined) send({ t: 'cj-join', mat: Number(button.dataset.join) });
  else if (button.dataset.watch !== undefined) send({ t: 'cj-watch', mat: Number(button.dataset.watch) });
  else if (button.dataset.bot) send({ t: 'cj-bot', difficulty: button.dataset.bot });
  else if (button.dataset.card) { const match = state.match; send({ t: 'cj-play', match: match.id, round: match.round, card: button.dataset.card }); }
  else if (button.hasAttribute('data-card-pass')) { const match = state.match; send({ t: 'cj-play', match: match.id, round: match.round, card: null }); }
  else if (button.dataset.action === 'exit') exitDojo();
  else if (button.dataset.action === 'leave') send({ t: 'cj-leave' });
  else if (button.dataset.action === 'master') { masterOpen = !masterOpen; drawLobby(); if (masterOpen) root.querySelector('.cj-master')?.scrollIntoView({ block: 'nearest' }); }
  else if (button.dataset.action === 'menu') openMatchMenu();
  else if (button.dataset.action === 'mute') { muted = !muted; sessionStorage.setItem('loopcity-cj-muted', muted ? '1' : '0'); drawDuel(true); }
  else if (button.dataset.action === 'rematch') send({ t: 'cj-rematch' });
  else if (button.dataset.action === 'leave-match') { send({ t: 'cj-leave' }); spectator = false; state.match = null; stopDuel(); }
});
menu.addEventListener('click', (event) => {
  const action = event.target.closest('button')?.dataset.action; if (!action) return;
  if (action === 'continue') menu.hidden = true;
  else if (action === 'forfeit') { menu.hidden = true; send({ t: 'cj-forfeit' }); }
  else if (action === 'rematch') { menu.hidden = true; send({ t: 'cj-rematch' }); }
  else if (action === 'leave-match') { menu.hidden = true; send({ t: 'cj-leave' }); spectator = false; if (state) state.match = null; stopDuel(); }
});

function onMessage(message) {
  if (message.t === 'net-open') { if (cityStarted) reconnect(); return; }
  if (message.t === 'net-close' && inside) {
    restoring = false;
    if (state?.match) { state.match = { ...state.match, paused: true, endAt: 0 }; drawDuel(true); } else drawLobby();
    return;
  }
  if (message.t === 'cj-room') { room = message; drawLobby(); return; }
  if (message.t === 'cj-state') {
    if (restoring && !inside) {
      inside = true; G.cardJitsuSafe = true; G.keepUnlocked = true; document.body.classList.add('cj-inside');
      const place = G.world.places.dojo; back = { x: place.door.x, z: place.door.z + 1.4, ry: place.ry };
      move(IX, IZ + 5.5, Math.PI); document.exitPointerLock?.();
    }
    restoring = false;
    if (message.token) saveToken(message.token);
    spectator = !!message.spectator;
    const hadMatch = !!state?.match; state = { ...(state || {}), ...message };
    if (state.match) startDuel(state.match); else if (hadMatch) stopDuel(); else drawLobby();
    return;
  }
  if (message.t === 'cj-round') { if (!state) state = {}; state.match = message.match; startDuel(message.match); burst(message.match); drawDuel(true); return; }
  if (message.t === 'cj-error') { if (message.reset) { restoring = false; saveToken(''); if (inside) G.net.send({ t: 'cj-enter' }); } G.hud.toast(message.msg); return; }
  if (message.t === 'cj-exited') saveToken('');
}

function reconnect() {
  if (restoring) return;
  const token = savedToken();
  if (token) { restoring = true; G.net.send({ t: 'cj-resume', token }); }
  else if (inside) G.net.send({ t: 'cj-enter' });
}

export function init() {
  dojo = buildDojo(); const place = G.world.places.dojo;
  G.interact.push({ x: place.door.x, z: place.door.z, r: 2.5, label: 'Belépés: Card-Jitsu dojō', when: () => !inside && !P.inCar && !P.dead, act: enterDojo });
  G.interact.push({ x: IX, z: dojo.z1 - .7, r: 1.8, label: 'Kilépés az utcára', when: () => inside && !state?.match, act: exitDojo });
  G.interact.push({ x: IX, z: dojo.z0 + 2.8, r: 2.1, label: 'Beszélgetés a Mesterrel', when: () => inside && !state?.match, act: () => { masterOpen = true; drawLobby(); document.exitPointerLock?.(); } });
  MAT_X.forEach((x, mat) => G.interact.push({ x, z: MAT_Z + 2.7, r: 2, label: () => room?.mats?.[mat]?.active ? 'Párbaj megfigyelése' : 'Leülés a tatamira', when: () => inside && !state?.match && state?.watching == null, act: () => send(room?.mats?.[mat]?.active ? { t: 'cj-watch', mat } : { t: 'cj-join', mat }) }));
  G.net.on(onMessage); G.on('cardjitsu', updateDuel);
  G.on('start', () => { cityStarted = true; if (G.net.status === 'online') reconnect(); });
  addEventListener('keydown', (event) => {
    if (!inside) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      if (state?.match) { if (menu.hidden) openMatchMenu(); else menu.hidden = true; }
      else { document.exitPointerLock?.(); masterOpen = !masterOpen; drawLobby(); }
      return;
    }
    if (state?.match && !spectator && !event.repeat && /^Digit[1-5]$/.test(event.code)) root.querySelector(`[data-card]:nth-of-type(${Number(event.code.slice(-1))})`)?.click();
  });
}
