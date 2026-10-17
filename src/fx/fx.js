import * as THREE from 'three';
import { ParticleSystem, Precipitation } from './particles.js';
import { Hoofprints } from './hoofprints.js';
import { canvasTexture, rand } from '../core/utils.js';
import { heightAt, surfaceAt, waterDepthAt, forestFactor } from '../world/terrain.js';

function heartTexture() {
  return canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = '#ff4d8a';
    g.beginPath();
    g.moveTo(32, 54);
    g.bezierCurveTo(4, 34, 8, 8, 32, 20);
    g.bezierCurveTo(56, 8, 60, 34, 32, 54);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.ellipse(22, 22, 5, 3, -0.6, 0, 7); g.fill();
  });
}
function starTexture() {
  return canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,240,200,0.8)'); grd.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(32, 2); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(62, 32); g.stroke();
  });
}
function leafTexture() {
  return canvasTexture(32, 32, (g) => {
    g.clearRect(0, 0, 32, 32);
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(16, 16, 12, 6, 0.6, 0, 7); g.fill();
  });
}

export class FX {
  constructor(game) {
    this.game = game;
    const s = game.scene;
    this.dust = new ParticleSystem(s, { capacity: 2500, gravity: -0.15, drag: 1.4 });
    this.splash = new ParticleSystem(s, { capacity: 1500, gravity: 9.8, drag: 0.3 });
    this.sparks = new ParticleSystem(s, { capacity: 600, additive: true, gravity: -1.2, drag: 0.6, map: starTexture() });
    this.heartsPS = new ParticleSystem(s, { capacity: 200, gravity: -1.0, drag: 1.0, map: heartTexture() });
    this.leaves = new ParticleSystem(s, { capacity: 400, gravity: 0.6, drag: 1.5, map: leafTexture() });
    this.prints = new Hoofprints(s);
    this.precip = new Precipitation(s);
    this.fireflyT = 0;
    this.leafT = 0;
    this.all = [this.dust, this.splash, this.sparks, this.heartsPS, this.leaves];
  }

  setViewport(h) { this.all.concat([this.precip.snow]).forEach((p) => p.setViewportScale(h)); }

  onStep(horse, i) {
    const g = this.game;
    const p = horse.hoofWorld(i, new THREE.Vector3());
    const surf = surfaceAt(p.x, p.z);
    const snowy = g.weather.snowCover > 0.5 && surf !== 'water' && surf !== 'rock';
    const sp = Math.abs(horse.speed);
    const s = snowy ? 'snow' : (g.onBridge?.(p) ? 'wood' : surf);
    g.audio.hoof(s, 0.5 + Math.min(1, sp / 8) * 0.6, p);
    const gy = heightAt(p.x, p.z);
    if (s === 'water') {
      const n = 6 + sp * 2;
      for (let k = 0; k < n; k++) this.splash.emit(p.x, Math.max(gy, 0) + 0.1, p.z, rand(-1, 1) * (1 + sp * 0.2), rand(2, 4.5) + sp * 0.2, rand(-1, 1) * (1 + sp * 0.2), rand(0.5, 1.0), rand(0.06, 0.14), 0.85, 0.92, 1, 0.8, 1, 1);
      if (Math.random() < 0.4) this.dust.emit(p.x, 0.05, p.z, 0, 0.1, 0, 1.4, 0.8, 0.9, 0.95, 1, 0.25, 3, 0);
      return;
    }
    const scale = horse.scale;
    if (s === 'sand' || s === 'snow' || (s === 'grass' && g.weather.wetness > 0.4)) g.fx.prints.add(p.x, gy, p.z, horse.heading, g.time, scale);
    else if (s === 'grass' && Math.random() < 0.35) g.fx.prints.add(p.x, gy, p.z, horse.heading, g.time - 60, scale);
    const dusty = s === 'sand' || g.weather.cur.dust > 0.3 || (s === 'grass' && g.state && g.season === 'summer');
    if (s === 'snow') {
      for (let k = 0; k < 4; k++) this.dust.emit(p.x, gy + 0.1, p.z, rand(-0.5, 0.5), rand(0.5, 1.4), rand(-0.5, 0.5), rand(0.5, 1), rand(0.1, 0.25), 1, 1, 1, 0.8, 2, 1);
    } else if (dusty && sp > 2.5) {
      const n = Math.min(4, Math.floor(sp / 3));
      for (let k = 0; k < n; k++) this.dust.emit(p.x, gy + 0.15, p.z, rand(-0.6, 0.6), rand(0.2, 0.8), rand(-0.6, 0.6), rand(1.2, 2.5), rand(0.4, 0.8), 0.72, 0.6, 0.45, 0.35, 3.5, 0);
    }
  }

  slideDust(horse) {
    const g = this.game;
    for (const i of [2, 3]) {
      const p = horse.hoofWorld(i, new THREE.Vector3());
      const gy = heightAt(p.x, p.z);
      const water = waterDepthAt(p.x, p.z) > 0.05;
      if (water) { this.splash.emit(p.x, 0.1, p.z, rand(-1, 1), rand(1, 3), rand(-1, 1), 0.7, 0.12, 0.9, 0.95, 1, 0.8, 1, 1); continue; }
      for (let k = 0; k < 2; k++) this.dust.emit(p.x, gy + 0.1, p.z, rand(-0.8, 0.8), rand(0.3, 1.2), rand(-0.8, 0.8), rand(1, 2.2), rand(0.4, 0.9), 0.7, 0.58, 0.44, 0.45, 3.5, 0);
      if (Math.random() < 0.5) g.fx.prints.add(p.x, gy, p.z, horse.heading, g.time, horse.scale * 1.3);
    }
  }

  burst(pos, color = [0.72, 0.6, 0.45], n = 20, size = 0.6) {
    for (let k = 0; k < n; k++) this.dust.emit(pos.x + rand(-0.5, 0.5), pos.y + 0.1, pos.z + rand(-0.5, 0.5), rand(-1.5, 1.5), rand(0.2, 1.4), rand(-1.5, 1.5), rand(1, 2.2), size * rand(0.7, 1.3), color[0], color[1], color[2], 0.45, 3, 0);
  }

  hearts(horse) {
    const p = horse.rig.head.getWorldPosition(new THREE.Vector3());
    for (let k = 0; k < 5; k++) this.heartsPS.emit(p.x + rand(-0.3, 0.3), p.y + 0.3, p.z + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0.6, 1.2), rand(-0.3, 0.3), rand(1.2, 2), rand(0.15, 0.25), 1, 1, 1, 1, 1.2, 1);
  }

  sparkle(pos, n = 30, color = [1, 0.85, 0.4]) {
    for (let k = 0; k < n; k++) this.sparks.emit(pos.x + rand(-0.6, 0.6), pos.y + rand(0, 1), pos.z + rand(-0.6, 0.6), rand(-1, 1), rand(0.5, 2.5), rand(-1, 1), rand(0.8, 1.8), rand(0.15, 0.35), color[0], color[1], color[2], 1, 0.5, 1);
  }

  embers(pos) {
    this.sparks.emit(pos.x + rand(-0.3, 0.3), pos.y + 0.4, pos.z + rand(-0.3, 0.3), rand(-0.2, 0.2), rand(1, 2.5), rand(-0.2, 0.2), rand(1, 2.5), rand(0.05, 0.1), 1, 0.5, 0.15, 1, 0.5, 1);
    if (Math.random() < 0.3) this.dust.emit(pos.x, pos.y + 1.5, pos.z, rand(-0.2, 0.2), rand(0.8, 1.4), rand(-0.2, 0.2), rand(3, 5), rand(0.6, 1.2), 0.3, 0.3, 0.3, 0.15, 4, 0);
  }

  mist(pos) {
    this.dust.emit(pos.x + rand(-4, 4), pos.y + rand(0, 2), pos.z + rand(-2, 3), rand(-0.8, 0.8), rand(0.5, 2), rand(0.2, 1.6), rand(2, 4), rand(1.2, 2.5), 0.92, 0.95, 1, 0.22, 3, 0);
  }

  update(dt) {
    const g = this.game;
    const wind = g.weather.wind;
    this.all.forEach((p) => p.update(dt, wind));
    this.prints.update(g.time);
    const c = g.camera.position;
    this.precip.update(dt, c, g.weather.cur.rain, g.weather.cur.snow, wind);
    // fireflies on summer nights, falling leaves in autumn
    const fp = g.player.position;
    if (g.sky.darkness > 0.6 && (g.season === 'summer' || g.season === 'spring') && g.weather.cur.rain < 0.2) {
      this.fireflyT -= dt;
      if (this.fireflyT < 0) {
        this.fireflyT = 0.15;
        const x = fp.x + rand(-25, 25), z = fp.z + rand(-25, 25);
        this.sparks.emit(x, heightAt(x, z) + rand(0.5, 2), z, rand(-0.3, 0.3), rand(-0.1, 0.2), rand(-0.3, 0.3), rand(2, 4), 0.12, 0.7, 1, 0.3, 1, 1, 0);
      }
    }
    if (g.season === 'autumn') {
      this.leafT -= dt;
      if (this.leafT < 0 && forestFactor(fp.x, fp.z) > 0.2) {
        this.leafT = 0.1;
        const x = fp.x + rand(-20, 20), z = fp.z + rand(-20, 20);
        const cols = [[0.9, 0.5, 0.1], [0.85, 0.7, 0.15], [0.7, 0.2, 0.08]];
        const cc = cols[Math.floor(Math.random() * 3)];
        this.leaves.emit(x, heightAt(x, z) + rand(4, 8), z, rand(-0.5, 0.5), 0, rand(-0.5, 0.5), rand(5, 8), 0.18, cc[0], cc[1], cc[2], 1, 1, 1);
      }
    }
    // dust storm particles
    if (g.weather.cur.dust > 0.3) {
      for (let k = 0; k < 3; k++) {
        const x = fp.x + rand(-30, 30), z = fp.z + rand(-30, 30);
        this.dust.emit(x, heightAt(x, z) + rand(0, 3), z, wind.x * 0.8, rand(0, 0.5), wind.z * 0.8, rand(2, 4), rand(1.5, 3), 0.75, 0.6, 0.42, 0.25 * g.weather.cur.dust, 2, 0);
      }
    }
  }
}
