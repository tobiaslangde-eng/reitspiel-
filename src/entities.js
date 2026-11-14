// Pferde (Physik + Verhalten) und Spielfigur
import * as THREE from 'three';
import { clamp, lerp, damp, wrapPi, dampAngle, TAU } from './util.js';
import { buildHorse, animateHorse } from './horseModel.js';
import { buildHuman, animateHuman } from './human.js';
import { statOf, STATS, RIDE_AGE } from './data.js';
import { PADDOCK } from './world.js';

export const GAIT_NAMES = ['Halt', 'Schritt', 'Trab', 'Galopp', 'Renngalopp'];
const V = new THREE.Vector3(), Q = new THREE.Quaternion();

export class Horse {
  constructor(G, data, o = {}) {
    this.G = G; this.d = data; this.pos = { x: o.x || 0, z: o.z || 0 }; this.heading = o.heading ?? Math.random() * TAU;
    this.speed = 0; this.vy = 0; this.air = 0; this.onGround = true; this.stamina = 100; this.tired = false; this.yawRate = 0; this.steer = 0;
    this.slide = false; this.mode = o.mode || 'paddock'; this.ai = { t: Math.random() * 8, st: 'graze', tx: 0, tz: 0, graze: 0 };
    this.rider = null; this.tack = o.tack || null; this.jumpV0 = 5; this.aGait = 0; this.dist = 0; this.area = o.area || PADDOCK;
    this.build();
  }
  build() {
    const old = this.model;
    this.model = buildHorse(this.d, { tack: this.tack });
    if (old) { this.model.anim.phase = old.anim.phase; this.G.scene.remove(old.root); old.dispose(); }
    this.G.scene.add(this.model.root); this.builtAge = this.d.age; this.builtStyle = this.tack;
    this.refresh(); this.place();
  }
  setTack(t) { if (t !== this.tack) { this.tack = t; this.build(); } }
  refresh() {
    const s = this.stats = {}; for (const k of STATS) s[k] = statOf(this.d, k);
    const sizeK = this.sizeK = clamp(this.model.withers / 1.58, 0.5, 1.12);
    this.vmax = (10.3 + s.speed * 0.078) * lerp(0.62, 1, clamp((sizeK - 0.5) / 0.5, 0, 1));
    this.gs = [0, 1.75 * sizeK, 4.1 * sizeK, (6.6 + s.speed * 0.012) * sizeK, this.vmax * 0.8];
    this.jumpH = 0.72 + s.jump * 0.0115;
    this.radius = 0.5 * sizeK;
  }
  place() { const r = this.model.root; this.y = this.G.world.heightAt(this.pos.x, this.pos.z) + this.air; r.position.set(this.pos.x, this.y, this.pos.z); r.rotation.y = this.heading; }
  dispose() { this.G.scene.remove(this.model.root); this.model.dispose(); }
  canRide() { return this.d.age >= RIDE_AGE; }

  // Verhalten ohne Reiter -> Steuerbefehl
  think(dt) {
    const a = this.ai, c = { steer: 0, gait: 0 };
    const goto = (tx, tz, gait, stop = 1.5) => { const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz); if (d < stop) return true; c.steer = clamp(wrapPi(Math.atan2(dx, dz) - this.heading) * 2.2, -1, 1); c.gait = Math.abs(c.steer) > 0.9 && gait > 2 ? 2 : gait; return false; };
    a.t -= dt;
    if (this.mode === 'come') {
      const p = this.G.player.pos, d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (goto(p.x, p.z, d > 30 ? 4 : d > 12 ? 3 : d > 6 ? 2 : 1, 2.8)) { this.mode = 'wait'; }
    } else if (this.mode === 'paddock') {
      const A = this.area, foal = this.d.age < 1.5;
      if (a.st === 'graze') {
        if (a.t <= 0) {
          a.st = 'walk'; a.t = 20; a.g = foal && Math.random() < 0.45 ? 3 : Math.random() < 0.12 ? 2 : 1;
          const m = foal && this.mother && this.G.horseById(this.mother);
          if (m && Math.random() < 0.6) { a.tx = m.pos.x + (Math.random() - 0.5) * 9; a.tz = m.pos.z + (Math.random() - 0.5) * 9; } else { a.tx = lerp(A.x0 + 4, A.x1 - 4, Math.random()); a.tz = lerp(A.z0 + 4, A.z1 - 4, Math.random()); }
          a.tx = clamp(a.tx, A.x0 + 3, A.x1 - 3); a.tz = clamp(a.tz, A.z0 + 3, A.z1 - 3);
        }
      } else if (goto(a.tx, a.tz, a.g, 2) || a.t <= 0) { a.st = 'graze'; a.t = (foal ? 3 : 8) + Math.random() * (foal ? 8 : 22); a.gz = Math.random() < 0.75; }
    }
    a.graze = damp(a.graze, this.mode === 'paddock' && a.st === 'graze' && a.gz && this.speed < 0.1 ? 1 : 0, 2, dt);
    return c;
  }

  // c: { steer, gait, sprint, brake, back, jump }
  update(dt, c) {
    const G = this.G, W = G.world, st = this.stats;
    if (!c) c = this.think(dt);
    const west = this.tack === 'western';
    let g = c.gait || 0;
    if (this.stamina <= 0) this.tired = true; else if (this.stamina > 22) this.tired = false;
    if (this.tired && g > 2) g = 2;
    let target = this.gs[g]; if (g === 4 && c.sprint && !this.tired) target = this.vmax;
    if (c.back && g === 0) target = -1.3;
    if (c.maxSpeed != null) target = Math.min(target, c.maxSpeed);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const slope = W.slopeAt(this.pos.x, this.pos.z, fx, fz);
    if (target > 0) target *= clamp(1 - slope * 1.1, 0.5, 1.08);
    const depth = W.waterDepth(this.pos.x, this.pos.z);
    if (depth > 0.15) target = Math.min(target, depth > 0.8 ? 2.2 : 5);
    if (this.onGround) {
      if (c.brake && this.speed > 6.5 && west) this.slide = true;
      if (this.slide && (this.speed < 0.4 || !c.brake)) this.slide = false;
      const acc = target > this.speed ? 2.0 + st.agility * 0.034 : this.slide ? 8.5 : c.brake ? 6.5 : 3.4;
      this.speed = target > this.speed ? Math.min(target, this.speed + acc * dt) : Math.max(target, this.speed - acc * dt);
    }
    // Lenken: begrenzte Querbeschleunigung
    this.steer = damp(this.steer, clamp(c.steer || 0, -1, 1), 5 + st.obedience * 0.09, dt);
    const sp = Math.abs(this.speed);
    let w;
    const spin = sp < 0.5 && g === 0 && !c.back;
    if (spin) w = this.steer * (west ? 1.5 + st.agility * 0.032 : 1.15);
    else w = this.steer * Math.min(1.75, (5.2 + st.agility * 0.052) / Math.max(sp, 0.6)) * (this.slide ? 0.2 : 1);
    if (!this.onGround) w *= 0.12;
    this.yawRate = w; this.heading += w * dt;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += fx * this.speed * dt; this.pos.z += fz * this.speed * dt;
    const res = { knock: [] };
    if (W.collide(this.pos, this.radius, this.air * 1.3, res)) { const into = -(fx * res.nx + fz * res.nz) * Math.sign(this.speed || 1); if (into > 0.35) { this.speed *= Math.max(0, 1 - dt * 9 * into); this.blocked = res.col; this.blockT = 0.3; } }
    if (this.blockT > 0) { this.blockT -= dt; if (this.blockT <= 0) this.blocked = null; }
    if (res.knock.length && this.onKnock) for (const k of res.knock) this.onKnock(k);
    const rr = Math.hypot(this.pos.x, this.pos.z); if (rr > 850) { this.pos.x *= 850 / rr; this.pos.z *= 850 / rr; }
    this.dist += Math.hypot(this.pos.x - ox, this.pos.z - oz);
    // Sprung
    if (c.jump && this.onGround && this.speed > 2 && !this.slide) { this.vy = this.jumpV0 = Math.sqrt(2 * 9.81 * this.jumpH * (c.jumpK || 1)); this.onGround = false; if (this.near) G.audio.thud(0.35); }
    if (!this.onGround) { this.vy -= 9.81 * dt; this.air += this.vy * dt; if (this.air <= 0) { this.air = 0; this.onGround = true; this.speed *= 0.93; if (this.near) G.audio.thud(0.6); G.fx && G.fx.dust(this.pos.x, this.y, this.pos.z, 6); } }
    // Ausdauer
    const moving = sp > 0.5;
    const drain = !moving ? -3.2 : this.aGait >= 4 ? (c.sprint && sp > this.gs[4] * 1.02 ? 4.0 : 1.25) : this.aGait === 3 ? 0.45 : this.aGait === 2 ? -1.1 : -2.8;
    this.stamina = clamp(this.stamina - (drain > 0 ? drain * (1.4 - st.stamina / 100) : drain) * dt, 0, 100);
    const gs = this.gs;
    this.aGait = sp < 0.12 ? 0 : sp < gs[1] * 1.4 ? 1 : sp < (gs[2] + gs[3]) * 0.5 ? 2 : sp < (gs[3] + gs[4]) * 0.5 ? 3 : 4;
    this.place();
    const roll = clamp(-this.speed * w / 9.81 * 0.55, -0.32, 0.32);
    const hits = animateHorse(this.model, { speed: this.speed, gait: this.aGait, air: { on: !this.onGround, k: clamp(this.vy / this.jumpV0, -1, 1) }, slide: this.slide, graze: this.ai.graze, yawRate: w, roll, slope: -Math.atan(slope) * 0.85, collected: this.tack === 'english' && !!this.rider && st.obedience > 55, spin: spin && Math.abs(w) > 0.25, far: !this.near }, dt);
    if (this.near) {
      if (hits.length && this.onGround) { const vol = clamp(0.1 + sp * 0.03, 0.1, 0.5) * this.near; for (let i = 0; i < hits.length; i++) depth > 0.1 ? G.audio.splash() : G.audio.hoof(vol, W.roadDist(this.pos.x, this.pos.z) < 3.6); if (G.fx && (sp > 9 || this.slide)) G.fx.dust(this.pos.x - fx * 0.6, this.y, this.pos.z - fz * 0.6, 1); }
      if (this.slide && G.fx) G.fx.dust(this.pos.x - fx, this.y, this.pos.z - fz, 2);
    }
    if (this.rider) this.seatRider(dt, c);
    if (this.model.tack) this.updateReins();
  }
  seatRider(dt, c) {
    const m = this.model, h = this.rider;
    m.root.updateMatrixWorld(true);
    m.seat.getWorldPosition(h.root.position); m.seat.getWorldQuaternion(h.root.quaternion);
    animateHuman(h, { mode: 'ride', gait: this.aGait, phase: m.anim.phase * (this.aGait === 2 ? 1 : 1), air: !this.onGround, slide: this.slide }, dt);
    h.root.updateMatrixWorld(true);
  }
  updateReins() {
    const m = this.model, p = m.tack.reins.geometry.attributes.position, r = m.root;
    if (!this.rider) r.updateMatrixWorld(true);
    const put = (i, v) => { r.worldToLocal(v); p.setXYZ(i, v.x, v.y, v.z); };
    put(0, m.bits[0].getWorldPosition(V)); put(4, m.bits[1].getWorldPosition(V));
    if (this.rider) {
      const A = this.rider.arms, west = this.tack === 'western';
      put(1, A[west ? 0 : 0].hand.getWorldPosition(V)); put(3, A[west ? 0 : 1].hand.getWorldPosition(V));
      p.setXYZ(2, (p.getX(1) + p.getX(3)) / 2, (p.getY(1) + p.getY(3)) / 2 - 0.02, (p.getZ(1) + p.getZ(3)) / 2);
    } else { const y = m.withers + 0.04, z = 0.42 * m.S; p.setXYZ(1, -0.05, y, z); p.setXYZ(2, 0, y + 0.01, z - 0.05); p.setXYZ(3, 0.05, y, z); }
    p.needsUpdate = true;
  }
}

export class Player {
  constructor(G, look) {
    this.G = G; this.pos = { x: -8, z: 2 }; this.heading = 0; this.speed = 0; this.mode = 'foot'; this.horse = null; this.gait = 0; this.style = 'western';
    this.setLook(look, 'western');
  }
  setLook(look, style) {
    this.look = look; this.style = style || this.style;
    const old = this.human; this.human = buildHuman(look, this.style);
    if (old) { this.G.scene.remove(old.root); old.dispose(); }
    this.G.scene.add(this.human.root); if (this.horse) this.horse.rider = this.human; this.place();
  }
  setStyle(s) { if (s !== this.style) this.setLook(this.look, s); }
  place() { const r = this.human.root; this.y = this.G.world.heightAt(this.pos.x, this.pos.z); r.position.set(this.pos.x, this.y, this.pos.z); r.rotation.set(0, this.heading, 0); }
  mount(h) {
    this.horse = h; this.mode = 'ride'; h.rider = this.human; h.mode = 'ridden'; this.gait = 0; this.setStyle(h.tack || 'western'); h.rider = this.human; this.human.anim.hy = 0.1;
  }
  dismount() {
    const h = this.horse; if (!h) return;
    h.rider = null; h.mode = 'wait'; this.mode = 'foot'; this.horse = null;
    const side = h.heading + Math.PI / 2; this.pos.x = h.pos.x + Math.sin(side) * 1.3; this.pos.z = h.pos.z + Math.cos(side) * 1.3; this.heading = h.heading; this.human.anim.hy = 0.95;
    this.human.root.quaternion.identity(); this.place();
  }
  // liefert beim Reiten den Steuerbefehl für das Pferd
  update(dt, inp, camYaw, locked) {
    const G = this.G;
    if (this.mode === 'ride') {
      const h = this.horse; this.pos.x = h.pos.x; this.pos.z = h.pos.z; this.heading = h.heading; this.y = h.y;
      if (locked) return { steer: 0, gait: 0, brake: true };
      if (inp.hit('KeyW', 'ArrowUp', 'GaitUp')) this.gait = Math.min(4, this.gait + 1);
      if (inp.hit('KeyS', 'ArrowDown', 'GaitDown')) this.gait = Math.max(0, this.gait - 1);
      const stop = inp.held('KeyX', 'Stop'); if (stop) this.gait = 0;
      if (h.tired && this.gait > 2) this.gait = 2;
      const jy = inp.joy.y;
      return { steer: (inp.held('KeyA', 'ArrowLeft') ? 1 : 0) - (inp.held('KeyD', 'ArrowRight') ? 1 : 0) - inp.joy.x, gait: this.gait, sprint: inp.held('ShiftLeft', 'ShiftRight', 'Sprint'), brake: stop, back: this.gait === 0 && (inp.held('KeyS', 'ArrowDown', 'GaitDown') || jy > 0.6) && h.speed < 0.3, jump: inp.hit('Space', 'Jump') };
    }
    let mx = locked ? 0 : inp.axisX(), my = locked ? 0 : inp.axisY();
    const l = Math.hypot(mx, my);
    const run = inp.held('ShiftLeft', 'ShiftRight', 'Sprint') || l > 0.92 && inp.touch;
    let tv = 0;
    if (l > 0.15) {
      const a = camYaw + Math.atan2(mx, my);
      this.heading = dampAngle(this.heading, a, 12, dt); tv = (run ? 5 : 1.9) * Math.min(1, l);
    }
    this.speed = damp(this.speed, tv, 10, dt);
    this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt;
    G.world.collide(this.pos, 0.32, 0);
    if (G.world.waterDepth(this.pos.x, this.pos.z) > 1.1) { this.pos.x -= Math.sin(this.heading) * this.speed * dt; this.pos.z -= Math.cos(this.heading) * this.speed * dt; }
    this.place();
    animateHuman(this.human, { mode: 'foot', speed: this.speed }, dt);
    return null;
  }
}

// einfache Staubpartikel
export class Dust {
  constructor(scene) {
    this.n = 90; this.i = 0; this.p = [];
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    for (let i = 0; i < this.n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: '#c9b592', transparent: true, opacity: 0, depthWrite: false })); s.visible = false; scene.add(s); this.p.push({ s, life: 0, vx: 0, vy: 0, vz: 0 }); }
  }
  dust(x, y, z, n = 1) {
    for (let k = 0; k < n; k++) { const p = this.p[this.i = (this.i + 1) % this.n]; p.life = 1; p.s.visible = true; p.s.position.set(x + (Math.random() - 0.5) * 0.6, y + 0.15, z + (Math.random() - 0.5) * 0.6); p.vx = (Math.random() - 0.5) * 1.2; p.vy = 0.5 + Math.random() * 0.8; p.vz = (Math.random() - 0.5) * 1.2; p.s.scale.setScalar(0.4); }
  }
  update(dt) { for (const p of this.p) { if (p.life <= 0) continue; p.life -= dt * 1.1; const s = p.s; if (p.life <= 0) { s.visible = false; continue; } s.position.x += p.vx * dt; s.position.y += p.vy * dt; s.position.z += p.vz * dt; s.scale.setScalar(0.4 + (1 - p.life) * 1.8); s.material.opacity = p.life * 0.4; } }
}
