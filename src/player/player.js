import * as THREE from 'three';
import { Rider } from './rider.js';
import { clamp, damp, dampAngle, wrapAngle } from '../core/utils.js';
import { heightAt, waterDepthAt, PLAY_LIMIT } from '../world/terrain.js';
import { GAITS } from '../horse/horse.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.rider = new Rider(game.scene, game.state.outfit);
    this.mode = 'foot';
    this.pos = new THREE.Vector3(10, 0, 14);
    this.heading = 0;
    this.speed = 0;
    this.horse = null;
    this.gait = 1;
    this.lassoing = false;
    this.mountAnim = 0;
    this.crouch = false;
  }

  get position() { return this.mode === 'ride' && this.horse ? this.horse.pos : this.pos; }

  canRide(h) {
    if ((h.data.growth ?? 1) < 1) return 'Fohlen sind noch zu jung zum Reiten.';
    if (h.data.breed === 'shetty') return 'Ein Shetty ist zu klein zum Reiten – aber perfekt zum Kuscheln!';
    if (h.data.wild) return 'Dieses Wildpferd ist noch nicht gezähmt.';
    return null;
  }

  mount(h) {
    const why = this.canRide(h);
    if (why) { this.game.ui.toast(why); return; }
    if (!h.data.tack?.saddle) this.game.ui.toast('Ohne Sattel geritten – „Bareback“!');
    this.horse = h;
    h.rider = this;
    h.state = 'ridden';
    h.maneuver = null;
    this.mode = 'ride';
    this.mountAnim = 1;
    this.game.state.activeHorse = h.data.id;
    this.game.audio.snort(h);
    this.game.events.emit('mount', h);
  }

  dismount() {
    const h = this.horse;
    if (!h || h.airborne) return;
    const side = new THREE.Vector3(Math.cos(h.heading), 0, -Math.sin(h.heading));
    this.pos.copy(h.pos).addScaledVector(side, 1.3);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.heading = h.heading;
    h.rider = null;
    h.state = 'stand';
    h.stateT = 6;
    h.speed = 0;
    this.horse = null;
    this.mode = 'foot';
    this.lassoing = false;
    this.game.events.emit('dismount', h);
  }

  whistle() {
    this.game.audio.whistle();
    this.rider.play('whistle', 1.0);
    const h = this.game.horses.find((x) => x.data.id === this.game.state.activeHorse && !x.rider) ||
      this.game.horses.filter((x) => !x.rider && !x.data.wild && (x.data.growth ?? 1) >= 1).sort((a, b) => a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos))[0];
    if (!h) return;
    const d = h.pos.distanceTo(this.pos);
    if (d > 600) { this.game.ui.toast(`${h.data.name} ist zu weit weg, um dich zu hören.`); return; }
    setTimeout(() => {
      h.call(this.pos);
      this.game.audio.whinny(h);
      this.game.ui.toast(`${h.data.name} hat dich gehört und kommt angetrabt! 🐴`);
    }, 600);
    this.game.state.stats.whistles++;
  }

  update(dt) {
    const g = this.game;
    const inp = g.input;
    const locked = g.ui.modalOpen || g.photoMode;
    if (this.mode === 'ride') this.updateRide(dt, inp, locked);
    else this.updateFoot(dt, inp, locked);
  }

  readGaitKeys(inp) {
    if (inp.wasPressed('Digit1')) this.gait = 1;
    if (inp.wasPressed('Digit2')) this.gait = 2;
    if (inp.wasPressed('Digit3')) this.gait = 3;
    if (inp.wasPressed('KeyQ')) this.gait = Math.max(1, this.gait - 1);
    if (inp.wasPressed('KeyR') && !inp.isDown('ControlLeft')) this.gait = Math.min(3, this.gait + 1);
  }

  updateRide(dt, inp, locked) {
    const g = this.game;
    const h = this.horse;
    const input = { forward: 0, turn: 0, gait: this.gait };
    if (!locked) {
      this.readGaitKeys(inp);
      if (inp.isDown('KeyW') || inp.isDown('ArrowUp')) input.forward = 1;
      if (inp.isDown('KeyS') || inp.isDown('ArrowDown')) input.forward = -1;
      if (inp.isDown('KeyA') || inp.isDown('ArrowLeft')) input.turn += 1;
      if (inp.isDown('KeyD') || inp.isDown('ArrowRight')) input.turn -= 1;
      input.sprint = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
      input.jump = inp.wasPressed('Space');
      input.slide = inp.wasPressed('KeyX');
      if (inp.isDown('KeyC')) input.spin = input.turn >= 0 ? (input.turn > 0 ? 1 : (h.maneuver?.dir || 1)) : -1;
      input.rear = inp.wasPressed('KeyZ') || inp.wasPressed('KeyY');
      if (input.rear && h.data.bond < 60) { input.rear = false; g.ui.toast('Steigen auf Kommando klappt erst ab Bindungsstufe „Vertraut“.'); }
      input.gait = this.gait;
      if (inp.wasPressed('KeyT')) this.pat();
    }
    if (input.spin) input.turn = 0;
    h.drive(dt, input);
    g.stats.trackRide(h, dt);

    // rider follows the seat
    const seat = h.seat || h.rig.saddleMount;
    seat.updateWorldMatrix(true, false);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    seat.getWorldPosition(p);
    seat.getWorldQuaternion(q);
    this.rider.root.position.copy(p);
    this.rider.root.quaternion.copy(q);
    this.rider.root.scale.setScalar(1);
    this.pos.copy(h.pos);
    this.heading = h.heading;
    const m = h.maneuver;
    this.rider.update(dt, {
      mode: 'ride', gait: h.animGait, phase: h.phase, turn: input.turn, slide: m?.type === 'slide', backing: h.speed < -0.1,
      lasso: this.lassoing, speed: Math.abs(h.speed),
    });
    g.tack.updateReins(h, this.rider.handWorld(0));
  }

  pat() {
    const h = this.horse;
    if (!h) return;
    this.rider.play('pat', 1.2);
    g_bond(this.game, h, 0.4, 'pat');
  }

  updateFoot(dt, inp, locked) {
    const g = this.game;
    let mx = 0, mz = 0;
    if (!locked) {
      if (inp.isDown('KeyW') || inp.isDown('ArrowUp')) mz += 1;
      if (inp.isDown('KeyS') || inp.isDown('ArrowDown')) mz -= 1;
      if (inp.isDown('KeyA') || inp.isDown('ArrowLeft')) mx -= 1;
      if (inp.isDown('KeyD') || inp.isDown('ArrowRight')) mx += 1;
      this.crouch = inp.isDown('ControlLeft') || inp.isDown('KeyC');
    }
    const camYaw = g.followCam.yaw;
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dir = new THREE.Vector3().addScaledVector(fwd, mz).addScaledVector(right, mx);
    const moving = dir.lengthSq() > 0.01 && !this.rider.action;
    const run = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const target = moving ? (this.crouch ? 0.9 : run ? 5.2 : 1.9) : 0;
    this.speed = damp(this.speed, target, 8, dt);
    if (moving) {
      dir.normalize();
      this.heading = dampAngle(this.heading, Math.atan2(dir.x, dir.z), 10, dt);
    }
    const f = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const np = { x: this.pos.x + f.x * this.speed * dt, z: this.pos.z + f.z * this.speed * dt };
    const depth = waterDepthAt(np.x, np.z);
    const slope = (heightAt(np.x, np.z) - heightAt(this.pos.x, this.pos.z)) / Math.max(0.001, this.speed * dt);
    if (depth < 0.9 && slope < 1.2) {
      g.colliders.resolve(np, 0.35, this.pos.y);
      // don't walk through horses
      for (const h of g.horses) {
        if (!h.visible) continue;
        const dx = np.x - h.pos.x, dz = np.z - h.pos.z;
        const d = Math.hypot(dx, dz);
        const r = 0.9 * h.scale;
        if (d < r && d > 0.001) { np.x = h.pos.x + dx / d * r; np.z = h.pos.z + dz / d * r; }
      }
      this.pos.x = clamp(np.x, -PLAY_LIMIT, PLAY_LIMIT);
      this.pos.z = clamp(np.z, -PLAY_LIMIT, PLAY_LIMIT);
    } else {
      this.speed = 0;
    }
    this.pos.y = heightAt(this.pos.x, this.pos.z) + (waterDepthAt(this.pos.x, this.pos.z) > 0 ? 0 : 0);
    const r = this.rider.root;
    r.position.copy(this.pos);
    r.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    this.rider.update(dt, { mode: 'foot', speed: this.speed, lasso: this.lassoing, crouch: this.crouch });
    if (g.audio && moving && this.speed > 0.5) {
      this.stepT = (this.stepT || 0) - dt * this.speed;
      if (this.stepT < 0) { this.stepT = 1.4; g.audio.footstep(depth > 0.05); }
    }
  }

  faceTowards(p) {
    this.heading = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  gaitName() {
    if (this.mode !== 'ride') return '';
    const h = this.horse;
    if (h.maneuver?.type === 'slide') return 'Sliding Stop';
    if (h.maneuver?.type === 'spin') return 'Spin';
    if (h.airborne) return 'Sprung!';
    if (h.speed < -0.1) return 'Rückwärts';
    return GAITS[h.animGait].name;
  }

  wrapHeading() { this.heading = wrapAngle(this.heading); }
}

export function g_bond(game, horse, amount, reason) {
  const d = horse.data;
  let mul = 1;
  if (d.personality === 'verschmust' && (reason === 'brush' || reason === 'pat')) mul = 1.6;
  if (d.personality === 'verspielt' && reason === 'treat') mul = 1.6;
  if (d.personality === 'aengstlich') mul *= 0.8;
  const before = d.bond;
  d.bond = clamp(d.bond + amount * mul, 0, 100);
  game.fx.hearts(horse);
  game.events.emit('bond', { horse, before, after: d.bond });
}
