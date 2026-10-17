import * as THREE from 'three';
import { buildHorseModel, disposeHorseModel } from './horseModel.js';
import { clamp, lerp, damp, wrapAngle, rand, smoothstep } from '../core/utils.js';
import { heightAt, waterDepthAt, PLAY_LIMIT } from '../world/terrain.js';

// Leg order: FL, FR, HL, HR
export const GAITS = [
  { key: 'stand', name: 'Stehen', speed: 0, freq: 0, amp: 0, knee: 0, duty: 1, offsets: [0, 0, 0, 0] },
  { key: 'walk', name: 'Schritt', speed: 1.7, freq: 0.95, amp: 0.3, knee: 0.6, duty: 0.62, offsets: [0.25, 0.75, 0.0, 0.5] },
  { key: 'trot', name: 'Trab', speed: 3.9, freq: 1.45, amp: 0.4, knee: 1.05, duty: 0.46, offsets: [0.0, 0.5, 0.5, 0.0] },
  { key: 'canter', name: 'Galopp', speed: 7.2, freq: 1.72, amp: 0.55, knee: 1.0, duty: 0.4, offsets: [0.64, 0.34, 0.34, 0.0] },
  { key: 'gallop', name: 'Renngalopp', speed: 11.8, freq: 2.2, amp: 0.72, knee: 1.25, duty: 0.33, offsets: [0.6, 0.5, 0.12, 0.0] },
];

const _v = new THREE.Vector3();

export class Horse {
  constructor(game, data) {
    this.game = game;
    this.data = data;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.vy = 0;
    this.airborne = false;
    this.phase = 0;
    this.animGait = 0;
    this.gaitBlend = 0;
    this.stamina = 100;
    this.exhausted = false;
    this.maneuver = null;
    this.rider = null;
    this.state = 'stand';
    this.stateT = 0;
    this.target = null;
    this.home = null; // {x,z,r}
    this.time = Math.random() * 100;
    this.headDown = 0;
    this.tailSwish = 0;
    this.earT = 0;
    this.pitch = 0;
    this.roll = 0;
    this.leanTurn = 0;
    this.onStep = null;
    this.onEvent = null;
    this.waterDepth = 0;
    this.visible = true;
    this.speedMul = 1;
    this.lastTurn = 0;
    this.tack = null;
    this.build();
  }

  build() {
    if (this.rig) {
      this.game.scene.remove(this.rig.root);
      disposeHorseModel(this.rig);
    }
    this.rig = buildHorseModel(this.data);
    this.game.scene.add(this.rig.root);
    this.applyScale();
    this.applyManeStyle();
    if (this.game.tack) this.game.tack.dress(this);
    this.rig.root.position.copy(this.pos);
  }

  applyScale() {
    const g = this.data.growth ?? 1;
    this.scale = this.rig.dims.size * (0.55 + 0.45 * g);
    this.rig.root.scale.setScalar(this.scale);
  }

  applyManeStyle() {
    const r = this.rig;
    const style = this.data.maneStyle || 'offen';
    const braided = style !== 'offen';
    r.maneGroup.visible = !braided;
    r.braids.visible = braided;
    r.bowGroup.visible = style === 'schleifen';
    r.bowGroup.clear();
    if (style === 'schleifen') {
      const col = this.data.ribbon || 0xd02040;
      const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, side: THREE.DoubleSide });
      r.braids.children.forEach((b) => {
        const bow = new THREE.Group();
        for (const s of [-1, 1]) {
          const loop = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 4, 10), m);
          loop.position.x = s * 0.025; loop.scale.set(1, 0.6, 1);
          loop.rotation.y = Math.PI / 2;
          bow.add(loop);
        }
        bow.position.copy(b.position); bow.position.z -= 0.035;
        r.bowGroup.add(bow);
      });
    }
    // braided tail: slimmer
    const slim = style !== 'offen' && this.data.tailBraid;
    r.tailMeshes.forEach((m) => m.scale.set(slim ? 0.45 : 1, 1, slim ? 0.45 : 1));
  }

  get bond() { return this.data.bond; }
  get obedience() { return 0.55 + clamp(this.data.bond, 0, 100) / 100 * 0.45; }
  get stats() { return this.data.stats; }

  setPosition(x, z, heading = this.heading) {
    this.pos.set(x, heightAt(x, z), z);
    this.heading = heading;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = heading;
  }

  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  maxStamina() { return 70 + this.data.stats.stamina * 6; }

  gaitSpeed(level) {
    const s = this.data.stats;
    const growth = this.data.growth ?? 1;
    let mul = (0.82 + s.speed * 0.04) * (this.data.shoes ? 1.06 : 1) * (0.6 + 0.4 * growth);
    if (this.data.breed === 'shetty') mul *= 0.85;
    return GAITS[level].speed * mul * this.speedMul;
  }

  // ---------------------------------------------------------------------
  // Movement (shared by player-controlled and AI-controlled horses)
  // input: { forward, turn, gait (1..3), sprint, jump, slide, spin }
  // ---------------------------------------------------------------------
  drive(dt, input) {
    const ms = this.maxStamina();
    const agility = this.data.stats.agility;
    const obey = this.obedience;
    this.time += dt;

    // Maneuvers override normal driving
    if (this.maneuver) {
      this.updateManeuver(dt, input);
    } else {
      let level = clamp(input.gait || 1, 1, 3);
      if (input.sprint && level >= 2) level = level === 3 ? 4 : 3;
      if (this.exhausted && level > 2) level = 2;
      if (this.waterDepth > 0.6 && level > 2) level = 2;
      let target = 0;
      if (input.forward > 0.1) target = this.gaitSpeed(level) * input.forward;
      else if (input.forward < -0.1) target = this.speed > 0.4 ? 0 : -0.95;
      // obedience: low bond -> sluggish response, sometimes ignores sprint
      const accel = target > this.speed ? (2.2 + agility * 0.25) * obey : 6.5 + agility * 0.2;
      this.speed = this.speed + clamp(target - this.speed, -accel * dt, accel * dt);
      // turning
      const sp = Math.abs(this.speed);
      let rate = (sp < 0.3 ? 1.3 : 2.1 - Math.min(sp, 12) * 0.075) * (0.75 + agility * 0.04) * obey;
      const turn = input.turn || 0;
      this.heading += turn * rate * dt * (this.speed < -0.1 ? -1 : 1);
      this.leanTurn = damp(this.leanTurn, turn * Math.min(sp / 8, 1), 5, dt);
      this.lastTurn = turn;

      // stamina
      const g = this.animGait;
      if (g >= 4 && sp > 4) this.stamina -= (10 - this.data.stats.stamina * 0.55) * dt;
      else if (g === 3 && sp > 4) this.stamina -= (3.6 - this.data.stats.stamina * 0.2) * dt;
      else this.stamina += (g <= 1 ? 9 : 3) * dt * (0.6 + (this.data.needs?.hunger ?? 80) / 250);
      this.stamina = clamp(this.stamina, 0, ms);
      if (this.stamina <= 0.5) { this.exhausted = true; this.emit('exhausted'); }
      if (this.exhausted && this.stamina > ms * 0.3) this.exhausted = false;

      if (input.jump && !this.airborne) this.tryJump();
      else if (input.slide && this.speed > this.gaitSpeed(2) * 1.15) this.startManeuver('slide');
      else if (input.spin && Math.abs(this.speed) < 1.0) this.startManeuver('spin', { dir: input.spin });
      else if (input.rear && Math.abs(this.speed) < 1.5) this.startManeuver('rear');
    }

    this.integrate(dt);
    this.animate(dt);
  }

  tryJump() {
    if (this.speed < 2.2) { this.emit('needSpeed'); return; }
    if (this.stamina < 8) { this.emit('tooTired'); return; }
    const pers = this.data.personality;
    let refuse = Math.max(0, 0.3 - this.data.bond * 0.006);
    if (pers === 'aengstlich') refuse += 0.12;
    if (pers === 'mutig') refuse *= 0.3;
    if (this.rider && Math.random() < refuse) {
      this.startManeuver('refuse');
      return;
    }
    const agility = this.data.stats.agility;
    this.vy = 5.4 + agility * 0.1;
    this.airborne = true;
    this.stamina -= 7;
    this.jumpT = 0;
    this.emit('jump');
  }

  startManeuver(type, opts = {}) {
    this.maneuver = { type, t: 0, ...opts };
    if (type === 'slide') { this.maneuver.entry = this.speed; this.maneuver.dist = 0; this.emit('slideStart'); }
    if (type === 'spin') { this.maneuver.turned = 0; this.maneuver.rate = 0; }
    if (type === 'refuse') { this.maneuver.from = this.speed; this.emit('refuse'); }
    if (type === 'rear') this.emit('rear');
    if (type === 'spook') this.emit('spook');
    if (type === 'buck') this.emit('buck');
  }

  updateManeuver(dt, input) {
    const m = this.maneuver;
    m.t += dt;
    if (m.type === 'slide') {
      const dec = 7.5 + this.data.stats.agility * 0.3;
      const before = this.speed;
      this.speed = Math.max(0, this.speed - dec * dt);
      m.dist += (before + this.speed) / 2 * dt;
      this.heading += (input.turn || 0) * 0.15 * dt;
      if (this.speed <= 0.05) {
        this.speed = 0;
        m.hold = (m.hold || 0) + dt;
        if (m.hold > 0.6) { this.emit('slidingStop', { distance: m.dist, entry: m.entry }); this.maneuver = null; }
      }
    } else if (m.type === 'spin') {
      const max = (5 + this.data.stats.agility * 0.5) * this.obedience;
      const holding = !!input.spin;
      if (input.spin) m.dir = input.spin;
      m.rate = damp(m.rate, holding ? max : 0, holding ? 3 : 7, dt);
      const dh = m.dir * m.rate * dt;
      // pivot around the hind legs
      const back = this.rig.dims.zLen * 0.62 * this.scale;
      const pivX = this.pos.x - Math.sin(this.heading) * back, pivZ = this.pos.z - Math.cos(this.heading) * back;
      this.heading += dh;
      this.pos.x = pivX + Math.sin(this.heading) * back;
      this.pos.z = pivZ + Math.cos(this.heading) * back;
      m.turned += Math.abs(dh);
      this.speed = 0;
      if (!holding && m.rate < 0.3) {
        this.emit('spin', { turns: m.turned / (Math.PI * 2), dir: m.dir });
        this.maneuver = null;
      }
    } else if (m.type === 'refuse') {
      this.speed = Math.max(0, this.speed - 14 * dt);
      if (m.t > 1.4) this.maneuver = null;
    } else if (m.type === 'rear' || m.type === 'spook') {
      this.speed = Math.max(0, this.speed - 10 * dt);
      if (m.t > (m.type === 'spook' ? 1.8 : 2.2)) {
        this.maneuver = null;
        if (m.type === 'spook' && this.data.personality === 'aengstlich' && this.data.bond < 50) this.startManeuver('bolt');
      }
    } else if (m.type === 'bolt') {
      this.speed = damp(this.speed, this.gaitSpeed(3), 3, dt);
      this.heading += Math.sin(m.t * 2) * 0.6 * dt;
      if (m.t > 2.5) this.maneuver = null;
    } else if (m.type === 'buck') {
      this.speed = Math.max(0, this.speed - 6 * dt);
      if (m.t > 1.2) this.maneuver = null;
    } else if (m.type === 'graze' || m.type === 'drink') {
      this.speed = 0;
      if (m.t > (m.dur || 4)) this.maneuver = null;
    } else {
      this.maneuver = null;
    }
  }

  spook() {
    if (this.maneuver || this.airborne) return;
    const p = this.data.personality;
    const chance = p === 'aengstlich' ? 0.9 : p === 'mutig' ? 0.1 : 0.4;
    if (Math.random() < chance * (1.2 - this.data.bond / 100)) this.startManeuver('spook');
  }

  integrate(dt) {
    const fwd = this.forward(_v);
    const prevX = this.pos.x, prevZ = this.pos.z;
    let nx = this.pos.x + fwd.x * this.speed * dt;
    let nz = this.pos.z + fwd.z * this.speed * dt;

    // Water slows down
    const depth = waterDepthAt(nx, nz);
    this.waterDepth = depth;
    if (depth > 0.3 && Math.abs(this.speed) > 2) this.speed *= 1 - Math.min(0.5, depth * 0.35) * dt * 2;

    // Steep slopes block movement
    if (!this.airborne && Math.abs(this.speed) > 0.01) {
      const h0 = heightAt(this.pos.x, this.pos.z);
      const dir = Math.sign(this.speed);
      const ax = this.pos.x + fwd.x * 1.6 * dir, az = this.pos.z + fwd.z * 1.6 * dir;
      const h1 = heightAt(ax, az);
      const slope = (h1 - h0) / 1.6;
      if (slope > 0.95 || slope < -1.4) {
        nx = this.pos.x; nz = this.pos.z;
        this.speed *= 0.3;
        this.emit('blocked');
      }
    }
    // World bounds
    nx = clamp(nx, -PLAY_LIMIT, PLAY_LIMIT);
    nz = clamp(nz, -PLAY_LIMIT, PLAY_LIMIT);

    // Collisions (two circles along the body)
    const ground = heightAt(nx, nz);
    const foot = this.airborne ? this.pos.y : ground;
    const r = 0.55 * this.scale;
    const half = 0.65 * this.scale;
    const front = { x: nx + fwd.x * half, z: nz + fwd.z * half };
    const back = { x: nx - fwd.x * half, z: nz - fwd.z * half };
    const col = this.game.colliders;
    const h1 = col.resolve(front, r, foot);
    const h2 = col.resolve(back, r, foot);
    if (h1 || h2) {
      nx = (front.x + back.x) / 2; nz = (front.z + back.z) / 2;
      if (Math.abs(this.speed) > 3 && h1) {
        this.emit('bump', h1);
        this.speed *= 0.4;
      }
    }
    this.pos.x = nx; this.pos.z = nz;
    this.moved = Math.hypot(nx - prevX, nz - prevZ);

    // Vertical
    const g = heightAt(this.pos.x, this.pos.z);
    if (this.airborne) {
      this.vy -= 13 * dt;
      this.pos.y += this.vy * dt;
      this.jumpT += dt;
      if (this.pos.y <= g && this.vy < 0) {
        this.pos.y = g;
        this.airborne = false;
        this.vy = 0;
        this.emit('land');
      }
    } else {
      this.pos.y = damp(this.pos.y, g, 20, dt);
    }

    // Align with terrain
    const L = 0.8 * this.scale;
    const hf = heightAt(this.pos.x + fwd.x * L, this.pos.z + fwd.z * L);
    const hb = heightAt(this.pos.x - fwd.x * L, this.pos.z - fwd.z * L);
    const targetPitch = Math.atan2(hb - hf, 2 * L) * 0.85;
    this.pitch = damp(this.pitch, targetPitch, 8, dt);
    this.roll = damp(this.roll, -this.leanTurn * 0.12, 6, dt);

    const root = this.rig.root;
    root.position.copy(this.pos);
    root.rotation.set(0, 0, 0);
    root.rotation.order = 'YXZ';
    root.rotation.y = this.heading;
    root.rotation.x = this.pitch;
    root.rotation.z = this.roll;
  }

  emit(type, data) { if (this.onEvent) this.onEvent(type, data, this); }

  // ---------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------
  animate(dt) {
    const rig = this.rig;
    const sp = Math.abs(this.speed);
    const m = this.maneuver;
    // choose animation gait from speed
    const s1 = this.gaitSpeed(1), s2 = this.gaitSpeed(2), s3 = this.gaitSpeed(3);
    let ag = 0;
    if (sp > 0.12) ag = 1;
    if (sp > (s1 + s2) * 0.55) ag = 2;
    if (sp > (s2 + s3) * 0.5) ag = 3;
    if (sp > s3 * 1.18) ag = 4;
    if (m && m.type === 'spin') ag = 2;
    if (m && m.type === 'slide') ag = 1;
    this.animGait = ag;
    const G = GAITS[ag];
    const moving = ag > 0;
    this.gaitBlend = damp(this.gaitBlend, moving ? 1 : 0, 6, dt);

    let freq = G.freq;
    if (moving) {
      const ref = ag === 4 ? this.gaitSpeed(4) : this.gaitSpeed(ag);
      freq *= clamp(sp / Math.max(ref, 0.1), 0.6, 1.35);
    }
    if (m && m.type === 'spin') freq = 1.5 + m.rate * 0.35;
    if (m && m.type === 'slide') freq = 2.2;
    const dir = this.speed < -0.05 ? -1 : 1;
    this.phase += freq * dt * dir;

    const air = this.airborne ? 1 : 0;
    const jt = this.jumpT || 0;
    const tailRest = rig.tail[0].rest;

    // --- legs ---
    rig.legs.forEach((leg, i) => {
      let hip = 0, knee = 0, fet = 0;
      if (moving) {
        let u = this.phase + G.offsets[i];
        u -= Math.floor(u);
        let swing;
        if (u < G.duty) {
          const s = u / G.duty;
          hip = G.amp * (2 * s - 1);
          swing = 0;
          if (leg.wasSwing) {
            leg.wasSwing = false;
            if (this.onStep && !this.airborne) this.onStep(this, i);
          }
        } else {
          const w = (u - G.duty) / (1 - G.duty);
          hip = G.amp * Math.cos(Math.PI * w);
          swing = Math.sin(Math.PI * w);
          leg.wasSwing = true;
        }
        if (leg.front) {
          knee = swing * G.knee;
          fet = swing * G.knee * 0.7 + (1 - swing) * 0.12 * Math.sin(Math.PI * (u / G.duty));
          hip -= swing * 0.15 * G.knee;
        } else {
          knee = -swing * G.knee * 0.75;
          fet = swing * G.knee * 0.55;
          hip += swing * 0.1;
        }
        hip *= this.gaitBlend; knee *= this.gaitBlend; fet *= this.gaitBlend;
      } else {
        // idle weight shift on a hind leg
        if (!leg.front && i === 3) { knee = -0.1 * (0.5 + 0.5 * Math.sin(this.time * 0.3)); fet = 0.25 * (0.5 + 0.5 * Math.sin(this.time * 0.3)); }
      }
      // maneuver poses
      if (m) {
        if (m.type === 'slide') {
          if (!leg.front) { hip = -0.85; knee = 0.35; fet = -0.25; }
          else { hip *= 0.4; hip -= 0.25; }
        } else if (m.type === 'rear' || m.type === 'spook') {
          const k = smoothstep(0, 0.4, m.t) * (1 - smoothstep(m.type === 'spook' ? 1.3 : 1.7, m.type === 'spook' ? 1.8 : 2.2, m.t));
          if (leg.front) { hip = lerp(hip, -0.5 + Math.sin(m.t * 9 + i) * 0.35, k); knee = lerp(knee, 1.6, k); fet = lerp(fet, 0.6, k); }
          else { hip = lerp(hip, -0.65, k); knee = lerp(knee, 0.2, k); }
        } else if (m.type === 'buck') {
          const k = Math.sin(clamp(m.t / 1.2, 0, 1) * Math.PI);
          if (!leg.front) { hip = lerp(hip, 0.9, k); knee = lerp(knee, -0.2, k); }
          else { hip = lerp(hip, -0.25, k); }
        } else if (m.type === 'refuse') {
          const k = Math.sin(clamp(m.t / 1.4, 0, 1) * Math.PI);
          if (leg.front) { hip = lerp(hip, -0.45, k); }
          else { hip = lerp(hip, -0.3, k); }
        }
      }
      if (air) {
        const k = smoothstep(0, 0.12, jt);
        if (leg.front) { hip = lerp(hip, -0.55 + (this.vy < 0 ? -0.35 : 0), k); knee = lerp(knee, this.vy > -1 ? 1.75 : 0.6, k); fet = lerp(fet, 0.6, k); }
        else { hip = lerp(hip, this.vy > 0 ? 0.55 : -0.2, k); knee = lerp(knee, this.vy > 0 ? -0.2 : -0.9, k); fet = lerp(fet, 0.5, k); }
      }
      leg.hip.rotation.x = leg.rest[0] + hip;
      leg.knee.rotation.x = leg.rest[1] + knee;
      leg.fet.rotation.x = leg.rest[2] + fet;
      leg.hoofPivot.rotation.x = -(leg.rest[0] + leg.rest[1] + leg.rest[2]) - (hip + knee + fet) * 0.5;
    });

    // --- body ---
    const ph = this.phase * Math.PI * 2;
    let bob = 0, bodyPitch = 0;
    if (moving) {
      if (ag === 1) bob = Math.sin(ph * 2) * 0.012;
      else if (ag === 2) bob = Math.abs(Math.sin(ph * 2)) * 0.05 - 0.02;
      else if (ag === 3) { bob = Math.sin(ph) * 0.05; bodyPitch = Math.sin(ph + 0.6) * 0.055; }
      else if (ag === 4) { bob = Math.sin(ph) * 0.06; bodyPitch = Math.sin(ph + 0.6) * 0.05; }
      bob *= this.gaitBlend; bodyPitch *= this.gaitBlend;
    } else {
      bob = Math.sin(this.time * 1.4) * 0.004; // breathing
    }
    let pitchAround = null;
    if (air) bodyPitch += clamp(-this.vy * 0.06, -0.3, 0.3);
    if (m) {
      if (m.type === 'slide') { bodyPitch += -0.16; bob -= 0.12; }
      if (m.type === 'rear' || m.type === 'spook') {
        const k = smoothstep(0, 0.45, m.t) * (1 - smoothstep(m.type === 'spook' ? 1.3 : 1.7, m.type === 'spook' ? 1.8 : 2.2, m.t));
        bodyPitch += -0.8 * k;
        pitchAround = 'hind';
      }
      if (m.type === 'buck') { const k = Math.sin(clamp(m.t / 1.2, 0, 1) * Math.PI); bodyPitch += 0.35 * k; pitchAround = 'front'; }
      if (m.type === 'refuse') { const k = Math.sin(clamp(m.t / 1.4, 0, 1) * Math.PI); bodyPitch += -0.15 * k; }
    }
    rig.body.rotation.x = bodyPitch;
    rig.body.rotation.z = 0;
    if (pitchAround) {
      const d = rig.dims;
      const pz = pitchAround === 'hind' ? -d.zLen * 0.62 : d.zLen * 0.6;
      const py = pitchAround === 'hind' ? d.hipH : d.hipF;
      // keep pivot point fixed
      const c = Math.cos(bodyPitch), s = Math.sin(bodyPitch);
      const ry = py * c - pz * s, rz = py * s + pz * c;
      rig.body.position.set(0, py - ry + bob, pz - rz);
    } else {
      rig.body.position.set(0, bob, 0);
    }

    // --- neck & head ---
    const grazing = m && (m.type === 'graze' || m.type === 'drink');
    this.headDown = damp(this.headDown, grazing ? 1 : 0, 2.5, dt);
    let neckX = rig.dims.neckTilt;
    let headX = 1.5;
    if (moving) {
      if (ag === 1) neckX += Math.sin(ph * 2 + 1) * 0.04;
      if (ag === 3) neckX += Math.sin(ph + 2) * 0.08;
      if (ag === 4) { neckX += 0.18 + Math.sin(ph + 2) * 0.07; headX -= 0.25; }
    } else {
      neckX += Math.sin(this.time * 0.5) * 0.02;
    }
    if (m && m.type === 'slide') { neckX -= 0.15; headX += 0.15; }
    if (m && (m.type === 'rear' || m.type === 'spook')) { neckX -= 0.2; headX -= 0.3; }
    neckX += this.headDown * 1.25;
    headX += this.headDown * 0.25 + (grazing ? Math.sin(this.time * 6) * 0.05 : 0);
    rig.neck.rotation.x = neckX;
    rig.neck.rotation.y = this.leanTurn * -0.25 + (this.lookYaw || 0);
    rig.head.rotation.x = headX;

    // --- ears ---
    this.earT -= dt;
    if (this.earT < 0) { this.earT = rand(1, 5); this.earTarget = [rand(-0.3, 0.4), rand(-0.3, 0.4)]; }
    const earsBack = (m && (m.type === 'spook' || m.type === 'buck' || m.type === 'refuse')) ? 1 : 0;
    rig.ears.forEach((e, i) => {
      const s = i === 0 ? -1 : 1;
      const tgt = earsBack ? -0.9 : (moving && this.rider ? 0.25 : this.earTarget?.[i] || 0);
      e.userData.a = damp(e.userData.a || 0, tgt, 6, dt);
      e.rotation.x = 0.85 + e.userData.a;
      e.rotation.z = s * 0.3;
    });

    // --- tail ---
    const flow = clamp(sp / 11, 0, 1);
    this.tailSwish -= dt;
    if (this.tailSwish < -rand(2, 7) && !moving) this.tailSwish = 1.2;
    const swish = this.tailSwish > 0 ? Math.sin(this.tailSwish * 12) * 0.5 * this.tailSwish : 0;
    rig.tail.forEach((s, i) => {
      const k = i / rig.tail.length;
      let tx = s.rest;
      if (i === 0) tx = tailRest + flow * 0.8 + air * 0.4;
      else tx = s.rest + flow * 0.12 + Math.sin(this.time * (5 + flow * 9) - i * 0.7) * (0.04 + flow * 0.1);
      s.g.rotation.x = damp(s.g.rotation.x, tx, 10 - k * 4, dt);
      const yaw = swish * (i === 0 ? 0.4 : 0.6) * Math.sin(this.time * 2 - i * 0.6) + this.leanTurn * 0.15 + (this.game.weather?.wind.x || 0) * 0.008;
      s.g.rotation.z = damp(s.g.rotation.z, yaw, 8, dt);
    });

    // --- mane ---
    const wind = this.game.weather ? this.game.weather.cur.wind : 0.3;
    rig.mane.forEach((l, i) => {
      if (l.rest > 2) { return; } // fjord standing mane
      const flap = Math.sin(this.time * (8 + flow * 10) + i * 0.8) * (0.05 + flow * 0.22 + wind * 0.05);
      l.g.rotation.x = l.rest - flow * 0.5 + flap * 0.5 - this.headDown * 0.9;
      l.g.rotation.z = -(0.7 + flow * 0.5) + flap;
    });
    rig.forelock.rotation.x = Math.PI + 0.25 - flow * 0.5 + Math.sin(this.time * 9) * flow * 0.15;
  }

  // ---------------------------------------------------------------------
  // AI (for horses without rider)
  // ---------------------------------------------------------------------
  think(dt, player) {
    this.stateT -= dt;
    const input = { forward: 0, turn: 0, gait: 1 };
    const steerTo = (x, z, gait, arrive = 2) => {
      const dx = x - this.pos.x, dz = z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < arrive) return true;
      const want = Math.atan2(dx, dz);
      const diff = wrapAngle(want - this.heading);
      input.turn = clamp(diff * 2, -1, 1);
      input.forward = Math.abs(diff) > 1.6 ? 0.25 : 1;
      input.gait = gait;
      if (d < 6 && gait > 1) input.gait = 1;
      return false;
    };

    const st = this.state;
    if (st === 'follow' && player) {
      const d = this.pos.distanceTo(player);
      if (steerTo(player.x, player.z, d > 25 ? 3 : 2, 2.8)) {
        // face the player
        const want = Math.atan2(player.x - this.pos.x, player.z - this.pos.z);
        input.turn = clamp(wrapAngle(want - this.heading) * 2, -1, 1) * 0.4;
        if (this.stateT < 0) { this.state = 'stand'; this.stateT = 8; }
      } else this.stateT = 3;
    } else if (st === 'wander') {
      if (!this.target || steerTo(this.target.x, this.target.z, this.target.gait || 1, 1.5) || this.stateT < 0) {
        this.state = 'stand'; this.stateT = rand(3, 9);
      }
    } else if (st === 'flee' && player) {
      const dx = this.pos.x - player.x, dz = this.pos.z - player.z;
      const d = Math.hypot(dx, dz) || 1;
      steerTo(this.pos.x + (dx / d) * 30, this.pos.z + (dz / d) * 30, 3, 0);
      if (d > 45 || this.stateT < 0) { this.state = 'stand'; this.stateT = rand(2, 5); }
    } else if (st === 'goto' && this.target) {
      if (steerTo(this.target.x, this.target.z, this.target.gait || 2, this.target.arrive || 2)) { this.state = 'stand'; this.stateT = rand(2, 5); }
    } else if (st === 'stand' || st === 'idle') {
      if (this.stateT < 0 && !this.maneuver) {
        const r = Math.random();
        const pers = this.data.personality;
        if (r < 0.35) {
          this.startManeuver('graze', { dur: rand(4, 10) });
          this.stateT = 0;
        } else if (r < 0.85 && this.home) {
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * this.home.r;
          const playful = pers === 'verspielt' && Math.random() < 0.3;
          this.target = { x: this.home.x + Math.cos(a) * rr, z: this.home.z + Math.sin(a) * rr, gait: playful ? 3 : (Math.random() < 0.15 ? 2 : 1) };
          this.state = 'wander'; this.stateT = 25;
          if (playful && Math.random() < 0.5) this.startManeuver('buck');
        } else {
          this.stateT = rand(3, 8);
        }
      }
    }
    // keep inside home area
    if (this.home && st !== 'follow' && st !== 'flee' && st !== 'goto') {
      const d = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
      if (d > this.home.r + 3) { this.target = { x: this.home.x, z: this.home.z, gait: 1 }; this.state = 'wander'; }
    }
    return input;
  }

  call() {
    this.state = 'follow';
    this.stateT = 3;
    this.maneuver = null;
  }

  hoofWorld(i, out = new THREE.Vector3()) {
    return this.rig.legs[i].hoof.getWorldPosition(out);
  }

  setVisible(v) { this.rig.root.visible = v; this.visible = v; }

  dispose() {
    this.game.scene.remove(this.rig.root);
    disposeHorseModel(this.rig);
  }
}
