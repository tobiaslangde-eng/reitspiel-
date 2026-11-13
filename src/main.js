// Silbertal Ranch – Spielablauf, Kamera, Speichern
import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, TAU } from './util.js';
import { World, LOC, POIS, PADDOCK, MARKET } from './world.js';
import { Horse, Player, Dust } from './entities.js';
import { buildHorse, animateHorse } from './horseModel.js';
import { buildHuman, animateHuman, defaultLook } from './human.js';
import { makeMarket, makeStuds, breedFoal, horseValue, coatOf, STATS, STAT_NAMES, RIDE_AGE } from './data.js';
import { EventRun, DISCIPLINES, LEVELS } from './events.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const SAVE_KEY = 'silbertal-ranch-v1', HOUR = 30;
const canvas = document.getElementById('c'), app = document.getElementById('app');
const touchDev = matchMedia('(pointer: coarse)').matches;

const G = window.G = {
  state: null, horses: [], marketHorses: [], marketData: [], studs: [], active: null, event: null, prompt: '', mode: 'boot',
  cam: { yaw: 0, pitch: 0.28, zoom: 1, fov: 55 }, audio: new Audio(), petT: 0,
};
function loadState() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 1 && s.horses && s.horses.length ? s : null; } catch (_) { return null; } }
const saved = loadState();
const qp = new URLSearchParams(location.search).get('q');
const quality0 = qp != null ? +qp : saved ? saved.quality : touchDev ? 0 : 1;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = G.scene = new THREE.Scene();
const camera = G.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 9000);
G.applyQuality = () => { const q = G.state ? G.state.quality : quality0; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q ? 2 : 1.25) * (G.lowRes ? 0.7 : 1)); resize(); };
function resize() { const w = app.clientWidth, h = app.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

const world = G.world = new World(scene, renderer, quality0);
G.fx = new Dust(scene);
const input = G.input = new Input(canvas);
const ui = G.ui = new UI(G);
if (touchDev) { document.body.classList.add('touch'); input.touch = true; }
G.applyQuality();

// ---------- Vorschau-Bühne für die Editoren ----------
const STAGE = { x: 8, z: -20 };
G.preview = {
  on: false, model: null, hum: null, yaw: 2.4,
  clear() { if (this.model) { scene.remove(this.model.root); this.model.dispose(); this.model = null; } if (this.hum) { scene.remove(this.hum.root); this.hum.dispose(); this.hum = null; } },
  horse(d) { this.clear(); this.on = true; const m = this.model = buildHorse(d, { tack: d.style }); if (m.tack) m.tack.reins.visible = false; m.root.position.set(STAGE.x, world.heightAt(STAGE.x, STAGE.z), STAGE.z); scene.add(m.root); },
  human(look, style) { const a = this.hum && this.hum.anim; this.clear(); this.on = true; const h = this.hum = buildHuman(look, style); if (a) h.anim = a; h.root.position.set(STAGE.x, world.heightAt(STAGE.x, STAGE.z), STAGE.z); scene.add(h.root); },
  stop() { this.clear(); this.on = false; camera.clearViewOffset(); },
};

// ---------- Spielstand ----------
G.hasSave = () => !!loadState();
G.save = () => { if (!G.state || G.mode !== 'play') return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.state)); } catch (_) { /* Speicher nicht verfügbar */ } };
function freshState() { return { v: 1, player: { name: 'Alex', look: defaultLook() }, money: 2500, day: 1, time: 9, horses: [], activeId: null, progress: {}, best: {}, sold: [], quality: quality0 }; }
G.clockText = () => { const t = G.state.time, h = Math.floor(t), m = Math.floor((t - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
G.horseById = (id) => G.horses.find((h) => h.d.id === id);
G.snapCam = () => { G.camSnap = true; };
G.fade = (fn) => { const f = document.getElementById('fade'); f.classList.add('on'); setTimeout(() => { fn(); G.snapCam(); setTimeout(() => f.classList.remove('on'), 250); }, 380); };

G.toTitle = () => { G.mode = 'title'; document.body.classList.remove('playing'); ui.title(); };
G.startNew = () => {
  G.state = freshState(); clearEntities();
  ui.charEditor(G.state.player.look, G.state.player.name, (look, name) => {
    G.state.player = { look, name };
    ui.horseEditor({ free: true, done: (h) => { G.state.horses = [h]; G.state.activeId = h.id; begin(true); } });
  }, true);
};
G.continueGame = () => { G.state = loadState() || freshState(); const s = G.state; s.sold = s.sold || []; s.best = s.best || {}; s.progress = s.progress || {}; ui.close(); begin(false); };

function clearEntities() {
  for (const h of G.horses) h.dispose(); for (const h of G.marketHorses) h.dispose(); G.horses = []; G.marketHorses = []; G.active = null;
  if (G.event) { G.event.cleanup(); G.event = null; }
  if (G.player) { scene.remove(G.player.human.root); G.player.human.dispose(); G.player = null; }
}
const padSpot = () => ({ x: lerp(PADDOCK.x0 + 6, PADDOCK.x1 - 6, Math.random()), z: lerp(PADDOCK.z0 + 6, PADDOCK.z1 - 6, Math.random()) });
function spawn(d, o = {}) { const p = o.x != null ? o : padSpot(); const h = new Horse(G, d, { x: p.x, z: p.z, mode: 'paddock', ...o }); h.mother = d.motherId; G.horses.push(h); return h; }
G.spawnHorse = (d, o) => { const h = new Horse(G, d, o); h.near = 0.4; return h; };
function begin(isNew) {
  const S = G.state; clearEntities();
  G.player = new Player(G, S.player.look);
  for (const d of S.horses) { const act = d.id === S.activeId && d.age >= RIDE_AGE; const h = spawn(d, act ? { x: -9, z: -1, heading: 1.2, mode: 'wait', tack: d.style } : {}); if (act) G.active = h; }
  if (!G.active) S.activeId = null;
  G.player.pos.x = -12; G.player.pos.z = 1; G.player.heading = 1.6; G.player.place(); G.cam.yaw = 1.6;
  G.studs = makeStuds(S.day); refreshMarket();
  G.mode = 'play'; document.body.classList.add('playing'); G.applyQuality(); G.snapCam();
  ui.banner(LOC.ranch.name);
  if (isNew) { ui.toast(`Willkommen auf der Silbertal Ranch, ${S.player.name}!`); setTimeout(() => ui.toast('Geh zu deinem Pferd und drücke E zum Aufsteigen. Tab öffnet dein Handy.'), 2500); }
  G.save();
}
function refreshMarket() {
  for (const h of G.marketHorses) h.dispose(); G.marketHorses = [];
  G.marketData = makeMarket(G.state.day);
  for (const d of G.marketData) if (!G.state.sold.includes(d.id)) { const h = new Horse(G, d, { x: lerp(MARKET.x0 + 4, MARKET.x1 - 4, Math.random()), z: lerp(MARKET.z0 + 4, MARKET.z1 - 4, Math.random()), mode: 'paddock', area: MARKET }); G.marketHorses.push(h); }
}

// ---------- Pferdeverwaltung ----------
G.changed = (d, retack) => { const e = G.horseById(d.id); if (e) { e.refresh(); if (retack && e === G.active) { e.setTack(d.style); if (G.player.horse === e) G.player.setStyle(d.style); } } G.save(); };
function toPaddock(e) { if (G.player.horse === e) G.player.dismount(); e.setTack(null); const p = padSpot(); e.pos.x = p.x; e.pos.z = p.z; e.mode = 'paddock'; e.speed = 0; e.place(); }
G.saddle = (id) => {
  const e = G.horseById(id); if (!e || !e.canRide()) return;
  if (G.active && G.active !== e) toPaddock(G.active);
  const p = G.player; if (p.horse && p.horse !== e) p.dismount();
  G.active = e; G.state.activeId = id; e.setTack(e.d.style);
  if (p.horse !== e) { e.pos.x = p.pos.x + Math.sin(p.heading) * 2.4; e.pos.z = p.pos.z + Math.cos(p.heading) * 2.4; e.heading = p.heading + 1.5; e.mode = 'wait'; e.speed = 0; e.place(); }
  ui.toast(`${e.d.name} ist gesattelt (${e.d.style === 'western' ? 'Western' : 'Englisch'}).`); G.save();
};
function removeHorse(d) { const e = G.horseById(d.id); if (e) { if (G.player.horse === e) G.player.dismount(); if (G.active === e) { G.active = null; G.state.activeId = null; } e.dispose(); G.horses.splice(G.horses.indexOf(e), 1); } G.state.horses = G.state.horses.filter((x) => x.id !== d.id); }
G.sell = (d) => { const v = Math.round(horseValue(d) * 0.8); G.state.money += v; removeHorse(d); G.audio.cash(); ui.toast(`${d.name} verkauft für $${v.toLocaleString('de-DE')}.`); G.save(); };
G.buy = (id) => { const d = G.marketData.find((x) => x.id === id), S = G.state; if (!d || S.money < d.price) return; S.money -= d.price; S.sold.push(id); const e = G.marketHorses.find((x) => x.d.id === id); if (e) { e.dispose(); G.marketHorses.splice(G.marketHorses.indexOf(e), 1); } const n = JSON.parse(JSON.stringify(d)); delete n.price; n.id = 'h' + Date.now().toString(36); S.horses.push(n); spawn(n); G.audio.cash(); ui.toast(`${n.name} gehört jetzt dir und steht auf der Koppel.`); G.save(); };
G.buyCustom = (d, price) => { const S = G.state; S.money -= price; S.horses.push(d); spawn(d); G.audio.cash(); ui.toast(`${d.name} wurde auf deine Ranch geliefert.`); G.save(); };
G.breed = (mareId, sireId) => {
  const S = G.state, mare = S.horses.find((h) => h.id === mareId), own = S.horses.find((h) => h.id === sireId), stud = G.studs.find((h) => h.id === sireId), sire = own || stud; if (!mare || !sire) return;
  if (stud) S.money -= stud.fee;
  const foal = breedFoal(mare, sire); foal.motherId = mare.id; mare.pregnant = { days: 3, foal };
  ui.toast(`${mare.name} ist tragend von ${sire.name}. Geburt in 3 Tagen.`, 'good'); G.save();
};
function birth(mare) {
  const foal = mare.pregnant.foal; mare.pregnant = null; G.state.horses.push(foal);
  const m = G.horseById(mare.id), inPad = m && m.mode === 'paddock';
  spawn(foal, inPad ? { x: clamp(m.pos.x + 1.5, PADDOCK.x0 + 3, PADDOCK.x1 - 3), z: clamp(m.pos.z + 1, PADDOCK.z0 + 3, PADDOCK.z1 - 3) } : {});
  const c = coatOf(foal.genes, 0); G.audio.whinny();
  ui.toast(`${mare.name} hat ein Fohlen bekommen: ${foal.name}, ${foal.sex === 'Stute' ? 'ein Stutfohlen' : 'ein Hengstfohlen'} (${c.name}).`, 'good');
}
function ageHours(hrs) {
  for (const d of G.state.horses) {
    d.age += (hrs / 24) * (d.age < 4 ? 0.5 : 0.125);
    const e = G.horseById(d.id); if (!e) continue;
    const thr = d.age < 4.2 ? 0.08 : d.genes.G[0] + d.genes.G[1] ? 0.4 : 99;
    if (Math.abs(d.age - e.builtAge) > thr) { if (e.d.age >= RIDE_AGE || !e.tack) e.build(); }
  }
}
function newDay() {
  const S = G.state; S.day++;
  for (const d of S.horses.slice()) {
    d.food = Math.max(0, d.food - 18); d.clean = Math.max(0, d.clean - 14); d.energy = 3; if (d.food < 25) d.bond = Math.max(0, d.bond - 4);
    if (d.pregnant && --d.pregnant.days <= 0) birth(d);
  }
  for (const e of G.horses) e.refresh();
  S.sold = []; G.studs = makeStuds(S.day); refreshMarket();
  const hungry = S.horses.filter((d) => d.food < 30).length;
  ui.toast(`Tag ${S.day}` + (hungry ? ` · ${hungry} Pferd(e) haben Hunger!` : ''), hungry ? 'bad' : '');
  G.save();
}
function passHours(hrs) { const S = G.state; while (hrs > 1e-6) { const st = Math.min(hrs, 24 - S.time); ageHours(st); S.time += st; hrs -= st; if (S.time >= 24 - 1e-6) { S.time = 0; newDay(); } } }
G.sleep = (days) => G.fade(() => { passHours(24 - G.state.time + 7 + (days - 1) * 24); ui.banner(`Tag ${G.state.day} · Guten Morgen`); });

const SPOTS = { ranch: [-8, -6, 0], town: [462, -40, Math.PI / 2], arena: [1, -344, Math.PI] };
function teleport(x, z, hd) {
  const p = G.player;
  if (p.horse) { const h = p.horse; h.pos.x = x; h.pos.z = z; h.heading = hd; h.speed = 0; h.air = 0; h.onGround = true; p.gait = 0; h.place(); p.pos.x = x; p.pos.z = z; }
  else { p.pos.x = x; p.pos.z = z; p.heading = hd; p.place(); const a = G.active; if (a) { a.pos.x = x + Math.cos(hd) * 2.5; a.pos.z = z - Math.sin(hd) * 2.5; a.heading = hd; a.speed = 0; a.mode = 'wait'; a.place(); } }
  G.cam.yaw = hd;
}
G.travel = (k) => G.fade(() => { const s = SPOTS[k]; teleport(s[0], s[1], s[2]); passHours(0.5); ui.banner(LOC[k].name); });

// ---------- Turniere ----------
G.startEvent = (discId, level) => {
  const disc = DISCIPLINES.find((d) => d.id === discId), a = G.active, S = G.state; if (!a) return;
  S.money -= Math.round([400, 900, 1800, 3500, 7000][level] * 0.1); a.d.starts++;
  G.fade(() => {
    a.d.style = disc.style; a.setTack(disc.style); if (G.player.horse !== a) G.player.mount(a); G.player.setStyle(disc.style);
    G.event = new EventRun(G, discId, level); document.body.classList.add('in-event'); G.cam.yaw = a.heading;
  });
};
G.eventDone = (r) => {
  const S = G.state, a = G.active, d = a.d;
  S.money += r.prize; if (r.prize) G.audio.cash();
  if (r.place === 1 && !r.dnf) d.wins++;
  const cur = S.progress[r.disc.id] || 0;
  if (!r.dnf && r.place <= 3 && r.level === cur && cur < 4) { S.progress[r.disc.id] = cur + 1; r.unlocked = cur + 1; }
  const me = r.rows.find((x) => x.you);
  if (!r.dnf && (r.place <= (S.bestPlace || {})[r.disc.id] || !S.best[r.disc.id])) S.best[r.disc.id] = `${r.place}. Platz (${LEVELS[r.level]}) · ${me.text}`;
  const g = r.dnf ? 0.02 : r.place <= 3 ? 0.06 : 0.035, names = [];
  for (const k of r.disc.stats) { d.train[k] = Math.min(1, d.train[k] + g); names.push(STAT_NAMES[k]); }
  d.bond = Math.min(100, d.bond + 3); r.gain = `${d.name}: Training ${names.join(' & ')} +${Math.round(g * 100)}%, Vertrauen +3`;
  G.fade(() => { if (G.event) { G.event.cleanup(); G.event = null; } document.body.classList.remove('in-event'); a.refresh(); teleport(SPOTS.arena[0], SPOTS.arena[1], SPOTS.arena[2]); ui.results(r); G.save(); });
};

// ---------- Interaktion ----------
const POI_TEXT = { stall: 'Stall betreten', market: 'Pferdemarkt ansehen', office: 'Turnier melden' };
function interactions(dt) {
  const p = G.player; G.prompt = ''; let action = null; G.petT -= dt;
  if (!G.event) {
    for (const poi of POIS) if (Math.hypot(p.pos.x - poi.x, p.pos.z - poi.z) < 4.2) { G.prompt = POI_TEXT[poi.id]; action = () => (poi.id === 'stall' ? ui.stable() : poi.id === 'market' ? ui.market() : ui.tournament()); }
    if (!action) {
      if (p.mode === 'ride') { if (Math.abs(p.horse.speed) < 2.5) { G.prompt = 'Absteigen'; action = () => p.dismount(); } }
      else {
        let best = null, bd = 3.3;
        for (const h of G.horses) { const d = Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z); if (d < bd) { bd = d; best = h; } }
        if (best) {
          if (best === G.active) { G.prompt = `${best.d.name} reiten`; action = () => { p.mount(best); G.audio.whinny(); }; }
          else if (best.canRide()) { G.prompt = `${best.d.name} satteln`; action = () => G.saddle(best.d.id); }
          else { G.prompt = `${best.d.name} streicheln`; action = () => { if (G.petT <= 0) { G.petT = 4; best.d.bond = Math.min(100, best.d.bond + 2); ui.toast(`${best.d.name} genießt die Aufmerksamkeit. Vertrauen +2`); G.audio.whinny(); } }; }
        } else if (G.marketHorses.some((h) => Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) < 4)) { G.prompt = POI_TEXT.market; action = () => ui.market(); }
      }
    }
    if (input.hit('KeyH') && G.active && p.horse !== G.active) { const a = G.active; G.audio.whistle(); a.mode = 'come'; const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z); if (d > 250) { a.pos.x = p.pos.x - Math.sin(p.heading) * 45; a.pos.z = p.pos.z - Math.cos(p.heading) * 45; } }
  }
  if (action && input.hit('KeyE', 'Enter')) action();
}

// ---------- Kamera ----------
const focus = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3();
function updateCamera(dt) {
  const c = G.cam, p = G.player, w = app.clientWidth, h = app.clientHeight;
  if (G.preview.on) {
    const pv = G.preview; pv.yaw += dt * 0.25 - input.mdx * 0.008;
    const isH = !!pv.model, y0 = world.heightAt(STAGE.x, STAGE.z), dist = isH ? 3.6 + pv.model.withers * 2.4 : 3.6, ty = isH ? pv.model.withers * 0.62 : 0.95;
    if (isH) { pv.model.root.rotation.y = pv.yaw; animateHorse(pv.model, { speed: 0, gait: 0 }, dt); } else if (pv.hum) { pv.hum.root.rotation.y = pv.yaw; animateHuman(pv.hum, { mode: 'foot', speed: 0 }, dt); }
    camera.position.set(STAGE.x + 0.3 * dist, y0 + ty + dist * 0.2, STAGE.z + dist); camera.lookAt(STAGE.x, y0 + ty, STAGE.z); camera.fov = 38;
    if (w > 760) camera.setViewOffset(w, h, -Math.min(230, w * 0.2), 0, w, h); else camera.setViewOffset(w, h, 0, h * 0.24, w, h);
    camera.updateProjectionMatrix(); focus.set(STAGE.x, y0, STAGE.z); return;
  }
  if (G.mode !== 'play') {
    const t = performance.now() / 1000 * 0.04; camera.position.set(Math.sin(t) * 95 - 10, world.heightAt(0, 0) + 26, Math.cos(t) * 95 + 20); camera.lookAt(-12, world.heightAt(0, 0) + 4, 14); camera.fov = 50; camera.updateProjectionMatrix(); focus.set(0, 3, 0); return;
  }
  const riding = p.mode === 'ride', sp = riding ? Math.abs(p.horse.speed) : p.speed, now = performance.now();
  if (!ui.open) { c.yaw -= input.mdx * 0.0042; c.pitch = clamp(c.pitch + input.mdy * 0.003, -0.25, 1.2); c.zoom = clamp(c.zoom + input.wheel * 0.1, 0.55, 2.2); }
  if (now - input.lastLook > (riding ? 1100 : 2600) && sp > 0.8) c.yaw = dampAngle(c.yaw, p.heading + (riding && p.horse.speed < 0 ? 0 : 0), riding ? 2.6 : 1.1, dt);
  const dist = (riding ? 5.2 + p.horse.model.withers * 1.6 : 4.4) * c.zoom;
  focus.set(p.pos.x, p.y + (riding ? p.horse.model.withers + 0.75 : 1.5), p.pos.z);
  const cp = Math.cos(c.pitch);
  want.set(focus.x - Math.sin(c.yaw) * cp * dist, focus.y + Math.sin(c.pitch) * dist, focus.z - Math.cos(c.yaw) * cp * dist);
  const gy = world.heightAt(want.x, want.z) + 0.45; if (want.y < gy) want.y = gy;
  if (G.camSnap) { camera.position.copy(want); look.copy(focus); G.camSnap = false; }
  else { camera.position.lerp(want, 1 - Math.exp(-dt * 9)); look.lerp(focus, 1 - Math.exp(-dt * 16)); }
  camera.lookAt(look);
  c.fov = damp(c.fov, 55 + clamp(sp / 17, 0, 1) * 15, 3, dt);
  if (Math.abs(camera.fov - c.fov) > 0.05) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
}

// ---------- Hauptschleife ----------
G.togglePhone = () => { if (G.mode !== 'play' || G.event) return; if (ui.open) ui.close(); else ui.phone(); };
document.getElementById('menuBtn').addEventListener('click', () => { G.audio.start(); G.togglePhone(); });
for (const b of document.querySelectorAll('#touch [data-k]')) input.bindButton(b, b.dataset.k);
const joyEl = document.getElementById('joy');
input.onJoy = (on, x, y, dx, dy) => { joyEl.hidden = !on; if (on) { const r = app.getBoundingClientRect(); joyEl.style.left = x - r.left + 'px'; joyEl.style.top = y - r.top + 'px'; joyEl.firstElementChild.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; } };
addEventListener('pointerdown', () => G.audio.start(), { once: false, passive: true });

let last = performance.now(), acc = 0, rideAcc = 0, slowT = 0, fpsT = 0;
function tick(dt, now) {
  const S = G.state, playing = G.mode === 'play' && !G.preview.on;
  input.wantLock = playing && !ui.open;
  if (playing) {
    if (input.hit('Tab', 'KeyM', 'Escape') && (ui.open === 'phone' || !ui.open)) G.togglePhone();
    else if (input.hit('Escape') && ui.open && ui.open !== 'results') ui.close();
  }
  if (playing && !ui.open) {
    const p = G.player, ev = G.event;
    if (!ev) passHours(dt / HOUR);
    const ctrl = p.update(dt, input, G.cam.yaw, ev ? ev.locked : false);
    const cx = camera.position.x, cz = camera.position.z;
    for (const h of G.horses) {
      const d = Math.hypot(h.pos.x - cx, h.pos.z - cz); h.near = d < 70 ? clamp(1.1 - d / 70, 0.12, 1) : 0;
      const vis = d < 420; h.model.root.visible = vis; if (!vis) continue;
      h.update(dt, h === p.horse ? ctrl : null);
    }
    for (const h of G.marketHorses) { const d = Math.hypot(h.pos.x - cx, h.pos.z - cz); h.near = d < 50 ? 0.4 : 0; h.model.root.visible = d < 420; if (d < 420) h.update(dt, null); }
    if (ev) { ev.update(dt); if (ev.rivals && ev.state !== 'run') for (const rv of ev.rivals) rv.h.update(dt, { steer: 0, gait: 0, brake: true }); }
    interactions(dt);
    if (p.horse) {
      const h = p.horse; G.audio.setWind(Math.abs(h.speed));
      if (h.dist - rideAcc > 400) { rideAcc = h.dist; const d = h.d; d.train.stamina = Math.min(1, d.train.stamina + 0.004); d.bond = Math.min(100, d.bond + 0.4); if (h.aGait >= 4) d.train.speed = Math.min(1, d.train.speed + 0.004); h.refresh(); }
    } else G.audio.setWind(0);
    document.body.classList.toggle('riding', p.mode === 'ride');
    acc += dt; if (acc > 45) { acc = 0; G.save(); }
  }
  updateCamera(dt);
  world.updateSky(G.preview.on || !S || G.mode !== 'play' ? 10.5 : S.time, focus, dt);
  G.fx.update(dt);
  const pulse = 0.28 + 0.1 * Math.sin(now / 300); for (const m of world.markers) { m.material.opacity = pulse; m.visible = G.mode === 'play' && !G.event; }
  input.endFrame();
}
// Testhilfe: n Simulationsschritte ohne Rendern
G.sim = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt, performance.now()); };
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  tick(dt, now);
  renderer.render(scene, camera);
  if (G.mode === 'play' && G.player) ui.hud(dt);
  // dauerhaft niedrige Bildrate -> Auflösung, dann Schatten reduzieren
  if (G.mode === 'play' && raw < 0.5) { slowT = raw > 0.045 ? slowT + raw : Math.max(0, slowT - raw * 2); fpsT += raw; if (slowT > 4 && fpsT > 6) { slowT = 0; fpsT = 0; if (!G.lowRes) { G.lowRes = true; G.applyQuality(); } else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; world.sun.castShadow = false; ui.toast('Grafik wurde für flüssigeres Spielen reduziert.'); } } }
}

if (saved) G.state = saved;
G.toTitle();
requestAnimationFrame(frame);
window.gameReady = true;
