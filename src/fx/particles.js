import * as THREE from 'three';
import { softSprite } from '../core/utils.js';

// CPU-simulated point particles with per-particle size, color and alpha.
const vert = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
uniform float uScale;
#include <fog_pars_vertex>
void main(){
  vAlpha = aAlpha; vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const frag = /* glsl */`
uniform sampler2D uMap; varying float vAlpha; varying vec3 vColor;
#include <fog_pars_fragment>
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha);
  if (gl_FragColor.a < 0.003) discard;
  #include <fog_fragment>
}`;

export class ParticleSystem {
  constructor(scene, { capacity = 1500, additive = false, map = softSprite(), gravity = 0, drag = 0.5, fog = true } = {}) {
    this.cap = capacity;
    this.gravity = gravity;
    this.drag = drag;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: map }, uScale: { value: 600 } }]),
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, fog,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.material.uniforms.uMap.value = map;
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.head = 0;
    this.active = 0;
  }

  emit(x, y, z, vx, vy, vz, life, size, r, g, b, alpha = 1, grow = 1, grav = 1) {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.color[i3] = r; this.color[i3 + 1] = g; this.color[i3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size; this.size0[i] = size; this.grow[i] = grow;
    this.alpha0[i] = alpha; this.alpha[i] = alpha;
    this.grav[i] = grav;
  }

  update(dt, wind) {
    const dragK = Math.exp(-this.drag * dt);
    const wx = wind ? wind.x : 0, wz = wind ? wind.z : 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.gravity * this.grav[i] * dt;
      this.vel[i3] = this.vel[i3] * dragK + wx * dt * 0.5;
      this.vel[i3 + 1] *= dragK;
      this.vel[i3 + 2] = this.vel[i3 + 2] * dragK + wz * dt * 0.5;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const fadeIn = Math.min(1, (1 - k) * 8);
      this.alpha[i] = this.alpha0[i] * k * fadeIn;
      this.size[i] = this.size0[i] * (1 + (1 - k) * (this.grow[i] - 1));
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }

  setViewportScale(h) { this.material.uniforms.uScale.value = h * 0.9; }
}

// Rain / snow volume that follows the camera.
export class Precipitation {
  constructor(scene) {
    this.count = 6000;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.count * 6);
    this.seed = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      this.seed[i * 3] = (Math.random() - 0.5) * 80;
      this.seed[i * 3 + 1] = Math.random() * 40;
      this.seed[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xaabbd0, transparent: true, opacity: 0.35, fog: true });
    this.lines = new THREE.LineSegments(g, this.rainMat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.geo = g;

    this.snow = new ParticleSystem(scene, { capacity: 4000, drag: 0 });
    this.snowSeeds = [];
    for (let i = 0; i < 4000; i++) this.snowSeeds.push([(Math.random() - 0.5) * 70, Math.random() * 30, (Math.random() - 0.5) * 70, Math.random() * 10]);
    this.t = 0;
  }

  update(dt, center, rain, snow, wind) {
    this.t += dt;
    const n = Math.floor(this.count * rain);
    this.lines.visible = n > 0;
    if (n > 0) {
      const fall = 26;
      for (let i = 0; i < this.count; i++) {
        const o = i * 6;
        if (i >= n) { this.pos.fill(0, o, o + 6); continue; }
        const sx = this.seed[i * 3], sz = this.seed[i * 3 + 2];
        let y = (this.seed[i * 3 + 1] - this.t * fall) % 40; if (y < 0) y += 40;
        const px = center.x + sx + wind.x * 0.02 * y, pz = center.z + sz + wind.z * 0.02 * y;
        const py = center.y - 10 + y;
        this.pos[o] = px; this.pos[o + 1] = py; this.pos[o + 2] = pz;
        this.pos[o + 3] = px - wind.x * 0.03; this.pos[o + 4] = py + 0.7; this.pos[o + 5] = pz - wind.z * 0.03;
      }
      this.geo.attributes.position.needsUpdate = true;
    }
    // snow
    const sn = Math.floor(4000 * snow);
    const s = this.snow;
    for (let i = 0; i < 4000; i++) {
      if (i >= sn) { s.alpha[i] = 0; continue; }
      const sd = this.snowSeeds[i];
      let y = (sd[1] - this.t * 1.6) % 30; if (y < 0) y += 30;
      const sway = Math.sin(this.t * 0.8 + sd[3]) * 0.8;
      s.pos[i * 3] = center.x + sd[0] + sway + wind.x * 0.1 * y;
      s.pos[i * 3 + 1] = center.y - 6 + y;
      s.pos[i * 3 + 2] = center.z + sd[2] + Math.cos(this.t * 0.6 + sd[3]) * 0.8;
      s.size[i] = 0.12; s.alpha[i] = 0.9;
      s.color[i * 3] = s.color[i * 3 + 1] = s.color[i * 3 + 2] = 1;
    }
    s.geo.attributes.position.needsUpdate = true;
    s.geo.attributes.aSize.needsUpdate = true;
    s.geo.attributes.aAlpha.needsUpdate = true;
    s.geo.attributes.aColor.needsUpdate = true;
  }
}
