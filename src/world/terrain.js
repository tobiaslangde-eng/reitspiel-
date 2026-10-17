import * as THREE from 'three';
import { fbm2, noise2, ridged2, hash2 } from '../core/noise.js';
import { clamp, lerp, smoothstep, canvasTexture } from '../core/utils.js';

// ---------------------------------------------------------------------------
// World layout
// ---------------------------------------------------------------------------
export const WORLD_SIZE = 1600;
export const HALF = WORLD_SIZE / 2;
export const PLAY_LIMIT = 740;

export const RANCH = { x: 0, z: 0, h: 6, r: 85 };
export const TOWN = { x: 300, z: -150, h: 8, r: 78 };
export const ARENA = { x: 300, z: -30, h: 7.5, r: 52 };
export const POOL = { x: -150, z: -470, r: 20 };
export const SHELF = { x: -150, z: -509, r: 17, h: 40 };

export const RIVER = [
  [-150, -470], [-140, -400], [-120, -330], [-135, -260], [-112, -190], [-96, -120],
  [-100, -50], [-92, 20], [-110, 90], [-96, 160], [-62, 230], [-70, 300], [-42, 380],
  [-60, 460], [-30, 540], [-50, 620], [-30, 700], [-40, 830],
];
export const ROADS = [
  [[18, -10], [80, -45], [160, -92], [232, -140], [300, -150]],
  [[300, -150], [300, -30]],
  [[300, -150], [420, -175], [480, -150]],
  [[-12, 18], [-60, 40], [-130, 80]],
];

const FLATTEN = [
  { ...RANCH, blend: 45, bumps: 0.25 },
  { ...TOWN, blend: 40, bumps: 0 },
  { ...ARENA, blend: 30, bumps: 0 },
];

const MESAS = [
  { x: 180, z: 300, r: 38, h: 34 },
  { x: 260, z: 420, r: 26, h: 28 },
  { x: 90, z: 520, r: 30, h: 30 },
  { x: -250, z: 420, r: 22, h: 24 },
  { x: 340, z: 200, r: 20, h: 26 },
];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  return [Math.hypot(px - cx, pz - cz), t];
}

export function riverInfo(x, z) {
  let best = 1e9, seg = 0, bt = 0;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    // quick reject
    if (Math.abs(z - (a[1] + b[1]) / 2) > 140) continue;
    const [d, t] = segDist(x, z, a[0], a[1], b[0], b[1]);
    if (d < best) { best = d; seg = i; bt = t; }
  }
  // meander the channel with noise for a natural look
  const wiggle = noise2(x * 0.01, z * 0.01) * 6;
  const width = 8 + noise2(z * 0.004, 3.3) * 3;
  return { d: Math.max(0, best + wiggle * 0.25), width, seg, t: (seg + bt) / (RIVER.length - 1) };
}

export function roadDist(x, z) {
  let best = 1e9;
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const [d] = segDist(x, z, road[i][0], road[i][1], road[i + 1][0], road[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best + noise2(x * 0.05, z * 0.05) * 1.2;
}

export function mountainFactor(x, z) { return smoothstep(-300, -620, z) + smoothstep(640, 780, Math.max(Math.abs(x), Math.abs(z))) * 0.8; }
export function canyonFactor(x, z) { return smoothstep(380, 520, x) * (1 - smoothstep(-330, -500, z)); }
export function desertFactor(x, z) { return clamp(smoothstep(60, 320, x) * smoothstep(80, 360, z) + canyonFactor(x, z) * 0.9, 0, 1); }
export function forestFactor(x, z) {
  const region = smoothstep(-120, -260, x) * (1 - smoothstep(250, 420, z));
  const north = smoothstep(-250, -380, z) * (1 - smoothstep(-520, -620, z));
  const patch = smoothstep(0.1, 0.45, fbm2(x * 0.006 + 7, z * 0.006 - 3, 3));
  return clamp(Math.max(region, north * 0.9) * (0.4 + patch), 0, 1);
}

function terrace(h, step) {
  const k = h / step;
  const f = k - Math.floor(k);
  return (Math.floor(k) + smoothstep(0.35, 0.95, f)) * step;
}

function rawHeight(x, z) {
  let h = 5 + fbm2(x * 0.0028, z * 0.0028, 4) * 7;
  h += fbm2(x * 0.014, z * 0.014, 3) * 1.4;

  // Northern mountains
  const m = mountainFactor(x, z);
  if (m > 0) {
    const r = ridged2(x * 0.0042 + 11, z * 0.0042 - 5, 5);
    h += m * (r * 150 + 15);
  }

  // Eastern canyon lands
  const c = canyonFactor(x, z);
  if (c > 0) {
    const wx = x + noise2(x * 0.004, z * 0.004) * 60;
    const wz = z + noise2(x * 0.004 + 9, z * 0.004 + 9) * 60;
    const n = Math.abs(noise2(wx * 0.0055, wz * 0.0055));
    const n2 = Math.abs(noise2(wx * 0.011 + 40, wz * 0.011));
    const chan = smoothstep(0.05, 0.2, n) * smoothstep(0.02, 0.12, n2 + 0.05);
    const plateau = 46 + fbm2(x * 0.01, z * 0.01, 2) * 6;
    let ch = 5 + chan * (plateau - 5);
    ch = terrace(ch, 7);
    h = lerp(h, ch, c);
  }

  // Free-standing mesas & buttes in the prairie
  for (const ms of MESAS) {
    const d = Math.hypot(x - ms.x, z - ms.z) + noise2(x * 0.05, z * 0.05) * 5;
    if (d < ms.r + 12) {
      const top = ms.h + noise2(x * 0.03, z * 0.03) * 1.5;
      const k = 1 - smoothstep(ms.r - 4, ms.r + 10, d);
      h = Math.max(h, lerp(h, terrace(top * Math.pow(k, 0.35), 6), k));
    }
  }

  h = Math.max(h, 1.6);

  for (const f of FLATTEN) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + f.blend) {
      const t = smoothstep(f.r, f.r + f.blend, d);
      h = lerp(f.h + noise2(x * 0.03, z * 0.03) * f.bumps, h, t);
    }
  }

  // Shelf above the waterfall
  {
    const d = Math.hypot(x - SHELF.x, z - SHELF.z);
    if (d < SHELF.r + 20) {
      const t = smoothstep(SHELF.r, SHELF.r + 20, d);
      h = lerp(SHELF.h, Math.max(h, SHELF.h + 4), t);
      if (d < 10) h = lerp(SHELF.h - 1.6, SHELF.h, smoothstep(6, 10, d));
    }
  }
  return h;
}

export function heightAt(x, z) {
  let h = rawHeight(x, z);
  // River channel
  const ri = riverInfo(x, z);
  const w = ri.width;
  const valley = 16 + Math.max(0, h - 10) * 0.7 * smoothstep(50, 110, Math.hypot(x - POOL.x, z - POOL.z));
  if (ri.d < w + valley) {
    const bed = -1.25 - 0.6 * (1 - Math.min(1, ri.d / w));
    const t = smoothstep(w * 0.55, w + valley, ri.d);
    h = lerp(bed, h, t);
  }
  // Plunge pool
  const dp = Math.hypot(x - POOL.x, z - POOL.z);
  if (dp < POOL.r + 4) {
    const t = smoothstep(POOL.r * 0.6, POOL.r + 4, dp);
    h = lerp(-2.2, h, t);
  }
  return h;
}

export const WATER_LEVEL = 0;
export const SHELF_WATER = SHELF.h - 0.5;

export function waterDepthAt(x, z) {
  const h = heightAt(x, z);
  if (h < WATER_LEVEL) return WATER_LEVEL - h;
  if (Math.hypot(x - SHELF.x, z - SHELF.z) < 10 && h < SHELF_WATER) return SHELF_WATER - h;
  return 0;
}

export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 1.2;
  const hl = heightAt(x - e, z), hr = heightAt(x + e, z);
  const hd = heightAt(x, z - e), hu = heightAt(x, z + e);
  return out.set(hl - hr, 2 * e, hd - hu).normalize();
}

export function surfaceAt(x, z) {
  if (waterDepthAt(x, z) > 0.05) return 'water';
  const h = heightAt(x, z);
  if (roadDist(x, z) < 4) return 'sand';
  if (desertFactor(x, z) > 0.55) return 'sand';
  if (mountainFactor(x, z) > 0.5 && h > 30) return 'rock';
  if (canyonFactor(x, z) > 0.5) return 'sand';
  return 'grass';
}

// ---------------------------------------------------------------------------
// Coloring
// ---------------------------------------------------------------------------
const SEASON_GRASS = {
  spring: [0.30, 0.50, 0.16],
  summer: [0.50, 0.52, 0.22],
  autumn: [0.58, 0.45, 0.2],
  winter: [0.42, 0.42, 0.3],
};
const SAND = [0.74, 0.6, 0.42];
const RED_BANDS = [
  [0.70, 0.34, 0.19], [0.84, 0.52, 0.32], [0.62, 0.27, 0.17], [0.88, 0.66, 0.46], [0.76, 0.42, 0.24],
];
const ROCK = [0.46, 0.44, 0.42];
const FOREST_FLOOR = [0.26, 0.32, 0.14];

function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

export function colorAt(x, z, h, ny, season) {
  const grass = SEASON_GRASS[season] || SEASON_GRASS.summer;
  const patch = fbm2(x * 0.02, z * 0.02, 3);
  let c = mix3(grass, [grass[0] * 1.15, grass[1] * 1.1, grass[2]], patch * 0.5 + 0.5);
  if (season === 'spring') c = mix3(c, [0.42, 0.58, 0.2], smoothstep(0.2, 0.7, patch));

  const f = forestFactor(x, z);
  c = mix3(c, season === 'autumn' ? [0.42, 0.3, 0.14] : FOREST_FLOOR, f * 0.7);

  const d = desertFactor(x, z);
  const dryPatch = smoothstep(-0.3, 0.4, fbm2(x * 0.012 + 3, z * 0.012, 3));
  c = mix3(c, SAND, clamp(d * (0.6 + dryPatch * 0.6), 0, 1));

  // Canyon strata
  const cf = canyonFactor(x, z);
  const mf = MESAS.reduce((acc, m) => Math.max(acc, 1 - smoothstep(m.r - 2, m.r + 14, Math.hypot(x - m.x, z - m.z))), 0);
  const rockiness = Math.max(cf * smoothstep(7, 12, h), mf * smoothstep(4, 9, h), smoothstep(0.85, 0.65, ny) * 0.85);
  if (rockiness > 0) {
    const bandI = Math.floor((h + noise2(x * 0.02, z * 0.02) * 1.5) / 2.3);
    const band = RED_BANDS[((bandI % 5) + 5) % 5];
    const isMountain = mountainFactor(x, z) > 0.3;
    c = mix3(c, isMountain ? ROCK : band, clamp(rockiness, 0, 1));
  }
  // Mountains: grey rock, dark pine slopes
  const m = mountainFactor(x, z);
  if (m > 0.2 && h > 25) {
    const rock = mix3(ROCK, [0.36, 0.34, 0.33], patch * 0.5 + 0.5);
    c = mix3(c, rock, smoothstep(25, 70, h) * clamp(m * 1.4, 0, 1));
    const snowLine = 105 + noise2(x * 0.01, z * 0.01) * 15;
    c = mix3(c, [0.93, 0.95, 0.98], smoothstep(snowLine, snowLine + 12, h) * smoothstep(0.55, 0.8, ny));
  }
  // River banks / wet gravel
  const ri = riverInfo(x, z);
  const bank = 1 - smoothstep(ri.width - 1, ri.width + 5, ri.d);
  c = mix3(c, [0.48, 0.44, 0.36], bank * 0.85);
  if (h < 0.2) c = mix3(c, [0.36, 0.34, 0.28], 0.7);

  // Roads
  const rd = roadDist(x, z);
  const road = 1 - smoothstep(2.4, 4.6, rd);
  c = mix3(c, [0.6, 0.48, 0.34], road * 0.9);

  // Ranch & town yards are trampled dirt
  for (const fz of FLATTEN) {
    const dd = Math.hypot(x - fz.x, z - fz.z);
    const yard = 1 - smoothstep(fz.r * 0.35, fz.r * 0.75, dd + noise2(x * 0.05, z * 0.05) * 10);
    c = mix3(c, [0.58, 0.47, 0.34], yard * (fz === FLATTEN[0] ? 0.55 : 0.85));
  }
  // Main street of Dusty Creek
  const street = (1 - smoothstep(9, 14, Math.abs(z - TOWN.z))) * (1 - smoothstep(70, 85, Math.abs(x - TOWN.x)));
  c = mix3(c, [0.62, 0.5, 0.36], street * 0.95);
  const v = 0.92 + hash2(Math.floor(x * 0.5), Math.floor(z * 0.5)) * 0.1;
  return [c[0] * v, c[1] * v, c[2] * v];
}

// ---------------------------------------------------------------------------
// Mesh
// ---------------------------------------------------------------------------
export class Terrain {
  constructor(scene, quality = 'medium') {
    const segs = quality === 'low' ? 240 : quality === 'high' ? 440 : 360;
    const size = WORLD_SIZE + 200;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    this.geo = geo;

    const detail = canvasTexture(256, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = 0.5 + 0.25 * noise2(x * 0.09, y * 0.09) + 0.15 * noise2(x * 0.31, y * 0.31) + 0.1 * (Math.random() - 0.5);
        const i = (y * w + x) * 4;
        const v = clamp(n, 0, 1) * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, { repeat: true, linear: true });

    this.uniforms = {
      uDetail: { value: detail },
      uSnow: { value: 0 },
      uWet: { value: 0 },
    };
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix)*objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN; uniform sampler2D uDetail; uniform float uSnow; uniform float uWet;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float d1 = texture2D(uDetail, vWPos.xz*0.21).r;
          float d2 = texture2D(uDetail, vWPos.xz*0.031).r;
          vec3 bw = abs(vWN); bw /= (bw.x + bw.z + 0.0001);
          float d3 = mix(texture2D(uDetail, vWPos.xy*vec2(0.15,0.3)).r, texture2D(uDetail, vWPos.zy*vec2(0.15,0.3)).r, bw.x);
          float steep = 1.0 - smoothstep(0.55, 0.9, vWN.y);
          float det = mix(d1*0.6 + d2*0.4, d3, steep);
          diffuseColor.rgb *= 0.72 + det*0.62;
          float snowMask = smoothstep(0.62, 0.86, vWN.y) * smoothstep(0.25, 0.6, uSnow + (d2-0.5)*0.6) * step(0.3, vWPos.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92,0.94,0.98)*(0.9+d1*0.12), clamp(snowMask,0.0,1.0));
          diffuseColor.rgb *= 1.0 - uWet*0.28*(1.0-snowMask);
        `)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.45, uWet*0.8);`);
    };
    this.material = material;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    scene.add(this.mesh);

    this.buildHorizon(scene);
  }

  recolor(season) {
    const pos = this.geo.attributes.position;
    const nor = this.geo.attributes.normal;
    const col = this.geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
      const c = colorAt(x, z, h, nor.getY(i), season);
      // colorAt works in sRGB; vertex colors are linear
      col.setXYZ(i, Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2));
    }
    col.needsUpdate = true;
  }

  buildHorizon(scene) {
    // Far-away mountain ring, silhouettes fading into the haze.
    const geo = new THREE.CylinderGeometry(1500, 1500, 1, 256, 8, true);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      const a = Math.atan2(z, x);
      const hgt = 90 + ridged2(Math.cos(a) * 3 + 5, Math.sin(a) * 3, 4) * 260 + (a > -2.4 && a < -0.8 ? 120 : 0);
      pos.setY(i, y > 0 ? hgt : -40);
      const k = 1.0 + (y > 0 ? 0 : 0.05);
      pos.setX(i, x * k); pos.setZ(i, z * k);
    }
    geo.computeVertexNormals();
    this.horizonMat = new THREE.MeshBasicMaterial({ color: 0x8a95a8, side: THREE.BackSide, fog: false });
    const ring = new THREE.Mesh(geo, this.horizonMat);
    ring.renderOrder = -1;
    scene.add(ring);
    this.horizon = ring;
  }
}
