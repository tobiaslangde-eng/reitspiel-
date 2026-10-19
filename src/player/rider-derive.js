// Garments and hair are cut out of the skinned body / head meshes: take the triangles where a scalar field is
// positive (clipped exactly at the zero crossing), push them out along the normal and keep the skin weights.
// The result bends with the body because it carries the same skinIndex / skinWeight data.
import * as THREE from 'three';

function topInfluences(map) {
  const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((a, b) => a + b[1], 0) || 1;
  const idx = [0, 0, 0, 0], w = [0, 0, 0, 0];
  top.forEach(([i, v], k) => { idx[k] = i; w[k] = v / sum; });
  return { idx, w };
}

// field(x, y, z, nx, ny, nz, ao) -> number, > 0 = keep. offset(f, x, y, z) -> metres along the normal.
export function deriveShell(src, field, offset = () => 0.004) {
  const P = src.attributes.position, N = src.attributes.normal, AO = src.attributes.aAO;
  const SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
  const IX = src.index.array;
  const n = P.count;
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = field(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), AO.getX(i), i);

  const out = { pos: [], nor: [], ao: [], si: [], sw: [], f: [], idx: [] };
  const remap = new Map();
  const pushVertex = (px, py, pz, nx, ny, nz, ao, si, sw, fv) => {
    out.pos.push(px, py, pz); out.nor.push(nx, ny, nz); out.ao.push(ao); out.si.push(...si); out.sw.push(...sw); out.f.push(fv);
    return out.f.length - 1;
  };
  const keep = (i) => {
    if (remap.has(i)) return remap.get(i);
    const si = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)];
    const sw = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)];
    const id = pushVertex(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), AO.getX(i), si, sw, f[i]);
    remap.set(i, id);
    return id;
  };
  const edgeVerts = new Map();
  const cut = (a, b) => {
    const key = a < b ? a * n + b : b * n + a;
    if (edgeVerts.has(key)) return edgeVerts.get(key);
    const lo = f[a] >= 0 ? a : b, hi = lo === a ? b : a; // lo = kept side
    const t = f[lo] / (f[lo] - f[hi]);
    const lerp = (g, i) => g.getX(i) + (g.getX(hi) - g.getX(i)) * t;
    const infl = new Map();
    for (const [v, k] of [[lo, 1 - t], [hi, t]]) {
      for (let c = 0; c < 4; c++) {
        const bi = [SI.getX, SI.getY, SI.getZ, SI.getW][c].call(SI, v);
        const bw = [SW.getX, SW.getY, SW.getZ, SW.getW][c].call(SW, v) * k;
        if (bw > 0) infl.set(bi, (infl.get(bi) || 0) + bw);
      }
    }
    const { idx, w } = topInfluences(infl);
    const nx = N.getX(lo) + (N.getX(hi) - N.getX(lo)) * t, ny = N.getY(lo) + (N.getY(hi) - N.getY(lo)) * t, nz = N.getZ(lo) + (N.getZ(hi) - N.getZ(lo)) * t;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const id = pushVertex(
      lerp(P, lo), P.getY(lo) + (P.getY(hi) - P.getY(lo)) * t, P.getZ(lo) + (P.getZ(hi) - P.getZ(lo)) * t,
      nx / nl, ny / nl, nz / nl, AO.getX(lo) + (AO.getX(hi) - AO.getX(lo)) * t, idx, w, 0,
    );
    edgeVerts.set(key, id);
    return id;
  };
  for (let t = 0; t < IX.length; t += 3) {
    const a = IX[t], b = IX[t + 1], c = IX[t + 2];
    const ins = [f[a] >= 0, f[b] >= 0, f[c] >= 0];
    const cnt = ins[0] + ins[1] + ins[2];
    if (cnt === 0) continue;
    if (cnt === 3) { out.idx.push(keep(a), keep(b), keep(c)); continue; }
    const v = [a, b, c];
    if (cnt === 1) {
      const i = ins.indexOf(true);
      const p0 = v[i], p1 = v[(i + 1) % 3], p2 = v[(i + 2) % 3];
      out.idx.push(keep(p0), cut(p0, p1), cut(p0, p2));
    } else {
      const j = ins.indexOf(false);
      const q0 = v[j], q1 = v[(j + 1) % 3], q2 = v[(j + 2) % 3]; // q1, q2 kept
      const e1 = cut(q1, q0), e2 = cut(q2, q0);
      out.idx.push(keep(q1), keep(q2), e2, keep(q1), e2, e1);
    }
  }
  const g = new THREE.BufferGeometry();
  const posArr = new Float32Array(out.pos);
  for (let i = 0; i < out.f.length; i++) {
    const o = offset(out.f[i], posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]);
    posArr[i * 3] += out.nor[i * 3] * o; posArr[i * 3 + 1] += out.nor[i * 3 + 1] * o; posArr[i * 3 + 2] += out.nor[i * 3 + 2] * o;
  }
  g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(out.nor), 3));
  g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(out.ao), 1));
  g.setAttribute('aF', new THREE.BufferAttribute(new Float32Array(out.f), 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(out.si), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(out.sw), 4));
  g.setIndex(out.idx.length > 65535 ? new THREE.Uint32BufferAttribute(out.idx, 1) : new THREE.Uint16BufferAttribute(out.idx, 1));
  return g;
}

// total weight of a vertex on a set of bone indices (used to separate arms from torso)
export function boneWeight(src, i, from, to) {
  const SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
  let s = 0;
  const idx = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)];
  const w = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)];
  for (let k = 0; k < 4; k++) if (idx[k] >= from && idx[k] <= to) s += w[k];
  return s;
}

// Weight of every vertex on the arm bones / leg bones, precomputed for quick field functions.
export function weightArrays(src) {
  const n = src.attributes.position.count;
  const arm = new Float32Array(n), leg = new Float32Array(n);
  for (let i = 0; i < n; i++) { arm[i] = boneWeight(src, i, 5, 18); leg[i] = boneWeight(src, i, 19, 24); }
  return { arm, leg };
}
