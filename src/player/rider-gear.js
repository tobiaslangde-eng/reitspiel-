// Things the rider wears and carries that are not part of the skinned body mesh: hat, hair, braid,
// scarf, spurs. Everything is generated at load time from a few parameters (no external assets).
import * as THREE from 'three';
import { canvasTexture } from '../core/utils.js';
import { GLSL_NOISE } from '../core/noise.js';
import { mulberry32 } from '../core/noise.js';
import { JOINT } from './skeleton.js';
import { deriveShell, weightArrays } from './rider-derive.js';

// ---------------------------------------------------------------------------------------------
// Hat (head-local coordinates, origin = hat band centre). Cattleman crease, rolled brim, felt.
// ---------------------------------------------------------------------------------------------
function ellipseRing(ax, az, n, fn) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(fn(Math.sin(a), Math.cos(a), a));
  }
  return pts;
}

export function hatGeometry() {
  const N = 48;
  const baseX = 0.083, baseZ = 0.099;
  const crownH = 0.118;
  const pos = [], idx = [];
  const grid = (rows, point) => {
    const start = pos.length / 3;
    for (let j = 0; j <= rows; j++) {
      const ring = point(j / rows);
      for (const p of ring) pos.push(p[0], p[1], p[2]);
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < N; i++) {
        const a = start + j * N + i, b = start + j * N + (i + 1) % N, c = start + (j + 1) * N + i, d = start + (j + 1) * N + (i + 1) % N;
        idx.push(a, c, b, b, c, d);
      }
    }
  };
  // crown: ellipse rings tapering towards the top, the front pinched, a crease along the top
  const crown = (t) => ellipseRing(baseX, baseZ, N, (s, c) => {
    const taper = 1 - 0.2 * Math.pow(t, 1.5);
    const round = t > 0.86 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.86) / 0.14, 2))) : 1;
    const y = t > 0.86 ? crownH * (0.86 + 0.14 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - round, 2)))) : crownH * t;
    const front = Math.max(0, c);
    let x = s * baseX * taper * round * (1 - 0.14 * front * t);
    const z = c * baseZ * taper * round;
    let yy = y;
    // crease along the top, deeper towards the front
    const crease = Math.exp(-Math.pow(x / 0.026, 2)) * Math.pow(Math.max(0, t - 0.55) / 0.45, 1.5) * (0.018 + 0.012 * front);
    yy -= crease;
    // pinch the front sides
    x *= 1 - 0.1 * Math.exp(-Math.pow((c - 0.8) / 0.4, 2)) * t;
    return [x, yy, z];
  });
  // slightly more rows near the top for the rounded edge
  grid(18, (u) => crown(Math.pow(u, 0.8)));
  // top cap
  const capStart = pos.length / 3;
  pos.push(0, crownH - 0.02, 0.0);
  const last = capStart - N;
  for (let i = 0; i < N; i++) idx.push(capStart, last + i, last + (i + 1) % N);

  // brim: top surface, edge, bottom surface
  const brimW = 0.072;
  const brimPoint = (u, thick) => ellipseRing(baseX, baseZ, N, (s, c) => {
    const r = u;
    const side = Math.abs(s);
    const roll = (0.045 * side * side - 0.012 * Math.max(0, c) - 0.006 * Math.max(0, -c)) * Math.pow(u, 1.6);
    const x = s * (baseX + 0.004 + (brimW + 0.01 * side) * r);
    const z = c * (baseZ + 0.004 + (brimW + 0.016 * Math.max(0, c)) * r);
    return [x, 0.002 + roll + thick, z];
  });
  grid(6, (u) => brimPoint(u, 0.0017));
  // outer edge (rolled): connect top outer ring to bottom outer ring through a half circle
  const edgeRows = 3;
  grid(edgeRows, (u) => {
    const a = u * Math.PI;
    const top = brimPoint(1, 0.0017), bot = brimPoint(1, -0.0017);
    return top.map((p, i) => [p[0] * (1 + 0.0 * Math.sin(a)) + Math.sign(p[0]) * 0.0016 * Math.sin(a), (p[1] + bot[i][1]) / 2 + (p[1] - bot[i][1]) / 2 * Math.cos(a), p[2] + Math.sign(p[2]) * 0.0016 * Math.sin(a) * 0.0]);
  });
  grid(6, (u) => brimPoint(1 - u, -0.0017));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function bandGeometry() {
  // band around the crown base, a little thicker than the felt
  const N = 48;
  const pos = [], idx = [];
  const h0 = 0.004, h1 = 0.03;
  for (const [y, k] of [[h0, 1.0], [h1, 0.985]]) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pos.push(Math.sin(a) * (0.0835 * k + 0.0015), y, Math.cos(a) * (0.0995 * k + 0.0015));
    }
  }
  for (let i = 0; i < N; i++) { const a = i, b = (i + 1) % N; idx.push(a, N + a, b, b, N + a, N + b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let FELT_TEX = null;
function feltTexture() {
  if (FELT_TEX) return FELT_TEX;
  const rnd = mulberry32(31);
  FELT_TEX = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 100 + rnd() * 90;
      g.strokeStyle = `rgba(${v},${v},${v},0.5)`;
      g.lineWidth = 1;
      const x = rnd() * w, y = rnd() * h, a = rnd() * 6.28, l = 2 + rnd() * 5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, { repeat: true, linear: true });
  return FELT_TEX;
}

export function makeFeltMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.95, side: THREE.DoubleSide, bumpMap: feltTexture(), bumpScale: 1.2 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHatPos;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.9 + 0.2 * fract( sin( dot( floor( vHatPos * 900.0 ), vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );`);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHatPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHatPos = position;');
  };
  m.customProgramCacheKey = () => 'hatFelt1';
  return m;
}

// UVs for the bump map: planar from above (the felt has no visible seams)
export function addPlanarUV(g, scale = 4) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * scale + p.getY(i) * 3; uv[i * 2 + 1] = p.getZ(i) * scale + p.getY(i) * 5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Pieces cut out of the body / head meshes (see rider-derive.js)
// ---------------------------------------------------------------------------------------------
const HJ = JOINT.head;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// hair on the skull: long hair reaches down the back of the head, short hair stops above the ears and nape
export function hairCapGeometry(headGeo, male) {
  const field = (x, y, z) => {
    const lx = x - HJ[0], ly = y - HJ[1], lz = z - (HJ[2] - 0.012);
    const phi = Math.atan2(Math.abs(lx), lz); // 0 at the front, pi at the back
    let h;
    if (male) {
      h = phi < 0.55 ? 0.112 : phi < 1.5 ? 0.112 - 0.034 * ((phi - 0.55) / 0.95) : phi < 2.3 ? 0.078 + 0.002 * (phi - 1.5) : 0.062 - 0.05 * ((phi - 2.3) / 0.84);
      if (phi > 1.15 && phi < 2.1 && Math.abs(lx) > 0.06) h = Math.max(h, 0.085); // clear the ears
    } else {
      h = phi < 0.55 ? 0.115 : phi < 1.5 ? 0.115 - 0.033 * ((phi - 0.55) / 0.95) : phi < 2.1 ? 0.082 - 0.04 * ((phi - 1.5) / 0.6) : 0.042 - 0.075 * ((phi - 2.1) / 1.04);
      if (phi > 1.1 && phi < 1.9 && Math.abs(lx) > 0.065) h = Math.max(h, 0.082);
    }
    return ly - h;
  };
  return deriveShell(headGeo, field, (f) => 0.0035 + 0.005 * sstep(0.01, 0.08, f));
}

// braid: three twisted strands hanging from the nape, a small chain of bones lets it swing
export function braidParts(length = 0.4, segs = 6) {
  const rings = 30, around = 14;
  const pos = [], nor = [], si = [], sw = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const y = -t * length;
    const rad = 0.0225 * (1 - 0.5 * Math.pow(t, 1.3)) + (t > 0.94 ? -0.004 * (t - 0.94) / 0.06 : 0);
    const u = t * segs;
    const b0 = Math.min(segs - 1, Math.floor(u)), fr = u - b0;
    for (let a = 0; a < around; a++) {
      const ang = (a / around) * Math.PI * 2;
      pos.push(Math.sin(ang) * rad * 1.0, y, Math.cos(ang) * rad * 0.9);
      nor.push(Math.sin(ang), 0, Math.cos(ang));
      si.push(b0, Math.min(segs - 1, b0 + 1), 0, 0);
      sw.push(1 - fr, fr, 0, 0);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let a = 0; a < around; a++) {
      const A = r * around + a, B = r * around + (a + 1) % around, C = (r + 1) * around + a, D = (r + 1) * around + (a + 1) % around;
      idx.push(A, C, B, B, C, D);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  return { geometry: g, segs, length };
}

// ---------------------------------------------------------------------------------------------
// Fringe: thin strips hanging from the cut edge of a shell
// ---------------------------------------------------------------------------------------------
function boundaryChains(g) {
  const IX = g.index.array, F = g.attributes.aF;
  const count = new Map();
  const key = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  for (let t = 0; t < IX.length; t += 3) {
    for (let k = 0; k < 3; k++) { const a = IX[t + k], b = IX[t + (k + 1) % 3]; count.set(key(a, b), (count.get(key(a, b)) || 0) + 1); }
  }
  const adj = new Map();
  for (let t = 0; t < IX.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = IX[t + k], b = IX[t + (k + 1) % 3];
      if (count.get(key(a, b)) !== 1 || F.getX(a) > 1e-6 || F.getX(b) > 1e-6) continue;
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b); adj.get(b).push(a);
    }
  }
  const seen = new Set();
  const chains = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    // walk to one end of an open chain (or anywhere on a loop)
    let s = start, guard = 0;
    while (guard++ < 100000) {
      const nb = adj.get(s).find((v) => v !== s && !seen.has(v) && adj.get(v).length === 1);
      if (!nb) break;
      s = nb;
      break;
    }
    const chain = [];
    let cur = adj.get(start).length === 1 ? start : s, prev = -1;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur); chain.push(cur);
      const next = adj.get(cur).find((v) => v !== prev && !seen.has(v));
      prev = cur; cur = next;
    }
    if (chain.length > 3) chains.push(chain);
  }
  return chains;
}

// region(px, py, pz, tx, ty, tz) -> boolean; strips are placed every `spacing` metres along the chains
export function fringeGeometry(shell, region, { length = 0.075, width = 0.009, spacing = 0.012, seed = 5, out = 0.004 } = {}) {
  const rnd = mulberry32(seed);
  const P = shell.attributes.position, N = shell.attributes.normal, SI = shell.attributes.skinIndex, SW = shell.attributes.skinWeight;
  const pos = [], nor = [], si = [], sw = [], idx = [], ao = [], fv = [];
  const chains = boundaryChains(shell);
  for (const chain of chains) {
    let acc = spacing;
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1], b = chain[i];
      const seg = Math.hypot(P.getX(b) - P.getX(a), P.getY(b) - P.getY(a), P.getZ(b) - P.getZ(a));
      acc += seg;
      if (acc < spacing) continue;
      acc = 0;
      const tx = P.getX(b) - P.getX(a), ty = P.getY(b) - P.getY(a), tz = P.getZ(b) - P.getZ(a);
      const tl = Math.hypot(tx, ty, tz) || 1;
      if (!region(P.getX(b), P.getY(b), P.getZ(b), tx / tl, ty / tl, tz / tl)) continue;
      const L = length * (0.8 + rnd() * 0.4);
      const nx = N.getX(b), ny = N.getY(b), nz = N.getZ(b);
      // strip across the surface tangent; hangs straight down, a little outward
      let wx = tx / tl, wy = ty / tl, wz = tz / tl;
      if (Math.abs(wy) > 0.7) { // vertical edge: the strip is as wide as it is thick, face outward
        wx = ny * 0 + -nz; wy = 0; wz = nx;
      } else wy = 0;
      const wl = Math.hypot(wx, wy, wz) || 1; wx = wx / wl * width / 2; wz = wz / wl * width / 2;
      const px = P.getX(b) + nx * out, py = P.getY(b) + ny * out, pz = P.getZ(b) + nz * out;
      const base = pos.length / 3;
      const bow = 0.006;
      const corners = [[px - wx, py, pz - wz], [px + wx, py, pz + wz], [px - wx + nx * bow, py - L, pz - wz + nz * bow], [px + wx + nx * bow, py - L, pz + wz + nz * bow]];
      for (const c of corners) {
        pos.push(...c); nor.push(nx, 0, nz); ao.push(1); fv.push(0.05);
        si.push(SI.getX(b), SI.getY(b), SI.getZ(b), SI.getW(b)); sw.push(SW.getX(b), SW.getY(b), SW.getZ(b), SW.getW(b));
      }
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.setAttribute('aF', new THREE.Float32BufferAttribute(fv, 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  return g;
}

export function headWeightArrays(geo) { return weightArrays(geo); }

export const HEAD_JOINT = JOINT.head;
void GLSL_NOISE;
