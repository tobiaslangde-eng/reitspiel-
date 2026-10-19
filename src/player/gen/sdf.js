// Small signed-distance-field toolkit for the offline rider generator (pure math, runs in Node).
//
// Primitives (all in absolute rest-pose coordinates):
//   ell(c, r, opts)            ellipsoid, optional Euler rotation opts.rot = [x, y, z]
//   rc(a, b, ra, rb, opts)     round cone from a to b; opts.sx / opts.sz make the cross section elliptical
//   sub(c, r, opts)            ellipsoid that is carved out of its group
//   opts: { bone, k (smooth-union radius), rot, sx, sz, up, g (group) }
//
// Primitives of one group blend smoothly with each other. Groups > 0 (legs, arms) only blend with group 0
// (the torso), never with each other, so the two thighs stay separate shapes.

export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function eulerMatrix([x, y, z]) {
  // same order as three.js 'XYZ'
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    [c * e, -c * f, d],
    [af + be * d, ae - bf * d, -b * c],
    [bf - ae * d, be + af * d, a * c],
  ];
}

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

// iq's round cone with the axis along +y, r1 at the origin, r2 at y = h
function sdRoundCone(x, y, z, r1, r2, h) {
  const b = (r1 - r2) / h;
  const a = Math.sqrt(Math.max(0, 1 - b * b));
  const qx = Math.hypot(x, z), qy = y;
  const k = qx * -b + qy * a;
  if (k < 0) return Math.hypot(qx, qy) - r1;
  if (k > a * h) return Math.hypot(qx, qy - h) - r2;
  return qx * a + qy * b - r1;
}

export const ell = (c, r, o = {}) => ({ type: 'ell', c, r, k: 0.05, g: 0, ...o });
export const rc = (a, b, ra, rb, o = {}) => ({ type: 'rc', a, b, ra, rb, k: 0.05, g: 0, ...o });
export const sub = (c, r, o = {}) => ({ type: 'sub', c, r, k: 0.02, g: 0, ...o });

export function prepare(list) {
  return list.map((p, index) => {
    const q = { ...p, index };
    if (p.type === 'ell' || p.type === 'sub') {
      const R = eulerMatrix(p.rot || [0, 0, 0]);
      q.inv = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
      q.center = p.c;
      if (!Array.isArray(p.r)) q.r = [p.r, p.r, p.r];
      q.radius = Math.max(...q.r);
    } else {
      const u = norm3(sub3(p.b, p.a));
      let hint = p.up || [0, 0, 1];
      if (Math.abs(dot3(hint, u)) > 0.95) hint = [1, 0, 0];
      const xa = norm3(cross3(hint, u));
      const za = cross3(u, xa);
      q.u = u; q.xa = xa; q.za = za;
      q.h = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]);
      q.sx = p.sx || 1; q.sz = p.sz || 1;
      q.center = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
      q.radius = q.h / 2 + Math.max(p.ra, p.rb) * Math.max(q.sx, q.sz);
    }
    return q;
  });
}

export function evalPrim(p, x, y, z) {
  if (p.type === 'rc') {
    const d = [x - p.a[0], y - p.a[1], z - p.a[2]];
    const lx = dot3(d, p.xa) / p.sx, ly = dot3(d, p.u), lz = dot3(d, p.za) / p.sz;
    return sdRoundCone(lx, ly, lz, p.ra, p.rb, p.h) * Math.min(p.sx, p.sz);
  }
  const d = [x - p.c[0], y - p.c[1], z - p.c[2]];
  const m = p.inv;
  const lx = m[0][0] * d[0] + m[0][1] * d[1] + m[0][2] * d[2];
  const ly = m[1][0] * d[0] + m[1][1] * d[1] + m[1][2] * d[2];
  const lz = m[2][0] * d[0] + m[2][1] * d[1] + m[2][2] * d[2];
  return sdEllipsoid(lx, ly, lz, p.r[0], p.r[1], p.r[2]);
}

// Full field. `extra(x, y, z, d)` can clip the result (planes). `joinK[g]` is the radius with which group g
// blends into group 0 (the torso); groups never blend with each other.
export function makeField(prepared, extra = null, joinK = {}) {
  const groups = new Map();
  for (const p of prepared) {
    if (!groups.has(p.g)) groups.set(p.g, { adds: [], subs: [] });
    groups.get(p.g)[p.type === 'sub' ? 'subs' : 'adds'].push(p);
  }
  const main = groups.get(0) || { adds: [], subs: [] };
  const others = [...groups.entries()].filter(([g]) => g !== 0).map(([g, v]) => ({ ...v, k: joinK[g] ?? 0.045 }));
  const evalGroup = (G, x, y, z) => {
    let d = 1e9;
    for (const p of G.adds) {
      const dc = Math.hypot(x - p.center[0], y - p.center[1], z - p.center[2]) - p.radius * 1.15;
      if (dc > 0.2) continue;
      d = smin(d, evalPrim(p, x, y, z), p.k);
    }
    for (const p of G.subs) {
      const dc = Math.hypot(x - p.center[0], y - p.center[1], z - p.center[2]) - p.radius * 1.15;
      if (dc > 0.1) continue;
      d = smax(d, -evalPrim(p, x, y, z), p.k);
    }
    return d;
  };
  const F = (x, y, z) => {
    const d0 = evalGroup(main, x, y, z);
    let d = d0;
    for (const G of others) {
      const o = evalGroup(G, x, y, z);
      if (o < 1e8) d = Math.min(d, smin(d0, o, G.k));
    }
    return extra ? extra(x, y, z, d) : d;
  };
  return F;
}
