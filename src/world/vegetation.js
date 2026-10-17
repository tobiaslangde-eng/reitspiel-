import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise2 } from '../core/noise.js';
import { smoothstep, canvasTexture } from '../core/utils.js';
import {
  heightAt, normalAt, forestFactor, desertFactor, mountainFactor, canyonFactor, riverInfo, roadDist,
  RANCH, TOWN, ARENA, PLAY_LIMIT, HALF,
} from './terrain.js';
import { log } from './props.js';

const windChunk = (strength) => /* glsl */`
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float hk = max(0.0, transformed.y) * ${strength};
  float sw = sin(uTime*1.7 + ip.x*0.3 + ip.z*0.2) * 0.6 + sin(uTime*3.1 + ip.x) * 0.25;
  transformed.x += sw * hk * uWind;
  transformed.z += cos(uTime*1.3 + ip.z*0.3) * hk * uWind * 0.5;
`;

function addWind(material, uniforms, strength = '0.02') {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + windChunk(strength));
  };
}

const ni = (g) => (g.index ? g.toNonIndexed() : g);

function displace(geo, amt, seed) {
  const r = mulberry32(seed);
  const pos = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, (r() - 0.5) * amt);
    const d = map.get(k);
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const n = v.clone().normalize();
    v.addScaledVector(n, d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Card-based foliage: many small textured quads give soft, natural tree crowns.
// ---------------------------------------------------------------------------
let LEAF_TEX = null, NEEDLE_TEX = null;
export function leafTexture() {
  if (LEAF_TEX) return LEAF_TEX;
  const rnd = mulberry32(91);
  LEAF_TEX = canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 170; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * w * 0.42;
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r;
      const v = 150 + rnd() * 105, gg = 170 + rnd() * 85;
      g.fillStyle = `rgb(${v},${(v + gg) / 2},${v * 0.9})`;
      g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI * 2);
      g.beginPath(); g.ellipse(0, 0, 9 + rnd() * 6, 4 + rnd() * 3, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(40,60,20,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-8, 0); g.lineTo(8, 0); g.stroke();
      g.restore();
    }
  });
  return LEAF_TEX;
}
export function needleTexture() {
  if (NEEDLE_TEX) return NEEDLE_TEX;
  const rnd = mulberry32(17);
  NEEDLE_TEX = canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgb(120,100,70)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h * 0.95); g.stroke();
    for (let y = 4; y < h * 0.95; y += 3) {
      const len = (w * 0.45) * (1 - y / h * 0.6);
      for (const s of [-1, 1]) {
        const v = 170 + rnd() * 85;
        g.strokeStyle = `rgba(${v},${v},${v * 0.95},0.95)`; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + s * len * (0.7 + rnd() * 0.3), y + 8 + rnd() * 6); g.stroke();
      }
    }
  });
  return NEEDLE_TEX;
}

// Builds a merged geometry of quads with outward (spherical) normals for soft shading.
function cardCloud(cards) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (const c of cards) {
    const base = pos.length / 3;
    const { p, right, up, n, shade, normalFrom } = c;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [u, v] of corners) {
      const x = p.x + right.x * u + up.x * v, y = p.y + right.y * u + up.y * v, z = p.z + right.z * u + up.z * v;
      pos.push(x, y, z);
      const nn = n || new THREE.Vector3(x - normalFrom.x, y - normalFrom.y, z - normalFrom.z).normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push((u + 1) / 2, (v + 1) / 2);
      col.push(shade, shade, shade);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export function pineFoliage(seed = 4) {
  const r = mulberry32(seed);
  const cards = [];
  const H = 9.5, base = 1.6;
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const y = base + t * (H - base);
    const rad = (1 - t) * 2.6 + 0.25;
    const a = i * 2.39996 + r() * 0.4;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const len = rad * (0.6 + r() * 0.3);
    const center = new THREE.Vector3(dir.x * len * 0.55, y - len * 0.18, dir.z * len * 0.55);
    // card lies along the branch, drooping slightly
    const along = dir.clone().multiplyScalar(len * 0.6).add(new THREE.Vector3(0, -len * 0.18, 0));
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(len * 0.32);
    const shade = 0.55 + t * 0.4 + r() * 0.1;
    cards.push({ p: center, right: side, up: along, normalFrom: new THREE.Vector3(0, y - 1.5, 0), shade });
    cards.push({ p: center.clone().add(new THREE.Vector3(0, 0.08, 0)), right: new THREE.Vector3(0, len * 0.25, 0), up: along, normalFrom: new THREE.Vector3(0, y - 1.5, 0), shade: shade * 0.9 });
  }
  return cardCloud(cards);
}

export function leafyFoliage(seed = 1) {
  const r = mulberry32(seed);
  const cards = [];
  const lobes = [];
  for (let i = 0; i < 7; i++) lobes.push({ c: new THREE.Vector3((r() - 0.5) * 3.4, 5.2 + r() * 2.8, (r() - 0.5) * 3.4), rad: 1.5 + r() * 1.1 });
  lobes.push({ c: new THREE.Vector3(0, 7.6, 0), rad: 1.8 });
  const center = new THREE.Vector3(0, 6.2, 0);
  for (const lb of lobes) {
    for (let i = 0; i < 16; i++) {
      const d = new THREE.Vector3(r() - 0.5, r() - 0.4, r() - 0.5).normalize();
      const p = lb.c.clone().addScaledVector(d, lb.rad * (0.55 + r() * 0.5));
      const size = 0.9 + r() * 0.6;
      const right = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize().multiplyScalar(size);
      const up = new THREE.Vector3().crossVectors(d, right).normalize().multiplyScalar(size);
      const shade = 0.5 + Math.max(0, (p.y - 5) / 4) * 0.45 + r() * 0.1;
      cards.push({ p, right, up, normalFrom: center, shade: Math.min(1, shade) });
    }
  }
  return cardCloud(cards);
}

function trunkGeo(h = 4.5, r = 0.3) {
  const g = new THREE.CylinderGeometry(r * 0.6, r, h, 7);
  g.translate(0, h / 2, 0);
  return g;
}
function branchyTrunk(seed = 3) {
  const r = mulberry32(seed);
  const parts = [trunkGeo(5.5, 0.35)];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.CylinderGeometry(0.06, 0.14, 2.4, 5);
    b.translate(0, 1.2, 0);
    b.rotateZ(0.6 + r() * 0.5);
    b.rotateY(r() * Math.PI * 2);
    b.translate(0, 3 + r() * 2.2, 0);
    parts.push(b);
  }
  return mergeGeometries(parts.map(ni));
}
function cactusGeo() {
  const parts = [];
  const c = new THREE.CapsuleGeometry(0.3, 3.4, 4, 10); c.translate(0, 2, 0); parts.push(c);
  const e1 = new THREE.CapsuleGeometry(0.2, 0.5, 3, 8); e1.rotateZ(Math.PI / 2); e1.translate(-0.5, 1.8, 0); parts.push(e1);
  const a1 = new THREE.CapsuleGeometry(0.2, 1.3, 3, 8); a1.translate(-0.8, 2.5, 0); parts.push(a1);
  const e2 = new THREE.CapsuleGeometry(0.2, 0.4, 3, 8); e2.rotateZ(Math.PI / 2); e2.translate(0.45, 2.5, 0); parts.push(e2);
  const a2 = new THREE.CapsuleGeometry(0.2, 0.9, 3, 8); a2.translate(0.7, 3.0, 0); parts.push(a2);
  return mergeGeometries(parts.map(ni));
}
function bushGeo() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.IcosahedronGeometry(0.45 + (i % 2) * 0.15, 0);
    g.translate(Math.cos(i * 1.7) * 0.4, 0.35, Math.sin(i * 1.7) * 0.4);
    parts.push(g);
  }
  return displace(mergeGeometries(parts), 0.15, 5);
}

// Splits a large instanced set into spatial cells so frustum and shadow culling work per cell.
const CELL = 180;
class CellBatch {
  constructor(geo, mat, pts) {
    this.cells = new Map();
    this.map = [];
    pts.forEach((p, i) => {
      const k = Math.floor(p[0] / CELL) + ',' + Math.floor(p[2] / CELL);
      let c = this.cells.get(k);
      if (!c) { c = { n: 0 }; this.cells.set(k, c); }
      this.map.push([c, c.n++]);
    });
    this.meshes = [];
    for (const c of this.cells.values()) {
      c.mesh = new THREE.InstancedMesh(geo, mat, c.n);
      this.meshes.push(c.mesh);
    }
    const self = this;
    this.instanceColor = { set needsUpdate(v) { for (const m of self.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = v; } };
  }
  setMatrixAt(i, m) { const [c, j] = this.map[i]; c.mesh.setMatrixAt(j, m); }
  setColorAt(i, col) { const [c, j] = this.map[i]; c.mesh.setColorAt(j, col); }
  set visible(v) { for (const m of this.meshes) m.visible = v; }
  set castShadow(v) { for (const m of this.meshes) m.castShadow = v; }
  set receiveShadow(v) { for (const m of this.meshes) m.receiveShadow = v; }
  addTo(scene) {
    for (const m of this.meshes) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); scene.add(m); }
  }
}

export class Vegetation {
  constructor(scene, colliders, quality = 'medium') {
    this.scene = scene;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.4 } };
    const q = quality === 'low' ? 0.5 : quality === 'high' ? 1.3 : 1;
    const rnd = mulberry32(2024);
    const dummy = new THREE.Object3D();

    const avoid = (x, z) => {
      for (const p of [RANCH, TOWN, ARENA]) if (Math.hypot(x - p.x, z - p.z) < p.r + 12) return true;
      if (roadDist(x, z) < 6) return true;
      if (riverInfo(x, z).d < 12) return true;
      return Math.abs(x) > PLAY_LIMIT + 40 || Math.abs(z) > PLAY_LIMIT + 40;
    };

    const scatter = (count, density, minSlope = 0.75) => {
      const out = [];
      let tries = 0;
      while (out.length < count && tries < count * 30) {
        tries++;
        const x = (rnd() - 0.5) * (HALF * 2 - 20), z = (rnd() - 0.5) * (HALF * 2 - 20);
        if (avoid(x, z)) continue;
        if (rnd() > density(x, z)) continue;
        const n = normalAt(x, z);
        if (n.y < minSlope) continue;
        out.push([x, heightAt(x, z), z]);
      }
      return out;
    };

    // --- Pines ---
    const pinePts = scatter(Math.floor(2600 * q), (x, z) => {
      const m = mountainFactor(x, z);
      const h = heightAt(x, z);
      return Math.max(forestFactor(x, z) * 0.9, m * (h < 100 ? 0.55 : 0)) * (1 - desertFactor(x, z));
    });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 });
    const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: needleTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
    addWind(pineMat, this.uniforms, '0.012');
    this.pineTrunk = new CellBatch(trunkGeo(3, 0.3), trunkMat, pinePts);
    this.pine = new CellBatch(pineFoliage(), pineMat, pinePts);
    pinePts.forEach((p, i) => {
      const s = 0.7 + rnd() * 0.8;
      dummy.position.set(p[0], p[1] - 0.2, p[2]);
      dummy.rotation.set(0, rnd() * 6, 0);
      dummy.scale.set(s, s * (0.9 + rnd() * 0.3), s);
      dummy.updateMatrix();
      this.pineTrunk.setMatrixAt(i, dummy.matrix);
      this.pine.setMatrixAt(i, dummy.matrix);
      colliders.addCircle(p[0], p[2], 0.45 * s, 1e9, 'tree');
    });
    this.pineCount = pinePts.length;

    // --- Deciduous (cottonwood / aspen) ---
    const leafPts = scatter(Math.floor(1500 * q), (x, z) => {
      const nearRiver = 1 - smoothstep(14, 70, riverInfo(x, z).d);
      return Math.max(forestFactor(x, z) * 0.55, nearRiver * 0.6) * (1 - mountainFactor(x, z) * 0.8) * (1 - desertFactor(x, z) * 0.8);
    });
    // Ranch shade trees
    for (const [x, z] of [[-30, -32], [38, -38], [-42, 30], [55, 40], [-20, 52]]) leafPts.push([x, heightAt(x, z), z]);
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
    addWind(leafMat, this.uniforms, '0.03');
    this.leafTrunk = new CellBatch(branchyTrunk(), trunkMat, leafPts);
    this.leaf = new CellBatch(leafyFoliage(7), leafMat, leafPts);
    this.leafSeeds = [];
    leafPts.forEach((p, i) => {
      const s = 0.75 + rnd() * 0.6;
      dummy.position.set(p[0], p[1] - 0.2, p[2]);
      dummy.rotation.set(0, rnd() * 6, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      this.leafTrunk.setMatrixAt(i, dummy.matrix);
      this.leaf.setMatrixAt(i, dummy.matrix);
      this.leafSeeds.push(rnd());
      colliders.addCircle(p[0], p[2], 0.5 * s, 1e9, 'tree');
    });
    this.leafPts = leafPts;

    // --- Cacti ---
    const cactPts = scatter(Math.floor(500 * q), (x, z) => desertFactor(x, z) * 0.5 * (1 - smoothstep(10, 30, heightAt(x, z))));
    const cactMat = new THREE.MeshStandardMaterial({ color: 0x527a3c, roughness: 0.8 });
    this.cactus = new CellBatch(cactusGeo(), cactMat, cactPts);
    cactPts.forEach((p, i) => {
      const s = 0.7 + rnd() * 0.7;
      dummy.position.set(p[0], p[1] - 0.1, p[2]); dummy.rotation.set(0, rnd() * 6, 0); dummy.scale.set(s, s * (0.8 + rnd() * 0.5), s);
      dummy.updateMatrix(); this.cactus.setMatrixAt(i, dummy.matrix);
      colliders.addCircle(p[0], p[2], 0.4 * s, 1e9, 'cactus');
    });

    // --- Rocks ---
    const rockPts = scatter(Math.floor(900 * q), (x, z) => 0.15 + canyonFactor(x, z) * 0.5 + mountainFactor(x, z) * 0.4 + desertFactor(x, z) * 0.2, 0.5);
    const rockGeo = displace(new THREE.DodecahedronGeometry(1, 1), 0.35, 9);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: false });
    this.rocks = new CellBatch(rockGeo, rockMat, rockPts);
    const col = new THREE.Color();
    rockPts.forEach((p, i) => {
      const s = 0.4 + Math.pow(rnd(), 2.2) * 2.6;
      dummy.position.set(p[0], p[1] + s * 0.15, p[2]); dummy.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3);
      dummy.scale.set(s * (0.8 + rnd() * 0.6), s * (0.5 + rnd() * 0.4), s * (0.8 + rnd() * 0.6));
      dummy.updateMatrix(); this.rocks.setMatrixAt(i, dummy.matrix);
      const red = canyonFactor(p[0], p[2]) + desertFactor(p[0], p[2]) * 0.5;
      col.setRGB(0.5 + red * 0.25, 0.47 + red * 0.02, 0.44 - red * 0.12, THREE.SRGBColorSpace).multiplyScalar(0.8 + rnd() * 0.3);
      this.rocks.setColorAt(i, col);
      if (s > 0.9) colliders.addCircle(p[0], p[2], s * 0.8, p[1] + s * 0.6, s > 1.6 ? 'rock' : 'jump');
    });

    // --- Bushes / sagebrush ---
    const bushPts = scatter(Math.floor(1800 * q), (x, z) => 0.25 + desertFactor(x, z) * 0.4 + forestFactor(x, z) * 0.2);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    addWind(bushMat, this.uniforms, '0.04');
    this.bushes = new CellBatch(bushGeo(), bushMat, bushPts);
    this.bushInfo = [];
    bushPts.forEach((p, i) => {
      const s = 0.6 + rnd() * 0.9;
      dummy.position.set(p[0], p[1] - 0.05, p[2]); dummy.rotation.set(0, rnd() * 6, 0); dummy.scale.set(s, s * 0.8, s);
      dummy.updateMatrix(); this.bushes.setMatrixAt(i, dummy.matrix);
      this.bushInfo.push(desertFactor(p[0], p[2]));
    });

    for (const m of [this.pineTrunk, this.pine, this.leafTrunk, this.leaf, this.cactus, this.rocks, this.bushes]) {
      m.castShadow = true; m.receiveShadow = true;
      m.addTo(scene);
    }
    this.bushes.castShadow = false;

    // --- Fallen logs (jumpable) along open land ---
    this.logs = [];
    const logPts = scatter(70, (x, z) => (1 - desertFactor(x, z)) * (1 - mountainFactor(x, z)) * 0.6, 0.9);
    const extraLogs = [[40, 120, 0.3], [70, 160, 1.2], [-40, -120, 0.1], [130, 40, 1.57], [150, -10, 0.4], [-60, -200, 0.8]];
    for (const [x, z, r] of extraLogs) logPts.push([x, heightAt(x, z), z, r]);
    for (const p of logPts) {
      const l = log(3.6, 0.3);
      const rot = p[3] ?? rnd() * Math.PI;
      l.position.set(p[0], p[1] - 0.05, p[2]);
      l.rotation.y = rot;
      scene.add(l);
      const dx = Math.cos(rot) * 1.8, dz = -Math.sin(rot) * 1.8;
      colliders.addSegment(p[0] - dx, p[2] - dz, p[0] + dx, p[2] + dz, 0.6, p[1] + 0.55, 'jump');
      this.logs.push(l);
    }
  }

  setSeason(season) {
    const col = new THREE.Color();
    const rnd = mulberry32(77);
    for (let i = 0; i < this.pineCount; i++) {
      col.setRGB(0.16, 0.3, 0.16, THREE.SRGBColorSpace).multiplyScalar(0.8 + rnd() * 0.4);
      if (season === 'winter') col.lerp(new THREE.Color(0.75, 0.8, 0.85), 0.45);
      this.pine.setColorAt(i, col);
    }
    this.pine.instanceColor.needsUpdate = true;
    const autumn = [[0.85, 0.45, 0.1], [0.9, 0.7, 0.15], [0.7, 0.2, 0.08], [0.8, 0.55, 0.12]];
    for (let i = 0; i < this.leafPts.length; i++) {
      const s = this.leafSeeds[i];
      if (season === 'spring') col.setRGB(0.42, 0.66, 0.2, THREE.SRGBColorSpace).multiplyScalar(0.85 + s * 0.3);
      else if (season === 'summer') col.setRGB(0.26, 0.48, 0.15, THREE.SRGBColorSpace).multiplyScalar(0.85 + s * 0.3);
      else if (season === 'autumn') { const a = autumn[Math.floor(s * 4)]; col.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace); }
      else col.setRGB(0.5, 0.45, 0.4, THREE.SRGBColorSpace);
      this.leaf.setColorAt(i, col);
    }
    this.leaf.instanceColor.needsUpdate = true;
    this.leaf.visible = season !== 'winter';
    for (let i = 0; i < this.bushInfo.length; i++) {
      const d = this.bushInfo[i];
      const g = { spring: [0.4, 0.55, 0.25], summer: [0.45, 0.5, 0.3], autumn: [0.6, 0.45, 0.25], winter: [0.55, 0.5, 0.45] }[season];
      col.setRGB(g[0], g[1], g[2], THREE.SRGBColorSpace).lerp(new THREE.Color(0x8a9070), d * 0.7);
      this.bushes.setColorAt(i, col);
    }
    this.bushes.instanceColor.needsUpdate = true;
  }

  update(time, wind) {
    this.uniforms.uTime.value = time;
    this.uniforms.uWind.value = 0.25 + wind * 1.2;
  }
}

// ---------------------------------------------------------------------------
// Grass & flowers in chunks around the player
// ---------------------------------------------------------------------------
const CHUNK = 28;

function bladeGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BufferGeometry();
    const w = 0.09, h = 0.55;
    const verts = [];
    for (let b = 0; b < 4; b++) {
      const ox = (b - 1.5) * 0.12, lean = (b % 2 ? 0.08 : -0.06);
      verts.push(ox - w, 0, 0, ox + w, 0, 0, ox + lean, h * (0.8 + (b % 3) * 0.15), 0.03);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.rotateY((i / 3) * Math.PI);
    g.computeVertexNormals();
    parts.push(g);
  }
  const m = mergeGeometries(parts);
  const pos = m.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const t = pos.getY(i) / 0.55; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.45 + t * 0.7; }
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // normals point up for soft lighting
  const n = m.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return m;
}

function flowerGeo() {
  const stem = new THREE.CylinderGeometry(0.01, 0.01, 0.4, 3); stem.translate(0, 0.2, 0);
  const head = new THREE.IcosahedronGeometry(0.06, 0); head.translate(0, 0.42, 0);
  const s = ni(stem), hd = ni(head);
  const sc = new Float32Array(s.attributes.position.count * 3);
  for (let i = 0; i < sc.length; i += 3) { sc[i] = 0.25; sc[i + 1] = 0.5; sc[i + 2] = 0.2; }
  s.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const hc = new Float32Array(hd.attributes.position.count * 3).fill(1);
  hd.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  s.deleteAttribute('uv'); hd.deleteAttribute('uv');
  return mergeGeometries([s, hd]);
}

export class Grass {
  constructor(scene, quality = 'medium') {
    this.scene = scene;
    this.perChunk = quality === 'low' ? 220 : quality === 'high' ? 950 : 600;
    this.radius = quality === 'low' ? 2 : 3;
    this.chunks = new Map();
    this.pool = [];
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.4 }, uTint: { value: new THREE.Color(0.5, 0.55, 0.25) }, uSnow: { value: 0 } };
    this.geo = bladeGeo();
    this.fgeo = flowerGeo();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
    this.mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uTime: this.uniforms.uTime, uWind: this.uniforms.uWind, uTint: this.uniforms.uTint, uSnow: this.uniforms.uSnow });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; uniform vec3 uTint; uniform float uSnow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + windChunk('0.35') + '\ntransformed.y *= 1.0 - uSnow*0.6;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n vColor.rgb *= uTint;');
    };
    this.fmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    addWind(this.fmat, this.uniforms, '0.3');
    this.flowerDensity = 0.2;
  }

  setSeason(season) {
    const t = { spring: [0.48, 0.72, 0.24], summer: [0.66, 0.66, 0.3], autumn: [0.7, 0.55, 0.3], winter: [0.55, 0.52, 0.42] }[season];
    this.uniforms.uTint.value.setRGB(t[0], t[1], t[2], THREE.SRGBColorSpace);
    this.flowerDensity = { spring: 1, summer: 0.3, autumn: 0.05, winter: 0 }[season];
    for (const c of this.chunks.values()) this.release(c);
    this.chunks.clear();
  }

  release(c) {
    this.scene.remove(c.grass); this.scene.remove(c.flowers);
    this.pool.push(c);
  }

  build(cx, cz) {
    const rnd = mulberry32(cx * 7919 + cz * 104729);
    let c = this.pool.pop();
    if (!c) {
      c = {
        grass: new THREE.InstancedMesh(this.geo, this.mat, this.perChunk),
        flowers: new THREE.InstancedMesh(this.fgeo, this.fmat, 120),
      };
      c.grass.receiveShadow = true;
      c.grass.frustumCulled = false;
      c.flowers.frustumCulled = false;
      c.flowers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(120 * 3), 3);
    }
    const d = new THREE.Object3D();
    let n = 0, nf = 0;
    const fcols = [[1, 0.85, 0.2], [0.95, 0.35, 0.55], [0.6, 0.45, 0.95], [1, 1, 1], [1, 0.5, 0.15], [0.4, 0.6, 1]];
    for (let i = 0; i < this.perChunk * 1.6 && n < this.perChunk; i++) {
      const x = cx * CHUNK + rnd() * CHUNK, z = cz * CHUNK + rnd() * CHUNK;
      const des = desertFactor(x, z);
      const m = mountainFactor(x, z);
      const h = heightAt(x, z);
      if (h < 0.3 || rnd() < des * 0.8 || (m > 0.4 && h > 60) || canyonFactor(x, z) > 0.5) continue;
      if (roadDist(x, z) < 3.5) continue;
      if (Math.abs(z - TOWN.z) < 14 && Math.abs(x - TOWN.x) < 85) continue;
      if (Math.abs(x - ARENA.x) < 33 && Math.abs(z - ARENA.z) < 21) continue;
      let yard = false;
      for (const p of [RANCH, TOWN, ARENA]) if (Math.hypot(x - p.x, z - p.z) < p.r * 0.6) yard = true;
      if (yard && rnd() < 0.85) continue;
      const patch = noise2(x * 0.08, z * 0.08);
      if (patch < -0.45) continue;
      d.position.set(x, h - 0.02, z);
      d.rotation.set(0, rnd() * 6, 0);
      const s = 0.7 + rnd() * 0.8 + patch * 0.3;
      d.scale.set(s, s * (1 - des * 0.4), s);
      d.updateMatrix();
      c.grass.setMatrixAt(n++, d.matrix);
      if (nf < 120 && rnd() < this.flowerDensity * 0.25 * (1 - des) * (patch > 0 ? 1.6 : 0.6)) {
        d.position.x += 0.3;
        d.scale.setScalar(0.8 + rnd() * 0.6);
        d.updateMatrix();
        c.flowers.setMatrixAt(nf, d.matrix);
        const fc = fcols[Math.floor(noise2(x * 0.03, z * 0.03) * 3 + 3 + rnd() * 1.5) % fcols.length];
        c.flowers.instanceColor.setXYZ(nf, fc[0], fc[1], fc[2]);
        nf++;
      }
    }
    c.grass.count = n;
    c.flowers.count = nf;
    c.grass.instanceMatrix.needsUpdate = true;
    c.flowers.instanceMatrix.needsUpdate = true;
    c.flowers.instanceColor.needsUpdate = true;
    this.scene.add(c.grass, c.flowers);
    return c;
  }

  update(center, time, wind, snow) {
    this.uniforms.uTime.value = time;
    this.uniforms.uWind.value = 0.3 + wind * 1.4;
    this.uniforms.uSnow.value = snow;
    const ccx = Math.floor(center.x / CHUNK), ccz = Math.floor(center.z / CHUNK);
    const need = new Set();
    let built = 0;
    for (let dx = -this.radius; dx <= this.radius; dx++) {
      for (let dz = -this.radius; dz <= this.radius; dz++) {
        const k = `${ccx + dx},${ccz + dz}`;
        need.add(k);
        if (!this.chunks.has(k) && built < 2) {
          this.chunks.set(k, this.build(ccx + dx, ccz + dz));
          built++;
        }
      }
    }
    for (const [k, c] of this.chunks) {
      if (!need.has(k)) { this.release(c); this.chunks.delete(k); }
    }
  }
}
