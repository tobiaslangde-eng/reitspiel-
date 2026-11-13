// Turniere: Western (Barrel Race, Pole Bending, Reining) und Englisch (Springen, Dressur, Galopprennen, Gelände)
import * as THREE from 'three';
import { clamp, lerp, wrapPi, segDist, rng, pick, fmtTime, TAU } from './util.js';
import { ARENA, TRACK, XC_START } from './world.js';
import { makeHorse, randomName } from './data.js';
import { randomLook, buildHuman } from './human.js';
import { GAIT_NAMES } from './entities.js';

export const DISCIPLINES = [
  { id: 'barrel', name: 'Barrel Race', style: 'western', stats: ['agility', 'speed'], unit: 'time', desc: 'Kleeblatt um drei Tonnen – auf Zeit. Umgeworfene Tonne: +5 Sekunden.' },
  { id: 'pole', name: 'Pole Bending', style: 'western', stats: ['agility', 'obedience'], unit: 'time', desc: 'Slalom durch sechs Stangen und zurück. Fehler: +5 Sekunden.' },
  { id: 'reining', name: 'Reining', style: 'western', stats: ['obedience', 'agility'], unit: 'score', desc: 'Zirkel, Sliding Stop, Spins und Rückwärtsrichten – bewertet von den Richtern.' },
  { id: 'jump', name: 'Springreiten', style: 'english', stats: ['jump', 'agility'], unit: 'faults', desc: 'Acht Hindernisse in der richtigen Reihenfolge. Abwurf: 4 Fehlerpunkte.' },
  { id: 'dressage', name: 'Dressur', style: 'english', stats: ['obedience', 'stamina'], unit: 'pct', desc: 'Reite die Aufgabe in den verlangten Gangarten präzise auf der Linie.' },
  { id: 'race', name: 'Galopprennen', style: 'english', stats: ['speed', 'stamina'], unit: 'place', desc: 'Fünf Gegner auf der Rennbahn. Teile dir die Kraft deines Pferdes ein.' },
  { id: 'xc', name: 'Geländeritt', style: 'english', stats: ['stamina', 'jump'], unit: 'pen', desc: 'Querfeldein über feste Hindernisse durch alle Flaggentore – möglichst in der Bestzeit.' },
];
export const LEVELS = ['E', 'A', 'L', 'M', 'S'];
export const PRIZE = [400, 900, 1800, 3500, 7000];
const RIDERS = ['J. Hartmann', 'L. Becker', 'M. Schulze', 'C. Lindner', 'T. Brandt', 'A. Kessler', 'S. O\'Brien', 'D. Morales', 'K. Jansen', 'E. Dubois', 'R. Walker', 'N. Fischer', 'P. Novak', 'H. Larsen'];

const W = (lx, lz) => [ARENA.x + lx, ARENA.z + lz];
const HDG = (dx, dz) => Math.atan2(dx, dz);

export class EventRun {
  constructor(G, discId, level) {
    this.G = G; this.disc = DISCIPLINES.find((d) => d.id === discId); this.level = level;
    this.grp = new THREE.Group(); G.scene.add(this.grp); this.dis = []; this.falling = [];
    this.state = 'count'; this.count = 3.6; this.t = 0; this.pen = 0; this.msg = ''; this.msgT = 0; this.done = false;
    this.horse = G.active; this.y = G.world.arenaY;
    this.r = rng((Date.now() & 0xffff) + level * 31);
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 26, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.3, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.beacon.visible = false; this.grp.add(this.beacon);
    this.horse.onKnock = (c) => this.knock(c);
    this.prev = { x: 0, z: 0 };
    this['setup_' + discId]();
    this.prev.x = this.horse.pos.x; this.prev.z = this.horse.pos.z;
  }
  // ---- Helfer ----
  mat(c, o = {}) { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o }); this.dis.push(m); return m; }
  add(geo, m, x, y, z) { this.dis.push(geo); const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; this.grp.add(o); return o; }
  place(x, z, heading) { const h = this.horse; h.pos.x = x; h.pos.z = z; h.heading = heading; h.speed = 0; h.air = 0; h.vy = 0; h.onGround = true; h.stamina = 100; h.tired = false; h.slide = false; h.steer = 0; this.G.player.gait = 0; h.place(); this.G.snapCam(); }
  setBeacon(x, z) { if (x == null) { this.beacon.visible = false; return; } this.beacon.visible = true; this.beacon.position.set(x, this.G.world.heightAt(x, z) + 13, z); this.tx = x; this.tz = z; }
  say(m, t = 2.5) { this.msg = m; this.msgT = t; }
  line(x1, z1, x2, z2, color, w = 0.25, y = 0.03) { const l = Math.hypot(x2 - x1, z2 - z1), g = new THREE.PlaneGeometry(w, l); g.rotateX(-Math.PI / 2); const m = this.add(g, this.mat(color, { roughness: 1 }), (x1 + x2) / 2, this.G.world.heightAt((x1 + x2) / 2, (z1 + z2) / 2) + y + 0.06, (z1 + z2) / 2); m.rotation.y = Math.atan2(x2 - x1, z2 - z1); m.castShadow = false; return m; }
  crossed(g) { // g: {x,z,nx,nz,hw} -> 1 / -1 / 0
    const p = this.horse.pos, d0 = (this.prev.x - g.x) * g.nx + (this.prev.z - g.z) * g.nz, d1 = (p.x - g.x) * g.nx + (p.z - g.z) * g.nz;
    if ((d0 < 0) === (d1 < 0)) return 0;
    const lat = (p.x - g.x) * -g.nz + (p.z - g.z) * g.nx;
    return Math.abs(lat) < g.hw ? (d1 >= 0 ? 1 : -1) : 0;
  }
  knock(c) {
    if (c.off || this.state !== 'run') return; c.off = true;
    this.falling.push({ o: c.obj, vy: 0, t: 0, kind: c.kind });
    this.G.audio.fault(); this.G.audio.thud(0.5);
    if (c.kind === 'rail') { this.pen += 4; this.say('Abwurf! +4 Fehler'); } else { this.pen += 5; this.say((c.kind === 'barrel' ? 'Tonne' : 'Stange') + ' umgeworfen! +5 s'); }
  }
  dynCircle(x, z, r, h, obj, kind) { const c = { t: 0, x, z, r, h, knock: !!kind, obj, kind }; this.G.world.dyn.push(c); return c; }
  hud() { return {}; }

  update(dt) {
    const G = this.G, h = this.horse;
    if (this.msgT > 0) this.msgT -= dt;
    for (const f of this.falling) { f.t += dt; if (f.kind === 'rail') { f.vy -= 9.8 * dt; f.o.position.y = Math.max(f.o.userData.gy + 0.06, f.o.position.y + f.vy * dt); f.o.rotation.y += dt * 0.6 * (f.t < 0.6 ? 1 : 0); } else f.o.rotation.x = Math.min(Math.PI / 2, f.o.rotation.x + dt * 4); }
    if (this.state === 'count') {
      const c0 = Math.ceil(this.count); this.count -= dt; const c1 = Math.ceil(this.count);
      if (c1 !== c0 && c1 > 0 && c1 <= 3) G.audio.beep(false);
      if (this.count <= 0) { this.state = 'run'; G.audio.beep(true); this.say('Los!', 1.2); }
    } else if (this.state === 'run') {
      this.t += dt;
      this['tick_' + this.disc.id](dt);
      if (this.t > 300 && !this.done) this.finish(null);
    }
    this.prev.x = h.pos.x; this.prev.z = h.pos.z;
    if (this.beacon.visible) this.beacon.material.opacity = 0.22 + 0.1 * Math.sin(performance.now() / 200);
  }
  get locked() { return this.state !== 'run'; }

  // score: Zeit/Fehler/Punkte je nach Disziplin; null = ausgeschieden
  finish(score, extra = '') {
    if (this.done) return; this.done = true; this.state = 'end';
    const G = this.G, u = this.disc.unit, lv = this.level, r = this.r;
    const asc = u !== 'score' && u !== 'pct';
    const ai = () => {
      const q = r() + r() - 1;
      switch (this.disc.id) {
        case 'barrel': return 34.5 - lv * 2.3 + q * 3.5;
        case 'pole': return 47 - lv * 2.8 + q * 4;
        case 'reining': return 67.3 + lv * 1.0 + q * 2;
        case 'jump': { const f = 4 * Math.floor(Math.pow(r(), 1.4) * (3.6 - lv * 0.45)); return f + (this.allowed * (0.8 + r() * 0.18)) / 1000; }
        case 'dressage': return 59 + lv * 2.6 + q * 4.5;
        case 'xc': return Math.max(0, Math.round((q + 0.6) * (34 - lv * 6) * 2.5) / 2.5);
        default: return 0;
      }
    };
    let rows;
    const me = { name: G.state.player.name, horse: this.horse.d.name, you: true, score };
    if (u === 'place') rows = this.order.map((o) => (o.you ? me : { name: o.name, horse: o.horse, score: o.time }));
    else {
      rows = [me]; const names = RIDERS.slice().sort(() => r() - 0.5);
      for (let i = 0; i < 7; i++) rows.push({ name: names[i], horse: randomName(r() < 0.5 ? 'Stute' : 'Hengst', r), score: ai() });
      rows.sort((a, b) => (a.score == null ? 1 : b.score == null ? -1 : asc ? a.score - b.score : b.score - a.score));
    }
    const place = rows.indexOf(me) + 1;
    const fmt = (s) => s == null ? (u === 'place' ? '–' : 'ausgeschieden') : u === 'time' ? fmtTime(s) + ' s' : u === 'score' ? s.toFixed(1) + ' Pkt.' : u === 'pct' ? s.toFixed(2).replace('.', ',') + ' %' : u === 'faults' ? `${Math.floor(s + 1e-6)} Fehler · ${(((s % 1) * 1000)).toFixed(2)} s` : u === 'pen' ? s.toFixed(1) + ' Strafpkt.' : fmtTime(s);
    rows.forEach((x) => { x.text = fmt(x.score); });
    const prize = score == null && u !== 'place' ? 0 : Math.round(PRIZE[lv] * ([1, 0.6, 0.4, 0.2][place - 1] || 0));
    setTimeout(() => G.eventDone({ disc: this.disc, level: lv, rows, place, prize, extra, dnf: score == null && u !== 'place' }), 1400);
    if (place <= 3 && prize) G.audio.fanfare();
  }
  cleanup() {
    const G = this.G; G.scene.remove(this.grp); for (const d of this.dis) d.dispose(); G.world.dyn.length = 0; this.horse.onKnock = null;
    if (this.rivals) for (const rv of this.rivals) { rv.h.rider = null; G.scene.remove(rv.human.root); rv.human.dispose(); rv.h.dispose(); }
  }

  // ================= Barrel Race =================
  startLine(lx) { const [x, z] = W(lx, 0); this.gate = { x, z, nx: -1, nz: 0, hw: 9 }; this.line(x, z - 9, x, z + 9, '#f4f4f4', 0.3); this.started = false; }
  barrelMesh(x, z) {
    const g = new THREE.Group(); g.position.set(x, this.y, z); this.grp.add(g);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), this.mat('#2a5fa8', { roughness: 0.4, metalness: 0.4 })); b.position.y = 0.45; b.castShadow = true; g.add(b); this.dis.push(b.geometry);
    for (const yy of [0.25, 0.65]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.08, 16), this.mat('#f0f0f0')); s.position.y = yy; g.add(s); this.dis.push(s.geometry); }
    return g;
  }
  setup_barrel() {
    this.startLine(38);
    this.barrels = [[14, 12], [14, -12], [-24, 0]].map(([lx, lz]) => { const [x, z] = W(lx, lz); const o = this.barrelMesh(x, z); this.dynCircle(x, z, 0.3, 1.0, o, 'barrel'); return { x, z, acc: 0, last: null, done: false }; });
    const [x, z] = W(44, 0); this.place(x, z, -Math.PI / 2); this.setBeacon(this.barrels[0].x, this.barrels[0].z);
    this.task = 'Umrunde alle drei Tonnen und reite zurück durchs Ziel';
  }
  tick_barrel() {
    const p = this.horse.pos, c = this.crossed(this.gate);
    if (!this.started) { this.t = 0; if (c === 1) { this.started = true; } return; }
    for (const b of this.barrels) {
      const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
      if (d < 15 && !b.done) { const a = Math.atan2(dz, dx); if (b.last != null) b.acc += wrapPi(a - b.last); b.last = a; if (Math.abs(b.acc) > 4.0) { b.done = true; this.G.audio.good(); const n = this.barrels.find((q) => !q.done); if (n) this.setBeacon(n.x, n.z); else { this.setBeacon(this.gate.x, this.gate.z); this.say('Ab nach Hause!'); } } } else if (d >= 15) b.last = null;
    }
    if (c === -1 && this.barrels.every((b) => b.done)) this.finish(this.t + this.pen);
  }
  hud_barrel() { return { main: this.started ? fmtTime(this.t) : '0.00', sub: `Tonnen ${this.barrels.filter((b) => b.done).length}/3` + (this.pen ? ` · +${this.pen} s` : '') }; }

  // ================= Pole Bending =================
  setup_pole() {
    this.startLine(38);
    this.poles = [20, 12, 4, -4, -12, -20].map((lx) => { const [x, z] = W(lx, 0); const g = new THREE.Group(); g.position.set(x, this.y, z); this.grp.add(g); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 8), this.mat('#f2f2f2')); p.position.y = 0.95; p.castShadow = true; g.add(p); this.dis.push(p.geometry); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 12), this.mat('#c8281e')); b.position.y = 0.04; g.add(b); this.dis.push(b.geometry); this.dynCircle(x, z, 0.06, 1.9, g, 'pole'); return x; });
    this.seq = [5, 4, 3, 2, 1, 0, -1, 0, 1, 2, 3, 4, 5]; this.k = 0;
    const [x, z] = W(44, 6); this.place(x, z, -Math.PI / 2); this.poleBeacon();
    this.task = 'Am Stangenfeld vorbei, um die letzte Stange, im Slalom zurück und wieder hin';
  }
  poleBeacon() { if (this.k >= this.seq.length) return this.setBeacon(this.gate.x, this.gate.z); const r = this.seq[this.k], lx = r < 0 ? 25 : r >= 5 ? -25 : 16 - 8 * r; const [x, z] = W(lx, 0); this.setBeacon(x, z); }
  tick_pole() {
    const p = this.horse.pos, c = this.crossed(this.gate);
    if (!this.started) { this.t = 0; if (c === 1) this.started = true; return; }
    const z0 = ARENA.z;
    if ((this.prev.z - z0 < 0) !== (p.z - z0 < 0) && Math.abs(p.x - ARENA.x) < 34 && this.k < this.seq.length) {
      const reg = this.poles.filter((px) => px > p.x).length - 1;
      if (reg === this.seq[this.k]) { this.k++; this.G.audio.click(); }
      else { let j = -1; for (let q = this.k + 1; q < Math.min(this.seq.length, this.k + 4); q++) if (this.seq[q] === reg) { j = q; break; } if (j > 0) { this.pen += 5 * (j - this.k); this.k = j + 1; this.say('Stange ausgelassen! +5 s'); this.G.audio.fault(); } }
      this.poleBeacon();
    }
    if (c === -1 && this.k >= this.seq.length) this.finish(this.t + this.pen);
  }
  hud_pole() { return { main: this.started ? fmtTime(this.t) : '0.00', sub: `Durchgänge ${this.k}/${this.seq.length}` + (this.pen ? ` · +${this.pen} s` : '') }; }

  // ================= Reining =================
  setup_reining() {
    const R = 20; this.rc = W(0, 0);
    this.cg = []; for (let i = 1; i <= 8; i++) { const a = i / 8 * TAU; this.cg.push(W(Math.sin(a) * R, Math.cos(a) * R)); }
    for (let i = 0; i < 32; i++) { const a = i / 32 * TAU, b = (i + 0.5) / 32 * TAU; const p = W(Math.sin(a) * R, Math.cos(a) * R), q = W(Math.sin(b) * R, Math.cos(b) * R); this.line(p[0], p[1], q[0], q[1], '#f4f4f4', 0.2); }
    const b0 = W(24, -8), b1 = W(44, 8); this.box = [b0[0], b1[0], b0[1], b1[1]];
    for (const [a, b, c, d] of [[24, -8, 44, -8], [24, 8, 44, 8], [24, -8, 24, 8], [44, -8, 44, 8]]) { const p = W(a, b), q = W(c, d); this.line(p[0], p[1], q[0], q[1], '#e0a030', 0.3); }
    const s = W(0, R); this.place(s[0], s[1], Math.PI / 2);
    this.step = 0; this.gi = 0; this.pts = []; this.dev = 0; this.devN = 0; this.cant = 0; this.spinAcc = 0; this.back = 0; this.maxV = 0;
    this.setBeacon(this.cg[0][0], this.cg[0][1]);
  }
  tick_reining(dt) {
    const h = this.horse, p = h.pos, G = this.G;
    const next = (pt, msg) => { this.pts.push(clamp(pt, -1.5, 1.5)); this.step++; G.audio.good(); this.say(`${msg}: ${pt >= 0 ? '+' : ''}${pt.toFixed(1)}`); };
    if (this.step === 0) {
      this.task = 'Großer Zirkel im Galopp – bleib auf der Linie';
      const d = Math.hypot(p.x - this.rc[0], p.z - this.rc[1]); this.dev += Math.abs(d - 20); this.devN++; if (h.aGait >= 3) this.cant++;
      const g = this.cg[this.gi]; if (Math.hypot(p.x - g[0], p.z - g[1]) < 6) { this.gi++; if (this.gi >= 8) { next(1.5 - (this.dev / this.devN) * 0.7 - (this.cant / this.devN < 0.7 ? 1 : 0), 'Zirkel'); const w = W(-40, 0); this.setBeacon(w[0], w[1]); } else this.setBeacon(this.cg[this.gi][0], this.cg[this.gi][1]); }
    } else if (this.step === 1) {
      this.task = 'Reite zum Marker am Ende der Bahn';
      if (Math.hypot(p.x - this.tx, p.z - this.tz) < 7) { this.step++; this.setBeacon((this.box[0] + this.box[1]) / 2, (this.box[2] + this.box[3]) / 2); this.maxV = 0; }
    } else if (this.step === 2) {
      this.task = 'Rundown im Renngalopp – im gelben Feld Sliding Stop (X / Stopp halten)';
      if (!h.slide && h.speed > this.maxV) this.maxV = h.speed; if (h.slide) this.slid = true;
      const inBox = p.x > this.box[0] && p.x < this.box[1] && p.z > this.box[2] && p.z < this.box[3];
      if (h.speed < 0.25 && this.maxV > 4 && (inBox || p.x > this.box[0] - 6)) { next((inBox ? 0 : -1.2) + (this.slid ? clamp((this.maxV - 8) / 3.5, -0.5, 1.5) : -1), 'Sliding Stop'); this.setBeacon(null); this.h0 = h.heading; }
      else if (p.x > this.box[1] + 3) { next(-1.5, 'Stop verpasst'); this.setBeacon(null); }
    } else if (this.step === 3) {
      this.task = `4 Spins nach links (A halten) – dann anhalten · ${(Math.abs(this.spinAcc) / TAU).toFixed(1)} / 4`;
      if (h.aGait === 0 || Math.abs(h.speed) < 0.5) this.spinAcc += h.yawRate * dt;
      if (Math.abs(this.spinAcc) > TAU * 3.2 && Math.abs(h.yawRate) < 0.12) { const err = Math.abs(Math.abs(this.spinAcc) - TAU * 4); next(1.5 - (err / (Math.PI / 2)) * 1.5, 'Spins'); this.bx = p.x; this.bz = p.z; this.bh = h.heading; }
    } else if (this.step === 4) {
      this.task = `Rückwärtsrichten (S halten) · ${this.back.toFixed(1)} / 4 m`;
      if (h.speed < -0.1) this.back = Math.hypot(p.x - this.bx, p.z - this.bz);
      if (this.back >= 4) { next(Math.abs(wrapPi(h.heading - this.bh)) < 0.2 ? 0.8 : -0.5, 'Rückwärts'); const sc = 70 + this.pts.reduce((a, b) => a + b, 0) + (h.stats.obedience - 50) / 50 * 0.6; this.finish(Math.round(sc * 2) / 2); }
    }
  }
  hud_reining() { return { main: (70 + this.pts.reduce((a, b) => a + b, 0)).toFixed(1), sub: `Manöver ${Math.min(4, this.pts.length + 1)}/4` }; }

  // ================= Springreiten =================
  setup_jump() {
    const H = [0.8, 0.95, 1.1, 1.25, 1.4][this.level];
    const defs = [[22, 20, -1, 0], [-6, 20, -1, 0], [-34, 4, 0, -1], [-12, -20, 1, 0], [14, -20, 1, 0], [36, -4, 0, 1], [14, 6, -1, 0], [-14, 2, -1, 0]];
    const cols = ['#c8281e', '#2a5fa8', '#2f7d3a', '#e0a030'];
    let len = 22, px = 42, pz = 24;
    this.jumps = defs.map(([lx, lz, nx, nz], i) => {
      const [x, z] = W(lx, lz), hw = 1.9, tx = -nz, tz = nx, col = cols[i % 4], gy = this.y;
      len += Math.hypot(lx - px, lz - pz); px = lx; pz = lz;
      const g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = Math.atan2(tx, tz) + Math.PI / 2; this.grp.add(g);
      const sg = new THREE.BoxGeometry(0.16, H + 0.6, 0.16); this.dis.push(sg);
      for (const s of [-1, 1]) { const st = new THREE.Mesh(sg, this.mat('#f4f4f4')); st.position.set(s * hw, (H + 0.6) / 2, 0); st.castShadow = true; g.add(st); this.dynCircle(x + tx * s * hw, z + tz * s * hw, 0.14, 99); const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, H + 0.2, 0.08), this.mat(col)); w.position.set(s * (hw + 0.35), (H + 0.2) / 2, 0); g.add(w); this.dis.push(w.geometry); }
      const rails = [];
      const rg = new THREE.CylinderGeometry(0.05, 0.05, hw * 2, 8); rg.rotateZ(Math.PI / 2); this.dis.push(rg);
      for (let k = 0; k < (H > 1 ? 3 : 2); k++) { const rl = new THREE.Group(); rl.position.y = H - k * 0.32; rl.userData.gy = 0; g.add(rl); for (let q = 0; q < 5; q++) { const seg = new THREE.Mesh(rg, this.mat(q % 2 ? '#f4f4f4' : col)); seg.scale.x = 0.2; seg.position.x = (q - 2) * hw * 0.4; seg.castShadow = true; rl.add(seg); } rails.push(rl); }
      const c = { t: 1, x1: x - tx * (hw - 0.2), z1: z - tz * (hw - 0.2), x2: x + tx * (hw - 0.2), z2: z + tz * (hw - 0.2), h: H - 0.32, knock: true, obj: rails[0], kind: 'rail' }; this.G.world.dyn.push(c);
      const num = this.numSprite(i + 1); num.position.set(x + tx * (hw + 0.4), gy + H + 1.1, z + tz * (hw + 0.4)); this.grp.add(num);
      return { x, z, nx, nz, hw, c };
    });
    this.next = 0; this.allowed = Math.round(len / 5.6 + 5); this.clear = 0;
    const [x, z] = W(42, 24); this.place(x, z, -Math.PI / 2); this.setBeacon(this.jumps[0].x, this.jumps[0].z);
    this.task = `Hindernisse 1–8 in Reihenfolge · Höhe ${H.toFixed(2).replace('.', ',')} m · Leertaste = Absprung`;
  }
  numSprite(n) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#111'; x.beginPath(); x.arc(32, 32, 30, 0, TAU); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, 32, 35);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.SpriteMaterial({ map: t }); this.dis.push(t, m); const s = new THREE.Sprite(m); s.scale.setScalar(0.9); return s;
  }
  tick_jump() {
    const j = this.jumps[this.next];
    if (j && this.crossed(j)) {
      if (!j.c.off) { this.G.audio.good(); this.clear++; }
      this.next++;
      if (this.next >= this.jumps.length) { const tf = Math.max(0, Math.ceil((this.t - this.allowed) / 2)); this.finish(this.pen + tf + this.t / 1000, tf ? `${tf} Zeitfehler` : ''); this.setBeacon(null); }
      else this.setBeacon(this.jumps[this.next].x, this.jumps[this.next].z);
    }
  }
  hud_jump() { return { main: fmtTime(this.t), sub: `Hindernis ${Math.min(8, this.next + 1)}/8 · ${this.pen} Fehler · erlaubt ${this.allowed} s` }; }

  // ================= Dressur =================
  setup_dressage() {
    const col = { 1: '#3a8fe0', 2: '#3fae5a', 3: '#e08a30' };
    const letters = { A: [32, 0], C: [-32, 0], B: [0, -11.5], E: [0, 11.5], K: [24, 11.5], H: [-24, 11.5], M: [-24, -11.5], F: [24, -11.5] };
    for (const [a, b, c, d] of [[-30, -10, 30, -10], [-30, 10, 30, 10], [-30, -10, -30, 10], [30, -10, 30, -3], [30, 3, 30, 10]]) { const p = W(a, b), q = W(c, d), l = Math.hypot(q[0] - p[0], q[1] - p[1]); const g = new THREE.BoxGeometry(Math.abs(c - a) || 0.08, 0.3, Math.abs(d - b) || 0.08); this.add(g, this.mat('#f4f4f4'), (p[0] + q[0]) / 2, this.y + 0.15, (p[1] + q[1]) / 2); void l; }
    for (const k in letters) { const [x, z] = W(...letters[k]); const s = this.letter(k); s.position.set(x, this.y + 1.1, z); this.grp.add(s); }
    const T = (x, z, gait, text) => ({ p: W(x, z), gait, text });
    this.moves = [T(0, 0, 2, 'Einreiten im Trab bis X'), { halt: 3, text: 'Bei X halten und grüßen' }, T(-27, 0, 2, 'Im Trab zu C'), T(-27, -8.5, 2, 'Bei C linke Hand, Trab'), T(0, -8.5, 2, 'Trab bis B'), T(27, -8.5, 1, 'Ab B Mittelschritt'), T(27, 8.5, 1, 'Schritt an der kurzen Seite'), T(-27, 8.5, 3, 'Lange Seite im Galopp'), T(-27, 0, 2, 'Zum Trab durchparieren'), T(0, 0, 2, 'Auf die Mittellinie, Trab bis X'), { halt: 3, text: 'Halten und grüßen' }];
    let prev = W(40, 0);
    for (const m of this.moves) if (m.p) { this.line(prev[0], prev[1], m.p[0], m.p[1], col[m.gait], 0.22, 0.02); m.from = prev; prev = m.p; }
    this.xp = W(0, 0); this.mi = 0; this.mt = 0; this.q = 0; this.qn = 0; this.ht = 0;
    this.place(prev = W(40, 0)[0], W(40, 0)[1], -Math.PI / 2); this.setBeacon(this.moves[0].p[0], this.moves[0].p[1]);
  }
  letter(ch) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#f4f4f4'; x.fillRect(4, 4, 56, 56); x.fillStyle = '#111'; x.font = 'bold 44px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 32, 35); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.SpriteMaterial({ map: t }); this.dis.push(t, m); const s = new THREE.Sprite(m); s.scale.setScalar(1.2); return s; }
  tick_dressage(dt) {
    const h = this.horse, p = h.pos, m = this.moves[this.mi]; if (!m) return;
    this.mt += dt;
    const adv = () => { this.mi++; this.mt = 0; this.G.audio.click(); const n = this.moves[this.mi]; if (!n) { const avg = this.q / Math.max(1, this.qn); this.finish(Math.round((44 + 36 * avg + (h.stats.obedience - 50) * 0.09) * 100) / 100); this.setBeacon(null); } else if (n.p) this.setBeacon(n.p[0], n.p[1]); };
    if (m.halt) {
      this.task = `${m.text} · ${Math.max(0, m.halt - this.ht).toFixed(1)} s`;
      const d = Math.hypot(p.x - this.xp[0], p.z - this.xp[1]);
      if (Math.abs(h.speed) < 0.15 && d < 4.5) { this.ht += dt; if (this.ht >= m.halt) { this.q += clamp(1 - d / 4.5, 0, 1) * 60; this.qn += 60; this.ht = 0; adv(); } }
      else if (this.mt > 14) { this.qn += 60; adv(); }
    } else {
      this.task = `${m.text} · verlangt: ${GAIT_NAMES[m.gait]}`;
      const dev = segDist(p.x, p.z, m.from[0], m.from[1], m.p[0], m.p[1])[0];
      const ok = h.aGait === m.gait || this.mt < 2.8;
      this.q += (ok ? 1 : 0.3) * clamp(1 - dev / (3.4 - this.level * 0.3), 0, 1); this.qn++; this.gaitOk = h.aGait === m.gait;
      if (Math.hypot(p.x - m.p[0], p.z - m.p[1]) < 2.6) adv();
    }
  }
  hud_dressage() { const avg = this.q / Math.max(1, this.qn); return { main: (44 + 36 * avg).toFixed(1).replace('.', ',') + ' %', sub: `Lektion ${Math.min(this.moves.length, this.mi + 1)}/${this.moves.length}` + (this.moves[this.mi] && this.moves[this.mi].p ? (this.gaitOk ? ' · Gangart ✓' : ' · Gangart ✗') : '') }; }

  // ================= Galopprennen =================
  setup_race() {
    const G = this.G, T = TRACK, wld = G.world, r = this.r;
    this.laps = this.level >= 3 ? 2 : 1; this.total = T.len * this.laps; this.s0 = T.sl + 40;
    const zin = T.cz + T.r - T.w / 2, zout = T.cz + T.r + T.w / 2;
    wld.dyn.push({ t: 1, x1: -7, z1: zin, x2: 7, z2: zin, h: 1.1 }, { t: 1, x1: -7, z1: zout, x2: 7, z2: zout, h: 1.1 });
    this.rivals = []; this.order = [];
    const breeds = ['vollblut', 'vollblut', 'araber', 'achal', 'trakehner', 'quarter'];
    const lanes = [-5, -3, -1, 1, 3, 5], mine = 2 + Math.floor(r() * 2);
    let li = 0;
    for (let i = 0; i < 6; i++) {
      const pt = wld.trackPoint(this.s0 - 3, lanes[i]);
      if (i === mine) { this.place(pt[0], pt[1], HDG(pt[2], pt[3])); this.me = { prog: -3, last: this.s0 - 3, lane: lanes[i] }; continue; }
      const d = makeHorse({ rand: r, breed: breeds[li++ % breeds.length], age: 5 + Math.floor(r() * 4), train: 0.9 });
      d.pot.speed = clamp(46 + this.level * 11 + (r() - 0.5) * 12, 30, 100); d.pot.stamina = clamp(55 + this.level * 8 + (r() - 0.5) * 16, 30, 100); d.train.speed = d.train.stamina = 1; d.food = d.clean = 100;
      const h = G.spawnHorse(d, { x: pt[0], z: pt[1], heading: HDG(pt[2], pt[3]), mode: 'race', tack: 'english' });
      const human = buildHuman(randomLook(r), 'english'); G.scene.add(human.root); h.rider = human;
      this.rivals.push({ h, human, prog: -3, last: this.s0 - 3, lane: lanes[i], name: RIDERS[(i * 3 + this.level) % RIDERS.length], kick: 180 + r() * 220, pace: 0.9 + r() * 0.1 });
    }
    this.task = `${this.laps === 1 ? 'Eine Runde' : 'Zwei Runden'} (${Math.round(this.total)} m) · Shift = Treiben, kostet Ausdauer`;
    this.G.player.gait = 0;
  }
  advance(o, pos) { const [s, lat] = this.G.world.trackProgress(pos.x, pos.z); let d = s - o.last; const L = TRACK.len; if (d > L / 2) d -= L; if (d < -L / 2) d += L; if (Math.abs(d) < 30 && Math.abs(lat) < 9.5) o.prog += d; o.last = s; o.lat = lat; return s; }
  tick_race(dt) {
    const G = this.G, wld = G.world;
    this.advance(this.me, this.horse.pos);
    if (Math.abs(this.me.lat) > 9.5) this.say('Zurück auf die Bahn!', 0.5);
    if (this.me.prog >= this.total && !this.me.fin) { this.me.fin = true; this.order.push({ you: true }); }
    for (const rv of this.rivals) {
      const h = rv.h, s = this.advance(rv, h.pos);
      if (rv.prog >= this.total && !rv.fin) { rv.fin = true; this.order.push({ name: rv.name, horse: h.d.name, time: this.t }); }
      const tp = wld.trackPoint(s + 11, rv.lane * (rv.fin ? 1 : 0.8)), remain = this.total - rv.prog;
      const steer = clamp(wrapPi(Math.atan2(tp[0] - h.pos.x, tp[1] - h.pos.z) - h.heading) * 2.5, -1, 1);
      const kick = remain < rv.kick && h.stamina > 4;
      h.update(dt, { steer, gait: rv.fin ? 2 : 4, sprint: kick || (h.stamina > 70 && remain > 400 && Math.sin(this.t * 0.4 + rv.lane) > 0.5), maxSpeed: rv.fin ? 4 : kick ? 99 : h.vmax * rv.pace });
    }
    if (this.me.fin) {
      const all = this.order.slice();
      for (const rv of this.rivals.filter((x) => !x.fin).sort((a, b) => b.prog - a.prog)) all.push({ name: rv.name, horse: rv.h.d.name, time: null });
      this.order = all; this.finish(this.t);
    }
  }
  hud_race() { const pos = 1 + this.rivals.filter((r) => r.prog > this.me.prog).length; return { main: `Platz ${pos}/6`, sub: `${fmtTime(this.t)} · noch ${Math.max(0, Math.round(this.total - this.me.prog))} m` }; }
  frozenRivals(dt) { if (this.rivals) for (const rv of this.rivals) rv.h.update(dt, { steer: 0, gait: 0 }); }

  // ================= Geländeritt =================
  setup_xc() {
    const G = this.G; this.gates = G.world.xcGates.map((g) => ({ x: g.x, z: g.z, nx: g.dx, nz: g.dz, hw: g.hw }));
    let len = 0, px = XC_START.x, pz = XC_START.z; for (const g of this.gates) { len += Math.hypot(g.x - px, g.z - pz); px = g.x; pz = g.z; }
    this.opt = Math.round(len / (6.6 + this.level * 0.45)); this.next = 0; this.ref = 0; this.lastBlock = null;
    this.place(XC_START.x, XC_START.z, XC_START.heading); this.setBeacon(this.gates[0].x, this.gates[0].z);
    this.task = `Reite durch alle ${this.gates.length} Flaggentore · Bestzeit ${fmtTime(this.opt)}`;
  }
  tick_xc() {
    const h = this.horse, g = this.gates[this.next];
    if (h.blocked && h.blocked !== this.lastBlock && h.blocked.t === 1 && h.blocked.h < 2 && Math.hypot(h.pos.x - g.x, h.pos.z - g.z) < 6) { this.ref++; this.pen += 20; this.say('Verweigerung! +20'); this.G.audio.fault(); }
    this.lastBlock = h.blocked;
    if (this.crossed(g)) {
      this.next++; this.G.audio.good();
      if (this.next >= this.gates.length) { const tp = Math.max(0, this.t - this.opt) * 0.4; this.finish(Math.round((this.pen + tp) * 10) / 10, `Zeit ${fmtTime(this.t)}`); this.setBeacon(null); }
      else this.setBeacon(this.gates[this.next].x, this.gates[this.next].z);
    }
  }
  hud_xc() { return { main: fmtTime(this.t), sub: `Tor ${Math.min(this.gates.length, this.next + 1)}/${this.gates.length} · ${this.pen} Strafpkt. · Bestzeit ${fmtTime(this.opt)}` }; }
}
export { pick, lerp };
