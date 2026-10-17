import * as THREE from 'three';
import { wrapAngle } from '../core/utils.js';

// Lasso: swing, throw and lead cattle.
export class Lasso {
  constructor(game) {
    this.game = game;
    this.state = 'idle'; // idle | swing | throw | hold
    this.t = 0;
    this.target = null;
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc8a870, roughness: 0.9 });
    this.loop = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.02, 4, 32), ropeMat);
    this.loop.visible = false;
    game.scene.add(this.loop);
    this.rope = new THREE.Mesh(new THREE.BufferGeometry(), ropeMat);
    this.rope.visible = false;
    this.rope.frustumCulled = false;
    game.scene.add(this.rope);
  }

  owner() { const p = this.game.player; return p.mode === 'ride' ? p.horse : p; }

  trigger() {
    const g = this.game;
    if (this.state === 'hold') { this.release(); return; }
    if (this.state !== 'idle') return;
    this.state = 'swing'; this.t = 0;
    g.player.lassoing = true;
    g.audio.swish();
  }

  findTarget() {
    const g = this.game;
    const p = g.player;
    const pos = p.position;
    const heading = p.mode === 'ride' ? p.horse.heading : p.heading;
    let best = null, bs = 1e9;
    for (const c of g.animals.cattle) {
      if (c.tethered || !c.root.visible) continue;
      const dx = c.pos.x - pos.x, dz = c.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 18) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - heading));
      if (ang > 1.1) continue;
      const score = d + ang * 6;
      if (score < bs) { bs = score; best = c; }
    }
    return best;
  }

  release() {
    if (this.target) this.target.tethered = null;
    this.target = null;
    this.state = 'idle';
    this.rope.visible = false;
    this.game.player.lassoing = false;
  }

  hand() { return this.game.player.rider.handWorld(1, new THREE.Vector3()); }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (this.state === 'swing') {
      const h = this.hand();
      this.loop.visible = true;
      this.loop.position.copy(h).add(new THREE.Vector3(0, 0.25, 0));
      this.loop.rotation.set(Math.PI / 2, 0, this.t * 12);
      if (this.t > 0.9) {
        const tgt = this.findTarget();
        if (!tgt) {
          this.loop.visible = false; this.state = 'idle'; g.player.lassoing = false;
          g.ui.toast('Kein Rind in Reichweite. Reite näher heran (max. 18 m, vor dir).');
          return;
        }
        this.target = tgt; this.state = 'throw'; this.t = 0;
        g.audio.swish();
      }
    } else if (this.state === 'throw') {
      const k = Math.min(1, this.t / 0.45);
      const from = this.hand();
      const to = this.target.head.getWorldPosition(new THREE.Vector3());
      const p = from.clone().lerp(to, k); p.y += Math.sin(k * Math.PI) * 2;
      this.loop.position.copy(p);
      this.loop.rotation.set(Math.PI / 2, 0, this.t * 10);
      this.drawRope(from, p);
      if (k >= 1) {
        this.loop.visible = false;
        const owner = this.owner();
        const agility = g.player.horse ? g.player.horse.data.stats.agility : 5;
        const d = Math.hypot(this.target.pos.x - owner.pos.x, this.target.pos.z - owner.pos.z);
        const chance = Math.min(0.97, 0.55 + agility * 0.04 + (18 - d) * 0.015);
        if (Math.random() < chance) {
          this.state = 'hold';
          this.target.tethered = owner;
          g.audio.moo(this.target.pos);
          g.ui.toast('🤠 Gefangen! Führe das Rind zum Ziel. (F = loslassen)');
          g.events.emit('lasso', this.target);
        } else {
          g.ui.toast('Daneben! Versuch es nochmal.');
          this.release();
        }
      }
    } else if (this.state === 'hold') {
      if (!this.target || !this.target.tethered || !g.animals.cattle.includes(this.target)) { this.release(); return; }
      const from = this.hand();
      const to = this.target.head.getWorldPosition(new THREE.Vector3());
      this.drawRope(from, to);
      g.player.lassoing = false;
    }
  }

  drawRope(a, b) {
    const mid = a.clone().lerp(b, 0.5); mid.y -= Math.min(1.2, a.distanceTo(b) * 0.06);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    this.rope.geometry.dispose();
    this.rope.geometry = new THREE.TubeGeometry(curve, 16, 0.015, 4);
    this.rope.visible = true;
  }
}
