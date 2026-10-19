// Strand-based hair for the horse: mane, forelock, tail and fetlock feathers.
//
// Every strand is a tapered ribbon (a few dozen of them form a lock). The geometry stores the centre
// line in `position` and the offset to the ribbon edge in `aOff`, so the vertex shader can animate it
// (sway, streaming at speed, falling back down when the head is lowered) without any CPU work per strand.
// The mane, forelock and feathers sit in the space of a bone; the tail is skinned to the tail bones.
import * as THREE from 'three';
import { clamp } from '../core/utils.js';
import { GLSL_NOISE } from '../core/noise.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ALT = V(0, 0, 1);

// ---------------------------------------------------------------------------
// Ribbon geometry
// ---------------------------------------------------------------------------
export class Strands {
  constructor(skinned = false) {
    this.skinned = skinned;
    this.pos = []; this.off = []; this.nor = []; this.hair = []; this.shape = []; this.idx = []; this.si = []; this.sw = [];
    this.n = 0;
  }

  // pts: centre line, width: root half-width (m), ref: direction the flat side faces
  // skin(i, t) -> [b0, b1, w1] (tail only)
  add(pts, width, ref, phase, tone, skin = null, taper = 0.82, card = 0) {
    const n = pts.length;
    let len = 0;
    for (let i = 1; i < n; i++) len += pts[i].distanceTo(pts[i - 1]);
    const base = this.n;
    const tan = V(), w = V(), nr = V();
    let prev = null;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      tan.copy(pts[Math.min(n - 1, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize();
      w.crossVectors(tan, ref);
      if (w.lengthSq() < 1e-4) w.crossVectors(tan, ALT);
      w.normalize();
      if (prev && w.dot(prev) < 0) w.negate();
      prev = prev ? prev.copy(w) : w.clone();
      nr.crossVectors(w, tan).normalize();
      const hw = width * (1 - taper * Math.pow(t, 1.2));
      for (const sg of [-1, 1]) {
        this.pos.push(pts[i].x, pts[i].y, pts[i].z);
        this.off.push(w.x * hw * sg, w.y * hw * sg, w.z * hw * sg);
        const nx = nr.x + w.x * sg * 0.6, ny = nr.y + w.y * sg * 0.6, nz = nr.z + w.z * sg * 0.6;
        const l = Math.hypot(nx, ny, nz) || 1;
        this.nor.push(nx / l, ny / l, nz / l);
        this.hair.push(t, phase, tone, len);
        this.shape.push(sg, card);
        if (skin) {
          const [b0, b1, k] = skin(i, t);
          this.si.push(b0, b1, 0, 0);
          this.sw.push(1 - k, k, 0, 0);
        }
      }
      if (i < n - 1) { const a = base + i * 2; this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    this.n += n * 2;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aOff', new THREE.Float32BufferAttribute(this.off, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aHair', new THREE.Float32BufferAttribute(this.hair, 4));
    g.setAttribute('aShape', new THREE.Float32BufferAttribute(this.shape, 2));
    if (this.skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    }
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.5;
    return g;
  }
}

// ---------------------------------------------------------------------------
// Material (strand colouring, wind and gravity in the vertex shader)
// ---------------------------------------------------------------------------
export function hairMaterial(color, { stiff = 0, axisA = V(1, 0, 0), axisB = V(0, 0, 1), gloss = 0.4 } = {}) {
  const u = {
    uTime: { value: 0 },
    uFlow: { value: 0 },
    uBack: { value: V() },
    uGrav: { value: V(0, -1, 0) },
    uGravRest: { value: V(0, -1, 0) },
    uAxisA: { value: axisA.clone() },
    uAxisB: { value: axisB.clone() },
    uWidth: { value: 1 },
    uSway: { value: 1 },
    uStiff: { value: stiff },
  };
  const base = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    color: base, roughness: gloss, metalness: 0, side: THREE.DoubleSide,
    sheen: 0.5, sheenRoughness: 0.4, sheenColor: base.clone().lerp(new THREE.Color(1, 0.96, 0.9), 0.22),
    clearcoat: 0.12, clearcoatRoughness: 0.45,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aOff; attribute vec4 aHair; attribute vec2 aShape; varying vec3 vHair; varying vec2 vShape;
        uniform float uTime; uniform float uFlow; uniform float uWidth; uniform float uSway; uniform float uStiff;
        uniform vec3 uBack; uniform vec3 uGrav; uniform vec3 uGravRest; uniform vec3 uAxisA; uniform vec3 uAxisB;`)
      .replace('#include <begin_vertex>', `
        float hT = aHair.x;
        float hLen = aHair.w;
        float soft = 1.0 - uStiff;
        vec3 transformed = position + aOff * uWidth;
        float hK = hT * hT;
        // the strand falls with gravity when the part it hangs from turns (head lowered, body pitched)
        transformed += (uGrav - uGravRest) * (hK * hLen * 0.6 * soft);
        // streaming backwards at speed and in the wind
        transformed += uBack * (pow(hT, 1.4) * hLen * soft);
        // travelling waves
        float f1 = sin(uTime * (2.4 + 5.5 * uFlow) + aHair.y + hT * 4.2);
        float f2 = sin(uTime * (3.9 + 7.0 * uFlow) + aHair.y * 1.9 - hT * 3.1);
        float amp = (0.006 + 0.04 * uFlow) * hLen * hK * uSway * soft;
        transformed += uAxisA * (f1 * amp) + uAxisB * (f2 * amp * 0.6);
        vHair = vec3(hT, aHair.z, aHair.y);
        vShape = aShape;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vHair; varying vec2 vShape;
        ${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // fine streaks along the strands (wide cards get more of them)
        float streak = mix(0.5, vnoise(vec3(vShape.x * 7.0 + vHair.z * 3.0, vHair.x * 1.8, vHair.z)), vShape.y);
        diffuseColor.rgb *= 0.8 + 0.4 * streak;
        float rootDark = mix(0.38, 1.0, smoothstep(0.0, 0.5, vHair.x));
        diffuseColor.rgb *= vHair.y * rootDark;
        diffuseColor.rgb += diffuseColor.rgb * 0.25 * smoothstep(0.55, 1.0, vHair.x);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (fract(vHair.z * 13.7) - 0.5) * 0.2, 0.15, 0.9);`);
  };
  m.userData.uniforms = u;
  m.customProgramCacheKey = () => 'hair3';
  return m;
}

// ---------------------------------------------------------------------------
// Surface lookups (neck half-width grid baked by tools/build-horses.mjs)
// ---------------------------------------------------------------------------
function neckLookup(meta) {
  const g = meta.neckGrid;
  const hwAt = (y, z) => {
    const fy = ((y - g.y0) / (g.y1 - g.y0)) * (g.ny - 1), fz = ((z - g.z0) / (g.z1 - g.z0)) * (g.nz - 1);
    if (fy < 0 || fz < 0 || fy > g.ny - 1 || fz > g.nz - 1) return -1;
    const iy = Math.min(g.ny - 2, Math.floor(fy)), iz = Math.min(g.nz - 2, Math.floor(fz));
    const ty = fy - iy, tz = fz - iz;
    const a = g.hw[iy * g.nz + iz], b = g.hw[iy * g.nz + iz + 1], c = g.hw[(iy + 1) * g.nz + iz], d = g.hw[(iy + 1) * g.nz + iz + 1];
    const m = Math.max(a, b, c, d);
    if (m < 0) return -1;
    if (a < 0 || b < 0 || c < 0 || d < 0) return m / 1000; // rim of the neck: stay outside
    return (((a * (1 - tz) + b * tz) * (1 - ty) + (c * (1 - tz) + d * tz) * ty)) / 1000;
  };
  const crestZ = (y) => {
    const c = meta.crest, [y0, y1] = meta.crestY;
    const f = clamp((y - y0) / (y1 - y0), 0, 1) * (c.length - 1);
    const i = Math.min(c.length - 2, Math.floor(f));
    return c[i] + (c[i + 1] - c[i]) * (f - i);
  };
  return { hwAt, crestZ };
}

// gravity (world down) expressed in the local space of a bone-world matrix (column-major)
function gravityIn(m) { return V(-m[1], -m[5], -m[9]).normalize(); }

// walk a strand along a surface in fine sub-steps and resample it
function resample(raw, segs) {
  const len = [0];
  for (let i = 1; i < raw.length; i++) len.push(len[i - 1] + raw[i].distanceTo(raw[i - 1]));
  const total = len[len.length - 1], out = [];
  let j = 0;
  for (let i = 0; i <= segs; i++) {
    const s = (i / segs) * total;
    while (j < raw.length - 2 && len[j + 1] < s) j++;
    const k = (s - len[j]) / Math.max(1e-9, len[j + 1] - len[j]);
    out.push(raw[j].clone().lerp(raw[j + 1], clamp(k, 0, 1)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mane
// ---------------------------------------------------------------------------
function buildMane({ meta, N, maneLen, rnd, grav, fjord, side0 = -1, count }) {
  const { hwAt, crestZ } = neckLookup(meta);
  const strands = new Strands();
  const dark = fjord ? new Strands() : null;
  const SEGS = 9, SUB = 4;
  const inPlane = V(0, grav.z, -grav.y).normalize();

  // one hair path: rises out of the crest, falls with gravity and rests on the side of the neck
  const simulate = (y0, side, len, eps, phase, wave, lift) => {
    const raw = [];
    const p = V(side * eps, y0, crestZ(y0) + 0.006);
    const dir = fjord ? V(side * 0.05, 0.25, -1).normalize() : V(0, 0.1, -1).normalize();
    raw.push(p.clone());
    const total = SEGS * SUB, ds = len / total;
    for (let i = 1; i <= total; i++) {
      const f = i / total;
      if (!fjord) {
        dir.addScaledVector(grav, (2.6 - 0.8 * f) * ds * 14);
        dir.addScaledVector(inPlane, Math.sin(f * 4.2 + phase) * wave * ds * 14);
        dir.x = 0;
      } else {
        dir.addScaledVector(grav, 0.02 * ds * 14);
        dir.addScaledVector(V(0, 1, 0), 0.05 * ds * 14);
      }
      dir.normalize();
      p.addScaledVector(dir, ds);
      if (!fjord) p.x = side * (Math.max(0, hwAt(p.y, p.z)) + eps + lift * f * f);
      raw.push(p.clone());
    }
    return resample(raw, SEGS);
  };

  const nLocks = fjord ? 26 : 46;
  const perLock = Math.ceil(count / nLocks);
  for (let L = 0; L < nLocks; L++) {
    const u = (L + 0.5) / nLocks;                   // 0 = poll .. 1 = withers
    const yLock = N + 0.01 - u * (N + 0.02);
    const lockPhase = rnd() * 6.28, lockWave = 0.35 + rnd() * 0.7;
    const lockSide = rnd() < 0.86 ? side0 : -side0;
    const prof = 0.3 + 0.36 * Math.pow(Math.sin(Math.PI * clamp(0.08 + u * 0.86, 0, 1)), 0.9);
    const endFade = Math.min(1, 0.3 + (1 - u) * 4.5) * Math.min(1, 0.45 + u * 6);
    const lockLen = (fjord ? 0.085 : prof * endFade) * maneLen * (0.88 + 0.24 * rnd());
    const spacing = (N + 0.07) / nLocks;
    if (!fjord) {
      // wide cards form the body of the lock
      for (let c = 0; c < 3; c++) {
        const y0 = yLock + (rnd() - 0.5) * spacing;
        const pts = simulate(y0, lockSide, lockLen * (0.9 + 0.2 * rnd()), 0.01 + 0.011 * c + 0.003 * rnd(), lockPhase + c, lockWave * 0.9, 0.012);
        strands.add(pts, 0.032 + 0.012 * rnd(), V(lockSide, 0, 0), lockPhase + c * 1.3, 0.9 + rnd() * 0.2, null, 0.9, 1);
      }
    }
    for (let k = 0; k < perLock; k++) {
      const layer = k % 3;
      const side = rnd() < 0.9 ? lockSide : -lockSide;
      const y0 = yLock + (rnd() - 0.5) * spacing * 1.5;
      const eps = 0.005 + 0.009 * layer + rnd() * 0.003;
      const len = lockLen * (0.86 + 0.36 * rnd()) * (1 - 0.05 * layer);
      const pts = simulate(y0, side, len, eps, lockPhase + rnd() * 1.2, lockWave * (0.8 + 0.5 * rnd()), 0.02);
      const target = fjord && Math.abs(pts[0].x) < 0.01 && rnd() < 0.4 ? dark : strands;
      target.add(pts, fjord ? 0.011 : 0.0085 + 0.004 * rnd(), V(side, 0, 0), rnd() * 6.28, 0.86 + rnd() * 0.28);
    }
  }
  return { light: strands.build(), dark: dark ? dark.build() : null };
}

// ---------------------------------------------------------------------------
// Forelock (head space: +y toward the muzzle, face on -z)
// ---------------------------------------------------------------------------
function buildForelock({ headSection, headLen, maneLen, rnd, grav, count = 70 }) {
  const strands = new Strands();
  const SEGS = 8, SUB = 4;
  const faceZ = (y, x) => {
    const s = headSection(clamp((y + 0.04) / (headLen + 0.06), 0, 1));
    const e = clamp(Math.abs(x) / Math.max(0.02, s.rx), 0, 0.98);
    return s.cz - s.rz * Math.sqrt(1 - e * e);
  };
  const lock = (x0, y0, len, eps, drift, width, card) => {
    const raw = [];
    const p = V(x0, y0, faceZ(y0, x0) + 0.015);
    const dir = V(x0 * 3, 0.3, -0.6).normalize();
    raw.push(p.clone());
    const total = SEGS * SUB, ds = len / total;
    for (let i = 1; i <= total; i++) {
      const f = i / total;
      dir.addScaledVector(grav, (2.4 - 0.6 * f) * ds * 14);
      dir.x += drift * ds * 14 * (0.3 + f);
      dir.normalize();
      p.addScaledVector(dir, ds);
      const zs = faceZ(p.y, p.x) - eps - 0.014 * f * f;
      if (p.z > zs) p.z = zs;
      raw.push(p.clone());
    }
    strands.add(resample(raw, SEGS), width, V(0, 0, -1), rnd() * 6.28, 0.88 + rnd() * 0.26, null, card ? 0.9 : 0.82, card);
  };
  const L = Math.max(0.75, maneLen);
  for (let c = 0; c < 4; c++) lock((c - 1.5) * 0.02, 0.05 + rnd() * 0.02, (0.2 + 0.08 * rnd()) * L, 0.009 + c * 0.004, (c - 1.5) * 0.12, 0.02, 1);
  for (let k = 0; k < count; k++) lock((rnd() - 0.5) * 0.08, 0.045 + rnd() * 0.04, (0.14 + 0.16 * rnd()) * L, 0.006 + rnd() * 0.01, (rnd() - 0.5) * 0.3, 0.008 + 0.004 * rnd(), 0);
  return strands.build();
}

// ---------------------------------------------------------------------------
// Tail (skinned to the tail bones; the chain comes from the rest pose)
// ---------------------------------------------------------------------------
function tailCurve(world, tailIdx, extend) {
  const pts = tailIdx.map((i) => V(world[i][12], world[i][13], world[i][14]));
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const step = last.clone().sub(prev);
  pts.push(last.clone().add(step));
  for (let e = 0; e < extend; e++) pts.push(pts[pts.length - 1].clone().add(step));
  return new THREE.CatmullRomCurve3(pts);
}

function buildTail({ world, tailIdx, tailLen, rnd, count }) {
  const nb = tailIdx.length;
  const extra = Math.max(0, tailLen - 1) * nb * 1.0;
  const curve = tailCurve(world, tailIdx, Math.ceil(extra));
  const chainFrac = (nb) / (nb + 1 + Math.ceil(extra)); // part of the curve covered by the bones
  const skin = (t) => {
    const f = (t / chainFrac) * (nb - 1);
    if (f >= nb - 1) return [tailIdx[nb - 1], tailIdx[nb - 1], 0];
    const b0 = Math.floor(f);
    return [tailIdx[b0], tailIdx[b0 + 1], f - b0];
  };
  const strands = new Strands(true);
  const SEGS = 14;
  const side = V(1, 0, 0);
  const tan = V(), nz = V(), c = V();
  const vol = Math.min(1.45, 0.9 + 0.2 * tailLen);
  // a strand (or card) at a given angle/radius around the centre line, ending at `end`
  const make = (ang, rad, end, lockPhase, wave, jx, jz, width, card) => {
    const lx = Math.cos(ang) * rad, lz = Math.sin(ang) * rad;
    const pts = [], sk = [];
    let radial = null;
    for (let i = 0; i <= SEGS; i++) {
      const s = 0.025 + (i / SEGS) * (end - 0.025);
      curve.getPointAt(s, c);
      curve.getTangentAt(s, tan);
      nz.crossVectors(tan, side).normalize();
      const wx = (0.028 + 0.12 * Math.sin(clamp(s * 1.1, 0, 1) * Math.PI * 0.82)) * vol;
      const wz = wx * 0.72;
      const wv = Math.sin(s * 6 + lockPhase) * 0.02 * wave * s;
      const px = lx * wx + jx * (0.4 + s) + wv;
      const pz = lz * wz + jz * (0.4 + s);
      pts.push(c.clone().addScaledVector(side, px).addScaledVector(nz, pz));
      sk.push(skin(s));
      if (i === SEGS >> 1) radial = V().addScaledVector(side, Math.cos(ang)).addScaledVector(nz, Math.sin(ang));
    }
    strands.add(pts, width, radial, rnd() * 6.28, 0.86 + rnd() * 0.28, (i) => sk[i], card ? 0.88 : 0.8, card);
  };
  const lockCount = 56;
  for (let L = 0; L < lockCount; L++) {
    const ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * 0.95;
    const lockPhase = rnd() * 6.28, wave = 0.5 + rnd();
    const lockEnd = (0.8 + 0.2 * Math.pow(rnd(), 0.6)) * Math.min(1, tailLen);
    make(ang, Math.max(0.45, rad), lockEnd, lockPhase, wave, 0, 0, 0.045 + 0.02 * rnd(), 1);
    make(ang + 0.5, Math.max(0.3, rad * 0.8), lockEnd * 0.94, lockPhase + 1, wave, 0, 0, 0.04 + 0.02 * rnd(), 1);
    for (let k = 0; k < Math.ceil(count / lockCount); k++) {
      const end = clamp(lockEnd * (0.92 + 0.14 * rnd()), 0.3, 1.0);
      make(ang + (rnd() - 0.5) * 0.5, clamp(rad + (rnd() - 0.5) * 0.25, 0.1, 1), end, lockPhase, wave, (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02, 0.011 + 0.005 * rnd(), 0);
    }
  }
  return { geometry: strands.build(), curve, skin };
}

// plaited tail: beads along the chain plus a small tuft at the end
function buildTailBraid({ world, tailIdx, rnd }) {
  const nb = tailIdx.length;
  const curve = tailCurve(world, tailIdx, 0);
  const chainFrac = nb / (nb + 1);
  const pos = [], nor = [], si = [], sw = [], idx = [];
  const beads = 26;
  const proto = new THREE.SphereGeometry(1, 8, 6);
  const pp = proto.attributes.position, pn = proto.attributes.normal;
  const q = new THREE.Quaternion(), v = V(), c = V(), t = V();
  for (let b = 0; b < beads; b++) {
    const s = 0.04 + (b / (beads - 1)) * 0.8;
    curve.getPointAt(s, c); curve.getTangentAt(s, t);
    q.setFromUnitVectors(V(0, 1, 0), t);
    const zig = (b % 2 ? 1 : -1) * 0.011;
    const r = 0.02 * (1 - 0.35 * s), h = r * 1.5;
    const f = (s / chainFrac) * (nb - 1);
    const b0 = Math.min(nb - 1, Math.floor(f)), b1 = Math.min(nb - 1, b0 + 1), k = Math.min(1, f - b0);
    const base = pos.length / 3;
    for (let i = 0; i < pp.count; i++) {
      v.set(pp.getX(i) * r, pp.getY(i) * h, pp.getZ(i) * r).applyQuaternion(q).add(c);
      pos.push(v.x + zig, v.y, v.z);
      v.set(pn.getX(i), pn.getY(i), pn.getZ(i)).applyQuaternion(q);
      nor.push(v.x, v.y, v.z);
      si.push(tailIdx[b0], tailIdx[b1], 0, 0); sw.push(1 - k, k, 0, 0);
    }
    for (let i = 0; i < proto.index.count; i++) idx.push(base + proto.index.getX(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(V(0, 1.2, -0.8), 2);
  // tuft
  const tuft = new Strands(true);
  for (let k = 0; k < 28; k++) {
    const pts = [], sk = [];
    const ph = rnd() * 6.28, rr = rnd() * 0.012;
    for (let i = 0; i <= 6; i++) {
      const tt = i / 6, s = 0.84 + tt * 0.16;
      const cc = curve.getPointAt(Math.min(1, s));
      pts.push(cc.add(V(Math.cos(ph) * (rr + tt * 0.03), -tt * tt * 0.02, Math.sin(ph) * (rr + tt * 0.03))));
      const f = (Math.min(s, chainFrac) / chainFrac) * (nb - 1);
      const b0 = Math.min(nb - 1, Math.floor(f));
      sk.push([tailIdx[b0], tailIdx[Math.min(nb - 1, b0 + 1)], Math.min(1, f - b0)]);
    }
    tuft.add(pts, 0.009, V(0, 0, 1), rnd() * 6.28, 0.9 + rnd() * 0.2, (i) => sk[i]);
  }
  return { beads: g, tuft: tuft.build() };
}

// ---------------------------------------------------------------------------
// Fetlock feathers (fet-bone space: local -y points down the leg, +z to the front)
// ---------------------------------------------------------------------------
function buildFeather({ feather, th, rnd }) {
  const strands = new Strands();
  const SEGS = 7;
  const n = Math.round(30 + 40 * feather);
  for (let k = 0; k < n; k++) {
    const phi = (rnd() - 0.5) * 3.5;                 // around the back of the leg
    const r0 = 0.04 * th;
    const out = V(Math.sin(phi), 0, -Math.cos(phi));
    const y0 = 0.1 - rnd() * 0.16;
    const len = (0.1 + 0.19 * feather) * (0.7 + 0.5 * rnd());
    const pts = [];
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS;
      const s = t * len;
      const flare = r0 + 0.012 + 0.05 * Math.pow(t, 1.4) * (0.6 + 0.6 * feather);
      pts.push(V(out.x * flare + Math.sin(t * 5 + k) * 0.006, y0 - s * 0.97, out.z * flare - 0.01 * t));
    }
    strands.add(pts, 0.011 + 0.004 * rnd(), out, rnd() * 6.28, 0.88 + rnd() * 0.26);
  }
  return strands.build();
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------
export function buildHair({ boneDefs, world, B, meta, d, P, breed, hairColor, rnd, root, skel, legs, headSection, socks }) {
  const fjord = breed.maneStyle === 'fjord';
  const idx = (n) => boneDefs.findIndex((b) => b.name === n);
  const neckM = world[idx('neck')], headM = world[idx('head')];
  const gravNeck = gravityIn(neckM), gravHead = gravityIn(headM);
  const tailIdx = boneDefs.map((b, i) => (b.name.startsWith('tail') ? i : -1)).filter((i) => i >= 0);
  const mats = [];
  const mk = (color, opts, grav) => {
    const m = hairMaterial(color, opts);
    if (grav) { m.userData.uniforms.uGravRest.value.copy(grav); m.userData.uniforms.uGrav.value.copy(grav); }
    mats.push(m);
    return m;
  };

  // axes the strands sway along (in the space of each part)
  const swayNeck = V(0, gravNeck.z, -gravNeck.y).normalize();
  const maneMat = mk(hairColor, { axisA: swayNeck, axisB: V(1, 0, 0), stiff: fjord ? 0.92 : 0 }, gravNeck);
  const maneGroup = new THREE.Group();
  const manes = buildMane({ meta, N: d.neckLen, maneLen: P.maneLen, rnd, grav: gravNeck, fjord, count: fjord ? 130 : 230 });
  const maneMesh = new THREE.Mesh(manes.light, maneMat);
  maneMesh.castShadow = true; maneMesh.frustumCulled = false;
  maneGroup.add(maneMesh);
  let maneDarkMat = null;
  if (manes.dark) {
    maneDarkMat = mk(0x17110d, { axisA: swayNeck, axisB: V(1, 0, 0), stiff: 0.92 }, gravNeck);
    const dm = new THREE.Mesh(manes.dark, maneDarkMat); dm.frustumCulled = false;
    maneGroup.add(dm);
  }
  B.neck.add(maneGroup);

  const foreMat = mk(hairColor, { axisA: V(1, 0, 0), axisB: V(0, 1, 0) }, gravHead);
  const forelock = new THREE.Group();
  const foreMesh = new THREE.Mesh(buildForelock({ headSection, headLen: d.headLen, maneLen: P.maneLen, rnd, grav: gravHead, count: fjord ? 30 : 70 }), foreMat);
  foreMesh.frustumCulled = false; foreMesh.castShadow = true;
  forelock.add(foreMesh);
  B.head.add(forelock);

  const tailMat = mk(hairColor, { axisA: V(1, 0, 0), axisB: V(0, 0, 1) });
  const tail = buildTail({ world, tailIdx, tailLen: P.tailLen, rnd, count: 320 });
  const tailFull = new THREE.SkinnedMesh(tail.geometry, tailMat);
  const braidBeadMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.55 });
  const braid = buildTailBraid({ world, tailIdx, rnd });
  const beadMesh = new THREE.SkinnedMesh(braid.beads, braidBeadMat);
  const tuftMesh = new THREE.SkinnedMesh(braid.tuft, tailMat);
  for (const m of [tailFull, beadMesh, tuftMesh]) {
    m.bind(skel, new THREE.Matrix4());
    m.castShadow = true;
    m.frustumCulled = false;
  }
  const tailBraid = new THREE.Group();
  tailBraid.add(beadMesh, tuftMesh);
  tailBraid.visible = false;
  root.add(tailFull, tailBraid);

  // feathers on the legs
  const featherMeshes = [];
  let featherMat = null, whiteMat = null;
  if (P.feather > 0.05) {
    featherMat = mk(hairColor, { axisA: V(1, 0, 0), axisB: V(0, 0, 1) });
    whiteMat = mk(0xf1ece2, { axisA: V(1, 0, 0), axisB: V(0, 0, 1) });
    legs.forEach((leg, i) => {
      const m = new THREE.Mesh(buildFeather({ feather: P.feather, th: d.th, rnd }), (socks && socks[i] > 0) ? whiteMat : featherMat);
      m.frustumCulled = false; m.castShadow = true;
      leg.fet.add(m);
      featherMeshes.push(m);
    });
  }

  const _q = new THREE.Quaternion(), _w = V(), _l = V();
  const fwd = V();
  return {
    maneGroup, forelock, tailFull, tailBraid, materials: mats, featherMeshes,
    update(h, dt) {
      const rig = h.rig;
      const sp = Math.abs(h.speed);
      const flow = clamp(sp / 11, 0, 1);
      const weather = h.game.weather;
      const windS = weather ? weather.cur.wind : 0.3;
      const windV = weather ? weather.wind : null;
      fwd.set(Math.sin(h.heading), 0, Math.cos(h.heading)).multiplyScalar(h.speed < -0.05 ? 1 : -1);
      // world-space streaming direction: against the movement, a little upward, plus the wind
      _w.copy(fwd).multiplyScalar(flow * 0.5);
      _w.y += flow * 0.12;
      if (windV) _w.addScaledVector(windV, 0.012);
      const set = (mat, obj, axisAdj = 1) => {
        const u = mat.userData.uniforms;
        obj.getWorldQuaternion(_q).invert();
        u.uTime.value = h.time;
        u.uFlow.value = flow + windS * 0.12;
        u.uBack.value.copy(_w).multiplyScalar(axisAdj).applyQuaternion(_q);
        u.uGrav.value.set(0, -1, 0).applyQuaternion(_q);
      };
      rig.neck.updateWorldMatrix(true, false);
      rig.head.updateWorldMatrix(true, false);
      set(maneMat, rig.neck);
      if (maneDarkMat) set(maneDarkMat, rig.neck, 0.2);
      set(foreMat, rig.head, 0.45);
      // tail: skinned in root space, the bones already carry most of the motion
      const tu = tailMat.userData.uniforms;
      rig.root.getWorldQuaternion(_q).invert();
      tu.uTime.value = h.time; tu.uFlow.value = flow + windS * 0.12;
      _l.copy(_w).multiplyScalar(0.25).applyQuaternion(_q);
      tu.uBack.value.copy(_l);
      for (const m of [featherMat, whiteMat]) if (m) { m.userData.uniforms.uTime.value = h.time; m.userData.uniforms.uFlow.value = flow; }
    },
    dispose() {
      for (const m of mats) m.dispose();
      braidBeadMat.dispose();
    },
  };
}
