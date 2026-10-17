import * as THREE from 'three';
import { heightAt, ARENA } from '../world/terrain.js';
import { fence, barrel, sign, boxGeo, woodMat, log, lantern } from '../world/props.js';
import { arenaStands } from '../world/buildings.js';
import { NPC } from '../world/town.js';
import { mat, shadowAll, rand, formatMoney, canvasTexture, wrapAngle } from '../core/utils.js';
import { esc } from '../ui/ui.js';

const AX = ARENA.x, AZ = ARENA.z;
const AW = 30, AD = 18; // half extents

export const DISCIPLINES = {
  barrel: { name: 'Barrel Racing', icon: '🛢️', desc: 'Umrunde die drei Tonnen im Kleeblatt-Muster (rechts, links, hinten) und galoppiere zurück. Jede umgeworfene Tonne: +5 Sekunden.', unit: 's', lowerBetter: true },
  poles: { name: 'Pole Bending', icon: '🚩', desc: 'Slalom durch die sechs Stangen – hin und zurück, immer abwechselnd links und rechts vorbei. Umgeworfene oder ausgelassene Stange: +5 Sekunden.', unit: 's', lowerBetter: true },
  reining: { name: 'Reining', icon: '🌀', desc: 'Reite die angesagten Manöver: Zirkel, Spins (C halten), Sliding Stop (X aus dem Galopp) und Rückwärtsrichten (S). Die Richter vergeben Punkte.', unit: 'Pkt', lowerBetter: false },
  trail: { name: 'Trail', icon: '🌉', desc: 'Meistere den Hindernisparcours: Sprung, Stangen im Schritt, Brücke, Rückwärts-L, Drehung und Halten. Fehler kosten Punkte.', unit: 'Pkt', lowerBetter: false },
};
export const TIERS = [
  { name: 'Anfänger', fee: 20, prizes: [150, 90, 50], need: 0 },
  { name: 'Fortgeschritten', fee: 50, prizes: [350, 200, 100], need: 1 },
  { name: 'Profi', fee: 100, prizes: [800, 450, 250], need: 3 },
];
const NPC_RANGES = {
  barrel: [[19, 24], [15.5, 19], [12.8, 15.5]],
  poles: [[30, 36], [24, 29], [20, 24]],
  reining: [[64, 69], [68, 72.5], [72, 76]],
  trail: [[62, 78], [75, 87], [85, 94]],
};
const RIVALS = ['Jenny & Dakota', 'Cole & Smokey', 'Mia & Bella', 'Sam & Rusty', 'Lilly & Sierra', 'Joe & Bandit', 'Ava & Luna', 'Ben & Thunder'];

function sandTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c8a878'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { const v = Math.random(); g.fillStyle = `rgba(${v < 0.5 ? '120,90,60' : '240,220,180'},${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(110,80,50,0.12)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 0, 2); g.stroke(); }
  }, { repeat: true });
}

export class Competitions {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.course = [];
    this.y0 = heightAt(AX, AZ);
    this.build();
    this.crowd = [];
    this.buildCrowd();
    this.dolly = new NPC(game, { name: 'Dolly', portrait: '👱‍♀️', x: AX - AW - 3, z: AZ + 4, heading: Math.PI / 2, role: 'rodeo', outfit: { hat: 'hat_white', shirt: 'shirt_turq', vest: 'vest_suede', pants: 'pants_jeans', boots: 'boots_turq', scarf: 'scarf_pink', hair: 'hair_blonde' } });
    game.onBridge = (p) => this.bridgeZone && Math.abs(p.x - this.bridgeZone.x) < this.bridgeZone.hw && Math.abs(p.z - this.bridgeZone.z) < this.bridgeZone.hd;
  }

  build() {
    const g = this.game;
    const y = this.y0;
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(AW * 2, AD * 2), new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 }));
    sand.material.map.repeat.set(6, 4);
    sand.rotation.x = -Math.PI / 2; sand.position.set(AX, y + 0.06, AZ); sand.receiveShadow = true;
    g.scene.add(sand);
    const pts = [[AX - AW, AZ - AD], [AX + AW, AZ - AD], [AX + AW, AZ + AD], [AX - AW, AZ + AD], [AX - AW, AZ - AD]].map(([x, z]) => [x, y, z]);
    g.scene.add(fence(pts, { colliders: g.colliders, height: 1.7, rails: 4, white: true, gateAt: 3 }));
    const stands = arenaStands(40);
    stands.position.set(AX, y, AZ - AD - 2); g.scene.add(stands);
    this.flags = []; stands.traverse((o) => { if (o.userData.flag) this.flags.push(o); });
    g.colliders.addBox(AX, AZ - AD - 4, 20, 2.5);
    const s = sign('DUSTY CREEK RODEO', 8, 1.3); s.position.set(AX, y + 5, AZ - AD - 6.5); g.scene.add(s);
    // announcer booth
    const booth = new THREE.Group();
    const b = new THREE.Mesh(boxGeo(3, 2.4, 3), woodMat(0x9a5a3a)); b.position.y = 3.6; booth.add(b);
    for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) { const l = new THREE.Mesh(boxGeo(0.2, 2.4, 0.2), woodMat(0x5a3a22)); l.position.set(x, 1.2, z); booth.add(l); }
    const roof = new THREE.Mesh(boxGeo(3.6, 0.2, 3.6), woodMat(0x4a3a30, 'shingles')); roof.position.y = 4.9; booth.add(roof);
    shadowAll(booth);
    booth.position.set(AX + AW + 4, y, AZ - AD + 2); g.scene.add(booth);
    g.colliders.addBox(AX + AW + 4, AZ - AD + 2, 1.6, 1.6);
    for (const [x, z] of [[AX - AW - 1, AZ - 6], [AX - AW - 1, AZ + 6], [AX + AW + 1, AZ + AD]]) { const l = lantern(); l.position.set(x, y, z); g.scene.add(l); }
    this.banner = s;
  }

  buildCrowd() {
    const g = this.game;
    const cols = [0xc03030, 0x3060c0, 0xe0c040, 0x40a060, 0xf0f0f0, 0x8040a0, 0xe08040];
    for (let i = 0; i < 26; i++) {
      const p = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 3, 6), mat(cols[i % cols.length]));
      body.position.y = 0.45; p.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xe8b898)); head.position.y = 0.95; p.add(head);
      if (i % 2) { const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 10), mat(0x6b4428)); hat.position.y = 1.07; p.add(hat); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 10), mat(0x6b4428)); c.position.y = 1.14; p.add(c); }
      const row = i % 4;
      p.position.set(AX - 18 + Math.floor(i / 4) * 5.5 + rand(-1, 1), this.y0 + 0.55 + row * 0.5, AZ - AD - 2 - row * 0.8);
      p.visible = false;
      g.scene.add(p);
      this.crowd.push(p);
    }
  }

  // world-space helper relative to arena center
  P(x, z) { return { x: AX + x, z: AZ + z }; }

  // ------------------------------------------------------------------ course setup
  clearCourse() {
    for (const o of this.course) { this.game.scene.remove(o.obj || o); if (o.col) this.game.colliders.remove(o.col); }
    this.course = [];
    this.bridgeZone = null;
    if (this.ring) this.ring.visible = false;
  }

  addObj(obj, x, z, rot = 0, col = null) {
    obj.position.set(AX + x, this.y0 + 0.04, AZ + z); obj.rotation.y = rot;
    this.game.scene.add(obj);
    this.course.push({ obj, col });
    return obj;
  }

  setupBarrel() {
    this.barrels = [];
    const spots = [[-9, -2], [9, -2], [0, 12]];
    for (const [x, z] of spots) {
      const b = barrel(0x2a6aa8);
      this.addObj(b, x, z);
      this.barrels.push({ obj: b, x: AX + x, z: AZ + z, knocked: false, angle: 0, last: null });
    }
    this.startLine = { z: AZ - 14 };
    this.lineMarker(-14);
  }

  setupPoles() {
    this.poles = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 8), mat(i % 2 ? 0xffffff : 0xd02020));
      p.position.y = 1; g.add(p);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.12, 12), mat(0x222222)); g.add(base);
      shadowAll(g);
      const z = -8 + i * 4.6;
      this.addObj(g, 0, z);
      this.poles.push({ obj: g, x: AX, z: AZ + z, knocked: false });
    }
    this.lineMarker(-14);
    this.weave = { lastSide: 0, passes: [], prevRel: null, missed: 0 };
  }

  setupReining() {
    this.lineMarker(-14);
    // markers for the judges
    for (const x of [-12, 12]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), mat(0xff8020)); c.position.y = 0.4; this.addObj(c, x, 0); }
    const pattern = [
      { k: 'circle', dir: 1, label: 'Großer Zirkel links (Galopp, 1 Runde)' },
      { k: 'circle', dir: -1, label: 'Großer Zirkel rechts (Galopp, 1 Runde)' },
      { k: 'spin', dir: -1, label: 'Spins rechts – C + D halten (4 Drehungen)' },
      { k: 'spin', dir: 1, label: 'Spins links – C + A halten (4 Drehungen)' },
      { k: 'slide', label: 'Run-Down & Sliding Stop (Galopp, dann X)' },
      { k: 'backup', label: 'Rückwärtsrichten (S, 4 Meter)' },
    ];
    this.reining = { pattern: Math.random() < 0.5 ? pattern : [pattern[1], pattern[0], pattern[3], pattern[2], pattern[4], pattern[5]], step: 0, scores: [], acc: 0, stepT: 0, speedSum: 0, n: 0, backDist: 0 };
  }

  setupTrail() {
    const g = this.game;
    // 1 jump log
    const lg = log(4, 0.25); this.addObj(lg, -14, -4, Math.PI / 2);
    const col1 = g.colliders.addSegment(AX - 14, AZ - 6, AX - 14, AZ - 2, 0.5, this.y0 + 0.5, 'jump');
    this.course[this.course.length - 1].col = col1;
    // 2 walk-over poles
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 8), mat(i % 2 ? 0xffffff : 0x2050c0)); p.rotation.z = Math.PI / 2; p.position.y = 0.08; const gg = new THREE.Group(); gg.add(p); this.addObj(gg, -2 + i * 1.0, 8, Math.PI / 2); }
    // 3 bridge
    const br = new THREE.Group();
    const deck = new THREE.Mesh(boxGeo(1.8, 0.25, 6), woodMat(0x8a6a44)); deck.position.y = 0.12; br.add(deck);
    for (let i = 0; i < 12; i++) { const plank = new THREE.Mesh(boxGeo(1.9, 0.04, 0.4), woodMat(0x7a5a34)); plank.position.set(0, 0.26, -2.75 + i * 0.5); br.add(plank); }
    shadowAll(br);
    this.addObj(br, 14, -4);
    this.bridgeZone = { x: AX + 14, z: AZ - 4, hw: 1.2, hd: 3.2 };
    // 4 back-up L
    const lpts = [[8, 10], [8, 15], [12, 15]];
    for (let i = 0; i < lpts.length - 1; i++) {
      const [x0, z0] = lpts[i], [x1, z1] = lpts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 8), mat(0xd0a030)); p.rotation.z = Math.PI / 2;
      const gg = new THREE.Group(); gg.add(p); p.position.y = 0.08;
      this.addObj(gg, (x0 + x1) / 2, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0));
    }
    // 5 spin box, 6 stop box (painted squares)
    for (const [x, z, c] of [[-12, 12, 0xff8020], [0, -12, 0x20a060]]) {
      const sq = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 4, 1), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      sq.rotation.x = -Math.PI / 2; sq.rotation.z = Math.PI / 4; sq.position.y = 0.05;
      const gg = new THREE.Group(); gg.add(sq); this.addObj(gg, x, z);
    }
    this.trail = {
      step: 0, pen: 0, holdT: 0, spin: 0, back: 0, lastHeading: null, airborneSeen: false,
      stations: [
        { k: 'jump', x: -14, z: -4, label: 'Springe über den Baumstamm (Leertaste)' },
        { k: 'bridge', x: 14, z: -4, label: 'Überquere die Brücke im Schritt' },
        { k: 'poles', x: -0.5, z: 8, label: 'Über die Stangen – nur im Schritt!' },
        { k: 'backup', x: 10, z: 12.5, label: 'Richte rückwärts durch das L (S halten)' },
        { k: 'spin', x: -12, z: 12, label: 'Eine ganze Drehung im Quadrat (C halten)' },
        { k: 'stop', x: 0, z: -12, label: 'Halte 3 Sekunden still im grünen Quadrat' },
      ],
    };
    if (!this.ring) {
      this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffe080 }));
      this.ring.rotation.x = Math.PI / 2;
      g.scene.add(this.ring);
    }
    this.ring.visible = true;
  }

  lineMarker(z) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(AW * 2 - 2, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    l.rotation.x = -Math.PI / 2;
    const gg = new THREE.Group(); gg.add(l); l.position.y = 0.03;
    this.addObj(gg, 0, z);
  }

  // ------------------------------------------------------------------ flow
  openMenu() {
    const g = this.game, s = g.state;
    s.rodeo = s.rodeo || { wins: 0 };
    g.ui.openPanel('Dusty Creek Rodeo', (el, refresh) => {
      el.innerHTML = `<p>Willkommen beim Rodeo! Wähle Disziplin und Klasse. Kontostand: <b>${formatMoney(s.money)}</b> · Siege: ${s.rodeo.wins}</p><div class="grid"></div>`;
      const grid = el.querySelector('.grid');
      for (const [k, d] of Object.entries(DISCIPLINES)) {
        const c = document.createElement('div');
        c.className = 'card';
        const best = s.rodeo['best_' + k];
        c.innerHTML = `<h3>${d.icon} ${d.name}</h3><div class="desc">${d.desc}</div>${best !== undefined ? `<div class="muted">Bestleistung: ${best.toFixed(1)} ${d.unit}</div>` : ''}<div class="row"></div>`;
        TIERS.forEach((t, i) => {
          const b = document.createElement('button');
          b.className = 'btn small' + (i === 0 ? ' gold' : '');
          const locked = s.rodeo.wins < t.need;
          b.textContent = locked ? `🔒 ${t.name} (${t.need} Siege)` : `${t.name} · $${t.fee}`;
          b.disabled = locked;
          b.onclick = () => { g.ui.closePanel(); this.start(k, i); };
          c.querySelector('.row').appendChild(b);
        });
        grid.appendChild(c);
      }
    });
  }

  start(kind, tierIdx, practice = false) {
    const g = this.game;
    const tier = TIERS[tierIdx];
    let h = g.player.horse;
    if (!h) {
      const near = g.horses.find((x) => !x.data.wild && x.pos.distanceTo(g.player.pos) < 25 && !g.player.canRide(x));
      if (!near) { g.ui.toast('Du brauchst dein Pferd! Pfeife (H) und steig auf.'); return; }
      g.player.mount(near); h = near;
    }
    if (!practice && !g.spend(tier.fee)) return;
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    setTimeout(() => {
      this.clearCourse();
      ({ barrel: () => this.setupBarrel(), poles: () => this.setupPoles(), reining: () => this.setupReining(), trail: () => this.setupTrail() })[kind]();
      const st = this.P(0, -16);
      h.setPosition(st.x, st.z, 0);
      h.speed = 0; h.maneuver = null; h.stamina = h.maxStamina();
      g.followCam.yaw = Math.PI;
      this.active = { kind, tierIdx, t: 0, phase: 'countdown', cd: 3.5, penalty: 0, practice, started: false, horse: h };
      this.crowd.forEach((c) => (c.visible = true));
      g.audio.setMood('rodeo');
      fade.classList.remove('on');
      g.ui.banner(`${DISCIPLINES[kind].icon} ${DISCIPLINES[kind].name}`, practice ? 'Training' : `Klasse: ${tier.name}`, 2.5);
    }, 700);
  }

  abort(msg = 'Abgebrochen.') {
    const g = this.game;
    this.active = null;
    this.clearCourse();
    this.crowd.forEach((c) => (c.visible = false));
    g.ui.eventHud(null);
    g.ui.toast(msg);
  }

  update(dt) {
    const g = this.game;
    const near = this.dolly.pos.distanceTo(g.player.position) < 140;
    if (near) this.dolly.update(dt, g.player.position);
    for (const f of this.flags) f.rotation.y = Math.sin(g.time * 3 + f.position.x) * 0.3;
    const a = this.active;
    if (!a) return;
    const h = a.horse;
    if (g.player.horse !== h) { this.abort('Turnier abgebrochen – du bist abgestiegen.'); return; }
    // crowd bobbing
    this.crowd.forEach((c, i) => { c.position.y += Math.sin(g.time * 6 + i) * 0.004; });
    if (a.phase === 'countdown') {
      h.speed = 0;
      a.cd -= dt;
      const n = Math.ceil(a.cd - 0.5);
      if (n !== a.lastN) { a.lastN = n; if (n > 0) { g.ui.eventHud(`${n}`); g.audio.click(); } else { g.ui.eventHud('LOS!'); g.audio.bell(); } }
      if (a.cd <= 0.5) a.phase = 'run';
      return;
    }
    if (a.phase !== 'run') return;
    const p = h.pos;
    if (Math.abs(p.x - AX) > AW + 4 || Math.abs(p.z - AZ) > AD + 4) { this.abort('Du hast die Arena verlassen – disqualifiziert!'); return; }
    switch (a.kind) {
      case 'barrel': this.runBarrel(dt, a, h); break;
      case 'poles': this.runPoles(dt, a, h); break;
      case 'reining': this.runReining(dt, a, h); break;
      case 'trail': this.runTrail(dt, a, h); break;
      default:
    }
  }

  // ----- Barrel racing
  runBarrel(dt, a, h) {
    const p = h.pos;
    if (!a.started) {
      if (p.z > AZ - 14) { a.started = true; a.t = 0; }
      else { this.game.ui.eventHud('Reite über die Startlinie!'); return; }
    }
    a.t += dt;
    const idx = this.barrels.findIndex((b) => !b.done);
    for (const b of this.barrels) {
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (!b.knocked && d < 1.05 * h.scale + 0.3) {
        b.knocked = true; a.penalty += 5;
        b.obj.rotation.z = Math.PI / 2; b.obj.position.y += 0.4;
        this.game.ui.toast('💥 Tonne umgeworfen! +5 s'); this.game.audio.hoof('wood', 2, b.obj.position);
      }
    }
    if (idx >= 0) {
      const b = this.barrels[idx];
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      const ang = Math.atan2(p.z - b.z, p.x - b.x);
      if (d < 7) {
        if (b.last !== null) b.angle += wrapAngle(ang - b.last);
        b.last = ang;
        if (Math.abs(b.angle) > Math.PI * 1.65) { b.done = true; this.game.audio.click(); }
      } else { b.last = null; b.angle *= 0.98; }
    }
    const left = this.barrels.filter((b) => !b.done).length;
    this.game.ui.eventHud(`⏱️ ${(a.t + a.penalty).toFixed(2)} s<small>${left ? `Umrunde Tonne ${4 - left} von 3` : 'Zurück über die Ziellinie!'}${a.penalty ? ` · Strafzeit +${a.penalty}s` : ''}</small>`);
    if (!left && p.z < AZ - 14) this.finish(a.t + a.penalty);
  }

  // ----- Pole bending
  runPoles(dt, a, h) {
    const p = h.pos;
    if (!a.started) {
      if (p.z > AZ - 14) { a.started = true; a.t = 0; a.leg = 0; }
      else { this.game.ui.eventHud('Reite über die Startlinie!'); return; }
    }
    a.t += dt;
    const w = this.weave;
    for (const pole of this.poles) {
      if (!pole.knocked && Math.hypot(p.x - pole.x, p.z - pole.z) < 0.5 + 0.35 * h.scale) {
        pole.knocked = true; a.penalty += 5; pole.obj.rotation.z = 1.4;
        this.game.ui.toast('💥 Stange umgeworfen! +5 s');
      }
    }
    // record side passes per pole crossing
    const rel = p.z - AZ;
    if (w.prevRel !== null) {
      for (let i = 0; i < this.poles.length; i++) {
        const pz = this.poles[i].z - AZ;
        if ((w.prevRel - pz) * (rel - pz) < 0) {
          const side = Math.sign(p.x - AX) || 1;
          w.passes.push({ i, side, dir: Math.sign(rel - w.prevRel) });
        }
      }
    }
    w.prevRel = rel;
    // legs: 0 = going out (weaving), 1 = coming back (weaving), 2 = run home
    const far = this.poles[this.poles.length - 1].z;
    if (a.leg === 0 && p.z > far + 2) a.leg = 1;
    if (a.leg === 1 && p.z < this.poles[0].z - 2) a.leg = 2;
    this.game.ui.eventHud(`⏱️ ${(a.t + a.penalty).toFixed(2)} s<small>${['Slalom hin', 'Slalom zurück', 'Ab ins Ziel!'][a.leg]}${a.penalty ? ` · +${a.penalty}s` : ''}</small>`);
    if (a.leg === 2 && p.z < AZ - 14) {
      // evaluate weaving: in each direction, consecutive poles must alternate sides
      let missed = 0;
      for (const dir of [1, -1]) {
        const seq = w.passes.filter((x) => x.dir === dir);
        const seen = new Map();
        for (const s of seq) if (!seen.has(s.i)) seen.set(s.i, s.side);
        for (let i = 0; i < this.poles.length; i++) {
          if (!seen.has(i)) { missed++; continue; }
          if (i > 0 && seen.has(i - 1) && seen.get(i - 1) === seen.get(i)) missed++;
        }
      }
      a.penalty += missed * 5;
      if (missed) this.game.ui.toast(`${missed} Stangen nicht korrekt umritten: +${missed * 5} s`);
      this.finish(a.t + a.penalty);
    }
  }

  // ----- Reining
  runReining(dt, a, h) {
    const r = this.reining;
    const g = this.game;
    if (!a.started) {
      a.started = true;
      this.offSpin = g.events.on('horse:spin', ({ data, ridden }) => { if (ridden) this.reiningEvent('spin', data); });
      this.offSlide = g.events.on('horse:slidingStop', ({ data, ridden }) => { if (ridden) this.reiningEvent('slide', data); });
    }
    a.t += dt;
    const step = r.pattern[r.step];
    if (!step) return;
    r.stepT += dt;
    if (step.k === 'circle') {
      const sp = Math.abs(h.speed);
      if (r.lastHeading !== undefined && sp > 3) r.acc += wrapAngle(h.heading - r.lastHeading);
      r.lastHeading = h.heading;
      if (sp > 3) { r.speedSum += sp; r.n++; }
      if (r.acc * step.dir > Math.PI * 2) {
        const avg = r.speedSum / Math.max(1, r.n);
        this.scoreStep(avg > 6.5 ? 1 : avg > 4.5 ? 0.5 : -0.5, avg > 6.5 ? 'Toller, flüssiger Zirkel!' : 'Zirkel etwas langsam.');
      } else if (r.acc * step.dir < -Math.PI * 1.2) this.scoreStep(-1.5, 'Falsche Richtung!');
    } else if (step.k === 'backup') {
      if (h.speed < -0.2) r.backDist += -h.speed * dt;
      if (r.backDist > 4) this.scoreStep(r.stepT < 8 ? 1 : 0.5, 'Sauber rückwärts gerichtet!');
    }
    if (r.stepT > 30) this.scoreStep(-1.5, 'Manöver nicht gezeigt.');
    const total = 70 + r.scores.reduce((x, y) => x + y, 0);
    g.ui.eventHud(`${step.label}<small>Manöver ${r.step + 1}/${r.pattern.length} · Punkte: ${total.toFixed(1)}</small>`);
  }

  reiningEvent(type, data) {
    const r = this.reining;
    const step = r?.pattern[r.step];
    if (!step || !this.active) return;
    if (type === 'spin' && step.k === 'spin') {
      if (data.dir !== step.dir) this.scoreStep(-1, 'Spin in die falsche Richtung!');
      else if (data.turns >= 3.6) this.scoreStep(data.turns > 4.4 ? 0.5 : 1.5, `${data.turns.toFixed(1)} Drehungen – super!`);
      else if (data.turns >= 2) this.scoreStep(0, `${data.turns.toFixed(1)} Drehungen – fast!`);
      else this.scoreStep(-1, 'Zu wenige Drehungen.');
    }
    if (type === 'slide' && step.k === 'slide') {
      const d = data.distance;
      this.scoreStep(d > 7 ? 1.5 : d > 5 ? 1 : d > 3 ? 0 : -1, `Sliding Stop: ${d.toFixed(1)} m`);
    }
  }

  scoreStep(v, msg) {
    const r = this.reining;
    r.scores.push(v);
    this.game.ui.toast(`${v > 0 ? '⭐' : v < 0 ? '❌' : '➖'} ${msg} (${v > 0 ? '+' : ''}${v})`);
    r.step++; r.stepT = 0; r.acc = 0; r.lastHeading = undefined; r.speedSum = 0; r.n = 0; r.backDist = 0;
    if (r.step >= r.pattern.length) {
      this.offSpin?.(); this.offSlide?.();
      this.finish(70 + r.scores.reduce((x, y) => x + y, 0));
    }
  }

  // ----- Trail
  runTrail(dt, a, h) {
    const tr = this.trail;
    const g = this.game;
    a.t += dt;
    const st = tr.stations[tr.step];
    if (!st) return;
    const sx = AX + st.x, sz = AZ + st.z;
    this.ring.position.set(sx, this.y0 + 0.15, sz);
    this.ring.scale.setScalar(1 + Math.sin(g.time * 4) * 0.08);
    const d = Math.hypot(h.pos.x - sx, h.pos.z - sz);
    const sp = Math.abs(h.speed);
    const done = (msg) => { tr.step++; g.audio.click(); g.ui.toast(`✔ ${msg}`); tr.holdT = 0; tr.spin = 0; tr.back = 0; tr.lastHeading = null; tr.airborneSeen = false; };
    const fault = (msg, pts = 5) => { tr.pen += pts; g.ui.toast(`❌ ${msg} (−${pts})`); };
    switch (st.k) {
      case 'jump':
        if (d < 4 && h.airborne) tr.airborneSeen = true;
        if (tr.airborneSeen && !h.airborne) done('Sauber gesprungen!');
        if (h.maneuver?.type === 'refuse' && !tr.refused) { tr.refused = true; fault('Verweigerung'); }
        break;
      case 'bridge':
        if (d < 3) { if (sp > 2.6 && !tr.fastWarn) { tr.fastWarn = true; fault('Zu schnell auf der Brücke'); } tr.holdT += dt; }
        if (tr.holdT > 2.5) done('Brücke gemeistert!');
        break;
      case 'poles':
        if (d < 2.5) { if (sp > 2.6 && !tr.fastPoles) { tr.fastPoles = true; fault('Stangen touchiert – zu schnell'); } tr.holdT += dt; }
        if (tr.holdT > 2) done('Stangen im Schritt überquert!');
        break;
      case 'backup':
        if (d < 4 && h.speed < -0.2) tr.back += -h.speed * dt;
        if (tr.back > 3.5) done('Rückwärts durchs L!');
        break;
      case 'spin':
        if (d < 3) { if (tr.lastHeading !== null) tr.spin += Math.abs(wrapAngle(h.heading - tr.lastHeading)); tr.lastHeading = h.heading; }
        if (tr.spin > Math.PI * 2) done('Ganze Drehung!');
        break;
      case 'stop':
        if (d < 2.4 && sp < 0.2) tr.holdT += dt; else tr.holdT = 0;
        if (tr.holdT > 3) { done('Perfekt gehalten!'); }
        break;
      default:
    }
    const score = Math.max(0, 100 - tr.pen - Math.max(0, a.t - 80) * 0.4);
    g.ui.eventHud(`${st?.label || ''}<small>Station ${Math.min(tr.step + 1, 6)}/6 · Zeit ${a.t.toFixed(0)} s · Punkte ${score.toFixed(1)}</small>`);
    if (tr.step >= tr.stations.length) { this.ring.visible = false; this.finish(score); }
  }

  // ------------------------------------------------------------------ results
  finish(result) {
    const g = this.game, s = g.state;
    const a = this.active;
    a.phase = 'done';
    const disc = DISCIPLINES[a.kind];
    const tier = TIERS[a.tierIdx];
    const [lo, hi] = NPC_RANGES[a.kind][a.tierIdx];
    const field = [];
    const names = RIVALS.slice().sort(() => Math.random() - 0.5).slice(0, 5);
    for (const n of names) field.push({ name: n, v: rand(lo, hi) });
    field.push({ name: `${s.playerName} & ${a.horse.data.name}`, v: result, me: true });
    field.sort((x, y) => (disc.lowerBetter ? x.v - y.v : y.v - x.v));
    const place = field.findIndex((f) => f.me) + 1;
    s.rodeo = s.rodeo || { wins: 0 };
    const bestKey = 'best_' + a.kind;
    if (s.rodeo[bestKey] === undefined || (disc.lowerBetter ? result < s.rodeo[bestKey] : result > s.rodeo[bestKey])) s.rodeo[bestKey] = result;
    let prize = 0;
    if (!a.practice) {
      s.stats.events++;
      if (place <= 3) {
        prize = tier.prizes[place - 1];
        s.trophies.push({ kind: 'ribbon', place, event: disc.name, tier: tier.name, day: s.day, horse: a.horse.data.name, result });
        if (place === 1 || (place === 2 && a.tierIdx === 2)) s.trophies.push({ kind: 'trophy', place, event: disc.name, tier: tier.name, day: s.day, horse: a.horse.data.name, result });
        if (place === 1) { s.rodeo.wins++; s.stats.wins++; }
        g.addMoney(prize, `${place}. Platz ${disc.name}`);
        g.ranch.refreshTrophies();
        a.horse.data.bond = Math.min(100, a.horse.data.bond + 4);
      }
    }
    g.audio[place === 1 ? 'fanfare' : place <= 3 ? 'fanfare' : 'fail']();
    this.cheer(place <= 3);
    g.ui.eventHud(null);
    const medal = ['🥇', '🥈', '🥉'][place - 1] || '🎗️';
    setTimeout(() => {
      g.ui.openPanel(`${disc.icon} Ergebnis: ${disc.name}`, (el) => {
        el.innerHTML = `<div style="text-align:center"><div style="font-size:60px">${medal}</div><h2>${place}. Platz!</h2>
          <p>Dein Ergebnis: <b>${result.toFixed(2)} ${disc.unit}</b>${a.practice ? ' (Training)' : ` · Klasse ${tier.name}`}</p>
          ${prize ? `<p>Preisgeld: <b>${formatMoney(prize)}</b> ${place === 1 ? '+ Pokal und blaue Schleife für deine Vitrine!' : place === 2 ? '+ rote Schleife!' : '+ weiße Schleife!'}</p>` : ''}</div>
          <div class="section-title">Rangliste</div>
          ${field.map((f, i) => `<div class="list-item" style="${f.me ? 'background:rgba(47,163,155,0.2);font-weight:800' : ''}"><span>${i + 1}. ${esc(f.name)}</span><span>${f.v.toFixed(2)} ${disc.unit}</span></div>`).join('')}`;
      }, () => this.endEvent());
    }, 1200);
    g.events.emit('rodeo', { kind: a.kind, place, tier: a.tierIdx, practice: a.practice, result });
  }

  endEvent() {
    this.clearCourse();
    this.crowd.forEach((c) => (c.visible = false));
    this.active = null;
  }

  cheer(big) {
    const au = this.game.audio;
    if (!au.ok()) return;
    const t = au.ctx.currentTime;
    au.noise(t, big ? 3 : 1.5, { freq: 1200, q: 0.5, gain: big ? 0.35 : 0.15, attack: 0.2 });
    for (let i = 0; i < (big ? 8 : 3); i++) au.tone(t + rand(0, 1.5), 0.3, { freq: rand(1800, 2600), freqEnd: rand(1500, 2800), gain: 0.04 });
  }

  // ------------------------------------------------------------------ interactions
  interactables(p) {
    const out = [];
    if (this.active) return out;
    out.push({ x: this.dolly.pos.x, z: this.dolly.pos.z, r: 3.5, label: 'Mit Dolly sprechen (Rodeo-Anmeldung)', action: () => {
      this.game.ui.dialog('Dolly', '👱‍♀️', `Yeehaw, ${esc(this.game.state.playerName)}! Bereit für das Rodeo? Ich erkläre dir gern die Disziplinen.`, [
        { label: 'Zum Turnier anmelden', gold: true, fn: () => this.openMenu() },
        { label: 'Wie funktionieren die Disziplinen?', fn: () => this.game.ui.dialog('Dolly', '👱‍♀️', Object.values(DISCIPLINES).map((d) => `<b>${d.icon} ${d.name}:</b> ${d.desc}`).join('<br>'), [{ label: 'Alles klar!' }]) },
        { label: 'Später' },
      ]);
    } });
    const g = this.game;
    if (g.ranch.has('arena') && p.mode === 'ride') {
      const A = g.ranch.arenaArea();
      out.push({ x: A.x, z: A.z, r: 12, label: 'Barrel-Training auf deinem Reitplatz', action: () => this.practiceAtRanch() });
    }
    return out;
  }

  practiceAtRanch() {
    // A simple timed barrel run on the ranch arena (no prize).
    const g = this.game;
    const A = g.ranch.arenaArea();
    const barrels = g.ranch.arenaBarrels.map((b) => ({ x: b.position.x, z: b.position.z, angle: 0, last: null, done: false }));
    let t = 0, started = false;
    const startZ = A.z - A.d / 2 + 3;
    g.ui.toast('Training: Umrunde alle 3 Tonnen und reite zurück zum Start (Südseite).');
    const timer = setInterval(() => {
      const h = g.player.horse;
      if (!h) { clearInterval(timer); g.ui.eventHud(null); return; }
      const p = h.pos;
      if (Math.abs(p.x - A.x) > A.w / 2 + 6 || Math.abs(p.z - A.z) > A.d / 2 + 6) { clearInterval(timer); g.ui.eventHud(null); g.ui.toast('Training beendet.'); return; }
      if (!started) { if (p.z > startZ) started = true; else return; }
      t += 0.05;
      const b = barrels.find((x) => !x.done);
      if (b) {
        const ang = Math.atan2(p.z - b.z, p.x - b.x);
        if (Math.hypot(p.x - b.x, p.z - b.z) < 7) { if (b.last !== null) b.angle += wrapAngle(ang - b.last); b.last = ang; if (Math.abs(b.angle) > Math.PI * 1.65) b.done = true; } else b.last = null;
      }
      g.ui.eventHud(`⏱️ ${t.toFixed(1)} s<small>Training · ${barrels.filter((x) => x.done).length}/3</small>`);
      if (!barrels.find((x) => !x.done) && p.z < startZ) {
        clearInterval(timer);
        g.ui.eventHud(null);
        g.ui.banner(`⏱️ ${t.toFixed(2)} s`, 'Trainingszeit', 3);
        g.events.emit('practice', t);
        h.data.stats.agility = Math.min(10, h.data.stats.agility + (Math.random() < 0.1 ? 1 : 0));
      }
    }, 50);
  }

  markers() {
    return [{ x: AX, z: AZ, icon: '🏆', size: 14, edge: true }];
  }
}

