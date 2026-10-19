// Surface-nets mesher for a signed distance function, with projection onto the surface and
// Laplacian relaxation. Pure math, runs in Node.

export function meshField(F, { min, max, cell, coarse = 4, smooth = 2 }) {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  const pos = (i, j, k) => [min[0] + i * cell, min[1] + j * cell, min[2] + k * cell];

  // coarse grid for a narrow band
  const C = coarse;
  const cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const cg = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const p = pos(i * C, j * C, k * C);
    cg[(k * cy + j) * cx + i] = F(p[0], p[1], p[2]);
  }
  const band = cell * C * 1.8;
  const field = new Float32Array(nx * ny * nz);
  let evals = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ci = Math.min(cx - 2, Math.floor(i / C)), cj = Math.min(cy - 2, Math.floor(j / C)), ck = Math.min(cz - 2, Math.floor(k / C));
    const fx = i / C - ci, fy = j / C - cj, fz = k / C - ck;
    const g = (a, b, c) => cg[((ck + c) * cy + cj + b) * cx + ci + a];
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
    const vx = field[idx(i + 1, j, k)];
    if ((v0 < 0) !== (vx < 0)) quad(cellVert[idx(i, j - 1, k - 1)], cellVert[idx(i, j, k - 1)], cellVert[idx(i, j, k)], cellVert[idx(i, j - 1, k)], v0 < 0);
    const vy = field[idx(i, j + 1, k)];
    if ((v0 < 0) !== (vy < 0)) quad(cellVert[idx(i - 1, j, k - 1)], cellVert[idx(i - 1, j, k)], cellVert[idx(i, j, k)], cellVert[idx(i, j, k - 1)], v0 < 0);
    const vz = field[idx(i, j, k + 1)];
    if ((v0 < 0) !== (vz < 0)) quad(cellVert[idx(i - 1, j - 1, k)], cellVert[idx(i, j - 1, k)], cellVert[idx(i, j, k)], cellVert[idx(i - 1, j, k)], v0 < 0);
  }

  // project onto the surface, relax, project again
  const e = cell * 0.25;
  const grad = (p) => {
    const gx = F(p[0] + e, p[1], p[2]) - F(p[0] - e, p[1], p[2]);
    const gy = F(p[0], p[1] + e, p[2]) - F(p[0], p[1] - e, p[2]);
    const gz = F(p[0], p[1], p[2] + e) - F(p[0], p[1], p[2] - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  const project = (p) => {
    for (let it = 0; it < 2; it++) {
      const d = F(p[0], p[1], p[2]);
      const n = grad(p);
      p[0] -= n[0] * d; p[1] -= n[1] * d; p[2] -= n[2] * d;
    }
  };
  for (const p of verts) project(p);
  const nb = verts.map(() => new Set());
  for (let t = 0; t < tris.length; t += 3) {
    for (let a = 0; a < 3; a++) { nb[tris[t + a]].add(tris[t + (a + 1) % 3]); nb[tris[t + a]].add(tris[t + (a + 2) % 3]); }
  }
  for (let pass = 0; pass < smooth; pass++) {
    const sm = verts.map((p, i) => {
      let x = 0, y = 0, z = 0;
      for (const q of nb[i]) { x += verts[q][0]; y += verts[q][1]; z += verts[q][2]; }
      const n = nb[i].size || 1;
      return [p[0] * 0.5 + (x / n) * 0.5, p[1] * 0.5 + (y / n) * 0.5, p[2] * 0.5 + (z / n) * 0.5];
    });
    for (let i = 0; i < verts.length; i++) { verts[i] = sm[i]; project(verts[i]); }
  }
  const normals = verts.map((p) => grad(p));

  // winding sanity check against the gradient
  let agree = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = verts[tris[t]], b = verts[tris[t + 1]], c = verts[tris[t + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const n = normals[tris[t]];
    if (fn[0] * n[0] + fn[1] * n[1] + fn[2] * n[2] > 0) agree++;
  }
  if (agree < tris.length / 6) for (let t = 0; t < tris.length; t += 3) { const x = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = x; }
  return { verts, normals, tris, evals, grad };
}
