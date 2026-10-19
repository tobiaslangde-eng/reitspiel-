// Horse anatomy shared by the offline mesh generator (tools/build-horses.mjs)
// and the runtime rig. Pure math, no three.js dependency so it runs in Node.
//
// Coordinates: root at the ground, horse faces +z, up is +y, left side is +x.

export const ARCHETYPES = {
  light: { bodyLen: 1.0, bulk: 0.88, legLen: 1.06, legThick: 0.85, neckLen: 1.08, headLen: 0.96 },
  warm: { bodyLen: 1.0, bulk: 1.0, legLen: 1.03, legThick: 1.0, neckLen: 1.07, headLen: 1.0 },
  stock: { bodyLen: 0.97, bulk: 1.05, legLen: 1.0, legThick: 1.06, neckLen: 0.95, headLen: 0.95 },
  heavy: { bodyLen: 1.03, bulk: 1.27, legLen: 0.95, legThick: 1.33, neckLen: 1.0, headLen: 1.07 },
  pony: { bodyLen: 1.0, bulk: 1.2, legLen: 0.86, legThick: 1.2, neckLen: 0.9, headLen: 1.03 },
  // foals: small body, long thin legs, big head (used while growth < FOAL_GROWTH)
  foal: { bodyLen: 0.74, bulk: 0.74, legLen: 1.14, legThick: 0.74, neckLen: 0.78, headLen: 1.12 },
};
export const FOAL_GROWTH = 0.85;
export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

export function archetypeFor(P) {
  let best = 'warm', bd = 1e9;
  for (const [k, a] of Object.entries(ARCHETYPES)) {
    if (k === 'foal') continue;
    const d = ((P.bulk - a.bulk) / 0.15) ** 2 + ((P.legLen - a.legLen) / 0.08) ** 2 + ((P.legThick - a.legThick) / 0.2) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Tiny matrix helpers (column-major 4x4 like three.js)
// ---------------------------------------------------------------------------
export function mat4() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
export function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
// T * Rx * Ry * Rz (three.js Euler order 'XYZ')
export function compose(pos, rot = [0, 0, 0]) {
  const [x, y, z] = rot;
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    c * e, af + be * d, bf - ae * d, 0,
    -c * f, ae - bf * d, be + af * d, 0,
    d, -b * c, a * c, 0,
    pos[0], pos[1], pos[2], 1,
  ];
}
export function invertRigid(m) {
  // rotation transpose, translation -R^T t
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
  const t = [m[12], m[13], m[14]];
  r[12] = -(r[0] * t[0] + r[4] * t[1] + r[8] * t[2]);
  r[13] = -(r[1] * t[0] + r[5] * t[1] + r[9] * t[2]);
  r[14] = -(r[2] * t[0] + r[6] * t[1] + r[10] * t[2]);
  return r;
}
export function apply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
export const FRONT_REST = [0.02, 0, -0.5];
export const HIND_REST = [0.5, -0.5, -0.42];
export const NECK_TILT = 0.72;
export const HEAD_REST = 1.68;
export const EAR_REST = 0.75;
export const TAIL_SEGS = 7;

// Proportions follow a real horse: elbow at ~60 % of the withers height, knee and hock low,
// short cannons, a sloped shoulder and a head about 40 % of the withers height.
export function dimensions(P, tailHigh = false) {
  const L = P.legLen, bulk = P.bulk, th = P.legThick;
  const fSeg = [0.47 * L, 0.27 * L, 0.24 * L];
  const hSeg = [0.62 * L, 0.36 * L, 0.24 * L];
  const vert = (segs, rest) => {
    let a = 0, y = 0;
    for (let i = 0; i < 3; i++) { a += rest[i]; y += (i === 2 ? segs[i] - 0.08 : segs[i]) * Math.cos(a); }
    return y + 0.08;
  };
  const hipF = vert(fSeg, FRONT_REST);
  const hipH = vert(hSeg, HIND_REST);
  const cy = hipF + 0.25 * bulk;
  const zLen = 0.76 * P.bodyLen;
  const headLen = 0.65 * P.headLen;
  return {
    L, bulk, th, fSeg, hSeg, hipF, hipH, cy, zLen,
    neckLen: 0.74 * P.neckLen, headLen, legThick: th, neckTilt: NECK_TILT,
    eye: [headLen * 0.3, -0.035],
    tailLen: 0.95, tailHigh,
  };
}

// Returns bones in a fixed order: { name, parent (index or -1), pos, rot }
export function skeleton(P, tailHigh = false) {
  const d = dimensions(P, tailHigh);
  const bones = [];
  const add = (name, parent, pos, rot = [0, 0, 0]) => { bones.push({ name, parent, pos, rot }); return bones.length - 1; };
  const body = add('body', -1, [0, 0, 0]);
  const neck = add('neck', body, [0, d.cy + 0.05, d.zLen * 0.74], [NECK_TILT, 0, 0]);
  const head = add('head', neck, [0, d.neckLen, 0.0], [HEAD_REST, 0, 0]);
  add('earL', head, [0.058, 0.035, -0.07], [EAR_REST, 0, 0.32]);
  add('earR', head, [-0.058, 0.035, -0.07], [EAR_REST, 0, -0.32]);
  const legs = [
    ['FL', 0.13 * d.bulk, d.hipF, d.zLen * 0.6, d.fSeg, FRONT_REST],
    ['FR', -0.13 * d.bulk, d.hipF, d.zLen * 0.6, d.fSeg, FRONT_REST],
    ['HL', 0.14 * d.bulk, d.hipH, -d.zLen * 0.62, d.hSeg, HIND_REST],
    ['HR', -0.14 * d.bulk, d.hipH, -d.zLen * 0.62, d.hSeg, HIND_REST],
  ];
  for (const [n, x, y, z, segs, rest] of legs) {
    const hip = add('hip' + n, body, [x, y, z], [rest[0], 0, 0]);
    const knee = add('knee' + n, hip, [0, -segs[0], 0], [rest[1], 0, 0]);
    const fet = add('fet' + n, knee, [0, -segs[1], 0], [rest[2], 0, 0]);
    add('hoof' + n, fet, [0, -(segs[2] - 0.08), 0], [-(rest[0] + rest[1] + rest[2]), 0, 0]);
  }
  let parent = add('tail0', body, [0, d.cy + 0.25 * d.bulk, -d.zLen * 1.0], [tailHigh ? 0.35 : 0.7, 0, 0]);
  const segL = d.tailLen / TAIL_SEGS;
  for (let i = 1; i < TAIL_SEGS; i++) parent = add('tail' + i, parent, [0, -segL, 0], [-0.12, 0, 0]);
  return { bones, dims: d };
}

export function boneWorldMatrices(bones) {
  const out = [];
  for (const b of bones) {
    const local = compose(b.pos, b.rot);
    out.push(b.parent < 0 ? local : mul(out[b.parent], local));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shape primitives (signed distance), defined in bone-local space.
// part: 0 body, 1 neck, 2 head, 3-6 legs (FL, FR, HL, HR), 7-10 hooves, 11 ears
// ---------------------------------------------------------------------------
export function primitives(P) {
  const d = dimensions(P);
  const b = d.bulk, Z = d.zLen, C = d.cy, th = d.th, L = d.headLen, N = d.neckLen;
  const sb = Math.sqrt(b);
  const prims = [];
  const E = (bone, part, c, r, k, extra = {}) => prims.push({ type: 'ell', bone, part, c, r, k, ...extra });
  const RC = (bone, part, a, ra, bb, rb, k, extra = {}) => prims.push({ type: 'rcone', bone, part, a, b: bb, ra, rb, k, ...extra });

  // --- body (z forward, the legs attach at ~0.6 Z front and -0.62 Z behind)
  E('body', 0, [0, C - 0.02, 0.06 * Z], [0.29 * b, 0.3 * b, 0.62 * Z], 0.12); // rib cage
  E('body', 0, [0, C - 0.08 * b, -0.14 * Z], [0.28 * b, 0.25 * b, 0.5 * Z], 0.12); // belly
  E('body', 0, [0, C - 0.03, 0.7 * Z], [0.2 * b, 0.28 * b, 0.3 * Z], 0.1); // forehand
  for (const s of [-1, 1]) {
    E('body', 0, [s * 0.08 * b, C - 0.15, 0.97 * Z], [0.09 * b, 0.14, 0.1], 0.08); // chest muscles
    E('body', 0, [s * 0.125 * b, C + 0.07, 0.68 * Z], [0.085 * b, 0.3, 0.13], 0.09, { rot: [-0.75, 0, 0] }); // shoulder blade
    E('body', 0, [s * 0.145 * b, C - 0.21, 0.58 * Z], [0.07 * b, 0.09, 0.09], 0.06); // elbow
    E('body', 0, [s * 0.152 * b, C - 0.06, 0.78 * Z], [0.06 * b, 0.12, 0.085], 0.045, { rot: [-0.5, 0, 0] }); // point of the shoulder
    E('body', 0, [s * 0.158 * b, C - 0.07, 0.56 * Z], [0.06 * b, 0.13, 0.085], 0.045, { rot: [0.25, 0, 0] }); // triceps
  }
  E('body', 0, [0, C + 0.25 * b, 0.4 * Z], [0.07 * b, 0.09, 0.22 * Z], 0.09); // withers
  E('body', 0, [0, C + 0.17 * b, -0.15 * Z], [0.2 * b, 0.13 * b, 0.5 * Z], 0.1); // back and loin
  E('body', 0, [0, C + 0.2 * b, -0.68 * Z], [0.2 * b, 0.12 * b, 0.3 * Z], 0.1); // croup
  for (const s of [-1, 1]) {
    E('body', 0, [s * 0.12 * b, C + 0.02, -0.72 * Z], [0.165 * b, 0.3 * b, 0.27 * Z], 0.1); // hindquarters
    E('body', 0, [s * 0.1 * b, C - 0.12, -0.88 * Z], [0.12 * b, 0.24 * b, 0.13], 0.09); // buttock
    E('body', 0, [s * 0.165 * b, C - 0.2 * b, -0.5 * Z], [0.08 * b, 0.13, 0.12], 0.07); // stifle
    E('body', 0, [s * 0.185 * b, C - 0.08, -0.74 * Z], [0.06 * b, 0.2, 0.13], 0.045, { rot: [0.15, 0, 0] }); // biceps femoris
    E('body', 0, [s * 0.12 * b, C + 0.17, -0.78 * Z], [0.09 * b, 0.1, 0.14], 0.05); // gluteals
  }
  // --- neck (local +y along the neck, crest on -z, throat on +z)
  RC('neck', 1, [0, -0.12, 0.05], 0.28 * (0.9 + 0.1 * b), [0, N * 0.97, 0.02], 0.11, 0.14, { scale: [0.6 * sb, 1, 1] });
  E('neck', 1, [0, N * 0.48, -0.115], [0.06 * sb, N * 0.5, 0.075], 0.1); // crest
  E('neck', 1, [0, N * 0.93, 0.06], [0.07, 0.08, 0.08], 0.07); // throat latch
  E('neck', 1, [0, 0.02, 0.1], [0.19 * b, 0.2, 0.2], 0.12); // base into the shoulders
  for (const s of [-1, 1]) prims.push({ type: 'sub', bone: 'neck', part: 1, c: [s * 0.118 * sb, N * 0.5, 0.12], rr: [0.02, N * 0.3, 0.035], k: 0.1, rot: [0.1, 0, 0] }); // jugular groove (shallow)
  // --- head (local +y toward the muzzle, face on -z, jaw on +z)
  const ey = d.eye[0];
  const SUB = (bone, part, c, rr, k, rot) => prims.push({ type: 'sub', bone, part, c, rr, k, rot });
  E('head', 2, [0, 0.05, -0.02], [0.095, 0.1, 0.1], 0.06); // poll
  E('head', 2, [0, ey - 0.02, -0.05], [0.1, 0.13, 0.07], 0.06); // forehead
  for (const s of [-1, 1]) {
    E('head', 2, [s * 0.058, ey - 0.03, 0.075], [0.052, 0.13, 0.12], 0.06); // jowl
    E('head', 2, [s * 0.09, ey - 0.03, -0.06], [0.026, 0.028, 0.03], 0.03); // brow ridge above the eye
    E('head', 2, [s * 0.07, ey + 0.09, 0.0], [0.028, 0.08, 0.032], 0.04); // facial crest
  }
  RC('head', 2, [0, ey - 0.06, -0.03], 0.095, [0, L * 0.82, -0.005], 0.06, 0.06, { scale: [0.92, 1, 1] }); // face
  RC('head', 2, [0, ey + 0.04, 0.06], 0.07, [0, L * 0.84, 0.035], 0.056, 0.06, { scale: [0.85, 1, 1] }); // lower jaw
  E('head', 2, [0, L * 0.9, 0.005], [0.064, 0.08, 0.078], 0.05); // muzzle
  for (const s of [-1, 1]) E('head', 2, [s * 0.046, L * 0.935, -0.04], [0.026, 0.034, 0.024], 0.025); // nostril wings
  E('head', 2, [0, L * 0.965, 0.035], [0.058, 0.04, 0.06], 0.03); // lips
  E('head', 2, [0, L * 0.88, 0.085], [0.04, 0.055, 0.035], 0.03); // chin
  for (const s of [-1, 1]) {
    SUB('head', 2, [s * 0.114, ey, -0.035], [0.017, 0.034, 0.037], 0.02);                // eye socket
    SUB('head', 2, [s * 0.047, L * 0.968, -0.047], [0.013, 0.016, 0.013], 0.014);        // nostril
    SUB('head', 2, [s * 0.056, L * 0.945, -0.034], [0.009, 0.013, 0.01], 0.012);           // nostril, lower lobe
  }
  // --- ears (tip along local -y)
  for (const e of ['earL', 'earR']) {
    RC(e, 11, [0, 0, 0], 0.034, [0, -0.15, 0], 0.008, 0.025, { scale: [1.1, 1, 0.55] });
    E(e, 11, [0, -0.06, 0], [0.036, 0.06, 0.02], 0.02);
    SUB(e, 11, [0, -0.068, -0.027], [0.026, 0.07, 0.017], 0.02);                         // hollow of the ear
  }
  // --- legs (front of the leg is local +z)
  ['FL', 'FR', 'HL', 'HR'].forEach((n, i) => {
    const front = i < 2;
    const segs = front ? d.fSeg : d.hSeg;
    const part = 3 + i;
    if (front) {
      RC('hip' + n, part, [0, 0.12, 0.01], 0.125 * th, [0, -segs[0] * 0.8, 0], 0.052 * th, 0.08, { scale: [0.82, 1, 1] }); // forearm
      E('hip' + n, part, [0, -segs[0] * 0.22, 0.02], [0.078 * th, 0.18, 0.082 * th], 0.06);
      E('knee' + n, part, [0, 0.015, 0.006], [0.048 * th, 0.06, 0.048 * th], 0.04); // knee
      E('knee' + n, part, [0, 0.0, -0.035 * th], [0.028 * th, 0.04, 0.025], 0.03);
    } else {
      E('hip' + n, part, [0, -segs[0] * 0.4, -0.035], [0.08 * th, segs[0] * 0.36, 0.1 * th], 0.08); // gaskin
      RC('hip' + n, part, [0, 0.14, 0.02], 0.17 * th, [0, -segs[0] * 0.45, 0], 0.095 * th, 0.1, { scale: [0.75, 1, 1] });
      RC('hip' + n, part, [0, -segs[0] * 0.4, 0], 0.08 * th, [0, -segs[0], 0], 0.056 * th, 0.05, { scale: [0.72, 1, 1] });
      E('knee' + n, part, [0, 0.01, -0.01], [0.048 * th, 0.07, 0.062 * th], 0.04); // hock
      E('knee' + n, part, [0, 0.05, -0.07 * th], [0.026, 0.05, 0.03], 0.03); // point of hock
    }
    RC('knee' + n, part, [0, -0.02, 0], 0.042 * th, [0, -segs[1], 0], 0.04 * th, 0.03, { scale: [0.78, 1, 1] }); // cannon
    E('knee' + n, part, [0, -segs[1] * 0.5, -0.03 * th], [0.02 * th, segs[1] * 0.46, 0.024 * th], 0.025); // tendons
    E('fet' + n, part, [0, 0.0, -0.012], [0.047 * th, 0.052, 0.055 * th], 0.03); // fetlock
    RC('fet' + n, part, [0, 0, 0], 0.04 * th, [0, -(segs[2] - 0.08), 0.004], 0.048 * th, 0.03); // pastern
    prims.push({ type: 'hoof', bone: 'hoof' + n, part: 7 + i, a: [0, 0.01, 0.006], b: [0, -0.088, 0.02], ra: 0.054 * th, rb: 0.07 * th, k: 0.012 });
  });
  // --- tail dock
  RC('tail0', 0, [0, 0.05, 0], 0.06 * sb, [0, -0.2, 0], 0.036, 0.08);
  return prims;
}

// ---------------------------------------------------------------------------
// SDF helpers
// ---------------------------------------------------------------------------
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
// Round cone between a and b (iq)
function sdRoundCone(p, a, b, r1, r2) {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const y = pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2];
  const z = y - l2;
  const xv = [pa[0] * l2 - ba[0] * y, pa[1] * l2 - ba[1] * y, pa[2] * l2 - ba[2] * y];
  const x2 = xv[0] * xv[0] + xv[1] * xv[1] + xv[2] * xv[2];
  const y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
// Capped cone (flat ends) between a and b with radii ra, rb (iq)
function sdCappedCone(p, a, b, ra, rb) {
  const rba = rb - ra;
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const baba = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const papa = pa[0] * pa[0] + pa[1] * pa[1] + pa[2] * pa[2];
  const paba = (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / baba;
  const x = Math.sqrt(Math.max(0, papa - paba * paba * baba));
  const cax = Math.max(0, x - (paba < 0.5 ? ra : rb));
  const cay = Math.abs(paba - 0.5) - 0.5;
  const k = rba * rba + baba;
  const f = Math.min(1, Math.max(0, (rba * (x - ra) + paba * baba) / k));
  const cbx = x - ra - f * rba, cby = paba - f;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay * baba, cbx * cbx + cby * cby * baba));
}

// Prepare primitives for evaluation in root space (rest pose).
export function preparePrimitives(P) {
  const { bones } = skeleton(P);
  const world = boneWorldMatrices(bones);
  const index = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  const list = primitives(P).map((p) => {
    const bi = index[p.bone];
    let m = world[bi];
    if (p.type === 'ell' || p.type === 'sub') m = mul(m, compose(p.c, p.rot || [0, 0, 0]));
    const inv = invertRigid(m);
    // conservative bounding sphere in root space for culling
    let center, radius;
    if (p.type === 'ell') { center = apply(m, [0, 0, 0]); radius = Math.max(...p.r); }
    else if (p.type === 'sub') { center = apply(m, [0, 0, 0]); radius = p.rr ? Math.max(...p.rr) : p.r; }
    else {
      const wa = apply(world[bi], p.a), wb = apply(world[bi], p.b);
      center = [(wa[0] + wb[0]) / 2, (wa[1] + wb[1]) / 2, (wa[2] + wb[2]) / 2];
      radius = Math.hypot(wa[0] - wb[0], wa[1] - wb[1], wa[2] - wb[2]) / 2 + Math.max(p.ra, p.rb);
    }
    return { ...p, boneIndex: bi, inv, center, radius: radius * 1.3 };
  });
  return { list, bones, world, index };
}

export function evalPrim(p, wp) {
  const q = apply(p.inv, wp);
  const s = p.scale;
  let d;
  if (p.type === 'ell') d = sdEllipsoid(q[0], q[1], q[2], p.r[0], p.r[1], p.r[2]);
  else if (p.type === 'sub') d = p.rr ? sdEllipsoid(q[0], q[1], q[2], p.rr[0], p.rr[1], p.rr[2]) : Math.hypot(q[0], q[1], q[2]) - p.r;
  else if (s) {
    const qs = [q[0] / s[0], q[1] / s[1], q[2] / s[2]];
    const as = [p.a[0] / s[0], p.a[1] / s[1], p.a[2] / s[2]];
    const bs = [p.b[0] / s[0], p.b[1] / s[1], p.b[2] / s[2]];
    d = sdRoundCone(qs, as, bs, p.ra, p.rb) * Math.min(s[0], s[1], s[2]);
  } else if (p.type === 'hoof') d = sdCappedCone(q, p.a, p.b, p.ra, p.rb) - 0.008;
  else d = sdRoundCone(q, p.a, p.b, p.ra, p.rb);
  return d;
}

// Full field value; optionally returns per-primitive distances.
export function sdf(prep, wp, perPrim = null) {
  let d = 1e9;
  const subs = [];
  for (let i = 0; i < prep.list.length; i++) {
    const p = prep.list[i];
    const dc = Math.hypot(wp[0] - p.center[0], wp[1] - p.center[1], wp[2] - p.center[2]) - p.radius;
    if (dc > 0.25 && !perPrim) continue;
    if (p.type === 'sub') { subs.push(p); continue; }
    const v = evalPrim(p, wp);
    if (perPrim) perPrim[i] = v;
    d = smin(d, v, p.k);
  }
  for (const p of subs) d = smax(d, -evalPrim(p, wp), p.k);
  return d;
}
