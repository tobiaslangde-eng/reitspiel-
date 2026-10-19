// Builds the skinned horse meshes from the signed-distance anatomy in src/horse/anatomy.js.
// Run with: node tools/build-horses.mjs   (writes assets/horses/*.bin)
//
// Pipeline: SDF sampling (narrow band) -> surface nets -> projection onto the surface ->
// normals from the gradient -> baked ambient occlusion -> skin weights per bone -> binary file.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ARCHETYPES, preparePrimitives, sdf, evalPrim, dimensions, apply,
} from '../src/horse/anatomy.js';

const OUT = fileURLToPath(new URL('../assets/horses/', import.meta.url));
mkdirSync(OUT, { recursive: true });

function build(P, cell) {
  const prep = preparePrimitives(P);
  const F = (x, y, z) => sdf(prep, [x, y, z]);
  // bounds
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const p of prep.list) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], p.center[a] - p.radius / 1.3);
    max[a] = Math.max(max[a], p.center[a] + p.radius / 1.3);
  }
  min = min.map((v) => v - 0.06); max = max.map((v) => v + 0.06);
  min[1] = Math.max(min[1], -0.02);
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  const pos = (i, j, k) => [min[0] + i * cell, min[1] + j * cell, min[2] + k * cell];

  // coarse grid for a narrow band
  const C = 4;
  const cx = Math.ceil(nx / C) + 1, cyy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const coarse = new Float32Array(cx * cyy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cyy; j++) for (let i = 0; i < cx; i++) {
    const p = pos(i * C, j * C, k * C);
    coarse[(k * cyy + j) * cx + i] = F(p[0], p[1], p[2]);
  }
  const band = cell * C * 1.8;
  const field = new Float32Array(nx * ny * nz);
  let evals = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ci = Math.min(cx - 2, Math.floor(i / C)), cj = Math.min(cyy - 2, Math.floor(j / C)), ck = Math.min(cz - 2, Math.floor(k / C));
    const fx = i / C - ci, fy = j / C - cj, fz = k / C - ck;
    const g = (a, b, c) => coarse[((ck + c) * cyy + cj + b) * cx + ci + a];
    const v = (g(0, 0, 0) * (1 - fx) + g(1, 0, 0) * fx) * (1 - fy) * (1 - fz)
      + (g(0, 1, 0) * (1 - fx) + g(1, 1, 0) * fx) * fy * (1 - fz)
      + (g(0, 0, 1) * (1 - fx) + g(1, 0, 1) * fx) * (1 - fy) * fz
      + (g(0, 1, 1) * (1 - fx) + g(1, 1, 1) * fx) * fy * fz;
    if (Math.abs(v) > band) { field[idx(i, j, k)] = v; continue; }
    const p = pos(i, j, k);
    field[idx(i, j, k)] = F(p[0], p[1], p[2]);
    evals++;
  }

  // surface nets
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const verts = [];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = (c) => [c & 1, (c >> 1) & 1, (c >> 2) & 1];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const vals = [];
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const [a, b, d] = corner(c);
      const v = field[idx(i + a, j + b, k + d)];
      vals.push(v);
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) {
      const v0 = vals[e0], v1 = vals[e1];
      if ((v0 < 0) === (v1 < 0)) continue;
      const t = v0 / (v0 - v1);
      const c0 = corner(e0), c1 = corner(e1);
      sx += c0[0] + (c1[0] - c0[0]) * t; sy += c0[1] + (c1[1] - c0[1]) * t; sz += c0[2] + (c1[2] - c0[2]) * t; n++;
    }
    cellVert[idx(i, j, k)] = verts.length;
    verts.push([min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell]);
  }
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = field[idx(i, j, k)];
    // x edge
    const vx = field[idx(i + 1, j, k)];
    if ((v0 < 0) !== (vx < 0)) quad(cellVert[idx(i, j - 1, k - 1)], cellVert[idx(i, j, k - 1)], cellVert[idx(i, j, k)], cellVert[idx(i, j - 1, k)], v0 < 0);
    const vy = field[idx(i, j + 1, k)];
    if ((v0 < 0) !== (vy < 0)) quad(cellVert[idx(i - 1, j, k - 1)], cellVert[idx(i - 1, j, k)], cellVert[idx(i, j, k)], cellVert[idx(i, j, k - 1)], v0 < 0);
    const vz = field[idx(i, j, k + 1)];
    if ((v0 < 0) !== (vz < 0)) quad(cellVert[idx(i - 1, j - 1, k)], cellVert[idx(i, j - 1, k)], cellVert[idx(i, j, k)], cellVert[idx(i - 1, j, k)], v0 < 0);
  }

  // project onto the surface & compute normals from the gradient
  const e = cell * 0.25;
  const grad = (p) => {
    const gx = F(p[0] + e, p[1], p[2]) - F(p[0] - e, p[1], p[2]);
    const gy = F(p[0], p[1] + e, p[2]) - F(p[0], p[1] - e, p[2]);
    const gz = F(p[0], p[1], p[2] + e) - F(p[0], p[1], p[2] - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  const normals = [];
  for (const p of verts) {
    for (let it = 0; it < 2; it++) {
      const d = F(p[0], p[1], p[2]);
      const n = grad(p);
      p[0] -= n[0] * d; p[1] -= n[1] * d; p[2] -= n[2] * d;
    }
    normals.push(grad(p));
  }
  // light Laplacian smoothing pass to remove surface-net stair steps
  const nb = verts.map(() => new Set());
  for (let t = 0; t < tris.length; t += 3) for (let a = 0; a < 3; a++) { nb[tris[t + a]].add(tris[t + (a + 1) % 3]); nb[tris[t + a]].add(tris[t + (a + 2) % 3]); }
  const sm = verts.map((p, i) => {
    let x = 0, y = 0, z = 0; for (const q of nb[i]) { x += verts[q][0]; y += verts[q][1]; z += verts[q][2]; }
    const n = nb[i].size || 1;
    return [p[0] * 0.5 + (x / n) * 0.5, p[1] * 0.5 + (y / n) * 0.5, p[2] * 0.5 + (z / n) * 0.5];
  });
  for (let i = 0; i < verts.length; i++) {
    const p = sm[i];
    const d = F(p[0], p[1], p[2]);
    const n = grad(p);
    verts[i] = [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d];
    normals[i] = grad(verts[i]);
  }

  // baked ambient occlusion + part + skin weights
  const ao = new Uint8Array(verts.length);
  const cav = new Uint8Array(verts.length);
  const part = new Uint8Array(verts.length);
  const skinIndex = new Uint8Array(verts.length * 4);
  const skinWeight = new Uint8Array(verts.length * 4);
  const per = new Float32Array(prep.list.length);
  for (let v = 0; v < verts.length; v++) {
    const p = verts[v], n = normals[v];
    let occ = 0, w = 1;
    for (let s = 1; s <= 6; s++) {
      const h = 0.025 * s;
      const q = [p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h];
      occ += (h - F(q[0], q[1], q[2])) * w;
      w *= 0.6;
    }
    // ground occlusion for low parts
    const ground = Math.max(0, 1 - p[1] / 0.35) * 0.25;
    ao[v] = Math.round(Math.max(0, Math.min(1, 1 - occ * 3.2 - ground)) * 255);
    // cavity: small-radius curvature, 0.5 flat, <0.5 grooves, >0.5 ridges (drives muscle definition in the shader)
    {
      const r = 0.02;
      const dOut = F(p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r);
      const dIn = F(p[0] - n[0] * r, p[1] - n[1] * r, p[2] - n[2] * r);
      const concave = Math.max(0, (r - dOut) / r), convex = Math.max(0, (r + dIn) / r);
      cav[v] = Math.round(Math.max(0, Math.min(1, 0.5 + 0.5 * (convex - concave) * 2.2)) * 255);
    }

    per.fill(1e9);
    for (let i = 0; i < prep.list.length; i++) if (prep.list[i].type !== 'sub') per[i] = evalPrim(prep.list[i], p);
    let dmin = 1e9, pmin = 0;
    for (let i = 0; i < per.length; i++) if (per[i] < dmin) { dmin = per[i]; pmin = i; }
    part[v] = prep.list[pmin].part;
    const wb = new Map();
    for (let i = 0; i < per.length; i++) {
      const f = 1 - (per[i] - dmin) / 0.055;
      if (f <= 0) continue;
      const bi = prep.list[i].boneIndex;
      wb.set(bi, (wb.get(bi) || 0) + f * f);
    }
    const top = [...wb.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, b) => a + b[1], 0);
    const q = top.map(([, wt]) => Math.round((wt / sum) * 255));
    q[0] += 255 - q.reduce((a, b) => a + b, 0); // exact sum, the largest weight absorbs rounding
    top.forEach(([bi], k) => { skinIndex[v * 4 + k] = bi; skinWeight[v * 4 + k] = q[k]; });
  }

  // winding sanity check
  let agree = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = verts[tris[t]], b = verts[tris[t + 1]], c = verts[tris[t + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const n = normals[tris[t]];
    if (fn[0] * n[0] + fn[1] * n[1] + fn[2] * n[2] > 0) agree++;
  }
  if (agree < tris.length / 6) for (let t = 0; t < tris.length; t += 3) { const x = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = x; }
  console.log('  winding agreement', (agree / (tris.length / 3)).toFixed(3));

  // metadata for tack fitting
  const d = dimensions(P);
  const headM = prep.world[prep.index.head];
  const inside = (hp) => { const w = apply(headM, hp); return F(w[0], w[1], w[2]) < 0; };
  const headSection = [];
  for (let s = 0; s <= 20; s++) {
    const t = s / 20;
    const y = -0.04 + t * (d.headLen + 0.06);
    let zmin = 1, zmax = -1;
    for (let z = -0.3; z <= 0.3; z += 0.004) if (inside([0, y, z])) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
    if (zmax < zmin) { headSection.push({ t, y, rx: 0.02, rz: 0.02, cz: 0 }); continue; }
    const czv = (zmin + zmax) / 2;
    let rx = 0;
    for (let x = 0; x <= 0.3; x += 0.003) if (inside([x, y, czv])) rx = x;
    headSection.push({ t, y, rx, rz: (zmax - zmin) / 2, cz: czv });
  }
  const [eyeY, eyeZ] = d.eye;
  let ex = 0;
  for (let x = 0; x <= 0.3; x += 0.002) if (inside([x, eyeY, eyeZ])) ex = x;
  // crest line in neck space (mane roots)
  const neckM = prep.world[prep.index.neck];
  const crest = [];
  for (let s = 0; s <= 20; s++) {
    const y = -0.06 + (s / 20) * (d.neckLen + 0.08);
    let zc = 0;
    for (let z = -0.7; z <= 0.1; z += 0.003) { const w = apply(neckM, [0, y, z]); if (F(w[0], w[1], w[2]) < 0) { zc = z; break; } }
    crest.push(+zc.toFixed(4));
  }
  // half-width of the neck/shoulder on a (y, z) grid in neck space: hair that lies on the neck follows it
  const NG = { y0: -0.2, y1: d.neckLen + 0.05, z0: -0.5, z1: 0.5, ny: 26, nz: 28, hw: [] };
  for (let iy = 0; iy < NG.ny; iy++) {
    const y = NG.y0 + (NG.y1 - NG.y0) * (iy / (NG.ny - 1));
    for (let iz = 0; iz < NG.nz; iz++) {
      const z = NG.z0 + (NG.z1 - NG.z0) * (iz / (NG.nz - 1));
      let hw = -1;
      const w0 = apply(neckM, [0, y, z]);
      if (F(w0[0], w0[1], w0[2]) < 0) {
        hw = 0;
        for (let x = 0.004; x <= 0.45; x += 0.004) { const w = apply(neckM, [x, y, z]); if (F(w[0], w[1], w[2]) < 0) hw = x; else break; }
      }
      NG.hw.push(Math.round(hw * 1000));
    }
  }
  const backTop = [];
  const z0 = -d.zLen * 1.05, z1 = d.zLen * 1.05, nzb = 40;
  for (let s = 0; s <= nzb; s++) {
    const z = z0 + (z1 - z0) * (s / nzb);
    let top = d.cy;
    for (let y = d.cy + 0.6; y > d.cy - 0.4; y -= 0.004) if (F(0, y, z) < 0) { top = y; break; }
    backTop.push(+top.toFixed(4));
  }
  return {
    verts, normals, tris, ao, cav, part, skinIndex, skinWeight, evals,
    meta: { headSection, eye: [ex - 0.008, eyeY, eyeZ], crest, crestY: [-0.06, d.neckLen + 0.02], neckGrid: NG, backTop, backZ: [z0, z1], cell },
  };
}

function write(file, r) {
  const n = r.verts.length;
  const big = n > 65535;
  const meta = Buffer.from(JSON.stringify(r.meta));
  const header = new Uint32Array([0x32535248, n, r.tris.length, meta.length, big ? 1 : 0]);
  const posQ = new Int16Array(n * 3);
  const nor = new Int8Array(n * 3);
  r.verts.forEach((p, i) => { for (let a = 0; a < 3; a++) posQ[i * 3 + a] = Math.round(p[a] * 10000); });
  r.normals.forEach((p, i) => { for (let a = 0; a < 3; a++) nor[i * 3 + a] = Math.round(p[a] * 127); });
  const ind = big ? new Uint32Array(r.tris) : new Uint16Array(r.tris);
  const parts = [Buffer.from(header.buffer), meta, Buffer.from(posQ.buffer), Buffer.from(nor.buffer), Buffer.from(r.ao), Buffer.from(r.cav), Buffer.from(r.part), Buffer.from(r.skinIndex), Buffer.from(r.skinWeight), Buffer.from(ind.buffer)];
  writeFileSync(file, Buffer.concat(parts));
}

// node tools/build-horses.mjs [suffix] [archetype]
for (const [key, P] of Object.entries(ARCHETYPES)) {
  const only = process.argv[2];
  if (process.argv[3] && process.argv[3] !== key) continue;
  for (const [suffix, cell] of [['', 0.0135], ['-mid', 0.021], ['-lo', 0.032]]) {
    if (only && only !== suffix) continue;
    const t0 = Date.now();
    const r = build(P, cell);
    write(`${OUT}${key}${suffix}.bin`, r);
    console.log(`${key}${suffix}: ${r.verts.length} verts, ${r.tris.length / 3} tris, ${r.evals} evals, ${Date.now() - t0} ms`);
  }
}
