import * as THREE from 'three';
import { damp, rand } from '../core/utils.js';

export const WEATHER = {
  clear: { name: 'Sonnig', icon: '☀️', cloud: 0.12, rain: 0, storm: 0, fog: 0, dust: 0, snow: 0, wind: 0.3 },
  cloudy: { name: 'Bewölkt', icon: '⛅', cloud: 0.6, rain: 0, storm: 0.15, fog: 0.05, dust: 0, snow: 0, wind: 0.5 },
  rain: { name: 'Regen', icon: '🌧️', cloud: 0.85, rain: 0.7, storm: 0.45, fog: 0.15, dust: 0, snow: 0, wind: 0.6 },
  storm: { name: 'Gewitter', icon: '⛈️', cloud: 1, rain: 1, storm: 1, fog: 0.2, dust: 0, snow: 0, wind: 1 },
  fog: { name: 'Nebel', icon: '🌫️', cloud: 0.4, rain: 0, storm: 0, fog: 1, dust: 0, snow: 0, wind: 0.1 },
  dust: { name: 'Staubsturm', icon: '🌪️', cloud: 0.25, rain: 0, storm: 0, fog: 0, dust: 1, snow: 0, wind: 1 },
  snow: { name: 'Schnee', icon: '❄️', cloud: 0.75, rain: 0, storm: 0.2, fog: 0.2, dust: 0, snow: 1, wind: 0.4 },
};

const TABLE = {
  spring: [['clear', 4], ['cloudy', 3], ['rain', 3], ['storm', 1], ['fog', 1]],
  summer: [['clear', 6], ['cloudy', 2], ['storm', 2], ['dust', 2], ['rain', 1]],
  autumn: [['clear', 3], ['cloudy', 3], ['rain', 3], ['fog', 2], ['storm', 1]],
  winter: [['clear', 3], ['cloudy', 3], ['snow', 4], ['fog', 1]],
};

export class Weather {
  constructor(scene) {
    this.type = 'clear';
    this.override = null;
    this.cur = { ...WEATHER.clear };
    this.windDir = new THREE.Vector3(1, 0, 0.3).normalize();
    this.wind = new THREE.Vector3();
    this.nextChange = 3;
    this.flash = 0;
    this.nextBolt = 5;
    this.onThunder = null;
    this.snowCover = 0;
    this.wetness = 0;

    const boltMat = new THREE.LineBasicMaterial({ color: 0xeef2ff, transparent: true, opacity: 1, fog: false });
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), boltMat);
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    scene.add(this.bolt);
  }

  get info() { return WEATHER[this.type]; }

  setType(t) { this.type = t; }

  roll(season, hour) {
    if (this.override) { this.type = this.override; return; }
    if (hour > 4.5 && hour < 8.5 && season !== 'summer' && Math.random() < 0.45) { this.type = 'fog'; return; }
    const tbl = TABLE[season];
    let sum = tbl.reduce((a, b) => a + b[1], 0);
    let r = Math.random() * sum;
    for (const [t, w] of tbl) { r -= w; if (r <= 0) { this.type = t; break; } }
    if (this.type === 'fog' && (hour < 4 || hour > 11)) this.type = 'cloudy';
  }

  update(dt, gameHoursDelta, season, hour, focus, timeSec) {
    this.nextChange -= gameHoursDelta;
    if (this.nextChange <= 0) {
      this.roll(season, hour);
      this.nextChange = rand(3, 8);
    }
    if (this.override && this.type !== this.override) this.type = this.override;
    let tgt = WEATHER[this.type];
    if (season === 'winter' && this.type === 'rain') tgt = WEATHER.snow;
    for (const k of ['cloud', 'rain', 'storm', 'fog', 'dust', 'snow', 'wind']) {
      this.cur[k] = damp(this.cur[k], tgt[k], 0.25, dt);
    }
    // snow cover accumulates in winter and melts otherwise
    const snowTarget = season === 'winter' ? 1 : 0;
    this.snowCover = damp(this.snowCover, snowTarget, season === 'winter' ? 0.02 + this.cur.snow * 0.05 : 0.04, dt);
    this.wetness = damp(this.wetness, this.cur.rain > 0.2 ? 1 : 0, this.cur.rain > 0.2 ? 0.08 : 0.02, dt);

    const a = timeSec * 0.01;
    this.windDir.set(Math.cos(a), 0, Math.sin(a * 0.7)).normalize();
    this.wind.copy(this.windDir).multiplyScalar(this.cur.wind * 6);

    // Lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.cur.storm > 0.7 && this.cur.rain > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = rand(4, 14);
        this.strike(focus);
      }
    }
    if (this.bolt.visible) {
      this.boltLife -= dt;
      this.bolt.material.opacity = Math.max(0, this.boltLife * 4);
      if (this.boltLife <= 0) this.bolt.visible = false;
    }
  }

  strike(focus) {
    const ang = Math.random() * Math.PI * 2;
    const dist = rand(120, 400);
    const x = focus.x + Math.cos(ang) * dist, z = focus.z + Math.sin(ang) * dist;
    const pts = [];
    let px = x, pz = z;
    for (let y = 260; y > 0; y -= rand(10, 25)) {
      pts.push(new THREE.Vector3(px, y, pz));
      px += rand(-12, 12); pz += rand(-12, 12);
    }
    pts.push(new THREE.Vector3(px, 0, pz));
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.bolt.visible = true;
    this.boltLife = 0.35;
    this.flash = 1;
    if (this.onThunder) this.onThunder(dist / 340);
  }
}
